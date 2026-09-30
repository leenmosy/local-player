// --- Плейлист (загрузка папки) ---
let playlistFiles = [];
let playlistIndex = -1;
// Ссылка на манифест сериала, непусто только когда плейлист собран из series.json
let playlistSeriesUrl = null;
let playlistFolderName = null; 
let playlistFolderId = null; 
let nextEpisodePromptDismissed = false; 


let mediaChapters = [];
// Окно показа кнопки "Следующая серия", если оно размечено главой
let nextEpisodeSegment = null;
let dismissedChapterSegments = new Set();
let chapterParseToken = 0;
let activeSkipSegment = null;

function nextEpisodeThreshold(duration){
  if (!duration || !isFinite(duration) || duration <= 0) return 12;
  const pct = duration * 0.06; // ~6% длительности серии
  const clamped = Math.max(12, Math.min(pct, 45));
  return Math.min(clamped, duration * 0.5);
}

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

// Переход к следующему видео в плейлисте (общая логика для автоперехода по
// окончании и для ручного нажатия "Смотреть" в подсказке "Следующая серия").
function advanceToNextPlaylistItem(){
  if (!(playlistFiles.length > 1 && playlistIndex > -1 && playlistIndex < playlistFiles.length - 1)) return;
  playlistIndex += 1;
  renderPlaylist();
  openPlaylistEntry(playlistFiles[playlistIndex]);
}

// Переход к предыдущему видео в плейлисте
function advanceToPrevPlaylistItem(){
  if (!(playlistFiles.length > 1 && playlistIndex > 0)) return;
  playlistIndex -= 1;
  renderPlaylist();
  openPlaylistEntry(playlistFiles[playlistIndex]);
}

function hideNextEpisodeOverlay(){
  nextEpOverlay.classList.remove('show');
}

function hideSkipSegmentOverlay(){
  skipSegmentOverlay.classList.remove('show');
  activeSkipSegment = null;
}
// Строит ID папки из её имени и сигнатуры файлов (имя+размер+дата)
function computeFolderId(items, folderName){
  const sig = (folderName || '') + '::' + items
    .map(it => it.file.name + ':' + it.file.size + ':' + (it.file.lastModified || 0))
    .join('|');
  let hash = 0;
  for (let i = 0; i < sig.length; i++){
    hash = (Math.imul(31, hash) + sig.charCodeAt(i)) | 0;
  }
  return 'f' + (hash >>> 0).toString(36);
}

function naturalCompare(a, b){
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'variant' });
}

function filePathForSort(file){
  return file.__relPath || file.webkitRelativePath || file.name;
}

// Элементы плейлиста содержат File и доступный FileSystemFileHandle или null
function sortVideoFiles(items){
  return items
    .filter(item => isVideoFile(item.file))
    .sort((a, b) => naturalCompare(filePathForSort(a.file), filePathForSort(b.file)));
}

// Рекурсивно обходит FileSystemEntry и формирует элементы с File и handle:null
function collectFilesFromEntry(entry, out){
  return new Promise((resolve) => {
    if (!entry){ resolve(); return; }
    if (entry.isFile){
      entry.file((file) => {
        file.__relPath = entry.fullPath || file.name;
        out.push({ file, handle: null });
        resolve();
      }, () => resolve());
    } else if (entry.isDirectory){
      const reader = entry.createReader();
      const readBatch = () => {
        reader.readEntries(async (entries) => {
          if (!entries.length){ resolve(); return; }
          for (const child of entries){
            await collectFilesFromEntry(child, out);
          }
          readBatch();
        }, () => resolve());
      };
      readBatch();
    } else {
      resolve();
    }
  });
}

async function collectFilesFromDataTransferItems(items){
  const itemsArr = Array.from(items);
  // Получаем постоянные хэндлы файлов через File System Access API для быстрого восстановления
  if (itemsArr.length === 1 && typeof itemsArr[0].getAsFileSystemHandle === 'function'){
    try{
      const handle = await itemsArr[0].getAsFileSystemHandle();
      if (handle && handle.kind === 'directory'){
        const out = [];
        await collectFilesFromDirectoryHandle(handle, out, handle.name);
        return { files: out, folderName: handle.name, dirHandle: handle };
      }
    } catch(err){ /* не получилось, пробуем резервный способ ниже */ }
  }

  // Резервный способ (Firefox/Safari, либо getAsFileSystemHandle недоступен/не
  // сработал), через устаревший FileSystemEntry API. Постоянных хэндлов не даёт.
  const out = [];
  const entries = [];
  for (const item of itemsArr){
    if (typeof item.webkitGetAsEntry === 'function'){
      const entry = item.webkitGetAsEntry();
      if (entry) entries.push(entry);
    }
  }
  for (const entry of entries){
    await collectFilesFromEntry(entry, out);
  }
  // Если перетащили ровно одну папку верхнего уровня, запоминаем её имя для подписи
  const topDirs = entries.filter(e => e.isDirectory);
  const folderName = topDirs.length === 1 ? topDirs[0].name : null;
  return { files: out, folderName };
}

