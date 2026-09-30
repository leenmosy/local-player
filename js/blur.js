// --- тайминги: экран размывается в заданные промежутки ---
const BLUR_AMOUNT_PX = 40;
const timingFromHH = document.getElementById('timing-from-hh');
const timingFromMM = document.getElementById('timing-from-mm');
const timingFromSS = document.getElementById('timing-from-ss');
const timingToHH = document.getElementById('timing-to-hh');
const timingToMM = document.getElementById('timing-to-mm');
const timingToSS = document.getElementById('timing-to-ss');
const timingAddBtn = document.getElementById('timing-add-btn');
const timingErr = document.getElementById('timing-err');
const timingList = document.getElementById('timing-list');

// Время вводится по отдельным полям: после 2 цифр фокус переходит дальше, Backspace, к предыдущему
function wireSegmentedInput(hh, mm, ss, onEnter = null){
  const segments = [hh, mm, ss];
  segments.forEach((seg, i) => {
    seg.addEventListener('input', () => {
      seg.value = seg.value.replace(/[^0-9]/g, '').slice(0, 2);
      if (seg.value.length === 2 && i < segments.length - 1){
        segments[i + 1].focus();
        segments[i + 1].select();
      }
    });
    seg.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && seg.value === '' && i > 0){
        e.preventDefault();
        const prev = segments[i - 1];
        prev.focus();
        prev.value = prev.value.slice(0, -1);
      } else if (e.key === 'ArrowLeft' && seg.selectionStart === 0 && i > 0){
        e.preventDefault();
        segments[i - 1].focus();
        segments[i - 1].select();
      } else if (e.key === 'ArrowRight' && seg.selectionStart === seg.value.length && i < segments.length - 1){
        e.preventDefault();
        segments[i + 1].focus();
        segments[i + 1].select();
      } else if (e.key === ':'){
        e.preventDefault();
        // Если есть следующее поле, переходим к нему
        if (i < segments.length - 1){
          segments[i + 1].focus();
          segments[i + 1].select();
        }
        // Иначе просто игнорируем двоеточие на последнем поле
      } else if (e.key === 'Enter' && i === segments.length - 1){
        e.preventDefault();
        // Если это последний сегмент и есть callback, вызываем его
        if (onEnter && typeof onEnter === 'function') {
          onEnter();
        } else {
          // Иначе вызываем событие клика на кнопку добавления (для основного ввода)
          const addBtn = document.getElementById('timing-add-btn');
          if (addBtn) addBtn.click();
        }
      }
    });
    seg.addEventListener('focus', () => seg.select());
  });

  // Обработка кликов на визуальные двоеточия между полями
  const colon1 = hh.nextElementSibling;
  const colon2 = mm.nextElementSibling;
  if (colon1 && colon1.classList.contains('ts-colon')){
    colon1.style.cursor = 'text';
    colon1.addEventListener('click', () => {
      hh.focus();
      hh.select();
    });
  }
  if (colon2 && colon2.classList.contains('ts-colon')){
    colon2.style.cursor = 'text';
    colon2.addEventListener('click', () => {
      mm.focus();
      mm.select();
    });
  }

  // Обработка кликов на контейнер для фокуса на нужный сегмент
  const container = hh.parentElement;
  if (container && container.classList.contains('timing-segmented')){
    container.addEventListener('click', (e) => {
      if (e.target === container || e.target.classList.contains('ts-colon')){
        const rect = container.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const third = rect.width / 3;

        // Делим контейнер на 3 части: часы, минуты, секунды
        if (clickX < third){
          hh.focus();
          hh.select();
        } else if (clickX < third * 2){
          mm.focus();
          mm.select();
        } else {
          ss.focus();
          ss.select();
        }
      }
    });
  }
}

wireSegmentedInput(timingFromHH, timingFromMM, timingFromSS);
wireSegmentedInput(timingToHH, timingToMM, timingToSS);

