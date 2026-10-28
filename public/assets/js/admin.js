/* ManhTool — Hẹn giờ nhắc việc: trang quản trị */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var me = null, users = [];

  function api(method, path, body) { return window.HGApi.request(method, path, body); }

  var toastTimer;
  function toast(msg) {
    $('toastMsg').textContent = msg;
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $('toast').classList.remove('show'); }, 2600);
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function fmtMs(ms) {
    var m = Math.round(ms / 60000);
    if (!m) return '—';
    return m >= 60 ? Math.floor(m / 60) + ' giờ ' + (m % 60 ? (m % 60) + ' phút' : '') : m + ' phút';
  }

  /* ---------- Vào trang ---------- */
  function gate(title, text, showLogin) {
    $('gate').hidden = false;
    $('app').hidden = true;
    $('gateTitle').textContent = title;
    $('gateText').textContent = text;
    $('gateLogin').hidden = !showLogin;
  }

  api('GET', '/config').then(function (cfg) {
    if (!cfg.ok) return gate('Chưa có máy chủ', 'Trang quản trị cần chạy cùng máy chủ (npm start).', false);
    return api('GET', '/me').then(function (r) {
      if (r.status === 401 || !r.data.user) {
        return gate('Đăng nhập để vào trang quản trị', cfg.data.googleLogin
          ? 'Chỉ tài khoản quản trị mới xem được trang này.'
          : 'Đăng nhập Google chưa được cấu hình. Đặt GOOGLE_CLIENT_ID và GOOGLE_CLIENT_SECRET trong file .env rồi khởi động lại máy chủ.', cfg.data.googleLogin);
      }
      if (r.data.user.role !== 'admin') return gate('Không có quyền truy cập', 'Tài khoản ' + r.data.user.email + ' không phải quản trị viên.', false);
      me = r.data.user;
      $('gate').hidden = true;
      $('app').hidden = false;
      loadOverview();
      loadUsers();
    });
  }, function () { gate('Không kết nối được máy chủ', 'Kiểm tra máy chủ đã chạy chưa (npm start).', false); });

  /* ---------- Thẻ ---------- */
  document.querySelectorAll('[data-tab]').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('[data-tab]').forEach(function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
      document.querySelectorAll('[data-panel]').forEach(function (p) { p.hidden = p.dataset.panel !== b.dataset.tab; });
      if (b.dataset.tab !== 'users') loadOverview();
      if (b.dataset.tab === 'orders') loadOrders();
      if (b.dataset.tab === 'music') loadMusic();
      else stopListen();
      if (b.dataset.tab === 'promo') loadPromo();
    });
  });

  /* ---------- Miễn phí & giới thiệu ---------- */
  var FEATURES = [
    { key: 'themes', label: 'Nền Pro & nền mùa lễ', hint: 'Mọi nền Pro, nền Lễ Tết và nền "Ảnh của bạn"' },
    { key: 'music', label: 'Nhạc nền Pro', hint: 'Các bản nhạc Pro trong thư viện và âm thanh tập trung Pro' }
  ];
  function promoCall(method, path, body) {
    return api(method, path, body).then(function (r) {
      if (!r.ok) throw new Error((r.data && r.data.error) || 'Lỗi máy chủ');
      return r.data;
    });
  }
  function loadPromo() {
    var P = window.MTPromo;
    window.MTPromoAdmin.mount($('promoAdmin'), {
      base: P.defaults('hengio', '/assets/img/dsv24h.svg'),
      features: FEATURES,
      keepLabel: 'Tài khoản đăng nhập trong thời gian miễn phí được giữ các quyền lợi đã mở vĩnh viễn, kể cả khi chương trình kết thúc',
      where: [
        'Trang chính: dải xanh đếm ngược ở đầu trang, thông báo tự hiện một lần mỗi phiên (không hiện khi đang đếm giờ hay ở màn hình lớn)',
        'Ô chọn nền: nền Pro mở khoá, dòng "Nền Pro đang miễn phí" với giá gốc gạch ngang',
        'Thư viện nhạc: nhạc Pro nghe được ngay',
        'Popup giới thiệu doansinhvien24h (gia sư lập trình, kho đồ án) cho người dùng bản miễn phí; cuối trang có dòng "Đồng hành cùng doansinhvien24h" để mở lại'
      ],
      load: function () { return promoCall('GET', '/admin/promo'); },
      saveFree: function (f) { return promoCall('PUT', '/admin/promo/free', { free: f }); },
      saveBrand: function (b) { return promoCall('PUT', '/admin/promo/brand', { brand: b }); },
      announce: function (f, brand) {
        P.announce(f, brand, {
          force: true, title: 'Nền & nhạc Pro đang miễn phí', text: 'Chọn nền đẹp, bật nhạc tập trung rồi bắt đầu đếm giờ — không cần thanh toán.',
          perks: ['Mọi nền Pro và nền Lễ Tết', 'Dùng ảnh của bạn làm nền', 'Nhạc nền Pro giúp tập trung', f.keep ? 'Đăng nhập là giữ vĩnh viễn' : 'Không cần thanh toán'],
          cta: { label: 'Chọn nền Pro ngay' },
          note: f.keep ? 'Đăng nhập Google trong thời gian này để giữ quyền lợi vĩnh viễn, kể cả khi chương trình kết thúc.' : 'Hết chương trình, nền và nhạc Pro khoá lại như cũ.'
        });
      },
      toast: function (m) { toast(m); }
    });
  }

  /* ---------- Thư viện nhạc nền ---------- */
  var listen = { el: null, id: null };
  function stopListen() {
    if (listen.el) listen.el.pause();
    listen.id = null;
  }
  function fmtSize(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB'; }

  // Gợi ý tên bài từ tên file (bỏ đuôi, gạch dưới → dấu cách)
  $('mFile').addEventListener('change', function () {
    var f = this.files[0];
    if (f && !$('mTitle').value.trim()) $('mTitle').value = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 80);
  });

  $('musicForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = $('mFile').files[0];
    if (!f) return toast('Chọn file nhạc trước');
    if (f.size > 25 * 1048576) return toast('File quá lớn (tối đa 25 MB)');
    if (!$('mConfirm').checked) return toast('Hãy xác nhận bạn có quyền phát hành bản nhạc này');
    var meta = {
      title: $('mTitle').value, artist: $('mArtist').value, license: $('mLicense').value, source: $('mSource').value.trim(),
      mood: $('mMood').value, tier: $('mTier').value, confirm: true
    };
    var btn = $('mSubmit');
    btn.disabled = true;
    btn.lastChild.textContent = 'Đang tải lên…';
    api('POST', '/admin/music?meta=' + encodeURIComponent(JSON.stringify(meta)), f).then(function (r) {
      btn.disabled = false;
      btn.lastChild.textContent = 'Tải lên';
      if (!r.ok) return toast(r.data.error || 'Không tải lên được');
      toast('Đã thêm "' + r.data.track.title + '"');
      $('musicForm').reset();
      loadMusic();
    }, function () {
      btn.disabled = false;
      btn.lastChild.textContent = 'Tải lên';
      toast('Mất kết nối, thử lại sau');
    });
  });

  function patchTrack(t, body, input) {
    api('PATCH', '/admin/music/' + t.id, body).then(function (r) {
      if (!r.ok) {
        toast(r.data.error || 'Không cập nhật được');
        if (input) input.checked = !input.checked;
        return;
      }
      Object.assign(t, r.data.track);
    });
  }

  function loadMusic() {
    api('GET', '/admin/music').then(function (r) {
      if (!r.ok) return toast(r.data.error || 'Không tải được thư viện nhạc');
      var tb = $('music');
      tb.innerHTML = '';
      $('musicEmpty').hidden = r.data.tracks.length > 0;
      $('musicCount').textContent = r.data.tracks.length ? r.data.tracks.length + ' bài' : '';
      r.data.tracks.forEach(function (t) {
        var tr = document.createElement('tr');

        var who = document.createElement('td');
        var row = document.createElement('div');
        row.className = 'who';
        var play = document.createElement('button');
        play.type = 'button';
        play.className = 'icon-btn';
        play.title = 'Nghe thử';
        play.setAttribute('aria-label', 'Nghe thử ' + t.title);
        play.innerHTML = '<svg class="ic"><use href="#i-play"/></svg>';
        play.addEventListener('click', function () {
          if (listen.id === t.id) return stopListen();
          if (!listen.el) listen.el = new Audio();
          listen.el.src = t.url;
          listen.id = t.id;
          listen.el.play().catch(function () { toast('Không phát được file này'); });
        });
        var info = document.createElement('div');
        info.innerHTML = '<b></b><small></small>';
        info.firstChild.textContent = t.title;
        info.lastChild.textContent = t.artist + (t.mood ? ' · ' + t.mood : '');
        row.appendChild(play);
        row.appendChild(info);
        who.appendChild(row);

        var lic = document.createElement('td');
        lic.textContent = t.license;
        if (t.source) {
          var a = document.createElement('a');
          a.href = t.source;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = 'nguồn';
          lic.appendChild(document.createTextNode(' · '));
          lic.appendChild(a);
        }

        var tier = document.createElement('td');
        var sel = document.createElement('select');
        sel.className = 'select';
        sel.setAttribute('aria-label', 'Ai được nghe ' + t.title);
        [['free', 'Mọi người'], ['pro', 'Gói Pro']].forEach(function (o) {
          var op = document.createElement('option');
          op.value = o[0];
          op.textContent = o[1];
          sel.appendChild(op);
        });
        sel.value = t.tier;
        sel.addEventListener('change', function () { patchTrack(t, { tier: sel.value }); });
        tier.appendChild(sel);

        var act = document.createElement('td');
        act.appendChild(toggle('Hiện ' + t.title + ' cho khách', t.active, function (v, input) { patchTrack(t, { active: v }, input); }));

        var size = document.createElement('td');
        size.textContent = fmtSize(t.size);
        size.title = 'Thêm lúc ' + fmtDate(t.createdAt) + (t.by ? ' bởi ' + t.by : '');

        var del = document.createElement('td');
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'saved-del row-del';
        b.title = 'Xóa bài';
        b.setAttribute('aria-label', 'Xóa ' + t.title);
        b.innerHTML = '<svg class="ic"><use href="#i-trash"/></svg>';
        b.addEventListener('click', function () {
          if (!window.confirm('Xóa vĩnh viễn bài "' + t.title + '" khỏi thư viện?')) return;
          if (listen.id === t.id) stopListen();
          api('DELETE', '/admin/music/' + t.id).then(function (x) {
            toast(x.ok ? 'Đã xóa "' + t.title + '"' : x.data.error || 'Không xóa được');
            loadMusic();
          });
        });
        del.appendChild(b);

        [who, lic, tier, act, size, del].forEach(function (td) { tr.appendChild(td); });
        tb.appendChild(tr);
      });
    });
  }

  /* ---------- Tổng quan + cài đặt + nhật ký ---------- */
  function loadOverview() {
    api('GET', '/admin/overview').then(function (r) {
      if (!r.ok) return toast(r.data.error || 'Không tải được dữ liệu');
      var c = r.data.counts;
      var stats = [['Tài khoản', c.users], ['Hoạt động 7 ngày', c.active7d], ['Pro', c.pro], ['Quản trị', c.admins], ['Bị khóa', c.blocked]];
      $('stats').innerHTML = '';
      stats.forEach(function (s) {
        var d = document.createElement('div');
        d.className = 'stat-tile';
        d.innerHTML = '<b></b><span></span>';
        d.firstChild.textContent = s[1];
        d.lastChild.textContent = s[0];
        $('stats').appendChild(d);
      });
      fillSettings(r.data.settings);
      var list = $('audit');
      list.innerHTML = '';
      if (!r.data.audit.length) list.innerHTML = '<li class="audit-empty">Chưa có thao tác nào.</li>';
      r.data.audit.forEach(function (a) {
        var li = document.createElement('li');
        li.innerHTML = '<time></time><span></span>';
        li.firstChild.textContent = fmtDate(a.at);
        li.lastChild.textContent = a.actor + ' · ' + a.action + (a.target ? ' · ' + a.target : '');
        list.appendChild(li);
      });
    });
  }

  function fillSettings(s) {
    $('redirectUri').textContent = s.redirectUri;
    $('sClientId').value = s.googleClientId;
    $('sClientSecret').value = '';
    $('secretState').textContent = s.googleClientSecretSet ? 'Đã có secret (không hiển thị lại để an toàn).' : 'Chưa có secret.';
    $('sEnabled').checked = s.googleLoginEnabled;
    $('sRegistration').checked = s.registrationOpen;
    $('sLock').checked = s.lockPremium;
    document.querySelectorAll('[data-env]').forEach(function (el) { el.hidden = !s.fromEnv[el.dataset.env]; });
    $('sClientId').disabled = s.fromEnv.clientId;
    $('sClientSecret').disabled = s.fromEnv.clientSecret;
    $('sEnabled').disabled = s.fromEnv.enabled;
    $('googleState').textContent = s.googleReady ? 'Đăng nhập Google đang hoạt động.' : 'Đăng nhập Google đang tắt hoặc thiếu Client ID / secret.';
    $('googleState').className = 'google-state ' + (s.googleReady ? 'is-ok' : 'is-off');

    var p = s.payment;
    $('pEnabled').checked = p.enabled;
    $('pBank').value = p.bankId;
    $('pAcc').value = p.accountNo;
    $('pName').value = p.accountName;
    $('pTheme').value = p.priceTheme;
    $('pSeason').value = p.priceSeason;
    $('pPro').value = p.pricePro;
    $('webhookUrl').textContent = p.webhookUrl;
    $('webhookState').textContent = p.webhookKeySet
      ? 'Khóa webhook đã đặt trong .env (PAYMENT_WEBHOOK_KEY). Trên SePay chọn kiểu chứng thực "API Key" và dán khóa đó.'
      : 'Chưa đặt PAYMENT_WEBHOOK_KEY trong .env: webhook đang tắt, chỉ xác nhận tay được.';
    var msg = !p.enabled ? 'Đang tắt bán nền.'
      : !p.ready ? 'Thiếu ngân hàng, số tài khoản hoặc tên chủ tài khoản.'
        : !s.lockPremium ? 'Đang bán, nhưng nền Pro chưa bị khóa nên khách chưa cần mua. Bật "Khóa nền Pro" ở trên để bắt đầu thu tiền.'
          : 'Đang bán nền.';
    $('payState').textContent = msg;
    $('payState').className = 'google-state ' + (p.ready && s.lockPremium ? 'is-ok' : 'is-off');
  }

  $('copyWebhook').addEventListener('click', function () {
    var t = $('webhookUrl').textContent;
    (navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(t) : Promise.reject())
      .then(function () { toast('Đã chép địa chỉ webhook'); }, function () { toast('Hãy bôi đen và chép thủ công'); });
  });

  $('copyRedirect').addEventListener('click', function () {
    var t = $('redirectUri').textContent;
    (navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(t) : Promise.reject())
      .then(function () { toast('Đã chép Redirect URI'); }, function () { toast('Hãy bôi đen và chép thủ công'); });
  });

  $('settingsForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var body = { registrationOpen: $('sRegistration').checked, lockPremium: $('sLock').checked };
    if (!$('sClientId').disabled) body.googleClientId = $('sClientId').value;
    if (!$('sClientSecret').disabled && $('sClientSecret').value.trim()) body.googleClientSecret = $('sClientSecret').value;
    if (!$('sEnabled').disabled) body.googleLoginEnabled = $('sEnabled').checked;
    body.payment = {
      enabled: $('pEnabled').checked, bankId: $('pBank').value, accountNo: $('pAcc').value, accountName: $('pName').value,
      priceTheme: +$('pTheme').value, priceSeason: +$('pSeason').value, pricePro: +$('pPro').value
    };
    api('PUT', '/admin/settings', body).then(function (r) {
      toast(r.ok ? 'Đã lưu cài đặt' : r.data.error || 'Không lưu được');
      if (r.ok) loadOverview();
    });
  });

  /* ---------- Đơn hàng ---------- */
  var orderStatus = '';
  var STATUS_TEXT = { pending: 'Chờ thanh toán', paid: 'Đã thanh toán', expired: 'Hết hạn', cancelled: 'Đã hủy' };
  var PAY_RESULT = { unmatched: 'Không rõ đơn', underpaid: 'Chuyển thiếu', already_paid: 'Chuyển lần 2', order_closed: 'Đơn đã đóng', duplicate: 'Trùng', ignored: 'Bỏ qua' };
  function money(n) { return (Number(n) || 0).toLocaleString('vi-VN') + 'đ'; }

  document.querySelectorAll('[data-ostatus]').forEach(function (b) {
    b.addEventListener('click', function () {
      orderStatus = b.dataset.ostatus;
      document.querySelectorAll('[data-ostatus]').forEach(function (x) { x.setAttribute('aria-checked', x === b ? 'true' : 'false'); });
      loadOrders();
    });
  });

  function loadOrders() {
    api('GET', '/admin/orders?status=' + orderStatus).then(function (r) {
      if (!r.ok) return toast(r.data.error || 'Không tải được đơn hàng');
      var rv = r.data.revenue;
      $('revenue').innerHTML = '';
      [['Doanh thu hôm nay', money(rv.today)], ['30 ngày qua', money(rv.days30)], ['Tổng doanh thu', money(rv.total)], ['Đơn đã trả', rv.orders]].forEach(function (s) {
        var d = document.createElement('div');
        d.className = 'stat-tile';
        d.innerHTML = '<b></b><span></span>';
        d.firstChild.textContent = s[1];
        d.lastChild.textContent = s[0];
        $('revenue').appendChild(d);
      });

      var tb = $('orders');
      tb.innerHTML = '';
      $('ordersEmpty').hidden = r.data.orders.length > 0;
      r.data.orders.forEach(function (o) {
        var tr = document.createElement('tr');
        var cells = [o.code, o.email, o.title, money(o.amount) + (o.paidAmount && o.paidAmount !== o.amount ? ' (nhận ' + money(o.paidAmount) + ')' : ''), '', fmtDate(o.paidAt || o.createdAt), ''];
        cells.forEach(function (v, i) {
          var td = document.createElement('td');
          if (i === 0) { var c = document.createElement('code'); c.textContent = v; td.appendChild(c); }
          else if (i === 4) {
            var st = document.createElement('span');
            st.className = 'order-st is-' + o.status;
            st.textContent = STATUS_TEXT[o.status] + (o.paidVia === 'admin' ? ' (tay)' : '');
            td.appendChild(st);
          } else if (i === 6) {
            if (o.status !== 'paid') {
              var b = document.createElement('button');
              b.type = 'button';
              b.className = 'btn-ghost row-btn';
              b.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>Xác nhận';
              b.title = 'Đã nhận tiền → mở khóa cho khách';
              b.addEventListener('click', function () {
                if (!window.confirm('Xác nhận đã nhận ' + money(o.amount) + ' cho đơn ' + o.code + ' của ' + o.email + '?')) return;
                api('POST', '/admin/orders/' + o.id + '/confirm').then(function (x) {
                  toast(x.ok ? 'Đã mở khóa cho ' + o.email : x.data.error || 'Không xác nhận được');
                  loadOrders();
                });
              });
              td.appendChild(b);
            }
          } else td.textContent = v;
          tr.appendChild(td);
        });
        tb.appendChild(tr);
      });

      var ul = $('unmatched');
      ul.innerHTML = '';
      if (!r.data.unmatched.length) ul.innerHTML = '<li class="audit-empty">Không có khoản nào.</li>';
      r.data.unmatched.forEach(function (p) {
        var li = document.createElement('li');
        li.innerHTML = '<time></time><span></span>';
        li.firstChild.textContent = fmtDate(p.at);
        li.lastChild.textContent = money(p.amount) + ' · ' + (PAY_RESULT[p.result] || p.result) + (p.code ? ' · mã ' + p.code : '') + ' · "' + p.content + '"';
        ul.appendChild(li);
      });
    });
  }

  /* ---------- Người dùng ---------- */
  var searchTimer;
  $('q').addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadUsers, 250);
  });

  function loadUsers() {
    api('GET', '/admin/users?q=' + encodeURIComponent($('q').value.trim())).then(function (r) {
      if (!r.ok) return toast(r.data.error || 'Không tải được danh sách');
      users = r.data.users;
      renderUsers();
    });
  }

  function toggle(label, on, onChange, disabled) {
    var l = document.createElement('label');
    l.className = 'opt';
    l.innerHTML = '<input type="checkbox"><span class="switch" aria-hidden="true"></span><span class="visually-hidden"></span>';
    var input = l.firstChild;
    input.checked = on;
    input.disabled = !!disabled;
    l.lastChild.textContent = label;
    input.addEventListener('change', function () { onChange(input.checked, input); });
    return l;
  }

  function patchUser(u, body, input) {
    api('PATCH', '/admin/users/' + u.id, body).then(function (r) {
      if (!r.ok) {
        toast(r.data.error || 'Không cập nhật được');
        if (input) input.checked = !input.checked;
        return;
      }
      Object.assign(u, r.data.user);
      renderUsers();
      loadOverview();
    });
  }

  function renderUsers() {
    var tb = $('users');
    tb.innerHTML = '';
    $('usersEmpty').hidden = users.length > 0;
    $('userCount').textContent = users.length + ' tài khoản';
    users.forEach(function (u) {
      var tr = document.createElement('tr');
      if (!u.active) tr.className = 'is-blocked';

      var whoTd = document.createElement('td');
      var who = document.createElement('div');
      who.className = 'who';
      whoTd.appendChild(who);
      var img = document.createElement(u.picture ? 'img' : 'span');
      img.className = 'avatar';
      if (u.picture) { img.src = u.picture; img.alt = ''; img.referrerPolicy = 'no-referrer'; img.width = 32; img.height = 32; }
      else img.textContent = (u.name || u.email).charAt(0).toUpperCase();
      var info = document.createElement('div');
      info.innerHTML = '<b></b><small></small>';
      info.firstChild.textContent = u.name + (u.id === me.id ? ' (bạn)' : '');
      info.lastChild.textContent = u.email;
      who.appendChild(img);
      who.appendChild(info);

      var role = document.createElement('td');
      var sel = document.createElement('select');
      sel.className = 'select';
      sel.setAttribute('aria-label', 'Vai trò của ' + u.email);
      [['user', 'Người dùng'], ['admin', 'Quản trị']].forEach(function (o) {
        var op = document.createElement('option');
        op.value = o[0];
        op.textContent = o[1];
        sel.appendChild(op);
      });
      sel.value = u.role;
      sel.disabled = u.id === me.id;
      sel.addEventListener('change', function () { patchUser(u, { role: sel.value }); });
      role.appendChild(sel);

      var pro = document.createElement('td');
      pro.appendChild(toggle('Pro cho ' + u.email, u.pro, function (v, input) { patchUser(u, { pro: v }, input); }));

      var act = document.createElement('td');
      act.appendChild(toggle('Hoạt động: ' + u.email, u.active, function (v, input) { patchUser(u, { active: v }, input); }, u.id === me.id));
      var st = document.createElement('small');
      st.className = 'state-text';
      st.textContent = u.active ? (u.sessions ? u.sessions + ' thiết bị' : 'Đã đăng xuất') : 'Đã khóa';
      act.appendChild(st);

      var week = document.createElement('td');
      week.textContent = u.rounds7 ? u.rounds7 + ' lượt · ' + fmtMs(u.ms7) : '—';

      var last = document.createElement('td');
      last.textContent = fmtDate(u.lastLoginAt);
      last.title = 'Tạo lúc ' + fmtDate(u.createdAt);

      var del = document.createElement('td');
      if (u.id !== me.id) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'saved-del row-del';
        b.title = 'Xóa tài khoản';
        b.setAttribute('aria-label', 'Xóa ' + u.email);
        b.innerHTML = '<svg class="ic"><use href="#i-trash"/></svg>';
        b.addEventListener('click', function () {
          if (!window.confirm('Xóa vĩnh viễn tài khoản ' + u.email + ' và toàn bộ dữ liệu đồng bộ?')) return;
          api('DELETE', '/admin/users/' + u.id).then(function (r) {
            if (!r.ok) return toast(r.data.error || 'Không xóa được');
            toast('Đã xóa ' + u.email);
            loadUsers();
            loadOverview();
          });
        });
        del.appendChild(b);
      }

      [whoTd, role, pro, act, week, last, del].forEach(function (td) { tr.appendChild(td); });
      tb.appendChild(tr);
    });
  }

  /* ---------- Nền sáng / tối ---------- */
  var root = document.documentElement;
  $('themeToggle').addEventListener('click', function () {
    var cur = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var next = cur === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('mt-theme', next); } catch (e) {}
  });
})();
