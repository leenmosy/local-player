const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const dropView = document.getElementById('drop-view');
const playerView = document.getElementById('player-view');
const errMsg = document.getElementById('err-msg');
const video = document.getElementById('video');
const ovTitle = document.getElementById('ov-title');
const ovTime = document.getElementById('ov-time');
const overlayEl = document.querySelector('.overlay');
const titleInput = document.getElementById('title-input');
const fnameEl = document.getElementById('fname');
const backBtn = document.getElementById('back-btn');
const resumePanel = document.getElementById('resume-panel');
const resumeSub = document.getElementById('resume-sub');
const resumeList = document.getElementById('resume-list');
const continueRow = document.getElementById('continue-row');
const ccName = document.getElementById('cc-name');
const ccTime = document.getElementById('cc-time');
const ccOpenBtn = document.getElementById('cc-open-btn');
const centerPlayIcon = document.getElementById('center-play-icon');
const centerIconPlay = document.getElementById('center-icon-play');
const centerIconPause = document.getElementById('center-icon-pause');

// --- overlay settings controls ---
const ovToggle = document.getElementById('ov-toggle');
const ovSize = document.getElementById('ov-size');
const ovSizeVal = document.getElementById('ov-size-val');
const ovColor = document.getElementById('ov-color');
const ovOpacity = document.getElementById('ov-opacity');
const ovOpacityVal = document.getElementById('ov-opacity-val');
const posButtons = document.querySelectorAll('.pos-btn');
let selectedPosition = 'bottom-right';

ovToggle.addEventListener('change', () => { applyOverlaySettings(); saveSettings(); });
ovSize.addEventListener('input', () => { ovSizeVal.textContent = ovSize.value + 'px'; applyOverlaySettings(); saveSettings(); });
ovColor.addEventListener('input', () => { applyOverlaySettings(); saveSettings(); });
ovOpacity.addEventListener('input', () => { ovOpacityVal.textContent = ovOpacity.value + '%'; applyOverlaySettings(); saveSettings(); });
posButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    posButtons.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    selectedPosition = btn.dataset.pos;
    applyOverlaySettings();
    saveSettings();
  });
});

