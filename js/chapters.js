// --- Главы: разбор из файла, ссылки и chapters.vtt, кнопка «Пропустить», окно «Следующей серии» ---

let mediaChapters = [];
// Окно показа кнопки "Следующая серия", если оно размечено главой
let nextEpisodeSegment = null;
let dismissedChapterSegments = new Set();
let chapterParseToken = 0;
let activeSkipSegment = null;

const CHAPTER_TIME_KEY_RE = /^_?(\d{1,2})_(\d{2})_(\d{2})_(\d{3})$/;

function chapterTimeKeyToSeconds(key){
  const m = CHAPTER_TIME_KEY_RE.exec(key);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]), s = Number(m[3]), ms = Number(m[4]);
  return h * 3600 + mi * 60 + s + ms / 1000;
}

// MediaInfo иногда хранит название главы с языковым префиксом вида "en:Intro"
function cleanChapterTitle(raw){
  if (typeof raw !== 'string') return '';
  return raw.replace(/^[a-z]{2,3}:/i, '').trim();
}

const CANONICAL_SKIP_CHAPTERS = {
  'intro': { kind: 'intro', label: 'Пропустить заставку' },
  'opening': { kind: 'intro', label: 'Пропустить заставку' },
  'заставка': { kind: 'intro', label: 'Пропустить заставку' },
  'вступление': { kind: 'intro', label: 'Пропустить заставку' },
  'credits': { kind: 'credits', label: 'Пропустить титры' },
  'outro': { kind: 'credits', label: 'Пропустить титры' },
  'титры': { kind: 'credits', label: 'Пропустить титры' },
  'recap': { kind: 'recap', label: 'Пропустить повтор' },
  'preview': { kind: 'recap', label: 'Пропустить повтор' },
  'рекап': { kind: 'recap', label: 'Пропустить повтор' },
  'повтор': { kind: 'recap', label: 'Пропустить повтор' },
  'следующая серия': { kind: 'next' },
  'next episode': { kind: 'next' },
  'дальше': { kind: 'next' }
};

function classifySkippableChapter(rawTitle){
  const title = cleanChapterTitle(rawTitle);
  if (!title) return null;

  const canonical = CANONICAL_SKIP_CHAPTERS[title.toLowerCase()];
  if (canonical) return canonical;

  const m = /^skip\s*[:\-]\s*(.*)$/i.exec(title);
  if (m) return { kind: 'custom', label: buildSkipLabel(m[1].trim()) };

  return null;
}

// Формируем текст плашки для известных значений SKIP или используем исходное название главы
function buildSkipLabel(rest){
  const norm = rest.toLowerCase();
  if (/(заставк|интро|опенинг|^intro$|^opening$)/i.test(norm)) return 'Пропустить заставку';
  if (/(титр|концовк|аутро|credits?|outro)/i.test(norm)) return 'Пропустить титры';
  if (/(ранее в сериал|превью серии|recap|previously)/i.test(norm)) return 'Пропустить обзор серии';
  return rest ? `Пропустить: ${rest}` : 'Пропустить';
}

let mediaInfoPromise = null;
const MEDIAINFO_LOCAL_BASE = 'vendor/mediainfo/';
const MEDIAINFO_CDN_BASE = 'https://cdn.jsdelivr.net/npm/mediainfo.js@0.3.7/dist/';
// Один инстанс MediaInfo не умеет параллельный разбор, прогоняем анализы по очереди
let mediaInfoQueue = Promise.resolve();
function runMediaInfoAnalysis(task){
  const run = mediaInfoQueue.then(task, task);
  mediaInfoQueue = run.catch(() => {});
  return run;
}

function getMediaInfoInstance(){
  if (mediaInfoPromise) return mediaInfoPromise;
  const factory = window.MediaInfo && (window.MediaInfo.default || window.MediaInfo.mediaInfoFactory);
  if (typeof factory !== 'function'){
    return Promise.reject(new Error('mediainfo.js не загрузился'));
  }
  const base = location.protocol === 'file:' ? MEDIAINFO_CDN_BASE : MEDIAINFO_LOCAL_BASE;
  mediaInfoPromise = factory({
    format: 'object',
    coverData: false,
    // UMD-бандл ищет MediaInfoModule.wasm рядом с собой по умолчанию, но
    // явный locateFile надёжнее (не зависит от того, откуда подключён скрипт).
    locateFile: (path) => base + path
  }).catch(err => {
    mediaInfoPromise = null; // даём шанс переинициализировать при следующем файле
    throw err;
  });
  return mediaInfoPromise;
}

