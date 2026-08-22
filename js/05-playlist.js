// 05-playlist.js — Папки, плейлист, манифесты, drag & drop
// Часть Local Player. Файлы подключаются классическими <script> по порядку
// из index.html и делят общую область видимости — см. js/README.md
// --- Плейлист (загрузка папки) ---
let playlistFiles = [];
let playlistIndex = -1;
let playlistFolderName = null; 
let playlistFolderId = null; 
let nextEpisodePromptDismissed = false; 


let mediaChapters = [];
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
  'повтор': { kind: 'recap', label: 'Пропустить повтор' }
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

// Красивый текст плашки: если после "SKIP:" встречается одно из привычных
// слов — используем естественную русскую формулировку, иначе просто
// "Пропустить: <как назвали главу>" (работает для любого языка/названия).
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

    const result = await mediainfo.analyzeData(getSize, readChunk);
    if (token !== chapterParseToken) return;
    applyChaptersFromMediaInfoResult(result, token);
  } catch (err){
    // Нет метаданных, файл без глав, либо mediainfo.js недоступен (например,
    // офлайн без доступа к CDN) — это штатная ситуация для большинства видео,
    // плеер просто продолжает работать без плашек пропуска.
    console.warn('Главы (chapters) не прочитаны:', err && err.message ? err.message : err);
  }
}

// То же самое, но для URL: вместо FileReader качаем нужные куски через
// fetch с заголовком Range. Требует, чтобы сервер поддерживал Range-запросы
// и открывал CORS (Access-Control-Allow-Origin) — если нет, просто ловим
// ошибку ниже и работаем без глав, видео при этом не ломается.
async function parseChaptersFromUrl(url, token){
  try {
    const mediainfo = await getMediaInfoInstance();
    if (token !== chapterParseToken) return;

    let size = null;
    let headOk = false;

    // Пробуем HEAD-запрос для получения размера файла
    try {
      const head = await fetch(url, { method: 'HEAD' });
      if (head.ok) {
        headOk = true;
        size = Number(head.headers.get('Content-Length'));
        if (head.headers.get('Accept-Ranges') !== 'bytes') {
          // Некоторые серверы не пишут этот заголовок, но Range всё равно поддерживают —
          // не блокируем, просто пробуем читать куски ниже.
        }
      }
    } catch (headErr) {
      // HEAD не сработал (CORS, сеть и т.п.) — пробуем читать без предварительного размера
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
          // Сервер ответил 200 на Range-запрос — значит Range не поддерживается
          // и он тихо отдал файл целиком. Не скачиваем его молча: запоминаем
          // размер (Content-Length тут — размер всего файла, это ещё полезно),
          // сразу отменяем недочитанное тело и дальше не пытаемся читать
          // кусками — это разово докачает весь файл, а не сэкономит трафик.
          rangeSupported = false;
          const len = Number(testRes.headers.get('Content-Length'));
          if (len) size = len;
          if (testRes.body && testRes.body.cancel) {
            testRes.body.cancel().catch(() => {});
          }
        }
      } catch (rangeErr) {
        // Range-запрос тоже не сработал — пробуем без размера
        console.log('Range-запрос не удался, пробуем без размера:', rangeErr.message);
      }
    }

    if (!size) {
      throw new Error('Не удалось определить размер файла');
    }

    if (!rangeSupported) {
      throw new Error('Сервер не поддерживает Range-запросы — чтение глав по ссылке отменено, чтобы не докачивать файл целиком в фоне');
    }

    // Защитный потолок на случай, если сервер всё же начнёт отдавать больше,
    // чем попросили (see readChunk ниже) — even в худшем случае чтение глав
    // не должно соревноваться за канал с самим видео на большом файле.
    const MAX_CHAPTER_PROBE_BYTES = 8 * 1024 * 1024; // 8 МБ
    let bytesRead = 0;

    const getSize = () => size;
    const readChunk = async (chunkSize, offset) => {
      const end = Math.min(offset + chunkSize, size) - 1;
      const res = await fetch(url, { headers: { Range: `bytes=${offset}-${end}` } });

      // Сервер обязан ответить 206 (Partial Content) на Range-запрос. Если
      // вместо этого пришёл 200 с полным телом — сервер Range игнорирует,
      // и чтение "лёгких" 256 КБ метаданных незаметно превращается в полную
      // повторную докачку всего видео. Отменяем недочитанное тело и прерываемся,
      // вместо того чтобы молча принять это как валидный чанк.
      if (res.status !== 206) {
        if (res.body && res.body.cancel) res.body.cancel().catch(() => {});
        throw new Error(`Сервер не поддерживает Range-запросы (получен статус ${res.status} вместо 206) — чтение глав отменено`);
      }

      const buf = await res.arrayBuffer();
      bytesRead += buf.byteLength;
      if (bytesRead > MAX_CHAPTER_PROBE_BYTES) {
        throw new Error('Превышен лимит данных для чтения глав по ссылке');
      }
      return new Uint8Array(buf);
    };

    const result = await mediainfo.analyzeData(getSize, readChunk);
    if (token !== chapterParseToken) return;
    applyChaptersFromMediaInfoResult(result, token);
  } catch (err){
    // Нет CORS, нет Range, файл без глав и т.п. — штатно продолжаем без них.
    console.warn('Главы (chapters) по ссылке не прочитаны:', err && err.message ? err.message : err);
  }
}

