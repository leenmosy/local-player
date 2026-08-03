// Плеер рассчитан только на десктоп/ноутбук (мышь + клавиатура).
// Определяем телефоны/планшеты и показываем заглушку вместо интерфейса.
(function blockMobileDevices(){
  const ua = navigator.userAgent;

  // Явные мобильные/планшетные UA (Android, iPhone, iPad "как есть", и т.д.)
  const uaIsMobile = /Android|iPhone|iPod|iPad|Windows Phone|BlackBerry|IEMobile|Opera Mini/i.test(ua);

  // iPadOS в Safari маскируется под Mac, но выдаёт себя множественными точками касания
  const isIPadOS = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;

  // Тачскрин без мыши/трекпада — считаем признаком мобильного/планшета,
  // но только при небольшом разрешении: реальные телефоны/планшеты не бывают
  // с viewport крупнее ~1024px по меньшей стороне (даже iPad Pro landscape —
  // это 1366×1024). Так не блокируются десктопные тач-мониторы/панели.
  const coarseOnly = window.matchMedia('(pointer: coarse)').matches
    && !window.matchMedia('(pointer: fine)').matches
    && Math.min(window.innerWidth, window.innerHeight) <= 1024;

  if (uaIsMobile || isIPadOS || coarseOnly){
    document.documentElement.classList.add('device-blocked');
  }
})();

// Визуальный эффект "нажатия" кнопки (замена CSS :active) — срабатывает
// только на левую кнопку мыши (e.button === 0), чтобы ПКМ/СКМ не создавали
// впечатление, будто кнопка реагирует, хотя реальное действие не выполняется.
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
const fileInput = document.getElementById('file-input');
const dropView = document.getElementById('drop-view');
const playerView = document.getElementById('player-view');
const errMsg = document.getElementById('err-msg');
let errMsgTimeout = null;
// Текст "постоянного" сообщения (например, предупреждение о неподдерживаемом
// браузере) — в отличие от обычных ошибок оно не должно затухать само, но
// должно вернуться на место после того, как временная ошибка отгорит.
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
  }, opts.duration || 4500);
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
const resumeList = document.getElementById('resume-list');
const videoErrorEl = document.getElementById('video-error');
const centerPlayIcon = document.getElementById('center-play-icon');
const centerIconPlay = document.getElementById('center-icon-play');
const centerIconPause = document.getElementById('center-icon-pause');
const subsFileName = document.getElementById('subs-file-name');
const subsRemoveBtn = document.getElementById('subs-remove-btn');
const urlLoadingSpinner = document.getElementById('url-loading-spinner');

// --- заголовки сворачиваемых категорий ---
const categoryHeaders = document.querySelectorAll('.dr-category-header');

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
  ovTitle.textContent = titleInput.value || '—';
  saveSettings();
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

function applyOverlaySettings(){
  const size = ovSize.value + 'px';
  const color = hexToRgba(ovColor.value, ovOpacity.value / 100);
  ovTitle.style.fontSize = size;
  ovTime.style.fontSize = size;
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
  showStorageToast('Не удалось сохранить настройки или прогресс — хранилище браузера недоступно или переполнено.');
}

// Вызывается после любой удачной записи, чтобы следующий сбой снова показал уведомление
function markStorageOk(){
  storageErrorShown = false;
}

// Debouncing для saveSettings
let saveSettingsTimeout = null;
const SAVE_SETTINGS_DELAY = 150; // 150 мс - баланс между UX и производительностью

function saveSettings(){
  if (!currentFileKey) return;
  
  // Отменяем предыдущий таймер
  if (saveSettingsTimeout) {
    clearTimeout(saveSettingsTimeout);
  }
  
  // Устанавливаем новый таймер
  saveSettingsTimeout = setTimeout(() => {
    try{
      const settings = {
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
        subsBg: subsBg.value,
        subsBgOpacity: parseFloat(subsBgOpacity.value),
        subsBottom: parseFloat(subsBottom.value),
        ts: Date.now()
      };
      localStorage.setItem(settingsKey(currentFileKey), JSON.stringify(settings));
      cleanupStorage(SETTINGS_PREFIX);
      markStorageOk();
    } catch(e){ notifyStorageIssue(); }
  }, SAVE_SETTINGS_DELAY);
}

// Мгновенное сохранение (для критических изменений)
function saveSettingsImmediate(){
  if (!currentFileKey) return;
  if (saveSettingsTimeout) {
    clearTimeout(saveSettingsTimeout);
    saveSettingsTimeout = null;
  }
  try{
    const settings = {
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
      subsBg: subsBg.value,
      subsBgOpacity: parseFloat(subsBgOpacity.value),
      subsBottom: parseFloat(subsBottom.value),
      ts: Date.now()
    };
    localStorage.setItem(settingsKey(currentFileKey), JSON.stringify(settings));
    cleanupStorage(SETTINGS_PREFIX);
    markStorageOk();
  } catch(e){ notifyStorageIssue(); }
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
  const h = Math.floor(sec/3600);
  const m = Math.floor((sec%3600)/60);
  const s = Math.floor(sec%60);
  const pad = n => String(n).padStart(2,'0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// --- тайминги: экран размывается в заданные промежутки (бан-моменты для стримеров) ---
const BLUR_AMOUNT_PX = 40;
const timingFromInput = document.getElementById('timing-from');
const timingToInput = document.getElementById('timing-to');
const timingAddBtn = document.getElementById('timing-add-btn');
const timingErr = document.getElementById('timing-err');
const timingList = document.getElementById('timing-list');

let blurRanges = []; // [{ from: сек, to: сек }, ...], отсортировано по from
let currentEditingItem = null; // текущий редактируемый элемент
let isEditing = false; // флаг для предотвращения одновременного редактирования

// Проверка пересечения с существующими диапазонами (excludeIdx — свой же индекс при редактировании)
// Диапазоны, стыкующиеся впритык (конец одного равен началу другого), пересечением не считаются —
// они образуют непрерывный блюр без разрыва.
function findOverlappingRange(from, to, excludeIdx){
  return blurRanges.some((r, i) => i !== excludeIdx && !(to <= r.from || from >= r.to));
}

function parseTimeToSeconds(str){
  if (!str) return null;
  const parts = str.trim().split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map(p => p.trim());
  if (nums.some(p => p === '' || !/^\d+$/.test(p))) return null;
  const vals = nums.map(Number);
  
  let seconds;
  if (vals.length === 2){
    const [m, s] = vals;
    // Проверяем валидность минут и секунд
    if (s >= 60) return null; // секунды должны быть < 60
    seconds = m * 60 + s;
  } else {
    const [h, m, s] = vals;
    // Проверяем валидность часов, минут и секунд
    if (h > 99) return null; // часы должны быть <= 99
    if (m >= 60) return null; // минуты должны быть < 60
    if (s >= 60) return null; // секунды должны быть < 60
    seconds = h * 3600 + m * 60 + s;
  }
  return seconds >= 0 ? seconds : null;
}

function renderBlurRanges(){
  timingList.innerHTML = '';
  blurRanges.forEach((range, idx) => {
    const item = document.createElement('div');
    item.className = 'timing-item';
    
    const rangeText = document.createElement('span');
    rangeText.className = 'timing-range';
    rangeText.textContent = `${formatTime(range.from)} – ${formatTime(range.to)}`;
    rangeText.style.cursor = 'pointer';
    
    rangeText.addEventListener('click', (e) => {
      e.stopPropagation();
      startEditingRange(idx, item, rangeText);
    });
    
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'timing-remove-btn';
    removeBtn.setAttribute('aria-label', 'Удалить тайминг');
    removeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      blurRanges.splice(idx, 1);
      stopEditingSession();
      renderBlurRanges();
      updateVideoFilter();
      saveSettings();
    });
    
    item.appendChild(rangeText);
    item.appendChild(removeBtn);
    
    // Предотвращаем закрытие настроек при клике на элемент
    item.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    
    timingList.appendChild(item);
  });
}

let activeOutsideClickHandler = null;

// Единая точка завершения сессии редактирования — снимает обработчик клика вне поля
// и сбрасывает флаги, чтобы состояние редактирования не «зависало» между рендерами
function stopEditingSession(){
  if (activeOutsideClickHandler){
    document.removeEventListener('click', activeOutsideClickHandler, true);
    activeOutsideClickHandler = null;
  }
  currentEditingItem = null;
  isEditing = false;
}

