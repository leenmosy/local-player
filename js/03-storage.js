// 03-storage.js — Ключи, прогресс просмотра, настройки, localStorage, список «Продолжить»
// Часть Local Player. Файлы подключаются классическими <script> по порядку
// из index.html и делят общую область видимости — см. js/README.md
// --- запоминание тайминга просмотра (localStorage) ---
const PROGRESS_PREFIX = 'lp_progress:';
const URL_KEY_PREFIX = PROGRESS_PREFIX + 'url:';
const FOLDER_PROGRESS_PREFIX = PROGRESS_PREFIX + 'folder:';
const PLAYLIST_MANIFEST_PREFIX = 'lp_playlist:';
const SETTINGS_PREFIX = 'lp_settings:';
const SUBS_PREFIX = 'lp_subs:';
// Глобальные настройки по умолчанию. Раньше ВСЕ настройки были строго пофайловыми,
// и каждая новая серия сбрасывала громкость на 20 %, а размер субтитров — на 28 px
// (баг M-19). Пофайловыми остаются только те, что осмысленны для конкретного видео:
// интервалы блюра, текст оверлея, зеркало, яркость и зум.
const GLOBAL_DEFAULTS_KEY = 'lp_defaults';
// Компрессора здесь намеренно нет. Для нового источника он должен включаться всегда
// (жёсткий drToggle.checked = true), а не наследоваться от предыдущего файла. Иначе
// одно открытие ссылки с сервера без CORS — где компрессор принудительно выключается —
// записывало drToggle: false в глобальные умолчания, и после этого ВСЕ новые видео
// стартовали без компрессора, ломая автоматическое включение при загрузке по ссылке.
const GLOBAL_DEFAULT_FIELDS = [
  'volume','drStrength','drBoost',
  'ovToggle','ovSize','ovColor','ovOpacity','ovAlign','ovPosX','ovPosY',
  'subsToggle','subsSize','subsColor','subsOpacity'
];
function saveGlobalDefaults(settings){
  try{
    const out = {};
    GLOBAL_DEFAULT_FIELDS.forEach(k => { if (settings[k] !== undefined) out[k] = settings[k]; });
    out.ts = Date.now();
    localStorage.setItem(GLOBAL_DEFAULTS_KEY, JSON.stringify(out));
  } catch(e){ /* не критично */ }
}
function loadGlobalDefaults(){
  try{
    const raw = localStorage.getItem(GLOBAL_DEFAULTS_KEY);
    const parsed = raw ? (JSON.parse(raw) || {}) : {};
    // Записи, сделанные прежней версией, могли содержать drToggle и drSpeed —
    // они больше не глобальные, игнорируем их
    delete parsed.drToggle;
    delete parsed.drSpeed;
    return parsed;
  } catch(e){ return {}; }
}
// Бюджеты хранилища на пространство ключей. Записи прогресса весят десятки байт,
// поэтому 400 записей — это ~50 КБ при квоте localStorage в 5 МБ. Прежний общий
// лимит в 20 записей молча стирал прогресс сериалов длиннее 20 серий (баг H-1).
const STORAGE_LIMITS = {
  [PROGRESS_PREFIX]: 400,          // прогресс: файлы + серии папок + ссылки
  [SETTINGS_PREFIX]: 400,          // пофайловые настройки (в т.ч. интервалы блюра)
  [SUBS_PREFIX]: 40,               // метаданные субтитров (сами реплики теперь в IndexedDB)
  [PLAYLIST_MANIFEST_PREFIX]: 60   // манифесты папок
};
const DEFAULT_STORAGE_LIMIT = 100;
let currentFileKey = null;
let currentFileName = null; 
let originalFileName = null; 
let currentFileIsFolder = false; 
let currentFolderName = null; 
let currentFolderId = null; 
let progressInterval = null;

