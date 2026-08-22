// 07-subtitles.js — Загрузка, разбор, отображение и стили субтитров
// Часть Local Player. Файлы подключаются классическими <script> по порядку
// из index.html и делят общую область видимости — см. js/README.md
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
  // Сохраняем то, что уже применено: если новый файл не разберётся, откатимся к нему.
  // Раньше неудачная загрузка безвозвратно стирала рабочие субтитры (баг M-20).
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

  // Реплики целиком уезжают в IndexedDB: один фильм занимал ~640 КБ в localStorage,
  // и семи фильмов хватало, чтобы подойти к квоте в 5 МБ и обрушить сохранение
  // прогресса всего плеера (баг M-10). В localStorage остаются только метаданные.
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
  
  // Удаляем из localStorage и из IndexedDB (реплики теперь хранятся там — см. M-10)
  if (currentFileKey) {
    try {
      localStorage.removeItem(subsKey(currentFileKey));
    } catch(e) {}
    idbDelete(SUBS_PREFIX + 'data:' + stripProgressPrefix(currentFileKey)).catch(() => {});
  }
  
  // Сохраняем настройки
  saveSettingsImmediate();
});

// Единый разбор времени: принимаем и запятую (SRT), и точку (часто встречается
// в .srt, полученных конвертацией из .vtt — раньше такой файл давал ноль реплик,
// баг M-8), а также короткую форму мм:сс.ммм из WebVTT.
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

// Разметку вида <i>, <b>, <font color=...> и позиционные теги {\\an8} раньше
// экранировали и показывали пользователю буквально (баг M-9). Экранирование при
// выводе остаётся, а сами теги вырезаем здесь.
function cleanSubtitleText(text){
  return String(text)
    .replace(/\{\\[^}]*\}/g, '')
    .replace(/<\/?(?:i|b|u|s|em|strong|font|ruby|rt|c|v|lang)(?:\s[^>]*)?>/gi, '')
    .replace(/<\/?\d{1,2}:\d{2}[.,]\d{1,3}>/g, '')
    .trim();
}

// Формат определяем по содержимому, а не по расширению: файл с именем .srt может
// оказаться WebVTT и наоборот (баг M-8)
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
      // Строка-индекс перед таймингом необязательна: многие конвертеры её не пишут,
      // и раньше такой файл давал ноль реплик (баг M-8). Ищем сам тайминг, а индекс
      // просто пропускаем, если он есть.
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

  // Реплики могут перекрываться по времени; сортируем по началу, чтобы поиск
  // текущей реплики выбирал самую позднюю подходящую, а не первую в файле (баг L-6)
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
  const color = hexToRgba(subsColor.value, subsOpacity.value / 100);
  // Базовый размер уезжает в CSS-переменную, а итоговый кегль умножается на
  // масштаб сцены — так субтитры растут вместе с картинкой в fullscreen (баг M-7)
  subtitles.style.setProperty('--subs-size', subsSize.value + 'px');

  const span = subtitles.querySelector('span');
  const fontSize = parseInt(subsSize.value, 10) * (stageScale || 1);
  const offset = Math.round(fontSize * 0.65);
  if (span) {
    span.style.color = color;
    const textLines = span.innerHTML.split('<br>').length;
    // Отступ раньше пересчитывался только при наличии реплики и «залипал» после
    // многострочной до следующей многострочной (баг L-7) — теперь сбрасываем всегда
    subtitles.style.bottom = textLines > 1 ? `calc(5% - ${offset}px)` : '5%';
  } else {
    subtitles.style.bottom = '5%';
  }
}

// Коэффициент масштаба сцены: 1 — обычное окно, больше — полноэкранный режим на
// крупном мониторе. Пересчитывается по фактической высоте .stage (баг M-7).
let stageScale = 1;
const STAGE_BASE_HEIGHT = 640; // высота сцены в типичном окне 1280x900
function updateStageScale(){
  const el = document.getElementById('stage');
  if (!el) return;
  const h = el.getBoundingClientRect().height;
  if (!h) return;
  const next = Math.min(2.2, Math.max(1, h / STAGE_BASE_HEIGHT));
  if (Math.abs(next - stageScale) < 0.02) return;
  stageScale = next;
  el.style.setProperty('--stage-scale', String(stageScale));
  applySubtitlesStyle();
}
function initStageScale(){
  const el = document.getElementById('stage');
  if (!el) return;
  if (typeof ResizeObserver === 'function'){
    new ResizeObserver(() => updateStageScale()).observe(el);
  } else {
    window.addEventListener('resize', updateStageScale);
  }
  document.addEventListener('fullscreenchange', updateStageScale);
  updateStageScale();
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