function hexToRgba(hex, alpha){
  const h = hex.replace('#','');
  const r = parseInt(h.substring(0,2), 16);
  const g = parseInt(h.substring(2,4), 16);
  const b = parseInt(h.substring(4,6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function applyOverlaySettings(){
  const size = ovSize.value + 'px';
  const color = hexToRgba(ovColor.value, ovOpacity.value / 100);
  ovTitle.style.fontSize = size;
  ovTime.style.fontSize = size;
  ovTitle.style.color = color;
  ovTime.style.color = color;
  overlayEl.classList.remove('pos-top-left','pos-top-right','pos-bottom-left','pos-bottom-right');
  overlayEl.classList.add('pos-' + selectedPosition);
  overlayEl.style.display = ovToggle.checked ? 'flex' : 'none';
}

let currentObjectUrl = null;

// --- фикс Infinity/NaN-длительности ---
// Некоторые контейнеры (в т.ч. часть mkv-рипов, webm с "unknown duration" и т.п.)
// репортят video.duration === Infinity сразу после loadedmetadata, и настоящая
// длина становится известна браузеру только после того, как он "прощупает" конец
// потока перемоткой. Без этого таймер/сик застревают в нулях НЕ только для .mkv,
// а для любого файла с таким поведением.
function isDurationUsable(){
  return isFinite(video.duration) && video.duration > 0;
}
function fixInfiniteDuration(onReady){
  if (isDurationUsable()){
    seek.disabled = false;
    if (onReady) onReady();
    return;
  }
  seek.disabled = true;
  const onTimeUpdate = () => {
    video.removeEventListener('timeupdate', onTimeUpdate);
    video.currentTime = 0;
    seek.disabled = !isDurationUsable();
    if (onReady) onReady();
  };
  video.addEventListener('timeupdate', onTimeUpdate);
  try { video.currentTime = 1e101; } catch(e){ /* браузер сам ужмёт значение */ }
}

function formatTime(sec){
  if (!isFinite(sec)) return '00:00';
  const h = Math.floor(sec/3600);
  const m = Math.floor((sec%3600)/60);
  const s = Math.floor(sec%60);
  const pad = n => String(n).padStart(2,'0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function niceTitleFromFilename(name){
  const withoutExt = name.replace(/\.[^/.]+$/, '');
  return withoutExt.replace(/[._]/g, ' ').trim();
}

// --- запоминание тайминга просмотра (localStorage) ---
const PROGRESS_PREFIX = 'lp_progress:';
const HANDLE_KEY_PREFIX = PROGRESS_PREFIX + 'h:';
const SETTINGS_PREFIX = 'lp_settings:';
let currentFileKey = null;
let currentFileName = null;
let progressInterval = null;

function fileKey(file){
  return PROGRESS_PREFIX + file.name + ':' + file.size + ':' + (file.lastModified || 0);
}
function handleFileKey(handleName){
  return HANDLE_KEY_PREFIX + handleName;
}
function settingsKey(key){
  return SETTINGS_PREFIX + key.replace(PROGRESS_PREFIX, '');
}

function saveProgress(){
  if (!currentFileKey || !video.duration || !isFinite(video.duration)) return;
  try{
    if (video.currentTime < 5 || video.currentTime > video.duration - 8){
      localStorage.removeItem(currentFileKey);
    } else {
      localStorage.setItem(currentFileKey, JSON.stringify({
        t: video.currentTime,
        duration: video.duration,
        name: currentFileName,
        ts: Date.now()
      }));
    }
  } catch(e){ /* хранилище недоступно — просто пропускаем */ }
}

function saveSettings(){
  if (!currentFileKey) return;
  try{
    const settings = {
      drToggle: drToggle.checked,
      drStrength: drStrength.value,
      drBoost: drBoost.value,
      drSpeed: drSpeed.value,
      drBrightness: drBrightness.value,
      zoomLevel: zoomLevel,
      ovToggle: ovToggle.checked,
      ovSize: ovSize.value,
      ovColor: ovColor.value,
      ovOpacity: ovOpacity.value,
      selectedPosition: selectedPosition,
      titleInput: titleInput.value,
      volume: video.volume,
      muted: video.muted
    };
    localStorage.setItem(settingsKey(currentFileKey), JSON.stringify(settings));
  } catch(e){ /* хранилище недоступно */ }
}

function loadSettings(){
  if (!currentFileKey) return false;
  try{
    const raw = localStorage.getItem(settingsKey(currentFileKey));
    if (!raw) return false;
    const settings = JSON.parse(raw);
    if (!settings) return false;
    
    // Восстанавливаем настройки
    drToggle.checked = settings.drToggle !== undefined ? settings.drToggle : true;
    drStrength.value = settings.drStrength || 55;
    drStrengthVal.textContent = drStrength.value + '%';
    drBoost.value = settings.drBoost || 100;
    drBoostVal.textContent = drBoost.value + '%';
    drSpeed.value = settings.drSpeed || 1;
    drSpeedVal.textContent = drSpeed.value + 'x';
    video.playbackRate = parseFloat(drSpeed.value);
    
    drBrightness.value = settings.drBrightness || 100;
    drBrightnessVal.textContent = drBrightness.value + '%';
    video.style.filter = `brightness(${drBrightness.value / 100})`;
    
    zoomLevel = settings.zoomLevel || 100;
    zoomVal.textContent = zoomLevel + '%';
    video.style.transform = zoomLevel === 100 ? '' : `scale(${zoomLevel / 100})`;
    
    ovToggle.checked = settings.ovToggle !== undefined ? settings.ovToggle : true;
    ovSize.value = settings.ovSize || 16;
    ovSizeVal.textContent = ovSize.value + 'px';
    ovColor.value = settings.ovColor || '#ffffff';
    ovOpacity.value = settings.ovOpacity || 22;
    ovOpacityVal.textContent = ovOpacity.value + '%';
    selectedPosition = settings.selectedPosition || 'bottom-right';
    
    // Обновляем визуальное состояние кнопок позиций
    posButtons.forEach(b => { 
      b.classList.remove('active'); 
      b.setAttribute('aria-pressed', 'false');
    });
    const activePosBtn = document.querySelector(`.pos-btn[data-pos="${selectedPosition}"]`);
    if (activePosBtn){
      activePosBtn.classList.add('active');
      activePosBtn.setAttribute('aria-pressed', 'true');
    }
    
    titleInput.value = settings.titleInput || niceTitleFromFilename(currentFileName);
    ovTitle.textContent = titleInput.value || '—';
    
    applyOverlaySettings();
    
    // Восстанавливаем громкость
    if (settings.volume !== undefined){
      video.volume = settings.volume;
    } else {
      video.volume = 1;
    }
    
    // Восстанавливаем состояние мута
    if (settings.muted !== undefined){
      video.muted = settings.muted;
    } else {
      video.muted = false;
    }
    
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
  } catch(e){ /* повреждённая запись — игнорируем */ }
  return false;
}

function restoreProgress(){
  if (!currentFileKey) return;
  try{
    const raw = localStorage.getItem(currentFileKey);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data && data.t > 3 && data.t < video.duration - 5){
      video.currentTime = data.t;
    }
  } catch(e){ /* повреждённая запись — игнорируем */ }
}

function startProgressTracking(){
  clearInterval(progressInterval);
  progressInterval = setInterval(() => {
    saveProgress();
    saveSettings();
  }, 4000);
}
function stopProgressTracking(){
  clearInterval(progressInterval);
  saveProgress();
  saveSettings();
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function updatePanelVisibility(){
  const hasContinue = continueRow.style.display !== 'none';
  const hasList = resumeList.children.length > 0;
  resumePanel.classList.toggle('show', hasContinue || hasList);
  resumeSub.style.display = hasList ? 'block' : 'none';
  continueRow.classList.toggle('has-more', hasContinue && hasList);
}

function renderResumeList(){
  const items = [];
  for (let i = 0; i < localStorage.length; i++){
    const key = localStorage.key(i);
    if (!key || !key.startsWith(PROGRESS_PREFIX)) continue;
    if (key.startsWith(HANDLE_KEY_PREFIX)) continue; // эти показывает верхняя строка "Продолжить"
    try{
      const data = JSON.parse(localStorage.getItem(key));
      if (data && typeof data.t === 'number'){
        items.push(Object.assign({ key }, data));
      }
    } catch(e){ /* пропускаем битую запись */ }
  }
  items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const shown = items.slice(0, 4);

  resumeList.innerHTML = shown.map(item => `
    <div class="resume-item">
      <span class="ri-name">${escapeHtml(item.name || 'Файл')}</span>
      <span class="ri-time">${formatTime(item.t)}${item.duration ? ' / ' + formatTime(item.duration) : ''}</span>
      <button type="button" class="ri-clear" data-key="${escapeHtml(item.key)}" title="Забыть">✕</button>
    </div>
  `).join('');
  updatePanelVisibility();
}

resumeList.addEventListener('click', (e) => {
  const btn = e.target.closest('.ri-clear');
  if (!btn) return;
  try{ localStorage.removeItem(btn.dataset.key); } catch(err){}
  renderResumeList();
});

renderResumeList();

window.addEventListener('beforeunload', saveProgress);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveProgress(); });

// --- File System Access API: запоминаем сам файл, не только тайминг ---
const FS_ACCESS_SUPPORTED = typeof window.showOpenFilePicker === 'function';
const IDB_NAME = 'lp-player-db';
const IDB_STORE = 'handles';
const IDB_HANDLE_KEY = 'lastHandle';

function idbOpen(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbSet(key, value){
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbGet(key){
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbDelete(key){
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

let savedHandle = null;

async function checkSavedHandle(){
  if (!FS_ACCESS_SUPPORTED){ updatePanelVisibility(); return; }
  try{
    const handle = await idbGet(IDB_HANDLE_KEY);
    if (!handle){ continueRow.style.display = 'none'; updatePanelVisibility(); return; }
    savedHandle = handle;
    let raw = null;
    try{ raw = localStorage.getItem(handleFileKey(handle.name)); } catch(e){}
    const data = raw ? JSON.parse(raw) : null;
    ccName.textContent = handle.name;
    ccTime.textContent = data ? `${formatTime(data.t)}${data.duration ? ' / ' + formatTime(data.duration) : ''}` : 'с начала';
    continueRow.style.display = 'flex';
    updatePanelVisibility();
  } catch(e){
    continueRow.style.display = 'none';
    updatePanelVisibility();
  }
}

ccOpenBtn.addEventListener('click', async () => {
  if (!savedHandle) return;
  ccOpenBtn.disabled = true;
  try{
    let perm = await savedHandle.queryPermission({ mode: 'read' });
    if (perm !== 'granted'){
      perm = await savedHandle.requestPermission({ mode: 'read' });
    }
    if (perm !== 'granted'){
      errMsg.textContent = 'Доступ к файлу не разрешён.';
      errMsg.style.display = 'block';
      return;
    }
    const file = await savedHandle.getFile();
    loadFile(file, savedHandle);
  } catch(e){
    errMsg.textContent = 'Не удалось открыть сохранённый файл — возможно, он был перемещён, переименован или удалён.';
    errMsg.style.display = 'block';
    continueRow.style.display = 'none';
    updatePanelVisibility();
    try{ await idbDelete(IDB_HANDLE_KEY); } catch(err){}
  } finally {
    ccOpenBtn.disabled = false;
  }
});

checkSavedHandle();

function loadFile(file, handle){
  if (!file){ return; }
  if (!file.type.startsWith('video/')){
    errMsg.textContent = 'Похоже, это не видеофайл. Попробуй другой файл.';
    errMsg.style.display = 'block';
    return;
  }
  errMsg.style.display = 'none';
  videoErrorEl.style.display = 'none';
  stopProgressTracking();
  if (handle){
    currentFileKey = handleFileKey(handle.name);
    currentFileName = handle.name;
  } else {
    currentFileKey = fileKey(file);
    currentFileName = file.name;
  }

  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = URL.createObjectURL(file);
  video.src = currentObjectUrl;

  // Проверяем, есть ли сохранённые настройки для файла
  const hasSettings = loadSettings();
  
  if (!hasSettings){
    // Если нет настроек — сбрасываем настройки до дефолтных
    resetSpeed();
    resetBrightness();
    resetZoom();
    
    // Сбрасываем оверлей настройки
    ovToggle.checked = true;
    ovSize.value = 16;
    ovSizeVal.textContent = '16px';
    ovColor.value = '#ffffff';
    ovOpacity.value = 22;
    ovOpacityVal.textContent = '22%';
    selectedPosition = 'bottom-right';
    posButtons.forEach(b => { 
      b.classList.remove('active'); 
      b.setAttribute('aria-pressed', 'false');
    });
    const defaultPosBtn = document.querySelector('.pos-btn[data-pos="bottom-right"]');
    if (defaultPosBtn){
      defaultPosBtn.classList.add('active');
      defaultPosBtn.setAttribute('aria-pressed', 'true');
    }
    
    drToggle.checked = true;
    drStrength.value = 55;
    drStrengthVal.textContent = '55%';
    drBoost.value = 100;
    drBoostVal.textContent = '100%';
    drEnabled = true;
    if (audioCtx){
      if (boostGain) boostGain.gain.setTargetAtTime(1, audioCtx.currentTime, 0.01);
      updateCompressor();
      connectGraph();
    }
    
    // Сбрасываем громкость до дефолтного значения
    video.volume = 1;
    volumeRange.value = 1;
    video.muted = false;
    lastVolume = 1;
    updateVolumeIcon();
  }

  const niceTitle = niceTitleFromFilename(file.name);
  titleInput.value = niceTitle;
  ovTitle.textContent = niceTitle;
  fnameEl.textContent = file.name.replace(/\.[^/.]+$/, '');
  ovTime.textContent = '00:00 / 00:00';
  applyOverlaySettings();

  video.addEventListener('loadedmetadata', () => {
    fixInfiniteDuration(restoreProgress);
  }, { once: true });
  // подстраховка: если браузер сам пришлёт durationchange позже (без нашего трюка) —
  // снимаем блокировку сика, если раньше он завис из-за Infinity
  video.addEventListener('durationchange', () => {
    if (isDurationUsable()) seek.disabled = false;
  });

  dropView.style.display = 'none';
  playerView.classList.add('active');
  ensureAudioGraph();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  video.play().catch(()=>{});
}

// --- drag & drop ---
['dragenter','dragover'].forEach(evt =>
  dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.add('dragover'); })
);
['dragleave','drop'].forEach(evt =>
  dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.remove('dragover'); })
);
dropzone.addEventListener('drop', async e => {
  const dtItem = e.dataTransfer.items && e.dataTransfer.items[0];
  let handle = null;
  if (dtItem && typeof dtItem.getAsFileSystemHandle === 'function'){
    try{
      const h = await dtItem.getAsFileSystemHandle();
      if (h && h.kind === 'file') handle = h;
    } catch(err){ handle = null; }
  }
  const file = e.dataTransfer.files[0];
  if (handle){
    try{ await idbSet(IDB_HANDLE_KEY, handle); } catch(err){}
  }
  loadFile(file, handle);
});
dropzone.addEventListener('click', async () => {
  if (FS_ACCESS_SUPPORTED){
    try{
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'Видео', accept: { 'video/*': ['.mp4','.webm','.mov','.avi'] } }],
        multiple: false
      });
      const file = await handle.getFile();
      try{ await idbSet(IDB_HANDLE_KEY, handle); } catch(err){}
      loadFile(file, handle);
    } catch(err){ /* пользователь закрыл диалог выбора файла */ }
    return;
  }
  fileInput.click();
});
fileInput.addEventListener('change', e => loadFile(e.target.files[0]));