// Для серий папки в ключ входит folderId: одинаковые файлы, лежащие в двух разных
// папках, больше не делят один прогресс, настройки и субтитры (баг M-5).
function fileKey(file, isFolder, folderId){
  const tail = file.name + ':' + file.size + ':' + (file.lastModified || 0);
  if (!isFolder) return PROGRESS_PREFIX + tail;
  const fid = folderId || currentFolderId;
  return FOLDER_PROGRESS_PREFIX + (fid ? fid + ':' : '') + tail;
}
// Ключ в старом формате (без folderId) — нужен для чтения ранее сохранённых записей
function legacyFolderKey(file){
  return FOLDER_PROGRESS_PREFIX + file.name + ':' + file.size + ':' + (file.lastModified || 0);
}
// Переносит запись прогресса и настроек со старого ключа папки на новый
function migrateLegacyFolderKey(file, newKey){
  try{
    const legacy = legacyFolderKey(file);
    if (legacy === newKey || localStorage.getItem(newKey)) return;
    const raw = localStorage.getItem(legacy);
    if (!raw) return;
    localStorage.setItem(newKey, raw);
    const ls = localStorage.getItem(SETTINGS_PREFIX + stripProgressPrefix(legacy));
    if (ls) localStorage.setItem(settingsKey(newKey), ls);
    localStorage.removeItem(legacy);
    localStorage.removeItem(SETTINGS_PREFIX + stripProgressPrefix(legacy));
  } catch(e){ /* миграция не критична */ }
}
// Ключ ссылки строится по origin + pathname, без query и hash. Подписанные ссылки
// (?token=...&expires=...) меняются при каждом получении, и прежний ключ «весь URL
// целиком» делал одно и то же видео каждый раз новым: прогресс не восстанавливался,
// а мёртвые записи вытесняли живые (баги H-4, M-16).
function normalizeUrlForKey(url){
  try{
    const u = new URL(String(url).trim());
    return u.origin + u.pathname;
  } catch(e){
    return String(url).trim();
  }
}
function urlKey(url){
  return URL_KEY_PREFIX + normalizeUrlForKey(url);
}
// Разовая миграция: если запись сохранена по старому ключу (полный URL), переносим
// её на новый ключ, чтобы у пользователей не пропал уже накопленный прогресс.
function migrateLegacyUrlKey(url){
  try{
    const legacy = URL_KEY_PREFIX + String(url).trim();
    const modern = urlKey(url);
    if (legacy === modern) return;
    if (localStorage.getItem(modern)) { localStorage.removeItem(legacy); return; }
    const raw = localStorage.getItem(legacy);
    if (!raw) return;
    localStorage.setItem(modern, raw);
    const ls = localStorage.getItem(SETTINGS_PREFIX + stripProgressPrefix(legacy));
    if (ls && !localStorage.getItem(settingsKey(modern))) localStorage.setItem(settingsKey(modern), ls);
    localStorage.removeItem(legacy);
    localStorage.removeItem(SETTINGS_PREFIX + stripProgressPrefix(legacy));
  } catch(e){ /* миграция не критична */ }
}
// Срезаем префикс именно с начала строки: String.replace() заменял первое
// вхождение где угодно и ломал ключ для ссылок, содержащих 'lp_progress:' (баг L-11)
function stripProgressPrefix(key){
  return key.startsWith(PROGRESS_PREFIX) ? key.slice(PROGRESS_PREFIX.length) : key;
}
function settingsKey(key){
  return SETTINGS_PREFIX + stripProgressPrefix(key);
}
function subsKey(key){
  return SUBS_PREFIX + stripProgressPrefix(key);
}

// Очистка старых записей localStorage для предотвращения переполнения.
// Полный обход хранилища с JSON.parse каждой записи — дорогая операция, а
// saveProgress вызывается раз в 4 секунды, поэтому чистим не чаще раза в минуту
// на пространство ключей (баг L-10). Форсировать можно параметром force.
const lastCleanupAt = Object.create(null);
const CLEANUP_MIN_INTERVAL_MS = 60000;
function cleanupStorage(prefix, force){
  const now = Date.now();
  if (!force && lastCleanupAt[prefix] && now - lastCleanupAt[prefix] < CLEANUP_MIN_INTERVAL_MS) return;
  lastCleanupAt[prefix] = now;
  cleanupStorageNow(prefix);
}
function cleanupStorageNow(prefix){
  const items = [];
  for (let i = 0; i < localStorage.length; i++){
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)){
      try{
        const data = JSON.parse(localStorage.getItem(key));
        const ts = data && typeof data.ts === 'number' ? data.ts : 0;
        items.push({ key, ts });
      } catch(e){
        // Если не парсится, считаем старым (ts = 0)
        items.push({ key, ts: 0 });
      }
    }
  }
  // Сортируем по времени (новые первые)
  items.sort((a, b) => b.ts - a.ts);
  // Удаляем старые записи, если их больше лимита этого пространства ключей
  const limit = STORAGE_LIMITS[prefix] || DEFAULT_STORAGE_LIMIT;
  if (items.length > limit){
    for (let i = limit; i < items.length; i++){
      try{
        localStorage.removeItem(items[i].key);
      } catch(e){ /* игнорируем ошибки при удалении */ }
    }
  }
}

