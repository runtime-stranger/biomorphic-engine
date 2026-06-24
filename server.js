const http = require('http');
const fs = require('fs');
const path = require('path');
const dir = 'C:\\Users\\User\\biomorphic-engine';

http.createServer((req, res) => {
  let fp = req.url === '/' ? '\\test.html' : decodeURI(req.url);
  fp = path.join(dir, fp);
  if (!fs.existsSync(fp)) { res.writeHead(404); res.end('404'); return; }
  const ext = path.extname(fp);
  const ct = ext === '.js' ? 'application/javascript' : 'text/html; charset=utf-8';
  res.writeHead(200, { 'Content-Type': ct });
  fs.createReadStream(fp).pipe(res);
}).listen(8080, () => console.log('http://localhost:8080'));
