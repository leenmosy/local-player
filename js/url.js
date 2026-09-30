// --- Загрузка видео по URL (m3u8 и обычные ссылки) ---
let hls = null;
let urlErrorHandler = null;
let urlLoadedHandler = null;
let urlLoadToken = 0;

// Снимает слушатели и сторожевые таймеры незавершённой загрузки по ссылке,
// чтобы её результат не догнал уже другой открытый источник
function cancelPendingUrlLoad(){
  urlLoadToken++;
  if (urlErrorHandler){
    video.removeEventListener('error', urlErrorHandler);
    urlErrorHandler = null;
  }
  if (urlLoadedHandler){
    video.removeEventListener('loadedmetadata', urlLoadedHandler);
    urlLoadedHandler = null;
  }
  urlLoadingSpinner.style.display = 'none';
  urlLoadBtn.disabled = false;
}

function armDirectLoadWatchdog(thisLoadToken){
  return setTimeout(() => {
    if (thisLoadToken !== urlLoadToken) return; // запущена уже другая попытка загрузки
    urlLoadingSpinner.style.display = 'none';
    urlLoadBtn.disabled = false;
    showUrlError('Не удалось загрузить видео: сервер слишком долго не отвечает. Проверьте соединение с интернетом или попробуйте другую ссылку');
  }, 20000);
}

// Один HEAD-запрос на ссылку, переиспользуется всеми, кому нужны только заголовки
// (имя файла, размер для чтения глав). Сбрасывается в начале каждого loadUrl().
let _headCache = new Map();
function headRequest(url){
  if (_headCache.has(url)) return _headCache.get(url);
  const p = fetch(url, { method: 'HEAD' }).catch(err => { _headCache.delete(url); throw err; });
  _headCache.set(url, p);
  return p;
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
    // fetch не прошёл (CORS/сеть), молча остаёмся на исходном сообщении
  }
  return fallbackMessage;
}

// Для реальной работы компрессора на ссылку сразу ставится crossOrigin='anonymous'
function retryWithoutCrossOriginOnError(url, thisLoadToken, onRecovered){
  if (video.crossOrigin !== 'anonymous') return false; // ошибка не из-за crossOrigin
  if (thisLoadToken !== urlLoadToken) return false; // запущена уже другая попытка загрузки

  video.removeAttribute('crossOrigin');
  audioSourceTainted = true;
  bypassAudioGraph();

  video.src = url;
  video.load();

  let settled = false;

  // Страховочный таймаут: если после снятия crossOrigin браузер всё равно
  // не выдаёт ни loadedmetadata, ни error (молчаливое зависание), не оставляем
  // пользователя смотреть на пустой экран/спиннер вечно
  const hangTimeout = setTimeout(() => {
    if (settled || thisLoadToken !== urlLoadToken) return;
    settled = true;
    urlLoadingSpinner.style.display = 'none';
    urlLoadBtn.disabled = false;
    showUrlError('Не удалось загрузить видео (сервер не отвечает после повторной попытки без CORS)');
  }, 12000);

  video.addEventListener('loadedmetadata', urlLoadedHandler = function(){
    if (settled) return;
    settled = true;
    clearTimeout(hangTimeout);
    urlLoadingSpinner.style.display = 'none';
    urlLoadBtn.disabled = false;
    setAudioFeaturesAvailable(false);
    // Существующий MediaElementAudioSourceNode отдаёт по такому источнику тишину,
    // и снять его без перезагрузки страницы браузер не позволяет
    showStorageToast(audioCtx
      ? 'Сервер ссылки не поддерживает CORS. Звук будет доступен, если открыть эту ссылку сразу после перезагрузки страницы'
      : 'Компрессор и усиление недоступны для этой ссылки: сервер не поддерживает CORS. Видео и звук работают как обычно');
    onRecovered();
  }, { once: true });
  video.addEventListener('error', urlErrorHandler = function(){
    if (settled) return;
    settled = true;
    clearTimeout(hangTimeout);
    // Причина была не в CORS, возвращаем аудио-настройки в рабочее состояние
    audioSourceTainted = false;
    setAudioFeaturesAvailable(true);
    urlLoadingSpinner.style.display = 'none';
    urlLoadBtn.disabled = false;
    const fallback = 'Не удалось загрузить видео';
    showUrlError(fallback);
    diagnoseVideoLoadError(url, fallback).then(msg => {
      if (thisLoadToken !== urlLoadToken) return;
      if (msg !== fallback) showUrlError(msg);
    });
  }, { once: true });
  return true;
}

