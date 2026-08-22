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
const audioHint = document.getElementById('audio-hint');
const audioHintClose = document.getElementById('audio-hint-close');
const audioHintProgressFill = document.getElementById('audio-hint-progress-fill');

// Обработчик закрытия подсказки
audioHintClose.addEventListener('click', () => {
  audioHint.classList.add('hidden');
});

// Скрываем подсказку после завершения анимации прогресс-бара
audioHintProgressFill.addEventListener('animationend', () => {
  audioHint.classList.add('hidden');
});

// Показывает подсказку и перезапускает полоску прогресса с нуля
function showAudioHint(){
  audioHint.style.display = 'block';
  audioHint.classList.remove('hidden');
  audioHintProgressFill.style.animation = 'none';
  void audioHintProgressFill.offsetWidth;
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

// Устанавливаем громкость по умолчанию для новых файлов
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
  // Не даём поставить оверлей впритык к краю кадра
  ovPosX = Math.max(OV_POS_MIN, Math.min(OV_POS_MAX, x));
  ovPosY = Math.max(OV_POS_MIN, Math.min(OV_POS_MAX, y));
  posHandle.style.left = ovPosX + '%';
  posHandle.style.top = ovPosY + '%';
  syncPresetActiveState();
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


// Настройки сохраняются отдельно для каждого видео и не переносятся между файлами
function applyOverlaySettings(){
  const size = ovSize.value + 'px';
  const color = hexToRgba(ovColor.value, ovOpacity.value / 100);
  ovTitle.style.fontSize = size;
  ovTime.style.fontSize = size;
  ovTitle.style.color = color;
  ovTime.style.color = color;

  overlayEl.style.left = ovPosX + '%';
  overlayEl.style.top = ovPosY + '%';
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
let storageErrorShown = false; // Не показываем уведомление при каждом автоматическом сохранении

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
// Приостанавливаем воспроизведение во время проверки длительности, чтобы скрыть служебный переход в конец файла и обратно
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
// Приводим отрицательное значение прогресса к нулю, чтобы не отображать некорректное время
  if (sec < 0) sec = 0;
  const h = Math.floor(sec/3600);
  const m = Math.floor((sec%3600)/60);
  const s = Math.floor(sec%60);
  const pad = n => String(n).padStart(2,'0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// --- тайминги: экран размывается в заданные промежутки ---
const BLUR_AMOUNT_PX = 40;
const timingFromHH = document.getElementById('timing-from-hh');
const timingFromMM = document.getElementById('timing-from-mm');
const timingFromSS = document.getElementById('timing-from-ss');
const timingToHH = document.getElementById('timing-to-hh');
const timingToMM = document.getElementById('timing-to-mm');
const timingToSS = document.getElementById('timing-to-ss');
const timingAddBtn = document.getElementById('timing-add-btn');
const timingErr = document.getElementById('timing-err');
const timingList = document.getElementById('timing-list');

// Время вводится по отдельным полям: после 2 цифр фокус переходит дальше, Backspace — к предыдущему
function wireSegmentedInput(hh, mm, ss, onEnter = null){
  const segments = [hh, mm, ss];
  segments.forEach((seg, i) => {
    seg.addEventListener('input', () => {
      seg.value = seg.value.replace(/[^0-9]/g, '').slice(0, 2);
      if (seg.value.length === 2 && i < segments.length - 1){
        segments[i + 1].focus();
        segments[i + 1].select();
      }
    });
    seg.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && seg.value === '' && i > 0){
        e.preventDefault();
        const prev = segments[i - 1];
        prev.focus();
        prev.value = prev.value.slice(0, -1);
      } else if (e.key === 'ArrowLeft' && seg.selectionStart === 0 && i > 0){
        e.preventDefault();
        segments[i - 1].focus();
        segments[i - 1].select();
      } else if (e.key === 'ArrowRight' && seg.selectionStart === seg.value.length && i < segments.length - 1){
        e.preventDefault();
        segments[i + 1].focus();
        segments[i + 1].select();
      } else if (e.key === ':'){
        e.preventDefault();
        // Если есть следующее поле — переходим к нему
        if (i < segments.length - 1){
          segments[i + 1].focus();
          segments[i + 1].select();
        }
        // Иначе просто игнорируем двоеточие на последнем поле
      } else if (e.key === 'Enter' && i === segments.length - 1){
        e.preventDefault();
        // Если это последний сегмент и есть callback, вызываем его
        if (onEnter && typeof onEnter === 'function') {
          onEnter();
        } else {
          // Иначе вызываем событие клика на кнопку добавления (для основного ввода)
          const addBtn = document.getElementById('timing-add-btn');
          if (addBtn) addBtn.click();
        }
      }
    });
    seg.addEventListener('focus', () => seg.select());
  });

  // Обработка кликов на визуальные двоеточия между полями
  const colon1 = hh.nextElementSibling;
  const colon2 = mm.nextElementSibling;
  if (colon1 && colon1.classList.contains('ts-colon')){
    colon1.style.cursor = 'text';
    colon1.addEventListener('click', () => {
      hh.focus();
      hh.select();
    });
  }
  if (colon2 && colon2.classList.contains('ts-colon')){
    colon2.style.cursor = 'text';
    colon2.addEventListener('click', () => {
      mm.focus();
      mm.select();
    });
  }

  // Обработка кликов на контейнер для фокуса на нужный сегмент
  const container = hh.parentElement;
  if (container && container.classList.contains('timing-segmented')){
    container.addEventListener('click', (e) => {
      if (e.target === container || e.target.classList.contains('ts-colon')){
        const rect = container.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const third = rect.width / 3;

        // Делим контейнер на 3 части: часы, минуты, секунды
        if (clickX < third){
          hh.focus();
          hh.select();
        } else if (clickX < third * 2){
          mm.focus();
          mm.select();
        } else {
          ss.focus();
          ss.select();
        }
      }
    });
  }
}

wireSegmentedInput(timingFromHH, timingFromMM, timingFromSS);
wireSegmentedInput(timingToHH, timingToMM, timingToSS);

// Связываем две группы таймингов для переходов между ними
function wireTimingGroups(fromHH, fromMM, fromSS, toHH, toMM, toSS){
  // При заполнении последнего сегмента (секунды) в начале — переходим к концу
  fromSS.addEventListener('input', () => {
    if (fromSS.value.length === 2){
      toHH.focus();
      toHH.select();
    }
  });

  // Стрелка вправо на последнем сегменте начала переходит к концу
  fromSS.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' && fromSS.selectionStart === fromSS.value.length){
      e.preventDefault();
      toHH.focus();
      toHH.select();
    }
  });

  // Стрелка влево на первом сегменте конца возвращает к началу
  toHH.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' && toHH.selectionStart === 0){
      e.preventDefault();
      fromSS.focus();
      fromSS.select();
    }
  });

  // Backspace на пустом конце возвращает к началу
  toHH.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && toHH.value === '' && toMM.value === '' && toSS.value === ''){
      e.preventDefault();
      fromSS.focus();
      fromSS.select();
    }
  });

  // Стрелка влево на пустом втором инпуте возвращает к первому
  toMM.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' && toMM.value === '' && toMM.selectionStart === 0){
      e.preventDefault();
      toHH.focus();
      toHH.select();
    }
  });

  // Стрелка вправо на последнем сегменте конца переходит дальше (кнопка сохранения)
  toSS.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' && toSS.selectionStart === toSS.value.length){
      // Можно добавить переход к кнопке сохранения если нужно
    }
  });
}

wireTimingGroups(timingFromHH, timingFromMM, timingFromSS, timingToHH, timingToMM, timingToSS);

// Собирает секунды из трёх полей чч/мм/сс; пустая часть считается нулём
// Если все три части пустые — считаем, что пользователь вообще ничего не ввёл
function getSegmentedSeconds(hh, mm, ss){
  if (hh.value === '' && mm.value === '' && ss.value === '') return null;
  const h = hh.value === '' ? '0' : hh.value;
  const m = mm.value === '' ? '0' : mm.value;
  const s = ss.value === '' ? '0' : ss.value;
  return parseTimeToSeconds(`${h}:${m}:${s}`);
}

// Заполняет поля чч/мм/сс из количества секунд (используется при редактировании готового тайминга)
function setSegmentedValue(hh, mm, ss, totalSeconds){
  const t = Math.max(0, Math.floor(totalSeconds || 0));
  const pad = n => String(n).padStart(2, '0');
  hh.value = pad(Math.floor(t / 3600));
  mm.value = pad(Math.floor((t % 3600) / 60));
  ss.value = pad(t % 60);
}

function clearSegmented(hh, mm, ss){
  hh.value = '';
  mm.value = '';
  ss.value = '';
}

