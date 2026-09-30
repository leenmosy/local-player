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

// Устанавливаем громкость по умолчанию для новых файлов
const DEFAULT_VOLUME = 0.2;

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

