// --- запоминание тайминга просмотра (localStorage) ---
const PROGRESS_PREFIX = 'lp_progress:';
const URL_KEY_PREFIX = PROGRESS_PREFIX + 'url:';
const FOLDER_PROGRESS_PREFIX = PROGRESS_PREFIX + 'folder:';
const PLAYLIST_MANIFEST_PREFIX = 'lp_playlist:';
// Handle самой папки, по нему плейлист восстанавливается одним запросом доступа вместо запроса на каждый файл
const DIR_HANDLE_PREFIX = 'lp_dir:';
const SETTINGS_PREFIX = 'lp_settings:';
const SUBS_PREFIX = 'lp_subs:';
const VOLUME_KEY = 'lp_volume';
// Ограничиваем объём записей прогресса с учётом лимита localStorage
const STORAGE_LIMITS = {
  [PROGRESS_PREFIX]: 400,          // прогресс: файлы + серии папок + ссылки
  [SETTINGS_PREFIX]: 400,          // пофайловые настройки (в т.ч. интервалы блюра)
  [SUBS_PREFIX]: 40,               // метаданные субтитров (сами реплики теперь в IndexedDB)
  [PLAYLIST_MANIFEST_PREFIX]: 60   // манифесты папок
};
const DEFAULT_STORAGE_LIMIT = 100;
let currentFileKey = null;
// Ключ источника, для которого уже отработал restoreProgress. До этого позицию не пишем:
// плеер уже играет с нуля, и запись затёрла бы сохранённое место раньше, чем его прочитают
let progressRestoredKey = null;
let currentSourceUrl = null; // ссылка текущего источника, нужна чтобы найти файл субтитров рядом с плейлистом
let currentFileName = null;
let originalFileName = null; 
let currentFileIsFolder = false; 
let currentFolderName = null; 
let currentFolderId = null; 
let progressInterval = null;

// Для серий папки учитываем folderId, чтобы файлы из разных папок имели отдельные настройки и прогресс
function fileKey(file, isFolder, folderId){
  const tail = file.name + ':' + file.size + ':' + (file.lastModified || 0);
  if (!isFolder) return PROGRESS_PREFIX + tail;
  const fid = folderId || currentFolderId;
  return FOLDER_PROGRESS_PREFIX + (fid ? fid + ':' : '') + tail;
}
// Ключ в старом формате (без folderId), нужен для чтения ранее сохранённых записей
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
// Формируем ключ ссылки по origin и pathname, игнорируя query и hash для сохранения прогресса между ссылками
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
// её на новый ключ, чтобы у пользователей не пропал уже накопленный прогресс
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
// Удаляем префикс только в начале строки, не затрагивая его в остальной части ключа
function stripProgressPrefix(key){
  return key.startsWith(PROGRESS_PREFIX) ? key.slice(PROGRESS_PREFIX.length) : key;
}
function settingsKey(key){
  return SETTINGS_PREFIX + stripProgressPrefix(key);
}
function subsKey(key){
  return SUBS_PREFIX + stripProgressPrefix(key);
}

// Возвращает пользовательское название источника, если оно отличается от автоматического
function storedCustomTitle(key, autoName){
  if (!key) return null;
  try{
    const s = JSON.parse(localStorage.getItem(settingsKey(key)) || 'null');
    if (s && typeof s.titleInput === 'string' && s.titleInput && s.titleInput !== autoName) return s.titleInput;
    const p = JSON.parse(localStorage.getItem(key) || 'null');
    if (p && typeof p.displayName === 'string' && p.displayName && p.displayName !== autoName) return p.displayName;
  } catch(e){ /* повреждённая запись, считаем, что своего названия нет */ }
  return null;
}

