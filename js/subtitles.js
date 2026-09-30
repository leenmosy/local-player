// --- Субтитры: загрузка, разбор, стиль и показ реплики на экране ---

// Размер и отступ субтитров заданы в процентах от высоты кадра, поэтому в окне и в полном экране текст выглядит одинаково
const SUBS_SIZE_DEFAULT = 5;
const SUBS_POSITION_DEFAULT = 4.25;

// Обводка и тень субтитров как в VLC, обе считаются от размера шрифта и потому выглядят одинаково на любом размере
function subtitleTextShadow(fontSize){
  const w = Math.max(1, Math.round(fontSize / 22));
  const shadow = [[-w,-w],[0,-w],[w,-w],[w,0],[w,w],[0,w],[-w,w],[-w,0]]
    .map(([x, y]) => `${x}px ${y}px 0 #000`);
  const drop = Math.max(1, Math.round(fontSize / 20));
  shadow.push(`${drop}px ${drop}px ${(drop * 1.5).toFixed(1)}px rgba(0,0,0,0.5)`);
  return shadow.join(', ');
}

// Имя файла обрезается многоточием, дублируем в title для наведения
function setSubsFileNameDisplay(name){
  const nameWithoutExt = name === 'Файл не выбран' ? name : name.replace(/\.[^/.]+$/, '');
  subsFileName.textContent = nameWithoutExt;
  subsFileName.title = name === 'Файл не выбран' ? '' : name;
}

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