// Связываем две группы таймингов для переходов между ними
function wireTimingGroups(fromHH, fromMM, fromSS, toHH, toMM, toSS){
  // При заполнении последнего сегмента (секунды) в начале, переходим к концу
  fromSS.addEventListener('input', () => {
    if (fromSS.value.length === 2){
      toHH.focus();
      toHH.select();
    }
  });

  // Стрелка вправо на последнем сегменте начала переходит к концу
  fromSS.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' && fromSS.selectionStart === fromSS.value.length){
      e.preventDefault();
      toHH.focus();
      toHH.select();
    }
  });

  // Стрелка влево на первом сегменте конца возвращает к началу
  toHH.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' && toHH.selectionStart === 0){
      e.preventDefault();
      fromSS.focus();
      fromSS.select();
    }
  });

  // Backspace на пустом конце возвращает к началу
  toHH.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && toHH.value === '' && toMM.value === '' && toSS.value === ''){
      e.preventDefault();
      fromSS.focus();
      fromSS.select();
    }
  });

  // Стрелка влево на пустом втором инпуте возвращает к первому
  toMM.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' && toMM.value === '' && toMM.selectionStart === 0){
      e.preventDefault();
      toHH.focus();
      toHH.select();
    }
  });

}

wireTimingGroups(timingFromHH, timingFromMM, timingFromSS, timingToHH, timingToMM, timingToSS);

// Собирает секунды из трёх полей чч/мм/сс; пустая часть считается нулём
// Если все три части пустые, считаем, что пользователь вообще ничего не ввёл
function getSegmentedSeconds(hh, mm, ss){
  if (hh.value === '' && mm.value === '' && ss.value === '') return null;
  const h = hh.value === '' ? '0' : hh.value;
  const m = mm.value === '' ? '0' : mm.value;
  const s = ss.value === '' ? '0' : ss.value;
  return parseTimeToSeconds(`${h}:${m}:${s}`);
}

// Заполняет поля чч/мм/сс из количества секунд (используется при редактировании готового тайминга)
function setSegmentedValue(hh, mm, ss, totalSeconds){
  const t = Math.max(0, Math.floor(totalSeconds || 0));
  const pad = n => String(n).padStart(2, '0');
  hh.value = pad(Math.floor(t / 3600));
  mm.value = pad(Math.floor((t % 3600) / 60));
  ss.value = pad(t % 60);
}

function clearSegmented(hh, mm, ss){
  hh.value = '';
  mm.value = '';
  ss.value = '';
}

// Создаёт группу из трёх полей чч:мм:сс с теми же классами/стилями, что и статичная
// разметка в HTML, используется при редактировании уже добавленных таймингов
function createSegmentedGroup(onEnter = null){
  const container = document.createElement('div');
  container.className = 'dr-text-input timing-time-input timing-segmented';

  const makeSeg = (placeholder, label) => {
    const seg = document.createElement('input');
    seg.type = 'text';
    seg.className = 'ts-seg';
    seg.placeholder = placeholder;
    seg.maxLength = 2;
    seg.inputMode = 'numeric';
    seg.setAttribute('aria-label', label);
    return seg;
  };
  const makeColon = () => {
    const colon = document.createElement('span');
    colon.className = 'ts-colon';
    colon.textContent = ':';
    return colon;
  };

  const hh = makeSeg('чч', 'Часы');
  const mm = makeSeg('мм', 'Минуты');
  const ss = makeSeg('сс', 'Секунды');
  container.append(hh, makeColon(), mm, makeColon(), ss);
  wireSegmentedInput(hh, mm, ss, onEnter);
  return { container, hh, mm, ss };
}

let blurRanges = []; // [{ from: сек, to: сек }, ...], отсортировано по from
let blurFileApplied = false; // тайминги из blur.txt уже брались для этой ссылки, второй раз файл не читаем
let blurFileClampPending = false; // интервалы из blur.txt ещё не подогнаны под длительность
let currentEditingItem = null; // текущий редактируемый элемент
let isEditing = false; // флаг для предотвращения одновременного редактирования

