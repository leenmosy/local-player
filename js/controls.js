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
  updateRangeFill(drSpeed);
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
  updateRangeFill(drBrightness);
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
  updateRangeFill(drZoom);
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

// Запускает воспроизведение, глуша штатные отказы (автоплей заблокирован, прервано новой загрузкой)
function safePlay(){
  return video.play().catch(e => {
    if (e && e.name !== 'NotAllowedError' && e.name !== 'AbortError') console.warn('Play error:', e);
  });
}

function togglePlay(){
  if (video.paused) {
    safePlay();
  } else {
    video.pause();
  }
}

function seekBy(deltaSeconds){
  if (!isDurationUsable()) return;
  const t = Math.max(0, Math.min(video.duration, video.currentTime + deltaSeconds));
  video.currentTime = t;
  timeDisplay.textContent = formatTimePair(t, video.duration);
  // Как и при перетаскивании ползунка, блюр ставим сразу, не дожидаясь события seeking
  syncBlurFilter();
}
// Таймлайн недоступен, пока не известна длительность
function updateSeekControlsState(){
  seek.disabled = !isDurationUsable();
}

let centerIconTimeout = null;

// Иконка по центру это короткое подтверждение клика, на паузе она тоже гаснет, чтобы не закрывать кадр
function showCenterIcon(isPlaying){
  centerIconPlay.style.display = isPlaying ? 'none' : '';
  centerIconPause.style.display = isPlaying ? '' : 'none';
  centerPlayIcon.classList.add('show');
  clearTimeout(centerIconTimeout);
  centerIconTimeout = setTimeout(() => {
    centerPlayIcon.classList.remove('show');
  }, 600);
}
playBtn.addEventListener('click', togglePlay);
stage.addEventListener('contextmenu', (e) => e.preventDefault());

clickCatcher.addEventListener('click', () => {
  if (drPanel.classList.contains('open')){
    setDrPanelOpen(false);
    return;
  }
  if (hotkeysHelp.classList.contains('show')){
    setHotkeysHelpOpen(false);
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
  // Закрытие шпаргалки по клавишам, те же правила, что у настроек
  if (hotkeysHelp.classList.contains('show')) {
    if (!hotkeysHelp.contains(e.target) && !hotkeysBtn.contains(e.target)) {
      setHotkeysHelpOpen(false);
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
    if (hotkeysHelp.classList.contains('show')) {
      setHotkeysHelpOpen(false);
    }
  }
});

function syncPlayStateUI(){
  const isPlaying = !video.paused;

  if (isPlaying){
    iconPlay.style.display = 'none';
    iconPause.style.display = '';
    playBtn.setAttribute('aria-pressed', 'true');
    playBtn.setAttribute('aria-label', 'Пауза');
    playBtn.setAttribute('data-tooltip', 'Пауза (space)');
  } else {
    iconPlay.style.display = '';
    iconPause.style.display = 'none';
    playBtn.setAttribute('aria-pressed', 'false');
    playBtn.setAttribute('aria-label', 'Воспроизвести');
    playBtn.setAttribute('data-tooltip', 'Воспроизвести (space)');
  }
}

// Постоянная синхронизация UI с фактическим состоянием видео,
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
  // Контекст усыплён при выходе из плеера, без пробуждения звук через него не пойдёт
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
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
  // Синхронизируем ползунок скорости с реальным значением, зажимая в диапазон слайдера,
  // чтобы подпись и положение бегунка не расходились при скорости, заданной извне
  const min = parseFloat(drSpeed.min), max = parseFloat(drSpeed.max);
  drSpeed.value = Math.min(max, Math.max(min, video.playbackRate));
  drSpeedVal.textContent = formatSpeedLabel(parseFloat(drSpeed.value));
  updateRangeFill(drSpeed);
});
video.addEventListener('ended', () => {
  markProgressCompleted();
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
  detectedFps = 0;
  lastFrameMeta = null;
  updateSeekFill();
});

