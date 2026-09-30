// --- File System Access API ---
const FS_ACCESS_SUPPORTED = typeof window.showOpenFilePicker === 'function';
const IDB_NAME = 'lp-player-db';
const IDB_STORE = 'handles';

// Переиспользуем одно соединение IndexedDB вместо открытия нового для каждой операции
let idbConnection = null;
function idbOpen(){
  if (idbConnection) return Promise.resolve(idbConnection);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
    req.onsuccess = () => {
      idbConnection = req.result;
      // Если базу закрыли извне (обновление версии, очистка данных), сбрасываем кэш
      idbConnection.onclose = () => { idbConnection = null; };
      idbConnection.onversionchange = () => {
        try { idbConnection.close(); } catch(e){}
        idbConnection = null;
      };
      resolve(idbConnection);
    };
    req.onerror = () => { idbConnection = null; reject(req.error); };
  });
}
async function idbSet(key, value){
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(new Error('Transaction aborted'));
  });
}
async function idbGet(key){
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.onabort = () => reject(new Error('Transaction aborted'));
  });
}
async function idbDelete(key){
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(new Error('Transaction aborted'));
  });
}
async function idbKeys(){
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).getAllKeys();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// Разовая чистка «осиротевших» записей IndexedDB: их localStorage-запись прогресса
// уже удалена cleanup'ом, а хендл файла / данные субтитров остались
async function idbSweepOrphans(){
  try{
    const keys = await idbKeys();
    const subsDataPrefix = SUBS_PREFIX + 'data:';
    for (const k of keys){
      if (typeof k !== 'string') continue;
      let progressKey = null;
      if (k.startsWith(subsDataPrefix)) progressKey = PROGRESS_PREFIX + k.slice(subsDataPrefix.length);
      else if (k.startsWith(PROGRESS_PREFIX)) progressKey = k;
      else continue;
      if (!localStorage.getItem(progressKey)) idbDelete(k).catch(() => {});
    }
  } catch(e){ /* некритично */ }
}


// Единая инициализация настроек для новых источников, чтобы одинаково обрабатывать файлы и URL
function applyDefaultSettingsForNewSource(){
  // Если нет настроек, сбрасываем настройки до дефолтных
  blurRanges = []; // чистим первыми, иначе resetBrightness() размоет новый файл по старым
  blurFileApplied = false;
  blurFileClampPending = false;
  renderBlurRanges();
  resetSpeed();
  resetBrightness();
  resetZoom();
  resetMirror();
  clearTimingError();
  
  // Сбрасываем оверлей настройки
  ovToggle.checked = true;
  ovSize.value = OV_DEFAULT_SIZE;
  ovSizeVal.textContent = OV_DEFAULT_SIZE + 'px';
  ovColor.value = OV_DEFAULT_COLOR;
  ovOpacity.value = OV_DEFAULT_OPACITY;
  ovOpacityVal.textContent = OV_DEFAULT_OPACITY + '%';
  ovBgOpacity.value = OV_DEFAULT_BG_OPACITY;
  ovBgOpacityVal.textContent = OV_DEFAULT_BG_OPACITY + '%';
  ovShadow.value = OV_DEFAULT_SHADOW;
  ovShadowVal.textContent = OV_DEFAULT_SHADOW + '%';
  setOverlayAlign(OV_DEFAULT_ALIGN);
  setOverlayPosition(OV_DEFAULT_POS_X, OV_DEFAULT_POS_Y);
  titleInput.value = currentFileName;
  ovTitle.textContent = currentFileName;
  
  drToggle.checked = true;
  drStrength.value = 50;
  drStrengthVal.textContent = '50%';
  drBoost.value = 100;
  drBoostVal.textContent = '100%';
  drEnabled = true;
  if (audioCtx){
    if (boostGain) boostGain.gain.setTargetAtTime(1, audioCtx.currentTime, 0.01);
    updateCompressor();
    connectGraph();
  }
  
  // Сохраняем дефолтные настройки
  saveSettings();
  
  // Субтитры (контент и стиль) всегда сбрасываются для файла без настроек
  subtitlesData = [];
  resetSubtitleRenderState();
  savedSubsContent = null;
  isSubtitlesLoaded = false;
  subtitles.innerHTML = '';
  subsFileName.textContent = 'Файл не выбран';
  subsFileName.title = '';
  subsFile.value = '';
  subsRemoveBtn.style.display = 'none';

  subsToggle.checked = true;
  subtitles.style.display = 'block';
  subsSize.value = SUBS_SIZE_DEFAULT;
  subsSizeVal.textContent = SUBS_SIZE_DEFAULT + '%';
  subsPosition.value = SUBS_POSITION_DEFAULT;
  subsPositionVal.textContent = SUBS_POSITION_DEFAULT + '%';
  applySubtitlesStyle();

  applyGlobalVolume();
}