// Ставится обработчиком 'ended' и снимается при загрузке следующего источника.
// Без него порядок событий pause -> ended -> loadFile воскрешал только что удалённую
// запись досмотренного видео, и оно навсегда оставалось в «Продолжить» на 100 % (баг M-1)
let justEndedKey = null;
function saveProgress(){
  if (!currentFileKey || !video.duration || !isFinite(video.duration)) return;
  if (justEndedKey === currentFileKey) return;
  // Досмотрено до конца — прогресс хранить незачем
  if (video.currentTime >= video.duration - 0.5){
    try{ localStorage.removeItem(currentFileKey); } catch(e){}
    return;
  }
  try{
    // Тут храним только прогресс просмотра, не настройки (settingsKey не трогаем)
    // Убрано условие по времени - теперь прогресс сохраняется при любом просмотре
    const progressData = {
      t: video.currentTime,
      duration: video.duration,
      ts: Date.now(),
      name: originalFileName || currentFileName, // Сохраняем исходное имя файла
      displayName: currentFileName, // Сохраняем отображаемое имя (может быть изменено пользователем)
      // 'folder' — отдельный источник от обычного 'file': видео, открытое как часть
      // папки, и одноимённый одиночный файл никогда не путаются друг с другом.
      source: currentFileKey.startsWith(URL_KEY_PREFIX) ? 'url' : (currentFileIsFolder ? 'folder' : 'file')
    };
    // Для URL-ссылок сохраняем также сам URL
    if (currentFileKey.startsWith(URL_KEY_PREFIX)){
      progressData.url = currentFileKey.slice(URL_KEY_PREFIX.length);
    }
    // Для видео из папки сохраняем имя папки-источника — используется для подписи
    // в списке «Продолжить» (если браузер/способ загрузки позволил его определить)
    if (currentFileIsFolder && currentFolderName){
      progressData.folderName = currentFolderName;
    }
    // Id манифеста плейлиста — по нему «Продолжить» находит остальные серии
    // и открывает не один файл, а весь плейлист целиком.
    if (currentFileIsFolder && currentFolderId){
      progressData.folderId = currentFolderId;
    }
    localStorage.setItem(currentFileKey, JSON.stringify(progressData));
    
    // Удаляем дубликаты для локальных файлов (у url-записей своего "размера/даты" нет,
    // поэтому дедуп по этому принципу для них пропускается — см. removeDuplicateProgress)
    removeDuplicateProgress(currentFileKey);
    
    // Очищаем старые записи (url-, file- и handle-записи теперь в одном пространстве
    // PROGRESS_PREFIX, поэтому один вызов покрывает все типы)
    cleanupStorage(PROGRESS_PREFIX);
    markStorageOk();
  } catch(e){ notifyStorageIssue(); }
}

// Удаляет дубликаты прогресса по размеру и дате изменения файла.
// Сравнение всегда происходит ТОЛЬКО внутри одного пространства ключей
// (папка или одиночный файл) — иначе одиночный файл, случайно совпавший
// по размеру и дате изменения с файлом из папки (или это буквально тот же
// физический файл, открытый один раз отдельно, а другой раз как часть
// папки), стёр бы прогресс "с другой стороны".
function removeDuplicateProgress(currentKey){
  if (!currentKey) return;
  // URL-ключи (PROGRESS_PREFIX + 'url:' + ссылка) не имеют размера/даты файла — сама
  // ссылка тоже содержит двоеточия, так что дедуп по последним двум ':'-сегментам
  // здесь бессмысленен и может дать случайные совпадения. Для url-записей дедуп не нужен:
  // одна и та же ссылка и так перезапишет саму себя по одинаковому ключу.
  if (currentKey.startsWith(URL_KEY_PREFIX)) return;

  const currentIsFolder = currentKey.startsWith(FOLDER_PROGRESS_PREFIX);
  
  // Получаем размер и дату из текущего ключа
  const parts = currentKey.split(':');
  if (parts.length < 3) return;
  
  const size = parts[parts.length - 2];
  const lastModified = parts[parts.length - 1];
  
  // Для серий папки сравниваем только внутри той же папки: раньше открытие серии
  // стирало прогресс одноимённых по размеру/дате файлов из других папок (баг M-4)
  const folderScope = currentIsFolder && currentFolderId ? FOLDER_PROGRESS_PREFIX + currentFolderId + ':' : null;

  // Сначала собираем кандидатов, чтобы не итерировать во время изменения
  const candidates = [];
  for (let i = 0; i < localStorage.length; i++){
    const key = localStorage.key(i);
    if (!key || key === currentKey) continue;
    if (!key.startsWith(PROGRESS_PREFIX)) continue;
    // url-записи пропускаем — у них нет размера/даты, сравнивать их по этому принципу нельзя
    if (key.startsWith(URL_KEY_PREFIX)) continue;
    // Пропускаем записи из "чужого" пространства (папка vs одиночный файл) —
    // они по определению разные записи, даже при совпадении размера/даты
    if (key.startsWith(FOLDER_PROGRESS_PREFIX) !== currentIsFolder) continue;
    if (folderScope && !key.startsWith(folderScope)) continue;
    const keyParts = key.split(':');
    if (keyParts.length >= 3 && keyParts[keyParts.length - 2] === size && keyParts[keyParts.length - 1] === lastModified){
      candidates.push(key);
    }
  }
  if (!candidates.length) return;

  // Удаляем только «осиротевшие» записи — те, для которых в IndexedDB не осталось
  // живого handle. Запись с рабочим handle — это реальный второй файл, а не дубликат
  // переименованного, и стирать её нельзя.
  candidates.forEach(key => {
    idbGet(key)
      .then(handle => { if (!handle) localStorage.removeItem(key); })
      .catch(() => { localStorage.removeItem(key); });
  });
}

