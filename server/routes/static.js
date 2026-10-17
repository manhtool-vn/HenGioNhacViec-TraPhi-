/* Phục vụ file trong thư mục public/. Mọi thứ ngoài public/ (server, data, .env…) không bao giờ ra ngoài. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { securityHeaders } = require('../lib/http');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};
const ALIASES = { '': 'index.html', admin: 'admin.html' };

function notFound(res, cfg) {
  securityHeaders(res, cfg);
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Không tìm thấy');
}

function serveStatic(ctx, req, res, url) {
  const cfg = ctx.config;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    securityHeaders(res, cfg);
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }
  let rel;
  try { rel = decodeURIComponent(url.pathname).replace(/^\/+/, ''); } catch (e) { return notFound(res, cfg); }
  if (Object.prototype.hasOwnProperty.call(ALIASES, rel)) rel = ALIASES[rel];
  // Chặn đi ngược thư mục, file ẩn (.env…), ký tự lạ
  if (rel.includes('\0') || rel.split('/').some((seg) => seg === '..' || seg.startsWith('.'))) return notFound(res, cfg);
  const root = cfg.publicDir;
  const file = path.resolve(root, rel);
  if (!file.startsWith(root + path.sep)) return notFound(res, cfg);

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return notFound(res, cfg);
    const ext = path.extname(file).toLowerCase();
    securityHeaders(res, cfg, { html: ext === '.html' || rel === 'sw.js' });
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': rel.startsWith('assets/img/') ? 'public, max-age=86400' : 'no-cache'
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

module.exports = { serveStatic };