// --- overlay + custom controls sync ---
const stage = document.getElementById('stage');
const clickCatcher = document.getElementById('click-catcher');
const playBtn = document.getElementById('play-btn');
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');
const timeDisplay = document.getElementById('time-display');
const seek = document.getElementById('seek');
const muteBtn = document.getElementById('mute-btn');
const iconVolOn = document.getElementById('icon-vol-on');
const iconVolOff = document.getElementById('icon-vol-off');
const volumeRange = document.getElementById('volume-range');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const iconFsOpen = document.getElementById('icon-fs-open');
const iconFsClose = document.getElementById('icon-fs-close');
const screenshotBtn = document.getElementById('screenshot-btn');
const pipBtn = document.getElementById('pip-btn');
const drBtn = document.getElementById('dr-btn');
const drPanel = document.getElementById('dr-panel');
const drToggle = document.getElementById('dr-toggle');
const drStrength = document.getElementById('dr-strength');
const drStrengthVal = document.getElementById('dr-strength-val');
const drBoost = document.getElementById('dr-boost');
const drBoostVal = document.getElementById('dr-boost-val');
const drSpeed = document.getElementById('dr-speed');
const drSpeedVal = document.getElementById('dr-speed-val');
const drBrightness = document.getElementById('dr-brightness');
const drBrightnessVal = document.getElementById('dr-brightness-val');
const zoomOutBtn = document.getElementById('zoom-out');
const zoomInBtn = document.getElementById('zoom-in');
const zoomVal = document.getElementById('zoom-val');