// Рекурсивно обходит FileSystemDirectoryHandle и сохраняет доступные хэндлы файлов
async function collectFilesFromDirectoryHandle(dirHandle, out, basePath){
  for await (const [name, handle] of dirHandle.entries()){
    const path = basePath + '/' + name;
    if (handle.kind === 'file'){
      try{
        const file = await handle.getFile();
        file.__relPath = path;
        out.push({ file, handle });
      } catch(err){}
    } else if (handle.kind === 'directory'){
      await collectFilesFromDirectoryHandle(handle, out, path);
    }
  }
}

function resetPlaylist(){
  playlistFiles = [];
  playlistIndex = -1;
  playlistFolderName = null;
  playlistFolderId = null;
  playlistSeriesUrl = null;
  playlistBtn.style.display = 'none';
  playlistBtn.setAttribute('aria-expanded', 'false');
  playlistPanel.classList.remove('open');
  playlistList.innerHTML = '';
  playlistNav.style.display = 'none';
  hideNextEpisodeOverlay();
  hideSkipSegmentOverlay();
}

function renderPlaylist(){
  playlistList.innerHTML = '';
  playlistFiles.forEach((entry, idx) => {
    const item = document.createElement('div');
    item.className = 'playlist-item' + (idx === playlistIndex ? ' active' : '');
    // Длинное название режется многоточием, полное видно во всплывающей подсказке
    const title = escapeHtml(playlistEntryTitle(entry, playlistFolderId));
    item.innerHTML = `<span class="playlist-item-name" title="${title}">${title}</span>`;
    item.addEventListener('click', () => {
      // Список сворачиваем в любом случае, как у выпадающего меню, а текущую серию не перезагружаем
      setPlaylistPanelOpen(false);
      if (idx === playlistIndex) return;
      playlistIndex = idx;
      renderPlaylist();
      openPlaylistEntry(entry);
    });
    playlistList.appendChild(item);
  });
  updatePlaylistNavButtons();
  updateEpisodeButtonLabel();
}

// Код серии из названия: S1E5, 1x05, «5 серия», «серия 5», «эпизод 5». Позиция в списке номером не считается
function episodeCodeFromTitle(title){
  const t = String(title || '');
  let m = t.match(/\bS(\d{1,2})\s*E(\d{1,3})\b/i);
  if (m) return `S${parseInt(m[1], 10)}E${parseInt(m[2], 10)}`;
  m = t.match(/\b(\d{1,2})x(\d{1,3})\b/i);
  if (m) return `S${parseInt(m[1], 10)}E${parseInt(m[2], 10)}`;
  m = t.match(/(?:^|\s)(\d{1,3})\s*(?:серия|эпизод)(?=\s|$)/i) || t.match(/(?:^|\s)(?:серия|эпизод)\s*(\d{1,3})(?=\s|$)/i);
  if (m) return `Серия ${parseInt(m[1], 10)}`;
  return null;
}

// Подпись кнопки выбора серии: код серии, а без него само название, чтобы не выдумывать номер по позиции
function updateEpisodeButtonLabel(){
  const label = document.getElementById('playlist-btn-label');
  if (!label) return;
  const entry = playlistFiles[playlistIndex];
  if (!entry){ label.textContent = 'Серия'; label.title = ''; return; }
  const title = playlistEntryTitle(entry, playlistFolderId);
  const code = episodeCodeFromTitle(title);
  label.textContent = code || title;
  label.title = code ? title : '';
}

function updatePlaylistNavButtons(){
  if (playlistFiles.length > 1) {
    playlistNav.style.display = 'flex';
    prevEpisodeBtn.disabled = playlistIndex <= 0;
    nextEpisodeBtn.disabled = playlistIndex >= playlistFiles.length - 1;
  } else {
    playlistNav.style.display = 'none';
  }
}

// Сохраняет лёгкий "манифест" плейлиста (имена/размеры/даты файлов, без самих File),
// по нему при "Продолжить" восстанавливается весь плейлист, а не только один эпизод.
function savePlaylistManifest(folderId, folderName, items){
  try{
    const manifest = {
      folderName: folderName || null,
      files: items.map(it => ({
        name: it.file.name,
        size: it.file.size,
        lastModified: it.file.lastModified || 0
      })),
      ts: Date.now()
    };
    localStorage.setItem(PLAYLIST_MANIFEST_PREFIX + folderId, JSON.stringify(manifest));
    cleanupStorage(PLAYLIST_MANIFEST_PREFIX);
  } catch(err){ /* некритично, просто не сможем восстановить весь плейлист позже */ }
}