// Инициализируем MediaInfo заранее при загрузке страницы, чтобы главы читались сразу
function preInitMediaInfo(){
  getMediaInfoInstance().catch(err => {
    console.warn('Не удалось инициализировать MediaInfo заранее:', err.message);
  });
}

// Запускаем предварительную инициализацию после загрузки страницы
if (document.readyState === 'complete') {
  preInitMediaInfo();
} else {
  window.addEventListener('load', preInitMediaInfo);
}

// Одноразовая фоновая чистка осиротевших записей IndexedDB, не мешая старту
setTimeout(() => { idbSweepOrphans(); }, 5000);

// Читает файл через mediainfo.js кусками и превращает найденные главы 
async function parseChaptersFromFile(file, token){
  try {
    const mediainfo = await getMediaInfoInstance();
    if (token !== chapterParseToken) return; // пользователь уже открыл другой файл

    const getSize = () => file.size;
    const readChunk = (chunkSize, offset) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target.error){ reject(e.target.error); return; }
        resolve(new Uint8Array(e.target.result));
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file.slice(offset, offset + chunkSize));
    });

    // Ждём очередь и повторно сверяем токен на случай смены источника
    const result = await runMediaInfoAnalysis(() => {
      if (token !== chapterParseToken) return null;
      return mediainfo.analyzeData(getSize, readChunk);
    });
    if (!result || token !== chapterParseToken) return;
    applyChaptersFromMediaInfoResult(result, token);
    checkCodecWarning(result, token);
  } catch (err){
    // Если метаданные недоступны, продолжаем работу без глав и плашек пропуска
    console.warn('Главы (chapters) не прочитаны:', err && err.message ? err.message : err);
  }
}