function applyChaptersFromMediaInfoResult(result, token){
  if (token !== chapterParseToken) return;
  mediaChapters = [];
  if (!result || !result.media || !Array.isArray(result.media.track)) return;

  const menuTracks = result.media.track.filter(t => t && t['@type'] === 'Menu');
  if (menuTracks.length === 0) return;

  // Собираем тайм-коды глав. Останавливаемся на первом Menu-треке, где
  // нашлись непустые метки (обычно он один; если их несколько — это, как
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

  raw.sort((a, b) => a.time - b.time);
  // Убираем возможные дубликаты по времени (например, если совпало между источниками)
  const dedup = [];
  for (const item of raw){
    if (dedup.length && Math.abs(dedup[dedup.length - 1].time - item.time) < 0.01) continue;
    dedup.push(item);
  }

  const SKIP_KIND_MAX_DURATION = {
    intro: 15 * 60,
    recap: 15 * 60,
    custom: 20 * 60
    // credits — без ограничения
  };

  const segments = [];
  for (let i = 0; i < dedup.length; i++){
    const info = classifySkippableChapter(dedup[i].title);
    if (!info) continue; // обычная (не заставка/титры) глава — пропускаем
    const start = dedup[i].time;
    let end = i + 1 < dedup.length ? dedup[i + 1].time : Infinity; // Infinity — "до конца видео"
    const cap = SKIP_KIND_MAX_DURATION[info.kind];
    if (cap !== undefined) end = Math.min(end, start + cap);
    if (end <= start) continue;
    segments.push({
      id: 'ch' + i + '_' + Math.round(start * 1000),
      start,
      end,
      label: info.label
    });
  }
  mediaChapters = segments;
  
  // Сразу показываем кнопку "Пропустить заставку", если chapters загружены и видео уже воспроизводится
  // Не ждём следующего timeupdate, чтобы избежать задержки 9-10 секунд
  if (mediaChapters.length > 0 && !video.paused) {
    updateSkipSegmentOverlay(false);
  }
}

// Реальный конец сегмента с учётом Infinity (последняя глава файла) —
// как только известна длительность видео, подставляем её.
function skipSegmentEffectiveEnd(seg){
  if (seg.end !== Infinity) return seg.end;
  return isDurationUsable() ? video.duration : Infinity;
}

function resetMediaChapters(){
  chapterParseToken += 1;
  mediaChapters = [];
  dismissedChapterSegments = new Set();
  hideSkipSegmentOverlay();
}

// Переход к следующему видео в плейлисте (общая логика для автоперехода по
// окончании и для ручного нажатия "Смотреть" в подсказке "Следующая серия").
function advanceToNextPlaylistItem(){
  if (!(playlistFiles.length > 1 && playlistIndex > -1 && playlistIndex < playlistFiles.length - 1)) return;
  playlistIndex += 1;
  renderPlaylist();
  const next = playlistFiles[playlistIndex];
  loadFile(next.file, next.handle || null, { isFolder: true, folderName: playlistFolderName, folderId: playlistFolderId });
}

// Переход к предыдущему видео в плейлисте
function advanceToPrevPlaylistItem(){
  if (!(playlistFiles.length > 1 && playlistIndex > 0)) return;
  playlistIndex -= 1;
  renderPlaylist();
  const prev = playlistFiles[playlistIndex];
  loadFile(prev.file, prev.handle || null, { isFolder: true, folderName: playlistFolderName, folderId: playlistFolderId });
}