function openFolderPlaylist(items, folderName, dirHandle){
  const videos = sortVideoFiles(items); // уже [{ file, handle }], отфильтровано и отсортировано
  if (!videos.length){
    showErrMsg('В выбранной папке не найдено поддерживаемых видеофайлов (.mp4, .webm, .mov)');
    return;
  }
  hideErrMsg();
  playlistFiles = videos;
  playlistFolderName = folderName || null;
  // Сохраняем ID папки при добавлении новых серий, чтобы не терять существующий прогресс
  playlistFolderId = findMatchingFolderId(playlistFiles, playlistFolderName) || computeFolderId(playlistFiles, playlistFolderName);
  // При повторном открытии папки открываем серию, на которой пользователь остановился
  playlistIndex = findLastWatchedIndex(playlistFiles, playlistFolderId);
  playlistBtn.style.display = playlistFiles.length > 1 ? '' : 'none';
  renderPlaylist();
  updatePlaylistNavButtons();
  savePlaylistManifest(playlistFolderId, playlistFolderName, playlistFiles);
  // Сохраняем хэндлы всех видео папки для быстрого восстановления любого эпизода и плейлиста
  playlistFiles.forEach(entry => {
    if (entry.handle){
      idbSet(fileKey(entry.file, true, playlistFolderId), entry.handle).catch(() => {});
    }
  });
  if (dirHandle) idbSet(DIR_HANDLE_PREFIX + playlistFolderId, dirHandle).catch(() => {});
  openPlaylistEntry(playlistFiles[playlistIndex] || playlistFiles[0]);
}

