/* Người dùng: tạo / liên kết từ hồ sơ Google, dữ liệu trả ra ngoài, nhật ký quản trị, dữ liệu đồng bộ. */
'use strict';
const crypto = require('node:crypto');

const SYNC_KEYS = ['tasks', 'plan', 'saved', 'opts', 'stats'];
const MAX_SYNC = 300 * 1024;

function createUserService({ config, db, now }) {
  const iso = () => new Date(now()).toISOString();

  // Chỉ những trường này được gửi về trình duyệt
  function toPublic(u) {
    return {
      id: u.id, email: u.email, name: u.name, picture: u.picture || '', role: u.role, pro: !!u.pro,
      ownedThemes: Array.isArray(u.ownedThemes) ? u.ownedThemes.slice() : [], createdAt: u.createdAt,
      // quyền lợi được giữ vĩnh viễn từ chương trình mở miễn phí ('themes', 'music')
      freeKeep: Array.isArray(u.freeKeep) ? u.freeKeep.slice() : []
    };
  }

  function admins() { return Object.values(db.data.users).filter((u) => u.role === 'admin' && u.active); }

  // Tìm theo Google ID → theo email → tạo mới. Trả về { user } hoặc { error }
  function fromGoogle(profile) {
    const email = String(profile.email || '').trim().toLowerCase();
    if (!profile.sub || !email) return { error: 'Tài khoản Google không cung cấp email' };
    if (profile.email_verified === false) return { error: 'Email Google chưa được xác minh' };

    const all = Object.values(db.data.users);
    let user = all.find((u) => u.googleId === profile.sub) || all.find((u) => u.email === email);
    if (!user) {
      const first = all.length === 0;
      if (!first && db.data.settings.registrationOpen === false && !config.adminEmails.includes(email)) {
        return { error: 'Hệ thống đang tạm đóng đăng ký tài khoản mới' };
      }
      user = {
        id: crypto.randomUUID(), googleId: profile.sub, email,
        name: String(profile.name || email.split('@')[0]).slice(0, 100),
        picture: '',
        // Tài khoản đầu tiên hoặc email trong ADMIN_EMAILS là quản trị viên
        role: first || config.adminEmails.includes(email) ? 'admin' : 'user',
        pro: false, active: true, tokenVersion: 0, createdAt: iso(), lastLoginAt: null,
        sync: { version: 0, updatedAt: null, data: null }
      };
      db.data.users[user.id] = user;
      audit(null, 'Tạo tài khoản', email);
    }
    if (!user.active) return { error: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ ManhTool.' };
    user.googleId = profile.sub;
    if (profile.name) user.name = String(profile.name).slice(0, 100);
    // Chỉ nhận ảnh đại diện từ máy chủ ảnh của Google
    if (typeof profile.picture === 'string' && /^https:\/\/[\w.-]+\.googleusercontent\.com\//.test(profile.picture)) user.picture = profile.picture.slice(0, 500);
    if (config.adminEmails.includes(email)) user.role = 'admin';
    user.lastLoginAt = iso();
    return { user };
  }

  function audit(actor, action, target) {
    db.data.audit.unshift({ at: iso(), actor: actor ? actor.email : 'hệ thống', action, target: target || '' });
    db.data.audit.length = Math.min(db.data.audit.length, 200);
  }

  // Chỉ nhận đúng các mục đã biết; nội dung chi tiết được trang làm sạch lại khi đọc
  function cleanSync(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const out = {};
    SYNC_KEYS.forEach((k) => { if (data[k] !== undefined && data[k] !== null) out[k] = data[k]; });
    return Buffer.byteLength(JSON.stringify(out)) > MAX_SYNC ? false : out;
  }

  // Tổng hợp cho trang quản trị: số lượt và thời gian 7 ngày qua
  function summary(u, devices) {
    const stats = u.sync && u.sync.data && u.sync.data.stats;
    let ms7 = 0, rounds7 = 0;
    if (stats && typeof stats === 'object') {
      const since = new Date(now() - 7 * 86400000).toISOString().slice(0, 10);
      Object.keys(stats).forEach((k) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(k) && k >= since) { ms7 += Number(stats[k].ms) || 0; rounds7 += Number(stats[k].rounds) || 0; }
      });
    }
    return Object.assign(toPublic(u), { active: !!u.active, lastLoginAt: u.lastLoginAt, syncedAt: u.sync && u.sync.updatedAt, ms7, rounds7, sessions: devices });
  }

  return { toPublic, fromGoogle, audit, admins, cleanSync, summary, iso };
}

module.exports = { createUserService, SYNC_KEYS };