// Автоматическое имя из прошлого открытия не должно перебивать название серии или title из адреса, своё имя зрителя остаётся
function adoptTitleForStoredSettings(key, autoName, title){
  if (!key || storedCustomTitle(key, autoName)) return;
  // Имя лежит и в настройках, и в записи прогресса, откуда его берёт восстановление позиции
  for (const [storeKey, field] of [[settingsKey(key), 'titleInput'], [key, 'displayName']]){
    try{
      const s = JSON.parse(localStorage.getItem(storeKey) || 'null');
      if (s && typeof s === 'object' && s[field] !== title){
        s[field] = title;
        localStorage.setItem(storeKey, JSON.stringify(s));
      }
    } catch(e){ /* повреждённая запись, имя подставится как есть */ }
  }
}

const PROGRESS_DURATION_TOLERANCE = 2;
// Ключ ссылки не учитывает query, поэтому разные видео одного пути могут совпасть,
// сверяем длительность, прежде чем применять найденную запись
function isForeignRecord(savedDuration){
  if (!currentFileKey || !currentFileKey.startsWith(URL_KEY_PREFIX)) return false;
  if (typeof savedDuration !== 'number' || !isFinite(savedDuration)) return false;
  if (!isDurationUsable()) return false;
  return Math.abs(savedDuration - video.duration) > PROGRESS_DURATION_TOLERANCE;
}

// Настройки применяются раньше метаданных, поэтому чужие откатываем уже после них
function dropForeignSettings(){
  if (!currentFileKey) return;
  try{
    const raw = localStorage.getItem(settingsKey(currentFileKey));
    const saved = raw ? JSON.parse(raw) : null;
    if (saved && isForeignRecord(saved.duration)) applyDefaultSettingsForNewSource();
  } catch(e){ /* повреждённая запись, оставляем как есть */ }
}

// Периодически очищаем старые записи localStorage, чтобы не допустить переполнения
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
      const key = items[i].key;
      try{
        localStorage.removeItem(key);
      } catch(e){ /* игнорируем ошибки при удалении */ }
      // Синхронно подчищаем связанные записи в IndexedDB, иначе хендлы файлов
      // и данные субтитров накапливаются там без предела
      if (prefix === PROGRESS_PREFIX){
        try{
          localStorage.removeItem(settingsKey(key));
          localStorage.removeItem(subsKey(key));
        } catch(e){}
        idbDelete(key).catch(() => {});
        idbDelete(SUBS_PREFIX + 'data:' + stripProgressPrefix(key)).catch(() => {});
      } else if (prefix === SUBS_PREFIX){
        idbDelete(SUBS_PREFIX + 'data:' + key.slice(SUBS_PREFIX.length)).catch(() => {});
      }
    }
  }
}

// Отметка «досмотрено» вместо удаления записи: по ней строятся значки в плейлисте
// и выбор серии при повторном открытии папки
function markProgressCompleted(){
  if (!currentFileKey || progressRestoredKey !== currentFileKey) return;
  try{
    const raw = localStorage.getItem(currentFileKey);
    const data = (raw && JSON.parse(raw)) || {};
    data.completed = true;
    data.t = 0;
    data.ts = Date.now();
    if (isDurationUsable()) data.duration = video.duration;
    data.name = data.name || originalFileName || currentFileName;
    data.displayName = data.displayName || currentFileName;
    data.source = currentFileKey.startsWith(URL_KEY_PREFIX) ? 'url' : (currentFileIsFolder ? 'folder' : 'file');
    if (currentFileKey.startsWith(URL_KEY_PREFIX)) data.url = currentFileKey.slice(URL_KEY_PREFIX.length);
    if (currentFileIsFolder && currentFolderName) data.folderName = currentFolderName;
    if (currentFileIsFolder && currentFolderId) data.folderId = currentFolderId;
    localStorage.setItem(currentFileKey, JSON.stringify(data));
    cleanupStorage(PROGRESS_PREFIX);
    markStorageOk();
  } catch(e){ notifyStorageIssue(); }
}