// Обновляет только название в записи прогресса (без условий по времени)
function saveTitleToProgress(){
  if (!currentFileKey) return;
  try{
    const raw = localStorage.getItem(currentFileKey);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data){
      // Сохраняем пользовательский заголовок в отдельное поле
      data.displayName = currentFileName;
      data.ts = Date.now(); // Обновляем timestamp
      localStorage.setItem(currentFileKey, JSON.stringify(data));
      
      // Удаляем дубликаты
      removeDuplicateProgress(currentFileKey);
      
      // Очищаем старые записи (url-, file- и handle-записи в одном пространстве PROGRESS_PREFIX)
      cleanupStorage(PROGRESS_PREFIX);
      markStorageOk();
      // Обновляем отображение списка "Продолжить"
      renderResumeList();
    }
  } catch(e){ notifyStorageIssue(); }
}

// (дублирующий saveSettings удалён, актуальная версия — выше, с дебаунсом)

function loadSettings(){
  if (!currentFileKey) {
    return false;
  }

  // --- Разбор и валидация JSON из localStorage ---
  // Ошибка на этом этапе означает, что записи нет или она нечитаема —
  // тогда честно возвращаем false, и вызывающий код применит дефолты.
  let settings;
  try{
    const key = settingsKey(currentFileKey);
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    settings = JSON.parse(raw);
    if (!settings || typeof settings !== 'object') return false;
    
    // Валидация blurRanges
    if (settings.blurRanges) {
      if (!Array.isArray(settings.blurRanges)) {
        settings.blurRanges = [];
      } else {
        settings.blurRanges = settings.blurRanges.filter(range => {
          return range && 
                 typeof range.from === 'number' && 
                 typeof range.to === 'number' && 
                 range.from >= 0 && 
                 range.to > range.from;
        });
      }
    } else {
      settings.blurRanges = [];
    }
    
    // Валидация числовых значений
    const validateNumber = (val, min, max, def) => {
      if (typeof val !== 'number' || isNaN(val)) return def;
      return Math.max(min, Math.min(max, val));
    };
    
    settings.drStrength = validateNumber(settings.drStrength, 0, 100, 70);
    settings.drBoost = validateNumber(settings.drBoost, 100, 500, 100);
    settings.drSpeed = validateNumber(settings.drSpeed, 0.25, 2, 1);
    settings.drBrightness = validateNumber(settings.drBrightness, 50, 200, 100);
    settings.zoomLevel = validateNumber(settings.zoomLevel, 50, 200, 100);
    settings.ovSize = validateNumber(settings.ovSize, 10, 20, OV_DEFAULT_SIZE);
    settings.ovOpacity = validateNumber(settings.ovOpacity, 0, 100, OV_DEFAULT_OPACITY);
    
    // Валидация настроек субтитров
    settings.subsSize = validateNumber(settings.subsSize, 22, 32, 28);
    settings.subsOpacity = validateNumber(settings.subsOpacity, 0, 100, 100);
    
    // Валидация позиций оверлея
    if (settings.ovPosX !== undefined) {
      settings.ovPosX = validateNumber(settings.ovPosX, OV_POS_MIN, OV_POS_MAX, OV_DEFAULT_POS_X);
    }
    if (settings.ovPosY !== undefined) {
      settings.ovPosY = validateNumber(settings.ovPosY, OV_POS_MIN, OV_POS_MAX, OV_DEFAULT_POS_Y);
    }
    
    // Валидация цвета
    if (typeof settings.ovColor !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(settings.ovColor)) {
      settings.ovColor = OV_DEFAULT_COLOR;
    }
    
    // Валидация цветов субтитров
    if (typeof settings.subsColor !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(settings.subsColor)) {
      settings.subsColor = '#fffdeb';
    }
    
    // Валидация boolean значений
    if (typeof settings.drToggle !== 'boolean') settings.drToggle = true;
    if (typeof settings.ovToggle !== 'boolean') settings.ovToggle = true;
    if (typeof settings.subsToggle !== 'boolean') settings.subsToggle = true;
    if (typeof settings.muted !== 'boolean') settings.muted = false;
    if (typeof settings.mirror !== 'boolean') settings.mirror = false;
    
    // Валидация выравнивания
    const validAligns = ['left', 'center', 'right'];
    if (!validAligns.includes(settings.ovAlign)) {
      settings.ovAlign = OV_DEFAULT_ALIGN;
    }
    
    // Валидация громкости: нормализуем безусловно (не только когда поле задано),
    // чтобы video.volume всегда получал корректное число, а не undefined.
    settings.volume = validateNumber(settings.volume, 0, 1, DEFAULT_VOLUME);
  } catch(e){
    /* повреждённая запись — считаем, что настроек нет */
    return false;
  }

  // --- Применение провалидированных настроек к DOM/видео ---
  // settings на этом этапе гарантированно валиден, поэтому даже при сбое
  // применения отдельного поля мы возвращаем true — реальные пользовательские
  // данные распознаны и не должны трактоваться как "настроек нет".
  try{
    // Восстанавливаем настройки
    drToggle.checked = settings.drToggle;
    drStrength.value = settings.drStrength;
    drStrengthVal.textContent = drStrength.value + '%';
    drBoost.value = settings.drBoost;
    drBoostVal.textContent = drBoost.value + '%';
    drSpeed.value = settings.drSpeed;
    drSpeedVal.textContent = formatSpeedLabel(drSpeed.value);
    video.playbackRate = parseFloat(drSpeed.value);
    
    drBrightness.value = settings.drBrightness;
    drBrightnessVal.textContent = drBrightness.value + '%';

    blurRanges = settings.blurRanges;
    renderBlurRanges();
    updateVideoFilter();
    
    zoomLevel = settings.zoomLevel;
    drZoom.value = zoomLevel;
    zoomVal.textContent = zoomLevel + '%';
    mirrorEnabled = settings.mirror;
    mirrorToggle.checked = mirrorEnabled;
    applyVideoTransform();
    
    ovToggle.checked = settings.ovToggle;
    ovSize.value = settings.ovSize;
    ovSizeVal.textContent = ovSize.value + 'px';
    ovColor.value = settings.ovColor;
    ovOpacity.value = settings.ovOpacity;
    ovOpacityVal.textContent = ovOpacity.value + '%';
    setOverlayAlign(settings.ovAlign);

    if (settings.ovPosX !== undefined && settings.ovPosY !== undefined){
      setOverlayPosition(settings.ovPosX, settings.ovPosY);
    } else if (settings.selectedPosition){
      // конвертация старых настроек с позицией по углам
      const cornerMap = { 'top-left': [OV_POS_MIN, OV_POS_MIN], 'top-right': [OV_POS_MAX, OV_POS_MIN], 'bottom-left': [OV_POS_MIN, OV_POS_MAX], 'bottom-right': [OV_POS_MAX, OV_POS_MAX] };
      const [x, y] = cornerMap[settings.selectedPosition] || [OV_DEFAULT_POS_X, OV_DEFAULT_POS_Y];
      setOverlayPosition(x, y);
    } else {
      setOverlayPosition(OV_DEFAULT_POS_X, OV_DEFAULT_POS_Y);
    }
    
    titleInput.value = settings.titleInput !== undefined ? settings.titleInput : currentFileName;
    ovTitle.textContent = titleInput.value;
    
    applyOverlaySettings();
    
    // Восстанавливаем настройки субтитров
    subsToggle.checked = settings.subsToggle !== undefined ? settings.subsToggle : true;
    subtitles.style.display = subsToggle.checked ? 'block' : 'none';
    
    subsSize.value = settings.subsSize !== undefined ? settings.subsSize : 28;
    subsSizeVal.textContent = subsSize.value + 'px';
    
    subsColor.value = settings.subsColor !== undefined ? settings.subsColor : '#fffdeb';
    subsOpacity.value = settings.subsOpacity !== undefined ? settings.subsOpacity : 100;
    subsOpacityVal.textContent = subsOpacity.value + '%';
    
    applySubtitlesStyle();
    
    // Восстанавливаем содержимое субтитров из отдельного ключа
    const subsRaw = localStorage.getItem(subsKey(currentFileKey));
    if (subsRaw) {
      try {
        const subsData = JSON.parse(subsRaw);
        if (subsData.content){
          // Записи старого формата (реплики лежали прямо в localStorage) читаем
          // как раньше и переносим в IndexedDB при первой возможности — см. M-10
          subtitlesData = JSON.parse(subsData.content);
          if (typeof resetSubtitleRenderState === "function") resetSubtitleRenderState();
          savedSubsContent = subsData.content;
          const migrateKey = subsKey(currentFileKey);
          const migratePayload = subsData.content;
          idbSet(SUBS_PREFIX + 'data:' + stripProgressPrefix(currentFileKey), migratePayload)
            .then(() => {
              try{
                localStorage.setItem(migrateKey, JSON.stringify({ fileName: subsData.fileName, ts: subsData.ts || Date.now(), cues: JSON.parse(migratePayload).length, storage: 'idb' }));
              } catch(e){}
            })
            .catch(() => {});
        } else {
          // Новый формат: реплики в IndexedDB, здесь только метаданные
          const keyForCues = SUBS_PREFIX + 'data:' + stripProgressPrefix(currentFileKey);
          const keyAtLoad = currentFileKey;
          subtitlesData = [];
          if (typeof resetSubtitleRenderState === "function") resetSubtitleRenderState();
          idbGet(keyForCues).then(raw => {
            if (!raw || keyAtLoad !== currentFileKey) return;
            try{
              subtitlesData = JSON.parse(raw);
              if (typeof resetSubtitleRenderState === "function") resetSubtitleRenderState();
              savedSubsContent = raw;
              updateSubtitles();
            } catch(e){}
          }).catch(() => {});
        }
        isSubtitlesLoaded = true;
        if (subsData.fileName) {
          setSubsFileNameDisplay(subsData.fileName);
        }
        // Показываем кнопку удаления если есть загруженные субтитры
        subsRemoveBtn.style.display = 'flex';
      } catch(e) {
        subtitlesData = [];
        if (typeof resetSubtitleRenderState === "function") resetSubtitleRenderState();
        savedSubsContent = null;
        isSubtitlesLoaded = false;
      }
    } else {
      savedSubsContent = null;
      isSubtitlesLoaded = false;
      subtitlesData = [];
      if (typeof resetSubtitleRenderState === "function") resetSubtitleRenderState();
      subtitles.innerHTML = '';
      setSubsFileNameDisplay('Файл не выбран');
      subsFile.value = '';
      subsRemoveBtn.style.display = 'none';
    }
    
    // Инициализация стилей субтитров при загрузке (если нет сохраненных настроек)
    if (settings.subsToggle === undefined) {
      subsToggle.checked = true;
      subtitles.style.display = 'block';
      applySubtitlesStyle();
    }
    
    // Восстанавливаем громкость
    video.volume = settings.volume;
    if (video.volume > 0) lastVolume = video.volume;
    
    // Восстанавливаем состояние мута
    video.muted = settings.muted;
    
    // Шкала громкости должна показывать 0 если звук замучен
    volumeRange.value = video.muted ? 0 : video.volume;
    updateVolumeIcon();

    // Обновляем аудио-граф
    drEnabled = drToggle.checked;
    if (audioCtx){
      if (boostGain){
        boostGain.gain.setTargetAtTime(drBoost.value / 100, audioCtx.currentTime, 0.01);
      }
      updateCompressor();
      connectGraph();
    }
    
    return true;
  } catch(e){
    // Что-то не применилось к DOM/видео, но сами настройки были валидны и
    // разобраны успешно — не сбрасываем их на дефолт из-за частного сбоя применения.
    console.warn('Настройки применены частично:', e);
    return true;
  }
}