let isSeeking = false;

// --- аудио-граф: выравнивание громкости + буст сверх 100% ---
let audioCtx = null;
let sourceNode = null;
let compressorNode = null;
let boostGain = null;
let drEnabled = true;

function updateCompressor(){
  if (!compressorNode) return;
  const s = drStrength.value / 100;
  compressorNode.threshold.setTargetAtTime(-10 - s * 40, audioCtx.currentTime, 0.01);
  compressorNode.ratio.setTargetAtTime(1 + s * 15, audioCtx.currentTime, 0.01);
  compressorNode.knee.setTargetAtTime(6, audioCtx.currentTime, 0.01);
  compressorNode.attack.setTargetAtTime(0.003, audioCtx.currentTime, 0.01);
  compressorNode.release.setTargetAtTime(0.25, audioCtx.currentTime, 0.01);
}

function connectGraph(){
  if (!audioCtx) return;
  sourceNode.disconnect();
  boostGain.disconnect();
  compressorNode.disconnect();
  
  sourceNode.connect(boostGain);
  if (drEnabled){
    boostGain.connect(compressorNode);
    compressorNode.connect(audioCtx.destination);
  } else {
    boostGain.connect(audioCtx.destination);
  }
}

function ensureAudioGraph(){
  if (audioCtx) return;
  try{
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    sourceNode = audioCtx.createMediaElementSource(video);
    compressorNode = audioCtx.createDynamicsCompressor();
    boostGain = audioCtx.createGain();
    boostGain.gain.value = drBoost.value / 100;
    updateCompressor();
    connectGraph();
  } catch(e){
    console.warn('Web Audio недоступен:', e);
  }
}

