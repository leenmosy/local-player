// Определяем телефоны/планшеты и показываем заглушку вместо интерфейса.
(function blockMobileDevices(){
  const ua = navigator.userAgent;

  // Явные мобильные/планшетные UA (статические, не меняются)
  const uaIsMobile = /Android|iPhone|iPod|iPad|Windows Phone|BlackBerry|IEMobile|Opera Mini/i.test(ua);

  // iPadOS в Safari маскируется под Mac, но выдаёт себя множественными точками касания
  const isIPadOS = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;

  // Динамические media queries
  const coarseMQL = window.matchMedia('(pointer: coarse)');
  const fineMQL = window.matchMedia('(pointer: fine)');

  function checkDeviceBlock(){
    // Проверяем, что окно достаточно большое и ввод выполняется мышью
    const noPointingDevice = coarseMQL.matches && !fineMQL.matches && !window.matchMedia('(hover: hover)').matches;
    const coarseOnly = noPointingDevice && Math.min(window.innerWidth, window.innerHeight) <= 820;
    
    if (uaIsMobile || isIPadOS || coarseOnly){
      document.documentElement.classList.add('device-blocked');
    } else {
      document.documentElement.classList.remove('device-blocked');
    }
  }

  // Проверяем при загрузке
  checkDeviceBlock();

  // Подписываемся на изменения media queries
  coarseMQL.addEventListener('change', checkDeviceBlock);
  fineMQL.addEventListener('change', checkDeviceBlock);
  
  // Также отслеживаем изменение размера окна
  window.addEventListener('resize', checkDeviceBlock);
})();

document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const btn = e.target.closest('button');
  if (btn) btn.classList.add('pressed');
});
document.addEventListener('mouseup', () => {
  document.querySelectorAll('button.pressed').forEach(b => b.classList.remove('pressed'));
});
document.addEventListener('mouseleave', () => {
  document.querySelectorAll('button.pressed').forEach(b => b.classList.remove('pressed'));
}, true);

const dropzone = document.getElementById('dropzone');
const dropzoneFolder = document.getElementById('dropzone-folder');
const folderInput = document.getElementById('folder-input');
const dropView = document.getElementById('drop-view');
const playerView = document.getElementById('player-view');
const errMsg = document.getElementById('err-msg');
let errMsgTimeout = null;
let persistentErrMsg = null;

function showErrMsg(message, opts = {}){
  clearTimeout(errMsgTimeout);
  errMsg.textContent = message;
  errMsg.classList.add('show');
  if (opts.persistent){
    persistentErrMsg = message;
    return;
  }
  errMsgTimeout = setTimeout(() => {
    if (persistentErrMsg){
      errMsg.textContent = persistentErrMsg; // возвращаем постоянное предупреждение
    } else {
      errMsg.classList.remove('show');
    }
  }, opts.duration || 8000);
}

function hideErrMsg(){
  clearTimeout(errMsgTimeout);
  if (persistentErrMsg){
    errMsg.textContent = persistentErrMsg;
    errMsg.classList.add('show');
  } else {
    errMsg.classList.remove('show');
  }
}
const urlInput = document.getElementById('url-input');
const urlLoadBtn = document.getElementById('url-load-btn');
const video = document.getElementById('video');
const ovTitle = document.getElementById('ov-title');
const ovTime = document.getElementById('ov-time');
const overlayEl = document.querySelector('.overlay');
const titleInput = document.getElementById('title-input');
const fnameEl = document.getElementById('fname');
const backBtn = document.getElementById('back-btn');
const resumePanel = document.getElementById('resume-panel');
const playlistNav = document.getElementById('playlist-nav');
const prevEpisodeBtn = document.getElementById('prev-episode-btn');
const nextEpisodeBtn = document.getElementById('next-episode-btn');
const resumeList = document.getElementById('resume-list');
const videoErrorEl = document.getElementById('video-error');
const bufferingOverlayEl = document.getElementById('buffering-overlay');
const centerPlayIcon = document.getElementById('center-play-icon');
const centerIconPlay = document.getElementById('center-icon-play');
const centerIconPause = document.getElementById('center-icon-pause');
const subsFileName = document.getElementById('subs-file-name');
const subsRemoveBtn = document.getElementById('subs-remove-btn');
const urlLoadingSpinner = document.getElementById('url-loading-spinner');
const TOAST_DURATION_MS = 8000;