// Заливка таймлайна: сыгранная часть белым, загруженный буфер полупрозрачным
function updateSeekFill(){
  const dur = isDurationUsable() ? video.duration : 0;
  if (!dur){
    seek.style.setProperty('--fill', '0%');
    seek.style.setProperty('--seek-buffered', '0%');
    return;
  }
  const played = (video.currentTime / dur) * 100;
  let bufferedEnd = video.currentTime;
  for (let i = 0; i < video.buffered.length; i++){
    // Берём диапазон, внутри которого сейчас playhead, небольшой допуск на стыке
    if (video.buffered.start(i) - 0.25 <= video.currentTime && video.buffered.end(i) >= video.currentTime){
      bufferedEnd = video.buffered.end(i);
      break;
    }
  }
  seek.style.setProperty('--fill', played.toFixed(2) + '%');
  seek.style.setProperty('--seek-buffered', Math.min(100, (bufferedEnd / dur) * 100).toFixed(2) + '%');
}
video.addEventListener('progress', updateSeekFill);
video.addEventListener('seeked', updateSeekFill);

// Заливка любого обычного ползунка до бегунка по его value/min/max
function updateRangeFill(el){
  const min = parseFloat(el.min) || 0;
  const max = isFinite(parseFloat(el.max)) ? parseFloat(el.max) : 100;
  const pct = max > min ? ((parseFloat(el.value) - min) / (max - min)) * 100 : 0;
  el.style.setProperty('--fill', Math.max(0, Math.min(100, pct)).toFixed(2) + '%');
}
// У ползунков в панели настроек value ставится из сохранённых настроек без события input
function refreshPanelRangeFills(){
  drPanel.querySelectorAll('input[type="range"]').forEach(updateRangeFill);
}

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
// частоте блюр опаздывал включиться на начало интервала, а субтитры, на реплику
let frameSyncHandle = null;
// Частоту кадров берём из метаданных requestVideoFrameCallback, она нужна для покадровой перемотки
let detectedFps = 0;
let lastFrameMeta = null;

function noteFrameMetadata(metadata){
  if (!metadata || typeof metadata.mediaTime !== 'number' || typeof metadata.presentedFrames !== 'number') return;
  const prev = lastFrameMeta;
  lastFrameMeta = { mediaTime: metadata.mediaTime, presentedFrames: metadata.presentedFrames };
  if (!prev) return;
  const dt = metadata.mediaTime - prev.mediaTime;
  const df = metadata.presentedFrames - prev.presentedFrames;
  if (dt <= 0 || df <= 0) return;
  const fps = df / dt;
  // Отсекаем выбросы после перемотки, когда счётчики скачут
  if (fps >= 5 && fps <= 240) detectedFps = fps;
}

// Пока частота не измерена, шагаем как при 25 кадрах в секунду
function frameDuration(){
  return 1 / (detectedFps || 25);
}

// Покадровая перемотка: ставим на паузу и сдвигаем время ровно на один кадр
function stepFrame(dir){
  if (!isDurationUsable()) return;
  if (!video.paused) video.pause();
  const t = video.currentTime + dir * frameDuration();
  video.currentTime = Math.max(0, Math.min(video.duration, t));
  syncBlurFilter();
  showControls();
}

function frameSyncLoop(now, metadata){
  frameSyncHandle = null;
  scheduleFrameSync(); // планируем следующий кадр первым, чтобы сбой ниже не оборвал цикл
  noteFrameMetadata(metadata);
  syncBlurFilter();
  updateSubtitles();
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
  const txt = formatTimePair(video.currentTime, video.duration);
  ovTime.textContent = txt;
  timeDisplay.textContent = txt;
  if (!isSeeking && isDurationUsable()){
    seek.value = (video.currentTime / video.duration) * 1000;
  }
  updateSeekFill();

  // Обновление блюра
  syncBlurFilter();
  
  // Обновление субтитров
  updateSubtitles();

  refreshQuickActions();
});

// Подсказки "Следующая серия" и "Пропустить" считаются от текущего момента, зовём и по времени, и при закрытии панелей
function refreshQuickActions(){
  // Подсказка "Следующая серия", показываем ближе к концу текущего эпизода
  const hasNextEpisode = playlistFiles.length > 1 && playlistIndex > -1 && playlistIndex < playlistFiles.length - 1;
  let showNextEpisode = false;
  if (hasNextEpisode && isDurationUsable() && !nextEpisodePromptDismissed && !anyPanelOpen()){
    if (nextEpisodeSegment){
      // Размеченное окно точнее порога по длительности, поэтому оно его перебивает
      const end = nextEpisodeSegment.end === Infinity ? video.duration : nextEpisodeSegment.end;
      showNextEpisode = video.currentTime >= nextEpisodeSegment.start && video.currentTime < end;
    } else {
      const remaining = video.duration - video.currentTime;
      showNextEpisode = remaining <= nextEpisodeThreshold(video.duration) && remaining > 0.05;
    }
  }
  if (showNextEpisode){
    nextEpOverlay.classList.add('show');
  } else {
    hideNextEpisodeOverlay();
  }

  updateSkipSegmentOverlay(showNextEpisode);
}

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
  // Как только браузер зафиксировал начало перемотки, сразу подстраховываемся
  // блюром, если перемотка задевает диапазон блюра
  syncBlurFilter();
});