function setDrPanelOpen(open){
  drPanel.classList.toggle('open', open);
  drBtn.setAttribute('aria-expanded', String(open));
}
drBtn.addEventListener('click', () => {
  setDrPanelOpen(!drPanel.classList.contains('open'));
});

drToggle.addEventListener('change', () => {
  ensureAudioGraph();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  drEnabled = drToggle.checked;
  connectGraph();
  saveSettings();
});

drStrength.addEventListener('input', () => {
  drStrengthVal.textContent = drStrength.value + '%';
  updateCompressor();
  saveSettings();
});

drBoost.addEventListener('input', () => {
  drBoostVal.textContent = drBoost.value + '%';
  ensureAudioGraph();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  if (boostGain){
    boostGain.gain.setTargetAtTime(drBoost.value / 100, audioCtx.currentTime, 0.01);
  }
  saveSettings();
});

// --- скорость воспроизведения ---
drSpeed.addEventListener('input', () => {
  const rate = parseFloat(drSpeed.value);
  video.playbackRate = rate;
  drSpeedVal.textContent = rate + 'x';
  saveSettings();
});
function resetSpeed(){
  video.playbackRate = 1;
  drSpeed.value = 1;
  drSpeedVal.textContent = '1x';
}

// --- яркость видео ---
drBrightness.addEventListener('input', () => {
  const brightness = drBrightness.value / 100;
  video.style.filter = `brightness(${brightness})`;
  drBrightnessVal.textContent = drBrightness.value + '%';
  saveSettings();
});
function resetBrightness(){
  video.style.filter = '';
  drBrightness.value = 100;
  drBrightnessVal.textContent = '100%';
}

