// 09-url.js — Загрузка по ссылке: HLS, прямые ссылки, диагностика ошибок
// Часть Local Player. Файлы подключаются классическими <script> по порядку
// из index.html и делят общую область видимости — см. js/README.md
// --- Загрузка видео по URL (m3u8 и обычные ссылки) ---
let hls = null;
let urlErrorHandler = null;
let urlLoadToken = 0;

// Прямые ссылки (обычный <video>, без hls.js) полагаются только на события
// loadedmetadata/error браузера. Если соединение не рвётся и не отдаёт явную
// ошибку, а просто очень медленное ("плохой интернет" — сервер отдаёт байты
// по чуть-чуть, но не молчит совсем), ни одно из этих событий никогда не
// произойдёт — спиннер крутится бесконечно без единой подсказки пользователю.
// У HLS-веток и у CORS-фолбэка такой сторож уже есть, здесь его не было.
function armDirectLoadWatchdog(thisLoadToken){
  return setTimeout(() => {
    if (thisLoadToken !== urlLoadToken) return; // запущена уже другая попытка загрузки
    urlLoadingSpinner.style.display = 'none';
    urlLoadBtn.disabled = false;
    showUrlError('Не удалось загрузить видео: сервер слишком долго не отвечает. Проверьте соединение с интернетом или попробуйте другую ссылку', { duration: 20000 });
  }, 20000);
}

async function diagnoseVideoLoadError(url, fallbackMessage){
  try {
    const resp = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    if (resp.status === 404){
      return 'Ссылка больше не работает. Похоже, она устарела или файл был удалён с сервера';
    }
    if (resp.status >= 400){
      return `Сервер вернул ошибку ${resp.status}. Ссылка недоступна`;
    }
  } catch (e){
    // fetch не прошёл (CORS/сеть) — молча остаёмся на исходном сообщении
  }
  return fallbackMessage;
}

// Для реальной работы компрессора на ссылку сразу ставится crossOrigin='anonymous'
function retryWithoutCrossOriginOnError(url, thisLoadToken, onRecovered){
  if (video.crossOrigin !== 'anonymous') return false; // ошибка не из-за crossOrigin
  if (thisLoadToken !== urlLoadToken) return false; // запущена уже другая попытка загрузки

  video.removeAttribute('crossOrigin');
  // Не рвём граф, а переводим его в обход: иначе видео зависнет на 00:00 (баг C-1)
  bypassAudioGraph();
  drEnabled = false;
  drToggle.checked = false;
  showStorageToast('Компрессор и усиление недоступны для этой ссылки — сервер не поддерживает CORS. Само видео и звук работают как обычно');

  // Просто переприсвоить video.src тому же значению не всегда перезапускает
  // загрузку (браузер может решить, что источник не поменялся, и остаться
  // в состоянии "ошибка"/readyState 0 — видео тогда зависает на 0:00 без
  // единого события). video.load() явно перезапускает resource selection.
  video.src = url;
  video.load();

  let settled = false;

  // Страховочный таймаут: если после снятия crossOrigin браузер всё равно
  // не выдаёт ни loadedmetadata, ни error (молчаливое зависание), не оставляем
  // пользователя смотреть на пустой экран/спиннер вечно.
  const hangTimeout = setTimeout(() => {
    if (settled || thisLoadToken !== urlLoadToken) return;
    settled = true;
    urlLoadingSpinner.style.display = 'none';
    urlLoadBtn.disabled = false;
    showUrlError('Не удалось загрузить видео (сервер не отвечает после повторной попытки без CORS)', { duration: 20000 });
  }, 12000);

  video.addEventListener('loadedmetadata', function(){
    if (settled) return;
    settled = true;
    clearTimeout(hangTimeout);
    urlLoadingSpinner.style.display = 'none';
    urlLoadBtn.disabled = false;
    onRecovered();
  }, { once: true });
  video.addEventListener('error', urlErrorHandler = function(){
    if (settled) return;
    settled = true;
    clearTimeout(hangTimeout);
    urlLoadingSpinner.style.display = 'none';
    urlLoadBtn.disabled = false;
    const fallback = 'Не удалось загрузить видео';
    showUrlError(fallback, { duration: 20000 });
    diagnoseVideoLoadError(url, fallback).then(msg => {
      if (thisLoadToken !== urlLoadToken) return;
      if (msg !== fallback) showUrlError(msg, { duration: 20000 });
    });
  }, { once: true });
  return true;
}

