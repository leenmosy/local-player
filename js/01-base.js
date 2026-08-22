// 01-base.js — Блокировка мобильных, ссылки на DOM, константы, оверлей, тосты хранилища
// Часть Local Player. Файлы подключаются классическими <script> по порядку
// из index.html и делят общую область видимости — см. js/README.md
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
    // Раньше сюда попадал и десктоп с узким/низким окном при коротком касании
    // (сенсорный монитор, ноутбук с тачскрином) — плеер молча пропадал (баг L-12).
    // Ужесточаем порог и требуем отсутствия мыши.
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
const audioHint = document.getElementById('audio-hint');
const audioHintClose = document.getElementById('audio-hint-close');
const audioHintProgressFill = document.getElementById('audio-hint-progress-fill');

// Обработчик закрытия подсказки
audioHintClose.addEventListener('click', () => {
  audioHint.classList.add('hidden');
});

// Скрываем подсказку, когда полоска прогресса дойдёт до конца
// (если навести мышкой на плашку, CSS ставит анимацию на паузу — событие не сработает, пока не убрать курсор)
audioHintProgressFill.addEventListener('animationend', () => {
  audioHint.classList.add('hidden');
});

// Показывает подсказку и перезапускает полоску прогресса с нуля
function showAudioHint(){
  audioHint.style.display = 'block';
  audioHint.classList.remove('hidden');
  audioHintProgressFill.style.animation = 'none';
  void audioHintProgressFill.offsetWidth; // форсируем reflow, чтобы анимация перезапустилась
  audioHintProgressFill.style.animation = '';
}

// --- элементы управления оверлеем ---
const ovToggle = document.getElementById('ov-toggle');
const ovSize = document.getElementById('ov-size');
const ovSizeVal = document.getElementById('ov-size-val');
const ovColor = document.getElementById('ov-color');
const ovOpacity = document.getElementById('ov-opacity');
const ovOpacityVal = document.getElementById('ov-opacity-val');
const posPad = document.getElementById('pos-pad');
const posHandle = document.getElementById('pos-handle');
const alignButtons = document.querySelectorAll('.align-btn');
const presetButtons = document.querySelectorAll('.preset-btn');

const OV_POS_MIN = 1.5;
const OV_POS_MAX = 98.5;

const OV_DEFAULT_SIZE = 17;
const OV_DEFAULT_COLOR = '#ffffff';
const OV_DEFAULT_OPACITY = 50;
const OV_DEFAULT_POS_X = OV_POS_MAX;
const OV_DEFAULT_POS_Y = OV_POS_MAX;
const OV_DEFAULT_ALIGN = 'right';

// Громкость по умолчанию для файла, у которого ещё нет сохранённых настроек —
// именно ползунок в плеере, а не что-то из панели настроек.
const DEFAULT_VOLUME = 0.2;

let ovPosX = OV_DEFAULT_POS_X;
let ovPosY = OV_DEFAULT_POS_Y;
let ovAlign = OV_DEFAULT_ALIGN;

ovToggle.addEventListener('change', () => { applyOverlaySettings(); saveSettings(); });
ovSize.addEventListener('input', () => { ovSizeVal.textContent = ovSize.value + 'px'; applyOverlaySettings(); saveSettings(); });
ovColor.addEventListener('input', () => { applyOverlaySettings(); saveSettings(); });
ovOpacity.addEventListener('input', () => { ovOpacityVal.textContent = ovOpacity.value + '%'; applyOverlaySettings(); saveSettings(); });
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
  // не даём поставить оверлей впритык к краю кадра
  ovPosX = Math.max(OV_POS_MIN, Math.min(OV_POS_MAX, x));
  ovPosY = Math.max(OV_POS_MIN, Math.min(OV_POS_MAX, y));
  posHandle.style.left = ovPosX + '%';
  posHandle.style.top = ovPosY + '%';
  syncPresetActiveState();
}

// --- пресеты быстрого позиционирования (4 угла) ---
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
  applyOverlaySettings();
}

