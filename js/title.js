// --- Редактирование названия файла по клику ---
let isEditingTitle = false;
let originalTitle = '';
let checkEmpty = null;

const MAX_TITLE_LEN = 200;
const saveTitle = () => {
  if (!isEditingTitle) return;
  const newTitle = (fnameEl.textContent.trim() || originalTitle).slice(0, MAX_TITLE_LEN);

  if (checkEmpty) fnameEl.removeEventListener('input', checkEmpty);
  fnameEl.contentEditable = 'false';
  fnameEl.classList.remove('editing');
  fnameEl.style.userSelect = 'none';
  fnameEl.removeAttribute('data-placeholder');
  fnameEl.setAttribute('role', 'button');
  fnameEl.setAttribute('aria-label', 'Изменить название видео');
  fnameEl.textContent = newTitle;
  
  // Обновляем связанные элементы
  ovTitle.textContent = newTitle;
  titleInput.value = newTitle;
  currentFileName = newTitle;
  
  // Сохраняем настройки и обновляем название в прогрессе
  saveSettings();
  saveTitleToProgress();
  // Новое имя должно сразу попасть и в панель плейлиста
  if (playlistFiles.length) renderPlaylist();
  
  isEditingTitle = false;
};

const cancelEdit = () => {
  if (!isEditingTitle) return;
  if (checkEmpty) fnameEl.removeEventListener('input', checkEmpty);
  fnameEl.contentEditable = 'false';
  fnameEl.classList.remove('editing');
  fnameEl.style.userSelect = 'none';
  fnameEl.removeAttribute('data-placeholder');
  fnameEl.setAttribute('role', 'button');
  fnameEl.setAttribute('aria-label', 'Изменить название видео');
  fnameEl.textContent = originalTitle;
  isEditingTitle = false;
};

// Обработчики редактирования (навешиваются один раз при инициализации)
fnameEl.addEventListener('keydown', (e) => {
  if (!isEditingTitle) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      fnameEl.click();
    }
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    saveTitle();
    fnameEl.blur();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    cancelEdit();
  }
});

fnameEl.addEventListener('paste', (e) => {
  if (!isEditingTitle) return;
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text');
  
  // Используем Selection API для корректной вставки с заменой выделения
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    fnameEl.textContent += text;
  }
});

fnameEl.addEventListener('click', () => {
  if (isEditingTitle) return;

  isEditingTitle = true;
  originalTitle = fnameEl.textContent;

  fnameEl.contentEditable = 'true';
  fnameEl.classList.add('editing');
  fnameEl.removeAttribute('role');
  fnameEl.removeAttribute('aria-label');
  fnameEl.focus();
  
  // Не выделяем текст автоматически
  fnameEl.style.userSelect = 'text';
  
  // Показываем placeholder если пустой
  checkEmpty = () => {
    if (!fnameEl.textContent.trim()) {
      fnameEl.textContent = '';
      fnameEl.setAttribute('data-placeholder', 'Название');
    } else {
      fnameEl.removeAttribute('data-placeholder');
    }
  };
  
  fnameEl.addEventListener('input', checkEmpty);
  checkEmpty();
  
  fnameEl.addEventListener('blur', () => {
    if (!isEditingTitle) return;
    saveTitle();
  }, { once: true });
});

// --- запуск страницы: справка, поле ссылки, открытие по ?src=. Этот код идёт последним, когда весь плеер уже загружен ---

// Справка про ссылки на главной свёрнута, раскрывается по клику
const helpToggle = document.getElementById('help-toggle');
const hlsInfoWrap = document.getElementById('hls-info-wrap');
helpToggle.addEventListener('click', () => {
  const open = !hlsInfoWrap.classList.contains('open');
  hlsInfoWrap.classList.toggle('open', open);
  helpToggle.setAttribute('aria-expanded', String(open));
});

// Обработчики для URL ввода
urlLoadBtn.addEventListener('click', () => {
  loadUrl(urlInput.value);
});

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter'){
    loadUrl(urlInput.value);
  }
});

urlInput.addEventListener('input', () => {
  urlInput.classList.remove('error');
  hideErrMsg();
});

// Очистка ресурсов при выгрузке страницы
window.addEventListener('beforeunload', () => {
  clearInterval(progressInterval);
  clearInterval(uiSyncInterval);
  clearTimeout(centerIconTimeout);
  destroyAudioGraph();
  if (hls) {
    hls.destroy();
    hls = null;
  }
});

// Проверка поддержки File System Access API
if (!FS_ACCESS_SUPPORTED){
  showErrMsg('В этом браузере не работает продолжение просмотра без повторного выбора файла. Открывать видео и папки можно как обычно; для полной функциональности используйте Chrome или Edge', { persistent: true });
}

// Открытие по адресу /?src=<url>&title=<название> с сайта библиотеки, параметры сразу убираются, чтобы перезагрузка не запускала видео повторно
(() => {
  const params = new URLSearchParams(location.search);
  const src = (params.get('src') || '').trim();
  if (!src) return;
  const title = (params.get('title') || '').trim();
  try { history.replaceState(null, '', location.pathname + location.hash); } catch(e){}
  urlInput.value = src;
  loadUrl(src, title ? { title } : undefined);
})();

// Докручиваем сразу до конца, чтобы фокус на инпуте/кнопке не вызывал прыжок
document.documentElement.scrollTop = document.documentElement.scrollHeight;
document.body.scrollTop = document.body.scrollHeight;