// Создаёт группу из трёх полей чч:мм:сс с теми же классами/стилями, что и статичная
// разметка в HTML — используется при редактировании уже добавленных таймингов
function createSegmentedGroup(onEnter = null){
  const container = document.createElement('div');
  container.className = 'dr-text-input timing-time-input timing-segmented';

  const makeSeg = (placeholder, label) => {
    const seg = document.createElement('input');
    seg.type = 'text';
    seg.className = 'ts-seg';
    seg.placeholder = placeholder;
    seg.maxLength = 2;
    seg.inputMode = 'numeric';
    seg.setAttribute('aria-label', label);
    return seg;
  };
  const makeColon = () => {
    const colon = document.createElement('span');
    colon.className = 'ts-colon';
    colon.textContent = ':';
    return colon;
  };

  const hh = makeSeg('чч', 'Часы');
  const mm = makeSeg('мм', 'Минуты');
  const ss = makeSeg('сс', 'Секунды');
  container.append(hh, makeColon(), mm, makeColon(), ss);
  wireSegmentedInput(hh, mm, ss, onEnter);
  return { container, hh, mm, ss };
}

let blurRanges = []; // [{ from: сек, to: сек }, ...], отсортировано по from
let currentEditingItem = null; // текущий редактируемый элемент
let isEditing = false; // флаг для предотвращения одновременного редактирования

// Проверяем пересечение с другими диапазонами, не считая вплотную стыкующиеся диапазоны пересечением
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
    rangeText.title = `Размывается до ${formatTime(range.to + 1)} включительно`;
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
  
  // Функция сохранения (определяем до использования)
  const saveEdit = () => {
    const from = getSegmentedSeconds(fromGroup.hh, fromGroup.mm, fromGroup.ss);
    const to = getSegmentedSeconds(toGroup.hh, toGroup.mm, toGroup.ss);
    
    if (from === null || to === null) {
      fromGroup.container.classList.add('has-error');
      toGroup.container.classList.add('has-error');
      return;
    }
    
    if (to <= from) {
      fromGroup.container.classList.add('has-error');
      toGroup.container.classList.add('has-error');
      fromGroup.container.title = 'Время окончания должно быть больше времени начала';
      toGroup.container.title = 'Время окончания должно быть больше времени начала';
      return;
    }

    if (findOverlappingRange(from, to, idx)) {
      fromGroup.container.classList.add('has-error');
      toGroup.container.classList.add('has-error');
      fromGroup.container.title = 'Этот диапазон пересекается с другим';
      toGroup.container.title = 'Этот диапазон пересекается с другим';
      return;
    }

    if (isDurationUsable() && to > video.duration) {
      fromGroup.container.classList.add('has-error');
      toGroup.container.classList.add('has-error');
      fromGroup.container.title = 'Время окончания превышает длительность видео';
      toGroup.container.title = 'Время окончания превышает длительность видео';
      return;
    }
    
    // Сбрасываем стили ошибок
    fromGroup.container.classList.remove('has-error');
    toGroup.container.classList.remove('has-error');
    fromGroup.container.title = '';
    toGroup.container.title = '';
    
    // Обновляем диапазон
    blurRanges[idx] = { from, to };
    blurRanges.sort((a, b) => a.from - b.from);
    stopEditingSession();
    renderBlurRanges();
    updateVideoFilter();
    saveSettings();
  };
  
  // Создаем редактируемые поля
  const editContainer = document.createElement('div');
  editContainer.className = 'timing-edit-container';
  
  const fromGroup = createSegmentedGroup();
  fromGroup.container.style.flex = '1';
  setSegmentedValue(fromGroup.hh, fromGroup.mm, fromGroup.ss, range.from);

  const dash = document.createElement('span');
  dash.className = 'timing-dash';
  dash.textContent = '–';

  const toGroup = createSegmentedGroup(saveEdit);
  toGroup.container.style.flex = '1';
  setSegmentedValue(toGroup.hh, toGroup.mm, toGroup.ss, range.to);

  // Связываем группы для переходов между ними при редактировании
  wireTimingGroups(fromGroup.hh, fromGroup.mm, fromGroup.ss, toGroup.hh, toGroup.mm, toGroup.ss);
  
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'timing-add-btn';
  saveBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'timing-remove-btn';
  cancelBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
  
  // Переиспользуем уже существующую кнопку удаления элемента (со своим обработчиком).
  // Во время редактирования её не показываем — просто прячем на месте.
  const deleteBtn = item.querySelector('.timing-remove-btn');
  if (deleteBtn) deleteBtn.style.display = 'none';
  
  // Ряд редактирования с полями времени и кнопками подтверждения и отмены
  const confirmGroup = document.createElement('div');
  confirmGroup.className = 'timing-edit-confirm-group';
  confirmGroup.appendChild(saveBtn);
  confirmGroup.appendChild(cancelBtn);
  
  const inputsRow = document.createElement('div');
  inputsRow.className = 'timing-edit-inputs';
  inputsRow.appendChild(fromGroup.container);
  inputsRow.appendChild(dash);
  inputsRow.appendChild(toGroup.container);
  inputsRow.appendChild(confirmGroup);
  
  editContainer.appendChild(inputsRow);
  
  // Заменяем текст на редактируемые поля, растягиваем сам элемент под них
  item.replaceChild(editContainer, rangeText);
  item.classList.add('editing');
  
  // Предотвращаем закрытие настроек при клике на контейнер редактирования
  editContainer.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
  // Фокус на первое поле
  fromGroup.hh.focus();
  fromGroup.hh.select();
  
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
  
  // Закрытие редактирования при клике вне области
  const closeOnClickOutside = (e) => {
    // Для другого диапазона ничего не делаем — его обработчик сам переключит режим редактирования
    if (e.target.closest && e.target.closest('.timing-range')) {
      return;
    }
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
  
  // Сохранение при Enter / отмена при Escape — вешаем на все сегменты обеих групп
  const attachEnterEscape = (segments, onEnter, onEscape) => {
    segments.forEach(seg => {
      seg.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onEnter();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          // Останавливаем всплытие события, чтобы клик не закрывал панель настроек
          e.stopPropagation();
          onEscape();
        }
      });
    });
  };
  attachEnterEscape([fromGroup.hh, fromGroup.mm, fromGroup.ss], () => {
    toGroup.hh.focus();
    toGroup.hh.select();
  }, cancelEdit);
  attachEnterEscape([toGroup.hh, toGroup.mm, toGroup.ss], saveEdit, cancelEdit);
  
  // Сброс стилей ошибок при вводе
  [fromGroup.hh, fromGroup.mm, fromGroup.ss].forEach(seg => {
    seg.addEventListener('input', () => fromGroup.container.classList.remove('has-error'));
  });
  [toGroup.hh, toGroup.mm, toGroup.ss].forEach(seg => {
    seg.addEventListener('input', () => toGroup.container.classList.remove('has-error'));
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
  const from = getSegmentedSeconds(timingFromHH, timingFromMM, timingFromSS);
  const to = getSegmentedSeconds(timingToHH, timingToMM, timingToSS);
  if (from === null || to === null){
    showTimingError('Неверный формат времени. Используй чч:мм:сс');
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
  clearSegmented(timingFromHH, timingFromMM, timingFromSS);
  clearSegmented(timingToHH, timingToMM, timingToSS);
  timingFromHH.focus();
});

// Учитываем точность до секунды при расчёте конца блюра и используем единый формат отображения скорости
function formatSpeedLabel(rate){
  const n = Number(rate);
  return (Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(2)))) + 'x';
}
function isInBlurRange(t){
  // "до" указывается с точностью до секунды — считаем её включительно
  // до конца этой секунды, а не только до её начала
  return blurRanges.some(r => t >= r.from && t < r.to + 1);
}

// Единая точка применения фильтров видео: яркости и блюра по текущему таймингу
function updateVideoFilter(forceBlur){
  const parts = [];
  const brightness = drBrightness.value / 100;
  if (brightness !== 1) parts.push(`brightness(${brightness})`);
  const blurOn = (typeof forceBlur === 'boolean') ? forceBlur : isInBlurRange(video.currentTime);
  if (blurOn) parts.push(`blur(${BLUR_AMOUNT_PX}px)`);
  video.style.filter = parts.join(' ');
}

function niceTitleFromFilename(name){
  const withoutExt = name.replace(/\.[^/.]+$/, '');
  const pretty = withoutExt.replace(/[._]/g, ' ').trim();
  return pretty || String(name || 'Видео').trim() || 'Видео';
}


// Имя файла обрезается многоточием — дублируем в title для наведения
function setSubsFileNameDisplay(name){
  const nameWithoutExt = name === 'Файл не выбран' ? name : name.replace(/\.[^/.]+$/, '');
  subsFileName.textContent = nameWithoutExt;
  subsFileName.title = name === 'Файл не выбран' ? '' : name;
}

// --- запоминание тайминга просмотра (localStorage) ---
const PROGRESS_PREFIX = 'lp_progress:';
const URL_KEY_PREFIX = PROGRESS_PREFIX + 'url:';
const FOLDER_PROGRESS_PREFIX = PROGRESS_PREFIX + 'folder:';
const PLAYLIST_MANIFEST_PREFIX = 'lp_playlist:';
const SETTINGS_PREFIX = 'lp_settings:';
const SUBS_PREFIX = 'lp_subs:';
// Ограничиваем объём записей прогресса с учётом лимита localStorage
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

// Для серий папки учитываем folderId, чтобы файлы из разных папок имели отдельные настройки и прогресс
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
      try{
        localStorage.removeItem(items[i].key);
      } catch(e){ /* игнорируем ошибки при удалении */ }
    }
  }
}

