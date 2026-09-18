// Статический сервер для плеера и тестов: отдаёт Range-запросы, без них перемотка в mp4 не работает.
// Запуск из корня репозитория: node tests/serve.js [порт] [--no-cors]. Второй экземпляр с --no-cors нужен набору «панель звука»
const http = require('http'), fs = require('fs'), path = require('path');
const root = process.cwd(), port = Number(process.argv[2]) || 8000;
// Второй экземпляр без CORS нужен тестам: источник с другого origin без заголовка портит аудиограф
const noCors = process.argv.includes('--no-cors');
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
  '.mp4':'video/mp4', '.m3u8':'application/vnd.apple.mpegurl', '.ts':'video/mp2t', '.m4s':'video/iso.segment',
  '.vtt':'text/vtt', '.srt':'text/plain', '.woff2':'font/woff2', '.otf':'font/otf', '.ttf':'font/ttf', '.wasm':'application/wasm', '.svg':'image/svg+xml', '.png':'image/png' };
function serve(req, res){
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('File not found'); }
    const type = types[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const head = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
    if (!noCors) head['Access-Control-Allow-Origin'] = '*';
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m) {
      const start = m[1] ? Number(m[1]) : Math.max(0, st.size - Number(m[2]));
      const end = m[1] && m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
      if (start > end || start >= st.size) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); return res.end(); }
      res.writeHead(206, { ...head, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...head, 'Content-Length': st.size });
    fs.createReadStream(file).pipe(res);
  });
}
// ?stall=мс задерживает ответ, тестам индикатора буферизации нужен сегмент, который приходит с опозданием
http.createServer((req, res) => {
  const stall = Number(new URL(req.url, 'http://x').searchParams.get('stall')) || 0;
  if (stall > 0) setTimeout(() => serve(req, res), stall); else serve(req, res);
}).listen(port, '127.0.0.1', () => console.log('http://localhost:' + port));
