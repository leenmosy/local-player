// --- перетаскивание файла ---
['dragenter','dragover'].forEach(evt =>
  dropzone.addEventListener(evt, e => { 
    e.preventDefault(); 
    e.stopPropagation();
    e.stopImmediatePropagation();
    dropzone.classList.add('dragover'); 
  })
);
['dragleave'].forEach(evt =>
  dropzone.addEventListener(evt, e => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    dropzone.classList.remove('dragover');
  })
);
dropzone.addEventListener('drop', async e => {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  // Сразу снимаем подсветку зоны после завершения перетаскивания файлов
  dropzone.classList.remove('dragover');

  const files = e.dataTransfer.files;
  if (!files || files.length === 0) {
    // Обрабатываем перетаскивание текста
    showErrMsg('Не удалось получить файл. Попробуйте выбрать файл через диалог');
    return;
  }
  
  const file = files[0];
  if (!file) return;
  
  // Проверяем по MIME type или по расширению
  if (!isVideoFile(file)) {
    // Для перетащенной папки показываем подсказку с использованием отдельной зоны загрузки
    showErrMsg(looksLikeFolderDrop(file)
      ? 'Похоже, это папка. Перетащите её в зону «Выберите папку» справа'
      : 'Перетащите видеофайл (.mp4, .webm, .mov)');
    return;
  }

  const dtItem = e.dataTransfer.items && e.dataTransfer.items[0];
  let handle = null;
  if (dtItem && typeof dtItem.getAsFileSystemHandle === 'function'){
    try{
      const h = await dtItem.getAsFileSystemHandle();
      if (h && h.kind === 'file') handle = h;
    } catch(err){ handle = null; }
  }
  if (handle){
    try{ await idbSet(fileKey(file), handle); } catch(err){}
  }
  loadFile(file, handle);
  // Строка ошибки живёт на главной и прячется при открытии, подсказку про остальные файлы показываем уже в плеере
  if (files.length > 1) showInfoToast(`Перетащено файлов: ${files.length}. Открыт первый: «${file.name}». Для нескольких серий перетащите папку`);
});

// --- перетаскивание папки ---
['dragenter','dragover'].forEach(evt =>
  dropzoneFolder.addEventListener(evt, e => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    dropzoneFolder.classList.add('dragover');
  })
);
['dragleave'].forEach(evt =>
  dropzoneFolder.addEventListener(evt, e => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    dropzoneFolder.classList.remove('dragover');
  })
);
dropzoneFolder.addEventListener('drop', async e => {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  dropzoneFolder.classList.remove('dragover');

  const items = e.dataTransfer.items;

  // Одиночный файл в зоне папки, направляем в зону файла
  if (items && items.length === 1 && typeof items[0].webkitGetAsEntry === 'function'){
    const entry = items[0].webkitGetAsEntry();
    if (entry && entry.isFile){
      showErrMsg('Похоже, это файл. Перетащите его в зону «Выберите файл» слева');
      return;
    }
  }

  let files = [];
  let folderName = null;
  let dirHandle = null;
  if (items && items.length && (typeof items[0].getAsFileSystemHandle === 'function' || typeof items[0].webkitGetAsEntry === 'function')){
    const collected = await collectFilesFromDataTransferItems(Array.from(items));
    files = collected.files;
    folderName = collected.folderName;
    dirHandle = collected.dirHandle || null;
  } else if (e.dataTransfer.files && e.dataTransfer.files.length){
    files = Array.from(e.dataTransfer.files).map(f => ({ file: f, handle: null }));
  }

  if (!files.length){
    showErrMsg('Не удалось прочитать содержимое папки. Попробуйте выбрать папку через диалог');
    return;
  }
  openFolderPlaylist(files, folderName, dirHandle);
});
dropzoneFolder.addEventListener('click', async () => {
  if (typeof window.showDirectoryPicker === 'function'){
    try{
      const dirHandle = await window.showDirectoryPicker();
      const files = [];
      await collectFilesFromDirectoryHandle(dirHandle, files, dirHandle.name);
      openFolderPlaylist(files, dirHandle.name, dirHandle);
    } catch(err){ /* пользователь закрыл диалог выбора папки */ }
    return;
  }
  folderInput.click();
});
folderInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files || []).map(f => ({ file: f, handle: null }));
  folderInput.value = '';
  if (!files.length) return;
  // input[webkitdirectory] кладёт имя папки первым сегментом относительного пути
  let folderName = null;
  if (files[0] && files[0].file.webkitRelativePath){
    folderName = files[0].file.webkitRelativePath.split('/')[0] || null;
  }
  openFolderPlaylist(files, folderName);
});