function restoreProgress(){
  if (!currentFileKey) return;
  try{
    const raw = localStorage.getItem(currentFileKey);
    if (!raw) return;
    const data = JSON.parse(raw);
    
    // Адаптивные пороги для коротких видео
    const minThreshold = Math.min(3, video.duration * 0.1); // максимум 3 сек или 10% от длительности
    const maxThreshold = Math.min(5, video.duration * 0.2); // максимум 5 сек или 20% от длительности
    
    if (data && data.t > minThreshold && data.t < video.duration - maxThreshold){
      video.currentTime = data.t;
      // Сразу применяем блюр после восстановления времени
      updateVideoFilter();
    }
    // Восстанавливаем сохранённое название шапки плеера (fnameEl).
    // titleInput/ovTitle сюда не пишем — это отдельная настройка (текст
    // оверлея), она восстанавливается в loadSettings() и не должна
    // затираться названием из записи прогресса.
    if (data && data.displayName) {
      // Используем пользовательский заголовок как есть
      currentFileName = data.displayName;
      fnameEl.textContent = data.displayName;
    } else if (data && data.name) {
      // Если пользовательского заголовка нет, используем оригинальное имя с обрезкой расширения
      const nameWithoutExt = niceTitleFromFilename(data.name);
      currentFileName = nameWithoutExt;
      fnameEl.textContent = nameWithoutExt;
    }
  } catch(e){ /* повреждённая запись — игнорируем */ }
}