// Для URL загружаем нужные части через fetch с Range-запросами; при ошибке продолжаем без глав
async function parseChaptersFromUrl(url, token){
  try {
    const mediainfo = await getMediaInfoInstance();
    if (token !== chapterParseToken) return;

    let size = null;
    let headOk = false;

    // Пробуем HEAD-запрос для получения размера файла
    try {
      const head = await headRequest(url);
      if (head.ok) {
        headOk = true;
        size = Number(head.headers.get('Content-Length'));
        if (head.headers.get('Accept-Ranges') !== 'bytes') {
          // Некоторые серверы не пишут этот заголовок, но Range всё равно поддерживают,
          // не блокируем, просто пробуем читать куски ниже.
        }
      }
    } catch (headErr) {
      // HEAD не сработал (CORS, сеть и т.п.), пробуем читать без предварительного размера
      console.log('HEAD-запрос не удался, пробуем читать без размера:', headErr.message);
    }

    // Если HEAD не сработал или не вернул размер, определяем размер через частичное чтение
    let rangeSupported = true;
    if (!size) {
      try {
        // Пробуем прочитать небольшой кусок для определения размера через Content-Length в ответе
        const testRes = await fetch(url, { headers: { Range: 'bytes=0-1023' } });
        if (testRes.status === 206) {
          const contentRange = testRes.headers.get('Content-Range');
          if (contentRange) {
            const match = /bytes \d+-(\d+)\/(\d+)/.exec(contentRange);
            if (match) {
              size = Number(match[2]); // общий размер из Content-Range
            }
          }
          // Если размер всё ещё не известен, используем Content-Length из ответа
          if (!size) {
            size = Number(testRes.headers.get('Content-Length'));
          }
        } else if (testRes.ok) {
          // При ответе 200 на Range-запрос прекращаем загрузку и сохраняем размер полного файла
          rangeSupported = false;
          const len = Number(testRes.headers.get('Content-Length'));
          if (len) size = len;
          if (testRes.body && testRes.body.cancel) {
            testRes.body.cancel().catch(() => {});
          }
        }
      } catch (rangeErr) {
        // Range-запрос тоже не сработал, пробуем без размера
        console.log('Range-запрос не удался, пробуем без размера:', rangeErr.message);
      }
    }

    if (!size) {
      throw new Error('Не удалось определить размер файла');
    }

    if (!rangeSupported) {
      throw new Error('Сервер не поддерживает Range-запросы, чтение глав по ссылке отменено, чтобы не докачивать файл целиком в фоне');
    }

    // Ограничиваем объём загружаемых данных, чтобы чтение глав не мешало воспроизведению видео
    const MAX_CHAPTER_PROBE_BYTES = 8 * 1024 * 1024; // 8 МБ
    let preloadedData = null; // Сразу загрузим один большой кусок
    let preloadedOffset = 0;

    const getSize = () => size;
    const readChunk = async (chunkSize, offset) => {
      // Если данные ещё не загружены, загружаем один большой кусок с начала
      if (!preloadedData) {
        const preloadSize = Math.min(MAX_CHAPTER_PROBE_BYTES, size);
        const res = await fetch(url, { headers: { Range: `bytes=0-${preloadSize - 1}` } });
        if (res.status !== 206) {
          if (res.body && res.body.cancel) res.body.cancel().catch(() => {});
          throw new Error(`Сервер не поддерживает Range-запросы (получен статус ${res.status} вместо 206), чтение глав отменено`);
        }

        const buf = await res.arrayBuffer();
        preloadedData = new Uint8Array(buf);
      }

      // Проверяем, попадает ли запрос в загруженный диапазон
      if (offset >= preloadedOffset && offset + chunkSize <= preloadedOffset + preloadedData.length) {
        // Данные уже есть в памяти, возвращаем нужную часть
        const relativeOffset = offset - preloadedOffset;
        return preloadedData.slice(relativeOffset, relativeOffset + chunkSize);
      }

      // Если запрос выходит за пределы загруженного, делаем отдельный запрос
      const end = Math.min(offset + chunkSize, size) - 1;
      const res = await fetch(url, { headers: { Range: `bytes=${offset}-${end}` } });

      if (res.status !== 206) {
        if (res.body && res.body.cancel) res.body.cancel().catch(() => {});
        throw new Error(`Сервер не поддерживает Range-запросы (получен статус ${res.status} вместо 206), чтение глав отменено`);
      }

      const buf = await res.arrayBuffer();
      return new Uint8Array(buf);
    };

    // Ждём очередь и повторно сверяем токен на случай смены источника
    const result = await runMediaInfoAnalysis(() => {
      if (token !== chapterParseToken) return null;
      return mediainfo.analyzeData(getSize, readChunk);
    });
    if (!result || token !== chapterParseToken) return;
    applyChaptersFromMediaInfoResult(result, token);
    checkCodecWarning(result, token);
  } catch (err){
    // Нет CORS, нет Range, файл без глав и т.п., штатно продолжаем без них.
    console.warn('Главы (chapters) по ссылке не прочитаны:', err && err.message ? err.message : err);
  }
}

// Для HLS главы лежат в соседнем chapters.vtt, каждая реплика это одна глава
async function parseChaptersFromVtt(url, token){
  try {
    const res = await fetch(url);
    if (!res.ok || token !== chapterParseToken) return;
    const lines = (await res.text()).replace(/\r\n?/g, '\n').split('\n');
    const raw = [];
    for (let i = 0; i < lines.length; i++){
      const m = lines[i].match(TIME_RANGE_RE);
      if (!m) continue;
      const start = parseSubtitleTime(m[1]);
      let title = '';
      for (let j = i + 1; j < lines.length && lines[j].trim() !== ''; j++){
        title += (title ? ' ' : '') + lines[j].trim();
      }
      if (isFinite(start) && title) raw.push({ time: start, title });
    }
    if (raw.length) applyChapterList(raw, token);
  } catch (err){
    console.warn('Главы HLS (chapters.vtt) не прочитаны:', err && err.message ? err.message : err);
  }
}

function applyChaptersFromMediaInfoResult(result, token){
  if (token !== chapterParseToken) return;
  mediaChapters = [];
  if (!result || !result.media || !Array.isArray(result.media.track)) return;

  const menuTracks = result.media.track.filter(t => t && t['@type'] === 'Menu');
  if (menuTracks.length === 0) return;

  // Собираем тайм-коды глав. Останавливаемся на первом Menu-треке, где
  // нашлись непустые метки (обычно он один; если их несколько, это, как
  // правило, разноязычные дубликаты одних и тех же глав).
  const raw = [];
  for (const track of menuTracks){
    const sources = [track, track.extra].filter(Boolean);
    for (const src of sources){
      for (const key of Object.keys(src)){
        const t = chapterTimeKeyToSeconds(key);
        if (t === null) continue;
        const value = src[key];
        if (typeof value !== 'string' || !value.trim()) continue;
        raw.push({ time: t, title: value });
      }
    }
    if (raw.length) break;
  }
  if (raw.length === 0) return;
  applyChapterList(raw, token);
}