function saveProgress(){
  if (!currentFileKey || progressRestoredKey !== currentFileKey) return;
  if (!video.duration || !isFinite(video.duration)) return;
  if (video.currentTime >= video.duration - 0.5){
    markProgressCompleted();
    return;
  }
  try{
    // Сохраняем только данные прогресса просмотра.
    const progressData = {
      t: video.currentTime,
      completed: false,
      duration: video.duration,
      ts: Date.now(),
      name: originalFileName || currentFileName, // Исходное имя файла.
      displayName: currentFileName, // Отображаемое имя файла.
      // Разделяем локальные файлы, файлы из папки и URL.
      source: currentFileKey.startsWith(URL_KEY_PREFIX) ? 'url' : (currentFileIsFolder ? 'folder' : 'file')
    };
    // Сохраняем URL для источников, открытых по ссылке.
    if (currentFileKey.startsWith(URL_KEY_PREFIX)){
      progressData.url = currentFileKey.slice(URL_KEY_PREFIX.length);
      // У серии запоминаем и манифест, чтобы "Продолжить" вернуло весь сериал, а не одну серию
      if (playlistSeriesUrl) progressData.seriesUrl = playlistSeriesUrl;
    }
    // Сохраняем имя папки для отображения в списке прогресса.
    if (currentFileIsFolder && currentFolderName){
      progressData.folderName = currentFolderName;
    }
    // Сохраняем ID плейлиста для восстановления всей папки.
    if (currentFileIsFolder && currentFolderId){
      progressData.folderId = currentFolderId;
    }
    localStorage.setItem(currentFileKey, JSON.stringify(progressData));
    // Дедупликация выполняется один раз при открытии файла (loadFile), а не на каждом тике
    // Очищаем старые записи прогресса.
    cleanupStorage(PROGRESS_PREFIX);
    markStorageOk();
  } catch(e){ notifyStorageIssue(); }
}