// Проверяем пересечение с другими диапазонами, не считая вплотную стыкующиеся диапазоны пересечением
function findOverlappingRange(from, to, excludeIdx){
  return blurRanges.some((r, i) => i !== excludeIdx && !(to <= r.from || from >= r.to));
}

function parseTimeToSeconds(str){
  if (!str) return null;
  const parts = str.trim().split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map(p => p.trim());
  if (nums.some(p => p === '' || !/^\d+$/.test(p))) return null;
  const vals = nums.map(Number);
  
  let seconds;
  if (vals.length === 2){
    const [m, s] = vals;
    // Проверяем валидность минут и секунд
    if (s >= 60) return null; // секунды должны быть < 60
    seconds = m * 60 + s;
  } else {
    const [h, m, s] = vals;
    // Проверяем валидность часов, минут и секунд
    if (h > 99) return null; // часы должны быть <= 99
    if (m >= 60) return null; // минуты должны быть < 60
    if (s >= 60) return null; // секунды должны быть < 60
    seconds = h * 3600 + m * 60 + s;
  }
  return seconds >= 0 ? seconds : null;
}

// Схлопывает элемент и резолвится по завершении transition ИЛИ по таймауту,
// если transitionend не пришёл (throttled-вкладка, prefers-reduced-motion, rAF-голод)
function collapseElement(el){
  el.classList.add('collapsed');
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(t);
      el.removeEventListener('transitionend', onEnd);
      resolve();
    };
    const onEnd = (ev) => {
      if (ev.target === el && ev.propertyName === 'max-height') finish();
    };
    el.addEventListener('transitionend', onEnd);
    const t = setTimeout(finish, 400);
  });
}

// Диапазоны блюра рисуются жёлтыми отрезками на дорожке таймлайна, вместе с включительной секундой
const seekMarks = document.getElementById('seek-marks');
function renderSeekMarks(){
  seekMarks.innerHTML = '';
  if (!isDurationUsable()) return;
  const dur = video.duration;
  for (const r of blurRanges){
    const left = Math.max(0, Math.min(100, r.from / dur * 100));
    const right = Math.max(0, Math.min(100, (r.to + 1) / dur * 100));
    if (right <= left) continue;
    const m = document.createElement('span');
    m.style.left = left + '%';
    m.style.width = (right - left) + '%';
    seekMarks.appendChild(m);
  }
}
video.addEventListener('durationchange', renderSeekMarks);

function renderBlurRanges(newIndex){
  if (isEditing) stopEditingSession();
  renderSeekMarks();
  timingList.innerHTML = '';
  blurRanges.forEach((range, idx) => {
    const item = document.createElement('div');
    item.className = 'timing-item';
    if (idx === newIndex) item.classList.add('collapsed');

    const rangeText = document.createElement('span');
    rangeText.className = 'timing-range';
    // Карандаш при наведении показывает, что диапазон редактируется
    const rangeLabel = document.createElement('span');
    rangeLabel.className = 'timing-range-text';
    rangeLabel.textContent = `${formatTime(range.from)} – ${formatTime(range.to)}`;
    rangeText.appendChild(rangeLabel);
    rangeText.insertAdjacentHTML('beforeend', '<svg class="timing-edit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>');
    
    rangeText.addEventListener('click', (e) => {
      e.stopPropagation();
      startEditingRange(idx, item, rangeText);
    });
    
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'timing-remove-btn';
    removeBtn.setAttribute('aria-label', 'Удалить тайминг');
    removeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      stopEditingSession();
      // Удаляем по ссылке на объект, а не по индексу: другой параллельный
      // remove мог уже сдвинуть массив за время анимации схлопывания
      blurRanges = blurRanges.filter(r => r !== range);
      updateVideoFilter();
      saveSettings();
      collapseElement(item).then(() => renderBlurRanges());
    });
    
    item.appendChild(rangeText);
    item.appendChild(removeBtn);
    
    // Предотвращаем закрытие настроек при клике на элемент
    item.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    
    timingList.appendChild(item);
  });
  const newItem = timingList.children[newIndex];
  if (newItem){
    requestAnimationFrame(() => {
      requestAnimationFrame(() => newItem.classList.remove('collapsed'));
    });
  }
}