// --- масштаб картинки ---
let zoomLevel = 100;
function applyZoom(){
  zoomVal.textContent = zoomLevel + '%';
  video.style.transform = zoomLevel === 100 ? '' : `scale(${zoomLevel / 100})`;
}
zoomOutBtn.addEventListener('click', () => {
  zoomLevel = Math.max(50, zoomLevel - 5);
  applyZoom();
  saveSettings();
});
zoomInBtn.addEventListener('click', () => {
  zoomLevel = Math.min(200, zoomLevel + 5);
  applyZoom();
  saveSettings();
});
function resetZoom(){
  zoomLevel = 100;
  applyZoom();
}

function togglePlay(){
  if (video.paused) video.play(); else video.pause();
}
let centerIconTimeout = null;

function showCenterIcon(isPlaying){
  centerIconPlay.style.display = isPlaying ? 'none' : '';
  centerIconPause.style.display = isPlaying ? '' : 'none';
  centerPlayIcon.classList.add('show');
  
  // Отменяем все предыдущие таймеры
  clearTimeout(centerIconTimeout);
  
  if (isPlaying){
    // При воспроизведении скрываем иконку через 600мс
    centerIconTimeout = setTimeout(() => {
      centerPlayIcon.classList.remove('show');
    }, 600);
  } else {
    // При паузе НЕ скрываем иконку автоматически - она должна оставаться видимой
    // Иконка скрывается только при следующем воспроизведении
  }
}
playBtn.addEventListener('click', togglePlay);
clickCatcher.addEventListener('click', () => {
  if (drPanel.classList.contains('open')){
    setDrPanelOpen(false);
    return;
  }
  togglePlay();
});

// --- закрытие панели настроек по клику вне неё или по Esc ---
document.addEventListener('click', (e) => {
  if (!drPanel.classList.contains('open')) return;
  if (drPanel.contains(e.target) || drBtn.contains(e.target)) return;
  setDrPanelOpen(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && drPanel.classList.contains('open')){
    setDrPanelOpen(false);
  }
});

let isUpdatingPlayState = false;