function hideNextEpisodeOverlay(){
  nextEpOverlay.classList.remove('show');
}

function hideSkipSegmentOverlay(){
  skipSegmentOverlay.classList.remove('show');
  activeSkipSegment = null;
}

// Детерминированный id по составу папки (имена+размеры+даты файлов) — одна и та же
// папка (тот же набор файлов) всегда даёт один и тот же id, поэтому повторное
// открытие той же папки просто обновляет существующий манифест, а не плодит новые.
// Id папки считаем только по именам файлов. Раньше в подпись входили размер и дата
// изменения, поэтому докачка одной новой серии, переименование или пересохранение
// файла меняли id: манифест осиротевал, и «Продолжить» открывало одиночное видео
// вместо плейлиста (баг M-3).
function computeFolderId(items){
  const sig = items
    .map(it => it.file.name)
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

// Элементы плейлиста везде имеют вид { file, handle } — handle это настоящий
// FileSystemFileHandle, когда браузер способен его дать (тогда «Продолжить»
// сможет открыть файл мгновенно, без диалога), либо null, если способ загрузки
// такого не позволяет (см. комментарии у каждого сборщика ниже).
function sortVideoFiles(items){
  return items
    .filter(item => isVideoFile(item.file))
    .sort((a, b) => naturalCompare(filePathForSort(a.file), filePathForSort(b.file)));
}

// Рекурсивно обходит запись FileSystemEntry (drag & drop папки, старый API).
// Этот API НЕ даёт постоянного хэндла файла — только File на момент обхода,
// поэтому такие элементы всегда получают handle:null.
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
  // Сначала пробуем получить постоянный хэндл папки через File System Access API
  // (Chrome/Edge, DataTransferItem.getAsFileSystemHandle). Тогда все файлы внутри
  // получат настоящие FileSystemFileHandle — как при выборе папки через диалог —
  // и «Продолжить» для них будет открывать файл мгновенно, без повторного выбора.
  if (itemsArr.length === 1 && typeof itemsArr[0].getAsFileSystemHandle === 'function'){
    try{
      const handle = await itemsArr[0].getAsFileSystemHandle();
      if (handle && handle.kind === 'directory'){
        const out = [];
        await collectFilesFromDirectoryHandle(handle, out, handle.name);
        return { files: out, folderName: handle.name };
      }
    } catch(err){ /* не получилось — пробуем резервный способ ниже */ }
  }

  // Резервный способ (Firefox/Safari, либо getAsFileSystemHandle недоступен/не
  // сработал) — через устаревший FileSystemEntry API. Постоянных хэндлов не даёт.
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
  // Если перетащили ровно одну папку верхнего уровня — запоминаем её имя для подписи
  const topDirs = entries.filter(e => e.isDirectory);
  const folderName = topDirs.length === 1 ? topDirs[0].name : null;
  return { files: out, folderName };
}

// Рекурсивно обходит FileSystemDirectoryHandle (выбор папки через системный диалог,
// либо drag & drop с getAsFileSystemHandle). Даёт настоящие FileSystemFileHandle —
// их можно сохранить и переиспользовать позже без диалога выбора файла.
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
  playlistBtn.style.display = 'none';
  playlistBtn.setAttribute('aria-expanded', 'false');
  playlistPanel.classList.remove('open');
  playlistList.innerHTML = '';
  playlistTitle.textContent = 'Плейлист';
  playlistNav.style.display = 'none';
  hideNextEpisodeOverlay();
  hideSkipSegmentOverlay();
}

