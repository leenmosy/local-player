// 04-files.js — IndexedDB, хэндлы файлов, открытие локального файла
// Часть Local Player. Файлы подключаются классическими <script> по порядку
// из index.html и делят общую область видимости — см. js/README.md
// --- File System Access API: запоминаем сам файл, не только тайминг ---
const FS_ACCESS_SUPPORTED = typeof window.showOpenFilePicker === 'function';
const IDB_NAME = 'lp-player-db';
const IDB_STORE = 'handles';

// Соединение переиспользуется. Раньше каждый idbSet/idbGet открывал и закрывал
// собственное соединение, и открытие папки на 200 видео давало 200 параллельных
// indexedDB.open (баг L-9).
let idbConnection = null;
function idbOpen(){
  if (idbConnection) return Promise.resolve(idbConnection);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
    req.onsuccess = () => {
      idbConnection = req.result;
      // Если базу закрыли извне (обновление версии, очистка данных) — сбрасываем кэш
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


// Единая инициализация настроек для источника, у которого их ещё нет.
// Раньше этот блок был продублирован в loadFile() и loadUrlCommonInit(): две почти
// одинаковые копии по ~65 строк, которые приходилось править синхронно вручную —
// именно так расходятся ветки Local File и URL.
function applyDefaultSettingsForNewSource(){
  // Если нет настроек — сбрасываем настройки до дефолтных
  resetSpeed();
  resetBrightness();
  resetZoom();
  resetMirror();
  blurRanges = [];
  renderBlurRanges();
  clearTimingError();
  
  // Сбрасываем оверлей настройки
  ovToggle.checked = true;
  ovSize.value = OV_DEFAULT_SIZE;
  ovSizeVal.textContent = OV_DEFAULT_SIZE + 'px';
  ovColor.value = OV_DEFAULT_COLOR;
  ovOpacity.value = OV_DEFAULT_OPACITY;
  ovOpacityVal.textContent = OV_DEFAULT_OPACITY + '%';
  setOverlayAlign(OV_DEFAULT_ALIGN);
  setOverlayPosition(OV_DEFAULT_POS_X, OV_DEFAULT_POS_Y);
  titleInput.value = currentFileName;
  ovTitle.textContent = currentFileName;
  
  drToggle.checked = true;
  drStrength.value = 70;
  drStrengthVal.textContent = '70%';
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
  savedSubsContent = null;
  isSubtitlesLoaded = false;
  subtitles.innerHTML = '';
  subsFileName.textContent = 'Файл не выбран';
  subsFileName.title = '';
  subsFile.value = '';
  subsRemoveBtn.style.display = 'none';

  subsToggle.checked = true;
  subtitles.style.display = 'block';
  subsSize.value = 28;
  subsSizeVal.textContent = '28px';
  subsColor.value = '#fffdeb';
  subsOpacity.value = 100;
  subsOpacityVal.textContent = '100%';
  applySubtitlesStyle();

  // Громкость нового файла (без сохранённых настроек) — фиксированные 20%,
  // а не громкость, оставшаяся от предыдущего файла в этой сессии.
  video.volume = DEFAULT_VOLUME;
  volumeRange.value = video.volume;
  video.muted = false;
  updateVolumeIcon();

  // Поверх констант накатываем глобальные предпочтения пользователя (баг M-19)
  applyGlobalDefaultsToUi();
  saveSettingsImmediate();
}

function loadFile(file, handle, meta){
  if (!file){ return; }
  
  // Проверяем по MIME type или по расширению
  if (!isVideoFile(file)){
    showErrMsg('Похоже, это не видеофайл. Попробуй другой файл');
    return;
  }
  hideErrMsg();
  videoErrorEl.style.display = 'none';
  hideBufferingIndicator();
  stopProgressTracking();
  // meta.isFolder помечает, что файл открыт как часть папки (плейлиста) — тогда
  // прогресс уходит в отдельное пространство ключей (FOLDER_PROGRESS_PREFIX)
  currentFileIsFolder = !!(meta && meta.isFolder);
  currentFolderName = (meta && meta.folderName) || null;
  currentFolderId = (meta && meta.folderId) || null;
  justEndedKey = null;
  currentFileKey = fileKey(file, currentFileIsFolder, currentFolderId);
  // Записи, сохранённые до появления folderId в ключе, переносим на новый ключ
  if (currentFileIsFolder) migrateLegacyFolderKey(file, currentFileKey);
  nextEpisodePromptDismissed = false;
  hideNextEpisodeOverlay();
  originalFileName = file.name; // Сохраняем исходное имя с расширением

  // Сбрасываем главы предыдущего файла и запускаем разбор нового — асинхронно,
  // не блокируя запуск воспроизведения ниже. См. parseChaptersFromFile().
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
    const txt = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
    ovTime.textContent = txt;
    timeDisplay.textContent = txt;

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
  // подстраховка: если браузер сам пришлёт durationchange позже (без нашего трюка) —
  // снимаем блокировку сика, если раньше он завис из-за Infinity
  if (durationChangeHandler){
    video.removeEventListener('durationchange', durationChangeHandler);
  }
  durationChangeHandler = () => {
    updateSeekControlsState();
  };
  video.addEventListener('durationchange', durationChangeHandler, { once: true });

  dropView.style.display = 'none';
  playerView.classList.add('active');

  // Очищаем старый аудио-граф перед созданием нового
  destroyAudioGraph();
  // Для локальных файлов создаём аудио-граф автоматически (нет проблем с CORS).
  // Для URL-источников граф на этом этапе НЕ создаём — для них это делает
  // loadUrlCommonInit() -> reapplyCompressorState() чуть позже, при загрузке
  // по ссылке (не здесь, в loadFile()).
  if (!currentFileKey || !currentFileKey.startsWith(URL_KEY_PREFIX)) {
    ensureAudioGraph();
    audioHint.classList.add('hidden'); // Скрываем подсказку для локальных файлов
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

  // Запускаем воспроизведение
  video.play().catch(e => {
    if (e.name === 'NotAllowedError') {
      console.log('Autoplay prevented - user interaction required');
    } else {
      console.warn('Play error:', e);
    }
  });
}

// Проверяет, является ли файл видеофайлом
function isVideoFile(file){
  const isVideoByType = file.type.startsWith('video/');
  const isVideoByExtension = /\.(mp4|webm|mov)$/i.test(file.name);
  return isVideoByType || isVideoByExtension;
}
