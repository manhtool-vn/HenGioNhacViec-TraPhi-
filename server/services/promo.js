/* Chương trình mở miễn phí + lời giới thiệu ManhTool (admin → tab "Miễn phí & giới thiệu").
   Chuẩn hoá cấu hình dùng chung với trình duyệt qua public/assets/js/mt-promo.js.
   - settings.free: đang chạy thì quyền lợi được chọn (nền Pro / nhạc Pro) mở cho mọi người;
     free.keep: tài khoản đăng nhập trong thời gian đó được giữ quyền lợi vĩnh viễn (user.freeKeep).
   - settings.brand: popup giới thiệu hiện cho người dùng bản miễn phí (khách, tài khoản chưa trả tiền). */
'use strict';
const P = require('../../public/assets/js/mt-promo.js');

const FEATURES = [
  { key: 'themes', label: 'Nền Pro & nền mùa lễ', hint: 'Mọi nền Pro, nền Lễ Tết và nền "Ảnh của bạn"' },
  { key: 'music', label: 'Nhạc nền Pro', hint: 'Các bản nhạc Pro trong thư viện và âm thanh tập trung Pro' }
];
const KEYS = FEATURES.map((f) => f.key);
const BASE = P.defaults('hengio', '/assets/img/dsv24h.svg');

function createPromoService({ db, now }) {
  const s = () => db.data.settings;
  const free = () => P.normalizeFree(s().free, KEYS);
  const running = () => P.freeOn(free(), now());
  const brand = () => P.normalizeBrand(s().brand || BASE, BASE);

  // Quyền lợi key đang mở cho người dùng này? (chưa bật bán nền thì mọi thứ đã miễn phí)
  function has(user, key) {
    if (!s().lockPremium) return true;
    if (P.freeHas(free(), key, now())) return true;
    return !!(user && Array.isArray(user.freeKeep) && user.freeKeep.includes(key));
  }
  // Đang chạy chương trình có "giữ vĩnh viễn" → ghi nhận quyền lợi cho tài khoản (gọi khi tài khoản mở trang)
  function claim(user) {
    const f = running();
    if (!user || !f || !f.keep) return false;
    const cur = Array.isArray(user.freeKeep) ? user.freeKeep : [];
    const add = f.features.filter((k) => !cur.includes(k));
    if (!add.length) return false;
    user.freeKeep = cur.concat(add);
    user.freeKeepAt = user.freeKeepAt || now();
    db.save();
    return true;
  }
  // Tài khoản đã trả tiền (hoặc được admin cấp Pro) không bị tự hiện popup giới thiệu
  const paying = (user) => !!(user && (user.pro || (Array.isArray(user.ownedThemes) && user.ownedThemes.length)));

  // Gửi cho trình duyệt: chương trình đang chạy + popup (nếu bật)
  function publicInfo() {
    const b = brand();
    return { free: running() || null, brand: b.enabled ? b : null };
  }
  function adminInfo() {
    const all = Object.values(db.data.users);
    const kept = all.filter((u) => Array.isArray(u.freeKeep) && u.freeKeep.length).length;
    return {
      free: free(), running: !!running(), brand: brand(),
      stats: [
        { label: 'Tài khoản được giữ quyền lợi vĩnh viễn', value: kept },
        { label: s().lockPremium ? 'Nền & nhạc Pro đang bán (khoá)' : 'Chưa bật khoá nền Pro — mọi thứ đang miễn phí', value: s().lockPremium ? 'Đang bán' : 'Mở hết' }
      ]
    };
  }
  function setFree(input) {
    if (input === null) { delete s().free; db.save(); return { ok: true }; }
    const err = P.freeError(input, KEYS, now());
    if (err) return { error: err };
    s().free = P.normalizeFree(input, KEYS);
    db.save();
    return { ok: true };
  }
  function setBrand(input) {
    s().brand = P.normalizeBrand(input, BASE);
    db.save();
    return s().brand;
  }

  return { FEATURES, BASE, has, claim, paying, publicInfo, adminInfo, setFree, setBrand, running, brand };
}

module.exports = { createPromoService, FEATURES };