function startEditingRange(idx, item, rangeText) {
  // Если кликнули на уже редактируемый диапазон, ничего не делаем
  if (currentEditingItem === item) {
    return;
  }

  // Если уже редактируем другой диапазон — закрываем его и переключаемся на новый
  if (currentEditingItem !== null) {
    stopEditingSession();
    renderBlurRanges();
    // После перерендеринга находим новый элемент по индексу
    setTimeout(() => {
      const newItems = timingList.querySelectorAll('.timing-item');
      if (newItems[idx]) {
        const newItem = newItems[idx];
        const newRangeText = newItem.querySelector('.timing-range');
        if (newRangeText) {
          startEditingRange(idx, newItem, newRangeText);
        }
      }
    }, 0);
    return;
  }
  
  // Проверяем, что элемент всё ещё существует в DOM
  if (!document.body.contains(item)) {
    currentEditingItem = null;
    return;
  }
  
  try {
    isEditing = true;
    currentEditingItem = item;
    const range = blurRanges[idx];
  
  // Создаем редактируемые поля
  const editContainer = document.createElement('div');
  editContainer.className = 'timing-edit-container';
  editContainer.style.display = 'flex';
  editContainer.style.alignItems = 'center';
  editContainer.style.gap = '6px';
  editContainer.style.flex = '1';
  
  const fromInput = document.createElement('input');
  fromInput.type = 'text';
  fromInput.className = 'dr-text-input timing-time-input';
  fromInput.value = formatTime(range.from);
  fromInput.style.flex = '1';
  
  const dash = document.createElement('span');
  dash.className = 'timing-dash';
  dash.textContent = '–';
  
  const toInput = document.createElement('input');
  toInput.type = 'text';
  toInput.className = 'dr-text-input timing-time-input';
  toInput.value = formatTime(range.to);
  toInput.style.flex = '1';
  
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'timing-add-btn';
  saveBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  saveBtn.title = 'Сохранить';
  
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'timing-remove-btn';
  cancelBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
  cancelBtn.title = 'Отмена';
  
  editContainer.appendChild(fromInput);
  editContainer.appendChild(dash);
  editContainer.appendChild(toInput);
  editContainer.appendChild(saveBtn);
  editContainer.appendChild(cancelBtn);
  
  // Заменяем текст на редактируемые поля
  item.replaceChild(editContainer, rangeText);
  
  // Предотвращаем закрытие настроек при клике на контейнер редактирования
  editContainer.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
  // Фокус на первое поле
  fromInput.focus();
  fromInput.select();
  
  // Функция сохранения
  const saveEdit = () => {
    const from = parseTimeToSeconds(fromInput.value);
    const to = parseTimeToSeconds(toInput.value);
    
    if (from === null || to === null) {
      fromInput.classList.add('has-error');
      toInput.classList.add('has-error');
      return;
    }
    
    if (to <= from) {
      fromInput.classList.add('has-error');
      toInput.classList.add('has-error');
      fromInput.title = 'Время окончания должно быть больше времени начала';
      toInput.title = 'Время окончания должно быть больше времени начала';
      return;
    }

    if (findOverlappingRange(from, to, idx)) {
      fromInput.classList.add('has-error');
      toInput.classList.add('has-error');
      fromInput.title = 'Этот диапазон пересекается с другим';
      toInput.title = 'Этот диапазон пересекается с другим';
      return;
    }

    if (isDurationUsable() && to > video.duration) {
      fromInput.classList.add('has-error');
      toInput.classList.add('has-error');
      fromInput.title = 'Время окончания превышает длительность видео';
      toInput.title = 'Время окончания превышает длительность видео';
      return;
    }
    
    // Сбрасываем стили ошибок
    fromInput.classList.remove('has-error');
    toInput.classList.remove('has-error');
    fromInput.title = '';
    toInput.title = '';
    
    // Обновляем диапазон
    blurRanges[idx] = { from, to };
    blurRanges.sort((a, b) => a.from - b.from);
    stopEditingSession();
    renderBlurRanges();
    updateVideoFilter();
    saveSettings();
  };
  
  // Функция отмены
  const cancelEdit = () => {
    stopEditingSession();
    renderBlurRanges();
  };
  
  // Обработчики
  saveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    saveEdit();
  });
  
  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    cancelEdit();
  });
  
  // Предотвращаем закрытие при клике на инпуты
  fromInput.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
  toInput.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
  // Закрытие редактирования при клике вне области
  const closeOnClickOutside = (e) => {
    // Если клик не в редактируемом элементе и не в контейнере редактирования
    if (!editContainer.contains(e.target) && !item.contains(e.target)) {
      stopEditingSession();
      renderBlurRanges();
    }
  };
  
  // Добавляем обработчик в capture фазе, чтобы перехватить клики раньше
  setTimeout(() => {
    document.addEventListener('click', closeOnClickOutside, true);
    activeOutsideClickHandler = closeOnClickOutside;
  }, 10);
  
  // Сохранение при Enter
  fromInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      toInput.focus();
      toInput.select();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  });
  
  toInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  });
  
  // Сброс стилей ошибок при вводе
  fromInput.addEventListener('input', () => {
    fromInput.classList.remove('has-error');
  });
  
  toInput.addEventListener('input', () => {
    toInput.classList.remove('has-error');
  });
  } catch (e) {
    console.error('Error in startEditingRange:', e);
    stopEditingSession();
    renderBlurRanges();
  }
}

let timingErrTimeout = null;
function showTimingError(msg){
  timingErr.textContent = msg;
  timingErr.classList.add('show');
  clearTimeout(timingErrTimeout);
  timingErrTimeout = setTimeout(() => clearTimingError(), 4500);
}
function clearTimingError(){
  clearTimeout(timingErrTimeout);
  timingErr.textContent = '';
  timingErr.classList.remove('show');
}

timingAddBtn.addEventListener('click', () => {
  clearTimingError();
  const from = parseTimeToSeconds(timingFromInput.value);
  const to = parseTimeToSeconds(timingToInput.value);
  if (from === null || to === null){
    showTimingError('Неверный формат времени. Используй мм:сс или ч:мм:сс');
    return;
  }
  if (to <= from){
    showTimingError('Время окончания должно быть больше времени начала');
    return;
  }
  // Проверка на пересечение с существующими диапазонами
  const hasOverlap = findOverlappingRange(from, to, -1);
  if (hasOverlap){
    showTimingError('Этот диапазон пересекается с существующим');
    return;
  }
  // Проверка на превышение длительности видео
  if (isDurationUsable() && to > video.duration){
    showTimingError('Время окончания превышает длительность видео');
    return;
  }
  blurRanges.push({ from, to });
  blurRanges.sort((a, b) => a.from - b.from);
  renderBlurRanges();
  updateVideoFilter();
  saveSettings();
  timingFromInput.value = '';
  timingToInput.value = '';
  timingFromInput.focus();
});

function isInBlurRange(t){
  // "до" указывается с точностью до секунды — считаем её включительно
  // до конца этой секунды, а не только до её начала.
  return blurRanges.some(r => t >= r.from && t < r.to + 1);
}

// --- единая точка применения фильтров видео (яркость + размытие тайминга) ---
function updateVideoFilter(){
  const parts = [];
  const brightness = drBrightness.value / 100;
  if (brightness !== 1) parts.push(`brightness(${brightness})`);
  if (isInBlurRange(video.currentTime)) parts.push(`blur(${BLUR_AMOUNT_PX}px)`);
  video.style.filter = parts.join(' ');
}

function niceTitleFromFilename(name){
  const withoutExt = name.replace(/\.[^/.]+$/, '');
  return withoutExt.replace(/[._]/g, ' ').trim();
}

// Имя файла обрезается многоточием — дублируем в title для наведения
function setSubsFileNameDisplay(name){
  const nameWithoutExt = name === 'Файл не выбран' ? name : name.replace(/\.[^/.]+$/, '');
  subsFileName.textContent = nameWithoutExt;
  subsFileName.title = name === 'Файл не выбран' ? '' : name;
}

// --- запоминание тайминга просмотра (localStorage) ---
const PROGRESS_PREFIX = 'lp_progress:';
// Префикс для видео, открытых по ссылке (m3u8/mp4-URL). Раньше такие записи хранились
// как 'url:' + url БЕЗ PROGRESS_PREFIX — то есть в отдельном пространстве ключей, которое
// cleanupStorage()/removeDuplicateProgress()/renderResumeList() вообще не видели. Из-за
// этого url-записи никогда не чистились и не попадали в общий список «Продолжить».
// Теперь они тоже живут под PROGRESS_PREFIX и участвуют в общей логике.
const URL_KEY_PREFIX = PROGRESS_PREFIX + 'url:';
const SETTINGS_PREFIX = 'lp_settings:';
const SUBS_PREFIX = 'lp_subs:';
const MAX_STORAGE_ENTRIES = 20; // Максимальное количество записей каждого типа
let currentFileKey = null;
let currentFileName = null;
let progressInterval = null;

function fileKey(file){
  return PROGRESS_PREFIX + file.name + ':' + file.size + ':' + (file.lastModified || 0);
}
function urlKey(url){
  return URL_KEY_PREFIX + url;
}
function settingsKey(key){
  return SETTINGS_PREFIX + key.replace(PROGRESS_PREFIX, '');
}
function subsKey(key){
  return SUBS_PREFIX + key.replace(PROGRESS_PREFIX, '');
}

// Очистка старых записей localStorage для предотвращения переполнения
function cleanupStorage(prefix){
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
  // Удаляем старые записи, если их больше MAX_STORAGE_ENTRIES
  if (items.length > MAX_STORAGE_ENTRIES){
    for (let i = MAX_STORAGE_ENTRIES; i < items.length; i++){
      try{
        localStorage.removeItem(items[i].key);
      } catch(e){ /* игнорируем ошибки при удалении */ }
    }
  }
}