// Обработчик завершения предотвращает восстановление записи прогресса после удаления завершённого видео
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
    // Сохраняем только данные прогресса просмотра.
    const progressData = {
      t: video.currentTime,
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
    
    // Удаляем дубликаты записей локальных файлов.
    removeDuplicateProgress(currentFileKey);
    
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

// Удаляем только записи без действующего handle в IndexedDB
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
    
    // Нормализуем громкость, чтобы video.volume всегда получал корректное значение
    settings.volume = validateNumber(settings.volume, 0, 1, DEFAULT_VOLUME);
  } catch(e){
    /* повреждённая запись — считаем, что настроек нет */
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
          // Поддерживаем старый формат субтитров и переносим их в IndexedDB
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
    // Не сбрасываем валидные настройки на значения по умолчанию при ошибке применения
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
  } catch(e){ /* повреждённая запись — игнорируем */ }
}

function startProgressTracking(){
  clearInterval(progressInterval);
  // Здесь сохраняем только прогресс просмотра — настройки сохраняются отдельно
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
  // Удаляем только записи без действующего handle, сохраняя реальные файлы
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


// Единая инициализация настроек для новых источников, чтобы одинаково обрабатывать файлы и URL
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
  if (typeof resetSubtitleRenderState === "function") resetSubtitleRenderState();
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

  // Очищаем старый аудио-граф перед созданием нового
  destroyAudioGraph();
  // Для локальных файлов создаём аудио-граф сразу, а для URL — при их загрузке
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
          // При ответе 200 на Range-запрос прекращаем загрузку и сохраняем размер полного файла
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

    // Ограничиваем объём загружаемых данных, чтобы чтение глав не мешало воспроизведению видео
    const MAX_CHAPTER_PROBE_BYTES = 8 * 1024 * 1024; // 8 МБ
    let bytesRead = 0;

    const getSize = () => size;
    const readChunk = async (chunkSize, offset) => {
      const end = Math.min(offset + chunkSize, size) - 1;
      const res = await fetch(url, { headers: { Range: `bytes=${offset}-${end}` } });

      // При ответе 200 вместо 206 прекращаем чтение, так как сервер игнорирует Range-запрос
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
// Формируем стабильный ID папки по именам файлов, чтобы повторное открытие использовало тот же манифест
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
    // Отмечаем в плейлисте серии, для которых сохранён прогресс просмотра
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
  // Сохраняем ID папки при добавлении новых серий, чтобы не терять существующий прогресс
  playlistFolderId = findMatchingFolderId(playlistFiles, playlistFolderName) || computeFolderId(playlistFiles);
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
  const first = playlistFiles[playlistIndex] || playlistFiles[0];
  loadFile(first.file, first.handle || null, { isFolder: true, folderName: playlistFolderName, folderId: playlistFolderId });
}

// Ищет сохранённый манифест той же папки по имени или совпадению не менее 60% файлов
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
  // Сразу снимаем подсветку зоны после завершения перетаскивания файлов
  dropzone.classList.remove('dragover');

  const files = e.dataTransfer.files;
  if (!files || files.length === 0) {
    // Обрабатываем перетаскивание текста
    showErrMsg('Не удалось получить файл. Попробуйте выбрать файл через диалог');
    return;
  }
  
  const file = files[0];
  if (!file) return;
  
  // Проверяем по MIME type или по расширению
  if (!isVideoFile(file)) {
    // Для перетащенной папки показываем подсказку с использованием отдельной зоны загрузки
    const looksLikeFolder = !file.type && !/\.[a-z0-9]{2,5}$/i.test(file.name);
    showErrMsg(looksLikeFolder
      ? 'Похоже, это папка. Перетащите её в зону «Выберите папку» справа'
      : 'Пожалуйста, перетащите видеофайл (.mp4, .webm, .mov)');
    return;
  }

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
  // Используем showOpenFilePicker в Chromium и обычный <input> в остальных браузерах
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
  // Обычный <input> не предоставляет FileSystemFileHandle, поэтому для продолжения потребуется повторный выбор файла
  loadFile(file, null);
});

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
const playlistBtn = document.getElementById('playlist-btn');
const playlistPanel = document.getElementById('playlist-panel');
const playlistList = document.getElementById('playlist-list');
const playlistTitle = document.getElementById('playlist-title');
const nextEpOverlay = document.getElementById('next-ep-overlay');
const skipSegmentOverlay = document.getElementById('skip-segment-overlay');
const subtitles = document.getElementById('subtitles');
const subsToggle = document.getElementById('subs-toggle');
const subsFile = document.getElementById('subs-file');
const subsLoadBtn = document.getElementById('subs-load-btn');
const subsSize = document.getElementById('subs-size');
const subsSizeVal = document.getElementById('subs-size-val');
const subsColor = document.getElementById('subs-color');
const subsOpacity = document.getElementById('subs-opacity');
const subsOpacityVal = document.getElementById('subs-opacity-val');
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
    // crossOrigin теперь устанавливается заранее при загрузке URL в loadUrl()
    // поэтому здесь просто создаём аудио-граф без дополнительной настройки CORS
    
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    sourceNode = audioCtx.createMediaElementSource(video);
    compressorNode = audioCtx.createDynamicsCompressor();
    boostGain = audioCtx.createGain();
    boostGain.gain.value = drBoost.value / 100;
    updateCompressor();
    connectGraph();
  } catch(e){
    if (e.name === 'SecurityError') {
      console.warn('CORS не поддерживается сервером, аудио-фичи отключены:', e);
      showStorageToast('Аудио-фичи недоступны для этого видео (отсутствует CORS)');
      drEnabled = false;
      drToggle.checked = false;
    } else {
      console.warn('Web Audio недоступен:', e);
    }
  }
}

// Гарантированно применяет фактическое (не только визуальное) состояние компрессора
function reapplyCompressorState(){
  ensureAudioGraph();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  // Web Audio недоступен (например, нет CORS и граф не создался) — применять нечего
  if (!audioCtx || !sourceNode || !compressorNode || !boostGain) return;

  const savedState = drToggle.checked; // фактическое сохранённое состояние для этой ссылки

  // 1. Переключаем в состояние, противоположное сохранённому
  drEnabled = !savedState;
  connectGraph();

  // 2. И сразу возвращаем обратно в сохранённое состояние
  drEnabled = savedState;
  connectGraph();
}

