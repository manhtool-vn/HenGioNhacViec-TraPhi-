/* /api/me*: hồ sơ, đổi tên, xóa tài khoản, dữ liệu đồng bộ, xuất dữ liệu */
'use strict';
const { json, readBody, appendCookies, securityHeaders } = require('../lib/http');

async function meRoutes(ctx, req, res, url) {
  const { config, db, tokens, users, now } = ctx;
  const p = url.pathname;
  const m = req.method;
  if (p !== '/api/me' && !p.startsWith('/api/me/')) return false;

  // Chưa đăng nhập: /api/me trả về user null (không báo lỗi làm bẩn console của khách)
  if (p === '/api/me' && m === 'GET') {
    const a = tokens.authenticate(req);
    if (a.error === 'none') { json(res, config, 200, { user: null }); return true; }
    if (a.error) { json(res, config, 401, { error: 'Phiên đăng nhập hết hạn', code: 'token_expired' }); return true; }
    const u = a.user;
    ctx.promo.claim(u); // đang mở miễn phí có "giữ vĩnh viễn" → ghi nhận cho tài khoản này
    json(res, config, 200, { user: users.toPublic(u), sync: { version: u.sync.version, updatedAt: u.sync.updatedAt }, sessions: tokens.activeDevices(u.id) });
    return true;
  }

  const user = ctx.requireUser(req, res);
  if (!user) return true;

  if (p === '/api/me' && m === 'PATCH') {
    const body = await readBody(req);
    if (typeof body.name === 'string') {
      const name = body.name.replace(/\s+/g, ' ').trim().slice(0, 100);
      if (!name) { json(res, config, 400, { error: 'Tên không được để trống' }); return true; }
      user.name = name;
    }
    db.save();
    json(res, config, 200, { user: users.toPublic(user) });
    return true;
  }

  if (p === '/api/me' && m === 'DELETE') {
    if (user.role === 'admin' && users.admins().length <= 1) {
      json(res, config, 400, { error: 'Bạn là quản trị viên duy nhất. Hãy cấp quyền quản trị cho người khác trước khi xóa tài khoản.' });
      return true;
    }
    tokens.revokeAll(user);
    delete db.data.users[user.id];
    users.audit(user, 'Tự xóa tài khoản', user.email);
    db.save();
    appendCookies(res, tokens.clearCookies());
    json(res, config, 200, { ok: true });
    return true;
  }

  if (p === '/api/me/data' && m === 'GET') {
    json(res, config, 200, { version: user.sync.version, updatedAt: user.sync.updatedAt, data: user.sync.data });
    return true;
  }

  if (p === '/api/me/data' && m === 'PUT') {
    if (ctx.limited('sync:' + user.id, 120, 60000)) { json(res, config, 429, { error: 'Đồng bộ quá nhanh, thử lại sau' }); return true; }
    const body = await readBody(req);
    const data = users.cleanSync(body.data);
    if (data === null) { json(res, config, 400, { error: 'Dữ liệu không hợp lệ' }); return true; }
    if (data === false) { json(res, config, 413, { error: 'Dữ liệu quá lớn' }); return true; }
    // Có thiết bị khác vừa ghi → trả về bản mới nhất để trang tự xử lý
    if (Number(body.baseVersion) !== user.sync.version) {
      json(res, config, 409, { version: user.sync.version, updatedAt: user.sync.updatedAt, data: user.sync.data });
      return true;
    }
    user.sync = { version: user.sync.version + 1, updatedAt: new Date(now()).toISOString(), data };
    db.save();
    json(res, config, 200, { version: user.sync.version, updatedAt: user.sync.updatedAt });
    return true;
  }

  if (p === '/api/me/export' && m === 'GET') {
    const body = JSON.stringify({ exportedAt: new Date(now()).toISOString(), account: users.toPublic(user), data: user.sync.data }, null, 2);
    securityHeaders(res, config);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Disposition': 'attachment; filename="hen-gio-nhac-viec-du-lieu.json"'
    });
    res.end(body);
    return true;
  }

  return false;
}

module.exports = { meRoutes };
