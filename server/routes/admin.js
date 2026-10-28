/* /api/admin/*: chỉ quản trị viên. Người dùng (Pro, khóa, quyền, xóa), cài đặt hệ thống, nhật ký. */
'use strict';
const { json, readBody } = require('../lib/http');

async function adminRoutes(ctx, req, res, url) {
  const { config, db, tokens, google, users, now } = ctx;
  const p = url.pathname;
  const m = req.method;
  if (!p.startsWith('/api/admin/')) return false;

  const me = ctx.requireUser(req, res);
  if (!me) return true;
  if (me.role !== 'admin') { json(res, config, 403, { error: 'Chỉ quản trị viên mới truy cập được' }); return true; }

  // Doanh thu: hôm nay, 30 ngày, tổng
  function revenue() {
    const paid = Object.values(db.data.orders).filter((o) => o.status === 'paid');
    const day = new Date(now()); day.setHours(0, 0, 0, 0);
    const sum = (list) => list.reduce((s, o) => s + (o.paidAmount || o.amount), 0);
    return {
      today: sum(paid.filter((o) => o.paidAt >= day.getTime())),
      days30: sum(paid.filter((o) => o.paidAt >= now() - 30 * 86400000)),
      total: sum(paid), orders: paid.length
    };
  }

  if (p === '/api/admin/orders' && m === 'GET') {
    const status = String(url.searchParams.get('status') || '');
    const orders = Object.values(db.data.orders)
      .map((o) => Object.assign(ctx.payments.toPublic(o, false), { email: o.email, paidVia: o.paidVia, paidAmount: o.paidAmount }))
      .filter((o) => !status || o.status === status)
      .sort((a, b) => b.createdAt - a.createdAt).slice(0, 300);
    // Tiền vào nhưng không khớp đơn nào (ghi sai nội dung, chuyển thiếu, chuyển 2 lần…) để quản trị viên xử lý
    const unmatched = Object.entries(db.data.payments)
      .filter(([, r]) => r.result !== 'paid')
      .map(([tx, r]) => Object.assign({ tx }, r))
      .sort((a, b) => b.at - a.at).slice(0, 100);
    json(res, config, 200, { orders, unmatched, revenue: revenue() });
    return true;
  }

  const oc = /^\/api\/admin\/orders\/([0-9a-f-]{36})\/confirm$/.exec(p);
  if (oc && m === 'POST') {
    const order = db.data.orders[oc[1]];
    if (!order) { json(res, config, 404, { error: 'Không tìm thấy đơn' }); return true; }
    if (order.status === 'paid') { json(res, config, 400, { error: 'Đơn đã thanh toán rồi' }); return true; }
    ctx.payments.fulfill(order, 'admin', order.amount, me);
    db.save();
    json(res, config, 200, { order: ctx.payments.toPublic(order, false) });
    return true;
  }

  if (p === '/api/admin/overview' && m === 'GET') {
    const all = Object.values(db.data.users);
    const weekAgo = new Date(now() - 7 * 86400000).toISOString();
    const g = google.settings();
    const s = db.data.settings;
    json(res, config, 200, {
      counts: {
        users: all.length, pro: all.filter((u) => u.pro).length, admins: all.filter((u) => u.role === 'admin').length,
        blocked: all.filter((u) => !u.active).length, active7d: all.filter((u) => u.lastLoginAt && u.lastLoginAt >= weekAgo).length
      },
      // Không bao giờ trả Client secret ra ngoài, chỉ báo đã có hay chưa
      settings: {
        googleClientId: g.clientId, googleClientSecretSet: !!g.clientSecret, googleLoginEnabled: g.enabled,
        redirectUri: g.redirectUri, fromEnv: g.fromEnv, googleReady: g.ready,
        registrationOpen: s.registrationOpen !== false, lockPremium: !!s.lockPremium,
        payment: Object.assign({}, s.payment, {
          ready: ctx.payments.ready(),
          webhookUrl: config.publicUrl + '/api/payments/webhook',
          webhookKeySet: String(config.env.PAYMENT_WEBHOOK_KEY || '').length >= 16
        })
      },
      revenue: revenue(),
      audit: db.data.audit.slice(0, 50),
      me: me.id
    });
    return true;
  }

  if (p === '/api/admin/users' && m === 'GET') {
    const q = String(url.searchParams.get('q') || '').trim().toLowerCase().slice(0, 100);
    const list = Object.values(db.data.users)
      .filter((u) => !q || u.email.includes(q) || String(u.name).toLowerCase().includes(q))
      .sort((a, b) => String(b.lastLoginAt || b.createdAt).localeCompare(String(a.lastLoginAt || a.createdAt)))
      .slice(0, 500)
      .map((u) => users.summary(u, tokens.activeDevices(u.id)));
    json(res, config, 200, { users: list });
    return true;
  }

  const um = /^\/api\/admin\/users\/([0-9a-f-]{36})$/.exec(p);
  if (um) {
    const target = db.data.users[um[1]];
    if (!target) { json(res, config, 404, { error: 'Không tìm thấy tài khoản' }); return true; }

    if (m === 'PATCH') {
      const body = await readBody(req);
      if (target.id === me.id && (body.active === false || body.role === 'user')) {
        json(res, config, 400, { error: 'Không thể tự khóa hoặc tự bỏ quyền quản trị của chính mình' });
        return true;
      }
      if (typeof body.pro === 'boolean' && body.pro !== !!target.pro) {
        target.pro = body.pro;
        users.audit(me, body.pro ? 'Cấp Pro' : 'Bỏ Pro', target.email);
      }
      if (typeof body.active === 'boolean' && body.active !== target.active) {
        target.active = body.active;
        // Khóa tài khoản: đăng xuất ngay trên mọi thiết bị
        if (!body.active) tokens.revokeAll(target);
        users.audit(me, body.active ? 'Mở khóa' : 'Khóa tài khoản', target.email);
      }
      if ((body.role === 'admin' || body.role === 'user') && body.role !== target.role) {
        target.role = body.role;
        users.audit(me, body.role === 'admin' ? 'Cấp quyền quản trị' : 'Bỏ quyền quản trị', target.email);
      }
      db.save();
      json(res, config, 200, { user: users.summary(target, tokens.activeDevices(target.id)) });
      return true;
    }

    if (m === 'DELETE') {
      if (target.id === me.id) { json(res, config, 400, { error: 'Không thể tự xóa tài khoản của mình ở đây' }); return true; }
      tokens.revokeAll(target);
      delete db.data.users[target.id];
      users.audit(me, 'Xóa tài khoản', target.email);
      db.save();
      json(res, config, 200, { ok: true });
      return true;
    }
  }

  if (p === '/api/admin/settings' && m === 'PUT') {
    const body = await readBody(req);
    const s = db.data.settings;
    if (typeof body.googleClientId === 'string') s.googleClientId = body.googleClientId.trim().slice(0, 200);
    // Để trống = giữ nguyên secret cũ (trang quản trị không bao giờ hiện lại secret)
    if (typeof body.googleClientSecret === 'string' && body.googleClientSecret.trim()) s.googleClientSecret = body.googleClientSecret.trim().slice(0, 200);
    if (body.clearGoogleSecret === true) s.googleClientSecret = '';
    if (typeof body.googleLoginEnabled === 'boolean') s.googleLoginEnabled = body.googleLoginEnabled;
    if (typeof body.registrationOpen === 'boolean') s.registrationOpen = body.registrationOpen;
    if (typeof body.lockPremium === 'boolean') s.lockPremium = body.lockPremium;
    if (body.payment && typeof body.payment === 'object') {
      const pin = body.payment, pay = s.payment;
      const price = (v) => { const n = Math.round(Number(v)); return n >= 1000 && n <= 10000000 ? n : null; };
      if (typeof pin.enabled === 'boolean') pay.enabled = pin.enabled;
      if (typeof pin.bankId === 'string') {
        if (pin.bankId && !/^[A-Za-z0-9]{2,20}$/.test(pin.bankId.trim())) { json(res, config, 400, { error: 'Mã ngân hàng chỉ gồm chữ và số, ví dụ TCB, MB, VCB hoặc mã BIN 970407' }); return true; }
        pay.bankId = pin.bankId.trim();
      }
      if (typeof pin.accountNo === 'string') {
        if (pin.accountNo && !/^\d{4,20}$/.test(pin.accountNo.trim())) { json(res, config, 400, { error: 'Số tài khoản chỉ gồm 4–20 chữ số' }); return true; }
        pay.accountNo = pin.accountNo.trim();
      }
      if (typeof pin.accountName === 'string') pay.accountName = pin.accountName.replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 60);
      ['pricePro', 'priceSeason', 'priceTheme'].forEach((k) => {
        if (pin[k] === undefined) return;
        const v = price(pin[k]);
        if (v) pay[k] = v;
      });
    }
    users.audit(me, 'Đổi cài đặt hệ thống');
    db.save();
    json(res, config, 200, { ok: true });
    return true;
  }

  // Miễn phí & giới thiệu: chương trình mở miễn phí + popup giới thiệu ManhTool
  if (p === '/api/admin/promo' && m === 'GET') {
    json(res, config, 200, ctx.promo.adminInfo());
    return true;
  }
  if (p === '/api/admin/promo/free' && m === 'PUT') {
    const body = await readBody(req);
    const r = ctx.promo.setFree(body.free === null ? null : body.free);
    if (r.error) { json(res, config, 400, { error: r.error }); return true; }
    users.audit(me, body.free === null ? 'Tắt chương trình miễn phí' : 'Đổi chương trình miễn phí');
    db.save();
    json(res, config, 200, ctx.promo.adminInfo());
    return true;
  }
  if (p === '/api/admin/promo/brand' && m === 'PUT') {
    const body = await readBody(req);
    const brand = ctx.promo.setBrand(body.brand);
    users.audit(me, 'Đổi lời giới thiệu');
    db.save();
    json(res, config, 200, { brand });
    return true;
  }

  json(res, config, 404, { error: 'Không tìm thấy' });
  return true;
}

module.exports = { adminRoutes };