// --- элементы управления оверлеем ---
const ovToggle = document.getElementById('ov-toggle');
const ovSize = document.getElementById('ov-size');
const ovSizeVal = document.getElementById('ov-size-val');
const ovColor = document.getElementById('ov-color');
const ovOpacity = document.getElementById('ov-opacity');
const ovOpacityVal = document.getElementById('ov-opacity-val');
const ovBgOpacity = document.getElementById('ov-bg-opacity');
const ovBgOpacityVal = document.getElementById('ov-bg-opacity-val');
const ovShadow = document.getElementById('ov-shadow');
const ovShadowVal = document.getElementById('ov-shadow-val');
const posPad = document.getElementById('pos-pad');
const posHandle = document.getElementById('pos-handle');
const alignButtons = document.querySelectorAll('.align-btn');
const presetButtons = document.querySelectorAll('.preset-btn');

const OV_POS_MIN = 1.5;
const OV_POS_MAX = 98.5;
// Отступ оверлея от краёв кадра в крайних положениях. По вертикали меньше: у строки шрифта есть пустое поле над и под
// буквами около 4px, и на глаз до самих букв выходит столько же, сколько до них сбоку
const OV_INSET_X = 12;
const OV_INSET_Y = 12;

const OV_DEFAULT_SIZE = 17;
const OV_DEFAULT_COLOR = '#ffffff';
const OV_DEFAULT_OPACITY = 50;
const OV_DEFAULT_BG_OPACITY = 0;
const OV_DEFAULT_SHADOW = 0;
const OV_DEFAULT_POS_X = OV_POS_MAX;
const OV_DEFAULT_POS_Y = OV_POS_MAX;
const OV_DEFAULT_ALIGN = 'right';

// Устанавливаем громкость по умолчанию для новых файлов
const DEFAULT_VOLUME = 0.2;

let ovPosX = OV_DEFAULT_POS_X;
let ovPosY = OV_DEFAULT_POS_Y;
let ovAlign = OV_DEFAULT_ALIGN;

ovToggle.addEventListener('change', () => { applyOverlaySettings(); saveSettings(); });
ovSize.addEventListener('input', () => { ovSizeVal.textContent = ovSize.value + 'px'; applyOverlaySettings(); saveSettings(); });
ovColor.addEventListener('input', () => { applyOverlaySettings(); saveSettings(); });
ovOpacity.addEventListener('input', () => { ovOpacityVal.textContent = ovOpacity.value + '%'; applyOverlaySettings(); saveSettings(); });
ovBgOpacity.addEventListener('input', () => { ovBgOpacityVal.textContent = ovBgOpacity.value + '%'; applyOverlaySettings(); saveSettings(); });
ovShadow.addEventListener('input', () => { ovShadowVal.textContent = ovShadow.value + '%'; applyOverlaySettings(); saveSettings(); });
titleInput.addEventListener('input', () => {
  ovTitle.textContent = titleInput.value;
  saveSettings();
});

prevEpisodeBtn.addEventListener('click', () => {
  advanceToPrevPlaylistItem();
});

nextEpisodeBtn.addEventListener('click', () => {
  advanceToNextPlaylistItem();
});

function setOverlayAlign(align){
  ovAlign = align;
  alignButtons.forEach(b => {
    const active = b.dataset.align === align;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  });
}
alignButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    setOverlayAlign(btn.dataset.align);
    applyOverlaySettings();
    saveSettings();
  });
});

function setOverlayPosition(x, y){
  // Не даём поставить оверлей впритык к краю кадра
  ovPosX = Math.max(OV_POS_MIN, Math.min(OV_POS_MAX, x));
  ovPosY = Math.max(OV_POS_MIN, Math.min(OV_POS_MAX, y));
  posHandle.style.left = ovPosX + '%';
  posHandle.style.top = ovPosY + '%';
  syncPresetActiveState();
}

// Выравнивание текста по трети ширины пада, так же, как у угловых пресетов
function alignFromX(x){
  const third = (OV_POS_MAX - OV_POS_MIN) / 3;
  if (x < OV_POS_MIN + third) return 'left';
  if (x > OV_POS_MAX - third) return 'right';
  return 'center';
}

