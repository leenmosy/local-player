// Временная диагностика геометрии: включается через localStorage.debuggeo = '1', убирается удалением ключа
(function(){
  if (!localStorage.getItem('debuggeo')) return;
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;top:8px;left:8px;z-index:99999;background:rgba(0,0,0,.85);color:#0f0;' +
    'font:14px monospace;padding:8px 10px;white-space:pre;pointer-events:none;line-height:1.5';
  (document.querySelector('.stage') || document.body).appendChild(box);
  setInterval(() => {
    if (!window.video) return;
    const r = video.getBoundingClientRect();
    const cs = getComputedStyle(video);
    box.textContent = [
      'vid  ' + video.videoWidth + 'x' + video.videoHeight,
      'el   ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' @ ' + Math.round(r.left) + ',' + Math.round(r.top),
      'fit  ' + cs.objectFit + '  pos ' + cs.objectPosition,
      'tfm  ' + (cs.transform === 'none' ? 'none' : cs.transform.slice(0, 40)),
      'scr  ' + innerWidth + 'x' + innerHeight + '  fs ' + (document.fullscreenElement ? 1 : 0),
      'dpr  ' + devicePixelRatio
    ].join('\n');
  }, 250);
})();