// Глобальный drag & drop для всего body
['dragenter','dragover'].forEach(evt =>
  document.body.addEventListener(evt, e => {
    e.preventDefault();
    e.stopPropagation();
    // Подсвечиваем dropzone при перетаскивании в любом месте пока drop-view активен
    if (dropView.style.display !== 'none'){
      dropzone.classList.add('dragover');
    }
  })
);
['dragleave'].forEach(evt =>
  document.body.addEventListener(evt, e => {
    e.preventDefault();
    e.stopPropagation();
    // Убираем подсветку при уходе
    dropzone.classList.remove('dragover');
    dropzoneFolder.classList.remove('dragover');
  })
);
// Убираем подсветку при завершении любой drag-операции
document.body.addEventListener('dragend', e => {
  e.preventDefault();
  e.stopPropagation();
  dropzone.classList.remove('dragover');
  dropzoneFolder.classList.remove('dragover');
});
// Глобальный drop только для области вне dropzone
document.body.addEventListener('drop', async e => {
  e.preventDefault();
  e.stopPropagation();
  
  // Если drop произошёл на dropzone/dropzone-folder или внутри них, не обрабатываем здесь
  if (e.target.closest('#dropzone') || e.target.closest('#dropzone-folder')) {
    return;
  }
  
  // Если drop view не показан, показываем уведомление
  if (dropView.style.display === 'none'){
    showInfoToast('Сначала нажмите «Назад», чтобы открыть другой файл');
    return;
  }
  
  const files = e.dataTransfer.files;
  if (!files || files.length === 0) return;
  
  const file = files[0];
  if (!file) return;
  
  // Проверяем по MIME type или по расширению
  if (!isVideoFile(file)) {
    showErrMsg(looksLikeFolderDrop(file)
      ? 'Похоже, это папка. Перетащите её в зону «Выберите папку» справа'
      : 'Перетащите видеофайл (.mp4, .webm, .mov)');
    return;
  }

  const dtItem = e.dataTransfer.items && e.dataTransfer.items[0];
  let handle = null;
  if (dtItem && typeof dtItem.getAsFileSystemHandle === 'function'){
    try{
      const h = await dtItem.getAsFileSystemHandle();
      if (h && h.kind === 'file') handle = h;
    } catch(err){ handle = null; }
  }
  if (handle){
    try{ await idbSet(fileKey(file), handle); } catch(err){}
  }
  loadFile(file, handle);
});
const fileInput = document.getElementById('file-input');
dropzone.addEventListener('click', async () => {
  // Используем showOpenFilePicker в Chromium и обычный <input> в остальных браузерах
  if (typeof window.showOpenFilePicker !== 'function'){
    fileInput.click();
    return;
  }
  try{
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'Видео', accept: { 'video/*': ['.mp4','.webm','.mov'] } }],
      multiple: false
    });
    const file = await handle.getFile();
    try{ await idbSet(fileKey(file), handle); } catch(err){}
    loadFile(file, handle);
  } catch(err){ /* пользователь закрыл диалог выбора файла */ }
});
fileInput.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  fileInput.value = '';
  if (!file) return;
  if (!isVideoFile(file)) {
    showErrMsg('Выберите видеофайл (.mp4, .webm, .mov)');
    return;
  }
  // Обычный <input> не предоставляет FileSystemFileHandle, поэтому для продолжения потребуется повторный выбор файла
  loadFile(file, null);
});