function syncPlayStateUI(){
  const isPlaying = !video.paused;
  
  if (isPlaying){
    iconPlay.style.display = 'none';
    iconPause.style.display = '';
    playBtn.setAttribute('aria-pressed', 'true');
    playBtn.setAttribute('aria-label', 'Пауза');
  } else {
    iconPlay.style.display = '';
    iconPause.style.display = 'none';
    playBtn.setAttribute('aria-pressed', 'false');
    playBtn.setAttribute('aria-label', 'Воспроизведение');
  }
}

video.addEventListener('play', () => {
  syncPlayStateUI();
  startProgressTracking();
  showCenterIcon(true);
});
video.addEventListener('pause', () => {
  syncPlayStateUI();
  stopProgressTracking();
  
  // Отменяем все таймеры скрытия иконки
  clearTimeout(centerIconTimeout);
  
  centerPlayIcon.classList.add('show');
  centerIconPlay.style.display = '';
  centerIconPause.style.display = 'none';
});

// Постоянная синхронизация UI с фактическим состоянием видео
setInterval(() => {
  const isPlaying = !video.paused;
  const iconPlayVisible = iconPlay.style.display !== 'none';
  
  // Если UI не соответствует фактическому состоянию - исправляем
  if (isPlaying && iconPlayVisible){
    syncPlayStateUI();
  } else if (!isPlaying && !iconPlayVisible){
    syncPlayStateUI();
  }
}, 100);
video.addEventListener('ended', () => {
  if (currentFileKey){
    try{ localStorage.removeItem(currentFileKey); } catch(e){}
  }
});

video.addEventListener('timeupdate', () => {
  const txt = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
  ovTime.textContent = txt;
  timeDisplay.textContent = txt;
  if (!isSeeking && isDurationUsable()){
    seek.value = (video.currentTime / video.duration) * 1000;
  }
});
video.addEventListener('loadedmetadata', () => {
  const txt = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
  ovTime.textContent = txt;
  timeDisplay.textContent = txt;
});

seek.addEventListener('mousedown', () => isSeeking = true);
seek.addEventListener('touchstart', () => isSeeking = true);
seek.addEventListener('input', () => {
  if (isDurationUsable()){
    const t = (seek.value / 1000) * video.duration;
    timeDisplay.textContent = `${formatTime(t)} / ${formatTime(video.duration)}`;
  }
});
seek.addEventListener('change', () => {
  if (isDurationUsable()) video.currentTime = (seek.value / 1000) * video.duration;
  isSeeking = false;
});

function updateVolumeIcon(){
  const isOff = video.muted || video.volume <= 0;
  iconVolOn.style.display = isOff ? 'none' : '';
  iconVolOff.style.display = isOff ? '' : 'none';
  muteBtn.setAttribute('aria-pressed', String(isOff));
  muteBtn.setAttribute('aria-label', isOff ? 'Включить звук' : 'Выключить звук');
}

let lastVolume = 1;

volumeRange.addEventListener('input', () => {
  video.volume = volumeRange.value;
  video.muted = Number(volumeRange.value) === 0;
  if (video.volume > 0) lastVolume = video.volume;
  updateVolumeIcon();
  saveSettings();
});
muteBtn.addEventListener('click', () => {
  video.muted = !video.muted;
  if (video.muted){
    if (video.volume > 0) lastVolume = video.volume;
    volumeRange.value = 0;
  } else {
    video.volume = lastVolume > 0 ? lastVolume : 1;
    volumeRange.value = video.volume;
  }
  updateVolumeIcon();
  saveSettings();
});
updateVolumeIcon();

