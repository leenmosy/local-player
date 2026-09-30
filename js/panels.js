// --- Шпаргалка по клавишам ---
const hotkeysHelp = document.getElementById('hotkeys-help');
const hotkeysBtn = document.getElementById('hotkeys-btn');
function setHotkeysHelpOpen(open){
  const wasOpen = hotkeysHelp.classList.contains('show');
  hotkeysHelp.classList.toggle('show', open);
  hotkeysHelp.setAttribute('aria-hidden', String(!open));
  hotkeysBtn.setAttribute('aria-expanded', String(open));
  hotkeysBtn.classList.toggle('active-panel', open);
  if (open){
    setDrPanelOpen(false);
    setPlaylistPanelOpen(false);
    hideNextEpisodeOverlay();
    hideSkipSegmentOverlay();
  } else if (wasOpen){
    refreshQuickActions();
  }
}
const toggleHotkeysHelp = makePanelToggler();
hotkeysBtn.addEventListener('click', () => {
  toggleHotkeysHelp(setHotkeysHelpOpen, hotkeysHelp.classList.contains('show'));
});
// Клик по видео закрывает шпаргалку, как и остальные панели

// Не показываем подсказку «Следующая серия», пока открыты настройки, плейлист или шпаргалка
function anyPanelOpen(){
  return drPanel.classList.contains('open') || playlistPanel.classList.contains('open') || hotkeysHelp.classList.contains('show');
}

function setDrPanelOpen(open){
  const wasOpen = drPanel.classList.contains('open');
  drPanel.classList.toggle('open', open);
  drBtn.setAttribute('aria-expanded', String(open));
  drBtn.classList.toggle('active-panel', open);
  if (open) refreshPanelRangeFills();

  // Сворачиваем категории при переключении панели и закрываем плейлист, чтобы панели не перекрывались
  if (open) {
    const playlistWasOpen = playlistPanel.classList.contains('open');
    if (playlistWasOpen) {
      collapseCategoriesIn(drPanel);
    }
    setPlaylistPanelOpen(false);
    setHotkeysHelpOpen(false);
    hideNextEpisodeOverlay();
    hideSkipSegmentOverlay();
  } else if (wasOpen) {
    // Панель закрывала подсказку, на паузе timeupdate её не вернёт
    refreshQuickActions();
  }
}
drBtn.addEventListener('click', () => {
  toggleDrPanel(setDrPanelOpen, drPanel.classList.contains('open'));
});

// --- Панель плейлиста ---
function setPlaylistPanelOpen(open){
  const wasOpen = playlistPanel.classList.contains('open');
  playlistPanel.classList.toggle('open', open);
  playlistBtn.setAttribute('aria-expanded', String(open));
  playlistBtn.classList.toggle('active-panel', open);

  if (open) {
    setDrPanelOpen(false);
    setHotkeysHelpOpen(false);
    hideNextEpisodeOverlay();
    hideSkipSegmentOverlay();
    // В длинном сезоне текущая серия должна быть на виду, а не где-то ниже прокрутки
    const current = playlistList.querySelector('.playlist-item.active');
    if (current) current.scrollIntoView({ block: 'nearest' });
  } else if (wasOpen) {
    // Панель закрывала подсказку, на паузе timeupdate её не вернёт
    refreshQuickActions();
  }
}
playlistBtn.addEventListener('click', () => {
  togglePlaylistPanel(setPlaylistPanelOpen, playlistPanel.classList.contains('open'));
});

// --- Сворачивание категорий настроек ---
// Инициализация: сворачиваем все категории при загрузке страницы
function initCategoryHeaders(){
  const allHeaders = document.querySelectorAll('.dr-category-header');
  allHeaders.forEach(header => {
    header.setAttribute('aria-expanded', 'false');
    const content = header.nextElementSibling;
    if (content && content.classList.contains('dr-category-content')) {
      // При загрузке страницы сворачиваем сразу, без анимации
      content.classList.add('collapsed');
      content.style.maxHeight = '0px';
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

      const content = header.nextElementSibling;
      if (content && content.classList.contains('dr-category-content')) {
        if (!isExpanded) {
          expandCategoryContent(content);
        } else {
          collapseCategoryContent(content);
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

