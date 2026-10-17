/* Lưu dữ liệu vào 1 file JSON (data/db.json). Đủ dùng cho vài nghìn tài khoản;
   ghi qua file tạm rồi đổi tên để không bao giờ để lại file hỏng nửa chừng.
   Muốn chuyển sang PostgreSQL/SQLite sau này: chỉ cần viết lại module này với cùng giao diện. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SCHEMA = 2;

function defaults() {
  return {
    meta: { schema: SCHEMA, createdAt: new Date().toISOString() },
    // Khóa ký JWT cho bản chạy thử (khi chưa đặt JWT_SECRET)
    secret: crypto.randomBytes(48).toString('base64url'),
    settings: {
      googleClientId: '', googleClientSecret: '', googleLoginEnabled: true, registrationOpen: true, lockPremium: false,
      // Thanh toán chuyển khoản VietQR (đối soát tự động qua webhook, ví dụ SePay)
      payment: {
        enabled: false, bankId: '', accountNo: '', accountName: '',
        pricePro: 49000, priceSeason: 29000, priceTheme: 9000
      }
    },
    users: {},          // id → hồ sơ + dữ liệu đồng bộ
    orders: {},         // id → đơn mua nền
    music: {},          // id → bài trong thư viện nhạc (file ở data/music/)
    payments: {},       // mã giao dịch ngân hàng → đã xử lý (chống xử lý trùng) + tiền chưa khớp đơn
    refreshTokens: {},  // sha256(token) → { userId, family, expiresAt, usedAt, ua, createdAt }
    oauthStates: {},    // sha256(state) → { verifier, returnTo, expiresAt }
    audit: []           // nhật ký thao tác quản trị (giữ 200 dòng gần nhất)
  };
}

// Nâng cấp dữ liệu từ phiên bản cũ
function migrate(data) {
  if (!data.meta || data.meta.schema < 2) {
    // Bản 1 dùng phiên cookie (sessions) → bản 2 dùng JWT + refresh token: mọi người đăng nhập lại 1 lần
    delete data.sessions;
    data.refreshTokens = data.refreshTokens || {};
    Object.values(data.users || {}).forEach((u) => { if (typeof u.tokenVersion !== 'number') u.tokenVersion = 0; });
    data.meta = Object.assign({}, data.meta, { schema: SCHEMA });
  }
  return data;
}

function createStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'db.json');
  let data = defaults();
  if (fs.existsSync(file)) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    data = migrate(Object.assign(defaults(), raw));
    data.settings = Object.assign(defaults().settings, raw.settings || {});
    data.settings.payment = Object.assign(defaults().settings.payment, (raw.settings && raw.settings.payment) || {});
  }

  function save() {
    const tmp = file + '.tmp';
    const text = JSON.stringify(data);
    fs.writeFileSync(tmp, text, { mode: 0o600 });
    try {
      fs.renameSync(tmp, file);
    } catch (e) {
      // Windows đôi khi khóa file (phần mềm diệt virus) → ghi thẳng
      fs.writeFileSync(file, text, { mode: 0o600 });
      try { fs.unlinkSync(tmp); } catch (e2) { /* bỏ qua */ }
    }
  }

  // Dọn token / state hết hạn
  function prune(now) {
    let changed = false;
    for (const [k, t] of Object.entries(data.refreshTokens)) {
      // Token đã dùng giữ thêm 1 ngày để còn phát hiện bị dùng lại
      const dead = t.expiresAt <= now || (t.usedAt && t.usedAt + 86400000 <= now) || !data.users[t.userId];
      if (dead) { delete data.refreshTokens[k]; changed = true; }
    }
    for (const [k, s] of Object.entries(data.oauthStates)) if (s.expiresAt <= now) { delete data.oauthStates[k]; changed = true; }
    if (changed) save();
  }

  save();
  return { data, save, prune, file };
}

module.exports = { createStore, SCHEMA };