// --- пресеты быстрого позиционирования ---
const OV_PRESETS = {
  'top-left':     { x: OV_POS_MIN, y: OV_POS_MIN, align: 'left' },
  'top-right':    { x: OV_POS_MAX, y: OV_POS_MIN, align: 'right' },
  'bottom-left':  { x: OV_POS_MIN, y: OV_POS_MAX, align: 'left' },
  'bottom-right': { x: OV_POS_MAX, y: OV_POS_MAX, align: 'right' }
};

function syncPresetActiveState(){
  presetButtons.forEach(btn => {
    const p = OV_PRESETS[btn.dataset.preset];
    const match = p && Math.abs(p.x - ovPosX) < 0.01 && Math.abs(p.y - ovPosY) < 0.01;
    btn.classList.toggle('active', !!match);
  });
}

presetButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const p = OV_PRESETS[btn.dataset.preset];
    if (!p) return;
    overlayEl.classList.add('pos-smooth');
    setOverlayPosition(p.x, p.y);
    setOverlayAlign(p.align);
    applyOverlaySettings();
    saveSettings();
  });
});

function posFromPointer(e){
  const rect = posPad.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * 100,
    y: ((e.clientY - rect.top) / rect.height) * 100
  };
}

let draggingPad = false;
let dragRafPending = false;
let lastPointerEvent = null;

function applyDragPosition(){
  dragRafPending = false;
  if (!lastPointerEvent) return;
  const p = posFromPointer(lastPointerEvent);
  setOverlayPosition(p.x, p.y);
  setOverlayAlign(alignFromX(ovPosX));
  applyOverlaySettings();
}

posPad.addEventListener('pointerdown', (e) => {
  draggingPad = true;
  overlayEl.classList.remove('pos-smooth');
  posPad.setPointerCapture(e.pointerId);
  const p = posFromPointer(e);
  setOverlayPosition(p.x, p.y);
  setOverlayAlign(alignFromX(ovPosX));
  applyOverlaySettings();
});
posPad.addEventListener('pointermove', (e) => {
  if (!draggingPad) return;
  lastPointerEvent = e;
  if (!dragRafPending){
    dragRafPending = true;
    requestAnimationFrame(applyDragPosition);
  }
});
function endPadDrag(e){
  if (!draggingPad) return;
  draggingPad = false;
  overlayEl.classList.add('pos-smooth');
  try { posPad.releasePointerCapture(e.pointerId); } catch(err){ /* уже отпущено */ }
  saveSettings();
}
posPad.addEventListener('pointerup', endPadDrag);
posPad.addEventListener('pointercancel', endPadDrag);
posPad.addEventListener('keydown', (e) => {
  const step = 4;
  let dx = 0, dy = 0;
  if (e.key === 'ArrowLeft') dx = -step;
  else if (e.key === 'ArrowRight') dx = step;
  else if (e.key === 'ArrowUp') dy = -step;
  else if (e.key === 'ArrowDown') dy = step;
  else return;
  e.preventDefault();
  e.stopPropagation();
  setOverlayPosition(ovPosX + dx, ovPosY + dy);
  setOverlayAlign(alignFromX(ovPosX));
  applyOverlaySettings();
  saveSettings();
});
setOverlayPosition(ovPosX, ovPosY);
setOverlayAlign(ovAlign);
overlayEl.classList.add('pos-smooth');

