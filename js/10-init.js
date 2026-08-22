// 10-init.js — Редактирование названия, финальная инициализация
// Часть Local Player. Файлы подключаются классическими <script> по порядку
// из index.html и делят общую область видимости — см. js/README.md
// --- Редактирование названия файла по клику ---
let isEditingTitle = false;
let originalTitle = '';
let checkEmpty = null;

const saveTitle = () => {
  if (!isEditingTitle) return;
  const newTitle = fnameEl.textContent.trim() || originalTitle;
  
  if (checkEmpty) fnameEl.removeEventListener('input', checkEmpty);
  fnameEl.contentEditable = 'false';
  fnameEl.classList.remove('editing');
  fnameEl.style.userSelect = 'none';
  fnameEl.removeAttribute('data-placeholder');
  fnameEl.textContent = newTitle;
  
  // Обновляем связанные элементы
  ovTitle.textContent = newTitle;
  titleInput.value = newTitle;
  currentFileName = newTitle;
  
  // Сохраняем настройки и обновляем название в прогрессе
  saveSettings();
  saveTitleToProgress();
  
  isEditingTitle = false;
};

const cancelEdit = () => {
  if (!isEditingTitle) return;
  if (checkEmpty) fnameEl.removeEventListener('input', checkEmpty);
  fnameEl.contentEditable = 'false';
  fnameEl.classList.remove('editing');
  fnameEl.style.userSelect = 'none';
  fnameEl.removeAttribute('data-placeholder');
  fnameEl.textContent = originalTitle;
  isEditingTitle = false;
};

// Обработчики редактирования (навешиваются один раз при инициализации)
fnameEl.addEventListener('keydown', (e) => {
  if (!isEditingTitle) return;
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

// Обработчики для URL ввода
urlLoadBtn.addEventListener('click', () => {
  loadUrl(urlInput.value);
});

urlInput.addEventListener('keypress', (e) => {
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
  // Раньше дропзона здесь полностью отключалась (pointer-events: none), и уже
  // написанный фолбэк на <input type="file"> не мог сработать — в Firefox/Safari
  // выбрать файл кликом было невозможно вообще (баг M-14).
  showErrMsg('В этом браузере не работает продолжение просмотра без повторного выбора файла. Открывать видео и папки можно как обычно; для полной функциональности используйте Chrome или Edge', { persistent: true });
}

// Масштаб сцены инициализируем после того, как объявлены все элементы (баг M-7)
initStageScale();
