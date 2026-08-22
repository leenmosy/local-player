// 08-controls.js — Настройки, скорость, картинка, хоткеи, fullscreen, буферизация
// Часть Local Player. Файлы подключаются классическими <script> по порядку
// из index.html и делят общую область видимости — см. js/README.md
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
// (обновляется только на реальном плейбеке и после подтверждённого seeked,
// а не в момент, когда мы просто присвоили video.currentTime).
let lastConfirmedTime = 0;

// Сбрасываем состояние блюра при загрузке любого нового файла — иначе
// lastConfirmedTime от предыдущего видео мог бы ошибочно "утянуть" за собой
// диапазон блюра при первой же перемотке в новом видео.
video.addEventListener('loadedmetadata', () => {
  lastConfirmedTime = 0;
  lastBlurActive = false;
});

// Проверяет, задевает ли отрезок [from, to] хотя бы один диапазон блюра.
// Нужно, чтобы поймать случай, когда перемотка "проезжает" через диапазон
// блюра целиком, а не только начинается или заканчивается в нём.
function rangeTouchesBlur(from, to){
  const lo = Math.min(from, to), hi = Math.max(from, to);
  return blurRanges.some(r => hi >= r.from && lo <= blurRangeEnd(r));
}

function syncBlurFilter(){
  const target = video.currentTime;
  let blurActive;

  if (video.seeking) {
    // Пока идёт перемотка, video.currentTime уже может указывать на новую
    // позицию, а реально нарисованный на экране кадр — ещё нет (браузер
    // декодирует от ближайшего ключевого кадра). Поэтому на время перемотки
    // подстраховываемся: держим блюр включённым, если в диапазон блюра
    // попадает последняя подтверждённая позиция, целевая позиция, или
    // перемотка проходит через диапазон между ними.
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
// (баг H-2). Дополнительно синхронизируем их на каждом отрисованном кадре видео.
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
  // когда пользователь перематывает с одного сегмента на другой (например, с заставки на титры)
  skipSegmentOverlay.textContent = seg.label;
  skipSegmentOverlay.classList.add('show');
}

video.addEventListener('seeking', () => {
  // Как только браузер зафиксировал начало перемотки — сразу подстраховываемся
  // блюром, если перемотка задевает диапазон блюра (см. syncBlurFilter).
  syncBlurFilter();
});

video.addEventListener('seeked', () => {
  // Пересчитываем blur-фильтр сразу по завершении перемотки — не ждём timeupdate,
  // который может не сработать при быстрой перемотке на паузе.
  // На этом этапе video.seeking уже false, поэтому syncBlurFilter пересчитает
  // точное состояние блюра и обновит lastConfirmedTime.
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
  // при переходе с одного сегмента на другой (например, с заставки на титры)
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
// Раньше уход курсора за пределы ползунка посреди перетаскивания сбрасывал флаг,
// и позиция начинала «драться» с timeupdate (баг L-4). Ориентируемся на отпускание
// кнопки мыши в любом месте документа.
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
  // и вызывающий код всегда делает .catch() на результате. Без этой обёртки
  // .catch() падает с необработанным исключением, fullscreenPending не
  // успевает сброситься, и кнопка фулскрина навсегда виснет до перезагрузки
  // страницы. Тот же случай — если фулскрин вообще не поддерживается.
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
// (успех) или .catch() (явная ошибка/отказ Promise). Но у старых
// webkit-префиксных реализаций запрос иногда молча ничего не делает —
// не бросает исключение и не переводит документ в фулскрин, то есть не
// происходит ни того, ни другого события. Без этого таймера кнопка тогда
// зависала бы навсегда после первого же клика в такой среде.
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
  // Space/Enter на чекбоксе, кнопке или select — это штатная активация элемента.
  // Раньше preventDefault отменял её, и чекбоксы в настройках нельзя было
  // переключить с клавиатуры: вместо этого запускалось видео (баг M-11).
  const isFormControl = activeEl && ['INPUT','SELECT','BUTTON'].includes(activeEl.tagName);
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
// waiting/stalled — плееру не хватает данных из сети; playing/canplay(through) —
// воспроизведение восстановилось; pause/error/emptied — это не "лаг сети"
// (действие пользователя или отдельный экран ошибки), спиннер прячем сразу.
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
