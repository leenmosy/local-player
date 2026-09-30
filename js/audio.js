// --- элементы сцены, панели управления и настроек ---
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
const volumeSliderWrap = document.querySelector('.volume-slider-wrap');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const iconFsOpen = document.getElementById('icon-fs-open');
const iconFsClose = document.getElementById('icon-fs-close');
const drBtn = document.getElementById('dr-btn');
const drPanel = document.getElementById('dr-panel');
const playlistBtn = document.getElementById('playlist-btn');
const playlistPanel = document.getElementById('playlist-panel');
const playlistList = document.getElementById('playlist-list');
const nextEpOverlay = document.getElementById('next-ep-overlay');
const skipSegmentOverlay = document.getElementById('skip-segment-overlay');
const subtitles = document.getElementById('subtitles');
const subsToggle = document.getElementById('subs-toggle');
const subsFile = document.getElementById('subs-file');
const subsLoadBtn = document.getElementById('subs-load-btn');
const subsSize = document.getElementById('subs-size');
const subsSizeVal = document.getElementById('subs-size-val');
const subsPosition = document.getElementById('subs-position');
const subsPositionVal = document.getElementById('subs-position-val');
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
let limiterNode = null;
let boostGain = null;
// Громкость ползунка снимается перед компрессором и возвращается после него, иначе на тихой громкости он бездействует
let preGain = null;
let postGain = null;
let drEnabled = true;
let isSwitching = false;
// Источник cross-origin без CORS: MediaElementAudioSourceNode отдаёт по нему тишину
let audioSourceTainted = false;

// Сила ползунка крутит порог и коэффициент: от 1:1 при −10 дБ до 16:1 при −50 дБ. Колено, атака и отпускание постоянные
function updateCompressor(){
  if (!compressorNode) return;
  const s = drStrength.value / 100;
  const t = audioCtx.currentTime;
  compressorNode.threshold.setTargetAtTime(-10 - s * 40, t, 0.01);
  compressorNode.ratio.setTargetAtTime(1 + s * 15, t, 0.01);
}

// video.volume режет сигнал ещё до захвата в граф, и на тихой громкости диалог уходит под порог компрессора.
// Компенсируем на входе и возвращаем ту же громкость на выходе: компрессор всегда видит полный сигнал
function syncGraphVolume(){
  if (!audioCtx || !preGain || !postGain) return;
  const v = Math.max(video.volume, 0.001);
  const t = audioCtx.currentTime;
  preGain.gain.setTargetAtTime(1 / v, t, 0.01);
  postGain.gain.setTargetAtTime(v, t, 0.01);
}

// Лимитер стоит в конце всегда: без компрессора усиление до 500% упиралось бы в цифровой перегруз и трещало
function connectGraph(){
  // Проверяем все узлы, а не только контекст: граф мог оборваться на полпути и оставить контекст без узлов
  if (!audioCtx || !sourceNode || !preGain || !boostGain || !compressorNode || !limiterNode || !postGain) return;
  sourceNode.disconnect();
  preGain.disconnect();
  boostGain.disconnect();
  compressorNode.disconnect();
  limiterNode.disconnect();
  postGain.disconnect();

  sourceNode.connect(preGain);
  preGain.connect(boostGain);
  if (drEnabled){
    boostGain.connect(compressorNode);
    compressorNode.connect(limiterNode);
  } else {
    boostGain.connect(limiterNode);
  }
  limiterNode.connect(postGain);
  postGain.connect(audioCtx.destination);
  syncGraphVolume();
}

function ensureAudioGraph(){
  if (audioSourceTainted) return;
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
    
    // Присваиваем глобальные узлы только когда собраны все, иначе при исключении останется контекст без узлов
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaElementSource(video);
    const pre = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    // Лимитер молчит, пока сигнал не упёрся в потолок, и срезает только пики. Порог с запасом: узел сам добавляет около +1 дБ подъёма
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -2;
    lim.ratio.value = 20;
    lim.knee.value = 0;
    lim.attack.value = 0.001;
    lim.release.value = 0.1;
    const gain = ctx.createGain();
    const post = ctx.createGain();
    audioCtx = ctx;
    sourceNode = src;
    preGain = pre;
    compressorNode = comp;
    limiterNode = lim;
    boostGain = gain;
    postGain = post;
    boostGain.gain.value = drBoost.value / 100;
    // Колено, атака и отпускание не зависят от силы, ставим один раз
    comp.knee.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    updateCompressor();
    connectGraph();
  } catch(e){
    if (e.name === 'SecurityError') {
      console.warn('CORS не поддерживается сервером, аудио-фичи отключены:', e);
      showStorageToast('Компрессор и усиление недоступны для этого видео: источник не поддерживает CORS');
      drEnabled = false;
      drToggle.checked = false;
    } else {
      console.warn('Web Audio недоступен:', e);
    }
  }
}