video.addEventListener('seeked', () => {
  // Пересчитываем blur-фильтр сразу по завершении перемотки, не ждём timeupdate
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
  // Последняя начавшаяся реплика могла уже кончиться внутри более длинной, которая началась раньше, смотрим немного назад
  for (let k = found; k >= 0 && k >= found - 8; k--){
    if (hit(k)){ subSearchIdx = k; return subtitlesData[k]; }
  }
  subSearchIdx = found;
  return null;
}

function resetSubtitleRenderState(){
  // Чистим узел: updateSubtitles() при null === null выйдет раньше и оставит на экране старую реплику
  subtitles.innerHTML = '';
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

  // Ничего не изменилось, DOM не трогаем
  if (currentSub === renderedSub) return;
  renderedSub = currentSub;

  if (currentSub) {
    subtitles.innerHTML = `<span>${escapeHtml(currentSub.text).replace(/\n/g, '<br>')}</span>`;
    applySubtitlesStyle();
  } else {
    subtitles.innerHTML = '';
  }
}

// --- Время под курсором над таймлайном ---
const seekWrap = document.getElementById('seek-wrap');
const seekTip = document.getElementById('seek-tip');
const SEEK_THUMB_PX = 12;
// Считаем позицию так же, как браузер для ползунка: центр бегунка ходит от половины его ширины до края минус половина,
// и значение округляется до шага, иначе подсказка и клик разойдутся
function rangeValueAtX(range, clientX){
  const rect = range.getBoundingClientRect();
  const usable = Math.max(1, rect.width - SEEK_THUMB_PX);
  const frac = Math.max(0, Math.min(1, (clientX - rect.left - SEEK_THUMB_PX / 2) / usable));
  const step = parseFloat(range.step) || 1;
  const min = parseFloat(range.min) || 0;
  const max = parseFloat(range.max) || 1;
  return min + Math.round(frac * (max - min) / step) * step;
}
// Где стоит центр бегунка при данном значении, в пикселях от левого края ползунка
function rangeThumbX(range, value){
  const rect = range.getBoundingClientRect();
  const min = parseFloat(range.min) || 0;
  const max = parseFloat(range.max) || 1;
  return SEEK_THUMB_PX / 2 + ((value - min) / (max - min)) * (rect.width - SEEK_THUMB_PX);
}
function seekValueAtX(clientX){ return rangeValueAtX(seek, clientX); }
function showSeekTipAt(clientX){
  if (!isDurationUsable()) return;
  const value = seekValueAtX(clientX);
  const t = (value / 1000) * video.duration;
  seekTip.textContent = formatTime(t);
  const rect = seek.getBoundingClientRect();
  const wrapRect = seekWrap.getBoundingClientRect();
  const thumbX = rangeThumbX(seek, value);
  // Подсказка не должна вылезать за сцену, зажимаем её центр с запасом на половину ширины
  const half = seekTip.offsetWidth / 2 || 30;
  const stageRect = stage.getBoundingClientRect();
  const minX = stageRect.left + half + 6 - wrapRect.left;
  const maxX = stageRect.right - half - 6 - wrapRect.left;
  seekTip.style.left = Math.max(minX, Math.min(maxX, rect.left - wrapRect.left + thumbX)) + 'px';
  seekTip.classList.add('show');
}
seekWrap.addEventListener('mousemove', e => showSeekTipAt(e.clientX));
seekWrap.addEventListener('mouseenter', e => showSeekTipAt(e.clientX));
seekWrap.addEventListener('mouseleave', () => seekTip.classList.remove('show'));

seek.addEventListener('mousedown', () => isSeeking = true);
seek.addEventListener('touchstart', () => isSeeking = true);
seek.addEventListener('input', () => {
  if (isDurationUsable()){
    const t = (seek.value / 1000) * video.duration;
    video.currentTime = t;
    timeDisplay.textContent = formatTimePair(t, video.duration);
    updateSeekFill();

    // Форсируем пересчёт blur-фильтра сразу, не дожидаясь timeupdate/seeked,
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
  muteBtn.setAttribute('data-tooltip', isOff ? 'Включить звук (m)' : 'Выключить звук (m)');
  // Заливка ползунка громкости до бегунка, при min 0 max 1 value это уже доля
  volumeRange.style.setProperty('--fill', (volumeRange.value * 100) + '%');
}

let lastVolume = DEFAULT_VOLUME;

// Громкость одна на весь плеер, а не пофайловая, иначе следующая серия открывается с дефолтной
function saveGlobalVolume(){
  try{
    localStorage.setItem(VOLUME_KEY, JSON.stringify({ volume: video.volume, muted: video.muted }));
    markStorageOk();
  } catch(e){ notifyStorageIssue(); }
}

function readGlobalVolume(){
  try{
    const d = JSON.parse(localStorage.getItem(VOLUME_KEY) || 'null');
    if (!d) return { volume: DEFAULT_VOLUME, muted: false };
    const v = (typeof d.volume === 'number' && d.volume >= 0 && d.volume <= 1) ? d.volume : DEFAULT_VOLUME;
    return { volume: v, muted: d.muted === true };
  } catch(e){ return { volume: DEFAULT_VOLUME, muted: false }; }
}

function applyGlobalVolume(){
  const { volume, muted } = readGlobalVolume();
  video.volume = volume;
  video.muted = muted;
  if (volume > 0) lastVolume = volume;
  volumeRange.value = muted ? 0 : volume;
  updateVolumeIcon();
  syncGraphVolume();
}

let volumeTooltipTimer = null;
let volumeHovered = false;
// Подсказка над громкостью показывает значение и стоит над бегунком, а не по центру
function setVolumeTooltip(value){
  volumeSliderWrap.dataset.tooltip = Math.round(value * 100) + '%';
  volumeSliderWrap.style.setProperty('--tip-x', rangeThumbX(volumeRange, value) + 'px');
  volumeSliderWrap.classList.add('show-tooltip');
}
// Громкость с клавиатуры: показываем текущее значение и через секунду прячем, если мышь не на ползунке
function flashVolumeTooltip(){
  setVolumeTooltip(parseFloat(volumeRange.value));
  clearTimeout(volumeTooltipTimer);
  volumeTooltipTimer = setTimeout(() => {
    if (!volumeHovered) volumeSliderWrap.classList.remove('show-tooltip');
  }, 1000);
}
// При наведении подсказка показывает громкость, которую поставит клик в этой точке, как время на таймлайне
volumeSliderWrap.addEventListener('mousemove', e => { volumeHovered = true; setVolumeTooltip(rangeValueAtX(volumeRange, e.clientX)); });
volumeSliderWrap.addEventListener('mouseenter', e => { volumeHovered = true; setVolumeTooltip(rangeValueAtX(volumeRange, e.clientX)); });
volumeSliderWrap.addEventListener('mouseleave', () => { volumeHovered = false; clearTimeout(volumeTooltipTimer); volumeSliderWrap.classList.remove('show-tooltip'); });

volumeRange.addEventListener('input', () => {
  video.volume = volumeRange.value;
  video.muted = Number(volumeRange.value) === 0;
  if (video.volume > 0) lastVolume = video.volume;
  updateVolumeIcon();
  syncGraphVolume();
  flashVolumeTooltip();
  saveGlobalVolume();
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
  syncGraphVolume();
  saveGlobalVolume();
}

muteBtn.addEventListener('click', toggleMute);
updateVolumeIcon();

// Обёртки для Fullscreen API, с поддержкой старого Safari/iOS
function getFullscreenElement(){
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}
function requestFs(el){
  const fn = el.requestFullscreen || el.webkitRequestFullscreen;
  // Стандартный requestFullscreen() возвращает Promise, но старые версии
  // Safari/WebKit (webkitRequestFullscreen) возвращают undefined, а не Promise,
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

// Размер субтитров считается от высоты кадра, поэтому пересчитываем его при любой смене размера окна и кадра
window.addEventListener('resize', applySubtitlesStyle);
video.addEventListener('loadedmetadata', applySubtitlesStyle);

['fullscreenchange', 'webkitfullscreenchange'].forEach(evt => {
  document.addEventListener(evt, () => {
    clearTimeout(fullscreenSafetyTimer);
    applySubtitlesStyle();
    fullscreenPending = false;
    const isFs = !!getFullscreenElement();
    iconFsOpen.style.display = isFs ? 'none' : '';
    iconFsClose.style.display = isFs ? '' : 'none';
    fullscreenBtn.setAttribute('aria-pressed', String(isFs));
    fullscreenBtn.setAttribute('aria-label', isFs ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим');
    fullscreenBtn.setAttribute('data-tooltip', isFs ? 'Выйти из полного экрана (f)' : 'Полный экран (f)');
    // Esc в полном экране браузер забирает себе и до страницы не доносит: выход из него закрывает и шпаргалку, чтобы не жать дважды
    if (!isFs && hotkeysHelp.classList.contains('show')) setHotkeysHelpOpen(false);
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
  flashVolumeTooltip();
  syncGraphVolume();
  saveGlobalVolume();
}
document.querySelectorAll('input[type="range"]').forEach(r => {
  // Снимаем фокус только после mouseup (перетаскивания мышью), не при клавиатурном управлении
  r.addEventListener('mouseup', () => r.blur());
  r.addEventListener('touchend', () => r.blur());
  // Таймлайн и громкость красят заливку своими функциями, остальным хватает общего обработчика
  if (r.id !== 'seek' && r.id !== 'volume-range'){
    r.addEventListener('input', () => updateRangeFill(r));
    updateRangeFill(r);
  }
});
document.addEventListener('keydown', (e) => {
  if (!playerView.classList.contains('active')) return;
  // Цель события это и есть элемент с фокусом, activeElement остаётся запасным путём для событий на документе
  const activeEl = (e.target && e.target !== document && e.target.tagName) ? e.target : document.activeElement;
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
  // Сочетания с Ctrl, Alt и Win принадлежат браузеру: Ctrl+F это поиск, Alt+Left это назад, а не перемотка
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  const code = hotkeyCode(e);
  // Переключатели не должны дребезжать при зажатой клавише, перемотка и громкость при автоповторе как раз удобны
  const isToggle = code === 'Space' || code === 'KeyK' || code === 'KeyF' || code === 'KeyM';
  if (isToggle && e.repeat) return;
  // J, K, L дублируют стрелки и пробел, как в монтажках и на YouTube: на компактных клавиатурах стрелки спрятаны под Fn
  if (code === 'Space' || code === 'KeyK'){ e.preventDefault(); togglePlay(); showControls(); }
  else if (code === 'KeyJ'){ e.preventDefault(); seekBy(-5); showControls(); }
  else if (code === 'KeyL'){ e.preventDefault(); seekBy(5); showControls(); }
  else if (code === 'KeyF'){ e.preventDefault(); fullscreenBtn.click(); }
  else if (code === 'KeyM'){ e.preventDefault(); toggleMute(); showControls(); }
  else if (code === 'Comma'){ e.preventDefault(); stepFrame(-1); }
  else if (code === 'Period'){ e.preventDefault(); stepFrame(1); }
  else if (code === 'ArrowRight'){ e.preventDefault(); seekBy(5); showControls(); }
  else if (code === 'ArrowLeft'){ e.preventDefault(); seekBy(-5); showControls(); }
  else if (code === 'ArrowUp'){ e.preventDefault(); adjustVolume(0.02); showControls(); }
  else if (code === 'ArrowDown'){ e.preventDefault(); adjustVolume(-0.02); showControls(); }
});

// Код клавиши с запасным путём через key: экранные клавиатуры и часть автоматизации присылают пустой code
function hotkeyCode(e){
  if (e.code) return e.code;
  const byKey = { ' ': 'Space', 'f': 'KeyF', 'F': 'KeyF', 'а': 'KeyF', 'А': 'KeyF', 'm': 'KeyM', 'M': 'KeyM', 'ь': 'KeyM', 'Ь': 'KeyM',
    ',': 'Comma', 'б': 'Comma', 'Б': 'Comma', '.': 'Period', 'ю': 'Period', 'Ю': 'Period',
    'j': 'KeyJ', 'J': 'KeyJ', 'о': 'KeyJ', 'О': 'KeyJ', 'k': 'KeyK', 'K': 'KeyK', 'л': 'KeyK', 'Л': 'KeyK', 'l': 'KeyL', 'L': 'KeyL', 'д': 'KeyL', 'Д': 'KeyL',
    'ArrowLeft': 'ArrowLeft', 'ArrowRight': 'ArrowRight', 'ArrowUp': 'ArrowUp', 'ArrowDown': 'ArrowDown' };
  return byKey[e.key] || '';
}

const ERROR_MESSAGES = {
  1: 'Загрузка была прервана.',
  2: 'Ошибка сети при чтении файла.',
  3: 'Браузер не смог декодировать файл. Скорее всего, не поддерживается кодек видео или аудио.',
  4: 'Формат файла не поддерживается браузером вообще.',
};

const ERROR_SOLUTIONS = {
  3: `
    <div class="ve-solution">
      <strong>Как исправить:</strong>
      <br>• Скорее всего файл использует кодек H.265/HEVC, AC-3 или DTS
      <br>• Конвертируйте файл в H.264 + AAC (HandBrake, бесплатный)
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
  if (!playerView.classList.contains('active')) return;
  const err = video.error;
  const code = err ? err.code : null;
  const msg = ERROR_MESSAGES[code] || 'Не удалось воспроизвести файл по неизвестной причине.';
  const solution = ERROR_SOLUTIONS[code] || '';
  
  videoErrorEl.innerHTML = `
    <div class="ve-title">Не удалось воспроизвести файл</div>
    <div class="ve-detail">${msg}${code != null ? `<br>Код ошибки браузера: ${code}` : ''}</div>
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
// Плеер это запись в истории браузера, поэтому стрелка «назад» возвращает на главную, как кнопка «Назад»
function pushPlayerHistory(){
  if (history.state && history.state.player) return;
  try { history.pushState({ player: true }, ''); } catch(e){}
}
// Последний одиночный локальный файл, чтобы стрелка «вперёд» могла открыть его заново
let lastOpenedFile = null;
// Что открыть заново по стрелке «вперёд», запоминается в момент закрытия плеера
let reopenSource = null;
function rememberSourceForForward(){
  if (currentSourceUrl){
    const url = currentSourceUrl, series = playlistSeriesUrl;
    reopenSource = () => series ? loadUrl(series, { startUrl: url }) : loadUrl(url);
  } else if (playlistFiles.length && !isUrlPlaylistEntry(playlistFiles[0])){
    const items = playlistFiles.slice(), name = playlistFolderName;
    reopenSource = () => openFolderPlaylist(items, name);
  } else if (lastOpenedFile){
    const { file, handle } = lastOpenedFile;
    reopenSource = () => loadFile(file, handle, {});
  } else {
    reopenSource = null;
  }
}
window.addEventListener('popstate', () => {
  const open = playerView.classList.contains('active');
  const wantPlayer = !!(history.state && history.state.player);
  if (open && !wantPlayer){
    closePlayer();
  } else if (!open && wantPlayer){
    if (reopenSource) reopenSource();
    else { try { history.replaceState(null, ''); } catch(e){} }
  }
});
// После перезагрузки страницы плеер закрыт, а запись могла остаться, иначе первая «назад» уйдёт в никуда
if (history.state && history.state.player){
  try { history.replaceState(null, ''); } catch(e){}
}

backBtn.addEventListener('click', () => {
  // Уходим через историю, иначе запись плеера останется и следующая «назад» в браузере уйдёт в никуда
  if (history.state && history.state.player){ history.back(); return; }
  closePlayer();
});

function closePlayer(){
  if (isSwitching) return;
  isSwitching = true;
  flushPendingSettings();
  rememberSourceForForward();
  cancelPendingUrlLoad();
  
  // Выходим из полноэкранного режима перед скрытием плеера
  if (document.fullscreenElement) exitFs();
  
  stopProgressTracking();
  hideBufferingIndicator();
  videoErrorEl.style.display = 'none';

  // Очищаем аудио-граф при выходе из плеера и усыпляем контекст, чтобы на главной он не держал аудиопоток
  destroyAudioGraph();
  if (audioCtx && audioCtx.state === 'running') audioCtx.suspend().catch(() => {});
  
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
  hideStorageToast();
  hideInfoToast();
  hideCodecWarningToast();
  playerView.classList.remove('active');
  dropView.style.display = 'flex';
  
  // Подсказку аудио не скрываем - она должна оставаться видимой

  // Сбрасываем плейлист папки - следующая загрузка должна начинаться с чистого состояния
  resetPlaylist();

  renderResumeList();
  // Источника больше нет, иначе свёрнутая вкладка допишет его настройки и прогресс уже с главной
  currentFileKey = null;
  currentSourceUrl = null;
  isSwitching = false;
}