// Опознаёт HLS-манифест по ответу сервера
// чтобы не менять прежнее поведение.
async function sniffHlsManifest(url){
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
    // Тип уже всё говорит, тело читать незачем
    if (ct.includes('mpegurl') || ct.startsWith('video/') || ct.startsWith('audio/')){
      if (res.body && res.body.cancel) res.body.cancel().catch(() => {});
      return { ct, head: '' };
    }
    return { ct, head: (await res.text()).slice(0, 1024) };
  } catch(e){
    return null;
  }
}

async function loadUrl(url, meta){
  flushPendingSettings();
  cancelPendingUrlLoad();
  _headCache = new Map();
  const thisLoadToken = urlLoadToken;


  url = String(url || '').trim();
  if (url === ''){
    showUrlError('Вставьте ссылку');
    return;
  }

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
  hideStorageToast();
  hideInfoToast();
  hideCodecWarningToast();
  videoErrorEl.style.display = 'none';
  hideBufferingIndicator();
  stopProgressTracking();

  // Сбрасываем главы от предыдущего видео (сами новые читаем чуть ниже,
  // как только понятно, что это не m3u8-поток).
  resetMediaChapters();

  // Испорченность относится к источнику, а не к сессии, сбрасываем всегда: retryWithoutCrossOriginOnError() вернёт флаг если CORS правда нет
  audioSourceTainted = false;
  setAudioFeaturesAvailable(true);

  // Проверяем валидность URL и сохраняем результат для дальнейшего использования
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (e){
    showUrlError('Некорректная ссылка');
    return;
  }

  // Пускаем только сетевые схемы, javascript:/data:/file: в src ни к чему
  const ALLOWED_URL_PROTOCOLS = ['http:', 'https:', 'blob:'];
  if (!ALLOWED_URL_PROTOCOLS.includes(parsedUrl.protocol)){
    showUrlError('Поддерживаются только ссылки http и https');
    return;
  }

  // Манифест сериала разворачиваем в плейлист, дальше грузится уже конкретная серия
  if (/\.json$/i.test(parsedUrl.pathname)){
    await openSeriesPlaylist(url, thisLoadToken, meta && meta.startUrl);
    return;
  }

  // Прямая ссылка на серию тоже разворачивается в сериал, если её папка лежит рядом с series.json
  if (!playlistSeriesUrl && /\.m3u8$/i.test(parsedUrl.pathname)){
    const manifestUrl = await findSeriesManifestFor(url);
    if (thisLoadToken !== urlLoadToken) return;   // пользователь уже открыл другой источник
    if (manifestUrl){
      await openSeriesPlaylist(manifestUrl, thisLoadToken, url);
      return;
    }
  }

  // Определяем тип видео по расширения (используем pathname, чтобы query-параметры не мешали)
  let isM3U8 = /\.m3u8$/i.test(parsedUrl.pathname);
  const isDirectVideo = /\.(mp4|webm|mov)$/i.test(parsedUrl.pathname);

  const NON_VIDEO_EXTENSION = /\.(html?|json|xml|txt|jpe?g|png|gif|webp|svg|css|js|php|aspx?)$/i;
  const isFileLike = !isM3U8 && !isDirectVideo && !NON_VIDEO_EXTENSION.test(parsedUrl.pathname);

  // Для прямого видеофайла главы читаем сразу, параллельно со sniffHlsManifest
  if (isDirectVideo || isFileLike){
    parseChaptersFromUrl(url, chapterParseToken);
  }

  if (!isM3U8 && !isDirectVideo){
    const sniffed = await sniffHlsManifest(url);
    if (thisLoadToken !== urlLoadToken) return;   // пользователь уже открыл другой источник
    if (sniffed) isM3U8 = true;
  }

  // В сегментах HLS глав нет, читаем их из chapters.vtt рядом с плейлистом
  if (isM3U8){
    const chaptersUrl = url.split(/[?#]/)[0].replace(/[^/]+$/, 'chapters.vtt');
    parseChaptersFromVtt(chaptersUrl, chapterParseToken);
  }

  // Останавливаем предыдущий HLS экземпляр
  if (hls){
    hls.destroy();
    hls = null;
  }

  migrateLegacyUrlKey(url);
  currentFileKey = urlKey(url);
  progressRestoredKey = null; // то же видео открыто заново, его позиция ещё не прочитана
  currentSourceUrl = url;
  // Сбрасываем folder-поля, иначе они попадут от прошлого плейлиста в запись прогресса ссылки
  currentFileIsFolder = false;
  currentFolderName = null;
  currentFolderId = null;
  originalFileName = getFileNameFromUrl(url); // Сохраняем исходное имя из URL
  currentFileName = niceTitleFromFilename(getFileNameFromUrl(url)); // Отображаемое имя без расширения
  // Название серии знает только манифест сериала, из имени файла его не вывести
  const seriesTitle = meta && meta.title ? String(meta.title).trim().slice(0, MAX_TITLE_LEN) : '';
  if (seriesTitle){
    adoptTitleForStoredSettings(currentFileKey, currentFileName, seriesTitle);
    currentFileName = seriesTitle;
  }

  // Имя из Content-Disposition приходит асинхронно, запоминаем загрузку чтобы ответ не переименовал уже другой источник
  const titleLoadToken = thisLoadToken;
  const titleKey = currentFileKey;
  const titleAutoName = currentFileName;
  // У серии название уже есть, серверное имя запрашивать незачем
  if (!seriesTitle){
    getOriginalFileNameFromUrl(url).then(originalName => {
      if (titleLoadToken !== urlLoadToken || titleKey !== currentFileKey) return; // открыт уже другой источник
      if (!originalName || originalName === originalFileName) return;
      // Имя, заданное пользователем, важнее серверного
      if (storedCustomTitle(titleKey, titleAutoName)) return;
      originalFileName = originalName;
      currentFileName = niceTitleFromFilename(originalName);
      // Обновляем отображение имени в UI
      fnameEl.textContent = currentFileName;
      ovTitle.textContent = currentFileName;
      titleInput.value = currentFileName;
    }).catch(() => {
      // Если не удалось получить оригинальное имя, используем имя из URL
    });
  }

  // Устанавливаем crossOrigin ДО установки src для HTTPS-ссылок
  // Это нужно для корректной работы Web Audio API и избежания гонки условий
  if (!isM3U8) {
    video.crossOrigin = 'anonymous';
  } else {
    video.removeAttribute('crossOrigin');
  }

  let videoInitialized = false;

  if (isM3U8 && typeof Hls === 'undefined'){
    // hls.js не подгрузился (повреждённый деплой). Пробуем нативный HLS.
    if (video.canPlayType('application/vnd.apple.mpegurl')){
      video.src = url;
      videoInitialized = true;
      const directLoadTimeout = armDirectLoadWatchdog(thisLoadToken);
      video.addEventListener('loadedmetadata', urlLoadedHandler = function(){
        clearTimeout(directLoadTimeout);
        urlLoadingSpinner.style.display = 'none';
        urlLoadBtn.disabled = false;
        initAudioGraphForCurrentSource();
        showPlayer();
        safePlay();
      }, { once: true });
      video.addEventListener('error', urlErrorHandler = function(){
        clearTimeout(directLoadTimeout);
        urlLoadingSpinner.style.display = 'none';
        urlLoadBtn.disabled = false;
        showUrlError('Браузер не поддерживает m3u8 без библиотеки hls.js');
      }, { once: true });
      loadUrlCommonInit();
    } else {
      urlLoadingSpinner.style.display = 'none';
      urlLoadBtn.disabled = false;
      showUrlError('Браузер не поддерживает m3u8, а библиотека hls.js не загрузилась');
    }
    return;
  }

  if (isM3U8 && typeof Hls !== 'undefined' && Hls.isSupported()){
    // HLS поддержка через hls.js
    try {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false, // это VOD, режим низкой задержки только сокращает буфер
        maxBufferLength: 180, // целимся держать впереди 3 минуты как запас на просадки сети
        maxMaxBufferLength: 600, // при нехватке позволяем hls.js растянуть буфер сильнее
        maxBufferSize: 150 * 1000 * 1000, // верхний предел буфера по памяти, близко к лимиту браузера на медиа
        backBufferLength: 90, // просмотренный хвост храним только 90 секунд
        // Сегмент, которого нет на CDN, не появится от шести попыток за полминуты, трёх с короткой паузой достаточно
        fragLoadPolicy: { default: { maxTimeToFirstByteMs: 10000, maxLoadTimeMs: 120000,
          timeoutRetry: { maxNumRetry: 4, retryDelayMs: 0, maxRetryDelayMs: 0 },
          errorRetry: { maxNumRetry: 3, retryDelayMs: 1000, maxRetryDelayMs: 4000 } } }
      });
      // Локальная ссылка на именно этот экземпляр, нужна, чтобы отложенные
      // ретраи ниже не трогали чужой/уже уничтоженный hls, если пользователь
      // успел уйти со страницы плеера (нажал "Назад") до срабатывания таймера.
      const hlsInstance = hls;
      
      // Счётчик попыток ретрая для NETWORK_ERROR: паузы 1, 2, 4, 8, 16 с дают около полуминуты на возврат сети
      let retryCount = 0;
      const MAX_RETRIES = 5;

      // Предел для recoverMediaError(), иначе крутится вечно на чёрном экране без сообщения
      // Счётчик сбрасывается, если прошлый сбой был давно, чтобы одиночные глюки не копились
      let mediaRecoverCount = 0;
      let lastMediaErrorAt = 0;
      const MAX_MEDIA_RECOVERIES = 3;
      const MEDIA_ERROR_RESET_MS = 30000;

      hls.loadSource(url);
      hls.attachMedia(video);

      let loadTimeout = null;
      function armLoadTimeout(ms){
        clearTimeout(loadTimeout);
        loadTimeout = setTimeout(() => {
          if (hls !== hlsInstance) return;
          urlLoadingSpinner.style.display = 'none';
          urlLoadBtn.disabled = false;
          showPlaybackError('Не удалось загрузить видео. Возможно, поток недоступен');
          hlsInstance.destroy();
          hls = null;
        }, ms);
      }
      armLoadTimeout(15000);

      hls.on(Hls.Events.MANIFEST_PARSED, function(){
        clearTimeout(loadTimeout);
        urlLoadingSpinner.style.display = 'none';
        urlLoadBtn.disabled = false;
        initAudioGraphForCurrentSource();
        showPlayer();
        safePlay();
      });

      // Событие progress у media element с MSE ненадёжно, обновляем заливку буфера здесь
      hls.on(Hls.Events.BUFFER_APPENDED, updateSeekFill);

      hls.on(Hls.Events.ERROR, function(event, data){
        // Нефатальные ошибки (обычные для HLS-потоков, отдельный битый сегмент
        // и т.п.) hls.js обрабатывает сам; они не должны снимать сторожевой
        // таймаут и не должны прятать спиннер загрузки.
        if (!data.fatal) return;

        // Несовместимые кодеки hls.js помечает типом mediaError, ловим по details до switch чтобы не уйти в бесполезное восстановление
        if (data.details === Hls.ErrorDetails.MANIFEST_INCOMPATIBLE_CODECS_ERROR){
          clearTimeout(loadTimeout);
          urlLoadingSpinner.style.display = 'none';
          urlLoadBtn.disabled = false;
          hlsInstance.destroy();
          hls = null;
          showPlaybackError('Видео использует кодеки, которые не поддерживает браузер. Обычно это HEVC или AC-3, попробуйте другое качество или источник');
          return;
        }

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

              // Недоступный ключ и пропавший сегмент сервер отдаёт тем же 404, что и мёртвую ссылку, для них текст точнее
              const deadLinkMessage = data.details === Hls.ErrorDetails.KEY_LOAD_ERROR
                ? errorMessage
                : (data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR
                  ? 'На сервере нет части этого видео, дальше воспроизвести не получится'
                  : 'Ссылка больше не работает. Похоже, она устарела или файл был удалён с сервера');

              // Код 0 это и запрет CORS, и обрыв сети. Пока ничего не играло, это доступ, а посреди просмотра это сеть
              if (data.response && data.response.code === 0) {
                const playbackStarted = video.currentTime > 0 || video.readyState >= 2;
                if (!playbackStarted){
                  clearTimeout(loadTimeout);
                  urlLoadingSpinner.style.display = 'none';
                  urlLoadBtn.disabled = false;
                  hlsInstance.destroy();
                  hls = null;
                  showPlaybackError(navigator.onLine === false
                    ? 'Нет соединения с интернетом. Проверьте сеть и попробуйте снова'
                    : 'Сайт-источник запрещает встраивание в другие страницы/плееры. Доступ заблокирован на стороне сервера');
                  return;
                }
                errorMessage = 'Соединение с сервером прервалось. Проверьте интернет и откройте ссылку снова';
              }

              // 404: ссылка мертва (истекла/удалена)
              if (data.response && data.response.code === 404) {
                clearTimeout(loadTimeout);
                urlLoadingSpinner.style.display = 'none';
                urlLoadBtn.disabled = false;
                hlsInstance.destroy();
                hls = null;
                showPlaybackError(deadLinkMessage);
                return;
              }

              // 410: ресурс Gone (был, но удалён)
              if (data.response && data.response.code === 410) {
                clearTimeout(loadTimeout);
                urlLoadingSpinner.style.display = 'none';
                urlLoadBtn.disabled = false;
                hlsInstance.destroy();
                hls = null;
                showPlaybackError(deadLinkMessage);
                return;
              }

              if (retryCount < MAX_RETRIES) {
                retryCount++;
                const delay = Math.pow(2, retryCount - 1) * 1000; // Экспоненциальная задержка: 1с, 2с, 4с
                // Спиннер и сторож остаются активными на время ретрая, пользователь
                // видит, что попытка ещё идёт, а не пустой экран без обратной связи.
                armLoadTimeout(delay + 15000);
                setTimeout(() => {
                  if (hls !== hlsInstance) return; // плеер уже закрыт/переключён, ничего не делаем
                  try {
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
                    showPlaybackError(errorMessage);
                  }
                }, delay);
              } else {
                // Лимит попыток исчерпан
                clearTimeout(loadTimeout);
                urlLoadingSpinner.style.display = 'none';
                urlLoadBtn.disabled = false;
                hlsInstance.destroy();
                hls = null;
                showPlaybackError(errorMessage);
              }
            }
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            {
              const nowMs = Date.now();
              // Давняя прошлая ошибка не считается частью текущей серии сбоев
              if (nowMs - lastMediaErrorAt > MEDIA_ERROR_RESET_MS) mediaRecoverCount = 0;
              lastMediaErrorAt = nowMs;

              if (mediaRecoverCount >= MAX_MEDIA_RECOVERIES){
                clearTimeout(loadTimeout);
                urlLoadingSpinner.style.display = 'none';
                urlLoadBtn.disabled = false;
                hlsInstance.destroy();
                hls = null;
                showPlaybackError('Не удалось восстановить воспроизведение: поток повреждён или использует неподдерживаемый кодек');
                break;
              }
              mediaRecoverCount++;
              const attempt = mediaRecoverCount;
              setTimeout(() => {
                if (hls !== hlsInstance) return;
                try {
                  // Со второй попытки пробуем ещё и сменить аудиокодек, как советует hls.js
                  if (attempt >= 2 && typeof hlsInstance.swapAudioCodec === 'function') hlsInstance.swapAudioCodec();
                  hlsInstance.recoverMediaError();
                } catch (e) {
                  clearTimeout(loadTimeout);
                  urlLoadingSpinner.style.display = 'none';
                  urlLoadBtn.disabled = false;
                  hlsInstance.destroy();
                  hls = null;
                  showPlaybackError('Не удалось восстановить воспроизведение');
                }
              }, 1000);
            }
            break;
          default:
            // Более детальные сообщения для default-ветки
            {
              clearTimeout(loadTimeout);
              urlLoadingSpinner.style.display = 'none';
              urlLoadBtn.disabled = false;
              let errorMessage = 'Ссылка недоступна или неправильная';
              if (data.details === Hls.ErrorDetails.MANIFEST_PARSING_ERROR) {
                errorMessage = 'Манифест повреждён или имеет неправильный формат';
              } else if (data.details === Hls.ErrorDetails.MANIFEST_INCOMPATIBLE_CODECS_ERROR) {
                errorMessage = 'Видео использует неподдерживаемые кодеки';
              }
              showPlaybackError(errorMessage);
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
    video.addEventListener('loadedmetadata', urlLoadedHandler = function(){
      clearTimeout(directLoadTimeout);
      urlLoadingSpinner.style.display = 'none';
      urlLoadBtn.disabled = false;
      initAudioGraphForCurrentSource();
      showPlayer();
      safePlay();
    }, { once: true });

    // Для m3u8 crossOrigin не выставляется, поэтому ретрай без него здесь не нужен
    video.addEventListener('error', urlErrorHandler = function(){
      clearTimeout(directLoadTimeout);
      urlLoadingSpinner.style.display = 'none';
      urlLoadBtn.disabled = false;
      const fallback = 'Не удалось загрузить видео';
      showUrlError(fallback);
      diagnoseVideoLoadError(url, fallback).then(msg => {
        if (thisLoadToken !== urlLoadToken) return; // запущена новая попытка загрузки, не мешаем ей
        if (msg !== fallback) showUrlError(msg);
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
    video.addEventListener('loadedmetadata', urlLoadedHandler = function(){
      clearTimeout(directLoadTimeout);
      urlLoadingSpinner.style.display = 'none';
      urlLoadBtn.disabled = false;
      initAudioGraphForCurrentSource();
      showPlayer();
      safePlay();
    }, { once: true });

    video.addEventListener('error', urlErrorHandler = function(){
      clearTimeout(directLoadTimeout);
      if (retryWithoutCrossOriginOnError(url, thisLoadToken, () => {
        showPlayer();
        safePlay();
      })) return;
      urlLoadingSpinner.style.display = 'none';
      urlLoadBtn.disabled = false;
      const fallback = 'Не удалось загрузить видео. Возможно, ссылка недоступна';
      showUrlError(fallback);
      diagnoseVideoLoadError(url, fallback).then(msg => {
        if (thisLoadToken !== urlLoadToken) return; // запущена новая попытка загрузки, не мешаем ей
        if (msg !== fallback) showUrlError(msg);
      });
    }, { once: true });

    // Общая инициализация для этой ветки
    loadUrlCommonInit();
    return;
  } else if (isDirectVideo || isM3U8){
    // Прямая ссылка на видео или m3u8 без поддержки HLS
    video.src = url;
    const directLoadTimeout = armDirectLoadWatchdog(thisLoadToken);
    video.addEventListener('loadedmetadata', urlLoadedHandler = function(){
      clearTimeout(directLoadTimeout);
      urlLoadingSpinner.style.display = 'none';
      urlLoadBtn.disabled = false;
      initAudioGraphForCurrentSource();
      showPlayer();
      safePlay();
    }, { once: true });

    video.addEventListener('error', urlErrorHandler = function(){
      clearTimeout(directLoadTimeout);
      if (!isM3U8 && retryWithoutCrossOriginOnError(url, thisLoadToken, () => {
        showPlayer();
        safePlay();
      })) return;
      urlLoadingSpinner.style.display = 'none';
      urlLoadBtn.disabled = false;
      if (isM3U8){
        showUrlError('Браузер не поддерживает m3u8');
      } else {
        const fallback = 'Не удалось загрузить видео';
        showUrlError(fallback);
        diagnoseVideoLoadError(url, fallback).then(msg => {
          if (thisLoadToken !== urlLoadToken) return; // запущена новая попытка загрузки, не мешаем ей
          if (msg !== fallback) showUrlError(msg);
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
    const txt = formatTimePair(video.currentTime, video.duration);
    ovTime.textContent = txt;
    timeDisplay.textContent = txt;

    dropForeignSettings();

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

  destroyAudioGraph();
  autoLoadHlsSubtitles();
  autoLoadHlsBlurRanges();
}

// Тайминги из blur.txt подгоняются под длительность, как только она известна (сама подгонка в blur.js)
video.addEventListener('durationchange', clampBlurFileRanges);

// Сообщение об ошибке потока: #err-msg лежит на стартовом экране и в плеере не виден
function showPlaybackError(message){
  if (playerView.classList.contains('active')){
    videoErrorEl.innerHTML = '<div class="ve-title">Не удалось воспроизвести поток</div>'
      + '<div class="ve-detail">' + escapeHtml(message) + '</div>';
    videoErrorEl.style.display = 'flex';
  }
  showUrlError(message);
}

let urlInputErrorTimeout = null;
function showUrlError(message, opts = {}){
  urlLoadingSpinner.style.display = 'none';
  urlLoadBtn.disabled = false;
  urlInput.classList.add('error');
  clearTimeout(urlInputErrorTimeout);
  const duration = opts.duration || 8000;
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
    const response = await headRequest(url);
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
  // (восстановленное кастомное имя или "красивое" имя из URL), здесь его
  // больше не перезаписываем сырым currentFileName, иначе переименование
  // и форматирование теряются сразу после загрузки видео по ссылке.
  dropView.style.display = 'none';
  playerView.classList.add('active');
  pushPlayerHistory();
  startProgressTracking();
  // Не создаём аудио-граф автоматически - только при включении аудио-фич пользователем
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