// Опознаёт HLS-манифест по ответу сервера. Расширения `.m3u8` может не быть вовсе:
// многие CDN отдают манифест по адресу вида /hls/12345/master?token=... Раньше такая
// ссылка уходила напрямую в <video>, hls.js не подключался и живой поток выглядел
// мёртвым (баг H-3). При любой сетевой ошибке (CORS, оффлайн) возвращаем false,
// чтобы не менять прежнее поведение.
async function sniffHlsManifest(url){
  // Сначала пробуем забрать только первый килобайт, а если сервер спотыкается на
  // Range-запросе — повторяем обычным GET. Без этого достаточно одного кривого
  // сервера, чтобы манифест перестал опознаваться (нашлось при прогоне тестов).
  const res = await fetchManifestHead(url, true) || await fetchManifestHead(url, false);
  if (!res) return false;
  const { ct, head } = res;
  if (ct.includes('mpegurl')) return true;
  if (ct.startsWith('video/') || ct.startsWith('audio/')) return false;
  return /^\uFEFF?#EXTM3U/.test(head.trim());
}

async function fetchManifestHead(url, useRange){
  try{
    const res = await fetch(url, useRange ? { headers: { Range: 'bytes=0-1023' } } : undefined);
    if (!res.ok && res.status !== 206) return null;
    const ct = (res.headers.get('Content-Type') || '').toLowerCase();
    // Тип уже всё говорит — тело читать незачем
    if (ct.includes('mpegurl') || ct.startsWith('video/') || ct.startsWith('audio/')){
      if (res.body && res.body.cancel) res.body.cancel().catch(() => {});
      return { ct, head: '' };
    }
    return { ct, head: (await res.text()).slice(0, 1024) };
  } catch(e){
    return null;
  }
}