function saveProgress(){
  if (!currentFileKey || !video.duration || !isFinite(video.duration)) return;
  try{
    // Тут храним только прогресс просмотра, не настройки (settingsKey не трогаем)
    // Убрано условие по времени - теперь прогресс сохраняется при любом просмотре
    const progressData = {
      t: video.currentTime,
      duration: video.duration,
      ts: Date.now(),
      name: currentFileName,
      source: currentFileKey.startsWith(URL_KEY_PREFIX) ? 'url' : 'file'
    };
    // Для URL-ссылок сохраняем также сам URL
    if (currentFileKey.startsWith(URL_KEY_PREFIX)){
      progressData.url = currentFileKey.slice(URL_KEY_PREFIX.length);
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

// Удаляет дубликаты прогресса по размеру и дате изменения файла
function removeDuplicateProgress(currentKey){
  if (!currentKey) return;
  // URL-ключи (PROGRESS_PREFIX + 'url:' + ссылка) не имеют размера/даты файла — сама
  // ссылка тоже содержит двоеточия, так что дедуп по последним двум ':'-сегментам
  // здесь бессмысленен и может дать случайные совпадения. Для url-записей дедуп не нужен:
  // одна и та же ссылка и так перезапишет саму себя по одинаковому ключу.
  if (currentKey.startsWith(URL_KEY_PREFIX)) return;
  
  // Получаем размер и дату из текущего ключа
  const parts = currentKey.split(':');
  if (parts.length < 3) return;
  
  const size = parts[parts.length - 2];
  const lastModified = parts[parts.length - 1];
  
  // Сначала собираем все ключи для удаления, чтобы не итерировать во время изменения
  const keysToDelete = [];
  for (let i = 0; i < localStorage.length; i++){
    const key = localStorage.key(i);
    if (!key || key === currentKey) continue;
    if (!key.startsWith(PROGRESS_PREFIX)) continue;
    // url-записи пропускаем — у них нет размера/даты, сравнивать их по этому принципу нельзя
    if (key.startsWith(URL_KEY_PREFIX)) continue;
    const keyParts = key.split(':');
    if (keyParts.length >= 3 && keyParts[keyParts.length - 2] === size && keyParts[keyParts.length - 1] === lastModified){
      keysToDelete.push(key);
    }
  }
  
  // Удаляем все найденные дубликаты
  keysToDelete.forEach(key => {
    localStorage.removeItem(key);
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
      data.name = currentFileName;
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
    
    settings.drStrength = validateNumber(settings.drStrength, 0, 100, 60);
    settings.drBoost = validateNumber(settings.drBoost, 100, 500, 100);
    settings.drSpeed = validateNumber(settings.drSpeed, 0.25, 2, 1);
    settings.drBrightness = validateNumber(settings.drBrightness, 50, 200, 100);
    settings.zoomLevel = validateNumber(settings.zoomLevel, 50, 200, 100);
    settings.ovSize = validateNumber(settings.ovSize, 10, 32, OV_DEFAULT_SIZE);
    settings.ovOpacity = validateNumber(settings.ovOpacity, 0, 100, OV_DEFAULT_OPACITY);
    
    // Валидация настроек субтитров
    settings.subsSize = validateNumber(settings.subsSize, 20, 40, 30);
    settings.subsOpacity = validateNumber(settings.subsOpacity, 0, 100, 100);
    settings.subsBgOpacity = validateNumber(settings.subsBgOpacity, 0, 100, 50);
    settings.subsBottom = validateNumber(settings.subsBottom, 0, 25, 15);
    
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
      settings.subsColor = '#ffffff';
    }
    if (typeof settings.subsBg !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(settings.subsBg)) {
      settings.subsBg = '#000000';
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
    drSpeedVal.textContent = drSpeed.value + 'x';
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
    
    titleInput.value = settings.titleInput !== undefined ? settings.titleInput : niceTitleFromFilename(currentFileName);
    ovTitle.textContent = titleInput.value || '—';
    
    applyOverlaySettings();
    
    // Восстанавливаем настройки субтитров
    subsToggle.checked = settings.subsToggle !== undefined ? settings.subsToggle : true;
    subtitles.style.display = subsToggle.checked ? 'block' : 'none';
    
    subsSize.value = settings.subsSize !== undefined ? settings.subsSize : 30;
    subsSizeVal.textContent = subsSize.value + 'px';
    
    subsColor.value = settings.subsColor !== undefined ? settings.subsColor : '#ffffff';
    subsOpacity.value = settings.subsOpacity !== undefined ? settings.subsOpacity : 100;
    subsOpacityVal.textContent = subsOpacity.value + '%';
    
    subsBg.value = settings.subsBg !== undefined ? settings.subsBg : '#000000';
    subsBgOpacity.value = settings.subsBgOpacity !== undefined ? settings.subsBgOpacity : 50;
    subsBgOpacityVal.textContent = subsBgOpacity.value + '%';
    
    subsBottom.value = settings.subsBottom !== undefined ? settings.subsBottom : 15;
    subsBottomVal.textContent = subsBottom.value + '%';
    
    applySubtitlesStyle();
    
    // Восстанавливаем содержимое субтитров из отдельного ключа
    const subsRaw = localStorage.getItem(subsKey(currentFileKey));
    if (subsRaw) {
      try {
        const subsData = JSON.parse(subsRaw);
        subtitlesData = JSON.parse(subsData.content);
        savedSubsContent = subsData.content;
        isSubtitlesLoaded = true;
        if (subsData.fileName) {
          setSubsFileNameDisplay(subsData.fileName);
        }
        // Показываем кнопку удаления если есть загруженные субтитры
        subsRemoveBtn.style.display = 'flex';
      } catch(e) {
        subtitlesData = [];
        savedSubsContent = null;
        isSubtitlesLoaded = false;
      }
    } else {
      savedSubsContent = null;
      isSubtitlesLoaded = false;
      subtitlesData = [];
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
    if (data && data.t > 3 && data.t < video.duration - 5){
      video.currentTime = data.t;
      // Сразу применяем блюр после восстановления времени
      updateVideoFilter();
    }
    // Восстанавливаем сохранённое название
    if (data && data.name) {
      currentFileName = data.name;
      const nameWithoutExt = data.name.replace(/\.[^/.]+$/, '');
      fnameEl.textContent = nameWithoutExt;
      ovTitle.textContent = nameWithoutExt;
      titleInput.value = nameWithoutExt;
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
    const displayName = item.name ? item.name.replace(/\.[^/.]+$/, '') : 'Файл';
    return `
    <div class="resume-item">
      <div class="ri-info">
        <div class="ri-name">${escapeHtml(displayName)}</div>
        <div class="ri-time">
          ${formatTime(item.t)}${item.duration ? ' / ' + formatTime(item.duration) : ''}
          <span class="ri-separator">·</span>
          ${item.url ? '<span class="ri-type-badge ri-type-url">Ссылка</span>' : '<span class="ri-type-badge ri-type-file">Файл</span>'}
        </div>
      </div>
      <div class="ri-actions">
        ${item.url
          ? `<button type="button" class="ri-continue" data-url="${escapeHtmlAttr(item.url)}" title="Продолжить">Продолжить</button>`
          : `<button type="button" class="ri-continue" data-key="${escapeHtmlAttr(item.key)}" title="Продолжить">Продолжить</button>`}
        <button type="button" class="ri-clear" data-key="${escapeHtmlAttr(item.key)}" title="Забыть">✕</button>
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
      showErrMsg('Ваш браузер не поддерживает открытие файла по сохранённой ссылке. Выберите файл заново через «Выберите файл».');
      return;
    }
    // Кнопка "Продолжить" для обычных файлов - используем сохранённый handle
    // именно ЭТОЙ записи (у каждого файла свой ключ в IndexedDB), а не
    // общий "последний открытый" — иначе при нескольких файлах в списке
    // "Продолжить" на не самом последнем открывало бы совсем другое видео.
    const key = continueBtn.dataset.key;
    try{
      const handle = await idbGet(key);
      if (!handle){
        // Если handle не сохранён, показываем диалог выбора файла
        const [newHandle] = await window.showOpenFilePicker({
          types: [{ description: 'Видео', accept: { 'video/*': ['.mp4','.webm','.mov'] } }],
          multiple: false
        });
        const file = await newHandle.getFile();
        
        // Сохраняем новый handle под ключом именно этой записи
        try{ await idbSet(key, newHandle); } catch(err){}
        
        // Загружаем файл и восстанавливаем прогресс
        loadFile(file, newHandle);
        
        // Восстанавливаем прогресс из сохранённого ключа
        try{
          const progressData = JSON.parse(localStorage.getItem(key));
          if (progressData && typeof progressData.t === 'number' && isDurationUsable()){
            video.currentTime = progressData.t;
          }
        } catch(e){ /* ошибка при восстановлении прогресса */ }
        return;
      }
      
      // Проверяем разрешение
      let perm = await handle.queryPermission({ mode: 'read' });
      if (perm !== 'granted'){
        perm = await handle.requestPermission({ mode: 'read' });
      }
      if (perm !== 'granted'){
        showErrMsg('Доступ к файлу не разрешён.');
        return;
      }
      
      const file = await handle.getFile();
      
      // Загружаем файл и восстанавливаем прогресс
      loadFile(file, handle);
      
      // Восстанавливаем прогресс из сохранённого ключа
      try{
        const progressData = JSON.parse(localStorage.getItem(key));
        if (progressData && typeof progressData.t === 'number' && isDurationUsable()){
          video.currentTime = progressData.t;
        }
      } catch(e){ /* ошибка при восстановлении прогресса */ }
    } catch(err){
      showErrMsg('Не удалось открыть сохранённый файл — возможно, он был перемещён, переименован или удалён.');
    }
  }
});

renderResumeList();

function flushPendingSave(){
  saveProgress();
  // Всегда сохраняем настройки при уходе со страницы, чтобы гарантированно
  // сохранить последние изменения даже если они были сделаны менее 150 мс назад
  saveSettingsImmediate();
}
window.addEventListener('beforeunload', flushPendingSave);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushPendingSave(); });

// --- File System Access API: запоминаем сам файл, не только тайминг ---
const FS_ACCESS_SUPPORTED = typeof window.showOpenFilePicker === 'function';
const IDB_NAME = 'lp-player-db';
const IDB_STORE = 'handles';

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
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(new Error('Transaction aborted'));
    };
  });
}
async function idbGet(key){
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => {
      db.close();
      resolve(req.result);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
    tx.onabort = () => {
      db.close();
      reject(new Error('Transaction aborted'));
    };
  });
}
async function idbDelete(key){
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(new Error('Transaction aborted'));
    };
  });
}

// Раньше здесь был отдельный механизм (checkSavedUrl/checkSavedHandle/updateContinueButton),
// который вычислял «самую свежую» запись отдельно от общего списка и рисовал её в отдельном
// блоке (#continue-row). Он читал/писал в несогласованные пространства ключей, из-за чего
// верхний блок и список ниже могли показывать разные и/или задвоенные данные. Теперь всё
// хранится под одним префиксом (PROGRESS_PREFIX), и renderResumeList() сам решает, что
// показать — эта логика больше не нужна.

function loadFile(file, handle){
  if (!file){ return; }
  
  // Проверяем по MIME type или по расширению
  if (!isVideoFile(file)){
    showErrMsg('Похоже, это не видеофайл. Попробуй другой файл.');
    return;
  }
  hideErrMsg();
  videoErrorEl.style.display = 'none';
  stopProgressTracking();
  // Всегда используем PROGRESS_PREFIX для ключа файла (для прогресса)
  currentFileKey = fileKey(file);
  currentFileName = file.name;
  
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
    
    drToggle.checked = true;
    drStrength.value = 60;
    drStrengthVal.textContent = '60%';
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
    subsSize.value = 30;
    subsSizeVal.textContent = '30px';
    subsColor.value = '#ffffff';
    subsOpacity.value = 100;
    subsOpacityVal.textContent = '100%';
    subsBg.value = '#000000';
    subsBgOpacity.value = 50;
    subsBgOpacityVal.textContent = '50%';
    subsBottom.value = 15;
    subsBottomVal.textContent = '15%';
    applySubtitlesStyle();

    // Громкость нового файла (без сохранённых настроек) — фиксированные 20%,
    // а не громкость, оставшаяся от предыдущего файла в этой сессии.
    video.volume = DEFAULT_VOLUME;
    volumeRange.value = video.volume;
    video.muted = false;
    updateVolumeIcon();
  }

  if (!hasSettings){
    const niceTitle = niceTitleFromFilename(file.name);
    titleInput.value = niceTitle;
    ovTitle.textContent = niceTitle;
  }
  fnameEl.textContent = file.name.replace(/\.[^/.]+$/, '');
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
  ensureAudioGraph();
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

// --- перетаскивание файла ---
['dragenter','dragover'].forEach(evt =>
  dropzone.addEventListener(evt, e => { 
    e.preventDefault(); 
    e.stopPropagation();
    e.stopImmediatePropagation();
    dropzone.classList.add('dragover'); 
  })
);
['dragleave','drop'].forEach(evt =>
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
['dragleave','drop'].forEach(evt =>
  document.body.addEventListener(evt, e => {
    e.preventDefault();
    e.stopPropagation();
    // Убираем подсветку при отпускании или уходе
    dropzone.classList.remove('dragover');
  })
);
document.body.addEventListener('drop', async e => {
  e.preventDefault();
  e.stopPropagation();
  
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
dropzone.addEventListener('click', async () => {
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
fileInput.remove(); // Удаляем обычный input, так как всегда используем File System Access API

// --- оверлей и синхронизация controls ---
const stage = document.getElementById('stage');
const clickCatcher = document.getElementById('click-catcher');
const playBtn = document.getElementById('play-btn');
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');
const timeDisplay = document.getElementById('time-display');
const skipBackBtn = document.getElementById('skip-back-btn');
const skipForwardBtn = document.getElementById('skip-forward-btn');
const seek = document.getElementById('seek');
const muteBtn = document.getElementById('mute-btn');
const iconVolOn = document.getElementById('icon-vol-on');
const iconVolOff = document.getElementById('icon-vol-off');
const volumeRange = document.getElementById('volume-range');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const iconFsOpen = document.getElementById('icon-fs-open');
const iconFsClose = document.getElementById('icon-fs-close');
const drBtn = document.getElementById('dr-btn');
const drPanel = document.getElementById('dr-panel');
const subsBtn = document.getElementById('subs-btn');
const subsPanel = document.getElementById('subs-panel');
const subtitles = document.getElementById('subtitles');
const subsToggle = document.getElementById('subs-toggle');
const subsFile = document.getElementById('subs-file');
const subsLoadBtn = document.getElementById('subs-load-btn');
const subsSize = document.getElementById('subs-size');
const subsSizeVal = document.getElementById('subs-size-val');
const subsColor = document.getElementById('subs-color');
const subsOpacity = document.getElementById('subs-opacity');
const subsOpacityVal = document.getElementById('subs-opacity-val');
const subsBg = document.getElementById('subs-bg');
const subsBgOpacity = document.getElementById('subs-bg-opacity');
const subsBgOpacityVal = document.getElementById('subs-bg-opacity-val');
const subsBottom = document.getElementById('subs-bottom');
const subsBottomVal = document.getElementById('subs-bottom-val');
const drToggle = document.getElementById('dr-toggle');
const drStrength = document.getElementById('dr-strength');
const drStrengthVal = document.getElementById('dr-strength-val');
const drBoost = document.getElementById('dr-boost');
const drBoostVal = document.getElementById('dr-boost-val');
const drSpeed = document.getElementById('dr-speed');
const drSpeedVal = document.getElementById('dr-speed-val');
const drBrightness = document.getElementById('dr-brightness');
const drBrightnessVal = document.getElementById('dr-brightness-val');
const drZoom = document.getElementById('dr-zoom');
const zoomVal = document.getElementById('zoom-val');
const mirrorToggle = document.getElementById('mirror-toggle');

let isSeeking = false;

// --- аудио-граф: выравнивание громкости + буст сверх 100% ---
let audioCtx = null;
let sourceNode = null;
let compressorNode = null;
let boostGain = null;
let drEnabled = true;
let isSwitching = false;

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
  if (audioCtx) {
    // AudioContext уже существует, просто переподключаем граф
    try {
      connectGraph();
    } catch(e) {
      console.warn('Ошибка при переподключении аудио-графа:', e);
    }
    return;
  }
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

function destroyAudioGraph(){
  // Отключаем узлы, но не уничтожаем audioContext и sourceNode
  // Браузер не позволяет создать второй MediaElementSourceNode для того же видео элемента
  if (sourceNode) {
    try {
      sourceNode.disconnect();
    } catch(e) {
      // Игнорируем ошибки при отключении
    }
  }
  if (compressorNode) {
    try {
      compressorNode.disconnect();
    } catch(e) {
      // Игнорируем ошибки при отключении
    }
  }
  if (boostGain) {
    try {
      boostGain.disconnect();
    } catch(e) {
      // Игнорируем ошибки при отключении
    }
  }
  // Не закрываем audioContext и не обнуляем sourceNode
  // Это позволяет переиспользовать их при следующей загрузке
}

function collapseCategoriesIn(panelEl){
  panelEl.querySelectorAll('.dr-category-header').forEach(header => {
    header.setAttribute('aria-expanded', 'false');
    const content = header.nextElementSibling;
    if (content && content.classList.contains('dr-category-content')) {
      content.classList.add('collapsed');
    }
  });
}

function setDrPanelOpen(open){
  drPanel.classList.toggle('open', open);
  drBtn.setAttribute('aria-expanded', String(open));
  
  // Сворачиваем свои категории и закрываем панель субтитров (не должны перекрываться)
  if (open) {
    collapseCategoriesIn(drPanel);
    setSubsPanelOpen(false);
  }
}
drBtn.addEventListener('click', () => {
  setDrPanelOpen(!drPanel.classList.contains('open'));
});

// --- Панель субтитров ---
function setSubsPanelOpen(open){
  subsPanel.classList.toggle('open', open);
  subsBtn.setAttribute('aria-expanded', String(open));
  
  // Аналогично: свои категории сворачиваем, панель настроек закрываем
  if (open) {
    collapseCategoriesIn(subsPanel);
    setDrPanelOpen(false);
  }
}
subsBtn.addEventListener('click', () => {
  setSubsPanelOpen(!subsPanel.classList.contains('open'));
});

// --- Загрузка субтитров ---
let subtitlesData = []; // Массив {start, end, text}
let savedSubsContent = null; // Сохраненное содержимое субтитров из localStorage
let isSubtitlesLoaded = false; // Флаг, были ли загружены субтитры

subsLoadBtn.addEventListener('click', () => {
  subsFile.click();
});

subsFile.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  setSubsFileNameDisplay(file.name);
  
  const reader = new FileReader();
  reader.onload = (event) => {
    let content = event.target.result;
    
    // Проверяем на наличие символов замены (признак неправильной кодировки)
    const replacementCharCount = (content.match(/\uFFFD/g) || []).length;
    const contentLength = content.length;
    
    // Если символов замены много (> 5% от текста), пробуем Windows-1251
    if (replacementCharCount > 0 && contentLength > 0 && (replacementCharCount / contentLength) > 0.05) {
      const reader1251 = new FileReader();
      reader1251.onload = (event1251) => {
        content = event1251.result;
        showStorageToast('Субтитры прочитаны в кодировке Windows-1251');
        processSubtitlesContent(content, file);
      };
      reader1251.onerror = () => {
        // Если не удалось прочитать как Windows-1251, используем UTF-8
        showStorageToast('Возможно, неправильная кодировка субтитров');
        processSubtitlesContent(content, file);
      };
      reader1251.readAsText(file, 'windows-1251');
    } else {
      processSubtitlesContent(content, file);
    }
  };
  reader.readAsText(file);
});

function processSubtitlesContent(content, file){
  parseSubtitles(content, file.name.toLowerCase().endsWith('.srt') ? 'srt' : 'vtt');
  // Сохраняем содержимое в отдельный ключ
  const subsData = {
    content: JSON.stringify(subtitlesData),
    fileName: file.name,
    ts: Date.now()
  };
  try{
    localStorage.setItem(subsKey(currentFileKey), JSON.stringify(subsData));
    cleanupStorage(SUBS_PREFIX);
  } catch(e){ /* хранилище недоступно — не мешаем применить субтитры для текущей сессии */ }
  savedSubsContent = JSON.stringify(subtitlesData);
  isSubtitlesLoaded = true;
  // Применяем стили сразу после загрузки
  applySubtitlesStyle();
  // Показываем кнопку удаления
  subsRemoveBtn.style.display = 'flex';
}

// --- Удаление субтитров ---
subsRemoveBtn.addEventListener('click', () => {
  subtitlesData = [];
  savedSubsContent = null;
  isSubtitlesLoaded = false;
  subtitles.innerHTML = '';
  subsFileName.textContent = 'Файл не выбран';
  subsFileName.title = '';
  subsFile.value = '';
  subsRemoveBtn.style.display = 'none';
  
  // Удаляем из localStorage
  if (currentFileKey) {
    try {
      localStorage.removeItem(subsKey(currentFileKey));
    } catch(e) {}
  }
  
  // Сохраняем настройки
  saveSettingsImmediate();
});

function parseSubtitles(content, format) {
  subtitlesData = [];
  let skippedCount = 0;
  // Нормализуем переносы строк (CRLF/одиночный CR → LF) один раз в начале, чтобы
  // символ \r не оказывался внутри текста реплики (text.trim() обрезает только
  // края всего блока, а не каждую строку внутри него).
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let i = 0;
  
  // Реплики с некорректным таймингом (NaN или end <= start) пропускаем и считаем,
  // чтобы предупредить пользователя, а не тихо добавлять их в список без показа.
  const isValidTiming = (start, end) => isFinite(start) && isFinite(end) && end > start;
  
  while (i < lines.length) {
    const line = lines[i].trim();
    
    if (format === 'srt') {
      // SRT формат
      if (line.match(/^\d+$/)) {
        // Индекс
        i++;
        if (i >= lines.length) break;
        
        // Тайминг - поддерживаем форматы 00:00:00,000 и 00:00:00,000 --> 00:00:00,000
        const timeLine = lines[i].trim();
        const timeMatch = timeLine.match(/(\d{1,2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2},\d{3})/);
        if (timeMatch) {
          const start = parseSRTTime(timeMatch[1]);
          const end = parseSRTTime(timeMatch[2]);
          
          // Текст
          i++;
          let text = '';
          while (i < lines.length && lines[i].trim() !== '') {
            text += lines[i] + '\n';
            i++;
          }
          
          if (text.trim()) {
            if (isValidTiming(start, end)) {
              subtitlesData.push({ start, end, text: text.trim() });
            } else {
              skippedCount++;
            }
          }
        }
      }
      i++;
    } else {
      // WebVTT формат - поддерживаем форматы 00:00:00.000 и 00:00:00.000 --> 00:00:00.000
      if (line.match(/\d{1,2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{2}\.\d{3}/)) {
        const timeMatch = line.match(/(\d{1,2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}\.\d{3})/);
        if (timeMatch) {
          const start = parseVTTTime(timeMatch[1]);
          const end = parseVTTTime(timeMatch[2]);
          
          // Текст
          i++;
          let text = '';
          while (i < lines.length && lines[i].trim() !== '') {
            text += lines[i] + '\n';
            i++;
          }
          
          if (text.trim()) {
            if (isValidTiming(start, end)) {
              subtitlesData.push({ start, end, text: text.trim() });
            } else {
              skippedCount++;
            }
          }
        }
      }
      i++;
    }
  }

  if (skippedCount > 0){
    console.warn(`Субтитры: пропущено ${skippedCount} строк с некорректным таймингом`);
    showStorageToast(`Не удалось разобрать ${skippedCount} ${skippedCount === 1 ? 'реплику' : 'реплик'} субтитров — тайминг повреждён, они пропущены.`);
  }
}

function parseSRTTime(timeStr) {
  const parts = timeStr.split(':');
  const hours = parseInt(parts[0]);
  const minutes = parseInt(parts[1]);
  const secondsParts = parts[2].split(',');
  const seconds = parseInt(secondsParts[0]);
  const milliseconds = parseInt(secondsParts[1]);
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

function parseVTTTime(timeStr) {
  const parts = timeStr.split(':');
  const hours = parseInt(parts[0]);
  const minutes = parseInt(parts[1]);
  const secondsParts = parts[2].split('.');
  const seconds = parseInt(secondsParts[0]);
  const milliseconds = parseInt(secondsParts[1]);
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

// --- Настройки субтитров ---
function applySubtitlesStyle() {
  const size = subsSize.value + 'px';
  const color = hexToRgba(subsColor.value, subsOpacity.value / 100);
  const bgColor = hexToRgba(subsBg.value, subsBgOpacity.value / 100);
  const bottom = subsBottom.value + '%';
  
  subtitles.style.bottom = bottom;
  
  const span = subtitles.querySelector('span');
  if (span) {
    span.style.fontSize = size;
    span.style.color = color;
    span.style.background = bgColor;
  }
}

subsToggle.addEventListener('change', () => {
  subtitles.style.display = subsToggle.checked ? 'block' : 'none';
  saveSettings();
});

subsSize.addEventListener('input', () => {
  subsSizeVal.textContent = subsSize.value + 'px';
  applySubtitlesStyle();
  saveSettings();
});

subsColor.addEventListener('input', () => {
  applySubtitlesStyle();
  saveSettings();
});

subsOpacity.addEventListener('input', () => {
  subsOpacityVal.textContent = subsOpacity.value + '%';
  applySubtitlesStyle();
  saveSettings();
});

subsBg.addEventListener('input', () => {
  applySubtitlesStyle();
  saveSettings();
});

subsBgOpacity.addEventListener('input', () => {
  subsBgOpacityVal.textContent = subsBgOpacity.value + '%';
  applySubtitlesStyle();
  saveSettings();
});

subsBottom.addEventListener('input', () => {
  subsBottomVal.textContent = subsBottom.value + '%';
  applySubtitlesStyle();
  saveSettings();
});

// --- Сворачивание категорий настроек ---
// Инициализация: сворачиваем все категории при загрузке страницы
categoryHeaders.forEach(header => {
  header.setAttribute('aria-expanded', 'false');
  const content = header.nextElementSibling;
  if (content && content.classList.contains('dr-category-content')) {
    content.classList.add('collapsed');
  }
});

// Обработчики кликов
categoryHeaders.forEach(header => {
  header.addEventListener('click', () => {
    const isExpanded = header.getAttribute('aria-expanded') === 'true';
    header.setAttribute('aria-expanded', !isExpanded);
    
    // Добавляем/удаляем класс collapsed для контента
    const content = header.nextElementSibling;
    if (content && content.classList.contains('dr-category-content')) {
      if (!isExpanded) {
        content.classList.remove('collapsed');
      } else {
        content.classList.add('collapsed');
      }
    }
  });
});

drToggle.addEventListener('change', () => {
  ensureAudioGraph();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  drEnabled = drToggle.checked;
  
  // Ограничиваем буст до 200% без компрессора для защиты от клиппинга
  if (!drEnabled && drBoost.value > 200){
    drBoost.value = 200;
    drBoostVal.textContent = '200%';
    if (boostGain) boostGain.gain.setTargetAtTime(2, audioCtx.currentTime, 0.01);
  }
  
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
  updateVideoFilter();
  drBrightnessVal.textContent = drBrightness.value + '%';
  saveSettings();
});
function resetBrightness(){
  drBrightness.value = 100;
  drBrightnessVal.textContent = '100%';
  updateVideoFilter();
}

// --- масштаб картинки + отзеркаливание (общий transform на video) ---
let zoomLevel = 100;
let mirrorEnabled = false;

function applyVideoTransform(){
  const parts = [];
  if (mirrorEnabled) parts.push('scaleX(-1)');
  if (zoomLevel !== 100) parts.push(`scale(${zoomLevel / 100})`);
  video.style.transform = parts.join(' ');
}

function applyZoom(){
  zoomVal.textContent = zoomLevel + '%';
  applyVideoTransform();
}
drZoom.addEventListener('input', () => {
  zoomLevel = parseInt(drZoom.value, 10);
  applyZoom();
  saveSettings();
});
function resetZoom(){
  zoomLevel = 100;
  drZoom.value = 100;
  applyZoom();
}

mirrorToggle.addEventListener('change', () => {
  mirrorEnabled = mirrorToggle.checked;
  applyVideoTransform();
  saveSettings();
});
function resetMirror(){
  mirrorEnabled = false;
  mirrorToggle.checked = false;
  applyVideoTransform();
  saveSettings();
}

function togglePlay(){
  if (video.paused) {
    video.play().catch(e => {
      if (e.name !== 'AbortError') console.warn('Play error:', e);
    });
  } else {
    video.pause();
  }
}

function seekBy(deltaSeconds){
  if (!isDurationUsable()) return;
  const t = Math.max(0, Math.min(video.duration, video.currentTime + deltaSeconds));
  video.currentTime = t;
  timeDisplay.textContent = `${formatTime(t)} / ${formatTime(video.duration)}`;
}
skipBackBtn.addEventListener('click', () => seekBy(-5));
skipForwardBtn.addEventListener('click', () => seekBy(5));

// Дизейблим кнопки перемотки и сик-бар при недоступной длительности
function updateSeekControlsState(){
  const canSeek = isDurationUsable();
  skipBackBtn.disabled = !canSeek;
  skipForwardBtn.disabled = !canSeek;
  seek.disabled = !canSeek;
  
  // Добавляем/убираем поясняющий title
  if (!canSeek){
    skipBackBtn.title = 'Перемотка недоступна (нет длительности)';
    skipForwardBtn.title = 'Перемотка недоступна (нет длительности)';
    seek.title = 'Перемотка недоступна (нет длительности)';
  } else {
    skipBackBtn.title = 'Назад на 5 секунд';
    skipForwardBtn.title = 'Вперёд на 5 секунд';
    seek.title = 'Перемотка';
  }
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
// Блокируем нативное контекстное меню только на самом плеере и его
// элементах управления (видео, панель управления, кнопки) — чтобы нельзя
// было вызвать нативное "Show controls"/"Loop" браузера, конфликтующее с
// кастомным UI. Тулбар (кнопка "Назад", название) и подсказка горячих
// клавиш под плеером в эту область не входят — там меню остаётся стандартным.
stage.addEventListener('contextmenu', (e) => e.preventDefault());

clickCatcher.addEventListener('click', () => {
  if (drPanel.classList.contains('open')){
    setDrPanelOpen(false);
    return;
  }
  if (subsPanel.classList.contains('open')){
    setSubsPanelOpen(false);
    return;
  }
  togglePlay();
});

// --- закрытие панелей по клику вне них или по Esc ---
document.addEventListener('click', (e) => {
  // Закрытие панели настроек
  if (drPanel.classList.contains('open')) {
    if (!drPanel.contains(e.target) && !drBtn.contains(e.target)) {
      setDrPanelOpen(false);
    }
  }
  // Закрытие панели субтитров
  if (subsPanel.classList.contains('open')) {
    if (!subsPanel.contains(e.target) && !subsBtn.contains(e.target)) {
      setSubsPanelOpen(false);
    }
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (drPanel.classList.contains('open')) {
      setDrPanelOpen(false);
    }
    if (subsPanel.classList.contains('open')) {
      setSubsPanelOpen(false);
    }
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

// Постоянная синхронизация UI с фактическим состоянием видео —
// работает только пока видео реально играет, а не всё время жизни страницы
function startUiSync(){
  if (uiSyncInterval) return;
  uiSyncInterval = setInterval(() => {
    const isPlaying = !video.paused;
    const iconPlayVisible = iconPlay.style.display !== 'none';

    // Если UI не соответствует фактическому состоянию - исправляем
    if (isPlaying && iconPlayVisible){
      syncPlayStateUI();
    } else if (!isPlaying && !iconPlayVisible){
      syncPlayStateUI();
    }
  }, 100);
}
function stopUiSync(){
  clearInterval(uiSyncInterval);
  uiSyncInterval = null;
}

video.addEventListener('play', () => {
  syncPlayStateUI();
  startProgressTracking();
  startUiSync();
  showCenterIcon(true);
});
video.addEventListener('pause', () => {
  syncPlayStateUI();
  stopProgressTracking();
  stopUiSync();
});
video.addEventListener('ratechange', () => {
  // Синхронизируем ползунок скорости с реальным значением
  const rate = video.playbackRate;
  if (rate >= 0.25 && rate <= 4) {
    drSpeed.value = rate;
    drSpeedVal.textContent = rate.toFixed(2) + 'x';
  }
});
video.addEventListener('ended', () => {
  if (currentFileKey){
    try{ localStorage.removeItem(currentFileKey); } catch(e){}
  }
});

let lastBlurActive = false;
video.addEventListener('timeupdate', () => {
  const txt = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
  ovTime.textContent = txt;
  timeDisplay.textContent = txt;
  if (!isSeeking && isDurationUsable()){
    seek.value = (video.currentTime / video.duration) * 1000;
  }
  
  // Обновление блюра
  const blurActive = isInBlurRange(video.currentTime);
  if (blurActive !== lastBlurActive) {
    updateVideoFilter();
    lastBlurActive = blurActive;
  }
  
  // Обновление субтитров
  updateSubtitles();
});

function updateSubtitles() {
  if (!subsToggle.checked || subtitlesData.length === 0) {
    subtitles.innerHTML = '';
    return;
  }
  
  const currentTime = video.currentTime;
  const currentSub = subtitlesData.find(sub => 
    currentTime >= sub.start && currentTime < sub.end
  );
  
  if (currentSub) {
    subtitles.innerHTML = `<span>${escapeHtml(currentSub.text).replace(/\n/g, '<br>')}</span>`;
    applySubtitlesStyle();
  } else {
    subtitles.innerHTML = '';
  }
}

// Удалён глобальный дубликат loadedmetadata - логика интегрирована в loadedMetadataHandler

seek.addEventListener('mousedown', () => isSeeking = true);
seek.addEventListener('touchstart', () => isSeeking = true);
seek.addEventListener('input', () => {
  if (isDurationUsable()){
    const t = (seek.value / 1000) * video.duration;
    video.currentTime = t;
    timeDisplay.textContent = `${formatTime(t)} / ${formatTime(video.duration)}`;
  }
});
seek.addEventListener('change', () => {
  isSeeking = false;
});
seek.addEventListener('mouseup', () => isSeeking = false);
seek.addEventListener('touchend', () => isSeeking = false);
seek.addEventListener('mouseleave', () => isSeeking = false);

function updateVolumeIcon(){
  const isOff = video.muted || video.volume <= 0;
  iconVolOn.style.display = isOff ? 'none' : '';
  iconVolOff.style.display = isOff ? '' : 'none';
  muteBtn.setAttribute('aria-pressed', String(isOff));
  muteBtn.setAttribute('aria-label', isOff ? 'Включить звук' : 'Выключить звук');
}

let lastVolume = DEFAULT_VOLUME;

volumeRange.addEventListener('input', () => {
  video.volume = volumeRange.value;
  video.muted = Number(volumeRange.value) === 0;
  if (video.volume > 0) lastVolume = video.volume;
  updateVolumeIcon();
  saveSettings();
});
function toggleMute(){
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
}

muteBtn.addEventListener('click', toggleMute);
updateVolumeIcon();

// Обёртки для Fullscreen API — с поддержкой старого Safari/iOS
function getFullscreenElement(){
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}
function requestFs(el){
  const fn = el.requestFullscreen || el.webkitRequestFullscreen;
  if (fn) return fn.call(el);
}
function exitFs(){
  const fn = document.exitFullscreen || document.webkitExitFullscreen;
  if (fn) return fn.call(document);
}

fullscreenBtn.addEventListener('click', () => {
  if (!getFullscreenElement()){
    requestFs(stage);
  } else {
    exitFs();
  }
});
['fullscreenchange', 'webkitfullscreenchange'].forEach(evt => {
  document.addEventListener(evt, () => {
    const isFs = !!getFullscreenElement();
    iconFsOpen.style.display = isFs ? 'none' : '';
    iconFsClose.style.display = isFs ? '' : 'none';
    fullscreenBtn.setAttribute('aria-pressed', String(isFs));
    fullscreenBtn.setAttribute('aria-label', isFs ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим');
  });
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
document.querySelectorAll('input[type="range"]').forEach(r => {
  // Снимаем фокус только после mouseup (перетаскивания мышью), не при клавиатурном управлении
  r.addEventListener('mouseup', () => r.blur());
  r.addEventListener('touchend', () => r.blur());
});
document.addEventListener('keydown', (e) => {
  if (!playerView.classList.contains('active')) return;
  const activeEl = document.activeElement;
  const isTextLike = activeEl && (
    (activeEl.tagName === 'INPUT' && activeEl.type === 'text') ||
    activeEl.tagName === 'TEXTAREA' ||
    activeEl.isContentEditable
  );
  if (isTextLike) return;
  if (isEditingTitle) return; // Блокируем хоткеи при редактировании названия
  if (e.code === 'Space'){ e.preventDefault(); togglePlay(); showControls(); }
  else if (e.code === 'KeyF'){ fullscreenBtn.click(); }
  else if (e.code === 'KeyM'){ 
    toggleMute();
    showControls(); 
  }
  else if (e.code === 'ArrowRight' && e.shiftKey){ e.preventDefault(); seekBy(1); showControls(); }
  else if (e.code === 'ArrowLeft' && e.shiftKey){ e.preventDefault(); seekBy(-1); showControls(); }
  else if (e.code === 'ArrowRight'){ e.preventDefault(); seekBy(5); showControls(); }
  else if (e.code === 'ArrowLeft'){ e.preventDefault(); seekBy(-5); showControls(); }
  else if (e.code === 'ArrowUp'){ e.preventDefault(); adjustVolume(0.05); showControls(); }
  else if (e.code === 'ArrowDown'){ e.preventDefault(); adjustVolume(-0.05); showControls(); }
});

const ERROR_MESSAGES = {
  1: 'Загрузка была прервана.',
  2: 'Ошибка сети при чтении файла.',
  3: 'Браузер не смог декодировать файл — скорее всего, не поддерживается кодек видео или аудио.',
  4: 'Формат файла не поддерживается браузером вообще.',
};

const ERROR_SOLUTIONS = {
  3: `
    <div class="ve-solution">
      <strong>Как исправить:</strong>
      <br>• Скорее всего файл использует кодек H.265/HEVC, AC3 или DTS
      <br>• Конвертируйте файл в H.264 + AAC (HandBrake — бесплатный)
      <br>• Для стримеров: используйте H.264 для максимальной совместимости
      <br>• Рекомендуемые настройки: H.264, AAC, 1080p или ниже
    </div>
  `,
  4: `
    <div class="ve-solution">
      <strong>Решение:</strong>
      <br>• Попробуйте другой формат (.mp4 с H.264)
      <br>• Конвертируйте файл через HandBrake или VLC
    </div>
  `
};

video.addEventListener('error', () => {
  const err = video.error;
  const code = err ? err.code : null;
  const msg = ERROR_MESSAGES[code] || 'Не удалось воспроизвести файл по неизвестной причине.';
  const solution = ERROR_SOLUTIONS[code] || '';
  
  videoErrorEl.innerHTML = `
    <div class="ve-title">Не получилось воспроизвести файл</div>
    <div class="ve-detail">${msg}<br>Код ошибки браузера: ${code ?? '—'}</div>
    ${solution}
  `;
  videoErrorEl.style.display = 'flex';
});
video.addEventListener('loadeddata', () => {
  videoErrorEl.style.display = 'none';
});

// --- возврат к выбору файла ---
backBtn.addEventListener('click', () => {
  if (isSwitching) return;
  isSwitching = true;
  
  // Выходим из полноэкранного режима перед скрытием плеера
  if (document.fullscreenElement) exitFs();
  
  stopProgressTracking();
  
  // Очищаем аудио-граф при выходе из плеера
  destroyAudioGraph();
  
  video.pause();
  if (currentObjectUrl && video.src === currentObjectUrl){
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  } else if (currentObjectUrl) {
    currentObjectUrl = null;
  }
  if (hls){ hls.destroy(); hls = null; }
  video.removeAttribute('src');
  video.load();
  fileInput.value = '';
  urlInput.value = '';
  urlInput.classList.remove('error');
  hideErrMsg();
  playerView.classList.remove('active');
  dropView.style.display = 'flex';

  renderResumeList();
  isSwitching = false;
});

// --- Загрузка видео по URL (m3u8 и обычные ссылки) ---
let hls = null;
// Отслеживаем текущий обработчик ошибки видео для URL-загрузки, чтобы снимать
// его перед каждой новой попыткой — иначе при успешных загрузках старые
// {once:true}-слушатели никогда не снимаются (событие 'error' не наступает)
// и копятся на <video> навсегда, а при реальной ошибке все они срабатывают
// разом и перетирают друг друга сообщением от совершенно другой попытки.
let urlErrorHandler = null;

function loadUrl(url){
  if (urlErrorHandler){
    video.removeEventListener('error', urlErrorHandler);
    urlErrorHandler = null;
  }

  if (!url || url.trim() === ''){
    showUrlError('Введите ссылку');
    return;
  }

  // Показываем индикатор загрузки
  urlLoadingSpinner.style.display = 'inline-block';
  urlLoadBtn.disabled = true;

  // Очищаем предыдущие ошибки
  urlInput.classList.remove('error');
  hideErrMsg();
  videoErrorEl.style.display = 'none';
  stopProgressTracking();

  // Проверяем валидность URL
  try {
    new URL(url);
  } catch (e){
    showUrlError('Некорректная ссылка');
    return;
  }

  // Определяем тип видео по расширению
  const isM3U8 = /\.m3u8$/i.test(url);
  const isDirectVideo = /\.(mp4|webm|mov)$/i.test(url);

  // Останавливаем предыдущий HLS экземпляр
  if (hls){
    hls.destroy();
    hls = null;
  }

  currentFileKey = urlKey(url);
  currentFileName = getFileNameFromUrl(url);

  // Устанавливаем crossOrigin для удалённых ресурсов (нужно для AudioContext)
  video.crossOrigin = 'anonymous';

  let videoInitialized = false;

  if (isM3U8 && typeof Hls === 'undefined'){
    // hls.js не загружен (CDN недоступен)
    if (video.canPlayType('application/vnd.apple.mpegurl')){
      // Попробуем native HLS
      video.src = url;
      videoInitialized = true;
      video.addEventListener('loadedmetadata', function(){
        urlLoadingSpinner.style.display = 'none';
        urlLoadBtn.disabled = false;
        restoreProgress();
      }, { once: true });
      video.addEventListener('error', urlErrorHandler = function(){
        urlLoadingSpinner.style.display = 'none';
        urlLoadBtn.disabled = false;
        showUrlError('Ошибка. Браузер не поддерживает m3u8 без hls.js библиотеки');
      }, { once: true });
    } else {
      urlLoadingSpinner.style.display = 'none';
      urlLoadBtn.disabled = false;
      showUrlError('Ошибка. Браузер не поддерживает m3u8 и hls.js библиотека не загружена');
    }
    return;
  }

  if (isM3U8 && typeof Hls !== 'undefined' && Hls.isSupported()){
    // HLS поддержка через hls.js
    try {
      hls = new Hls({
        enableWorker: true,
        maxBufferLength: 30,
        maxMaxBufferLength: 60
      });
      // Локальная ссылка на именно этот экземпляр — нужна, чтобы отложенные
      // ретраи ниже не трогали чужой/уже уничтоженный hls, если пользователь
      // успел уйти со страницы плеера (нажал "Назад") до срабатывания таймера.
      const hlsInstance = hls;

      hls.loadSource(url);
      hls.attachMedia(video);
      videoInitialized = true;

      hls.on(Hls.Events.MANIFEST_PARSED, function(){
        urlLoadingSpinner.style.display = 'none';
        urlLoadBtn.disabled = false;
        restoreProgress();
      });

      hls.on(Hls.Events.ERROR, function(event, data){
        if (data.fatal){
          urlLoadingSpinner.style.display = 'none';
          urlLoadBtn.disabled = false;
          switch (data.type){
            case Hls.ErrorTypes.NETWORK_ERROR:
              showUrlError('Ошибка. Встраиваемая ссылка недоступна. Повторная попытка...');
              setTimeout(() => {
                if (hls !== hlsInstance) return; // плеер уже закрыт/переключён — ничего не делаем
                try {
                  hlsInstance.startLoad();
                } catch (e) {
                  hlsInstance.destroy();
                  showUrlError('Не удалось восстановить соединение');
                }
              }, 1000);
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              showUrlError('Ошибка воспроизведения. Попытка восстановления...');
              setTimeout(() => {
                if (hls !== hlsInstance) return;
                try {
                  hlsInstance.recoverMediaError();
                } catch (e) {
                  hlsInstance.destroy();
                  showUrlError('Не удалось восстановить воспроизведение');
                }
              }, 1000);
              break;
            default:
              showUrlError('Ошибка. Ссылка может быть недоступной или неправильной');
              hls.destroy();
              break;
          }
        }
      });
    } catch (e){
      urlLoadingSpinner.style.display = 'none';
      urlLoadBtn.disabled = false;
      showUrlError('Ошибка загрузки');
    }
  } else if (video.canPlayType('application/vnd.apple.mpegurl') && isM3U8){
    // Native HLS (Safari)
    video.src = url;
    videoInitialized = true;
    video.addEventListener('loadedmetadata', function(){
      urlLoadingSpinner.style.display = 'none';
      urlLoadBtn.disabled = false;
      restoreProgress();
    }, { once: true });

    video.addEventListener('error', urlErrorHandler = function(){
      urlLoadingSpinner.style.display = 'none';
      urlLoadBtn.disabled = false;
      showUrlError('Ошибка. Не удалось загрузить видео');
    }, { once: true });
  } else if (isDirectVideo || isM3U8){
    // Прямая ссылка на видео или m3u8 без поддержки HLS
    video.src = url;
    videoInitialized = true;
    video.addEventListener('loadedmetadata', function(){
      urlLoadingSpinner.style.display = 'none';
      urlLoadBtn.disabled = false;
      restoreProgress();
    }, { once: true });

    video.addEventListener('error', urlErrorHandler = function(){
      urlLoadingSpinner.style.display = 'none';
      urlLoadBtn.disabled = false;
      if (isM3U8){
        showUrlError('Ошибка. Браузер не поддерживает m3u8');
      } else {
        showUrlError('Ошибка. Не удалось загрузить видео');
      }
    }, { once: true });
  } else {
    showUrlError('Ошибка. Неподдерживаемый формат');
    return;
  }

  // Загружаем настройки для URL (если есть)
  const hasSettings = loadSettings();
  if (!hasSettings){
    resetSpeed();
    resetBrightness();
    resetZoom();
    resetMirror();
    blurRanges = [];
    renderBlurRanges();
    clearTimingError();
    
    ovToggle.checked = true;
    ovSize.value = OV_DEFAULT_SIZE;
    ovSizeVal.textContent = OV_DEFAULT_SIZE + 'px';
    ovColor.value = OV_DEFAULT_COLOR;
    ovOpacity.value = OV_DEFAULT_OPACITY;
    ovOpacityVal.textContent = OV_DEFAULT_OPACITY + '%';
    setOverlayAlign(OV_DEFAULT_ALIGN);
    setOverlayPosition(OV_DEFAULT_POS_X, OV_DEFAULT_POS_Y);
    
    drToggle.checked = true;
    drStrength.value = 60;
    drStrengthVal.textContent = '60%';
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
    subsSize.value = 30;
    subsSizeVal.textContent = '30px';
    subsColor.value = '#ffffff';
    subsOpacity.value = 100;
    subsOpacityVal.textContent = '100%';
    subsBg.value = '#000000';
    subsBgOpacity.value = 50;
    subsBgOpacityVal.textContent = '50%';
    subsBottom.value = 15;
    subsBottomVal.textContent = '15%';
    applySubtitlesStyle();

    video.volume = DEFAULT_VOLUME;
    volumeRange.value = video.volume;
    video.muted = false;
    updateVolumeIcon();
  }

  if (!hasSettings){
    const niceTitle = niceTitleFromFilename(currentFileName);
    titleInput.value = niceTitle;
    ovTitle.textContent = niceTitle;
  }
  fnameEl.textContent = currentFileName.replace(/\.[^/.]+$/, '');
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
  if (durationChangeHandler){
    video.removeEventListener('durationchange', durationChangeHandler);
  }
  durationChangeHandler = () => {
    updateSeekControlsState();
  };
  video.addEventListener('durationchange', durationChangeHandler, { once: true });

  // Очищаем старый аудио-граф перед созданием нового
  destroyAudioGraph();
  ensureAudioGraph();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

  // Показываем плеер только если видео было успешно инициализировано
  if (videoInitialized) {
    urlLoadingSpinner.style.display = 'none';
    urlLoadBtn.disabled = false;
    showPlayer();
    video.play().catch(e => {
      if (e.name === 'NotAllowedError') {
        console.log('Autoplay prevented - user interaction required');
      } else {
        console.warn('Play error:', e);
      }
    });
  }
}

let urlInputErrorTimeout = null;
function showUrlError(message){
  urlLoadingSpinner.style.display = 'none';
  urlLoadBtn.disabled = false;
  urlInput.classList.add('error');
  clearTimeout(urlInputErrorTimeout);
  urlInputErrorTimeout = setTimeout(() => urlInput.classList.remove('error'), 4500);
  showErrMsg(message);
}

function getFileNameFromUrl(url){
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    let filename = pathname.split('/').pop();
    // Удаляем query параметры если они есть
    const queryIndex = filename.indexOf('?');
    if (queryIndex !== -1) {
      filename = filename.substring(0, queryIndex);
    }
    return filename || 'Видео из URL';
  } catch (e){
    return 'Видео из URL';
  }
}

function showPlayer(){
  // Заголовок (fnameEl/ovTitle) уже корректно выставлен выше по коду loadUrl()
  // (восстановленное кастомное имя или "красивое" имя из URL) — здесь его
  // больше не перезаписываем сырым currentFileName, иначе переименование
  // и форматирование теряются сразу после загрузки видео по ссылке.
  dropView.style.display = 'none';
  playerView.classList.add('active');
  startProgressTracking();
  ensureAudioGraph();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

// --- Редактирование названия файла по клику ---
let isEditingTitle = false;
let originalTitle = '';
let checkEmpty = null;

const saveTitle = () => {
  if (!isEditingTitle) return;
  const newTitle = fnameEl.textContent.trim() || originalTitle;
  
  if (checkEmpty) fnameEl.removeEventListener('input', checkEmpty);
  fnameEl.contentEditable = 'false';
  fnameEl.classList.remove('editing');
  fnameEl.style.userSelect = 'none';
  fnameEl.removeAttribute('data-placeholder');
  fnameEl.textContent = newTitle;
  
  // Обновляем связанные элементы
  ovTitle.textContent = newTitle;
  titleInput.value = newTitle;
  currentFileName = newTitle;
  
  // Сохраняем настройки и обновляем название в прогрессе
  saveSettings();
  saveTitleToProgress();
  
  isEditingTitle = false;
};

const cancelEdit = () => {
  if (!isEditingTitle) return;
  if (checkEmpty) fnameEl.removeEventListener('input', checkEmpty);
  fnameEl.contentEditable = 'false';
  fnameEl.classList.remove('editing');
  fnameEl.style.userSelect = 'none';
  fnameEl.removeAttribute('data-placeholder');
  fnameEl.textContent = originalTitle;
  isEditingTitle = false;
};

// Обработчики редактирования (навешиваются один раз при инициализации)
fnameEl.addEventListener('keydown', (e) => {
  if (!isEditingTitle) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    saveTitle();
    fnameEl.blur();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    cancelEdit();
  }
});

fnameEl.addEventListener('paste', (e) => {
  if (!isEditingTitle) return;
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text');
  
  // Используем Selection API для корректной вставки с заменой выделения
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    fnameEl.textContent += text;
  }
});

fnameEl.addEventListener('click', () => {
  if (isEditingTitle) return;
  
  isEditingTitle = true;
  originalTitle = fnameEl.textContent;
  
  fnameEl.contentEditable = 'true';
  fnameEl.classList.add('editing');
  fnameEl.focus();
  
  // Не выделяем текст автоматически
  fnameEl.style.userSelect = 'text';
  
  // Показываем placeholder если пустой
  checkEmpty = () => {
    if (!fnameEl.textContent.trim()) {
      fnameEl.textContent = '';
      fnameEl.setAttribute('data-placeholder', 'Название');
    } else {
      fnameEl.removeAttribute('data-placeholder');
    }
  };
  
  fnameEl.addEventListener('input', checkEmpty);
  checkEmpty();
  
  fnameEl.addEventListener('blur', () => {
    if (!isEditingTitle) return;
    saveTitle();
  }, { once: true });
});

// Обработчики для URL ввода
urlLoadBtn.addEventListener('click', () => {
  loadUrl(urlInput.value);
});

urlInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter'){
    loadUrl(urlInput.value);
  }
});

urlInput.addEventListener('input', () => {
  urlInput.classList.remove('error');
  hideErrMsg();
});

// Очистка ресурсов при выгрузке страницы
window.addEventListener('beforeunload', () => {
  clearInterval(progressInterval);
  clearInterval(uiSyncInterval);
  clearTimeout(centerIconTimeout);
  destroyAudioGraph();
  if (hls) {
    hls.destroy();
    hls = null;
  }
});

// Проверка поддержки File System Access API
if (!FS_ACCESS_SUPPORTED){
  showErrMsg('Ваш браузер не поддерживает File System Access API. Используйте Chrome, Edge или другой современный браузер.', { persistent: true });
  dropzone.style.pointerEvents = 'none';
  dropzone.style.opacity = '0.5';
}

// renderResumeList() уже вызывается сразу после своего определения и читает localStorage
// напрямую — отдельный асинхронный запуск здесь больше не нужен.
