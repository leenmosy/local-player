// 06-audio.js — Синхронизация контролов, аудио-граф, панель плейлиста
// Часть Local Player. Файлы подключаются классическими <script> по порядку
// из index.html и делят общую область видимости — см. js/README.md
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
    // ПРИМЕЧАНИЕ: в текущем Chrome createMediaElementSource() НЕ бросает
    // SecurityError для кросс-доменного видео без CORS — вместо этого браузер
    // молча выводит нулевой (беззвучный) сигнал (в консоли видно предупреждение
    // "MediaElementAudioSource outputs zeroes due to CORS access restrictions").
    // Поэтому эта ветка на практике почти не срабатывает в Chrome: реальный
    // сценарий "сервер без CORS" сейчас ловится не здесь, а через 'error' на
    // самой <video> и retryWithoutCrossOriginOnError() — там видео не грузится
    // вовсе (crossOrigin='anonymous' не даёт даже скачать ресурс), и это
    // перезапускает загрузку без CORS до того, как аудио-граф вообще нужен.
    // Ветка ниже остаётся как страховка на случай, если браузер всё же
    // бросит исключение (другие движки, будущие изменения поведения) —
    // но сама по себе не гарантирует отсутствия беззвучного тайнтинга без
    // предупреждения, если видео как-то загрузилось, а звук всё равно
    // оказался затейнчен.
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

  // 1. Переключаем в состояние, противоположное сохранённому...
  drEnabled = !savedState;
  connectGraph();

  // 2. ...и сразу возвращаем обратно в сохранённое состояние.
  drEnabled = savedState;
  connectGraph();
}

// ВАЖНО: как только для <video> создан MediaElementAudioSourceNode, звук элемента
// навсегда идёт через граф. Если оставить источник ни к чему не подключённым,
// пропадает не только звук — встают аудио-часы, и currentTime перестаёт двигаться:
// видео замирает на 00:00 при paused === false (баг C-1). Поэтому «разбирая» граф,
// мы обязаны вернуть источник напрямую в destination.
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
  // Возвращаем прямой маршрут в динамики: отключённый источник останавливает
  // воспроизведение целиком, а не только глушит звук (см. bypassAudioGraph)
  if (audioCtx && sourceNode){
    try { sourceNode.connect(audioCtx.destination); } catch(e) {}
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

// Настройки/субтитры/плейлист занимают один и тот же угол экрана, что и
// подсказка "Следующая серия" — пока любая из панелей открыта, подсказку
// не показываем (см. использование в timeupdate).
function anyPanelOpen(){
  return drPanel.classList.contains('open') || playlistPanel.classList.contains('open');
}

function setDrPanelOpen(open){
  const wasOpen = drPanel.classList.contains('open');
  drPanel.classList.toggle('open', open);
  drBtn.setAttribute('aria-expanded', String(open));
  drBtn.classList.toggle('active-panel', open);

  // Сворачиваем свои категории только при переключении с другой панели
  // и закрываем панель плейлиста (не должны перекрываться)
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