function renderPlaylist(){
  playlistTitle.textContent = playlistFolderName ? `Плейлист — ${playlistFolderName}` : 'Плейлист';
  playlistList.innerHTML = '';
  playlistFiles.forEach((entry, idx) => {
    const item = document.createElement('div');
    // Отметка просмотренных/начатых серий — раньше плейлист вообще не показывал,
    // что уже просмотрено, хотя данные лежали в хранилище (баг M-17)
    const state = playlistEntryState(entry, playlistFolderId);
    item.className = 'playlist-item'
      + (idx === playlistIndex ? ' active' : '')
      + (state ? ' ' + state : '');
    const badge = state === 'watched'
      ? '<span class="playlist-item-badge" title="Просмотрено">✓</span>'
      : (state === 'in-progress' ? '<span class="playlist-item-badge" title="Начато">•</span>' : '');
    item.innerHTML = `
      <span class="playlist-item-index">${idx + 1}</span>
      <span class="playlist-item-name">${escapeHtml(niceTitleFromFilename(entry.file.name))}</span>
      ${badge}
    `;
    item.addEventListener('click', () => {
      if (idx === playlistIndex) return;
      playlistIndex = idx;
      renderPlaylist();
      loadFile(entry.file, entry.handle || null, { isFolder: true, folderName: playlistFolderName, folderId: playlistFolderId });
    });
    playlistList.appendChild(item);
  });
  updatePlaylistNavButtons();
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

// Сохраняет лёгкий "манифест" плейлиста (имена/размеры/даты файлов, без самих File) —
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
  } catch(err){ /* некритично — просто не сможем восстановить весь плейлист позже */ }
}

function openFolderPlaylist(items, folderName){
  const videos = sortVideoFiles(items); // уже [{ file, handle }], отфильтровано и отсортировано
  if (!videos.length){
    showErrMsg('В выбранной папке не найдено поддерживаемых видеофайлов (.mp4, .webm, .mov)');
    return;
  }
  hideErrMsg();
  playlistFiles = videos;
  playlistFolderName = folderName || null;
  // Даже подпись по одним именам меняется, когда в папку докачали новую серию.
  // Поэтому сначала ищем уже сохранённый манифест той же папки по пересечению
  // имён — тогда id остаётся прежним и накопленный прогресс не теряется (баг M-3).
  playlistFolderId = findMatchingFolderId(playlistFiles, playlistFolderName) || computeFolderId(playlistFiles);
  // Открываем ту серию, на которой пользователь остановился в прошлый раз.
  // Раньше повторное открытие папки всегда начиналось с первой серии (баг M-2).
  playlistIndex = findLastWatchedIndex(playlistFiles, playlistFolderId);
  playlistBtn.style.display = playlistFiles.length > 1 ? '' : 'none';
  renderPlaylist();
  updatePlaylistNavButtons();
  savePlaylistManifest(playlistFolderId, playlistFolderName, playlistFiles);
  // Сохраняем хэндлы ВСЕХ видео из папки, если удалось их получить — тогда
  // «Продолжить» для любого эпизода (не только текущего) сможет открыть файл
  // мгновенно, без диалога выбора файла, и полностью восстановить плейлист.
  playlistFiles.forEach(entry => {
    if (entry.handle){
      idbSet(fileKey(entry.file, true, playlistFolderId), entry.handle).catch(() => {});
    }
  });
  const first = playlistFiles[playlistIndex] || playlistFiles[0];
  loadFile(first.file, first.handle || null, { isFolder: true, folderName: playlistFolderName, folderId: playlistFolderId });
}

// Ищет уже сохранённый манифест той же папки: совпадение по имени папки либо
// пересечение списка файлов не меньше чем на 60 %. Возвращает его folderId.
function findMatchingFolderId(files, folderName){
  const names = new Set(files.map(f => f.file.name));
  let best = null, bestScore = 0;
  for (let i = 0; i < localStorage.length; i++){
    const key = localStorage.key(i);
    if (!key || !key.startsWith(PLAYLIST_MANIFEST_PREFIX)) continue;
    try{
      const m = JSON.parse(localStorage.getItem(key));
      if (!m || !Array.isArray(m.files) || !m.files.length) continue;
      const saved = m.files.map(f => f.name);
      const common = saved.filter(n => names.has(n)).length;
      const score = common / Math.max(saved.length, names.size);
      const sameFolderName = folderName && m.folderName && m.folderName === folderName;
      if ((score >= 0.6 || (sameFolderName && score > 0)) && score > bestScore){
        bestScore = score;
        best = key.slice(PLAYLIST_MANIFEST_PREFIX.length);
      }
    } catch(e){}
  }
  return best;
}

// Индекс серии с самой свежей записью прогресса; 0, если папку ещё не смотрели
function findLastWatchedIndex(files, folderId){
  let bestIdx = 0, bestTs = -1;
  files.forEach((entry, idx) => {
    try{
      const raw = localStorage.getItem(fileKey(entry.file, true, folderId))
               || localStorage.getItem(legacyFolderKey(entry.file));
      if (!raw) return;
      const data = JSON.parse(raw);
      const ts = data && typeof data.ts === 'number' ? data.ts : 0;
      if (ts > bestTs){ bestTs = ts; bestIdx = idx; }
    } catch(e){}
  });
  return bestIdx;
}

