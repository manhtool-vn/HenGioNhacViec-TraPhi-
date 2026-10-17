const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../server/app');
const { createStore } = require('../server/db/store');
const { findCode, makeCode } = require('../server/services/payments');

const KEY = 'khoa-webhook-thu-nghiem-1234567890';

async function start(paymentOn = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengio-pay-'));
  const db = createStore(dir);
  if (paymentOn) Object.assign(db.data.settings.payment, { enabled: true, bankId: 'TCB', accountNo: '19036688888888', accountName: 'NGUYEN VAN MANH' });
  const clock = { t: Date.UTC(2026, 9, 17, 3, 0, 0) };
  const profiles = { a: { sub: 'g-a', email: 'a@x.vn', email_verified: true, name: 'A' }, b: { sub: 'g-b', email: 'b@x.vn', email_verified: true, name: 'B' } };
  const fetch = async (url, init) => url.includes('/token')
    ? { ok: true, json: async () => ({ access_token: 'at-' + new URLSearchParams(init.body).get('code') }) }
    : { ok: true, json: async () => profiles[String(init.headers.Authorization).slice(10)] };
  const env = { GOOGLE_CLIENT_ID: 'c', GOOGLE_CLIENT_SECRET: 's', PUBLIC_URL: 'http://localhost:9', JWT_SECRET: 'j'.repeat(40), PAYMENT_WEBHOOK_KEY: KEY };
  const server = http.createServer(createApp({ env, db, fetch, now: () => clock.t, log: () => {} }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, db, clock, base: 'http://127.0.0.1:' + server.address().port };
}

async function call(base, method, p, { jar, body, headers = {}, csrf = true } = {}) {
  const h = Object.assign({}, headers);
  if (jar) h.Cookie = jar;
  if (csrf) h['X-Requested-With'] = 'hengio';
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const r = await fetch(base + p, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const t = await r.text();
  let data; try { data = JSON.parse(t); } catch (e) { data = t; }
  return { status: r.status, data, headers: r.headers };
}

async function login(base, who) {
  const s = await call(base, 'GET', '/api/auth/google/start');
  const state = new URL(s.headers.get('location')).searchParams.get('state');
  const cb = await call(base, 'GET', '/api/auth/google/callback?code=' + who + '&state=' + state);
  return cb.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

const hook = (base, payload, key = KEY) => call(base, 'POST', '/api/payments/webhook', { body: payload, csrf: false, headers: { Authorization: 'Apikey ' + key } });

test('mã đơn: ngẫu nhiên, không có ký tự dễ nhầm, tìm được trong nội dung ngân hàng', () => {
  const c = makeCode();
  assert.match(c, /^MTHG[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(findCode('MBVCB.123456.' + c.toLowerCase() + '.CT tu 0123'), c);
  assert.equal(findCode('Chuyen tien MTHG-' + c.slice(4, 7) + ' ' + c.slice(7)), c);
  assert.equal(findCode('khong co ma'), null);
  assert.equal(findCode(null), null);
});

test('bảng giá công khai và đơn chỉ tạo khi đã bật thanh toán', async () => {
  const s = await start(false);
  try {
    const cfg = await call(s.base, 'GET', '/api/config');
    assert.deepEqual(cfg.data.shop.pro, { price: 49000 });
    assert.equal(cfg.data.shop.theme.price, 9000);
    assert.equal(cfg.data.shop.enabled, false);
    const jar = await login(s.base, 'a');
    assert.equal((await call(s.base, 'POST', '/api/orders', { jar, body: { product: 'pro' } })).status, 503);
  } finally { s.server.close(); }
});

test('mua 1 nền: tạo đơn, QR đúng số tiền + nội dung, webhook mở khóa', async () => {
  const s = await start();
  try {
    const jar = await login(s.base, 'a');
    assert.equal((await call(s.base, 'POST', '/api/orders', { body: { product: 'pro' } })).status, 401);
    assert.equal((await call(s.base, 'POST', '/api/orders', { jar, body: { product: 'theme:forest' } })).status, 400); // nền miễn phí
    assert.equal((await call(s.base, 'POST', '/api/orders', { jar, body: { product: 'theme:<x>' } })).status, 400);

    const r = await call(s.base, 'POST', '/api/orders', { jar, body: { product: 'theme:neon', amount: 1 } });
    assert.equal(r.status, 200);
    const o = r.data.order;
    assert.equal(o.amount, 9000); // giá do máy chủ tính, bỏ qua amount gửi lên
    assert.equal(o.status, 'pending');
    assert.equal(o.pay.content, o.code);
    assert.match(o.pay.qrUrl, /^https:\/\/img\.vietqr\.io\/image\/TCB-19036688888888-compact2\.png\?/);
    assert.match(o.pay.qrUrl, /amount=9000/);
    assert.match(o.pay.qrUrl, new RegExp('addInfo=' + o.code));

    // Bấm mua lại cùng gói → dùng lại đơn cũ
    assert.equal((await call(s.base, 'POST', '/api/orders', { jar, body: { product: 'theme:neon' } })).data.order.id, o.id);

    // Webhook sai khóa / thiếu khóa
    assert.equal((await hook(s.base, { id: 1 }, 'sai-khoa')).status, 401);
    assert.equal((await call(s.base, 'POST', '/api/payments/webhook', { body: { id: 1 }, csrf: false })).status, 401);

    const w = await hook(s.base, { id: 9001, gateway: 'Techcombank', transferType: 'in', transferAmount: 9000, content: 'IBFT ' + o.code + ' thanh toan', referenceCode: 'FT1' });
    assert.equal(w.status, 200);
    assert.equal(w.data.success, true);
    assert.equal(w.data.result, 'paid');

    const after = await call(s.base, 'GET', '/api/orders/' + o.id, { jar });
    assert.equal(after.data.order.status, 'paid');
    assert.deepEqual(after.data.user.ownedThemes, ['neon']);
    assert.equal(after.data.order.pay, undefined);

    // SePay gửi lại cùng giao dịch → không xử lý 2 lần
    assert.equal((await hook(s.base, { id: 9001, transferType: 'in', transferAmount: 9000, content: o.code })).data.result, 'duplicate');
    // Đã có nền rồi thì không mua lại được
    assert.equal((await call(s.base, 'POST', '/api/orders', { jar, body: { product: 'theme:neon' } })).status, 400);
  } finally { s.server.close(); }
});

test('gói Pro, gói theo mùa, chuyển thiếu, chuyển muộn, tiền ra bị bỏ qua', async () => {
  const s = await start();
  try {
    let jar = await login(s.base, 'a');
    const season = (await call(s.base, 'POST', '/api/orders', { jar, body: { product: 'season' } })).data.order;
    assert.equal(season.amount, 29000);

    // Tiền ra (transferType out) → bỏ qua
    assert.equal((await hook(s.base, { id: 1, transferType: 'out', transferAmount: 29000, content: season.code })).data.result, 'ignored');
    // Chuyển thiếu → chưa mở khóa
    assert.equal((await hook(s.base, { id: 2, transferType: 'in', transferAmount: 10000, content: season.code })).data.result, 'underpaid');
    // Quá 30 phút (QR hết hạn) nhưng vẫn trong 7 ngày → vẫn ghi nhận
    s.clock.t += 2 * 3600000;
    jar = await login(s.base, 'a'); // access token 15 phút đã hết sau khi tua 2 giờ
    assert.equal((await call(s.base, 'GET', '/api/orders/' + season.id, { jar })).data.order.status, 'expired');
    assert.equal((await hook(s.base, { id: 3, transferType: 'in', transferAmount: 29000, code: season.code, content: 'xyz' })).data.result, 'paid');
    let me = (await call(s.base, 'GET', '/api/me', { jar })).data.user;
    assert.deepEqual(me.ownedThemes.sort(), require('../public/assets/js/themes.js').list.filter((t) => t.season).map((t) => t.id).sort());

    const pro = (await call(s.base, 'POST', '/api/orders', { jar, body: { product: 'pro' } })).data.order;
    assert.equal(pro.amount, 49000);
    await hook(s.base, { id: 4, transferType: 'in', transferAmount: 50000, content: pro.code });
    me = (await call(s.base, 'GET', '/api/me', { jar })).data.user;
    assert.equal(me.pro, true);
    assert.equal((await call(s.base, 'POST', '/api/orders', { jar, body: { product: 'theme:rain' } })).status, 400); // đã Pro

    // Chuyển lần 2 vào đơn đã trả → ghi lại để quản trị hoàn tiền; tiền không rõ đơn → chưa khớp
    assert.equal((await hook(s.base, { id: 5, transferType: 'in', transferAmount: 49000, content: pro.code })).data.result, 'already_paid');
    assert.equal((await hook(s.base, { id: 6, transferType: 'in', transferAmount: 20000, content: 'ung ho' })).data.result, 'unmatched');
  } finally { s.server.close(); }
});

test('hủy đơn, giới hạn đơn chờ, không xem được đơn người khác', async () => {
  const s = await start();
  try {
    const a = await login(s.base, 'a');
    const b = await login(s.base, 'b');
    const o1 = (await call(s.base, 'POST', '/api/orders', { jar: a, body: { product: 'theme:neon' } })).data.order;
    await call(s.base, 'POST', '/api/orders', { jar: a, body: { product: 'theme:rain' } });
    await call(s.base, 'POST', '/api/orders', { jar: a, body: { product: 'theme:snow' } });
    assert.equal((await call(s.base, 'POST', '/api/orders', { jar: a, body: { product: 'theme:tet' } })).status, 429);

    assert.equal((await call(s.base, 'GET', '/api/orders/' + o1.id, { jar: b })).status, 404);
    assert.equal((await call(s.base, 'POST', '/api/orders/' + o1.id + '/cancel', { jar: b })).status, 404);
    assert.equal((await call(s.base, 'POST', '/api/orders/' + o1.id + '/cancel', { jar: a })).data.order.status, 'cancelled');
    assert.equal((await call(s.base, 'POST', '/api/orders', { jar: a, body: { product: 'theme:tet' } })).status, 200);

    // Đã hủy mà vẫn chuyển tiền → vẫn mở khóa
    assert.equal((await hook(s.base, { id: 77, transferType: 'in', transferAmount: 9000, content: o1.code })).data.result, 'paid');
    assert.equal((await call(s.base, 'GET', '/api/orders', { jar: a })).data.orders.length, 4);
  } finally { s.server.close(); }
});

test('quản trị: cài đặt thanh toán, doanh thu, xác nhận tay, chặn người thường', async () => {
  const s = await start(false);
  try {
    const admin = await login(s.base, 'a');
    const user = await login(s.base, 'b');
    let r = await call(s.base, 'PUT', '/api/admin/settings', { jar: admin, body: { payment: { enabled: true, bankId: 'T C B', accountNo: '123' } } });
    assert.equal(r.status, 400);
    r = await call(s.base, 'PUT', '/api/admin/settings', { jar: admin, body: { payment: { enabled: true, bankId: 'MB', accountNo: '0988392321', accountName: ' nguyen   van manh ', pricePro: 59000, priceTheme: 5, priceSeason: 15000 } } });
    assert.equal(r.status, 200);
    const pay = s.db.data.settings.payment;
    assert.equal(pay.accountName, 'NGUYEN VAN MANH');
    assert.equal(pay.pricePro, 59000);
    assert.equal(pay.priceTheme, 9000); // giá vô lý bị bỏ qua
    assert.equal((await call(s.base, 'GET', '/api/config')).data.shop.enabled, true);

    const o = (await call(s.base, 'POST', '/api/orders', { jar: user, body: { product: 'pro' } })).data.order;
    assert.equal(o.amount, 59000);
    assert.equal((await call(s.base, 'POST', '/api/admin/orders/' + o.id + '/confirm', { jar: user })).status, 403);
    assert.equal((await call(s.base, 'POST', '/api/admin/orders/' + o.id + '/confirm', { jar: admin })).status, 200);
    assert.equal((await call(s.base, 'POST', '/api/admin/orders/' + o.id + '/confirm', { jar: admin })).status, 400);
    assert.equal((await call(s.base, 'GET', '/api/me', { jar: user })).data.user.pro, true);

    r = await call(s.base, 'GET', '/api/admin/orders', { jar: admin });
    assert.equal(r.data.revenue.total, 59000);
    assert.equal(r.data.orders[0].paidVia, 'admin');
    const ov = await call(s.base, 'GET', '/api/admin/overview', { jar: admin });
    assert.equal(ov.data.settings.payment.webhookKeySet, true);
    assert.equal(ov.data.settings.payment.webhookUrl, 'http://localhost:9/api/payments/webhook');
    assert.ok(!JSON.stringify(ov.data).includes(KEY)); // không lộ khóa webhook
  } finally { s.server.close(); }
});