posPad.addEventListener('pointerdown', (e) => {
  draggingPad = true;
  overlayEl.classList.remove('pos-smooth');
  posPad.setPointerCapture(e.pointerId);
  const p = posFromPointer(e);
  setOverlayPosition(p.x, p.y);
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


// Применяет глобальные настройки по умолчанию к элементам управления. Вызывается
// в ветке «у этого видео ещё нет своих настроек» вместо жёстких констант (баг M-19).
function applyGlobalDefaultsToUi(){
  const d = loadGlobalDefaults();
  if (!d || d.ts === undefined) return;
  const num = (v, min, max, fallback) => {
    const n = parseFloat(v);
    return isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  if (d.volume !== undefined){
    video.volume = num(d.volume, 0, 1, DEFAULT_VOLUME);
    volumeRange.value = video.volume;
    updateVolumeIcon();
  }
  if (d.drToggle !== undefined){ drToggle.checked = !!d.drToggle; drEnabled = !!d.drToggle; }
  if (d.drStrength !== undefined){ drStrength.value = num(d.drStrength, 0, 100, 70); drStrengthVal.textContent = drStrength.value + '%'; }
  if (d.drBoost !== undefined){ drBoost.value = num(d.drBoost, 100, 300, 100); drBoostVal.textContent = drBoost.value + '%'; }
  if (d.subsToggle !== undefined){ subsToggle.checked = !!d.subsToggle; subtitles.style.display = subsToggle.checked ? 'block' : 'none'; }
  if (d.subsSize !== undefined){ subsSize.value = num(d.subsSize, 12, 48, 28); subsSizeVal.textContent = subsSize.value + 'px'; }
  if (d.subsColor !== undefined && /^#[0-9a-f]{6}$/i.test(d.subsColor)) subsColor.value = d.subsColor;
  if (d.subsOpacity !== undefined){ subsOpacity.value = num(d.subsOpacity, 0, 100, 100); subsOpacityVal.textContent = subsOpacity.value + '%'; }
  applySubtitlesStyle();
  if (d.ovToggle !== undefined) ovToggle.checked = !!d.ovToggle;
  if (d.ovSize !== undefined){ ovSize.value = num(d.ovSize, 10, 20, OV_DEFAULT_SIZE); ovSizeVal.textContent = ovSize.value + 'px'; }
  if (d.ovColor !== undefined && /^#[0-9a-f]{6}$/i.test(d.ovColor)) ovColor.value = d.ovColor;
  if (d.ovOpacity !== undefined){ ovOpacity.value = num(d.ovOpacity, 0, 100, OV_DEFAULT_OPACITY); ovOpacityVal.textContent = ovOpacity.value + '%'; }
  if (d.ovAlign) setOverlayAlign(d.ovAlign);
  if (d.ovPosX !== undefined && d.ovPosY !== undefined) setOverlayPosition(num(d.ovPosX,0,100,OV_DEFAULT_POS_X), num(d.ovPosY,0,100,OV_DEFAULT_POS_Y));
  applyOverlaySettings();
  if (audioCtx){ updateCompressor(); connectGraph(); }
}

function applyOverlaySettings(){
  const color = hexToRgba(ovColor.value, ovOpacity.value / 100);
  // Базовый размер — в CSS-переменную, итоговый кегль умножается на масштаб сцены,
  // чтобы оверлей не мельчал в полноэкранном режиме (баг M-7)
  overlayEl.style.setProperty('--ov-size', ovSize.value + 'px');
  ovTitle.style.fontSize = '';
  ovTime.style.fontSize = '';
  ovTitle.style.color = color;
  ovTime.style.color = color;

  overlayEl.style.left = ovPosX + '%';
  overlayEl.style.top = ovPosY + '%';
  // Непрерывная привязка: якорь смещается пропорционально позиции,
  // без резких скачков при пересечении пороговых зон.
  overlayEl.style.transform = `translate(${-ovPosX}%, ${-ovPosY}%)`;
  overlayEl.style.alignItems = ovAlign === 'left' ? 'flex-start' : (ovAlign === 'right' ? 'flex-end' : 'center');

  overlayEl.style.display = ovToggle.checked ? 'flex' : 'none';
}

let currentObjectUrl = null;
let durationChangeHandler = null;
let loadedMetadataHandler = null;
let uiSyncInterval = null;

// --- уведомление о недоступности localStorage (переполнена квота, приватный режим и т.п.) ---
const storageToast = document.getElementById('storage-toast');
let storageToastTimeout = null;
let storageErrorShown = false; // не спамим одним и тем же сообщением на каждое авто-сохранение

function showStorageToast(msg){
  storageToast.textContent = msg;
  storageToast.classList.add('show');
  clearTimeout(storageToastTimeout);
  storageToastTimeout = setTimeout(() => storageToast.classList.remove('show'), 5000);
}

function notifyStorageIssue(){
  if (storageErrorShown) return;
  storageErrorShown = true;
  showStorageToast('Не удалось сохранить настройки или прогресс — хранилище браузера недоступно или переполнено');
}

// Вызывается после любой удачной записи, чтобы следующий сбой снова показал уведомление
function markStorageOk(){
  storageErrorShown = false;
}

// Debouncing для saveSettings
let saveSettingsTimeout = null;
const SAVE_SETTINGS_DELAY = 150; // 150 мс - баланс между UX и производительностью

// Единый сборщик настроек текущего источника. Раньше этот объект на 25 полей был
// дословно продублирован в saveSettings() и saveSettingsImmediate(): добавление
// новой настройки требовало помнить про обе копии.
function collectSettings(){
  return {
    drToggle: drToggle.checked,
    drStrength: parseFloat(drStrength.value),
    drBoost: parseFloat(drBoost.value),
    drSpeed: parseFloat(drSpeed.value),
    drBrightness: parseFloat(drBrightness.value),
    zoomLevel: zoomLevel,
    mirror: mirrorEnabled,
    blurRanges: blurRanges,
    ovToggle: ovToggle.checked,
    ovSize: parseFloat(ovSize.value),
    ovColor: ovColor.value,
    ovOpacity: parseFloat(ovOpacity.value),
    ovPosX: ovPosX,
    ovPosY: ovPosY,
    ovAlign: ovAlign,
    titleInput: titleInput.value,
    volume: video.volume,
    muted: video.muted,
    subsToggle: subsToggle.checked,
    subsSize: parseFloat(subsSize.value),
    subsColor: subsColor.value,
    subsOpacity: parseFloat(subsOpacity.value),
    ts: Date.now()
  };
}

// Единая запись настроек в хранилище
function persistSettings(){
  try{
    const settings = collectSettings();
    localStorage.setItem(settingsKey(currentFileKey), JSON.stringify(settings));
    saveGlobalDefaults(settings);
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
  // Приостанавливаем воспроизведение на время "прощупывания" длины,
  // чтобы пользователь не увидел вспышку последнего кадра/щелчок звука
  // в момент служебного скачка в конец файла и обратно.
  const wasPlaying = !video.paused;
  if (wasPlaying) video.pause();
  const onTimeUpdate = () => {
    video.removeEventListener('timeupdate', onTimeUpdate);
    video.currentTime = 0;
    updateSeekControlsState();
    if (wasPlaying) video.play().catch(e => {
      if (e.name === 'NotAllowedError') {
        console.log('Autoplay prevented - user interaction required');
      } else {
        console.warn('Play error:', e);
      }
    });
    if (onReady) onReady();
  };
  video.addEventListener('timeupdate', onTimeUpdate);
  try { video.currentTime = 1e101; } catch(e){ /* браузер сам ужмёт значение */ }
}

function formatTime(sec){
  if (!isFinite(sec)) return '00:00';
  // Отрицательные значения (например, из повреждённой записи прогресса
  // в localStorage) не должны отображаться как есть — тихо приводим к нулю,
  // а не показываем пользователю сломанную строку вроде "-1:-5".
  if (sec < 0) sec = 0;
  const h = Math.floor(sec/3600);
  const m = Math.floor((sec%3600)/60);
  const s = Math.floor(sec%60);
  const pad = n => String(n).padStart(2,'0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