// Состояние серии для отметок в плейлисте: 'watched' | 'in-progress' | null
function playlistEntryState(entry, folderId){
  try{
    const raw = localStorage.getItem(fileKey(entry.file, true, folderId))
             || localStorage.getItem(legacyFolderKey(entry.file));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.t !== 'number') return null;
    if (data.duration && data.t >= data.duration * 0.9) return 'watched';
    return 'in-progress';
  } catch(e){ return null; }
}

// --- перетаскивание файла ---
['dragenter','dragover'].forEach(evt =>
  dropzone.addEventListener(evt, e => { 
    e.preventDefault(); 
    e.stopPropagation();
    e.stopImmediatePropagation();
    dropzone.classList.add('dragover'); 
  })
);
['dragleave'].forEach(evt =>
  dropzone.addEventListener(evt, e => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    dropzone.classList.remove('dragover');
  })
);
dropzone.addEventListener('drop', async e => {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  // Снимаем подсветку сразу: dragleave/dragend при перетаскивании файлов из ОС
  // не приходят, и зона оставалась подсвеченной навсегда (баг M-12)
  dropzone.classList.remove('dragover');

  const files = e.dataTransfer.files;
  if (!files || files.length === 0) {
    // Перетащили выделенный текст или ссылку — раньше не происходило вообще ничего (баг M-13)
    showErrMsg('Это не файл. Перетащите видеофайл или вставьте ссылку в поле справа');
    return;
  }
  
  const file = files[0];
  if (!file) return;
  
  // Проверяем по MIME type или по расширению
  if (!isVideoFile(file)) {
    // Папку браузер отдаёт как файл без типа и без расширения — подсказываем,
    // что для неё есть отдельная зона, вместо общего «это не видеофайл» (баг M-13)
    const looksLikeFolder = !file.type && !/\.[a-z0-9]{2,5}$/i.test(file.name);
    showErrMsg(looksLikeFolder
      ? 'Похоже, это папка. Перетащите её в зону «Выберите папку» справа'
      : 'Пожалуйста, перетащите видеофайл (.mp4, .webm, .mov)');
    return;
  }

  // Раньше остальные файлы отбрасывались молча (баг M-13)
  if (files.length > 1){
    showErrMsg(`Перетащено файлов: ${files.length}. Открыт первый — «${file.name}». Для нескольких серий перетащите папку`);
  }
  
  const dtItem = e.dataTransfer.items && e.dataTransfer.items[0];
  let handle = null;
  if (dtItem && typeof dtItem.getAsFileSystemHandle === 'function'){
    try{
      const h = await dtItem.getAsFileSystemHandle();
      if (h && h.kind === 'file') handle = h;
    } catch(err){ handle = null; }
  }
  if (handle){
    try{ await idbSet(fileKey(file), handle); } catch(err){}
  }
  loadFile(file, handle);
});

// --- перетаскивание папки ---
['dragenter','dragover'].forEach(evt =>
  dropzoneFolder.addEventListener(evt, e => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    dropzoneFolder.classList.add('dragover');
  })
);
['dragleave'].forEach(evt =>
  dropzoneFolder.addEventListener(evt, e => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    dropzoneFolder.classList.remove('dragover');
  })
);
dropzoneFolder.addEventListener('drop', async e => {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  dropzoneFolder.classList.remove('dragover');

  const items = e.dataTransfer.items;
  let files = [];
  let folderName = null;
  if (items && items.length && (typeof items[0].getAsFileSystemHandle === 'function' || typeof items[0].webkitGetAsEntry === 'function')){
    const collected = await collectFilesFromDataTransferItems(Array.from(items));
    files = collected.files;
    folderName = collected.folderName;
  } else if (e.dataTransfer.files && e.dataTransfer.files.length){
    files = Array.from(e.dataTransfer.files).map(f => ({ file: f, handle: null }));
  }

  if (!files.length){
    showErrMsg('Не удалось прочитать содержимое папки. Попробуйте выбрать папку через диалог');
    return;
  }
  openFolderPlaylist(files, folderName);
});
dropzoneFolder.addEventListener('click', async () => {
  if (typeof window.showDirectoryPicker === 'function'){
    try{
      const dirHandle = await window.showDirectoryPicker();
      const files = [];
      await collectFilesFromDirectoryHandle(dirHandle, files, dirHandle.name);
      openFolderPlaylist(files, dirHandle.name);
    } catch(err){ /* пользователь закрыл диалог выбора папки */ }
    return;
  }
  folderInput.click();
});
folderInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files || []).map(f => ({ file: f, handle: null }));
  folderInput.value = '';
  if (!files.length) return;
  // input[webkitdirectory] кладёт имя папки первым сегментом относительного пути
  let folderName = null;
  if (files[0] && files[0].file.webkitRelativePath){
    folderName = files[0].file.webkitRelativePath.split('/')[0] || null;
  }
  openFolderPlaylist(files, folderName);
});

