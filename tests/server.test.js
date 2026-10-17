const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../server/app');
const { createConfig, checkConfig } = require('../server/config');
const { createStore } = require('../server/db/store');
const { parseEnv } = require('../server/lib/env');
const jwt = require('../server/lib/jwt');

const MIN = 60000;

// Google giả: mỗi "code" tương ứng 1 hồ sơ người dùng
function fakeGoogle(profiles, calls) {
  return async (url, init) => {
    calls.push({ url, body: init && init.body });
    if (url.includes('/token')) {
      const code = new URLSearchParams(init.body).get('code');
      if (!profiles[code]) return { ok: false, json: async () => ({ error: 'invalid_grant' }) };
      return { ok: true, json: async () => ({ access_token: 'at-' + code }) };
    }
    const code = String(init.headers.Authorization).replace('Bearer at-', '');
    return { ok: true, json: async () => profiles[code] };
  };
}

async function startServer(extraEnv) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengio-'));
  const db = createStore(dir);
  const calls = [];
  const clock = { t: Date.UTC(2026, 9, 17, 3, 0, 0) };
  const profiles = {
    a: { sub: 'g-a', email: 'An@Example.com', email_verified: true, name: 'An', picture: 'https://lh3.googleusercontent.com/a/x' },
    b: { sub: 'g-b', email: 'binh@example.com', email_verified: true, name: 'Bình', picture: 'https://evil.example/x.png' },
    c: { sub: 'g-c', email: 'chua@example.com', email_verified: false }
  };
  const env = Object.assign({
    GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'sec', GOOGLE_LOGIN_ENABLED: 'true',
    PUBLIC_URL: 'http://localhost:9', JWT_SECRET: 'x'.repeat(40)
  }, extraEnv);
  const server = http.createServer(createApp({ env, db, fetch: fakeGoogle(profiles, calls), now: () => clock.t, log: () => {} }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  return { server, base, db, calls, clock };
}

// Hũ cookie đơn giản: giữ hg_at / hg_rt như trình duyệt
function jarFrom(res, jar) {
  jar = Object.assign({}, jar);
  (res.headers.getSetCookie ? res.headers.getSetCookie() : []).forEach((c) => {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    const name = pair.slice(0, i), value = pair.slice(i + 1);
    if (/Max-Age=0/.test(c) || !value) delete jar[name]; else jar[name] = value;
  });
  return jar;
}
const cookieHeader = (jar) => Object.entries(jar || {}).map(([k, v]) => k + '=' + v).join('; ');

async function req(base, method, p, { jar, body, csrf = true, headers = {} } = {}) {
  const h = Object.assign({}, headers);
  if (jar) h.Cookie = cookieHeader(jar);
  if (csrf) h['X-Requested-With'] = 'hengio';
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(base + p, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { data = text; }
  return { status: res.status, data, headers: res.headers, jar: jarFrom(res, jar), raw: res };
}

// Đi trọn luồng Google: start → (Google) → callback
async function login(base, code) {
  const start = await req(base, 'GET', '/api/auth/google/start?return=/');
  assert.equal(start.status, 302);
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const cb = await req(base, 'GET', '/api/auth/google/callback?code=' + code + '&state=' + state);
  return { cb, jar: cb.jar, location: cb.headers.get('location') };
}

/* ---------- JWT ---------- */
test('JWT: ký, xác minh, chặn sửa nội dung, alg none, hết hạn, sai iss/aud', () => {
  const secret = 's'.repeat(40);
  const now = 1_800_000_000_000;
  const t = jwt.sign({ sub: 'u1', tv: 0 }, secret, { expiresIn: 900, issuer: 'iss', audience: 'aud', now });
  const p = jwt.verify(t, secret, { issuer: 'iss', audience: 'aud', now });
  assert.equal(p.sub, 'u1');
  assert.equal(p.exp - p.iat, 900);

  const [h, b, s] = t.split('.');
  const forged = Buffer.from(JSON.stringify(Object.assign(JSON.parse(Buffer.from(b, 'base64url')), { sub: 'admin' }))).toString('base64url');
  assert.throws(() => jwt.verify(h + '.' + forged + '.' + s, secret, { now }), { code: 'bad_signature' });

  const none = Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url');
  assert.throws(() => jwt.verify(none + '.' + b + '.', secret, { now }), { code: 'bad_alg' });
  assert.throws(() => jwt.verify(t, 'khac'.repeat(10), { now }), { code: 'bad_signature' });
  assert.throws(() => jwt.verify(t, secret, { now: now + 931000 }), { code: 'expired' });
  assert.throws(() => jwt.verify(t, secret, { issuer: 'khac', now }), { code: 'bad_claims' });
  assert.throws(() => jwt.verify(t, secret, { audience: 'khac', now }), { code: 'bad_claims' });
  assert.throws(() => jwt.verify('a.b', secret, { now }), { code: 'malformed' });
});

test('parseEnv đọc .env có chú thích, dấu nháy', () => {
  const e = parseEnv('# x\nA=1\nB = "hai ba" \nC=x # chú thích\nD=\'q\'\n bad line');
  assert.deepEqual(e, { A: '1', B: 'hai ba', C: 'x', D: 'q' });
});

test('cấu hình production bắt buộc https và JWT_SECRET đủ dài', () => {
  assert.deepEqual(checkConfig(createConfig({ NODE_ENV: 'production', PUBLIC_URL: 'https://a.vn', JWT_SECRET: 'k'.repeat(32) })), []);
  assert.equal(checkConfig(createConfig({ NODE_ENV: 'production', PUBLIC_URL: 'http://a.vn' })).length, 2);
  assert.deepEqual(checkConfig(createConfig({})), []);
});

/* ---------- Đăng nhập ---------- */
test('đăng nhập Google: PKCE, cookie HttpOnly, người đầu tiên là quản trị', async () => {
  const s = await startServer();
  try {
    const cfg = (await req(s.base, 'GET', '/api/config')).data;
    assert.equal(cfg.googleLogin, true);
    assert.equal(cfg.lockPremium, false);

    const start = await req(s.base, 'GET', '/api/auth/google/start');
    const loc = new URL(start.headers.get('location'));
    assert.equal(loc.searchParams.get('redirect_uri'), 'http://localhost:9/api/auth/google/callback');
    assert.equal(loc.searchParams.get('code_challenge_method'), 'S256');

    const { cb, jar, location } = await login(s.base, 'a');
    assert.equal(location, '/?login=ok');
    const set = cb.raw.headers.getSetCookie();
    const at = set.find((c) => c.startsWith('hg_at='));
    const rt = set.find((c) => c.startsWith('hg_rt='));
    assert.match(at, /HttpOnly/);
    assert.match(at, /SameSite=Lax/);
    assert.match(rt, /HttpOnly/);
    assert.match(rt, /SameSite=Strict/);
    assert.match(rt, /Path=\/api\/auth/);
    assert.equal(jar.hg_at.split('.').length, 3); // là JWT

    const sent = new URLSearchParams(s.calls.find((c) => c.url.includes('/token')).body);
    assert.equal(sent.get('client_secret'), 'sec');
    assert.ok(sent.get('code_verifier').length >= 43);

    const me = await req(s.base, 'GET', '/api/me', { jar });
    assert.equal(me.data.user.email, 'an@example.com');
    assert.equal(me.data.user.role, 'admin');
    assert.equal(me.data.user.picture, 'https://lh3.googleusercontent.com/a/x');
    assert.equal(me.data.sessions, 1);

    const b = await login(s.base, 'b');
    const meB = await req(s.base, 'GET', '/api/me', { jar: b.jar });
    assert.equal(meB.data.user.role, 'user');
    assert.equal(meB.data.user.picture, ''); // ảnh ngoài Google bị bỏ

    // Chỉ lưu bản băm refresh token
    assert.ok(!JSON.stringify(s.db.data).includes(jar.hg_rt));
    assert.equal((await req(s.base, 'GET', '/api/me')).data.user, null);
  } finally { s.server.close(); }
});

test('state dùng 1 lần, state lạ, email chưa xác minh, hủy đăng nhập', async () => {
  const s = await startServer();
  try {
    const start = await req(s.base, 'GET', '/api/auth/google/start');
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    assert.match((await req(s.base, 'GET', '/api/auth/google/callback?code=a&state=' + state)).headers.get('location'), /login=ok/);
    const again = await req(s.base, 'GET', '/api/auth/google/callback?code=a&state=' + state);
    assert.match(decodeURIComponent(again.headers.get('location')), /hết hạn/);
    assert.equal(again.jar.hg_at, undefined);
    assert.match((await req(s.base, 'GET', '/api/auth/google/callback?code=a&state=gia')).headers.get('location'), /login_error/);
    assert.match(decodeURIComponent((await login(s.base, 'c')).location), /chưa được xác minh/);
    assert.match(decodeURIComponent((await req(s.base, 'GET', '/api/auth/google/callback?error=access_denied')).headers.get('location')), /hủy/);

    // Quá 10 phút thì state hết hạn
    const st2 = new URL((await req(s.base, 'GET', '/api/auth/google/start')).headers.get('location')).searchParams.get('state');
    s.clock.t += 11 * MIN;
    assert.match(decodeURIComponent((await req(s.base, 'GET', '/api/auth/google/callback?code=a&state=' + st2)).headers.get('location')), /hết hạn/);
  } finally { s.server.close(); }
});

test('không có Client ID thì tắt đăng nhập; return lạ bị chặn về /', async () => {
  const s = await startServer({ GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' });
  try {
    assert.equal((await req(s.base, 'GET', '/api/config')).data.googleLogin, false);
    assert.match((await req(s.base, 'GET', '/api/auth/google/start')).headers.get('location'), /^\/\?login_error=/);
  } finally { s.server.close(); }
  const s2 = await startServer();
  try {
    await req(s2.base, 'GET', '/api/auth/google/start?return=//evil.com');
    assert.equal(Object.values(s2.db.data.oauthStates)[0].returnTo, '/');
  } finally { s2.server.close(); }
});

/* ---------- JWT hết hạn, làm mới, xoay vòng ---------- */
test('access token hết hạn → refresh xoay vòng → dùng lại token cũ bị phát hiện', async () => {
  const s = await startServer();
  try {
    const { jar } = await login(s.base, 'a');
    s.clock.t += 16 * MIN; // quá 15 phút
    const exp = await req(s.base, 'GET', '/api/me', { jar });
    assert.equal(exp.status, 401);
    assert.equal(exp.data.code, 'token_expired');

    const r1 = await req(s.base, 'POST', '/api/auth/refresh', { jar });
    assert.equal(r1.status, 200);
    assert.notEqual(r1.jar.hg_rt, jar.hg_rt); // refresh token đã đổi
    assert.equal((await req(s.base, 'GET', '/api/me', { jar: r1.jar })).data.user.email, 'an@example.com');

    // Tab khác gửi token cũ ngay sau đó (trong 30 giây) → 409 bảo thử lại, không hủy phiên
    assert.equal((await req(s.base, 'POST', '/api/auth/refresh', { jar })).status, 409);

    // Token cũ bị dùng lại sau 30 giây → coi như bị đánh cắp → hủy cả chuỗi phiên
    s.clock.t += 31000;
    const reuse = await req(s.base, 'POST', '/api/auth/refresh', { jar });
    assert.equal(reuse.status, 401);
    assert.equal(reuse.data.code, 'reused');
    assert.equal((await req(s.base, 'POST', '/api/auth/refresh', { jar: r1.jar })).status, 401);

    // Hết hạn refresh (30 ngày) thì phải đăng nhập lại
    const fresh = await login(s.base, 'a');
    s.clock.t += 31 * 86400000;
    assert.equal((await req(s.base, 'POST', '/api/auth/refresh', { jar: fresh.jar })).status, 401);
  } finally { s.server.close(); }
});

test('đăng xuất mọi nơi và khóa tài khoản làm access token cũ mất hiệu lực ngay', async () => {
  const s = await startServer();
  try {
    const admin = await login(s.base, 'a');
    const d1 = await login(s.base, 'b');
    const d2 = await login(s.base, 'b');
    assert.equal((await req(s.base, 'GET', '/api/me', { jar: d1.jar })).data.sessions, 2);

    // Đăng xuất 1 máy: máy kia vẫn chạy
    await req(s.base, 'POST', '/api/auth/logout', { jar: d1.jar });
    assert.equal((await req(s.base, 'POST', '/api/auth/refresh', { jar: d1.jar })).status, 401);
    assert.equal((await req(s.base, 'GET', '/api/me', { jar: d2.jar })).data.user.email, 'binh@example.com');

    // Đăng xuất mọi nơi: access token của máy 2 (chưa hết 15 phút) cũng bị từ chối
    const d3 = await login(s.base, 'b');
    await req(s.base, 'POST', '/api/auth/logout-all', { jar: d3.jar });
    assert.equal((await req(s.base, 'GET', '/api/me', { jar: d2.jar })).status, 401);
    assert.equal((await req(s.base, 'POST', '/api/auth/refresh', { jar: d2.jar })).status, 401);

    // Quản trị khóa tài khoản → đăng xuất ngay
    const d4 = await login(s.base, 'b');
    const bid = (await req(s.base, 'GET', '/api/me', { jar: d4.jar })).data.user.id;
    await req(s.base, 'PATCH', '/api/admin/users/' + bid, { jar: admin.jar, body: { active: false } });
    assert.equal((await req(s.base, 'GET', '/api/me', { jar: d4.jar })).status, 401);
    assert.match(decodeURIComponent((await login(s.base, 'b')).location), /bị khóa/);
  } finally { s.server.close(); }
});

/* ---------- Chống giả mạo yêu cầu ---------- */
test('CSRF: thiếu header, Origin lạ, Sec-Fetch-Site cross-site đều bị chặn', async () => {
  const s = await startServer();
  try {
    const { jar } = await login(s.base, 'a');
    const body = { name: 'X' };
    assert.equal((await req(s.base, 'PATCH', '/api/me', { jar, body, csrf: false })).status, 403);
    assert.equal((await req(s.base, 'PATCH', '/api/me', { jar, body, headers: { Origin: 'https://evil.com' } })).status, 403);
    assert.equal((await req(s.base, 'PATCH', '/api/me', { jar, body, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    assert.equal((await req(s.base, 'PATCH', '/api/me', { jar, body, headers: { Origin: 'http://localhost:9' } })).status, 200);
    // JWT giả (sửa sub) bị từ chối
    const [h, b] = jar.hg_at.split('.');
    const forged = h + '.' + Buffer.from(JSON.stringify(Object.assign(JSON.parse(Buffer.from(b, 'base64url')), { sub: 'khac' }))).toString('base64url') + '.xx';
    assert.equal((await req(s.base, 'GET', '/api/me/data', { jar: { hg_at: forged } })).status, 401);
    // Thân request không phải JSON
    const r = await fetch(s.base + '/api/me', { method: 'PATCH', headers: { Cookie: cookieHeader(jar), 'X-Requested-With': 'hengio', 'Content-Type': 'text/plain' }, body: 'name=x' });
    assert.equal(r.status, 415);
  } finally { s.server.close(); }
});

/* ---------- Đồng bộ ---------- */
test('đồng bộ dữ liệu: phiên bản, mục lạ bị bỏ, quá lớn, xuất dữ liệu', async () => {
  const s = await startServer();
  try {
    const { jar } = await login(s.base, 'a');
    assert.equal((await req(s.base, 'GET', '/api/me/data')).status, 401);
    assert.deepEqual((await req(s.base, 'GET', '/api/me/data', { jar })).data, { version: 0, updatedAt: null, data: null });

    let r = await req(s.base, 'PUT', '/api/me/data', { jar, body: { baseVersion: 0, data: { tasks: ['A'], hack: 1 } } });
    assert.equal(r.data.version, 1);
    assert.deepEqual((await req(s.base, 'GET', '/api/me/data', { jar })).data.data, { tasks: ['A'] });

    r = await req(s.base, 'PUT', '/api/me/data', { jar, body: { baseVersion: 0, data: { tasks: ['B'] } } });
    assert.equal(r.status, 409);
    assert.deepEqual(r.data.data, { tasks: ['A'] });

    r = await req(s.base, 'PUT', '/api/me/data', { jar, body: { baseVersion: 1, data: { tasks: ['x'.repeat(400000)] } } });
    assert.equal(r.status, 413);

    const ex = await req(s.base, 'GET', '/api/me/export', { jar });
    assert.deepEqual(ex.data.data, { tasks: ['A'] });
    assert.match(ex.headers.get('content-disposition'), /attachment/);
  } finally { s.server.close(); }
});

test('đổi tên, xóa tài khoản, quản trị viên duy nhất không tự xóa được', async () => {
  const s = await startServer();
  try {
    const admin = await login(s.base, 'a');
    const u = await login(s.base, 'b');
    assert.equal((await req(s.base, 'PATCH', '/api/me', { jar: u.jar, body: { name: '  Bình   Minh ' } })).data.user.name, 'Bình Minh');
    assert.equal((await req(s.base, 'PATCH', '/api/me', { jar: u.jar, body: { name: '   ' } })).status, 400);
    assert.equal((await req(s.base, 'DELETE', '/api/me', { jar: admin.jar })).status, 400);
    assert.equal((await req(s.base, 'DELETE', '/api/me', { jar: u.jar })).status, 200);
    assert.ok(!Object.values(s.db.data.users).some((x) => x.email === 'binh@example.com'));
    assert.ok(!Object.values(s.db.data.refreshTokens).some((t) => !s.db.data.users[t.userId]));
  } finally { s.server.close(); }
});

/* ---------- Quản trị ---------- */
test('quản trị: chỉ admin, cấp Pro, cài đặt, không lộ secret, nhật ký, đóng đăng ký', async () => {
  const s = await startServer();
  try {
    const admin = await login(s.base, 'a');
    const user = await login(s.base, 'b');
    assert.equal((await req(s.base, 'GET', '/api/admin/users', { jar: user.jar })).status, 403);
    assert.equal((await req(s.base, 'GET', '/api/admin/users')).status, 401);

    let r = await req(s.base, 'GET', '/api/admin/users?q=binh', { jar: admin.jar });
    assert.equal(r.data.users.length, 1);
    const bid = r.data.users[0].id;
    assert.equal((await req(s.base, 'PATCH', '/api/admin/users/' + bid, { jar: admin.jar, body: { pro: true } })).data.user.pro, true);
    assert.equal((await req(s.base, 'GET', '/api/me', { jar: user.jar })).data.user.pro, true);
    assert.equal((await req(s.base, 'PATCH', '/api/admin/users/khong-hop-le', { jar: admin.jar, body: {} })).status, 404);

    const aid = (await req(s.base, 'GET', '/api/me', { jar: admin.jar })).data.user.id;
    assert.equal((await req(s.base, 'PATCH', '/api/admin/users/' + aid, { jar: admin.jar, body: { role: 'user' } })).status, 400);
    assert.equal((await req(s.base, 'DELETE', '/api/admin/users/' + aid, { jar: admin.jar })).status, 400);

    r = await req(s.base, 'PUT', '/api/admin/settings', { jar: admin.jar, body: { lockPremium: true, registrationOpen: false, googleClientSecret: '' } });
    assert.equal(r.status, 200);
    assert.equal((await req(s.base, 'GET', '/api/config')).data.lockPremium, true);

    r = await req(s.base, 'GET', '/api/admin/overview', { jar: admin.jar });
    assert.equal(r.data.counts.users, 2);
    assert.equal(r.data.counts.pro, 1);
    assert.equal(r.data.settings.googleClientSecretSet, true);
    assert.equal(r.data.settings.fromEnv.clientSecret, true);
    assert.ok(!JSON.stringify(r.data).includes('"sec"'));
    assert.ok(r.data.audit.some((a) => a.action === 'Cấp Pro'));

    assert.equal((await req(s.base, 'DELETE', '/api/admin/users/' + bid, { jar: admin.jar })).status, 200);
    assert.match(decodeURIComponent((await login(s.base, 'b')).location), /đóng đăng ký/);
  } finally { s.server.close(); }
});

/* ---------- File tĩnh + header bảo mật ---------- */
test('file tĩnh: chỉ phục vụ public/, có CSP, chặn .env, data, server, brand, đi ngược thư mục', async () => {
  const s = await startServer();
  try {
    const home = await req(s.base, 'GET', '/');
    assert.equal(home.status, 200);
    const csp = home.headers.get('content-security-policy');
    assert.match(csp, /script-src 'self'/); // không cho script inline
    assert.match(csp, /frame-ancestors 'none'/);
    assert.equal(home.headers.get('x-frame-options'), 'DENY');
    assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(!/<script>/.test(home.data), 'index.html không còn script inline');
    assert.equal((await req(s.base, 'GET', '/admin')).status, 200);
    assert.equal((await req(s.base, 'GET', '/assets/js/app.js')).status, 200);
    for (const p of ['/.env', '/../.env', '/data/db.json', '/server/app.js', '/package.json', '/brand/logo.png',
      '/assets/../../.env', '/assets/%2e%2e/%2e%2e/.env', '/tests/server.test.js', '/.gitignore']) {
      assert.equal((await req(s.base, 'GET', p)).status, 404, p);
    }
    assert.equal((await req(s.base, 'POST', '/index.html', { body: {} })).status, 405);
  } finally { s.server.close(); }
});

test('nâng cấp dữ liệu cũ (phiên cookie) sang JWT', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengio-old-'));
  fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify({
    meta: { schema: 1 }, secret: 'cu', settings: { lockPremium: true },
    users: { u1: { id: 'u1', email: 'a@b.c', role: 'admin', active: true, sync: { version: 3, data: { tasks: ['A'] } } } },
    sessions: { abc: { userId: 'u1', expiresAt: 9e15 } }, oauthStates: {}, audit: []
  }));
  const db = createStore(dir);
  assert.equal(db.data.meta.schema, 2);
  assert.equal(db.data.sessions, undefined);
  assert.equal(db.data.users.u1.tokenVersion, 0);
  assert.equal(db.data.users.u1.sync.version, 3);
  assert.equal(db.data.settings.lockPremium, true);
  assert.equal(db.data.settings.registrationOpen, true);
});

/* ---------- Thư viện nhạc ---------- */
test('thư viện nhạc: chỉ admin tải lên, kiểm tra định dạng + giấy phép, phát có Range, khóa bài Pro', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengio-music-'));
  const { server, base, db } = await startServer({ DATA_DIR: dataDir });
  try {
    const admin = (await login(base, 'a')).jar;   // người đầu tiên là quản trị
    const user = (await login(base, 'b')).jar;
    const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(997, 7)]);
    const upload = (jar, meta, body, extra = {}) => fetch(base + '/api/admin/music?meta=' + encodeURIComponent(JSON.stringify(meta)), {
      method: 'POST', body, headers: Object.assign({ Cookie: cookieHeader(jar), 'X-Requested-With': 'hengio', 'Content-Type': 'application/octet-stream' }, extra)
    }).then(async (r) => ({ status: r.status, data: await r.json() }));
    const meta = { title: 'Morning <b>Focus</b>', artist: 'Kevin', license: 'CC BY 4.0', source: 'https://example.com/track', tier: 'free', confirm: true };

    assert.equal((await upload(user, meta, mp3)).status, 403);
    assert.equal((await upload(admin, Object.assign({}, meta, { confirm: false }), mp3)).status, 400);
    assert.equal((await upload(admin, Object.assign({}, meta, { source: '' }), mp3)).status, 400, 'CC BY cần nguồn');
    assert.equal((await upload(admin, Object.assign({}, meta, { license: 'Tải trên mạng' }), mp3)).status, 400);
    assert.equal((await upload(admin, meta, Buffer.from('<html>not audio</html>'))).status, 415);
    // Không có header chống CSRF → bị chặn
    const noCsrf = await fetch(base + '/api/admin/music?meta={}', { method: 'POST', body: mp3, headers: { Cookie: cookieHeader(admin) } });
    assert.equal(noCsrf.status, 403);

    const ok = await upload(admin, meta, mp3);
    assert.equal(ok.status, 200);
    const id = ok.data.track.id;
    assert.equal(ok.data.track.mime, 'audio/mpeg');
    assert.ok(fs.existsSync(path.join(dataDir, 'music', id + '.mp3')), 'file nằm trong data/music');

    // Danh sách công khai: không lộ thông tin quản trị
    const pub = await req(base, 'GET', '/api/music');
    assert.equal(pub.data.tracks.length, 1);
    assert.equal(pub.data.tracks[0].artist, 'Kevin');
    assert.equal(pub.data.tracks[0].by, undefined);

    // Phát: cả file và từng đoạn (Range) để tua / lặp
    const full = await fetch(base + '/api/music/' + id + '/file');
    assert.equal(full.status, 200);
    assert.equal(full.headers.get('content-type'), 'audio/mpeg');
    assert.equal(full.headers.get('accept-ranges'), 'bytes');
    assert.equal((await full.arrayBuffer()).byteLength, 1000);
    const part = await fetch(base + '/api/music/' + id + '/file', { headers: { Range: 'bytes=0-2' } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), 'bytes 0-2/1000');
    assert.equal(Buffer.from(await part.arrayBuffer()).toString(), 'ID3');
    assert.equal((await fetch(base + '/api/music/' + id + '/file', { headers: { Range: 'bytes=5000-' } })).status, 416);

    // Bài Pro: khi đang bán nền thì người chưa mua không phát được
    db.data.settings.lockPremium = true;
    assert.equal((await req(base, 'PATCH', '/api/admin/music/' + id, { jar: admin, body: { tier: 'pro' } })).status, 200);
    assert.equal((await fetch(base + '/api/music/' + id + '/file')).status, 403);
    assert.equal((await req(base, 'GET', '/api/music', { jar: user })).data.tracks[0].locked, true);
    assert.equal((await fetch(base + '/api/music/' + id + '/file', { headers: { Cookie: cookieHeader(admin) } })).status, 200);

    // Ẩn bài → biến khỏi danh sách công khai; xóa → mất cả file
    await req(base, 'PATCH', '/api/admin/music/' + id, { jar: admin, body: { active: false } });
    assert.equal((await req(base, 'GET', '/api/music')).data.tracks.length, 0);
    assert.equal((await req(base, 'DELETE', '/api/admin/music/' + id, { jar: user })).status, 403);
    assert.equal((await req(base, 'DELETE', '/api/admin/music/' + id, { jar: admin })).status, 200);
    assert.ok(!fs.existsSync(path.join(dataDir, 'music', id + '.mp3')));
    assert.ok(db.data.audit.some((a) => /Thêm nhạc/.test(a.action || a.what || JSON.stringify(a))));
  } finally { server.close(); }
});

test('nhận diện định dạng nhạc bằng byte đầu file', () => {
  const { sniffAudio } = require('../server/services/music');
  const pad = (s) => Buffer.concat([Buffer.from(s, 'latin1'), Buffer.alloc(16)]);
  assert.equal(sniffAudio(pad('ID3')).ext, 'mp3');
  assert.equal(sniffAudio(Buffer.from([0xff, 0xfb, 0x90, 0, 0, 0, 0, 0, 0, 0, 0, 0])).ext, 'mp3');
  assert.equal(sniffAudio(pad('OggS')).ext, 'ogg');
  assert.equal(sniffAudio(pad('RIFF\0\0\0\0WAVE')).ext, 'wav');
  assert.equal(sniffAudio(pad('\0\0\0\x20ftypM4A ')).ext, 'm4a');
  assert.equal(sniffAudio(pad('fLaC')).ext, 'flac');
  assert.equal(sniffAudio(pad('<html>')), null);
  assert.equal(sniffAudio(pad('MZ')), null);
});
