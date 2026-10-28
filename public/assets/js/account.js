/* ManhTool — Hẹn giờ nhắc việc: đăng nhập Google, tài khoản, đồng bộ dữ liệu giữa các thiết bị.
   Chỉ hoạt động khi trang chạy cùng máy chủ (npm start). Mở file tĩnh thì phần này tự ẩn. */
(function () {
  'use strict';

  var TT = window.TimerThemes, TC = window.TimerCore;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = { sync: 'mt-hg-sync', backup: 'mt-hg-backup', flash: 'mt-hg-flash', reloaded: 'mt-hg-reloaded' };
  // Mục được đồng bộ ↔ khóa localStorage tương ứng
  var DATA_KEYS = { tasks: 'mt-hg-tasks', plan: 'mt-hg-plan', saved: 'mt-hg-saved', opts: 'mt-hg-opts', stats: 'mt-hg-stats' };
  // Tùy chọn gắn với từng máy, không đồng bộ
  var LOCAL_OPTS = ['notify', 'wake'];
  var LOCAL_EXTRA = ['mt-hg-state', 'mt-hg-round', 'mt-hg-run', 'mt-hg-photo'];

  var st = { cfg: null, user: null, sessions: 0, syncing: false, lastSync: null, error: '', pushTimer: null };

  /* ---------- Tiện ích ---------- */
  function api(method, path, body) { return window.HGApi.request(method, path, body); }
  function load(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function remove(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function toast(msg, label, fn) { if (window.TimerApp) window.TimerApp.toast(msg, label, fn); }
  function clock(iso) {
    var d = new Date(iso);
    return d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
  }

  function readLocal() {
    var d = {};
    Object.keys(DATA_KEYS).forEach(function (k) {
      var v = load(DATA_KEYS[k]);
      if (v !== null) d[k] = v;
    });
    if (d.opts) { d.opts = Object.assign({}, d.opts); LOCAL_OPTS.forEach(function (k) { delete d.opts[k]; }); }
    return d;
  }

  // Ghi dữ liệu từ máy chủ vào máy này; thống kê thì gộp (lấy số lớn hơn mỗi ngày) để không mất lượt nào
  function writeLocal(data) {
    data = data || {};
    var local = readLocal();
    Object.keys(DATA_KEYS).forEach(function (k) {
      if (data[k] === undefined) return;
      var v = data[k];
      if (k === 'opts') {
        var mine = load(DATA_KEYS.opts) || {};
        v = Object.assign({}, v);
        LOCAL_OPTS.forEach(function (o) { if (mine[o] !== undefined) v[o] = mine[o]; });
      }
      if (k === 'stats') v = mergeStats(local.stats, v);
      store(DATA_KEYS[k], v);
    });
  }

  function mergeStats(a, b) {
    var x = TC.cleanHistory(a), y = TC.cleanHistory(b), out = {};
    Object.keys(x).concat(Object.keys(y)).forEach(function (k) {
      var p = x[k] || { rounds: 0, ms: 0 }, q = y[k] || { rounds: 0, ms: 0 };
      out[k] = { rounds: Math.max(p.rounds, q.rounds), ms: Math.max(p.ms, q.ms) };
    });
    return TC.cleanHistory(out);
  }

  function marker() { return load(KEY.sync) || {}; }
  function setMarker(m) { store(KEY.sync, m); }

  // Tải lại trang để áp dữ liệu mới (đồng hồ đang chạy vẫn giữ nguyên vì lưu riêng trên máy)
  function reloadWith(msg) {
    var last = 0;
    try { last = +sessionStorage.getItem(KEY.reloaded) || 0; } catch (e) {}
    // Chống tải lại liên tục: lần thứ 2 trong 15 giây thì để người dùng tự bấm
    if (Date.now() - last < 15000) { toast(msg, 'Tải lại', function () { location.reload(); }); return; }
    try { sessionStorage.setItem(KEY.reloaded, String(Date.now())); sessionStorage.setItem(KEY.flash, msg); } catch (e) {}
    location.reload();
  }

  /* ---------- Đồng bộ ---------- */
  function backupLocal() { store(KEY.backup, { at: new Date().toISOString(), data: readLocal() }); }

  function sync(reason) {
    if (!st.user || st.syncing) return Promise.resolve();
    st.syncing = true;
    st.error = '';
    renderSync();
    var m = marker();
    var p;
    if (m.userId !== st.user.id) {
      // Lần đầu tài khoản này dùng trên máy này
      p = api('GET', '/me/data').then(function (r) {
        if (!r.ok) throw new Error(r.data.error || 'Không tải được dữ liệu');
        if (!r.data.version || !r.data.data) {
          return push(0, { userId: st.user.id });
        }
        backupLocal();
        writeLocal(r.data.data);
        setMarker({ userId: st.user.id, version: r.data.version, dirty: false });
        reloadWith('Đã tải dữ liệu từ tài khoản của bạn. Bản trên máy này được giữ dự phòng trong mục Tài khoản.');
      });
    } else if (m.dirty) {
      p = push(m.version || 0, m);
    } else if (reason === 'load' || reason === 'manual') {
      p = api('GET', '/me/data').then(function (r) {
        if (!r.ok) throw new Error(r.data.error || 'Không tải được dữ liệu');
        if (r.data.version > (m.version || 0)) {
          writeLocal(r.data.data);
          setMarker({ userId: st.user.id, version: r.data.version, dirty: false });
          reloadWith('Đã cập nhật dữ liệu mới từ thiết bị khác');
        } else {
          st.lastSync = r.data.updatedAt || new Date().toISOString();
        }
      });
    } else {
      p = Promise.resolve();
    }
    return p.catch(function (e) { st.error = e.message || 'Lỗi đồng bộ'; })
      .then(function () { st.syncing = false; renderSync(); });
  }

  function push(baseVersion, m) {
    return api('PUT', '/me/data', { baseVersion: baseVersion, data: readLocal() }).then(function (r) {
      if (r.ok) {
        setMarker({ userId: st.user.id, version: r.data.version, dirty: false });
        st.lastSync = r.data.updatedAt;
        return;
      }
      if (r.status === 409) {
        // Thiết bị khác vừa đổi dữ liệu: dùng bản mới nhất, giữ bản của máy này làm dự phòng
        backupLocal();
        writeLocal(r.data.data);
        setMarker({ userId: st.user.id, version: r.data.version, dirty: false });
        if (window.TimerApp && window.TimerApp.isBusy()) {
          toast('Có dữ liệu mới từ thiết bị khác', 'Tải lại', function () { location.reload(); });
        } else {
          reloadWith('Dữ liệu đã đổi trên thiết bị khác nên đã dùng bản mới nhất. Bản của máy này được giữ dự phòng.');
        }
        return;
      }
      throw new Error(r.data.error || 'Không đồng bộ được');
    });
  }

  // app.js gọi mỗi khi lưu dữ liệu cần đồng bộ
  function dirty() {
    if (!st.user) return;
    var m = marker();
    if (m.userId !== st.user.id) return;
    if (!m.dirty) { m.dirty = true; setMarker(m); }
    clearTimeout(st.pushTimer);
    st.pushTimer = setTimeout(function () { sync('change'); }, 2000);
    renderSync();
  }

  /* ---------- Quyền Pro ---------- */
  function applyEntitlement() {
    var cfg = st.cfg || {}, u = st.user;
    // Chương trình mở miễn phí đang chạy, hoặc quyền lợi được giữ vĩnh viễn từ chương trình trước (user.freeKeep)
    var free = window.MTPromo ? window.MTPromo.freeOn(cfg.free) : null;
    var kept = (u && u.freeKeep) || [];
    var open = function (k) { return !!(free && free.features.indexOf(k) !== -1) || kept.indexOf(k) !== -1; };
    TT.lockPremium = !!cfg.lockPremium;
    TT.freeThemes = open('themes');
    TT.freeMusic = open('music');
    TT.freeUntil = free && free.features.indexOf('themes') !== -1 ? free.endsAt : 0;
    TT.owned.length = 0;
    if ((u && u.pro) || TT.freeThemes) TT.list.forEach(function (t) { if (t.tier === 'pro') TT.owned.push(t.id); });
    else if (u && Array.isArray(u.ownedThemes)) u.ownedThemes.forEach(function (id) { TT.owned.push(id); });
    var note = $('themeNoteText');
    if (note) {
      note.textContent = !TT.lockPremium ? 'Các nền Pro đang cho dùng thử miễn phí.'
        : kept.indexOf('themes') !== -1 ? 'Bạn được giữ mọi nền Pro vĩnh viễn từ chương trình miễn phí.'
          : 'Các nền Pro đang mở miễn phí' + (TT.freeUntil ? ' đến ' + clock(TT.freeUntil) + ' ' + new Date(TT.freeUntil).toLocaleDateString('vi-VN') : '') + '.';
    }
    if (window.TimerApp) window.TimerApp.refreshThemes();
    if (window.TimerShop) window.TimerShop.refresh();
  }

  /* ---------- Chương trình mở miễn phí & lời giới thiệu ManhTool (mt-promo.js) ---------- */
  var promoStarted = false;
  function freeTitle(f) {
    var t = f.features.indexOf('themes') !== -1, m = f.features.indexOf('music') !== -1;
    return t && m ? 'Nền & nhạc Pro đang miễn phí' : t ? 'Mọi nền Pro đang miễn phí' : 'Nhạc nền Pro đang miễn phí';
  }
  function announceOpts(f, force) {
    var u = st.user, t = f.features.indexOf('themes') !== -1, m = f.features.indexOf('music') !== -1;
    var pro = TT.list.filter(function (x) { return x.tier === 'pro'; }).length;
    var canKeep = f.keep && st.cfg.googleLogin;
    var perks = [];
    if (t) perks.push(pro + ' nền Pro và nền Lễ Tết', 'Dùng ảnh của bạn làm nền');
    if (m) perks.push('Nhạc nền Pro giúp tập trung');
    perks.push(canKeep ? 'Đăng nhập là giữ vĩnh viễn' : 'Không cần thanh toán');
    var target = document.querySelector(t ? '#themeGrid' : '.music-group') || document.body;
    return {
      force: force, title: freeTitle(f),
      text: 'Chọn nền đẹp, bật nhạc tập trung rồi bắt đầu đếm giờ — không cần thanh toán.',
      perks: perks,
      cta: canKeep && !u ? { label: 'Đăng nhập để giữ vĩnh viễn', onClick: login }
        : { label: t ? 'Chọn nền Pro ngay' : 'Bật nhạc Pro ngay', onClick: function () { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); } },
      note: !canKeep ? 'Hết chương trình, nền và nhạc Pro khoá lại như cũ.'
        : u ? 'Tài khoản ' + u.email + ' đã được giữ các quyền lợi này vĩnh viễn.'
          : 'Đăng nhập Google trong thời gian này để giữ quyền lợi vĩnh viễn, kể cả khi chương trình kết thúc.'
    };
  }
  // Hết giờ chương trình khi đang mở trang → lấy lại cấu hình, khoá lại nền/nhạc Pro
  function reloadConfig() {
    api('GET', '/config').then(function (r) { if (r.ok) { st.cfg = r.data; applyEntitlement(); } }, function () {});
  }
  function promoUi() {
    var P = window.MTPromo;
    if (!P || !st.cfg || promoStarted) return;
    promoStarted = true;
    var u = st.user, admin = !!(u && u.role === 'admin');
    var free = P.freeOn(st.cfg.free), brand = st.cfg.brand;
    var paying = !!(u && (u.pro || (u.ownedThemes || []).length));
    // Không chen ngang khi đang đếm giờ, đang ở màn hình lớn hoặc đang mở hộp thoại khác
    var guard = function () { return !(window.TimerApp && window.TimerApp.isBusy()) && $('stage').hidden; };
    if (free) {
      P.bar(free, { text: freeTitle(free), onClick: function () { P.announce(free, brand, announceOpts(free, true)); }, onEnd: reloadConfig });
      // Quản trị viên không bị tự hiện (vẫn bấm dải xanh để xem)
      if (!admin) P.scheduleAnnounce(free, brand, Object.assign(announceOpts(free), { guard: guard }));
    }
    if (brand && !paying) {
      var kick = free ? 'Mở Pro miễn phí, đồng hành cùng' : 'Hẹn giờ miễn phí, đồng hành cùng';
      var host = document.querySelector('[data-mp-chip]');
      if (host) P.chip(brand, host, { label: 'Đồng hành cùng', kick: kick });
      if (!admin) P.schedule(brand, { kick: kick, guard: guard });
    }
  }

  /* ---------- Giao diện ---------- */
  var dlg = $('accountDialog');

  function renderHeader() {
    var loginBtn = $('btnLogin'), accBtn = $('btnAccount');
    loginBtn.hidden = !(st.cfg && st.cfg.googleLogin && !st.user);
    accBtn.hidden = !st.user;
    if (!st.user) return;
    var img = accBtn.querySelector('img'), ini = accBtn.querySelector('.avatar-ini');
    if (st.user.picture) { img.src = st.user.picture; img.hidden = false; ini.hidden = true; }
    else { img.hidden = true; ini.hidden = false; ini.textContent = (st.user.name || st.user.email).charAt(0).toUpperCase(); }
    accBtn.title = st.user.name + ' (' + st.user.email + ')';
    accBtn.setAttribute('aria-label', 'Tài khoản: ' + st.user.name);
  }

  function renderSync() {
    var accBtn = $('btnAccount');
    var m = marker();
    accBtn.dataset.sync = st.error ? 'error' : st.syncing || m.dirty ? 'busy' : 'ok';
    if (!dlg.open) return;
    var t = $('accSyncText');
    if (st.error) t.textContent = 'Lỗi: ' + st.error;
    else if (st.syncing) t.textContent = 'Đang đồng bộ…';
    else if (m.dirty) t.textContent = 'Có thay đổi chưa đồng bộ';
    else t.textContent = st.lastSync ? 'Đã đồng bộ lúc ' + clock(st.lastSync) : 'Đã đồng bộ';
    $('accSyncDot').dataset.sync = accBtn.dataset.sync;
  }

  function renderDialog() {
    var u = st.user;
    var av = $('accAvatar');
    if (u.picture) { av.src = u.picture; av.hidden = false; } else av.hidden = true;
    $('accName').textContent = u.name;
    $('accEmail').textContent = u.email;
    var badges = $('accBadges');
    badges.textContent = '';
    var bought = (u.ownedThemes || []).length;
    [[u.pro ? 'Gói Pro trọn đời' : 'Gói miễn phí', u.pro ? 'is-pro' : ''],
      !u.pro && bought ? ['Đã mua ' + bought + ' nền', ''] : null,
      u.role === 'admin' ? ['Quản trị viên', 'is-admin'] : null,
      [st.sessions + ' thiết bị đang đăng nhập', '']].forEach(function (b) {
      if (!b) return;
      var s = document.createElement('span');
      s.className = 'acc-badge ' + b[1];
      s.textContent = b[0];
      badges.appendChild(s);
    });
    $('accAdmin').hidden = u.role !== 'admin';
    $('accUpgrade').hidden = !(window.TimerShop && window.TimerShop.available() && !u.pro);
    var bk = load(KEY.backup);
    $('accRestore').hidden = !(bk && bk.data);
    if (bk && bk.at) $('accRestore').title = 'Bản lưu lúc ' + new Date(bk.at).toLocaleString('vi-VN');
    $('accDelConfirm').checked = false;
    $('accDelete').disabled = true;
    $('accRename').hidden = true;
    $('accNameRow').hidden = false;
    renderSync();
  }

  function openDialog() {
    renderDialog();
    if (dlg.showModal) dlg.showModal();
    // Lấy số thiết bị mới nhất
    api('GET', '/me').then(function (r) {
      if (r.ok && r.data.user) { st.user = r.data.user; st.sessions = r.data.sessions; if (dlg.open) renderDialog(); }
    });
  }

  function login() {
    location.href = '/api/auth/google/start?return=' + encodeURIComponent(location.pathname);
  }

  function wipeLocal() {
    Object.keys(DATA_KEYS).forEach(function (k) { remove(DATA_KEYS[k]); });
    LOCAL_EXTRA.concat([KEY.sync, KEY.backup]).forEach(remove);
  }

  function logout(all) {
    var wipe = $('accWipe').checked;
    api('POST', all ? '/auth/logout-all' : '/auth/logout').then(function () {
      remove(KEY.sync);
      if (wipe) wipeLocal();
      try { sessionStorage.setItem(KEY.flash, wipe ? 'Đã đăng xuất và xóa dữ liệu trên máy này' : 'Đã đăng xuất'); } catch (e) {}
      location.reload();
    });
  }

  /* ---------- Sự kiện ---------- */
  $('btnLogin').addEventListener('click', login);
  $('btnAccount').addEventListener('click', openDialog);
  $('accClose').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  $('accSyncNow').addEventListener('click', function () { sync('manual'); });
  // Tải dữ liệu: làm mới token trước (nếu đã hết hạn) rồi mới mở liên kết tải
  $('accExport').addEventListener('click', function (e) {
    e.preventDefault();
    api('GET', '/me').then(function (r) {
      if (r.ok && r.data.user) location.href = '/api/me/export';
      else toast('Phiên đăng nhập đã hết, vui lòng đăng nhập lại');
    });
  });
  $('accLogout').addEventListener('click', function () { logout(false); });
  $('accLogoutAll').addEventListener('click', function () { logout(true); });
  $('accRestore').addEventListener('click', function () {
    var bk = load(KEY.backup);
    if (!bk || !bk.data) return;
    Object.keys(DATA_KEYS).forEach(function (k) { if (bk.data[k] !== undefined) store(DATA_KEYS[k], bk.data[k]); });
    remove(KEY.backup);
    var m = marker();
    m.dirty = true;
    setMarker(m);
    try { sessionStorage.setItem(KEY.flash, 'Đã khôi phục bản trên máy này và sẽ đồng bộ lên tài khoản'); } catch (e) {}
    location.reload();
  });
  $('accDelConfirm').addEventListener('change', function () { $('accDelete').disabled = !this.checked; });
  $('accDelete').addEventListener('click', function () {
    api('DELETE', '/me').then(function (r) {
      if (!r.ok) { toast(r.data.error || 'Không xóa được tài khoản'); return; }
      remove(KEY.sync);
      remove(KEY.backup);
      try { sessionStorage.setItem(KEY.flash, 'Đã xóa tài khoản. Dữ liệu trên máy này vẫn được giữ.'); } catch (e) {}
      location.reload();
    });
  });

  // Đổi tên hiển thị
  $('accEditName').addEventListener('click', function () {
    $('accNameRow').hidden = true;
    $('accRename').hidden = false;
    $('accNameInput').value = st.user.name;
    $('accNameInput').focus();
    $('accNameInput').select();
  });
  $('accRename').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('accNameInput').value.trim();
    if (!name) return;
    api('PATCH', '/me', { name: name }).then(function (r) {
      if (!r.ok) { toast(r.data.error || 'Không đổi được tên'); return; }
      st.user = r.data.user;
      renderHeader();
      renderDialog();
    });
  });
  $('accRenameCancel').addEventListener('click', function () { $('accRename').hidden = true; $('accNameRow').hidden = false; });

  // Đưa thay đổi lên trước khi rời trang / chuyển tab
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && marker().dirty) { clearTimeout(st.pushTimer); sync('change'); }
  });

  // Hộp mở khóa Pro: gợi ý đăng nhập (mua gói gắn với tài khoản)
  function decorateUnlock() {
    var row = $('unlockLogin');
    if (!row) return;
    row.hidden = !(st.cfg && st.cfg.googleLogin && !st.user);
    var note = $('unlockAccount');
    note.hidden = !st.user;
    if (st.user) note.textContent = 'Tài khoản ' + st.user.email + ' chưa có gói Pro. Nhắn ManhTool kèm email này để được kích hoạt.';
  }
  var unlockLoginBtn = $('unlockLoginBtn');
  if (unlockLoginBtn) unlockLoginBtn.addEventListener('click', login);

  /* ---------- Khởi động ---------- */
  function flashFromUrl() {
    var q = new URLSearchParams(location.search);
    var err = q.get('login_error'), ok = q.get('login');
    if (!err && !ok) return;
    q.delete('login_error');
    q.delete('login');
    var rest = q.toString();
    try { history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash); } catch (e) {}
    if (err) toast(err);
    return ok === 'ok';
  }

  function init() {
    var justLoggedIn = flashFromUrl();
    var flash = null;
    try { flash = sessionStorage.getItem(KEY.flash); sessionStorage.removeItem(KEY.flash); } catch (e) {}
    if (flash) setTimeout(function () { toast(flash); }, 300);

    if (location.protocol === 'file:') return;
    api('GET', '/config').then(function (r) {
      if (!r.ok || typeof r.data.googleLogin !== 'boolean') return; // trang tĩnh, không có máy chủ
      st.cfg = r.data;
      document.body.classList.add('has-account');
      applyEntitlement();
      return api('GET', '/me').then(function (me) {
        if (me.ok && me.data.user) {
          st.user = me.data.user;
          st.sessions = me.data.sessions;
          if (justLoggedIn && !flash) toast('Xin chào ' + st.user.name + '!');
          applyEntitlement();
        }
        renderHeader();
        decorateUnlock();
        promoUi();
        if (st.user) sync('load');
      });
    }, function () { /* không có máy chủ */ });
  }

  $('accUpgrade').addEventListener('click', function () {
    dlg.close();
    window.TimerShop.open(null);
  });

  // Lấy lại hồ sơ (vd sau khi mua nền) rồi áp quyền mở khóa mới
  function refresh() {
    return api('GET', '/me').then(function (r) {
      if (r.ok && r.data.user) {
        st.user = r.data.user;
        st.sessions = r.data.sessions;
        applyEntitlement();
        renderHeader();
      }
      return st.user;
    });
  }

  window.TimerAccount = {
    dirty: dirty, decorateUnlock: decorateUnlock, login: login, refresh: refresh,
    state: function () { return { cfg: st.cfg, user: st.user }; }
  };
  init();
})();
