/* Thư viện nhạc nền
   Công khai:   GET /api/music (danh sách)  ·  GET /api/music/:id/file (phát, hỗ trợ tua bằng Range)
   Quản trị:    GET /api/admin/music  ·  POST /api/admin/music?meta=<JSON> (thân = file nhạc)
                PATCH /api/admin/music/:id  ·  DELETE /api/admin/music/:id */
'use strict';
const fs = require('node:fs');
const { json, readBody, securityHeaders, HttpError } = require('../lib/http');

// Đọc thân request dạng nhị phân (file nhạc), có giới hạn dung lượng
function readRaw(req, max) {
  return new Promise((resolve, reject) => {
    const len = Number(req.headers['content-length'] || 0);
    if (len > max) { reject(new HttpError(413, 'File quá lớn (tối đa 25 MB)')); req.resume(); return; }
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > max) { reject(new HttpError(413, 'File quá lớn (tối đa 25 MB)')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function streamFile(req, res, cfg, file, mime) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { json(res, cfg, 404, { error: 'File nhạc không còn' }); return; }
    securityHeaders(res, cfg);
    const headers = { 'Content-Type': mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=86400' };
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
    let start = 0, end = st.size - 1, status = 200;
    if (m && (m[1] || m[2])) {
      if (m[1]) { start = +m[1]; if (m[2]) end = Math.min(+m[2], end); } else { start = Math.max(0, st.size - +m[2]); }
      if (start > end || start >= st.size) {
        res.writeHead(416, { 'Content-Range': 'bytes */' + st.size });
        res.end();
        return;
      }
      status = 206;
      headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + st.size;
    }
    headers['Content-Length'] = end - start + 1;
    res.writeHead(status, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file, { start, end }).pipe(res);
  });
}

async function musicRoutes(ctx, req, res, url) {
  const { config, db, music, users } = ctx;
  const p = url.pathname;
  const m = req.method;

  // Nhạc Pro chỉ khóa khi đang bán nền, giống nền Pro; đang mở miễn phí nhạc Pro (hoặc được giữ từ chương trình) thì nghe được
  function canPlay(t, user) {
    if (t.tier !== 'pro' || ctx.promo.has(user, 'music')) return true;
    return !!(user && (user.pro || user.role === 'admin'));
  }

  if (p === '/api/music' && m === 'GET') {
    const user = ctx.tokens.authenticate(req).user;
    const list = music.list(false).map((t) => Object.assign(t, { locked: !canPlay(t, user) }));
    json(res, config, 200, { tracks: list });
    return true;
  }

  const fm = /^\/api\/music\/([0-9a-f-]{36})\/file$/.exec(p);
  if (fm && (m === 'GET' || m === 'HEAD')) {
    const t = music.get(fm[1]);
    if (!t || !t.active) { json(res, config, 404, { error: 'Không tìm thấy bài' }); return true; }
    if (!canPlay(t, ctx.tokens.authenticate(req).user)) { json(res, config, 403, { error: 'Bài này dành cho gói Pro' }); return true; }
    streamFile(req, res, config, music.fileOf(t), t.mime);
    return true;
  }

  if (p !== '/api/admin/music' && !p.startsWith('/api/admin/music/')) return false;
  const me = ctx.requireUser(req, res);
  if (!me) return true;
  if (me.role !== 'admin') { json(res, config, 403, { error: 'Chỉ quản trị viên mới truy cập được' }); return true; }

  if (p === '/api/admin/music' && m === 'GET') {
    json(res, config, 200, { tracks: music.list(true), max: music.MAX_BYTES });
    return true;
  }

  if (p === '/api/admin/music' && m === 'POST') {
    let meta;
    try { meta = JSON.parse(url.searchParams.get('meta') || '{}'); } catch (e) { meta = null; }
    if (!meta || typeof meta !== 'object') { json(res, config, 400, { error: 'Thông tin bài không hợp lệ' }); return true; }
    const buf = await readRaw(req, music.MAX_BYTES);
    const r = music.add(buf, meta, me.email);
    if (r.error) { json(res, config, r.status, { error: r.error }); return true; }
    users.audit(me, 'Thêm nhạc "' + r.track.title + '" (' + r.track.license + ')');
    json(res, config, 200, { track: music.toPublic(r.track, true) });
    return true;
  }

  const im = /^\/api\/admin\/music\/([0-9a-f-]{36})$/.exec(p);
  if (im && m === 'PATCH') {
    const r = music.update(im[1], await readBody(req));
    if (r.error) { json(res, config, r.status, { error: r.error }); return true; }
    json(res, config, 200, { track: music.toPublic(r.track, true) });
    return true;
  }
  if (im && m === 'DELETE') {
    const t = music.get(im[1]);
    if (!t || !music.remove(im[1])) { json(res, config, 404, { error: 'Không tìm thấy bài' }); return true; }
    users.audit(me, 'Xóa nhạc "' + t.title + '"');
    json(res, config, 200, { ok: true });
    return true;
  }

  json(res, config, 404, { error: 'Không tìm thấy' });
  return true;
}

module.exports = { musicRoutes, readRaw };