fullscreenBtn.addEventListener('click', () => {
  if (!document.fullscreenElement){
    stage.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
});
document.addEventListener('fullscreenchange', () => {
  const isFs = !!document.fullscreenElement;
  iconFsOpen.style.display = isFs ? 'none' : '';
  iconFsClose.style.display = isFs ? '' : 'none';
  fullscreenBtn.setAttribute('aria-pressed', String(isFs));
  fullscreenBtn.setAttribute('aria-label', isFs ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим');
});

// --- скриншот ---
screenshotBtn.addEventListener('click', () => {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    // Применяем CSS фильтры к canvas
    const brightness = drBrightness.value / 100;
    ctx.filter = `brightness(${brightness})`;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const link = document.createElement('a');
    const timestamp = formatTime(video.currentTime).replace(/:/g, '-');
    link.download = `screenshot-${timestamp}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch(e) {
    console.error('Ошибка скриншота:', e);
  }
});

// --- Picture-in-Picture ---
pipBtn.addEventListener('click', async () => {
  if (document.pictureInPictureElement) {
    await document.exitPictureInPicture();
  } else {
    try {
      await video.requestPictureInPicture();
    } catch(e) {
      console.error('PiP ошибка:', e);
    }
  }
});

video.addEventListener('enterpictureinpicture', () => {
  pipBtn.setAttribute('aria-pressed', 'true');
  pipBtn.setAttribute('aria-label', 'Закрыть картинку в картинке');
});

video.addEventListener('leavepictureinpicture', () => {
  pipBtn.setAttribute('aria-pressed', 'false');
  pipBtn.setAttribute('aria-label', 'Картинка в картинке');
});

// --- автоскрытие панели при воспроизведении ---
let hideTimer = null;
function showControls(){
  stage.classList.remove('controls-hidden');
  clearTimeout(hideTimer);
  if (!video.paused){
    hideTimer = setTimeout(() => stage.classList.add('controls-hidden'), 2500);
  }
}
stage.addEventListener('mousemove', showControls);
stage.addEventListener('mouseleave', () => { if (!video.paused) stage.classList.add('controls-hidden'); });
video.addEventListener('play', showControls);
video.addEventListener('pause', () => { clearTimeout(hideTimer); stage.classList.remove('controls-hidden'); });

// --- горячие клавиши ---
function adjustVolume(delta){
  const current = video.muted ? 0 : video.volume;
  let v = Math.min(1, Math.max(0, current + delta));
  v = Math.round(v * 100) / 100;
  video.volume = v;
  video.muted = v === 0;
  volumeRange.value = v;
  if (v > 0) lastVolume = v;
  updateVolumeIcon();
  saveSettings();
}
document.addEventListener('keydown', (e) => {
  if (!playerView.classList.contains('active')) return;
  if (['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;
  if (e.code === 'Space'){ e.preventDefault(); togglePlay(); showControls(); }
  else if (e.code === 'KeyF'){ fullscreenBtn.click(); }
  else if (e.code === 'ArrowRight'){ video.currentTime = Math.min(video.duration || 0, video.currentTime + 5); showControls(); }
  else if (e.code === 'ArrowLeft'){ video.currentTime = Math.max(0, video.currentTime - 5); showControls(); }
  else if (e.code === 'ArrowUp'){ e.preventDefault(); adjustVolume(0.05); showControls(); }
  else if (e.code === 'ArrowDown'){ e.preventDefault(); adjustVolume(-0.05); showControls(); }
});

const videoErrorEl = document.getElementById('video-error');
const ERROR_MESSAGES = {
  1: 'Загрузка была прервана.',
  2: 'Ошибка сети при чтении файла.',
  3: 'Браузер не смог декодировать файл — скорее всего, не поддерживается кодек видео или аудио внутри файла (частая история с рипами в H.265/HEVC, AC3, DTS).',
  4: 'Формат файла не поддерживается браузером вообще.',
};
video.addEventListener('error', () => {
  const err = video.error;
  const code = err ? err.code : null;
  const msg = ERROR_MESSAGES[code] || 'Не удалось воспроизвести файл по неизвестной причине.';
  videoErrorEl.innerHTML = `
    <div class="ve-title">Не получилось воспроизвести файл</div>
    <div class="ve-detail">${msg}<br>Код ошибки браузера: ${code ?? '—'}</div>
  `;
  videoErrorEl.style.display = 'flex';
});
video.addEventListener('loadeddata', () => {
  videoErrorEl.style.display = 'none';
});

// --- editable title ---
titleInput.addEventListener('input', () => {
  ovTitle.textContent = titleInput.value || '—';
  saveSettings();
});

// --- back to drop view ---
backBtn.addEventListener('click', () => {
  stopProgressTracking();
  video.pause();
  if (currentObjectUrl){ URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = null; }
  video.removeAttribute('src');
  video.load();
  fileInput.value = '';
  playerView.classList.remove('active');
  dropView.style.display = 'flex';
  renderResumeList();
  checkSavedHandle();
});