// После создания MediaElementAudioSourceNode звук всегда проходит через аудиограф
// При отключении графа возвращаем источник напрямую в destination
function bypassAudioGraph(){
  if (!audioCtx || !sourceNode) return;
  try { sourceNode.disconnect(); } catch(e) {}
  try { if (compressorNode) compressorNode.disconnect(); } catch(e) {}
  try { if (boostGain) boostGain.disconnect(); } catch(e) {}
  try { sourceNode.connect(audioCtx.destination); } catch(e) {}
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
  // Возвращаем прямой вывод в динамики, чтобы отключение аудиографа не останавливало воспроизведение
  if (audioCtx && sourceNode){
    try { sourceNode.connect(audioCtx.destination); } catch(e) {}
  }
  // Не закрываем audioContext и не обнуляем sourceNode
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

const PANEL_ANIMATION_MS = 300;

function makePanelToggler(){
  let pending = false;
  return function safeTogglePanel(setOpenFn, isOpenNow){
    if (pending) return;
    pending = true;
    setOpenFn(!isOpenNow);
    setTimeout(() => { pending = false; }, PANEL_ANIMATION_MS);
  };
}
const toggleDrPanel = makePanelToggler();
const togglePlaylistPanel = makePanelToggler();

// Не показываем подсказку «Следующая серия», пока открыты настройки, субтитры или плейлист
function anyPanelOpen(){
  return drPanel.classList.contains('open') || playlistPanel.classList.contains('open');
}

function setDrPanelOpen(open){
  const wasOpen = drPanel.classList.contains('open');
  drPanel.classList.toggle('open', open);
  drBtn.setAttribute('aria-expanded', String(open));
  drBtn.classList.toggle('active-panel', open);

  // Сворачиваем категории при переключении панели и закрываем плейлист, чтобы панели не перекрывались
  if (open) {
    const playlistWasOpen = playlistPanel.classList.contains('open');
    if (playlistWasOpen) {
      collapseCategoriesIn(drPanel);
    }
    setPlaylistPanelOpen(false);
    hideNextEpisodeOverlay();
    hideSkipSegmentOverlay();
  }
}
drBtn.addEventListener('click', () => {
  toggleDrPanel(setDrPanelOpen, drPanel.classList.contains('open'));
});

// --- Панель плейлиста ---
function setPlaylistPanelOpen(open){
  playlistPanel.classList.toggle('open', open);
  playlistBtn.setAttribute('aria-expanded', String(open));
  playlistBtn.classList.toggle('active-panel', open);

  if (open) {
    setDrPanelOpen(false);
    hideNextEpisodeOverlay();
    hideSkipSegmentOverlay();
  }
}
playlistBtn.addEventListener('click', () => {
  togglePlaylistPanel(setPlaylistPanelOpen, playlistPanel.classList.contains('open'));
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
        content = event1251.target.result;
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
  // Сохраняем текущие применённые субтитры, чтобы использовать их при неудачной загрузке новых
  const previousData = subtitlesData;
  const previousName = subsFileName.textContent;

  parseSubtitles(content, detectSubtitleFormat(content, file.name));

  if (subtitlesData.length === 0){
    // Разобрать не удалось — предупреждение уже показано в parseSubtitles.
    // Возвращаем прежние субтитры и НЕ трогаем сохранённую запись.
    subtitlesData = previousData;
    if (previousData.length){
      setSubsFileNameDisplay(previousName);
      updateSubtitles();
    }
    return;
  }

  // Храним реплики в IndexedDB, а в localStorage оставляем только метаданные субтитров
  const serialized = JSON.stringify(subtitlesData);
  const subsData = { fileName: file.name, ts: Date.now(), cues: subtitlesData.length, storage: 'idb' };
  try{
    localStorage.setItem(subsKey(currentFileKey), JSON.stringify(subsData));
    cleanupStorage(SUBS_PREFIX);
  } catch(e){ /* хранилище недоступно — не мешаем применить субтитры для текущей сессии */ }
  idbSet(SUBS_PREFIX + 'data:' + stripProgressPrefix(currentFileKey), serialized).catch(() => {});
  savedSubsContent = serialized;
  isSubtitlesLoaded = true;
  // Применяем стили сразу после загрузки
  applySubtitlesStyle();
  // Показываем кнопку удаления
  subsRemoveBtn.style.display = 'flex';
}

// --- Удаление субтитров ---
subsRemoveBtn.addEventListener('click', () => {
  subtitlesData = [];
  if (typeof resetSubtitleRenderState === "function") resetSubtitleRenderState();
  savedSubsContent = null;
  isSubtitlesLoaded = false;
  subtitles.innerHTML = '';
  subsFileName.textContent = 'Файл не выбран';
  subsFileName.title = '';
  subsFile.value = '';
  subsRemoveBtn.style.display = 'none';
  
  // Удаляем из localStorage и из IndexedDB
  if (currentFileKey) {
    try {
      localStorage.removeItem(subsKey(currentFileKey));
    } catch(e) {}
    idbDelete(SUBS_PREFIX + 'data:' + stripProgressPrefix(currentFileKey)).catch(() => {});
  }
  
  saveSettingsImmediate();
});

// Разбираем время в форматах SRT и WebVTT, поддерживая запятую, точку и форму мм:сс.ммм
const TIME_RANGE_RE = /((?:\d{1,3}:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d{1,3}:)?\d{1,2}:\d{2}[.,]\d{1,3})/;
function parseSubtitleTime(timeStr){
  const parts = String(timeStr).trim().replace(',', '.').split(':');
  if (parts.length < 2 || parts.length > 3) return NaN;
  const secPart = parseFloat(parts[parts.length - 1]);
  const minPart = parseInt(parts[parts.length - 2], 10);
  const hourPart = parts.length === 3 ? parseInt(parts[0], 10) : 0;
  if (!isFinite(secPart) || !isFinite(minPart) || !isFinite(hourPart)) return NaN;
  return hourPart * 3600 + minPart * 60 + secPart;
}

// Удаляем HTML и позиционные теги из текста субтитров перед выводом
function cleanSubtitleText(text){
  return String(text)
    .replace(/\{\\[^}]*\}/g, '')
    .replace(/<\/?(?:i|b|u|s|em|strong|font|ruby|rt|c|v|lang)(?:\s[^>]*)?>/gi, '')
    .replace(/<\/?\d{1,2}:\d{2}[.,]\d{1,3}>/g, '')
    .trim();
}

// Формат определяем по содержимому, а не по расширению: файл с именем .srt может
// оказаться WebVTT и наоборот
function detectSubtitleFormat(content, fileName){
  const head = String(content).slice(0, 200).trim();
  if (/^\uFEFF?WEBVTT/.test(head)) return 'vtt';
  if (/-->/.test(content) && /\d{1,2}:\d{2}[.,]\d{1,3}\s*-->/.test(content)) {
    return String(fileName || '').toLowerCase().endsWith('.vtt') ? 'vtt' : 'srt';
  }
  return String(fileName || '').toLowerCase().endsWith('.vtt') ? 'vtt' : 'srt';
}

function parseSubtitles(content, format) {
  subtitlesData = [];
  if (typeof resetSubtitleRenderState === "function") resetSubtitleRenderState();
  let skippedCount = 0;
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let i = 0;
  
  const isValidTiming = (start, end) => isFinite(start) && isFinite(end) && end > start;
  
  while (i < lines.length) {
    const line = lines[i].trim();
    
    if (format === 'srt') {
      const timeMatch = line.match(TIME_RANGE_RE);
      if (timeMatch) {
        const start = parseSubtitleTime(timeMatch[1]);
        const end = parseSubtitleTime(timeMatch[2]);

        // Текст
        i++;
        let text = '';
        while (i < lines.length && lines[i].trim() !== '') {
          text += lines[i] + '\n';
          i++;
        }

        if (text.trim()) {
          if (isValidTiming(start, end)) {
            subtitlesData.push({ start, end, text: cleanSubtitleText(text) });
          } else {
            skippedCount++;
          }
        }
      }
      i++;
    } else {
      // WebVTT формат - поддерживаем форматы 00:00:00.000, 00:00.000 и их комбинации с -->
      const vttMatch = line.match(TIME_RANGE_RE);
      if (vttMatch) {
        const timeMatch = vttMatch;
        {
          const start = parseSubtitleTime(timeMatch[1]);
          const end = parseSubtitleTime(timeMatch[2]);
          
          // Текст
          i++;
          let text = '';
          while (i < lines.length && lines[i].trim() !== '') {
            text += lines[i] + '\n';
            i++;
          }
          
          if (text.trim()) {
            if (isValidTiming(start, end)) {
              subtitlesData.push({ start, end, text: cleanSubtitleText(text) });
            } else {
              skippedCount++;
            }
          }
        }
      }
      i++;
    }
  }


  subtitlesData.sort((a, b) => a.start - b.start);

  if (skippedCount > 0){
    console.warn(`Субтитры: пропущено ${skippedCount} строк с некорректным таймингом`);
    showStorageToast(`Не удалось разобрать ${skippedCount} ${skippedCount === 1 ? 'реплику' : 'реплик'} субтитров — тайминг повреждён, они пропущены`);
  }
  
  // Если после парсинга нет субтитров, но файл не пустой - предупреждаем пользователя
  if (subtitlesData.length === 0 && content.trim().length > 0) {
    showStorageToast('Не удалось распознать ни одной реплики субтитров. Проверьте формат файла');
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
  let hours, minutes, secondsParts, seconds, milliseconds;
  
  if (parts.length === 2) {
    // Формат мм:сс.ммм (без часов)
    hours = 0;
    minutes = parseInt(parts[0]);
    secondsParts = parts[1].split('.');
    seconds = parseInt(secondsParts[0]);
    milliseconds = parseInt(secondsParts[1]);
  } else {
    // Формат чч:мм:сс.ммм
    hours = parseInt(parts[0]);
    minutes = parseInt(parts[1]);
    secondsParts = parts[2].split('.');
    seconds = parseInt(secondsParts[0]);
    milliseconds = parseInt(secondsParts[1]);
  }
  
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

// --- Настройки субтитров ---
function applySubtitlesStyle() {
  const size = subsSize.value + 'px';
  const color = hexToRgba(subsColor.value, subsOpacity.value / 100);
  
  const span = subtitles.querySelector('span');
  if (span) {
    span.style.fontSize = size;
    span.style.color = color;
    
    const textLines = span.innerHTML.split('<br>').length;
    const fontSize = parseInt(subsSize.value);
    const offset = Math.round(fontSize * 0.65);
    
    subtitles.style.bottom = textLines > 1 ? `calc(5% - ${offset}px)` : '5%';
  } else {
    subtitles.style.bottom = '5%';
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

// --- Сворачивание категорий настроек ---
// Инициализация: сворачиваем все категории при загрузке страницы
function initCategoryHeaders(){
  const allHeaders = document.querySelectorAll('.dr-category-header');
  allHeaders.forEach(header => {
    header.setAttribute('aria-expanded', 'false');
    const content = header.nextElementSibling;
    if (content && content.classList.contains('dr-category-content')) {
      content.classList.add('collapsed');
    }
  });
}

// Обработчики кликов
function setupCategoryClickHandlers(){
  const allHeaders = document.querySelectorAll('.dr-category-header');
  allHeaders.forEach(header => {
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
}

// Инициализация при загрузке
initCategoryHeaders();
setupCategoryClickHandlers();

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
  drSpeedVal.textContent = formatSpeedLabel(rate);
  saveSettings();
});
function resetSpeed(){
  video.playbackRate = 1;
  drSpeed.value = 1;
  drSpeedVal.textContent = formatSpeedLabel(1);
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
stage.addEventListener('contextmenu', (e) => e.preventDefault());

clickCatcher.addEventListener('click', () => {
  if (drPanel.classList.contains('open')){
    setDrPanelOpen(false);
    return;
  }
  if (playlistPanel.classList.contains('open')){
    setPlaylistPanelOpen(false);
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
  // Закрытие панели плейлиста
  if (playlistPanel.classList.contains('open')) {
    if (!playlistPanel.contains(e.target) && !playlistBtn.contains(e.target)) {
      setPlaylistPanelOpen(false);
    }
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (drPanel.classList.contains('open')) {
      setDrPanelOpen(false);
    }
    if (playlistPanel.classList.contains('open')) {
      setPlaylistPanelOpen(false);
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
    playBtn.setAttribute('data-tooltip', 'Пауза');
  } else {
    iconPlay.style.display = '';
    iconPause.style.display = 'none';
    playBtn.setAttribute('aria-pressed', 'false');
    playBtn.setAttribute('aria-label', 'Воспроизвести');
    playBtn.setAttribute('data-tooltip', 'Воспроизвести');
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
  
  // Сразу показываем кнопку "Пропустить заставку", если chapters уже загружены
  // Это гарантирует появление кнопки даже если chapters загрузились до начала воспроизведения
  if (mediaChapters.length > 0) {
    updateSkipSegmentOverlay(false);
  }
});
video.addEventListener('pause', () => {
  syncPlayStateUI();
  stopProgressTracking();
  stopUiSync();
  showCenterIcon(false);
});
video.addEventListener('ratechange', () => {
  // Синхронизируем ползунок скорости с реальным значением
  const rate = video.playbackRate;
  if (rate >= 0.25 && rate <= 4) {
    drSpeed.value = rate;
    drSpeedVal.textContent = formatSpeedLabel(rate);
  }
});
video.addEventListener('ended', () => {
  if (currentFileKey){
    // Помечаем ключ как «досмотрено», чтобы последующие pause/back/next не воскресили запись
    justEndedKey = currentFileKey;
    try{ localStorage.removeItem(currentFileKey); } catch(e){}
  }
  hideNextEpisodeOverlay();
  hideSkipSegmentOverlay();
  // Автопереход к следующему видео в плейлисте папки
  advanceToNextPlaylistItem();
});

let lastBlurActive = false;
// Время последнего кадра, который браузер ГАРАНТИРОВАННО отрисовал
let lastConfirmedTime = 0;

// Сбрасываем состояние блюра при загрузке любого нового файла
video.addEventListener('loadedmetadata', () => {
  lastConfirmedTime = 0;
  lastBlurActive = false;
});

// Проверяет, задевает ли отрезок [from, to] хотя бы один диапазон блюра
function rangeTouchesBlur(from, to){
  const lo = Math.min(from, to), hi = Math.max(from, to);
  return blurRanges.some(r => hi >= r.from && lo <= r.to + 1);
}

function syncBlurFilter(){
  const target = video.currentTime;
  let blurActive;

  if (video.seeking) {
    blurActive = isInBlurRange(target) ||
                 isInBlurRange(lastConfirmedTime) ||
                 rangeTouchesBlur(lastConfirmedTime, target);
  } else {
    blurActive = isInBlurRange(target);
    lastConfirmedTime = target;
  }

  if (blurActive !== lastBlurActive) {
    updateVideoFilter(blurActive);
    lastBlurActive = blurActive;
  }
}

// Событие timeupdate спецификация разрешает слать не чаще раза в 250 мс, и на этой
// частоте блюр опаздывал включиться на начало интервала, а субтитры — на реплику
let frameSyncHandle = null;
function frameSyncLoop(){
  frameSyncHandle = null;
  syncBlurFilter();
  updateSubtitles();
  scheduleFrameSync();
}
function scheduleFrameSync(){
  if (frameSyncHandle !== null || video.paused || video.ended) return;
  if (typeof video.requestVideoFrameCallback === 'function'){
    frameSyncHandle = video.requestVideoFrameCallback(frameSyncLoop);
  } else {
    frameSyncHandle = requestAnimationFrame(frameSyncLoop);
  }
}
function stopFrameSync(){
  if (frameSyncHandle === null) return;
  if (typeof video.cancelVideoFrameCallback === 'function'){
    try { video.cancelVideoFrameCallback(frameSyncHandle); } catch(e){ cancelAnimationFrame(frameSyncHandle); }
  } else {
    cancelAnimationFrame(frameSyncHandle);
  }
  frameSyncHandle = null;
}
video.addEventListener('play', scheduleFrameSync);
video.addEventListener('playing', scheduleFrameSync);
video.addEventListener('pause', stopFrameSync);
video.addEventListener('emptied', stopFrameSync);

video.addEventListener('timeupdate', () => {
  const txt = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
  ovTime.textContent = txt;
  timeDisplay.textContent = txt;
  if (!isSeeking && isDurationUsable()){
    seek.value = (video.currentTime / video.duration) * 1000;
  }
  
  // Обновление блюра
  syncBlurFilter();
  
  // Обновление субтитров
  updateSubtitles();

  // Подсказка "Следующая серия" — показываем ближе к концу текущего эпизода
  const hasNextEpisode = playlistFiles.length > 1 && playlistIndex > -1 && playlistIndex < playlistFiles.length - 1;
  let showNextEpisode = false;
  if (hasNextEpisode && isDurationUsable() && !nextEpisodePromptDismissed && !anyPanelOpen()){
    const remaining = video.duration - video.currentTime;
    showNextEpisode = remaining <= nextEpisodeThreshold(video.duration) && remaining > 0.05;
  }
  if (showNextEpisode){
    nextEpOverlay.classList.add('show');
  } else {
    hideNextEpisodeOverlay();
  }

  updateSkipSegmentOverlay(showNextEpisode);
});

nextEpOverlay.addEventListener('click', () => {
  hideNextEpisodeOverlay();
  advanceToNextPlaylistItem();
});

// Показывает/обновляет/скрывает плашку "Пропустить" для текущего момента
function updateSkipSegmentOverlay(suppressed){
  if (suppressed || anyPanelOpen() || mediaChapters.length === 0){
    hideSkipSegmentOverlay();
    return;
  }
  const t = video.currentTime;
  const seg = mediaChapters.find(s => t >= s.start && t < skipSegmentEffectiveEnd(s));
  if (!seg || dismissedChapterSegments.has(seg.id)){
    hideSkipSegmentOverlay();
    return;
  }
  activeSkipSegment = seg;
  // Всегда обновляем текст, даже если плашка уже показана - нужно для случая
  // когда пользователь перематывает с одного сегмента на другой 
  skipSegmentOverlay.textContent = seg.label;
  skipSegmentOverlay.classList.add('show');
}

video.addEventListener('seeking', () => {
  // Как только браузер зафиксировал начало перемотки — сразу подстраховываемся
  // блюром, если перемотка задевает диапазон блюра
  syncBlurFilter();
});

video.addEventListener('seeked', () => {
  // Пересчитываем blur-фильтр сразу по завершении перемотки — не ждём timeupdate
  syncBlurFilter();

  if (mediaChapters.length === 0) return;
  const t = video.currentTime;
  let changed = false;
  for (const s of mediaChapters){
    if (dismissedChapterSegments.has(s.id) && t < skipSegmentEffectiveEnd(s)){
      dismissedChapterSegments.delete(s.id);
      changed = true;
    }
  }
  // Всегда обновляем плашку при перемотке, чтобы текст кнопки изменился
  // при переходе с одного сегмента на другой
  updateSkipSegmentOverlay(false);
});

skipSegmentOverlay.addEventListener('click', () => {
  if (activeSkipSegment){
    dismissedChapterSegments.add(activeSkipSegment.id);
    const end = skipSegmentEffectiveEnd(activeSkipSegment);
    // Перематываем к концу главы, но с небольшим запасом ВПЕРЁД (0.05с)
    let target = isFinite(end) ? end + 0.05 : end;
    if (isDurationUsable()){
      target = isFinite(target) ? Math.min(target, video.duration - 0.05) : video.duration - 0.05;
    }
    if (isFinite(target)) video.currentTime = Math.max(target, activeSkipSegment.start);
  }
  hideSkipSegmentOverlay();
});

// Реплика, которая сейчас нарисована. Нужна, чтобы не трогать DOM на каждом кадре
let renderedSub = null;

let subSearchIdx = 0;
function findSubtitleAt(t){
  const n = subtitlesData.length;
  if (!n) return null;
  const hit = i => i >= 0 && i < n && t >= subtitlesData[i].start && t < subtitlesData[i].end;
  if (hit(subSearchIdx)) return subtitlesData[subSearchIdx];
  if (hit(subSearchIdx + 1)) { subSearchIdx += 1; return subtitlesData[subSearchIdx]; }

  let lo = 0, hi = n - 1, found = -1;
  while (lo <= hi){
    const mid = (lo + hi) >> 1;
    if (subtitlesData[mid].start <= t){ found = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  if (found === -1) return null;
  subSearchIdx = found;
  return hit(found) ? subtitlesData[found] : null;
}

function resetSubtitleRenderState(){
  renderedSub = null;
  subSearchIdx = 0;
}

function updateSubtitles() {
  if (!subsToggle.checked || subtitlesData.length === 0) {
    if (renderedSub !== null){
      subtitles.innerHTML = '';
      renderedSub = null;
    }
    return;
  }

  const currentSub = findSubtitleAt(video.currentTime) || null;

  // Ничего не изменилось — DOM не трогаем
  if (currentSub === renderedSub) return;
  renderedSub = currentSub;

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

    // Форсируем пересчёт blur-фильтра сразу, не дожидаясь timeupdate/seeked —
    // иначе при быстром драге фильтр может "залипнуть" на старом состоянии.
    syncBlurFilter();
  }
});
seek.addEventListener('change', () => {
  isSeeking = false;
});
seek.addEventListener('mouseup', () => isSeeking = false);
seek.addEventListener('touchend', () => isSeeking = false);
document.addEventListener('mouseup', () => { if (isSeeking) isSeeking = false; });

function updateVolumeIcon(){
  const isOff = video.muted || video.volume <= 0;
  iconVolOn.style.display = isOff ? 'none' : '';
  iconVolOff.style.display = isOff ? '' : 'none';
  muteBtn.setAttribute('aria-pressed', String(isOff));
  muteBtn.setAttribute('aria-label', isOff ? 'Включить звук' : 'Выключить звук');
  muteBtn.setAttribute('data-tooltip', isOff ? 'Включить звук' : 'Выключить звук');
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
  // Стандартный requestFullscreen() возвращает Promise, но старые версии
  // Safari/WebKit (webkitRequestFullscreen) возвращают undefined, а не Promise —
  // и вызывающий код всегда делает .catch() на результате
  if (!fn) return Promise.reject(new Error('Fullscreen API не поддерживается'));
  return Promise.resolve(fn.call(el));
}
function exitFs(){
  const fn = document.exitFullscreen || document.webkitExitFullscreen;
  if (!fn) return Promise.reject(new Error('Fullscreen API не поддерживается'));
  return Promise.resolve(fn.call(document));
}

// Дебаунс для предотвращения повторных быстрых нажатий
let fullscreenPending = false;
// Страховка: fullscreenPending обычно снимается событием fullscreenchange
// (успех) или .catch() (явная ошибка/отказ Promise)
let fullscreenSafetyTimer = null;
function armFullscreenSafety(){
  clearTimeout(fullscreenSafetyTimer);
  fullscreenSafetyTimer = setTimeout(() => { fullscreenPending = false; }, 1500);
}

fullscreenBtn.addEventListener('click', () => {
  if (fullscreenPending) return;
  
  if (!getFullscreenElement()){
    fullscreenPending = true;
    armFullscreenSafety();
    requestFs(stage).catch(err => {
      console.warn('Fullscreen request failed:', err);
      clearTimeout(fullscreenSafetyTimer);
      fullscreenPending = false;
    });
  } else {
    fullscreenPending = true;
    armFullscreenSafety();
    exitFs().catch(err => {
      console.warn('Fullscreen exit failed:', err);
      clearTimeout(fullscreenSafetyTimer);
      fullscreenPending = false;
    });
  }
});

['fullscreenchange', 'webkitfullscreenchange'].forEach(evt => {
  document.addEventListener(evt, () => {
    clearTimeout(fullscreenSafetyTimer);
    fullscreenPending = false;
    const isFs = !!getFullscreenElement();
    iconFsOpen.style.display = isFs ? 'none' : '';
    iconFsClose.style.display = isFs ? '' : 'none';
    fullscreenBtn.setAttribute('aria-pressed', String(isFs));
    fullscreenBtn.setAttribute('aria-label', isFs ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим');
    fullscreenBtn.setAttribute('data-tooltip', isFs ? 'Выйти из полного экрана' : 'Полный экран');
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
  const current = video.muted ? (lastVolume > 0 ? lastVolume : 0) : video.volume;
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
    (activeEl.tagName === 'INPUT' && ['text','range','color'].includes(activeEl.type)) ||
    activeEl.tagName === 'TEXTAREA' ||
    activeEl.isContentEditable
  );
  if (isTextLike) return;
  const isFormControl = activeEl && (
    (activeEl.tagName === 'INPUT' && ['checkbox','radio'].includes(activeEl.type)) ||
    activeEl.tagName === 'SELECT'
  );
  if (isFormControl && (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter')) return;
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

// --- Индикатор буферизации (лаги сети) ---
let bufferingShowTimer = null;

function showBufferingIndicator(){
  if (bufferingShowTimer) return; // уже запланирован показ
  // Небольшая задержка, чтобы короткие рывки буфера не вызывали мигание спиннера
  bufferingShowTimer = setTimeout(() => {
    bufferingShowTimer = null;
    bufferingOverlayEl.classList.add('visible');
  }, 350);
}

function hideBufferingIndicator(){
  if (bufferingShowTimer){
    clearTimeout(bufferingShowTimer);
    bufferingShowTimer = null;
  }
  bufferingOverlayEl.classList.remove('visible');
}

video.addEventListener('waiting', showBufferingIndicator);
video.addEventListener('stalled', showBufferingIndicator);
video.addEventListener('playing', hideBufferingIndicator);
video.addEventListener('canplay', hideBufferingIndicator);
video.addEventListener('canplaythrough', hideBufferingIndicator);
video.addEventListener('pause', hideBufferingIndicator);
video.addEventListener('error', hideBufferingIndicator);
video.addEventListener('emptied', hideBufferingIndicator);

// --- возврат к выбору файла ---
backBtn.addEventListener('click', () => {
  if (isSwitching) return;
  isSwitching = true;
  
  // Выходим из полноэкранного режима перед скрытием плеера
  if (document.fullscreenElement) exitFs();
  
  stopProgressTracking();
  hideBufferingIndicator();
  
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
  urlInput.value = '';
  urlInput.classList.remove('error');
  hideErrMsg();
  playerView.classList.remove('active');
  dropView.style.display = 'flex';
  
  // Подсказку аудио не скрываем - она должна оставаться видимой

  // Сбрасываем плейлист папки - следующая загрузка должна начинаться с чистого состояния
  resetPlaylist();

  renderResumeList();
  isSwitching = false;
});

// --- Загрузка видео по URL (m3u8 и обычные ссылки) ---
let hls = null;
let urlErrorHandler = null;
let urlLoadToken = 0;

function armDirectLoadWatchdog(thisLoadToken){
  return setTimeout(() => {
    if (thisLoadToken !== urlLoadToken) return; // запущена уже другая попытка загрузки
    urlLoadingSpinner.style.display = 'none';
    urlLoadBtn.disabled = false;
    showUrlError('Не удалось загрузить видео: сервер слишком долго не отвечает. Проверьте соединение с интернетом или попробуйте другую ссылку', { duration: 20000 });
  }, 20000);
}

async function diagnoseVideoLoadError(url, fallbackMessage){
  try {
    const resp = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    if (resp.status === 404){
      return 'Ссылка больше не работает. Похоже, она устарела или файл был удалён с сервера';
    }
    if (resp.status >= 400){
      return `Сервер вернул ошибку ${resp.status}. Ссылка недоступна`;
    }
  } catch (e){
    // fetch не прошёл (CORS/сеть) — молча остаёмся на исходном сообщении
  }
  return fallbackMessage;
}

// Для реальной работы компрессора на ссылку сразу ставится crossOrigin='anonymous'
function retryWithoutCrossOriginOnError(url, thisLoadToken, onRecovered){
  if (video.crossOrigin !== 'anonymous') return false; // ошибка не из-за crossOrigin
  if (thisLoadToken !== urlLoadToken) return false; // запущена уже другая попытка загрузки

  video.removeAttribute('crossOrigin');
  // Не рвём граф, а переводим его в обход: иначе видео зависнет на 00:00
  bypassAudioGraph();
  drEnabled = false;
  drToggle.checked = false;
  showStorageToast('Компрессор и усиление недоступны для этой ссылки — сервер не поддерживает CORS. Само видео и звук работают как обычно');


  video.src = url;
  video.load();

  let settled = false;

  // Страховочный таймаут: если после снятия crossOrigin браузер всё равно
  // не выдаёт ни loadedmetadata, ни error (молчаливое зависание), не оставляем
  // пользователя смотреть на пустой экран/спиннер вечно
  const hangTimeout = setTimeout(() => {
    if (settled || thisLoadToken !== urlLoadToken) return;
    settled = true;
    urlLoadingSpinner.style.display = 'none';
    urlLoadBtn.disabled = false;
    showUrlError('Не удалось загрузить видео (сервер не отвечает после повторной попытки без CORS)', { duration: 20000 });
  }, 12000);

  video.addEventListener('loadedmetadata', function(){
    if (settled) return;
    settled = true;
    clearTimeout(hangTimeout);
    urlLoadingSpinner.style.display = 'none';
    urlLoadBtn.disabled = false;
    onRecovered();
  }, { once: true });
  video.addEventListener('error', urlErrorHandler = function(){
    if (settled) return;
    settled = true;
    clearTimeout(hangTimeout);
    urlLoadingSpinner.style.display = 'none';
    urlLoadBtn.disabled = false;
    const fallback = 'Не удалось загрузить видео';
    showUrlError(fallback, { duration: 20000 });
    diagnoseVideoLoadError(url, fallback).then(msg => {
      if (thisLoadToken !== urlLoadToken) return;
      if (msg !== fallback) showUrlError(msg, { duration: 20000 });
    });
  }, { once: true });
  return true;
}

// Опознаёт HLS-манифест по ответу сервера
// чтобы не менять прежнее поведение.
async function sniffHlsManifest(url){
  const res = await fetchManifestHead(url, true) || await fetchManifestHead(url, false);
  if (!res) return false;
  const { ct, head } = res;
  if (ct.includes('mpegurl')) return true;
  if (ct.startsWith('video/') || ct.startsWith('audio/')) return false;
  return /^\uFEFF?#EXTM3U/.test(head.trim());
}

async function fetchManifestHead(url, useRange){
  try{
    const res = await fetch(url, useRange ? { headers: { Range: 'bytes=0-1023' } } : undefined);
    if (!res.ok && res.status !== 206) return null;
    const ct = (res.headers.get('Content-Type') || '').toLowerCase();
    // Тип уже всё говорит — тело читать незачем
    if (ct.includes('mpegurl') || ct.startsWith('video/') || ct.startsWith('audio/')){
      if (res.body && res.body.cancel) res.body.cancel().catch(() => {});
      return { ct, head: '' };
    }
    return { ct, head: (await res.text()).slice(0, 1024) };
  } catch(e){
    return null;
  }
}

async function loadUrl(url){
  if (urlErrorHandler){
    video.removeEventListener('error', urlErrorHandler);
    urlErrorHandler = null;
  }
  urlLoadToken++;
  const thisLoadToken = urlLoadToken;


  url = String(url || '').trim();
  if (url === ''){
    showUrlError('Введите ссылку');
    return;
  }

  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)){
    const looksLikeHost = !/\s/.test(url) && /^(?:[\w-]+\.)+[a-z]{2,}(?:[:/?#]|$)|^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:[/?#]|$)|^localhost(?::\d+)?(?:[/?#]|$)/i.test(url);
    if (!looksLikeHost){
      showUrlError('Некорректная ссылка');
      return;
    }
    url = 'https://' + url;
  }

  // Показываем индикатор загрузки
  urlLoadingSpinner.style.display = 'inline-block';
  urlLoadBtn.disabled = true;

  // Очищаем предыдущие ошибки
  urlInput.classList.remove('error');
  hideErrMsg();
  videoErrorEl.style.display = 'none';
  hideBufferingIndicator();
  stopProgressTracking();

  // Сбрасываем главы от предыдущего видео (сами новые читаем чуть ниже,
  // как только понятно, что это не m3u8-поток).
  resetMediaChapters();

  // Проверяем валидность URL и сохраняем результат для дальнейшего использования
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (e){
    showUrlError('Некорректная ссылка');
    return;
  }

  // Определяем тип видео по расширения (используем pathname, чтобы query-параметры не мешали)
  let isM3U8 = /\.m3u8$/i.test(parsedUrl.pathname);
  const isDirectVideo = /\.(mp4|webm|mov)$/i.test(parsedUrl.pathname);

  if (!isM3U8 && !isDirectVideo){
    const sniffed = await sniffHlsManifest(url);
    if (thisLoadToken !== urlLoadToken) return;   // пользователь уже открыл другой источник
    if (sniffed) isM3U8 = true;
  }

  const NON_VIDEO_EXTENSION = /\.(html?|json|xml|txt|jpe?g|png|gif|webp|svg|css|js|php|aspx?)$/i;
  const isFileLike = !isM3U8 && !isDirectVideo && !NON_VIDEO_EXTENSION.test(parsedUrl.pathname);

  // Главы читаем только для того, что реально окажется прямым видеофайлом
  if (isDirectVideo || isFileLike){
    parseChaptersFromUrl(url, chapterParseToken);
  }

  // Останавливаем предыдущий HLS экземпляр
  if (hls){
    hls.destroy();
    hls = null;
  }

  justEndedKey = null;
  migrateLegacyUrlKey(url);
  currentFileKey = urlKey(url);
  originalFileName = getFileNameFromUrl(url); // Сохраняем исходное имя из URL
  currentFileName = niceTitleFromFilename(getFileNameFromUrl(url)); // Отображаемое имя без расширения
  
  // Пытаемся получить оригинальное имя файла из Content-Disposition заголовка
  getOriginalFileNameFromUrl(url).then(originalName => {
    if (originalName && originalName !== originalFileName) {
      originalFileName = originalName;
      currentFileName = niceTitleFromFilename(originalName);
      // Обновляем отображение имени в UI
      fnameEl.textContent = currentFileName;
      ovTitle.textContent = currentFileName;
      titleInput.value = currentFileName;
    }
  }).catch(() => {
    // Если не удалось получить оригинальное имя, используем имя из URL
  });

  // Устанавливаем crossOrigin ДО установки src для HTTPS-ссылок
  // Это нужно для корректной работы Web Audio API и избежания гонки условий
  if (!isM3U8) {
    video.crossOrigin = 'anonymous';
  }

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
        showUrlError('Браузер не поддерживает m3u8 без hls.js библиотеки');
      }, { once: true });
    } else {
      urlLoadingSpinner.style.display = 'none';
      urlLoadBtn.disabled = false;
      showUrlError('Браузер не поддерживает m3u8 и hls.js библиотека не загружена');
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
      
      // Счётчик попыток ретрая для NETWORK_ERROR
      let retryCount = 0;
      const MAX_RETRIES = 3;

      hls.loadSource(url);
      hls.attachMedia(video);

      let loadTimeout = null;
      function armLoadTimeout(ms){
        clearTimeout(loadTimeout);
        loadTimeout = setTimeout(() => {
          if (hls !== hlsInstance) return;
          urlLoadingSpinner.style.display = 'none';
          urlLoadBtn.disabled = false;
          showUrlError('Не удалось загрузить видео. Возможно, поток недоступен', { duration: 20000 });
          hlsInstance.destroy();
          hls = null;
        }, ms);
      }
      armLoadTimeout(15000);

      hls.on(Hls.Events.MANIFEST_PARSED, function(){
        clearTimeout(loadTimeout);
        urlLoadingSpinner.style.display = 'none';
        urlLoadBtn.disabled = false;
        showPlayer();
        
        // Показываем подсказку о стабилизации звука для HLS
        showAudioHint();
        video.play().catch(e => {
          if (e.name === 'NotAllowedError') {
            console.log('Autoplay prevented - user interaction required');
          } else {
            console.warn('Play error:', e);
          }
        });
      });

      hls.on(Hls.Events.ERROR, function(event, data){
        // Нефатальные ошибки (обычные для HLS-потоков — отдельный битый сегмент
        // и т.п.) hls.js обрабатывает сам; они не должны снимать сторожевой
        // таймаут и не должны прятать спиннер загрузки.
        if (!data.fatal) return;

        switch (data.type){
          case Hls.ErrorTypes.NETWORK_ERROR:
            // Более детальные сообщения на основе data.details
            {
              let errorMessage = 'Встраиваемая ссылка недоступна';
              const isManifestError = data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR ||
                  data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT ||
                  data.details === Hls.ErrorDetails.MANIFEST_PARSING_ERROR;
              if (isManifestError) {
                errorMessage = 'Не удалось загрузить манифест. Проверьте ссылку или наличие CORS';
              } else if (data.details === Hls.ErrorDetails.KEY_LOAD_ERROR) {
                errorMessage = 'Не удалось загрузить ключ шифрования потока';
              } else if (data.details === Hls.ErrorDetails.LEVEL_LOAD_ERROR) {
                errorMessage = 'Не удалось загрузить список качеств';
              } else if (data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR) {
                errorMessage = 'Не удалось загрузить сегмент видео';
              }

              // Если это CORS ошибка (смотрим в response текст или проверяем origin)
              if (data.response && data.response.code === 0) {
                // CORS ошибка - нет доступа к ответу
                clearTimeout(loadTimeout);
                urlLoadingSpinner.style.display = 'none';
                urlLoadBtn.disabled = false;
                hlsInstance.destroy();
                hls = null;
                showUrlError('Сайт-источник запрещает встраивание в другие страницы/плееры. Доступ заблокирован на стороне сервера', { duration: 20000 });
                return;
              }

              // 404 — ссылка мертва (истекла/удалена)
              if (data.response && data.response.code === 404) {
                clearTimeout(loadTimeout);
                urlLoadingSpinner.style.display = 'none';
                urlLoadBtn.disabled = false;
                hlsInstance.destroy();
                hls = null;
                showUrlError('Ссылка больше не работает. Похоже, она устарела или файл был удалён с сервера', { duration: 20000 });
                return;
              }

              // 410 — ресурс Gone (был, но удалён)
              if (data.response && data.response.code === 410) {
                clearTimeout(loadTimeout);
                urlLoadingSpinner.style.display = 'none';
                urlLoadBtn.disabled = false;
                hlsInstance.destroy();
                hls = null;
                showUrlError('Ссылка больше не работает. Похоже, она устарела или файл был удалён с сервера', { duration: 20000 });
                return;
              }

              if (retryCount < MAX_RETRIES) {
                retryCount++;
                const delay = Math.pow(2, retryCount - 1) * 1000; // Экспоненциальная задержка: 1с, 2с, 4с
                // Спиннер и сторож остаются активными на время ретрая — пользователь
                // видит, что попытка ещё идёт, а не пустой экран без обратной связи.
                armLoadTimeout(delay + 15000);
                setTimeout(() => {
                  if (hls !== hlsInstance) return; // плеер уже закрыт/переключён — ничего не делаем
                  try {
                    if (isManifestError) {
                      hlsInstance.loadSource(url);
                    } else {
                      hlsInstance.startLoad();
                    }
                  } catch (e) {
                    clearTimeout(loadTimeout);
                    urlLoadingSpinner.style.display = 'none';
                    urlLoadBtn.disabled = false;
                    hlsInstance.destroy();
                    hls = null;
                    showUrlError(errorMessage, { duration: 20000 });
                  }
                }, delay);
              } else {
                // Лимит попыток исчерпан
                clearTimeout(loadTimeout);
                urlLoadingSpinner.style.display = 'none';
                urlLoadBtn.disabled = false;
                hlsInstance.destroy();
                hls = null;
                showUrlError(errorMessage, { duration: 20000 });
              }
            }
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            setTimeout(() => {
              if (hls !== hlsInstance) return;
              try {
                hlsInstance.recoverMediaError();
              } catch (e) {
                clearTimeout(loadTimeout);
                urlLoadingSpinner.style.display = 'none';
                urlLoadBtn.disabled = false;
                hlsInstance.destroy();
                hls = null;
                showUrlError('Не удалось восстановить воспроизведение', { duration: 20000 });
              }
            }, 1000);
            break;
          default:
            // Более детальные сообщения для default-ветки
            {
              clearTimeout(loadTimeout);
              urlLoadingSpinner.style.display = 'none';
              urlLoadBtn.disabled = false;
              let errorMessage = ' Ссылка может быть недоступной или неправильной';
              if (data.details === Hls.ErrorDetails.MANIFEST_PARSING_ERROR) {
                errorMessage = ' Манифест повреждён или имеет неправильный формат.';
              } else if (data.details === Hls.ErrorDetails.MANIFEST_INCOMPATIBLE_CODECS_ERROR) {
                errorMessage = ' Видео использует неподдерживаемые кодеки.';
              }
              showUrlError(errorMessage, { duration: 20000 });
              hlsInstance.destroy();
              hls = null;
            }
            break;
        }
      });
      
      // Общая инициализация для ветки с hls.js
      loadUrlCommonInit();
      return;
    } catch (e){
      urlLoadingSpinner.style.display = 'none';
      urlLoadBtn.disabled = false;
      showUrlError('Ошибка загрузки');
    }
  } else if (video.canPlayType('application/vnd.apple.mpegurl') && isM3U8){
    // Native HLS (Safari)
    video.src = url;
    const directLoadTimeout = armDirectLoadWatchdog(thisLoadToken);
    video.addEventListener('loadedmetadata', function(){
      clearTimeout(directLoadTimeout);
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
    }, { once: true });

    video.addEventListener('error', urlErrorHandler = function(){
      clearTimeout(directLoadTimeout);
      if (retryWithoutCrossOriginOnError(url, thisLoadToken, () => {
        showPlayer();
        video.play().catch(e => {
          if (e.name === 'NotAllowedError') {
            console.log('Autoplay prevented - user interaction required');
          } else {
            console.warn('Play error:', e);
          }
        });
      })) return;
      urlLoadingSpinner.style.display = 'none';
      urlLoadBtn.disabled = false;
      const fallback = 'Не удалось загрузить видео';
      showUrlError(fallback, { duration: 20000 });
      diagnoseVideoLoadError(url, fallback).then(msg => {
        if (thisLoadToken !== urlLoadToken) return; // запущена новая попытка загрузки — не мешаем ей
        if (msg !== fallback) showUrlError(msg, { duration: 20000 });
      });
    }, { once: true });
    
    // Общая инициализация для этой ветки
    loadUrlCommonInit();
    return;
  } else if (isFileLike){
    // Ссылка похожа на файл (CDN без расширения, но с параметрами файла)
    // Пробуем загрузить как прямую ссылку на видео
    video.src = url;
    const directLoadTimeout = armDirectLoadWatchdog(thisLoadToken);
    video.addEventListener('loadedmetadata', function(){
      clearTimeout(directLoadTimeout);
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
    }, { once: true });

    video.addEventListener('error', urlErrorHandler = function(){
      clearTimeout(directLoadTimeout);
      if (retryWithoutCrossOriginOnError(url, thisLoadToken, () => {
        showPlayer();
        video.play().catch(e => {
          if (e.name === 'NotAllowedError') {
            console.log('Autoplay prevented - user interaction required');
          } else {
            console.warn('Play error:', e);
          }
        });
      })) return;
      urlLoadingSpinner.style.display = 'none';
      urlLoadBtn.disabled = false;
      const fallback = 'Не удалось загрузить видео. Возможно, ссылка недоступна';
      showUrlError(fallback, { duration: 20000 });
      diagnoseVideoLoadError(url, fallback).then(msg => {
        if (thisLoadToken !== urlLoadToken) return; // запущена новая попытка загрузки — не мешаем ей
        if (msg !== fallback) showUrlError(msg, { duration: 20000 });
      });
    }, { once: true });

    // Общая инициализация для этой ветки
    loadUrlCommonInit();
    return;
  } else if (isDirectVideo || isM3U8){
    // Прямая ссылка на видео или m3u8 без поддержки HLS
    video.src = url;
    const directLoadTimeout = armDirectLoadWatchdog(thisLoadToken);
    video.addEventListener('loadedmetadata', function(){
      clearTimeout(directLoadTimeout);
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
    }, { once: true });

    video.addEventListener('error', urlErrorHandler = function(){
      clearTimeout(directLoadTimeout);
      if (!isM3U8 && retryWithoutCrossOriginOnError(url, thisLoadToken, () => {
        showPlayer();
        video.play().catch(e => {
          if (e.name === 'NotAllowedError') {
            console.log('Autoplay prevented - user interaction required');
          } else {
            console.warn('Play error:', e);
          }
        });
      })) return;
      urlLoadingSpinner.style.display = 'none';
      urlLoadBtn.disabled = false;
      if (isM3U8){
        showUrlError('Браузер не поддерживает m3u8', { duration: 20000 });
      } else {
        const fallback = 'Не удалось загрузить видео';
        showUrlError(fallback, { duration: 20000 });
        diagnoseVideoLoadError(url, fallback).then(msg => {
          if (thisLoadToken !== urlLoadToken) return; // запущена новая попытка загрузки — не мешаем ей
          if (msg !== fallback) showUrlError(msg, { duration: 20000 });
        });
      }
    }, { once: true });
    
    // Общая инициализация для этой ветки
    loadUrlCommonInit();
    return;
  } else {
    showUrlError('Неподдерживаемый формат');
    return;
  }
}

// Общая инициализация для всех веток loadUrl()
function loadUrlCommonInit(){
  // Загружаем настройки для URL (если есть)
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
  if (durationChangeHandler){
    video.removeEventListener('durationchange', durationChangeHandler);
  }
  durationChangeHandler = () => {
    updateSeekControlsState();
  };
  video.addEventListener('durationchange', durationChangeHandler, { once: true });

  // Очищаем старый аудио-граф перед созданием нового
  destroyAudioGraph();
  // Реально применяем состояние компрессора для этой ссылки, а не только чекбокс
  reapplyCompressorState();
}

let urlInputErrorTimeout = null;
function showUrlError(message, opts = {}){
  urlLoadingSpinner.style.display = 'none';
  urlLoadBtn.disabled = false;
  urlInput.classList.add('error');
  clearTimeout(urlInputErrorTimeout);
  const duration = opts.duration || 20000;
  urlInputErrorTimeout = setTimeout(() => urlInput.classList.remove('error'), duration);
  showErrMsg(message, opts);
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
    // Декодируем URL-encoded символы (для русских названий в ссылках)
    try {
      filename = decodeURIComponent(filename);
    } catch (e) {
      // Если декодирование не удалось, оставляем как есть
    }
    return filename || 'Видео из URL';
  } catch (e){
    return 'Видео из URL';
  }
}

// Извлекает оригинальное имя файла из заголовка Content-Disposition
async function getOriginalFileNameFromUrl(url){
  try {
    const response = await fetch(url, { method: 'HEAD' });
    if (!response.ok) return null;
    
    const contentDisposition = response.headers.get('Content-Disposition');
    if (!contentDisposition) return null;
    
    // Парсим Content-Disposition: inline; filename*=UTF-8''encoded_name
    const match = /filename\*=UTF-8''(.+)/i.exec(contentDisposition);
    if (match) {
      try {
        return decodeURIComponent(match[1]);
      } catch (e) {
        return null;
      }
    }
    
    // Fallback для обычного filename
    const simpleMatch = /filename="?([^"]+)"?/i.exec(contentDisposition);
    if (simpleMatch) {
      return simpleMatch[1];
    }
    
    return null;
  } catch (e) {
    return null;
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
  // Не создаём аудио-граф автоматически - только при включении аудио-фич пользователем
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
  showErrMsg('В этом браузере не работает продолжение просмотра без повторного выбора файла. Открывать видео и папки можно как обычно; для полной функциональности используйте Chrome или Edge', { persistent: true });
}

