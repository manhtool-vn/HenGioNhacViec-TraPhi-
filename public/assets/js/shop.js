/* ManhTool — Hẹn giờ nhắc việc: mua nền Pro bằng chuyển khoản VietQR.
   Chọn gói → máy chủ tạo đơn có mã riêng → quét QR → trang hỏi máy chủ mỗi 4 giây, tiền về là tự mở khóa.
   Giá luôn do máy chủ quyết định; trang chỉ hiển thị. */
(function () {
  'use strict';

  var TT = window.TimerThemes;
  var $ = function (id) { return document.getElementById(id); };
  var KEY_INTENT = 'mt-hg-buy';     // nhớ gói định mua khi phải đi đăng nhập
  var KEY_ORDER = 'mt-hg-order';    // đơn đang chờ, để mở lại hộp vẫn tiếp tục
  var POLL_MS = 4000;

  var dlg = $('shopDialog');
  var state = { theme: null, choice: null, order: null, skew: 0, poll: null, tick: null };

  function api(m, p, b) { return window.HGApi.request(m, p, b); }
  function acc() { return window.TimerAccount ? window.TimerAccount.state() : { cfg: null, user: null }; }
  function shop() { var c = acc().cfg; return c && c.shop; }
  function toast(m) { if (window.TimerApp) window.TimerApp.toast(m); }
  function money(n) { return (Number(n) || 0).toLocaleString('vi-VN') + 'đ'; }
  function save(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function read(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } }

  // Chỉ bán khi máy chủ đã bật thanh toán và đang khóa nền Pro
  function available() {
    var c = acc().cfg;
    return !!(c && c.lockPremium && c.shop && c.shop.enabled);
  }

  function show(view) {
    dlg.querySelectorAll('.shop-view').forEach(function (v) { v.hidden = v.dataset.view !== view; });
  }

  /* ---------- Bước 1: chọn gói ---------- */
  function options() {
    var s = shop(), u = acc().user, owned = new Set((u && u.ownedThemes) || []);
    var list = [];
    var t = state.theme;
    if (t && t.tier === 'pro' && !owned.has(t.id)) {
      list.push({ id: 'theme:' + t.id, name: 'Chỉ nền "' + t.name + '"', desc: 'Mua lẻ, dùng mãi mãi', price: s.theme.price });
    }
    var seasonLeft = s.season.themes.filter(function (id) { return !owned.has(id); });
    if (seasonLeft.length && (!t || t.season)) {
      var names = s.season.themes.map(function (id) { return TT.get(id).name; });
      list.push({
        id: 'season', name: 'Gói Lễ, Tết cả năm', price: s.season.price,
        desc: names.slice(0, 4).join(', ') + (names.length > 4 ? ' và ' + (names.length - 4) + ' dịp khác' : ''),
        badge: s.season.themes.length + ' nền'
      });
    }
    var proCount = TT.list.filter(function (x) { return x.tier === 'pro'; }).length;
    list.push({ id: 'pro', name: 'Gói Pro trọn đời', price: s.pro.price, desc: 'Tất cả ' + proCount + ' nền Pro, gồm cả ảnh của bạn và các nền ra mắt sau này', badge: 'Đáng mua nhất', best: true });
    return list;
  }

  function renderChoose() {
    var t = state.theme || TT.list.find(function (x) { return x.tier === 'pro' && x.fx; });
    window.TimerApp.paint($('shopArt'), t);
    $('shopTitle').textContent = state.theme ? 'Mở khóa nền "' + state.theme.name + '"' : 'Nâng cấp Pro';
    $('shopLead').textContent = 'Chọn gói phù hợp. Mua một lần, dùng mãi mãi, không gia hạn.';
    $('shopError').hidden = true;

    var list = options();
    if (!state.choice || !list.some(function (o) { return o.id === state.choice; })) state.choice = list[0].id;
    var box = $('shopOptions');
    box.textContent = '';
    list.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'shop-opt' + (o.best ? ' is-best' : '');
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', o.id === state.choice ? 'true' : 'false');
      b.innerHTML = '<span class="opt-dot" aria-hidden="true"></span><span class="opt-main"><b></b><small></small></span><span class="opt-price"></span>';
      b.querySelector('b').textContent = o.name;
      b.querySelector('small').textContent = o.desc;
      b.querySelector('.opt-price').textContent = money(o.price);
      if (o.badge) {
        var badge = document.createElement('em');
        badge.className = 'opt-badge';
        badge.textContent = o.badge;
        b.querySelector('b').appendChild(badge);
      }
      b.addEventListener('click', function () { state.choice = o.id; renderChoose(); });
      box.appendChild(b);
    });

    var user = acc().user;
    var picked = list.find(function (o) { return o.id === state.choice; });
    $('shopBuy').textContent = user ? 'Thanh toán ' + money(picked.price) : 'Đăng nhập Google để mua';
    show('choose');
  }

  function buy() {
    if (!acc().user) {
      // Mua gắn với tài khoản: nhớ ý định, đăng nhập xong mở lại đúng gói
      save(KEY_INTENT, { theme: state.theme && state.theme.id, choice: state.choice });
      window.TimerAccount.login();
      return;
    }
    $('shopBuy').disabled = true;
    api('POST', '/orders', { product: state.choice }).then(function (r) {
      $('shopBuy').disabled = false;
      if (!r.ok) {
        $('shopError').textContent = r.data.error || 'Không tạo được đơn, thử lại sau';
        $('shopError').hidden = false;
        return;
      }
      startPay(r.data.order);
    }, function () {
      $('shopBuy').disabled = false;
      $('shopError').textContent = 'Mất kết nối, thử lại sau';
      $('shopError').hidden = false;
    });
  }

  /* ---------- Bước 2: quét QR ---------- */
  function startPay(order) {
    state.order = order;
    save(KEY_ORDER, { id: order.id, theme: state.theme && state.theme.id });
    var p = order.pay;
    $('payTitle').textContent = order.title + ' · ' + money(order.amount);
    $('payQr').src = p.qrUrl;
    $('payBank').textContent = p.bankId;
    $('payAcc').textContent = p.accountNo;
    $('payName').textContent = p.accountName;
    $('payAmount').textContent = money(p.amount);
    $('payAmountRaw').textContent = String(p.amount);
    $('payCode').textContent = p.content;
    setStatus('wait');
    show('pay');
    startTimers();
  }

  function setStatus(kind) {
    var el = $('payStatus');
    el.dataset.kind = kind;
    el.lastElementChild.textContent = kind === 'expired'
      ? 'Mã QR đã hết hạn. Nếu bạn đã chuyển khoản, hệ thống vẫn ghi nhận trong 7 ngày. Chưa chuyển thì bấm "Đổi gói" để tạo mã mới.'
      : 'Đang chờ tiền về… trang tự mở khóa khi nhận được, không cần làm gì thêm.';
  }

  function startTimers() {
    stopTimers();
    renderTimer();
    state.tick = setInterval(renderTimer, 1000);
    state.poll = setInterval(check, POLL_MS);
  }
  function stopTimers() {
    clearInterval(state.tick);
    clearInterval(state.poll);
    state.tick = state.poll = null;
  }

  function renderTimer() {
    if (!state.order) return;
    var left = Math.max(0, state.order.expiresAt - (Date.now() + state.skew));
    var m = Math.floor(left / 60000), s = Math.floor(left / 1000) % 60;
    $('payTimer').textContent = left ? 'Còn ' + m + ':' + (s < 10 ? '0' : '') + s : 'Hết hạn';
    $('payTimer').classList.toggle('is-low', left < 120000);
    if (!left) setStatus('expired');
  }

  function check() {
    if (!state.order) return;
    api('GET', '/orders/' + state.order.id).then(function (r) {
      if (!r.ok) return;
      if (r.data.serverTime) state.skew = r.data.serverTime - Date.now();
      var o = r.data.order;
      if (o.status === 'paid') return paid(o);
      if (o.status === 'cancelled') { stopTimers(); save(KEY_ORDER, null); renderChoose(); }
    });
  }

  /* ---------- Bước 3: xong ---------- */
  function paid(o) {
    stopTimers();
    save(KEY_ORDER, null);
    state.order = null;
    window.TimerAccount.refresh().then(function () {
      $('doneShopTitle').textContent = 'Đã mở khóa ' + o.title + '!';
      $('doneShopText').textContent = 'Đã nhận ' + money(o.amount) + '. Cảm ơn bạn đã ủng hộ ManhTool.';
      $('shopUse').hidden = !state.theme;
      show('done');
      if (!dlg.open && dlg.showModal) dlg.showModal();
    });
  }

  /* ---------- Mở / đóng ---------- */
  function open(theme) {
    if (!available()) return false;
    state.theme = theme && theme.tier === 'pro' ? theme : null;
    // Đang có đơn chờ cho đúng nền này → quay lại màn QR
    var pending = read(KEY_ORDER);
    if (pending && (pending.theme || null) === (state.theme && state.theme.id || null)) {
      api('GET', '/orders/' + pending.id).then(function (r) {
        if (r.ok && r.data.order.status === 'paid') return paid(r.data.order);
        if (r.ok && r.data.order.pay) { state.skew = (r.data.serverTime || Date.now()) - Date.now(); startPay(r.data.order); }
        else { save(KEY_ORDER, null); renderChoose(); }
      });
    } else {
      renderChoose();
    }
    if (dlg.showModal && !dlg.open) dlg.showModal();
    return true;
  }

  function close() {
    stopTimers();
    if (dlg.open) dlg.close();
  }

  $('shopBuy').addEventListener('click', buy);
  $('shopClose').addEventListener('click', close);
  dlg.addEventListener('close', stopTimers);
  dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });
  $('payBack').addEventListener('click', function () { stopTimers(); renderChoose(); });
  $('payCancel').addEventListener('click', function () {
    if (!state.order) return;
    api('POST', '/orders/' + state.order.id + '/cancel').then(function () {
      stopTimers();
      save(KEY_ORDER, null);
      state.order = null;
      toast('Đã hủy đơn');
      renderChoose();
    });
  });
  $('shopUse').addEventListener('click', function () {
    if (state.theme) window.TimerApp.useTheme(state.theme.id);
    close();
  });
  dlg.querySelectorAll('[data-copy-from]').forEach(function (b) {
    b.addEventListener('click', function () {
      var text = $(b.dataset.copyFrom).textContent;
      window.TimerApp.copy(text).then(function () {
        b.classList.add('is-done');
        setTimeout(function () { b.classList.remove('is-done'); }, 1200);
        toast('Đã chép ' + text);
      }, function () { toast('Không chép được, hãy gõ tay: ' + text); });
    });
  });
  $('shopNoteBtn').addEventListener('click', function () { open(null); });

  // Gọi lại khi trạng thái tài khoản / cấu hình thay đổi
  function refresh() {
    var s = shop(), u = acc().user;
    var on = available() && !(u && u.pro);
    $('shopNote').hidden = !on;
    if (on) {
      $('shopNoteText').textContent = 'Từ ' + money(s.theme.price) + '/nền · Gói Pro ' + money(s.pro.price) + ' dùng trọn đời.';
    }
    // Vừa đăng nhập xong để mua → mở lại đúng gói đã chọn
    var intent = read(KEY_INTENT);
    if (intent && u && available()) {
      save(KEY_INTENT, null);
      state.choice = intent.choice;
      open(intent.theme ? TT.get(intent.theme) : null);
    }
  }

  window.TimerShop = { open: open, available: available, refresh: refresh };
})();