function startProgressTracking(){
  clearInterval(progressInterval);
  // Тут сохраняем только прогресс просмотра. Настройки сохраняются собственными
  // input/change-обработчиками (см. saveSettings/saveSettings) и досрочно
  // дозаписываются в flushPendingSave() при уходе со страницы, так что дублировать
  // их сохранение в этом интервале не требуется.
  progressInterval = setInterval(() => {
    saveProgress();
  }, 4000);
}
function stopProgressTracking(){
  clearInterval(progressInterval);
  saveProgress();
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeHtmlAttr(str){
  // Экранируем символы для использования в HTML атрибутах
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function updatePanelVisibility(){
  resumePanel.classList.toggle('show', resumeList.children.length > 0);
}

function renderResumeList(){
  const items = [];
  for (let i = 0; i < localStorage.length; i++){
    const key = localStorage.key(i);
    // PROGRESS_PREFIX покрывает все записи: обычные файлы, handle-файлы и url-ссылки
    if (!key || !key.startsWith(PROGRESS_PREFIX)) continue;
    try{
      const data = JSON.parse(localStorage.getItem(key));
      if (data && typeof data.t === 'number'){
        items.push(Object.assign({ key }, data));
      }
    } catch(e){ /* пропускаем битую запись */ }
  }
  // Самая свежая запись (независимо от типа — url или файл) естественным образом
  // оказывается первой, так что отдельный "верхний" блок больше не нужен —
  // все записи отображаются одним и тем же способом.
  items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const shown = items.slice(0, 3);

  resumeList.innerHTML = shown.map(item => {
    // Используем displayName если есть (пользовательский заголовок), иначе из name обрезаем расширение
    const displayName = item.displayName || (item.name ? niceTitleFromFilename(item.name) : 'Файл');
    // Записи из папки живут в отдельном пространстве ключей (FOLDER_PROGRESS_PREFIX) —
    // помечаем их отдельным бейджем, чтобы не путать с обычным одиночным файлом,
    // даже если у них случайно совпадёт имя.
    const isFolderItem = !item.url && item.key.startsWith(FOLDER_PROGRESS_PREFIX);
    const folderLabel = isFolderItem
      ? (item.folderName ? `Из папки «${escapeHtml(item.folderName)}»` : 'Из папки')
      : '';
    let typeBadge;
    if (item.url) {
      typeBadge = '<span class="ri-type-badge ri-type-url">Ссылка</span>';
    } else if (isFolderItem) {
      typeBadge = `<span class="ri-type-badge ri-type-folder">${folderLabel}</span>`;
    } else {
      typeBadge = '<span class="ri-type-badge ri-type-file">Файл</span>';
    }
    return `
    <div class="resume-item">
      <div class="ri-info">
        <div class="ri-name">${escapeHtml(displayName)}</div>
        <div class="ri-time">
          ${formatTime(item.t)}${item.duration ? ' / ' + formatTime(item.duration) : ''}
          <span class="ri-separator">·</span>
          ${typeBadge}
        </div>
      </div>
      <div class="ri-actions">
        ${item.url
          ? `<button type="button" class="ri-continue" data-url="${escapeHtmlAttr(item.url)}">Продолжить</button>`
          : `<button type="button" class="ri-continue" data-key="${escapeHtmlAttr(item.key)}">Продолжить</button>`}
        <button type="button" class="ri-clear" data-key="${escapeHtmlAttr(item.key)}">✕</button>
      </div>
    </div>
  `;
  }).join('');
  updatePanelVisibility();
}

resumeList.addEventListener('click', async (e) => {
  const btn = e.target.closest('.ri-clear');
  if (btn) {
    const key = btn.dataset.key;
    try{
      // Удаляем прогресс
      localStorage.removeItem(key);
      // Удаляем связанные настройки
      localStorage.removeItem(settingsKey(key));
      // Удаляем связанные субтитры
      localStorage.removeItem(subsKey(key));
    } catch(err){}
    try{ await idbDelete(key); } catch(err){}
    try{ await idbDelete(SUBS_PREFIX + 'data:' + stripProgressPrefix(key)); } catch(err){}
    renderResumeList();
    return;
  }
  
  const continueBtn = e.target.closest('.ri-continue');
  if (!continueBtn) return;

  // Продолжить видео по ссылке (m3u8/mp4-URL)
  if (continueBtn.dataset.url) {
    const url = continueBtn.dataset.url;
    urlInput.value = url;
    loadUrl(url);
    return;
  }

  if (continueBtn.dataset.key) {
    if (!FS_ACCESS_SUPPORTED){
      showErrMsg('Ваш браузер не поддерживает открытие файла по сохранённой ссылке. Выберите файл заново через «Выберите файл»');
      return;
    }
    // Кнопка "Продолжить" для обычных файлов - используем сохранённый handle
    // именно ЭТОЙ записи (у каждого файла свой ключ в IndexedDB), а не
    // общий "последний открытый" — иначе при нескольких файлах в списке
    // "Продолжить" на не самом последнем открывало бы совсем другое видео.
    const key = continueBtn.dataset.key;
    // Восстанавливаем источник (папка/одиночный файл), сохранённое имя папки
    // и id манифеста плейлиста — чтобы после повторного открытия прогресс снова
    // лёг в ТО ЖЕ пространство ключей, а «Продолжить» подтянуло не только этот
    // эпизод, но и весь плейлист целиком (см. tryRestoreFolderPlaylist).
    const isFolderKey = key.startsWith(FOLDER_PROGRESS_PREFIX);
    let savedFolderName = null;
    let savedFolderId = null;
    try{
      const savedRaw = localStorage.getItem(key);
      if (savedRaw){
        const savedData = JSON.parse(savedRaw) || {};
        savedFolderName = savedData.folderName || null;
        savedFolderId = savedData.folderId || null;
      }
    } catch(err){}
    const loadMeta = isFolderKey ? { isFolder: true, folderName: savedFolderName, folderId: savedFolderId } : undefined;
    try{
      const handle = await idbGet(key);
      if (!handle){
        // Если handle не сохранён, показываем диалог выбора файла
        const [newHandle] = await window.showOpenFilePicker({
          types: [{ description: 'Видео', accept: { 'video/*': ['.mp4','.webm','.mov'] } }],
          multiple: false
        });
        const file = await newHandle.getFile();

        // Пользователь мог выбрать не тот файл. Раньше его handle всё равно
        // записывался под ключ этой записи, и «Продолжить» навсегда начинало
        // открывать чужое видео с чужим таймингом (баг H-5). Сверяем и, если
        // файл другой, открываем его как новый источник, ничего не перезаписывая.
        const expectedKey = isFolderKey
          ? fileKey(file, true, savedFolderId)
          : fileKey(file, false);
        const legacyMatch = isFolderKey && legacyFolderKey(file) === key;
        if (expectedKey !== key && !legacyMatch){
          showErrMsg('Выбран другой файл — он откроется как новое видео. Сохранённый прогресс относится к другому файлу');
          loadFile(file, newHandle, isFolderKey ? { isFolder: true, folderName: savedFolderName, folderId: savedFolderId } : undefined);
          return;
        }

        // Сохраняем новый handle под ключом именно этой записи
        try{ await idbSet(key, newHandle); } catch(err){}
        
        // Загружаем файл (прогресс восстанавливается в loadedmetadata через restoreProgress)
        if (isFolderKey && savedFolderId){
          await tryRestoreFolderPlaylist(savedFolderId, file, newHandle, loadMeta);
        } else {
          loadFile(file, newHandle, loadMeta);
        }
        return;
      }
      
      // Проверяем разрешение
      let perm = await handle.queryPermission({ mode: 'read' });
      if (perm !== 'granted'){
        perm = await handle.requestPermission({ mode: 'read' });
      }
      if (perm !== 'granted'){
        showErrMsg('Доступ к файлу не разрешён');
        return;
      }
      
      const file = await handle.getFile();
      
      // Загружаем файл (прогресс восстанавливается в loadedmetadata через restoreProgress).
      // Для записи из папки пытаемся восстановить весь плейлист целиком.
      if (isFolderKey && savedFolderId){
        await tryRestoreFolderPlaylist(savedFolderId, file, handle, loadMeta);
      } else {
        loadFile(file, handle, loadMeta);
      }
    } catch(err){
      showErrMsg('Не удалось открыть сохранённый файл – возможно, он был перемещён, переименован или удалён');
    }
  }
});

// Пытается восстановить ВЕСЬ плейлист папки по её манифесту (при "Продолжить"),
// а не открыть только один просмотренный эпизод. activeFile/activeHandle — уже
// открытый (только что выбранный или взятый из IndexedDB) файл, ради которого
// пользователь нажал "Продолжить"; остальные эпизоды подтягиваются по своим
// сохранённым хэндлам. Если манифеста нет или восстановить больше одного файла
// не удалось — просто открывает activeFile как раньше (не хуже прежнего поведения).
async function tryRestoreFolderPlaylist(folderId, activeFile, activeHandle, loadMeta){
  let manifest = null;
  try{
    const raw = localStorage.getItem(PLAYLIST_MANIFEST_PREFIX + folderId);
    if (raw) manifest = JSON.parse(raw);
  } catch(err){ manifest = null; }

  if (!manifest || !Array.isArray(manifest.files) || manifest.files.length < 2){
    loadFile(activeFile, activeHandle, loadMeta);
    return;
  }

  const resolved = [];
  let activeIndex = -1;
  for (const meta of manifest.files){
    const isActive = meta.name === activeFile.name
      && meta.size === activeFile.size
      && (meta.lastModified || 0) === (activeFile.lastModified || 0);
    if (isActive){
      activeIndex = resolved.length;
      resolved.push({ file: activeFile, handle: activeHandle || null });
      continue;
    }
    // Ключ серии теперь содержит folderId (см. M-5), но у пользователей, обновившихся
    // с прежней версии, handle может лежать под старым ключом — пробуем оба.
    const key = FOLDER_PROGRESS_PREFIX + folderId + ':' + meta.name + ':' + meta.size + ':' + (meta.lastModified || 0);
    const legacyKey = FOLDER_PROGRESS_PREFIX + meta.name + ':' + meta.size + ':' + (meta.lastModified || 0);
    try{
      let h = await idbGet(key);
      if (!h){
        h = await idbGet(legacyKey);
        // Найденный старый handle сразу переносим на новый ключ
        if (h) idbSet(key, h).catch(() => {});
      }
      if (!h) continue; // хэндла для этой серии нет — пропускаем, покажем остальные
      let perm = await h.queryPermission({ mode: 'read' });
      if (perm !== 'granted') perm = await h.requestPermission({ mode: 'read' });
      if (perm !== 'granted') continue;
      const f = await h.getFile();
      resolved.push({ file: f, handle: h });
    } catch(err){ /* недоступный файл — пропускаем, остальной плейлист всё равно покажем */ }
  }

  if (activeIndex === -1 || resolved.length < 2){
    // Восстановить остальные серии не вышло — открываем как одиночное видео
    loadFile(activeFile, activeHandle, loadMeta);
    return;
  }

  playlistFiles = resolved;
  playlistIndex = activeIndex;
  playlistFolderName = manifest.folderName || (loadMeta && loadMeta.folderName) || null;
  playlistFolderId = folderId;
  playlistBtn.style.display = playlistFiles.length > 1 ? '' : 'none';
  renderPlaylist();
  updatePlaylistNavButtons();
  loadFile(activeFile, activeHandle, { isFolder: true, folderName: playlistFolderName, folderId });
}

renderResumeList();

function flushPendingSave(){
  saveProgress();
  // Всегда сохраняем настройки при уходе со страницы, чтобы гарантированно
  // сохранить последние изменения даже если они были сделаны менее 150 мс назад
  saveSettingsImmediate();
}
window.addEventListener('beforeunload', flushPendingSave);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushPendingSave(); });
