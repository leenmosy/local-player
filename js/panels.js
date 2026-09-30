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

  const previousName = subsFileName.title || subsFileName.textContent;
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
        showInfoToast('Субтитры прочитаны в кодировке Windows-1251');
        processSubtitlesContent(content, file, previousName);
      };
      reader1251.onerror = () => {
        // Если не удалось прочитать как Windows-1251, используем UTF-8
        showStorageToast('Возможно, неправильная кодировка субтитров');
        processSubtitlesContent(content, file, previousName);
      };
      reader1251.readAsText(file, 'windows-1251');
    } else {
      processSubtitlesContent(content, file, previousName);
    }
  };
  reader.readAsText(file);
});

function processSubtitlesContent(content, file, previousName){
  // Сохраняем текущие применённые субтитры, чтобы использовать их при неудачной загрузке новых
  const previousData = subtitlesData;

  parseSubtitles(content, detectSubtitleFormat(content, file.name));

  if (subtitlesData.length === 0){
    // Разобрать не удалось, предупреждение уже показано в parseSubtitles.
    // Возвращаем прежние субтитры и НЕ трогаем сохранённую запись.
    subtitlesData = previousData;
    setSubsFileNameDisplay(previousData.length ? (previousName || 'Файл не выбран') : 'Файл не выбран');
    if (previousData.length) updateSubtitles();
    subsRemoveBtn.style.display = previousData.length ? 'flex' : 'none';
    return;
  }

  // Храним реплики в IndexedDB, а в localStorage оставляем только метаданные субтитров
  const serialized = JSON.stringify(subtitlesData);
  const subsData = { fileName: file.name, ts: Date.now(), cues: subtitlesData.length, storage: 'idb' };
  try{
    localStorage.setItem(subsKey(currentFileKey), JSON.stringify(subsData));
    cleanupStorage(SUBS_PREFIX);
  } catch(e){ /* хранилище недоступно, не мешаем применить субтитры для текущей сессии */ }
  idbSet(SUBS_PREFIX + 'data:' + stripProgressPrefix(currentFileKey), serialized).catch(() => {});
  savedSubsContent = serialized;
  isSubtitlesLoaded = true;
  // Применяем стили сразу после загрузки
  applySubtitlesStyle();
  // Показываем кнопку удаления
  subsRemoveBtn.style.display = 'flex';
}

// Для HLS субтитры лежат рядом с плейлистом, пробуем subs.srt, затем subs.vtt
async function autoLoadHlsSubtitles(){
  if (!currentSourceUrl || !/\.m3u8($|[?#])/i.test(currentSourceUrl)) return;
  if (localStorage.getItem(subsKey(currentFileKey))) return; // для этой ссылки субтитры уже выбраны
  const keyAtStart = currentFileKey;
  const base = currentSourceUrl.split(/[?#]/)[0].replace(/[^/]+$/, '');
  for (const name of ['subs.srt', 'subs.vtt']){
    try {
      const res = await fetch(base + name);
      if (keyAtStart !== currentFileKey) return; // открыли другой источник
      if (!res.ok) continue;
      const display = 'Субтитры.' + name.split('.').pop();
      setSubsFileNameDisplay(display);
      processSubtitlesContent(await res.text(), { name: display }, 'Файл не выбран');
      if (subtitlesData.length) return; // разобралось, второй вариант не нужен
    } catch (e) {
      console.warn('Субтитры HLS (' + name + ') не подгрузились:', e && e.message ? e.message : e);
    }
  }
}

// --- Удаление субтитров ---
subsRemoveBtn.addEventListener('click', () => {
  subtitlesData = [];
  resetSubtitleRenderState();
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
    // теги с необязательным классом (<c.yellow>, <lang.en-US>) или атрибутами (<v Speaker>)
    .replace(/<\/?(?:i|b|u|s|em|strong|font|ruby|rt|c|v|lang)(?:[.\s][^>]*)?>/gi, '')
    // караоке-метки WebVTT, в т.ч. с часами: <00:50:01.000>
    .replace(/<\/?(?:\d{1,3}:)?\d{1,2}:\d{2}[.,]\d{1,3}>/g, '')
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
  resetSubtitleRenderState();
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
    showStorageToast(`Не удалось разобрать ${skippedCount} ${skippedCount === 1 ? 'реплику' : 'реплик'} субтитров, тайминг повреждён, они пропущены`);
  }
  
  // Если после парсинга нет субтитров, но файл не пустой - предупреждаем пользователя
  if (subtitlesData.length === 0 && content.trim().length > 0) {
    showStorageToast('Не удалось распознать ни одной реплики субтитров. Проверьте формат файла');
  }
}

// --- Настройки субтитров ---
// Кадр вписан в область плеера с чёрными полями, субтитры считаем от него, иначе на широком фильме текст уезжает в поле
function subtitleFrame(){
  const box = video.getBoundingClientRect();
  let h = box.height;
  if (video.videoWidth && video.videoHeight && box.width){
    h = Math.min(h, box.width * video.videoHeight / video.videoWidth);
  }
  return { height: h, pad: Math.max(0, (box.height - h) / 2) };
}

function applySubtitlesStyle() {
  const frame = subtitleFrame();
  const fontSize = Math.max(10, Math.round(frame.height * parseFloat(subsSize.value) / 100));
  let bottom = frame.pad + frame.height * parseFloat(subsPosition.value) / 100;
  const span = subtitles.querySelector('span');
  if (span) {
    span.style.fontSize = fontSize + 'px';
    span.style.textShadow = subtitleTextShadow(fontSize);
    // Реплика из нескольких строк опускается, чтобы стоять на том же месте, что и одиночная, а не прирастать вверх
    const lines = span.innerHTML.split('<br>').length;
    bottom -= Math.round(fontSize * 0.65) * (lines - 1);
  }
  subtitles.style.bottom = Math.round(bottom) + 'px';
}

subsToggle.addEventListener('change', () => {
  subtitles.style.display = subsToggle.checked ? 'block' : 'none';
  saveSettings();
});

subsSize.addEventListener('input', () => {
  subsSizeVal.textContent = subsSize.value + '%';
  applySubtitlesStyle();
  saveSettings();
});

subsPosition.addEventListener('input', () => {
  subsPositionVal.textContent = subsPosition.value + '%';
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