// Глобальный drag & drop для всего body
['dragenter','dragover'].forEach(evt =>
  document.body.addEventListener(evt, e => {
    e.preventDefault();
    e.stopPropagation();
    // Подсвечиваем dropzone при перетаскивании в любом месте пока drop-view активен
    if (dropView.style.display !== 'none'){
      dropzone.classList.add('dragover');
    }
  })
);
['dragleave'].forEach(evt =>
  document.body.addEventListener(evt, e => {
    e.preventDefault();
    e.stopPropagation();
    // Убираем подсветку при уходе
    dropzone.classList.remove('dragover');
    dropzoneFolder.classList.remove('dragover');
  })
);
// Убираем подсветку при завершении любой drag-операции
document.body.addEventListener('dragend', e => {
  e.preventDefault();
  e.stopPropagation();
  dropzone.classList.remove('dragover');
  dropzoneFolder.classList.remove('dragover');
});
// Глобальный drop только для области вне dropzone
document.body.addEventListener('drop', async e => {
  e.preventDefault();
  e.stopPropagation();
  
  // Если drop произошёл на dropzone/dropzone-folder или внутри них, не обрабатываем здесь
  if (e.target.closest('#dropzone') || e.target.closest('#dropzone-folder')) {
    return;
  }
  
  // Если drop view не показан, показываем уведомление
  if (dropView.style.display === 'none'){
    showStorageToast('Сначала нажмите «Назад», чтобы открыть другой файл');
    return;
  }
  
  const files = e.dataTransfer.files;
  if (!files || files.length === 0) return;
  
  const file = files[0];
  if (!file) return;
  
  // Проверяем по MIME type или по расширению
  if (!isVideoFile(file)) {
    showErrMsg('Пожалуйста, перетащите видеофайл (.mp4, .webm, .mov)');
    return;
  }
  
  const dtItem = e.dataTransfer.items && e.dataTransfer.items[0];
  let handle = null;
  if (dtItem && typeof dtItem.getAsFileSystemHandle === 'function'){
    try{
      const h = await dtItem.getAsFileSystemHandle();
      if (h && h.kind === 'file') handle = h;
    } catch(err){ handle = null; }
  }
  if (handle){
    try{ await idbSet(fileKey(file), handle); } catch(err){}
  }
  loadFile(file, handle);
});
const fileInput = document.getElementById('file-input');
dropzone.addEventListener('click', async () => {
  // showOpenFilePicker (File System Access API) есть только в Chromium.
  // В Firefox/Safari его нет — раньше в этом случае просто ничего не
  // происходило (catch молча гасил исключение "функция не существует",
  // как будто пользователь сам закрыл диалог). Теперь, как и у кнопки
  // «папка», делаем то же самое ветвление с фолбэком на обычный <input>.
  if (typeof window.showOpenFilePicker !== 'function'){
    fileInput.click();
    return;
  }
  try{
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'Видео', accept: { 'video/*': ['.mp4','.webm','.mov'] } }],
      multiple: false
    });
    const file = await handle.getFile();
    try{ await idbSet(fileKey(file), handle); } catch(err){}
    loadFile(file, handle);
  } catch(err){ /* пользователь закрыл диалог выбора файла */ }
});
fileInput.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  fileInput.value = '';
  if (!file) return;
  if (!isVideoFile(file)) {
    showErrMsg('Пожалуйста, выберите видеофайл (.mp4, .webm, .mov)');
    return;
  }
  // Обычный <input type="file"> не даёт FileSystemFileHandle — «Продолжить»
  // для этого файла позже потребует повторного выбора, как и в остальных
  // случаях без File System Access API. Это уже штатно обрабатывается кодом
  // восстановления прогресса ниже.
  loadFile(file, null);
});
