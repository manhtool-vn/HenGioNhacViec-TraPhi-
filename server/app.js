/* ManhTool — Hẹn giờ nhắc việc: ghép các phần của máy chủ thành 1 hàm xử lý request.
   Cấu trúc:
     config.js            cấu hình từ .env
     lib/                 tiện ích thuần: http, jwt, rate limit, đọc .env
     db/store.js          lưu dữ liệu (JSON)
     services/            nghiệp vụ: token (JWT + refresh), Google OAuth, người dùng
     routes/              định tuyến: auth, me, admin, file tĩnh */
'use strict';
const { createConfig } = require('./config');
const { json, clientIp, HttpError } = require('./lib/http');
const { createRateLimiter } = require('./lib/rateLimit');
const { createTokenService } = require('./services/tokens');
const { createGoogleService } = require('./services/google');
const { createUserService } = require('./services/users');
const { authRoutes } = require('./routes/auth');
const { meRoutes } = require('./routes/me');
const { adminRoutes } = require('./routes/admin');
const { shopRoutes } = require('./routes/shop');
const { serveStatic } = require('./routes/static');
const { createPaymentService } = require('./services/payments');

const CSRF_HEADER = 'x-requested-with';
const CSRF_VALUE = 'hengio';
const ROUTES = [authRoutes, meRoutes, shopRoutes, adminRoutes];
// Máy chủ ngân hàng gọi vào (không phải trình duyệt) → không áp chống CSRF, xác thực bằng khóa riêng
const SERVER_TO_SERVER = new Set(['/api/payments/webhook']);

function createApp(opts) {
  const config = opts.config || createConfig(opts.env);
  const db = opts.db;
  const now = opts.now || Date.now;
  const log = opts.log || ((...a) => console.log(...a));
  const fetch = opts.fetch || globalThis.fetch;

  const ctx = { config, db, now, log, limited: createRateLimiter(now) };
  ctx.tokens = createTokenService(ctx);
  ctx.google = createGoogleService({ config, db, fetch, log });
  ctx.users = createUserService(ctx);
  ctx.payments = createPaymentService(ctx);

  // Lấy người dùng đang đăng nhập; nếu không có thì trả lỗi 401 (code token_expired để trang tự làm mới token)
  ctx.requireUser = function (req, res) {
    const a = ctx.tokens.authenticate(req);
    if (a.user) return a.user;
    json(res, config, 401, a.error === 'none'
      ? { error: 'Chưa đăng nhập', code: 'unauthorized' }
      : { error: 'Phiên đăng nhập hết hạn', code: 'token_expired' });
    return null;
  };

  // Chống giả mạo yêu cầu (CSRF) cho mọi thao tác ghi:
  //  - phải có header X-Requested-With (trang khác không gửi được nếu không qua CORS, mà máy chủ không bật CORS)
  //  - nếu trình duyệt gửi Origin / Sec-Fetch-Site thì phải là cùng trang
  function csrfOk(req) {
    if (req.method === 'GET' || req.method === 'HEAD') return true;
    if (req.headers[CSRF_HEADER] !== CSRF_VALUE) return false;
    const origin = req.headers.origin;
    if (origin && origin !== config.origin) return false;
    const site = req.headers['sec-fetch-site'];
    if (site && site !== 'same-origin' && site !== 'none') return false;
    return true;
  }

  return async function handler(req, res) {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch (e) { res.writeHead(400); return res.end(); }
    try {
      if (!url.pathname.startsWith('/api/')) return serveStatic(ctx, req, res, url);
      if (!SERVER_TO_SERVER.has(url.pathname) && !csrfOk(req)) return json(res, config, 403, { error: 'Yêu cầu không hợp lệ', code: 'csrf' });
      for (const route of ROUTES) if (await route(ctx, req, res, url)) return;
      return json(res, config, 404, { error: 'Không tìm thấy' });
    } catch (e) {
      if (e instanceof HttpError) return json(res, config, e.status, { error: e.message });
      log('[server] Lỗi khi xử lý', req.method, url.pathname, 'từ', clientIp(req, config), e);
      if (!res.headersSent) return json(res, config, 500, { error: 'Lỗi máy chủ' });
      res.end();
    }
  };
}

module.exports = { createApp };
