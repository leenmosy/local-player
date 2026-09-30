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


// Собирает CSS text-shadow из значения 0..100 в мягкую тень
function textShadowFromPercent(pct){
  const f = Math.max(0, Math.min(100, parseFloat(pct) || 0)) / 100;
  if (f <= 0) return 'none';
  const alpha = (0.15 + f * 0.75).toFixed(3);
  const blur = (1 + f * 5).toFixed(1);
  const spread = (f * 3).toFixed(1);
  return `0 0 ${blur}px rgba(0,0,0,${alpha}), 0 ${spread}px ${blur}px rgba(0,0,0,${alpha})`;
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