async function loadUrl(url){
  if (urlErrorHandler){
    video.removeEventListener('error', urlErrorHandler);
    urlErrorHandler = null;
  }
  urlLoadToken++;
  const thisLoadToken = urlLoadToken;

  // Копипаста из мессенджеров регулярно тащит пробелы и переводы строк, а без
  // trim одна и та же ссылка порождала две разные записи прогресса (баг M-16)
  url = String(url || '').trim();
  if (url === ''){
    showUrlError('Введите ссылку');
    return;
  }
  // Ссылку без схемы («example.com/v.mp4») раньше отвергали как некорректную,
  // хотя это самая частая ошибка вставки (баг L-1). Подставляем https:// только
  // если строка действительно похожа на адрес: без пробелов и с доменом или
  // хостом с портом — иначе произвольный текст превращался бы в «мёртвую» ссылку
  // вместо честного «Некорректная ссылка».
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)){
    const looksLikeHost = !/\s/.test(url) && /^(?:[\w-]+\.)+[a-z]{2,}(?:[:/?#]|$)|^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:[/?#]|$)|^localhost(?::\d+)?(?:[/?#]|$)/i.test(url);
    if (!looksLikeHost){
      showUrlError('Некорректная ссылка');
      return;
    }
    url = 'https://' + url;
  }

  // Показываем индикатор загрузки
  urlLoadingSpinner.style.display = 'inline-block';
  urlLoadBtn.disabled = true;

  // Очищаем предыдущие ошибки
  urlInput.classList.remove('error');
  hideErrMsg();
  videoErrorEl.style.display = 'none';
  hideBufferingIndicator();
  stopProgressTracking();

  // Сбрасываем главы от предыдущего видео (сами новые читаем чуть ниже,
  // как только понятно, что это не m3u8-поток).
  resetMediaChapters();

  // Проверяем валидность URL и сохраняем результат для дальнейшего использования
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (e){
    showUrlError('Некорректная ссылка');
    return;
  }

  // Определяем тип видео по расширения (используем pathname, чтобы query-параметры не мешали)
  let isM3U8 = /\.m3u8$/i.test(parsedUrl.pathname);
  const isDirectVideo = /\.(mp4|webm|mov)$/i.test(parsedUrl.pathname);

  // Расширения `.m3u8` может не быть вовсе: многие CDN отдают манифест по адресу
  // вида /hls/12345/master?token=... Раньше такая ссылка уходила напрямую в <video>,
  // hls.js не подключался и живой поток выглядел мёртвым (баг H-3). Пробуем опознать
  // манифест по Content-Type и сигнатуре #EXTM3U в первых байтах. Если сервер закрыт
  // CORS-ом и проба не удалась — молча остаёмся на прежней эвристике по расширению.
  if (!isM3U8 && !isDirectVideo){
    const sniffed = await sniffHlsManifest(url);
    if (thisLoadToken !== urlLoadToken) return;   // пользователь уже открыл другой источник
    if (sniffed) isM3U8 = true;
  }

  
  // Если расширения нет, но ссылка в принципе может оказаться видео — пробуем
  // загрузить её как прямую ссылку и даём браузеру самому решить, воспроизводимо
  // ли это. Раньше здесь был закрытый список из 5 слов-триггеров (okcdn.ru,
  // vkvideo.cloud, cdn, /download, /file) — всё, что в него не попадало,
  // отклонялось мгновенно, даже не попытавшись. Это ломало типичные подписанные
  // ссылки без расширения у S3/GCS/Bunny CDN/Cloudflare R2 и самописных
  // медиа-бэкендов. Теперь эвристика запретительная только для расширений,
  // которые точно не видео (html, json, картинки и т.п.) — во всех остальных
  // случаях мы всё равно пробуем.
  const NON_VIDEO_EXTENSION = /\.(html?|json|xml|txt|jpe?g|png|gif|webp|svg|css|js|php|aspx?)$/i;
  const isFileLike = !isM3U8 && !isDirectVideo && !NON_VIDEO_EXTENSION.test(parsedUrl.pathname);

  // Главы читаем только для того, что реально окажется прямым видеофайлом: раньше
  // разбор стартовал до классификации и качал куски даже для ссылок, которые тут же
  // отвергались как «Неподдерживаемый формат» (баг M-18).
  if (isDirectVideo || isFileLike){
    parseChaptersFromUrl(url, chapterParseToken);
  }

  // Останавливаем предыдущий HLS экземпляр
  if (hls){
    hls.destroy();
    hls = null;
  }

  justEndedKey = null;
  migrateLegacyUrlKey(url);
  currentFileKey = urlKey(url);
  originalFileName = getFileNameFromUrl(url); // Сохраняем исходное имя из URL
  currentFileName = niceTitleFromFilename(getFileNameFromUrl(url)); // Отображаемое имя без расширения
  
  // Пытаемся получить оригинальное имя файла из Content-Disposition заголовка
  getOriginalFileNameFromUrl(url).then(originalName => {
    if (originalName && originalName !== originalFileName) {
      originalFileName = originalName;
      currentFileName = niceTitleFromFilename(originalName);
      // Обновляем отображение имени в UI
      fnameEl.textContent = currentFileName;
      ovTitle.textContent = currentFileName;
      titleInput.value = currentFileName;
    }
  }).catch(() => {
    // Если не удалось получить оригинальное имя, используем имя из URL
  });

  // Устанавливаем crossOrigin ДО установки src для HTTPS-ссылок
  // Это нужно для корректной работы Web Audio API и избежания гонки условий
  if (!isM3U8) {
    video.crossOrigin = 'anonymous';
  }

  let videoInitialized = false;

  if (isM3U8 && typeof Hls === 'undefined'){
    // hls.js не загружен (CDN недоступен)
    if (video.canPlayType('application/vnd.apple.mpegurl')){
      // Попробуем native HLS
      video.src = url;
      videoInitialized = true;
      video.addEventListener('loadedmetadata', function(){
        urlLoadingSpinner.style.display = 'none';
        urlLoadBtn.disabled = false;
        restoreProgress();
      }, { once: true });
      video.addEventListener('error', urlErrorHandler = function(){
        urlLoadingSpinner.style.display = 'none';
        urlLoadBtn.disabled = false;
        showUrlError('Браузер не поддерживает m3u8 без hls.js библиотеки');
      }, { once: true });
    } else {
      urlLoadingSpinner.style.display = 'none';
      urlLoadBtn.disabled = false;
      showUrlError('Браузер не поддерживает m3u8 и hls.js библиотека не загружена');
    }
    return;
  }

  if (isM3U8 && typeof Hls !== 'undefined' && Hls.isSupported()){
    // HLS поддержка через hls.js
    try {
      hls = new Hls({
        enableWorker: true,
        maxBufferLength: 30,
        maxMaxBufferLength: 60
      });
      // Локальная ссылка на именно этот экземпляр — нужна, чтобы отложенные
      // ретраи ниже не трогали чужой/уже уничтоженный hls, если пользователь
      // успел уйти со страницы плеера (нажал "Назад") до срабатывания таймера.
      const hlsInstance = hls;
      
      // Счётчик попыток ретрая для NETWORK_ERROR
      let retryCount = 0;
      const MAX_RETRIES = 3;

      hls.loadSource(url);
      hls.attachMedia(video);

      // Таймаут-"сторож" для начальной загрузки/каждого ретрая. Раньше он
      // ставился один раз на 15 сек и снимался при ЛЮБОМ error-событии — даже
      // нефатальном или таком, после которого запускается ретрай. Из-за этого
      // могло возникать вечное зависание без единой ошибки на экране: сторож
      // уже снят, а MANIFEST_PARSED так и не наступает. Теперь таймаут заново
      // взводится на каждый ретрай и снимается только когда мы окончательно
      // либо успешно загрузились, либо сдались.
      let loadTimeout = null;
      function armLoadTimeout(ms){
        clearTimeout(loadTimeout);
        loadTimeout = setTimeout(() => {
          if (hls !== hlsInstance) return;
          urlLoadingSpinner.style.display = 'none';
          urlLoadBtn.disabled = false;
          showUrlError('Не удалось загрузить видео. Возможно, поток недоступен', { duration: 20000 });
          hlsInstance.destroy();
          hls = null;
        }, ms);
      }
      armLoadTimeout(15000);

      hls.on(Hls.Events.MANIFEST_PARSED, function(){
        clearTimeout(loadTimeout);
        urlLoadingSpinner.style.display = 'none';
        urlLoadBtn.disabled = false;
        showPlayer();
        
        // Показываем подсказку о стабилизации звука для HLS
        showAudioHint();
        video.play().catch(e => {
          if (e.name === 'NotAllowedError') {
            console.log('Autoplay prevented - user interaction required');
          } else {
            console.warn('Play error:', e);
          }
        });
      });

      hls.on(Hls.Events.ERROR, function(event, data){
        // Нефатальные ошибки (обычные для HLS-потоков — отдельный битый сегмент
        // и т.п.) hls.js обрабатывает сам; они не должны снимать сторожевой
        // таймаут и не должны прятать спиннер загрузки.
        if (!data.fatal) return;

        switch (data.type){
          case Hls.ErrorTypes.NETWORK_ERROR:
            // Более детальные сообщения на основе data.details
            {
              let errorMessage = 'Встраиваемая ссылка недоступна';
              const isManifestError = data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR ||
                  data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT ||
                  data.details === Hls.ErrorDetails.MANIFEST_PARSING_ERROR;
              if (isManifestError) {
                errorMessage = 'Не удалось загрузить манифест. Проверьте ссылку или наличие CORS';
              } else if (data.details === Hls.ErrorDetails.KEY_LOAD_ERROR) {
                errorMessage = 'Не удалось загрузить ключ шифрования потока';
              } else if (data.details === Hls.ErrorDetails.LEVEL_LOAD_ERROR) {
                errorMessage = 'Не удалось загрузить список качеств';
              } else if (data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR) {
                errorMessage = 'Не удалось загрузить сегмент видео';
              }

              // Если это CORS ошибка (смотрим в response текст или проверяем origin)
              if (data.response && data.response.code === 0) {
                // CORS ошибка - нет доступа к ответу
                clearTimeout(loadTimeout);
                urlLoadingSpinner.style.display = 'none';
                urlLoadBtn.disabled = false;
                hlsInstance.destroy();
                hls = null;
                showUrlError('Сайт-источник запрещает встраивание в другие страницы/плееры. Доступ заблокирован на стороне сервера', { duration: 20000 });
                return;
              }

              // 404 — ссылка мертва (истекла/удалена)
              if (data.response && data.response.code === 404) {
                clearTimeout(loadTimeout);
                urlLoadingSpinner.style.display = 'none';
                urlLoadBtn.disabled = false;
                hlsInstance.destroy();
                hls = null;
                showUrlError('Ссылка больше не работает. Похоже, она устарела или файл был удалён с сервера', { duration: 20000 });
                return;
              }

              // 410 — ресурс Gone (был, но удалён)
              if (data.response && data.response.code === 410) {
                clearTimeout(loadTimeout);
                urlLoadingSpinner.style.display = 'none';
                urlLoadBtn.disabled = false;
                hlsInstance.destroy();
                hls = null;
                showUrlError('Ссылка больше не работает. Похоже, она устарела или файл был удалён с сервера', { duration: 20000 });
                return;
              }

              if (retryCount < MAX_RETRIES) {
                retryCount++;
                const delay = Math.pow(2, retryCount - 1) * 1000; // Экспоненциальная задержка: 1с, 2с, 4с
                // Спиннер и сторож остаются активными на время ретрая — пользователь
                // видит, что попытка ещё идёт, а не пустой экран без обратной связи.
                armLoadTimeout(delay + 15000);
                setTimeout(() => {
                  if (hls !== hlsInstance) return; // плеер уже закрыт/переключён — ничего не делаем
                  try {
                    // Манифест мог вообще не загрузиться ни разу — startLoad()
                    // в этом случае ничего не перезапускает (он лишь возобновляет
                    // уже налаженную загрузку фрагментов/уровней). Для ошибок
                    // уровня манифеста нужен полноценный повторный loadSource().
                    if (isManifestError) {
                      hlsInstance.loadSource(url);
                    } else {
                      hlsInstance.startLoad();
                    }
                  } catch (e) {
                    clearTimeout(loadTimeout);
                    urlLoadingSpinner.style.display = 'none';
                    urlLoadBtn.disabled = false;
                    hlsInstance.destroy();
                    hls = null;
                    showUrlError(errorMessage, { duration: 20000 });
                  }
                }, delay);
              } else {
                // Лимит попыток исчерпан
                clearTimeout(loadTimeout);
                urlLoadingSpinner.style.display = 'none';
                urlLoadBtn.disabled = false;
                hlsInstance.destroy();
                hls = null;
                showUrlError(errorMessage, { duration: 20000 });
              }
            }
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            setTimeout(() => {
              if (hls !== hlsInstance) return;
              try {
                hlsInstance.recoverMediaError();
              } catch (e) {
                clearTimeout(loadTimeout);
                urlLoadingSpinner.style.display = 'none';
                urlLoadBtn.disabled = false;
                hlsInstance.destroy();
                hls = null;
                showUrlError('Не удалось восстановить воспроизведение', { duration: 20000 });
              }
            }, 1000);
            break;
          default:
            // Более детальные сообщения для default-ветки
            {
              clearTimeout(loadTimeout);
              urlLoadingSpinner.style.display = 'none';
              urlLoadBtn.disabled = false;
              let errorMessage = ' Ссылка может быть недоступной или неправильной';
              if (data.details === Hls.ErrorDetails.MANIFEST_PARSING_ERROR) {
                errorMessage = ' Манифест повреждён или имеет неправильный формат.';
              } else if (data.details === Hls.ErrorDetails.MANIFEST_INCOMPATIBLE_CODECS_ERROR) {
                errorMessage = ' Видео использует неподдерживаемые кодеки.';
              }
              showUrlError(errorMessage, { duration: 20000 });
              hlsInstance.destroy();
              hls = null;
            }
            break;
        }
      });
      
      // Общая инициализация для ветки с hls.js
      loadUrlCommonInit();
      return;
    } catch (e){
      urlLoadingSpinner.style.display = 'none';
      urlLoadBtn.disabled = false;
      showUrlError('Ошибка загрузки');
    }
  } else if (video.canPlayType('application/vnd.apple.mpegurl') && isM3U8){
    // Native HLS (Safari)
    video.src = url;
    const directLoadTimeout = armDirectLoadWatchdog(thisLoadToken);
    video.addEventListener('loadedmetadata', function(){
      clearTimeout(directLoadTimeout);
      urlLoadingSpinner.style.display = 'none';
      urlLoadBtn.disabled = false;
      showPlayer();
      video.play().catch(e => {
        if (e.name === 'NotAllowedError') {
          console.log('Autoplay prevented - user interaction required');
        } else {
          console.warn('Play error:', e);
        }
      });
    }, { once: true });

    video.addEventListener('error', urlErrorHandler = function(){
      clearTimeout(directLoadTimeout);
      if (retryWithoutCrossOriginOnError(url, thisLoadToken, () => {
        showPlayer();
        video.play().catch(e => {
          if (e.name === 'NotAllowedError') {
            console.log('Autoplay prevented - user interaction required');
          } else {
            console.warn('Play error:', e);
          }
        });
      })) return;
      urlLoadingSpinner.style.display = 'none';
      urlLoadBtn.disabled = false;
      const fallback = 'Не удалось загрузить видео';
      showUrlError(fallback, { duration: 20000 });
      diagnoseVideoLoadError(url, fallback).then(msg => {
        if (thisLoadToken !== urlLoadToken) return; // запущена новая попытка загрузки — не мешаем ей
        if (msg !== fallback) showUrlError(msg, { duration: 20000 });
      });
    }, { once: true });
    
    // Общая инициализация для этой ветки
    loadUrlCommonInit();
    return;
  } else if (isFileLike){
    // Ссылка похожа на файл (CDN без расширения, но с параметрами файла)
    // Пробуем загрузить как прямую ссылку на видео
    video.src = url;
    const directLoadTimeout = armDirectLoadWatchdog(thisLoadToken);
    video.addEventListener('loadedmetadata', function(){
      clearTimeout(directLoadTimeout);
      urlLoadingSpinner.style.display = 'none';
      urlLoadBtn.disabled = false;
      showPlayer();
      video.play().catch(e => {
        if (e.name === 'NotAllowedError') {
          console.log('Autoplay prevented - user interaction required');
        } else {
          console.warn('Play error:', e);
        }
      });
    }, { once: true });

    video.addEventListener('error', urlErrorHandler = function(){
      clearTimeout(directLoadTimeout);
      if (retryWithoutCrossOriginOnError(url, thisLoadToken, () => {
        showPlayer();
        video.play().catch(e => {
          if (e.name === 'NotAllowedError') {
            console.log('Autoplay prevented - user interaction required');
          } else {
            console.warn('Play error:', e);
          }
        });
      })) return;
      urlLoadingSpinner.style.display = 'none';
      urlLoadBtn.disabled = false;
      const fallback = 'Не удалось загрузить видео. Возможно, ссылка недоступна';
      showUrlError(fallback, { duration: 20000 });
      diagnoseVideoLoadError(url, fallback).then(msg => {
        if (thisLoadToken !== urlLoadToken) return; // запущена новая попытка загрузки — не мешаем ей
        if (msg !== fallback) showUrlError(msg, { duration: 20000 });
      });
    }, { once: true });

    // Общая инициализация для этой ветки
    loadUrlCommonInit();
    return;
  } else if (isDirectVideo || isM3U8){
    // Прямая ссылка на видео или m3u8 без поддержки HLS
    video.src = url;
    const directLoadTimeout = armDirectLoadWatchdog(thisLoadToken);
    video.addEventListener('loadedmetadata', function(){
      clearTimeout(directLoadTimeout);
      urlLoadingSpinner.style.display = 'none';
      urlLoadBtn.disabled = false;
      showPlayer();
      video.play().catch(e => {
        if (e.name === 'NotAllowedError') {
          console.log('Autoplay prevented - user interaction required');
        } else {
          console.warn('Play error:', e);
        }
      });
    }, { once: true });

    video.addEventListener('error', urlErrorHandler = function(){
      clearTimeout(directLoadTimeout);
      if (!isM3U8 && retryWithoutCrossOriginOnError(url, thisLoadToken, () => {
        showPlayer();
        video.play().catch(e => {
          if (e.name === 'NotAllowedError') {
            console.log('Autoplay prevented - user interaction required');
          } else {
            console.warn('Play error:', e);
          }
        });
      })) return;
      urlLoadingSpinner.style.display = 'none';
      urlLoadBtn.disabled = false;
      if (isM3U8){
        showUrlError('Браузер не поддерживает m3u8', { duration: 20000 });
      } else {
        const fallback = 'Не удалось загрузить видео';
        showUrlError(fallback, { duration: 20000 });
        diagnoseVideoLoadError(url, fallback).then(msg => {
          if (thisLoadToken !== urlLoadToken) return; // запущена новая попытка загрузки — не мешаем ей
          if (msg !== fallback) showUrlError(msg, { duration: 20000 });
        });
      }
    }, { once: true });
    
    // Общая инициализация для этой ветки
    loadUrlCommonInit();
    return;
  } else {
    showUrlError('Неподдерживаемый формат');
    return;
  }
}

// Общая инициализация для всех веток loadUrl()
function loadUrlCommonInit(){
  // Загружаем настройки для URL (если есть)
  const hasSettings = loadSettings();
  if (!hasSettings){
    applyDefaultSettingsForNewSource();
  }

  if (!hasSettings){
    titleInput.value = currentFileName;
  }
  fnameEl.textContent = currentFileName;
  ovTime.textContent = '00:00 / 00:00';
  applyOverlaySettings();

  if (loadedMetadataHandler){
    video.removeEventListener('loadedmetadata', loadedMetadataHandler);
  }
  loadedMetadataHandler = () => {
    // Обновляем время при загрузке метаданных
    const txt = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
    ovTime.textContent = txt;
    timeDisplay.textContent = txt;

    // Не применяем fixInfiniteDuration для HLS потоков - hls.js сам управляет live-потоками
    if (!hls) {
      fixInfiniteDuration(() => {
        restoreProgress();
      });
    } else {
      restoreProgress();
    }
  };
  video.addEventListener('loadedmetadata', loadedMetadataHandler, { once: true });
  if (durationChangeHandler){
    video.removeEventListener('durationchange', durationChangeHandler);
  }
  durationChangeHandler = () => {
    updateSeekControlsState();
  };
  video.addEventListener('durationchange', durationChangeHandler, { once: true });

  // Очищаем старый аудио-граф перед созданием нового
  destroyAudioGraph();
  // Реально применяем состояние компрессора для этой ссылки, а не только чекбокс
  reapplyCompressorState();
}

let urlInputErrorTimeout = null;
function showUrlError(message, opts = {}){
  urlLoadingSpinner.style.display = 'none';
  urlLoadBtn.disabled = false;
  urlInput.classList.add('error');
  clearTimeout(urlInputErrorTimeout);
  // 8 секунд мало: пользователь мог отойти от экрана, пока шла загрузка, и вернуться
  // к пустой форме, не поняв причины (баг L-13)
  const duration = opts.duration || 20000;
  urlInputErrorTimeout = setTimeout(() => urlInput.classList.remove('error'), duration);
  showErrMsg(message, opts);
}

function getFileNameFromUrl(url){
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    let filename = pathname.split('/').pop();
    // Удаляем query параметры если они есть
    const queryIndex = filename.indexOf('?');
    if (queryIndex !== -1) {
      filename = filename.substring(0, queryIndex);
    }
    // Декодируем URL-encoded символы (для русских названий в ссылках)
    try {
      filename = decodeURIComponent(filename);
    } catch (e) {
      // Если декодирование не удалось, оставляем как есть
    }
    return filename || 'Видео из URL';
  } catch (e){
    return 'Видео из URL';
  }
}