// Аудио-граф поднимается только после успешной загрузки: до неё неизвестно,
// отдаёт ли сервер CORS, а на источнике без него граф даёт тишину
function initAudioGraphForCurrentSource(){
  if (audioSourceTainted) return;
  if (!drToggle.checked && parseFloat(drBoost.value) <= 100) return;
  reapplyCompressorState();
}

// Гарантированно применяет фактическое (не только визуальное) состояние компрессора
function reapplyCompressorState(){
  ensureAudioGraph();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  // Web Audio недоступен (например, нет CORS и граф не создался), применять нечего
  if (!audioCtx || !sourceNode || !compressorNode || !boostGain) return;

  // connectGraph собирает цепочку с нуля, поэтому достаточно одного вызова с сохранённым состоянием
  drEnabled = drToggle.checked;
  connectGraph();
}

// Убирает компрессор и усиление из цепочки, оставляя прямой путь до динамиков.
// Закрывать audioCtx нельзя, воспроизведение останавливается на 00:00
function bypassAudioGraph(){
  if (!audioCtx || !sourceNode) return;
  try { sourceNode.disconnect(); } catch(e) {}
  try { if (preGain) preGain.disconnect(); } catch(e) {}
  try { if (compressorNode) compressorNode.disconnect(); } catch(e) {}
  try { if (limiterNode) limiterNode.disconnect(); } catch(e) {}
  try { if (boostGain) boostGain.disconnect(); } catch(e) {}
  try { if (postGain) postGain.disconnect(); } catch(e) {}
  try { sourceNode.connect(audioCtx.destination); } catch(e) {}
}

// Компрессор и усиление требуют CORS, на остальных ссылках их нечем применить
function setAudioFeaturesAvailable(available){
  drToggle.disabled = !available;
  drStrength.disabled = !available;
  drBoost.disabled = !available;
  if (!available){
    drEnabled = false;
    drToggle.checked = false;
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
  if (limiterNode) {
    try { limiterNode.disconnect(); } catch(e) {}
  }
  if (preGain) {
    try { preGain.disconnect(); } catch(e) {}
  }
  if (postGain) {
    try { postGain.disconnect(); } catch(e) {}
  }
  // Возвращаем прямой вывод в динамики, чтобы отключение аудиографа не останавливало воспроизведение
  if (audioCtx && sourceNode){
    try { sourceNode.connect(audioCtx.destination); } catch(e) {}
  }
  // Контекст не закрываем и не усыпляем здесь: второй MediaElementSourceNode для того же video браузер не даст,
  // а через усыплённый контекст звук не идёт даже по прямому пути
}

// высота считается динамически через scrollHeight, а не фиксированным числом
function collapseCategoryContent(content){
  content.style.maxHeight = content.scrollHeight + 'px';
  void content.offsetHeight;
  content.classList.add('collapsed');
  content.style.maxHeight = '0px';
}

function expandCategoryContent(content){
  content.classList.remove('collapsed');
  content.style.maxHeight = content.scrollHeight + 'px';
  // Снимаем фиксированную высоту по завершении анимации ИЛИ по таймауту,
  // иначе список таймингов блюра позже упрётся в старое значение и обрежется
  let done = false;
  const clear = () => {
    if (done) return;
    done = true;
    clearTimeout(t);
    content.removeEventListener('transitionend', onDone);
    if (!content.classList.contains('collapsed')) content.style.maxHeight = 'none';
  };
  const onDone = (ev) => {
    if (ev.target === content && ev.propertyName === 'max-height') clear();
  };
  content.addEventListener('transitionend', onDone);
  const t = setTimeout(clear, 400);
}

function collapseCategoriesIn(panelEl){
  panelEl.querySelectorAll('.dr-category-header').forEach(header => {
    header.setAttribute('aria-expanded', 'false');
    const content = header.nextElementSibling;
    if (content && content.classList.contains('dr-category-content') && !content.classList.contains('collapsed')) {
      collapseCategoryContent(content);
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