let activeOutsideClickHandler = null;

// Единая точка завершения сессии редактирования, снимает обработчик клика вне поля
// и сбрасывает флаги, чтобы состояние редактирования не «зависало» между рендерами
function stopEditingSession(){
  if (activeOutsideClickHandler){
    document.removeEventListener('click', activeOutsideClickHandler, true);
    activeOutsideClickHandler = null;
  }
  currentEditingItem = null;
  isEditing = false;
}

function startEditingRange(idx, item, rangeText) {
  // Если кликнули на уже редактируемый диапазон, ничего не делаем
  if (currentEditingItem === item) {
    return;
  }

  // Если уже редактируем другой диапазон, закрываем его и переключаемся на новый
  if (currentEditingItem !== null) {
    stopEditingSession();
    renderBlurRanges();
    // После перерендеринга находим новый элемент по индексу
    setTimeout(() => {
      const newItems = timingList.querySelectorAll('.timing-item');
      if (newItems[idx]) {
        const newItem = newItems[idx];
        const newRangeText = newItem.querySelector('.timing-range');
        if (newRangeText) {
          startEditingRange(idx, newItem, newRangeText);
        }
      }
    }, 0);
    return;
  }
  
  // Проверяем, что элемент всё ещё существует в DOM
  if (!document.body.contains(item)) {
    currentEditingItem = null;
    return;
  }
  
  try {
    isEditing = true;
    currentEditingItem = item;
    const range = blurRanges[idx];
  
  // Функция сохранения (определяем до использования)
  const saveEdit = () => {
    const from = getSegmentedSeconds(fromGroup.hh, fromGroup.mm, fromGroup.ss);
    const to = getSegmentedSeconds(toGroup.hh, toGroup.mm, toGroup.ss);
    
    if (from === null || to === null) {
      fromGroup.container.classList.add('has-error');
      toGroup.container.classList.add('has-error');
      return;
    }
    
    if (to <= from) {
      fromGroup.container.classList.add('has-error');
      toGroup.container.classList.add('has-error');
      fromGroup.container.title = 'Время окончания должно быть больше времени начала';
      toGroup.container.title = 'Время окончания должно быть больше времени начала';
      return;
    }

    if (findOverlappingRange(from, to, blurRanges.indexOf(range))) {
      fromGroup.container.classList.add('has-error');
      toGroup.container.classList.add('has-error');
      fromGroup.container.title = 'Этот диапазон пересекается с другим';
      toGroup.container.title = 'Этот диапазон пересекается с другим';
      return;
    }

    if (isDurationUsable() && to > video.duration) {
      fromGroup.container.classList.add('has-error');
      toGroup.container.classList.add('has-error');
      fromGroup.container.title = 'Время окончания превышает длительность видео';
      toGroup.container.title = 'Время окончания превышает длительность видео';
      return;
    }
    
    // Сбрасываем стили ошибок
    fromGroup.container.classList.remove('has-error');
    toGroup.container.classList.remove('has-error');
    fromGroup.container.title = '';
    toGroup.container.title = '';
    
    // Обновляем диапазон по ссылке на исходный объект, индекс мог устареть
    const editIdx = blurRanges.indexOf(range);
    if (editIdx !== -1) blurRanges[editIdx] = { from, to };
    blurRanges.sort((a, b) => a.from - b.from);
    stopEditingSession();
    renderBlurRanges();
    updateVideoFilter();
    saveSettings();
  };
  
  // Создаем редактируемые поля
  const editContainer = document.createElement('div');
  editContainer.className = 'timing-edit-container';
  
  const fromGroup = createSegmentedGroup();
  fromGroup.container.style.flex = '1';
  setSegmentedValue(fromGroup.hh, fromGroup.mm, fromGroup.ss, range.from);

  const dash = document.createElement('span');
  dash.className = 'timing-dash';
  dash.textContent = '–';

  const toGroup = createSegmentedGroup(saveEdit);
  toGroup.container.style.flex = '1';
  setSegmentedValue(toGroup.hh, toGroup.mm, toGroup.ss, range.to);

  // Связываем группы для переходов между ними при редактировании
  wireTimingGroups(fromGroup.hh, fromGroup.mm, fromGroup.ss, toGroup.hh, toGroup.mm, toGroup.ss);
  
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'timing-add-btn';
  // Галочка той же толщины и в том же квадрате, что плюс у строки добавления, чтобы сидела по центру кнопки
  saveBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>`;
  
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'timing-remove-btn';
  cancelBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
  
  // Переиспользуем уже существующую кнопку удаления элемента (со своим обработчиком).
  // Во время редактирования её не показываем, просто прячем на месте.
  const deleteBtn = item.querySelector('.timing-remove-btn');
  if (deleteBtn) deleteBtn.style.display = 'none';
  
  // Ряд редактирования с полями времени и кнопками подтверждения и отмены
  const confirmGroup = document.createElement('div');
  confirmGroup.className = 'timing-edit-confirm-group';
  confirmGroup.appendChild(saveBtn);
  confirmGroup.appendChild(cancelBtn);
  
  const inputsRow = document.createElement('div');
  inputsRow.className = 'timing-edit-inputs';
  inputsRow.appendChild(fromGroup.container);
  inputsRow.appendChild(dash);
  inputsRow.appendChild(toGroup.container);
  inputsRow.appendChild(confirmGroup);
  
  editContainer.appendChild(inputsRow);
  
  // Заменяем текст на редактируемые поля, растягиваем сам элемент под них
  item.replaceChild(editContainer, rangeText);
  item.classList.add('editing');
  
  // Предотвращаем закрытие настроек при клике на контейнер редактирования
  editContainer.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
  // Фокус на первое поле
  fromGroup.hh.focus();
  fromGroup.hh.select();
  
  // Функция отмены
  const cancelEdit = () => {
    stopEditingSession();
    renderBlurRanges();
  };
  
  // Обработчики
  saveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    saveEdit();
  });
  
  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    cancelEdit();
  });
  
  // Закрытие редактирования при клике вне области
  const closeOnClickOutside = (e) => {
    // Для другого диапазона ничего не делаем, его обработчик сам переключит режим редактирования
    if (e.target.closest && e.target.closest('.timing-range')) {
      return;
    }
    // Если клик не в редактируемом элементе и не в контейнере редактирования
    if (!editContainer.contains(e.target) && !item.contains(e.target)) {
      stopEditingSession();
      renderBlurRanges();
    }
  };
  
  // Добавляем обработчик в capture фазе, чтобы перехватить клики раньше
  setTimeout(() => {
    document.addEventListener('click', closeOnClickOutside, true);
    activeOutsideClickHandler = closeOnClickOutside;
  }, 10);
  
  // Сохранение при Enter / отмена при Escape, вешаем на все сегменты обеих групп
  const attachEnterEscape = (segments, onEnter, onEscape) => {
    segments.forEach(seg => {
      seg.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onEnter();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          // Останавливаем всплытие события, чтобы клик не закрывал панель настроек
          e.stopPropagation();
          onEscape();
        }
      });
    });
  };
  attachEnterEscape([fromGroup.hh, fromGroup.mm, fromGroup.ss], () => {
    toGroup.hh.focus();
    toGroup.hh.select();
  }, cancelEdit);
  attachEnterEscape([toGroup.hh, toGroup.mm, toGroup.ss], saveEdit, cancelEdit);
  
  // Сброс стилей ошибок при вводе
  [fromGroup.hh, fromGroup.mm, fromGroup.ss].forEach(seg => {
    seg.addEventListener('input', () => fromGroup.container.classList.remove('has-error'));
  });
  [toGroup.hh, toGroup.mm, toGroup.ss].forEach(seg => {
    seg.addEventListener('input', () => toGroup.container.classList.remove('has-error'));
  });
  } catch (e) {
    console.error('Error in startEditingRange:', e);
    stopEditingSession();
    renderBlurRanges();
  }
}

let timingErrTimeout = null;
function showTimingError(msg){
  timingErr.textContent = msg;
  timingErr.classList.add('show');
  clearTimeout(timingErrTimeout);
  timingErrTimeout = setTimeout(() => clearTimingError(), 4500);
}
function clearTimingError(){
  clearTimeout(timingErrTimeout);
  timingErr.classList.remove('show');
}

timingAddBtn.addEventListener('click', () => {
  clearTimingError();
  const from = getSegmentedSeconds(timingFromHH, timingFromMM, timingFromSS);
  const to = getSegmentedSeconds(timingToHH, timingToMM, timingToSS);
  if (from === null || to === null){
    showTimingError('Неверный формат времени. Используйте чч:мм:сс');
    return;
  }
  if (to <= from){
    showTimingError('Время окончания должно быть больше времени начала');
    return;
  }
  // Проверка на пересечение с существующими диапазонами
  const hasOverlap = findOverlappingRange(from, to, -1);
  if (hasOverlap){
    showTimingError('Этот диапазон пересекается с существующим');
    return;
  }
  // Проверка на превышение длительности видео
  if (isDurationUsable() && to > video.duration){
    showTimingError('Время окончания превышает длительность видео');
    return;
  }
  blurRanges.push({ from, to });
  blurRanges.sort((a, b) => a.from - b.from);
  const newIndex = blurRanges.findIndex(r => r.from === from && r.to === to);
  renderBlurRanges(newIndex);
  updateVideoFilter();
  saveSettings();
  clearSegmented(timingFromHH, timingFromMM, timingFromSS);
  clearSegmented(timingToHH, timingToMM, timingToSS);
  timingFromHH.focus();
});

// Учитываем точность до секунды при расчёте конца блюра и используем единый формат отображения скорости
function formatSpeedLabel(rate){
  const n = Number(rate);
  return (Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(2)))) + 'x';
}
function isInBlurRange(t){
  // "до" указывается с точностью до секунды, считаем её включительно
  // до конца этой секунды, а не только до её начала
  return blurRanges.some(r => t >= r.from && t < r.to + 1);
}

// Единая точка применения фильтров видео: яркости и блюра по текущему таймингу
function updateVideoFilter(forceBlur){
  const parts = [];
  const brightness = drBrightness.value / 100;
  if (brightness !== 1) parts.push(`brightness(${brightness})`);
  const blurOn = (typeof forceBlur === 'boolean') ? forceBlur : isInBlurRange(video.currentTime);
  if (blurOn) parts.push(`blur(${BLUR_AMOUNT_PX}px)`);
  video.style.filter = parts.join(' ');
}

function niceTitleFromFilename(name){
  const withoutExt = name.replace(/\.[^/.]+$/, '');
  const pretty = withoutExt.replace(/[._]/g, ' ').trim();
  return pretty || String(name || 'Видео').trim() || 'Видео';
}


// Имя файла обрезается многоточием, дублируем в title для наведения
function setSubsFileNameDisplay(name){
  const nameWithoutExt = name === 'Файл не выбран' ? name : name.replace(/\.[^/.]+$/, '');
  subsFileName.textContent = nameWithoutExt;
  subsFileName.title = name === 'Файл не выбран' ? '' : name;
}

