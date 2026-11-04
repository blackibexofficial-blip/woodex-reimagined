// Read-only visual preview of the imported OS. This is not a PHP server.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../legacy/woodex-os/public_html');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.json': 'application/json' };
http.createServer((req, res) => {
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  if (url.startsWith('/api/')) {
    res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: false, error: 'Visual preview only: PHP and MySQL are not running. Sign-in and data operations are unavailable.' }));
    return;
  }
  if (url === '/') { res.writeHead(302, { Location: '/admin/' }); res.end(); return; }
  if (url === '/admin/' || url === '/builder/') url += 'index.html';
  const ext = path.extname(url).toLowerCase();
  const file = path.resolve(root, '.' + url);
  // Only static presentation assets from the public handoff; never expose PHP or private data.
  if (!/^\/(?:admin|builder|assets\/(?:img|fonts|js))\//.test(url) || !types[ext] || !file.startsWith(root + path.sep) || url.split('/').some(part => part.startsWith('.'))) {
    res.writeHead(404).end('Not found'); return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[ext], 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
    if (ext === '.html') {
      const banner = '<div role="status" style="position:relative;z-index:99999;padding:12px;background:#fff0bd;color:#362600;text-align:center;font:600 14px system-ui">Visual preview only — PHP and MySQL are not running. Sign-in and data operations are unavailable. Do not enter credentials.</div>';
      let html = data.toString().replace(/<body([^>]*)>/i, '<body$1>' + banner);
      if (url === '/admin/index.html') {
        // The original shell waits for a working PHP API before revealing itself.
        // Reveal a disabled login screen even if its boot script fails.
        html = html.replace('</body>', `<script>document.addEventListener('DOMContentLoaded', function () {
          var auth = document.getElementById('auth'), form = document.getElementById('login-form');
          if (auth) auth.hidden = false;
          if (form) { form.hidden = false; form.querySelectorAll('input,button').forEach(function (el) { el.disabled = true; }); }
          var err = document.getElementById('l-err'); if (err) err.textContent = 'Visual preview only. The backend is not connected.';
        });</script></body>`);
      }
      res.end(html);
    } else res.end(data);
  });
}).listen(8081, '0.0.0.0', () => console.log('Woodex OS visual preview listening on port 8081'));
