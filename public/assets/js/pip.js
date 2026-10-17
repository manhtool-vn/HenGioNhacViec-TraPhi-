/* ManhTool — Hẹn giờ nhắc việc: cửa sổ nổi luôn nằm trên các ứng dụng khác
   (Document Picture-in-Picture, hiện có trên Chrome/Edge máy tính). */
(function (root) {
  'use strict';

  var CSS = [
    '*{box-sizing:border-box}',
    'html,body{margin:0;height:100%}',
    'body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:10px;',
    'font-family:"Be Vietnam Pro",system-ui,"Segoe UI",sans-serif;color:var(--st-text);background:var(--st-bg);background-size:var(--st-bg-size);background-position:center;overflow:hidden;user-select:none}',
    '.t{font-family:var(--st-font);font-weight:800;font-size:min(30vw,62vh);line-height:1;letter-spacing:-.02em;font-variant-numeric:tabular-nums;text-shadow:var(--st-glow)}',
    '.t.l{font-size:min(20vw,48vh)}',
    '.s{font-size:13px;color:var(--st-sub);text-align:center;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.bar{position:fixed;left:0;bottom:0;height:4px;width:100%;background:var(--st-track)}',
    '.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--st-accent2),var(--st-accent));transform-origin:left;transition:transform .3s linear}',
    '.row{display:flex;gap:6px}',
    'button{font:inherit;font-size:12px;font-weight:600;height:28px;padding:0 12px;border-radius:999px;cursor:pointer;color:var(--st-text);',
    'background:color-mix(in srgb,var(--st-text) 12%,transparent);border:1px solid color-mix(in srgb,var(--st-text) 22%,transparent)}',
    'button:hover{background:color-mix(in srgb,var(--st-text) 20%,transparent)}',
    'body.warn .t{color:var(--st-warn)}',
    'body.done{animation:flash 1s steps(1) infinite}',
    '@keyframes flash{50%{filter:brightness(1.6)}}'
  ].join('');

  var win = null, els = null;

  root.TimerPiP = {
    supported: function () { return 'documentPictureInPicture' in window; },
    isOpen: function () { return !!win; },

    // actions: { toggle(), add() }; onClose(): báo cho app khi người dùng đóng cửa sổ
    open: function (actions, onClose) {
      if (!this.supported()) return Promise.reject(new Error('unsupported'));
      if (win) { win.focus(); return Promise.resolve(); }
      return window.documentPictureInPicture.requestWindow({ width: 300, height: 170 }).then(function (w) {
        win = w;
        var doc = w.document;
        doc.title = 'Hẹn giờ';
        var style = doc.createElement('style');
        style.textContent = CSS;
        doc.head.appendChild(style);
        // Dùng chung phông số của trang chính
        document.querySelectorAll('link[rel="stylesheet"][href*="fonts.googleapis"]').forEach(function (l) {
          doc.head.appendChild(l.cloneNode());
        });
        doc.body.innerHTML = '<div class="t" id="t">00:00</div><div class="s" id="s"></div>' +
          '<div class="row"><button id="go" type="button"></button><button id="add" type="button">+1 phút</button></div>' +
          '<div class="bar"><i id="bar"></i></div>';
        els = { t: doc.getElementById('t'), s: doc.getElementById('s'), go: doc.getElementById('go'), add: doc.getElementById('add'), bar: doc.getElementById('bar'), body: doc.body };
        els.go.addEventListener('click', actions.toggle);
        els.add.addEventListener('click', actions.add);
        w.addEventListener('pagehide', function () {
          win = null;
          els = null;
          if (onClose) onClose();
        });
      });
    },

    close: function () { if (win) win.close(); },

    // view: { time, sub, frac, status, warn, vars }
    update: function (view) {
      if (!els) return;
      var b = els.body;
      for (var k in view.vars) b.style.setProperty(k, view.vars[k]);
      els.t.textContent = view.time;
      els.t.classList.toggle('l', view.time.length > 5);
      els.s.textContent = view.sub;
      els.go.textContent = view.status === 'running' ? 'Tạm dừng' : view.status === 'paused' ? 'Tiếp tục' : 'Bắt đầu';
      els.add.hidden = !(view.status === 'running' || view.status === 'paused');
      els.bar.style.transform = 'scaleX(' + view.frac + ')';
      b.classList.toggle('warn', !!view.warn);
      b.classList.toggle('done', view.status === 'done');
    }
  };
})(typeof self !== 'undefined' ? self : this);