// Удаляет дубликаты прогресса по размеру и дате изменения файла внутри одного пространства ключей
function removeDuplicateProgress(currentKey){
  if (!currentKey) return;
  // Для URL-записей дедупликация не требуется: одинаковая ссылка использует один и тот же ключ
  if (currentKey.startsWith(URL_KEY_PREFIX)) return;

  const currentIsFolder = currentKey.startsWith(FOLDER_PROGRESS_PREFIX);
  
  // Получаем размер и дату из текущего ключа
  const parts = currentKey.split(':');
  if (parts.length < 3) return;
  
  const size = parts[parts.length - 2];
  const lastModified = parts[parts.length - 1];
  
  // Для серий папки выполняем дедупликацию только внутри одной папки
  const folderScope = currentIsFolder && currentFolderId ? FOLDER_PROGRESS_PREFIX + currentFolderId + ':' : null;

  // Сначала собираем кандидатов, чтобы не итерировать во время изменения
  const candidates = [];
  for (let i = 0; i < localStorage.length; i++){
    const key = localStorage.key(i);
    if (!key || key === currentKey) continue;
    if (!key.startsWith(PROGRESS_PREFIX)) continue;
    // url-записи пропускаем, у них нет размера/даты, сравнивать их по этому принципу нельзя
    if (key.startsWith(URL_KEY_PREFIX)) continue;
    // Пропускаем записи из "чужого" пространства (папка vs одиночный файл),
    // они по определению разные записи, даже при совпадении размера/даты
    if (key.startsWith(FOLDER_PROGRESS_PREFIX) !== currentIsFolder) continue;
    if (folderScope && !key.startsWith(folderScope)) continue;
    const keyParts = key.split(':');
    if (keyParts.length >= 3 && keyParts[keyParts.length - 2] === size && keyParts[keyParts.length - 1] === lastModified){
      candidates.push(key);
    }
  }
  if (!candidates.length) return;

  // Имя стоит в ключе перед двумя последними сегментами (размер и дата)
  const currentName = currentKey.slice(0, currentKey.length - (':' + size + ':' + lastModified).length).split(':').pop();

  // Удаляем дубль, только если это доказуемо тот же файл: совпало имя или handle ведёт на текущий файл
  candidates.forEach(key => {
    const keyName = key.slice(0, key.length - (':' + size + ':' + lastModified).length).split(':').pop();
    if (keyName === currentName){
      try { localStorage.removeItem(key); } catch(e){}
      return;
    }
    idbGet(key)
      .then(async handle => {
        if (!handle) return; // нет доказательств, запись не трогаем
        const f = await handle.getFile();
        const sameFile = f && f.name === currentName
          && String(f.size) === size
          && String(f.lastModified || 0) === lastModified;
        if (sameFile) localStorage.removeItem(key); // та же запись под прежним именем
      })
      .catch(() => { /* файл недоступен или нет разрешения, оставляем запись */ });
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

function loadSettings(){
  if (!currentFileKey) {
    return false;
  }

  // Проверяем и разбираем JSON из localStorage; при ошибке возвращаем false для применения значений по умолчанию
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
    
    settings.drStrength = validateNumber(settings.drStrength, 0, 100, 50);
    settings.drBoost = validateNumber(settings.drBoost, 100, 500, 100);
    settings.drSpeed = validateNumber(settings.drSpeed, 0.25, 2, 1);
    settings.drBrightness = validateNumber(settings.drBrightness, 50, 200, 100);
    settings.zoomLevel = validateNumber(settings.zoomLevel, 50, 200, 100);
    settings.ovSize = validateNumber(settings.ovSize, 10, 20, OV_DEFAULT_SIZE);
    settings.ovOpacity = validateNumber(settings.ovOpacity, 0, 100, OV_DEFAULT_OPACITY);
    settings.ovBgOpacity = validateNumber(settings.ovBgOpacity, 0, 100, OV_DEFAULT_BG_OPACITY);
    settings.ovShadow = validateNumber(settings.ovShadow, 0, 100, OV_DEFAULT_SHADOW);
    
    // Валидация настроек субтитров
    // Прежний размер хранился в пикселях, такие записи переводим на новый ползунок в процентах
    if (typeof settings.subsSize === 'number' && settings.subsSize > 12) settings.subsSize = SUBS_SIZE_DEFAULT;
    settings.subsSize = validateNumber(settings.subsSize, 3, 6, SUBS_SIZE_DEFAULT);
    // Прежний отступ считался от всей области плеера, новый от кадра, значения совместимы по диапазону
    settings.subsPosition = validateNumber(settings.subsPosition, 0, 20, SUBS_POSITION_DEFAULT);
    
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
  } catch(e){
    /* повреждённая запись, считаем, что настроек нет */
    return false;
  }

  // Применяем проверенные настройки к DOM и видео
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
    blurFileApplied = settings.blurFileApplied === true;
    blurFileClampPending = false;
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
    ovBgOpacity.value = settings.ovBgOpacity;
    ovBgOpacityVal.textContent = ovBgOpacity.value + '%';
    ovShadow.value = settings.ovShadow;
    ovShadowVal.textContent = ovShadow.value + '%';
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
    
    titleInput.value = String(settings.titleInput !== undefined ? settings.titleInput : currentFileName).slice(0, MAX_TITLE_LEN);
    ovTitle.textContent = titleInput.value;
    // Шапка и запись в истории берут имя отсюда, иначе оверлей помнит своё, а они автоматическое
    currentFileName = titleInput.value;
    
    applyOverlaySettings();
    
    // Восстанавливаем настройки субтитров
    subsToggle.checked = settings.subsToggle !== undefined ? settings.subsToggle : true;
    subtitles.style.display = subsToggle.checked ? 'block' : 'none';
    
    subsSize.value = settings.subsSize !== undefined ? settings.subsSize : SUBS_SIZE_DEFAULT;
    subsSizeVal.textContent = subsSize.value + '%';

    subsPosition.value = settings.subsPosition !== undefined ? settings.subsPosition : SUBS_POSITION_DEFAULT;
    subsPositionVal.textContent = subsPosition.value + '%';

    applySubtitlesStyle();
    
    // Восстанавливаем содержимое субтитров из отдельного ключа
    const subsRaw = localStorage.getItem(subsKey(currentFileKey));
    if (subsRaw) {
      try {
        const subsData = JSON.parse(subsRaw);
        if (subsData.content){
          // Поддерживаем старый формат субтитров и переносим их в IndexedDB
          subtitlesData = JSON.parse(subsData.content);
          resetSubtitleRenderState();
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
          resetSubtitleRenderState();
          idbGet(keyForCues).then(raw => {
            if (!raw || keyAtLoad !== currentFileKey) return;
            try{
              subtitlesData = JSON.parse(raw);
              resetSubtitleRenderState();
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
        resetSubtitleRenderState();
        savedSubsContent = null;
        isSubtitlesLoaded = false;
      }
    } else {
      savedSubsContent = null;
      isSubtitlesLoaded = false;
      subtitlesData = [];
      resetSubtitleRenderState();
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
    
    applyGlobalVolume();

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
    // Не сбрасываем валидные настройки на значения по умолчанию при ошибке применения
    console.warn('Настройки применены частично:', e);
    return true;
  }
}

// Позиция в первых секундах не считается просмотром: её не восстанавливаем, не показываем карточкой и не считаем серию начатой
function isProgressStarted(t, duration){
  if (typeof t !== 'number') return false;
  const minT = typeof duration === 'number' && duration > 0 ? Math.min(3, duration * 0.1) : 0;
  return t > minT;
}

function restoreProgress(){
  if (!currentFileKey) return;
  progressRestoredKey = currentFileKey;
  try{
    const raw = localStorage.getItem(currentFileKey);
    if (!raw) return;
    const data = JSON.parse(raw);

    if (data && isForeignRecord(data.duration)){
      try{
        localStorage.removeItem(currentFileKey);
        localStorage.removeItem(settingsKey(currentFileKey));
      } catch(e){}
      return;
    }

    // Адаптивный порог конца для коротких видео: максимум 5 сек или 20% от длительности
    const maxThreshold = Math.min(5, video.duration * 0.2);

    if (data && isProgressStarted(data.t, video.duration) && data.t < video.duration - maxThreshold){
      video.currentTime = data.t;
      // Сразу применяем блюр после восстановления времени
      updateVideoFilter();
    }
    // Восстанавливаем сохранённое название шапки плеера, не затрагивая текст оверлея
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
  } catch(e){ /* повреждённая запись, игнорируем */ }
}

function startProgressTracking(){
  clearInterval(progressInterval);
  // Здесь сохраняем только прогресс просмотра, настройки сохраняются отдельно
  progressInterval = setInterval(() => {
    saveProgress();
  }, 4000);
}
function stopProgressTracking(){
  clearInterval(progressInterval);
  saveProgress();
}

// Позицию пишем и по событиям, иначе после неудачной загрузки ссылки интервал остаётся выключенным
video.addEventListener('pause', saveProgress);
video.addEventListener('seeked', saveProgress);
video.addEventListener('play', startProgressTracking);

// Экранирует & < > " ' безопасно и для текста, и для значения атрибута
function escapeHtml(str){
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// разрешает анимацию панели начиная со второго рендера
let resumePanelReady = false;

function setResumePanelOpen(open, animate){
  const isOpen = resumePanel.classList.contains('show');
  if (isOpen === open) return;
  // Раскрытие анимирует grid-template-rows (0fr/1fr), высота не измеряется
  if (!animate){
    const prev = resumePanel.style.transition;
    resumePanel.style.transition = 'none';
    resumePanel.classList.toggle('show', open);
    void resumePanel.offsetHeight;
    resumePanel.style.transition = prev;
    return;
  }
  resumePanel.classList.toggle('show', open);
}

function updatePanelVisibility(){
  setResumePanelOpen(resumeList.children.length > 0, resumePanelReady);
  resumePanelReady = true;
}

function renderResumeList(){
  // ключи карточек, показанных до перерисовки
  const prevKeys = new Set(Array.from(resumeList.children).map(el => el.dataset.key));

  const items = [];
  for (let i = 0; i < localStorage.length; i++){
    const key = localStorage.key(i);
    // PROGRESS_PREFIX покрывает все записи: обычные файлы, handle-файлы и url-ссылки
    if (!key || !key.startsWith(PROGRESS_PREFIX)) continue;
    try{
      const data = JSON.parse(localStorage.getItem(key));
      if (data && !data.completed && isProgressStarted(data.t, data.duration)) items.push(Object.assign({ key }, data));
    } catch(e){ /* пропускаем битую запись */ }
  }
  // Показываем три самые свежие незавершённые записи
  items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const shown = items.slice(0, 3);

  resumeList.innerHTML = shown.map(item => {
    // Используем displayName если есть (пользовательский заголовок), иначе из name обрезаем расширение
    const displayName = item.displayName || (item.name ? niceTitleFromFilename(item.name) : 'Файл');
    // Помечаем записи из папки отдельным бейджем, чтобы отличать их от одиночных файлов
    const isFolderItem = !item.url && item.key.startsWith(FOLDER_PROGRESS_PREFIX);
    const folderLabel = isFolderItem
      ? (item.folderName ? `Из папки «${escapeHtml(item.folderName)}»` : 'Из папки')
      : '';
    let typeBadge;
    if (item.url) {
      typeBadge = `<span class="ri-type-badge ri-type-url">${item.seriesUrl ? 'Сериал' : 'Ссылка'}</span>`;
    } else if (isFolderItem) {
      typeBadge = `<span class="ri-type-badge ri-type-folder">${folderLabel}</span>`;
    } else {
      typeBadge = '<span class="ri-type-badge ri-type-file">Файл</span>';
    }
    return `
    <div class="resume-item" data-key="${escapeHtml(item.key)}">
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
          ? `<button type="button" class="ri-continue" data-url="${escapeHtml(item.url)}"${item.seriesUrl ? ` data-series-url="${escapeHtml(item.seriesUrl)}"` : ''}>Продолжить</button>`
          : `<button type="button" class="ri-continue" data-key="${escapeHtml(item.key)}">Продолжить</button>`}
        <button type="button" class="ri-clear" data-key="${escapeHtml(item.key)}" aria-label="Удалить «${escapeHtml(displayName)}» из списка">✕</button>
      </div>
    </div>
  `;
  }).join('');

  // новые карточки (не из prevKeys) появляются с анимацией
  if (prevKeys.size > 0){
    const enteringItems = Array.from(resumeList.querySelectorAll('.resume-item')).filter(el => !prevKeys.has(el.dataset.key));
    enteringItems.forEach(el => el.classList.add('collapsed'));
    if (enteringItems.length){
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          enteringItems.forEach(el => el.classList.remove('collapsed'));
        });
      });
    }
  }

  updatePanelVisibility();
}

resumeList.addEventListener('click', async (e) => {
  const btn = e.target.closest('.ri-clear');
  if (btn) {
    const key = btn.dataset.key;
    const item = btn.closest('.resume-item');

    // Удаляем сразу, чтобы перезагрузка во время анимации не воскресила запись
    try{
      localStorage.removeItem(key);
      localStorage.removeItem(settingsKey(key));
      localStorage.removeItem(subsKey(key));
    } catch(err){}
    idbDelete(key).catch(() => {});
    idbDelete(SUBS_PREFIX + 'data:' + stripProgressPrefix(key)).catch(() => {});

    // Источник удалён и больше не текущий, иначе flushPendingSave запишет его настройки обратно
    if (key === currentFileKey){
      clearTimeout(saveSettingsTimeout);
      saveSettingsTimeout = null;
      currentFileKey = null;
    }

    if (item) await collapseElement(item);
    renderResumeList();
    return;
  }
  
  const continueBtn = e.target.closest('.ri-continue');
  if (!continueBtn) return;

  // Серию продолжаем через её сериал, тогда вернутся плейлист и переключение серий
  if (continueBtn.dataset.seriesUrl) {
    const seriesUrl = continueBtn.dataset.seriesUrl;
    urlInput.value = seriesUrl;
    // Открыть надо именно ту серию, чью карточку нажали, а не последнюю просмотренную
    loadUrl(seriesUrl, { startUrl: continueBtn.dataset.url || null });
    return;
  }

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
    // Используем handle и ключ именно этой записи для восстановления нужного файла
    const key = continueBtn.dataset.key;
    // Восстанавливаем источник, папку и ID плейлиста для корректного продолжения просмотра
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
    // Папку восстанавливаем через её handle: один запрос доступа на всё, и новые серии сразу в плейлисте
    if (isFolderKey && savedFolderId){
      const viaDir = await restoreFolderFromDirectory(savedFolderId, key, savedFolderName);
      if (viaDir === 'opened') return;
      if (viaDir === 'denied'){ showErrMsg('Доступ к папке не разрешён'); return; }
    }
    try{
      const handle = await idbGet(key);
      if (!handle){
        // Если handle не сохранён, показываем диалог выбора файла
        const [newHandle] = await window.showOpenFilePicker({
          types: [{ description: 'Видео', accept: { 'video/*': ['.mp4','.webm','.mov'] } }],
          multiple: false
        });
        const file = await newHandle.getFile();

        // Проверяем выбранный файл и не перезаписываем запись, если он отличается от сохранённого
        const expectedKey = isFolderKey
          ? fileKey(file, true, savedFolderId)
          : fileKey(file, false);
        const legacyMatch = isFolderKey && legacyFolderKey(file) === key;
        if (expectedKey !== key && !legacyMatch){
          showErrMsg('Выбран другой файл, он откроется как новое видео. Сохранённый прогресс относится к другому файлу');
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
      showErrMsg('Не удалось открыть сохранённый файл: возможно, он перемещён, переименован или удалён');
    }
  }
});

// Восстанавливает плейлист по handle папки: 'opened', 'denied' или 'none', когда handle нет или файла в папке уже нет
async function restoreFolderFromDirectory(folderId, key, savedFolderName){
  let dir = null;
  try{ dir = await idbGet(DIR_HANDLE_PREFIX + folderId); } catch(err){ return 'none'; }
  if (!dir || dir.kind !== 'directory') return 'none';
  try{
    let perm = await dir.queryPermission({ mode: 'read' });
    if (perm !== 'granted') perm = await dir.requestPermission({ mode: 'read' });
    if (perm !== 'granted') return 'denied';
    const files = [];
    await collectFilesFromDirectoryHandle(dir, files, dir.name);
    const videos = sortVideoFiles(files);
    const idx = videos.findIndex(e => fileKey(e.file, true, folderId) === key || legacyFolderKey(e.file) === key);
    if (idx === -1) return 'none';
    playlistFiles = videos;
    playlistIndex = idx;
    playlistFolderName = savedFolderName || dir.name || null;
    playlistFolderId = folderId;
    playlistBtn.style.display = playlistFiles.length > 1 ? '' : 'none';
    renderPlaylist();
    updatePlaylistNavButtons();
    savePlaylistManifest(folderId, playlistFolderName, playlistFiles);
    playlistFiles.forEach(entry => { if (entry.handle) idbSet(fileKey(entry.file, true, folderId), entry.handle).catch(() => {}); });
    loadFile(videos[idx].file, videos[idx].handle || null, { isFolder: true, folderName: playlistFolderName, folderId });
    return 'opened';
  } catch(err){
    return 'none';
  }
}

// Восстанавливает весь плейлист папки по манифесту, используя сохранённые handle остальных файлов
// Если восстановление плейлиста не удалось, открывает только текущий файл
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
    // Поддерживаем старые ключи серий без folderId для совместимости с ранее сохранёнными handle
    const key = FOLDER_PROGRESS_PREFIX + folderId + ':' + meta.name + ':' + meta.size + ':' + (meta.lastModified || 0);
    const legacyKey = FOLDER_PROGRESS_PREFIX + meta.name + ':' + meta.size + ':' + (meta.lastModified || 0);
    try{
      let h = await idbGet(key);
      if (!h){
        h = await idbGet(legacyKey);
        // Найденный старый handle сразу переносим на новый ключ
        if (h) idbSet(key, h).catch(() => {});
      }
      if (!h) continue; // хэндла для этой серии нет, пропускаем, покажем остальные
      let perm = await h.queryPermission({ mode: 'read' });
      if (perm !== 'granted') perm = await h.requestPermission({ mode: 'read' });
      if (perm !== 'granted') continue;
      const f = await h.getFile();
      resolved.push({ file: f, handle: h });
    } catch(err){ /* недоступный файл, пропускаем, остальной плейлист всё равно покажем */ }
  }

  if (activeIndex === -1 || resolved.length < 2){
    // Восстановить остальные серии не вышло, открываем как одиночное видео
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

// --- сохранение настроек источника: с задержкой, сразу и перед сменой источника ---
let saveSettingsTimeout = null;
const SAVE_SETTINGS_DELAY = 150;

// Собираем все настройки текущего источника в одном объекте для сохранения
function collectSettings(){
  return {
    drToggle: drToggle.checked,
    drStrength: parseFloat(drStrength.value),
    drBoost: parseFloat(drBoost.value),
    drSpeed: parseFloat(drSpeed.value),
    drBrightness: parseFloat(drBrightness.value),
    zoomLevel: zoomLevel,
    mirror: mirrorEnabled,
    duration: isDurationUsable() ? video.duration : null,
    blurRanges: blurRanges,
    blurFileApplied: blurFileApplied,
    ovToggle: ovToggle.checked,
    ovSize: parseFloat(ovSize.value),
    ovColor: ovColor.value,
    ovOpacity: parseFloat(ovOpacity.value),
    ovBgOpacity: parseFloat(ovBgOpacity.value),
    ovShadow: parseFloat(ovShadow.value),
    ovPosX: ovPosX,
    ovPosY: ovPosY,
    ovAlign: ovAlign,
    titleInput: titleInput.value,
    subsToggle: subsToggle.checked,
    subsSize: parseFloat(subsSize.value),
    subsPosition: parseFloat(subsPosition.value),
    ts: Date.now()
  };
}

// Единая запись настроек в хранилище
function persistSettings(){
  try{
    const settings = collectSettings();
    localStorage.setItem(settingsKey(currentFileKey), JSON.stringify(settings));
    cleanupStorage(SETTINGS_PREFIX);
    markStorageOk();
  } catch(e){ notifyStorageIssue(); }
}

function saveSettings(){
  if (!currentFileKey) return;
  
  // Отменяем предыдущий таймер
  if (saveSettingsTimeout) {
    clearTimeout(saveSettingsTimeout);
  }
  
  // Устанавливаем новый таймер
  saveSettingsTimeout = setTimeout(() => { persistSettings(); }, SAVE_SETTINGS_DELAY);
}

// Мгновенное сохранение (для критических изменений)
function saveSettingsImmediate(){
  if (!currentFileKey) return;
  if (saveSettingsTimeout) {
    clearTimeout(saveSettingsTimeout);
    saveSettingsTimeout = null;
  }
  persistSettings();
}

// Перед сменой источника или выходом дописываем отложенные настройки, иначе правка последних 150 мс уйдёт не в тот ключ
function flushPendingSettings(){
  if (!saveSettingsTimeout || !currentFileKey) return;
  clearTimeout(saveSettingsTimeout);
  saveSettingsTimeout = null;
  persistSettings();
}