// Превращает список глав [{time, title}] в отрезки для кнопки пропуска заставки и титров
function applyChapterList(raw, token){
  if (token !== chapterParseToken) return;
  mediaChapters = [];
  nextEpisodeSegment = null;

  raw.sort((a, b) => a.time - b.time);
  // Убираем дубликаты по времени, если один тайм-код пришёл из нескольких источников
  const dedup = [];
  for (const item of raw){
    if (dedup.length && Math.abs(dedup[dedup.length - 1].time - item.time) < 0.01) continue;
    dedup.push(item);
  }

  // credits оставляем без ограничения, титры идут до конца файла
  const SKIP_KIND_MAX_DURATION = {
    intro: 15 * 60,
    recap: 15 * 60,
    custom: 20 * 60
  };

  const segments = [];
  for (let i = 0; i < dedup.length; i++){
    const info = classifySkippableChapter(dedup[i].title);
    if (!info) continue; // обычная глава, для кнопки пропуска не нужна
    const start = dedup[i].time;
    let end = i + 1 < dedup.length ? dedup[i + 1].time : Infinity; // Infinity значит "до конца видео"
    const cap = SKIP_KIND_MAX_DURATION[info.kind];
    if (cap !== undefined) end = Math.min(end, start + cap);
    if (end <= start) continue;
    // Метка перехода задаёт окно показа кнопки "Следующая серия", кнопкой пропуска она не становится
    if (info.kind === 'next'){
      if (!nextEpisodeSegment) nextEpisodeSegment = { start, end };
      continue;
    }
    segments.push({
      id: 'ch' + i + '_' + Math.round(start * 1000),
      start,
      end,
      label: info.label
    });
  }
  mediaChapters = segments;

  // Показываем кнопку сразу, не дожидаясь следующего timeupdate с его задержкой
  if (mediaChapters.length > 0 && !video.paused) {
    updateSkipSegmentOverlay(false);
  }
}

// Реальный конец сегмента с учётом Infinity (последняя глава файла),
// как только известна длительность видео, подставляем её.
function skipSegmentEffectiveEnd(seg){
  if (seg.end !== Infinity) return seg.end;
  return isDurationUsable() ? video.duration : Infinity;
}

function resetMediaChapters(){
  chapterParseToken += 1;
  mediaChapters = [];
  nextEpisodeSegment = null;
  dismissedChapterSegments = new Set();
  hideSkipSegmentOverlay();
  hideCodecWarningToast();
}

function hideSkipSegmentOverlay(){
  skipSegmentOverlay.classList.remove('show');
  activeSkipSegment = null;
}

// Показывает/обновляет/скрывает плашку "Пропустить" для текущего момента
function updateSkipSegmentOverlay(suppressed){
  if (suppressed || anyPanelOpen() || mediaChapters.length === 0){
    hideSkipSegmentOverlay();
    return;
  }
  const t = video.currentTime;
  const seg = mediaChapters.find(s => t >= s.start && t < skipSegmentEffectiveEnd(s));
  if (!seg || dismissedChapterSegments.has(seg.id)){
    hideSkipSegmentOverlay();
    return;
  }
  activeSkipSegment = seg;
  // Всегда обновляем текст, даже если плашка уже показана - нужно для случая
  // когда пользователь перематывает с одного сегмента на другой 
  skipSegmentOverlay.textContent = seg.label;
  skipSegmentOverlay.classList.add('show');
}

skipSegmentOverlay.addEventListener('click', () => {
  if (activeSkipSegment){
    dismissedChapterSegments.add(activeSkipSegment.id);
    const end = skipSegmentEffectiveEnd(activeSkipSegment);
    // Перематываем к концу главы, но с небольшим запасом ВПЕРЁД (0.05с)
    let target = isFinite(end) ? end + 0.05 : end;
    if (isDurationUsable()){
      target = isFinite(target) ? Math.min(target, video.duration - 0.05) : video.duration - 0.05;
    }
    if (isFinite(target)) video.currentTime = Math.max(target, activeSkipSegment.start);
  }
  hideSkipSegmentOverlay();
});