// Извлекает оригинальное имя файла из заголовка Content-Disposition
async function getOriginalFileNameFromUrl(url){
  try {
    const response = await fetch(url, { method: 'HEAD' });
    if (!response.ok) return null;
    
    const contentDisposition = response.headers.get('Content-Disposition');
    if (!contentDisposition) return null;
    
    // Парсим Content-Disposition: inline; filename*=UTF-8''encoded_name
    const match = /filename\*=UTF-8''(.+)/i.exec(contentDisposition);
    if (match) {
      try {
        return decodeURIComponent(match[1]);
      } catch (e) {
        return null;
      }
    }
    
    // Fallback для обычного filename
    const simpleMatch = /filename="?([^"]+)"?/i.exec(contentDisposition);
    if (simpleMatch) {
      return simpleMatch[1];
    }
    
    return null;
  } catch (e) {
    return null;
  }
}

function showPlayer(){
  // Заголовок (fnameEl/ovTitle) уже корректно выставлен выше по коду loadUrl()
  // (восстановленное кастомное имя или "красивое" имя из URL) — здесь его
  // больше не перезаписываем сырым currentFileName, иначе переименование
  // и форматирование теряются сразу после загрузки видео по ссылке.
  dropView.style.display = 'none';
  playerView.classList.add('active');
  startProgressTracking();
  // Не создаём аудио-граф автоматически - только при включении аудио-фич пользователем
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}
