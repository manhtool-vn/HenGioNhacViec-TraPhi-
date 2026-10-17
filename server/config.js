/* Cấu hình máy chủ, tính từ biến môi trường (.env). Mọi module khác chỉ đọc từ đây. */
'use strict';
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function createConfig(env) {
  env = env || {};
  const port = Number(env.PORT) || 5173;
  const publicUrl = String(env.PUBLIC_URL || env.CLIENT_URL || 'http://localhost:' + port).replace(/\/+$/, '');
  const isProd = env.NODE_ENV === 'production';
  return {
    env,
    root: ROOT,
    publicDir: path.resolve(ROOT, env.PUBLIC_DIR || 'public'),
    dataDir: path.resolve(ROOT, env.DATA_DIR || 'data'),
    port,
    host: env.HOST || undefined,
    publicUrl,
    origin: new URL(publicUrl).origin,
    https: publicUrl.startsWith('https://'),
    isProd,
    trustProxy: env.TRUST_PROXY === 'true',
    adminEmails: String(env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    // JWT: khóa ký lấy từ JWT_SECRET; bản chạy thử tự sinh và lưu trong data/ nếu chưa đặt
    jwtSecret: env.JWT_SECRET ? String(env.JWT_SECRET) : null,
    jwtIssuer: 'manhtool-hen-gio',
    accessTtlSec: Math.max(60, Number(env.ACCESS_TOKEN_MINUTES) * 60 || 15 * 60),
    refreshTtlSec: Math.max(1, Number(env.SESSION_DAYS) || 30) * 86400
  };
}

// Báo lỗi cấu hình nguy hiểm trước khi chạy thật
function checkConfig(cfg) {
  const problems = [];
  if (cfg.isProd) {
    if (!cfg.jwtSecret || cfg.jwtSecret.length < 32) problems.push('JWT_SECRET phải có ít nhất 32 ký tự khi NODE_ENV=production');
    if (!cfg.https) problems.push('PUBLIC_URL phải là https:// khi NODE_ENV=production');
  }
  return problems;
}

module.exports = { createConfig, checkConfig, ROOT };