function loadFile(file, handle, meta){
  if (!file){ return; }
  flushPendingSettings();
  cancelPendingUrlLoad();
  
  // Проверяем по MIME type или по расширению
  if (!isVideoFile(file)){
    showErrMsg('Похоже, это не видеофайл. Попробуйте другой файл');
    return;
  }
  hideErrMsg();
  hideStorageToast();
  hideInfoToast();
  hideCodecWarningToast();
  videoErrorEl.style.display = 'none';
  hideBufferingIndicator();
  stopProgressTracking();
  // meta.isFolder помечает, что файл открыт как часть папки (плейлиста), тогда
  // прогресс уходит в отдельное пространство ключей (FOLDER_PROGRESS_PREFIX)
  currentFileIsFolder = !!(meta && meta.isFolder);
  currentFolderName = (meta && meta.folderName) || null;
  currentFolderId = (meta && meta.folderId) || null;
  currentFileKey = fileKey(file, currentFileIsFolder, currentFolderId);
  currentSourceUrl = null;
  if (!currentFileIsFolder) lastOpenedFile = { file, handle: handle || null };
  // Записи, сохранённые до появления folderId в ключе, переносим на новый ключ
  if (currentFileIsFolder) migrateLegacyFolderKey(file, currentFileKey);
  nextEpisodePromptDismissed = false;
  hideNextEpisodeOverlay();
  originalFileName = file.name; // Сохраняем исходное имя с расширением

  // Сбрасываем главы предыдущего файла и запускаем разбор нового, асинхронно,
  // не блокируя запуск воспроизведения ниже
  resetMediaChapters();
  parseChaptersFromFile(file, chapterParseToken);
  currentFileName = niceTitleFromFilename(file.name); // Отображаемое имя без расширения
  
  // Удаляем дубликаты прогресса для этого файла
  removeDuplicateProgress(currentFileKey);

  // Сбрасываем crossOrigin для локальных файлов (blob-URL не требует CORS)
  video.removeAttribute('crossOrigin');

  try {
    const newObjectUrl = URL.createObjectURL(file);
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = newObjectUrl;
    video.src = currentObjectUrl;
  } catch (e) {
    showErrMsg('Ошибка при загрузке файла: ' + e.message);
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }
    video.src = '';
    video.load();
    return;
  }

  // Проверяем, есть ли сохранённые настройки для файла
  const hasSettings = loadSettings();
  
  if (!hasSettings){
    applyDefaultSettingsForNewSource();
  }

  if (!hasSettings){
    titleInput.value = currentFileName;
  }
  fnameEl.textContent = currentFileName;
  ovTime.textContent = '00:00 / 00:00';
  applyOverlaySettings();

  if (loadedMetadataHandler){
    video.removeEventListener('loadedmetadata', loadedMetadataHandler);
  }
  loadedMetadataHandler = () => {
    // Обновляем время при загрузке метаданных
    const txt = formatTimePair(video.currentTime, video.duration);
    ovTime.textContent = txt;
    timeDisplay.textContent = txt;

    dropForeignSettings();

    // Не применяем fixInfiniteDuration для HLS потоков - hls.js сам управляет live-потоками
    if (!hls) {
      fixInfiniteDuration(() => {
        restoreProgress();
      });
    } else {
      restoreProgress();
    }
  };
  video.addEventListener('loadedmetadata', loadedMetadataHandler, { once: true });
  // Снимаем блокировку перемотки, если durationchange позже установит корректную длительность
  if (durationChangeHandler){
    video.removeEventListener('durationchange', durationChangeHandler);
  }
  durationChangeHandler = () => {
    updateSeekControlsState();
  };
  video.addEventListener('durationchange', durationChangeHandler, { once: true });

  dropView.style.display = 'none';
  playerView.classList.add('active');
  pushPlayerHistory();

  // Локальный файл читается через blob-URL, ограничений CORS у него нет
  audioSourceTainted = false;
  setAudioFeaturesAvailable(true);
  destroyAudioGraph();
  if (drToggle.checked || parseFloat(drBoost.value) > 100) ensureAudioGraph();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

  // Запускаем воспроизведение
  safePlay();
}

// Проверяет, является ли файл видеофайлом
function isVideoFile(file){
  const isVideoByType = file.type.startsWith('video/');
  const isVideoByExtension = /\.(mp4|webm|mov)$/i.test(file.name);
  return isVideoByType || isVideoByExtension;
}

// Отличает папку от файла по отсутствию MIME-типа и расширения в имени
function looksLikeFolderDrop(file){
  return !file.type && !/\.[a-z0-9]{2,5}$/i.test(file.name);
}