// Ищет series.json на уровень выше серии и отдаёт его адрес, если эта серия там перечислена
async function findSeriesManifestFor(episodeUrl){
  let manifestUrl = null;
  try{ manifestUrl = new URL('../series.json', episodeUrl.split(/[?#]/)[0]).href; } catch(e){ return null; }
  try{
    const res = await fetch(manifestUrl);
    if (!res.ok) return null;
    const manifest = await res.json();
    const episodes = manifest && Array.isArray(manifest.episodes) ? manifest.episodes : [];
    const нужная = normalizeUrlForKey(episodeUrl);
    const перечислена = episodes.some(ep => {
      const raw = typeof ep === 'string' ? ep : (ep && ep.url);
      if (!raw) return false;
      try{ return normalizeUrlForKey(new URL(String(raw), manifestUrl).href) === нужная; } catch(e){ return false; }
    });
    return перечислена ? manifestUrl : null;
  } catch(e){ return null; }
}

// Разворачивает series.json в плейлист, чтобы на сериал была одна ссылка вместо ссылки на серию
async function openSeriesPlaylist(manifestUrl, loadToken, startUrl){
  let manifest = null;
  try{
    const res = await fetch(manifestUrl);
    if (!res.ok){
      showUrlError('Не удалось загрузить список серий, сервер ответил ' + res.status);
      return;
    }
    manifest = await res.json();
  } catch(e){
    showUrlError('Не удалось прочитать список серий. Проверьте формат файла и CORS');
    return;
  }
  if (loadToken !== urlLoadToken) return; // пользователь уже открыл другой источник

  const rawEpisodes = manifest && Array.isArray(manifest.episodes) ? manifest.episodes : null;
  if (!rawEpisodes || !rawEpisodes.length){
    showUrlError('В списке серий нет ни одной серии');
    return;
  }

  // Ссылки серий разрешаем относительно манифеста, чтобы внутри можно было писать короткие пути
  const entries = [];
  rawEpisodes.forEach((ep, idx) => {
    const raw = typeof ep === 'string' ? ep : (ep && ep.url);
    if (!raw) return;
    let parsed = null;
    try{ parsed = new URL(String(raw), manifestUrl); } catch(e){ return; }
    // Манифест это внешний файл, в src пускаем только сетевые схемы
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
    const rawTitle = (ep && ep.title) ? String(ep.title).trim() : '';
    entries.push({ url: parsed.href, title: (rawTitle || 'Серия ' + (idx + 1)).slice(0, MAX_TITLE_LEN) });
  });
  if (!entries.length){
    showUrlError('В списке серий нет корректных ссылок');
    return;
  }

  // Прошлый плейлист гасим только здесь, при переключении серий внутри сериала он должен жить
  resetPlaylist();
  playlistFiles = entries;
  playlistSeriesUrl = manifestUrl;
  playlistFolderName = (manifest.title ? String(manifest.title).trim() : '').slice(0, MAX_TITLE_LEN) || null;
  // Если серию назвали явно, открываем её, иначе ту, на которой остановились
  let startIndex = -1;
  if (startUrl){
    const нужная = normalizeUrlForKey(startUrl);
    startIndex = playlistFiles.findIndex(e => normalizeUrlForKey(e.url) === нужная);
  }
  playlistIndex = startIndex > -1 ? startIndex : findLastWatchedIndex(playlistFiles, null);
  playlistBtn.style.display = playlistFiles.length > 1 ? '' : 'none';
  renderPlaylist();
  updatePlaylistNavButtons();
  openPlaylistEntry(playlistFiles[playlistIndex] || playlistFiles[0]);
}

// Ищет сохранённый манифест той же папки по имени папки и сигнатуре файлов (имя+размер+дата)
function findMatchingFolderId(files, folderName){
  const sigOf = f => f.name + ':' + f.size + ':' + (f.lastModified || 0);
  const sigs = new Set(files.map(f => sigOf(f.file)));
  let best = null, bestScore = 0;
  for (let i = 0; i < localStorage.length; i++){
    const key = localStorage.key(i);
    if (!key || !key.startsWith(PLAYLIST_MANIFEST_PREFIX)) continue;
    try{
      const m = JSON.parse(localStorage.getItem(key));
      if (!m || !Array.isArray(m.files) || !m.files.length) continue;
      const saved = m.files.map(sigOf);
      const common = saved.filter(s => sigs.has(s)).length;
      const score = common / Math.max(saved.length, sigs.size);
      if (score < 0.6) continue;
      // Имя папки не жёсткое условие, а бонус к рангу: набор файлов опознаёт папку и после переименования
      const nameMatches = (folderName || null) === (m.folderName || null);
      const rank = score + (nameMatches ? 1 : 0);
      if (rank > bestScore){
        bestScore = rank;
        best = key.slice(PLAYLIST_MANIFEST_PREFIX.length);
      }
    } catch(e){}
  }
  return best;
}

// Начатая серия важнее нетронутой, нетронутая важнее досмотренной;
// если пройдена вся папка, открываем её с начала
function findLastWatchedIndex(files, folderId){
  let startedIdx = -1, startedTs = -1, firstUntouched = -1;
  files.forEach((entry, idx) => {
    const data = readPlaylistEntryProgress(entry, folderId);
    if (!data || data.completed){
      if (!data && firstUntouched === -1) firstUntouched = idx;
      return;
    }
    const started = isProgressStarted(data.t, data.duration);
    if (firstUntouched === -1 && !started) firstUntouched = idx;
    const ts = typeof data.ts === 'number' ? data.ts : 0;
    if (started && ts > startedTs){ startedTs = ts; startedIdx = idx; }
  });
  if (startedIdx > -1) return startedIdx;
  if (firstUntouched > -1) return firstUntouched;
  return 0;
}

// Запись плейлиста это либо локальный файл { file, handle }, либо серия по ссылке { url, title }
function isUrlPlaylistEntry(entry){
  return !!(entry && entry.url);
}

// Запись прогресса для элемента плейлиста, у файлов читаем и старый формат ключа
function readPlaylistEntryProgress(entry, folderId){
  try{
    const raw = isUrlPlaylistEntry(entry)
      ? localStorage.getItem(urlKey(entry.url))
      : (localStorage.getItem(fileKey(entry.file, true, folderId))
         || localStorage.getItem(legacyFolderKey(entry.file)));
    return raw ? JSON.parse(raw) : null;
  } catch(e){ return null; }
}

// Название записи для панели плейлиста
function playlistEntryTitle(entry, folderId){
  // Имя, заданное пользователем, важнее автоматического, так же ведёт себя шапка плеера
  if (isUrlPlaylistEntry(entry)){
    const auto = entry.title || niceTitleFromFilename(getFileNameFromUrl(entry.url));
    return storedCustomTitle(urlKey(entry.url), auto) || auto;
  }
  const auto = niceTitleFromFilename(entry.file.name);
  // У файлов читаем и старый формат ключа, как это делает чтение прогресса
  return storedCustomTitle(fileKey(entry.file, true, folderId), auto)
      || storedCustomTitle(legacyFolderKey(entry.file), auto)
      || auto;
}

// Открывает запись плейлиста тем загрузчиком, который ей подходит
function openPlaylistEntry(entry){
  if (!entry) return;
  if (isUrlPlaylistEntry(entry)){
    loadUrl(entry.url, { title: entry.title || null });
    return;
  }
  loadFile(entry.file, entry.handle || null, { isFolder: true, folderName: playlistFolderName, folderId: playlistFolderId });
}

// Дропзоны, это div с role="button", Enter/Space нужно вешать вручную
[dropzone, dropzoneFolder].forEach(zone => {
  zone.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    zone.click();
  });
});