function hexToRgba(hex, alpha){
  const h = hex.replace('#','');
  const r = parseInt(h.substring(0,2), 16);
  const g = parseInt(h.substring(2,4), 16);
  const b = parseInt(h.substring(4,6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}


// Размер и отступ субтитров заданы в процентах от высоты кадра, поэтому в окне и в полном экране текст выглядит одинаково
const SUBS_SIZE_DEFAULT = 5;
const SUBS_POSITION_DEFAULT = 4.25;

// Собирает CSS text-shadow из значения 0..100 в мягкую тень
function textShadowFromPercent(pct){
  const f = Math.max(0, Math.min(100, parseFloat(pct) || 0)) / 100;
  if (f <= 0) return 'none';
  const alpha = (0.15 + f * 0.75).toFixed(3);
  const blur = (1 + f * 5).toFixed(1);
  const spread = (f * 3).toFixed(1);
  return `0 0 ${blur}px rgba(0,0,0,${alpha}), 0 ${spread}px ${blur}px rgba(0,0,0,${alpha})`;
}

// Обводка и тень субтитров как в VLC, обе считаются от размера шрифта и потому выглядят одинаково на любом размере
function subtitleTextShadow(fontSize){
  const w = Math.max(1, Math.round(fontSize / 22));
  const shadow = [[-w,-w],[0,-w],[w,-w],[w,0],[w,w],[0,w],[-w,w],[-w,0]]
    .map(([x, y]) => `${x}px ${y}px 0 #000`);
  const drop = Math.max(1, Math.round(fontSize / 20));
  shadow.push(`${drop}px ${drop}px ${(drop * 1.5).toFixed(1)}px rgba(0,0,0,0.5)`);
  return shadow.join(', ');
}

// Настройки сохраняются отдельно для каждого видео и не переносятся между файлами
function applyOverlaySettings(){
  const size = ovSize.value + 'px';
  const color = hexToRgba(ovColor.value, ovOpacity.value / 100);
  const shadow = textShadowFromPercent(ovShadow.value);
  ovTitle.style.fontSize = size;
  ovTime.style.fontSize = size;
  ovTitle.style.color = color;
  ovTime.style.color = color;
  ovTitle.style.textShadow = shadow;
  ovTime.style.textShadow = shadow;

  // Проценты пада переводятся в положение внутри кадра с одинаковым отступом в пикселях от краёв:
  // 1.5% ширины и 1.5% высоты это разные расстояния, и в углу оверлей стоял к боковому краю дальше, чем к верхнему
  const tx = (ovPosX - OV_POS_MIN) / (OV_POS_MAX - OV_POS_MIN);
  const ty = (ovPosY - OV_POS_MIN) / (OV_POS_MAX - OV_POS_MIN);
  overlayEl.style.left = `calc(${OV_INSET_X}px + (100% - ${2 * OV_INSET_X}px) * ${tx.toFixed(4)})`;
  overlayEl.style.top = `calc(${OV_INSET_Y}px + (100% - ${2 * OV_INSET_Y}px) * ${ty.toFixed(4)})`;
  overlayEl.style.transform = `translate(${(-tx * 100).toFixed(2)}%, ${(-ty * 100).toFixed(2)}%)`;
  overlayEl.style.alignItems = ovAlign === 'left' ? 'flex-start' : (ovAlign === 'right' ? 'flex-end' : 'center');
  overlayEl.style.background = hexToRgba('#000000', ovBgOpacity.value / 100);

  overlayEl.style.display = ovToggle.checked ? 'flex' : 'none';
}

let currentObjectUrl = null;
let durationChangeHandler = null;
let loadedMetadataHandler = null;
let uiSyncInterval = null;

// --- уведомление о недоступности localStorage (переполнена квота, приватный режим и т.п.) ---
const storageToast = document.getElementById('storage-toast');
const storageToastText = document.getElementById('storage-toast-text');
let storageToastTimeout = null;
let storageErrorShown = false; // Не показываем уведомление при каждом автоматическом сохранении

function showStorageToast(msg){
  storageToastText.textContent = msg;
  storageToast.classList.add('show');
  clearTimeout(storageToastTimeout);
  storageToastTimeout = setTimeout(() => storageToast.classList.remove('show'), TOAST_DURATION_MS);
}

function hideStorageToast(){
  clearTimeout(storageToastTimeout);
  storageToast.classList.remove('show');
}

// Нейтральная справка зрителю: у тоста хранилища красная рамка, она означает сбой
const infoToast = document.getElementById('info-toast');
const infoToastText = document.getElementById('info-toast-text');
let infoToastTimeout = null;
function showInfoToast(msg){
  infoToastText.textContent = msg;
  infoToast.classList.add('show');
  clearTimeout(infoToastTimeout);
  infoToastTimeout = setTimeout(() => infoToast.classList.remove('show'), TOAST_DURATION_MS);
}
function hideInfoToast(){
  clearTimeout(infoToastTimeout);
  infoToast.classList.remove('show');
}
document.getElementById('info-toast-close').addEventListener('click', hideInfoToast);

document.getElementById('storage-toast-close').addEventListener('click', hideStorageToast);

const codecWarningToast = document.getElementById('codec-warning-toast');
const codecWarningToastText = document.getElementById('codec-warning-toast-text');
let codecWarningTimeout = null;
const RISKY_VIDEO_CODECS = ['HEVC'];
// Эти звуковые дорожки Chrome не декодирует: картинка идёт, звука нет
const SILENT_AUDIO_CODECS = ['AC-3', 'E-AC-3', 'DTS', 'MLP FBA'];

function showCodecWarningToast(msg){
  codecWarningToastText.textContent = msg;
  codecWarningToast.classList.add('show');
  clearTimeout(codecWarningTimeout);
  codecWarningTimeout = setTimeout(() => codecWarningToast.classList.remove('show'), TOAST_DURATION_MS);
}

function hideCodecWarningToast(){
  clearTimeout(codecWarningTimeout);
  codecWarningToast.classList.remove('show');
}

document.getElementById('codec-warning-toast-close').addEventListener('click', hideCodecWarningToast);

function checkCodecWarning(result, token){
  if (token !== chapterParseToken) return;
  if (!result || !result.media || !Array.isArray(result.media.track)) return;
  const videoTrack = result.media.track.find(t => t && t['@type'] === 'Video');
  const format = videoTrack && videoTrack.Format ? videoTrack.Format.toUpperCase() : null;
  if (format && RISKY_VIDEO_CODECS.includes(format)) {
    showCodecWarningToast(`Видео в ${format}: если появится чёрный экран со звуком, конвертируйте файл в H.264`);
    return;
  }
  const audioTrack = result.media.track.find(t => t && t['@type'] === 'Audio');
  const audioFormat = audioTrack && audioTrack.Format ? String(audioTrack.Format).toUpperCase() : null;
  if (audioFormat && SILENT_AUDIO_CODECS.includes(audioFormat)) {
    const label = audioFormat === 'MLP FBA' ? 'TrueHD' : audioFormat;
    showCodecWarningToast(`Звук в ${label}: браузер не воспроизведёт эту дорожку, будет тишина. Перекодируйте звук в AAC`);
  }
}

function notifyStorageIssue(){
  if (storageErrorShown) return;
  storageErrorShown = true;
  showStorageToast('Не удалось сохранить настройки или прогресс. Хранилище браузера недоступно или переполнено');
}

// Вызывается после любой удачной записи, чтобы следующий сбой снова показал уведомление
function markStorageOk(){
  storageErrorShown = false;
}

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



function isDurationUsable(){
  return isFinite(video.duration) && video.duration > 0;
}
function fixInfiniteDuration(onReady){
  if (isDurationUsable()){
    updateSeekControlsState();
    if (onReady) onReady();
    return;
  }
  updateSeekControlsState();
// Приостанавливаем воспроизведение во время проверки длительности, чтобы скрыть служебный переход в конец файла и обратно
  const wasPlaying = !video.paused;
  if (wasPlaying) video.pause();
  let settled = false;
  let watchdog = null;
  const finish = (resetTime) => {
    if (settled) return;
    settled = true;
    clearTimeout(watchdog);
    video.removeEventListener('timeupdate', onTimeUpdate);
    if (resetTime){
      try { video.currentTime = 0; } catch(e){}
    }
    updateSeekControlsState();
    if (wasPlaying) safePlay();
    if (onReady) onReady();
  };
  const onTimeUpdate = () => finish(true);
  video.addEventListener('timeupdate', onTimeUpdate);
  // Страховка: если timeupdate так и не пришёл (битый контейнер), не зависаем на чёрном кадре
  watchdog = setTimeout(() => finish(false), 3000);
  try { video.currentTime = 1e101; } catch(e){ /* браузер сам ужмёт значение */ }
}

function formatTime(sec){
  if (!isFinite(sec)) return '00:00';
// Приводим отрицательное значение прогресса к нулю, чтобы не отображать некорректное время
  if (sec < 0) sec = 0;
  const h = Math.floor(sec/3600);
  const m = Math.floor((sec%3600)/60);
  const s = Math.floor(sec%60);
  const pad = n => String(n).padStart(2,'0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// Текущее время и длительность одним форматом: при фильме длиннее часа текущее тоже с часами,
// иначе на отметке 1:00:00 строка меняет ширину и кнопки рядом дёргаются
function formatTimePair(t, duration){
  const withHours = isFinite(duration) && duration >= 3600;
  const cur = withHours && isFinite(t) && t < 3600 ? '0:' + formatTime(t) : formatTime(t);
  return `${cur} / ${formatTime(duration)}`;
}

