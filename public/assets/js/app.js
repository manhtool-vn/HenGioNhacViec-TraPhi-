/* ManhTool — Hẹn giờ nhắc việc */
(function () {
  'use strict';

  var TC = window.TimerCore;
  var TT = window.TimerThemes;
  var TS = window.TimerSounds;
  var PIP = window.TimerPiP;
  var TM = window.TimerMusic;
  var $ = function (id) { return document.getElementById(id); };
  var BASE_TITLE = document.title;
  var OPENED_FROM_SHARE = /[?&]p=/.test(location.search); // mở từ liên kết chia sẻ thì không bật hướng dẫn
  var SNOOZE_MS = 5 * TC.MIN;
  var FINAL_MS = 10 * TC.SEC;       // 10 giây cuối: số nhấp nháy
  var FOCUS_REVEAL_MS = TC.MIN;     // chế độ tập trung: phút cuối mới hiện việc sắp làm
  var RING_LEN = 2 * Math.PI * 100; // chu vi vòng tròn r=100 trong SVG
  var MAX_SAVED = 12;
  var STYLES = ['ring', 'bar', 'digits', 'flip']; // kiểu hiển thị toàn màn hình
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var TEMPLATES = [
    { name: 'Đứng dậy vận động', minutes: 45, tasks: ['Đứng dậy khỏi ghế', 'Vươn vai, xoay cổ và vai', 'Đi lại vài vòng', 'Uống một cốc nước'] },
    { name: 'Nghỉ mắt 20-20-20', minutes: 20, tasks: ['Nhìn ra xa khoảng 6 mét trong 20 giây', 'Chớp mắt chậm 10 lần'] },
    { name: 'Pomodoro', minutes: 25, tasks: ['Nghỉ 5 phút, rời khỏi màn hình', 'Ghi lại việc vừa làm được', 'Chọn việc tiếp theo'] },
    { name: 'Uống nước', minutes: 60, tasks: ['Uống một cốc nước'] }
  ];

  var M = TC.MIN, S = TC.SEC;
  var PLAN_TEMPLATES = [
    { name: 'Pomodoro', plan: { steps: [{ name: 'Tập trung', ms: 25 * M }, { name: 'Nghỉ ngắn', ms: 5 * M }], repeat: 4 } },
    { name: '52/17', plan: { steps: [{ name: 'Làm việc', ms: 52 * M }, { name: 'Nghỉ', ms: 17 * M }], repeat: 3 } },
    { name: 'HIIT 40/20', plan: { steps: [{ name: 'Tập', ms: 40 * S }, { name: 'Nghỉ', ms: 20 * S }], repeat: 8 } },
    { name: 'Thuyết trình', plan: { steps: [{ name: 'Mở đầu', ms: 2 * M }, { name: 'Nội dung chính', ms: 10 * M }, { name: 'Hỏi đáp', ms: 3 * M }], repeat: 1 } },
    { name: 'Làm bài kiểm tra', plan: { steps: [{ name: 'Làm bài', ms: 40 * M }, { name: 'Soát lại bài', ms: 5 * M }], repeat: 1 } }
  ];

  var timerBox = $('timerBox'), timeText = $('timeText'), timeSub = $('timeSub'), ringBar = $('ringBar');
  var inH = $('inH'), inM = $('inM'), inS = $('inS');
  var btnStart = $('btnStart'), btnReset = $('btnReset'), btnAddMin = $('btnAddMin');
  var presetBtns = document.querySelectorAll('[data-preset]');
  var pickBtns = document.querySelectorAll('[data-pick]');
  var modeBtns = document.querySelectorAll('[data-mode]');
  var taskForm = $('taskForm'), taskInput = $('taskInput'), taskList = $('taskList'), taskCount = $('taskCount');
  var optSound = $('optSound'), optSoundType = $('optSoundType'), optVolume = $('optVolume'), optSpeak = $('optSpeak');
  var optPre = $('optPre'), optLoop = $('optLoop'), optNotify = $('optNotify'), optWake = $('optWake');
  var doneDlg = $('doneDialog'), doneBody = $('doneBody');
  var stage = $('stage'), stageFx = $('stageFx'), stagePanel = $('stagePanel');
  var toastEl = $('toast'), toastMsg = $('toastMsg'), toastAction = $('toastAction');

  /* ---------- Lưu trên máy ---------- */
  var KEY = {
    state: 'mt-hg-state', tasks: 'mt-hg-tasks', opts: 'mt-hg-opts', stats: 'mt-hg-stats', round: 'mt-hg-round',
    plan: 'mt-hg-plan', run: 'mt-hg-run', saved: 'mt-hg-saved', photo: 'mt-hg-photo'
  };
  function load(key) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  // Các mục được đồng bộ theo tài khoản (xem account.js)
  var SYNCED = {};
  ['tasks', 'opts', 'stats', 'plan', 'saved'].forEach(function (k) { SYNCED['mt-hg-' + k] = true; });
  function store(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { return false; }
    if (SYNCED[key] && window.TimerAccount) window.TimerAccount.dirty();
    return true;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  var savedTasks = load(KEY.tasks);
  var firstVisit = savedTasks === null;
  var tasks = firstVisit ? TEMPLATES[0].tasks.slice() : TC.cleanTasks(savedTasks);
  var state = TC.revive(load(KEY.state), Date.now(), TEMPLATES[0].minutes * TC.MIN);
  var stats = TC.cleanHistory(load(KEY.stats));
  var round = Math.max(0, Math.floor(Number(load(KEY.round)) || 0)); // lượt hiện tại khi tự đếm lại
  var planDraft = TC.cleanPlan(load(KEY.plan)) || clone(PLAN_TEMPLATES[0].plan);
  var saved = (function () {
    var raw = load(KEY.saved);
    if (!Array.isArray(raw)) return [];
    return raw.filter(function (s) { return s && typeof s.name === 'string' && s.cfg && typeof s.cfg === 'object'; })
      .slice(0, MAX_SAVED)
      .map(function (s) {
        var c = s.cfg;
        return {
          name: TC.cleanText(s.name).slice(0, 40) || 'Không tên',
          cfg: {
            plan: TC.cleanPlan(c.plan), ms: Math.min(TC.MAX_MS, Math.max(0, Math.floor(Number(c.ms) || 0))),
            tasks: TC.cleanTasks(c.tasks), pick: c.pick === 'random' ? 'random' : 'list',
            theme: typeof c.theme === 'string' ? c.theme : null,
            style: STYLES.indexOf(c.style) !== -1 ? c.style : null,
            title: TC.cleanText(c.title).slice(0, 80)
          }
        };
      });
  })();
  var photoUrl = null;
  try { photoUrl = localStorage.getItem(KEY.photo); } catch (e) {}
  if (photoUrl && !/^data:image\/(jpeg|png|webp);base64,/.test(photoUrl)) photoUrl = null;

  // Chuỗi đang chạy: { plan, pos: { step, cycle } }
  var runPlan = null;
  (function () {
    var r = load(KEY.run);
    if (!r || state.status === 'idle') return;
    var p = TC.cleanPlan(r.plan);
    if (p && TC.validPos(p, r.pos)) runPlan = { plan: p, pos: { step: r.pos.step, cycle: r.pos.cycle } };
  })();

  var opts = {
    mode: 'single', pick: 'list', sound: true, soundType: 'bell', volume: 70, speak: false, pre: 0, loop: false,
    notify: false, wake: false, theme: TT.list[0].id, stageStyle: 'ring', stageClock: true, stageNext: true, stageFocus: true, compact: false, cardTheme: true, title: '',
    musicOn: false, musicSrc: 'theme', musicVol: 40, musicRun: true,
    singleMs: 0 // thời gian của kiểu "Đếm 1 lần", tách riêng để bước của chuỗi không ghi đè
  };
  (function () {
    var s = load(KEY.opts);
    if (!s || typeof s !== 'object') return;
    if (s.mode === 'plan') opts.mode = 'plan';
    if (s.pick === 'random') opts.pick = 'random';
    opts.sound = s.sound !== false;
    if (TS.has(s.soundType) && s.soundType !== 'ping') opts.soundType = s.soundType;
    if (s.volume >= 0 && s.volume <= 100) opts.volume = Math.round(s.volume);
    opts.speak = s.speak === true;
    if ([0, 1, 2, 5].indexOf(s.pre) !== -1) opts.pre = s.pre;
    opts.loop = s.loop === true;
    opts.notify = s.notify === true;
    opts.wake = s.wake === true;
    if (typeof s.theme === 'string' && TT.get(s.theme).id === s.theme) opts.theme = s.theme;
    if (STYLES.indexOf(s.stageStyle) !== -1) opts.stageStyle = s.stageStyle;
    opts.stageClock = s.stageClock !== false;
    opts.stageNext = s.stageNext !== false;
    opts.stageFocus = s.stageFocus !== false;
    opts.compact = s.compact === true;
    opts.musicOn = s.musicOn === true;
    if (s.musicSrc === 'theme' || s.musicSrc === 'file' || (TM && TM.get(s.musicSrc))) opts.musicSrc = s.musicSrc;
    if (s.musicVol >= 0 && s.musicVol <= 100) opts.musicVol = Math.round(s.musicVol);
    opts.musicRun = s.musicRun !== false;
    opts.title = TC.cleanText(s.title).slice(0, 80);
    if (s.singleMs > 0 && s.singleMs <= TC.MAX_MS) opts.singleMs = Math.floor(s.singleMs);
  })();
  if (opts.theme === 'photo' && !photoUrl) opts.theme = TT.list[0].id;

  function saveState() {
    store(KEY.state, state);
    store(KEY.round, round);
    store(KEY.run, runPlan);
  }
  function saveTasks() { store(KEY.tasks, tasks); }
  function saveOpts() { store(KEY.opts, opts); }
  function savePlan() { store(KEY.plan, planDraft); }

  /* ---------- Hiển thị ---------- */
  function clock(ts) {
    var d = new Date(ts);
    return d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
  }
  function isActive() { return state.status === 'running' || state.status === 'paused'; }
  function curStep() { return runPlan ? runPlan.plan.steps[runPlan.pos.step] : null; }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  function planSummary(plan) {
    return plan.steps.length + ' bước' + (plan.repeat > 1 ? ' × ' + plan.repeat + ' vòng' : '');
  }

  function stepLabel() {
    var p = runPlan.plan, pos = runPlan.pos;
    return 'Bước ' + (pos.step + 1) + '/' + p.steps.length + (p.repeat > 1 ? ' · Vòng ' + (pos.cycle + 1) + '/' + p.repeat : '');
  }

  // Khi chưa chạy mà đang ở kiểu chuỗi: mặt đồng hồ hiện tổng thời gian của chuỗi
  function planIdleView() {
    if (opts.mode !== 'plan' || isActive() || runPlan) return null;
    var draft = TC.cleanPlan(planDraft);
    return draft ? { left: TC.planTotal(draft), sub: planSummary(draft) } : { left: 0, sub: 'Chuỗi chưa có bước nào' };
  }

  function subText(now) {
    if (runPlan && isActive()) {
      var step = curStep();
      return step.name + ' · ' + stepLabel();
    }
    if (state.status === 'running') return 'Hết giờ lúc ' + clock(state.endAt);
    if (state.status === 'paused') return 'Đang tạm dừng';
    return state.duration ? TC.describe(state.duration) : 'Chưa đặt thời gian';
  }

  // soon = đang ở phút cuối: đổi lời thành "Sắp tới" để chuẩn bị chuyển việc
  function nextText(soon) {
    if (runPlan && isActive()) {
      var n = TC.nextPos(runPlan.plan, runPlan.pos);
      if (n) {
        var st = runPlan.plan.steps[n.step];
        return (soon ? 'Sắp tới: ' : 'Tiếp theo: ') + '<b>' + escapeHtml(st.name) + '</b> (' + TC.describe(st.ms) + ')';
      }
      return 'Đây là bước cuối';
    }
    if (!tasks.length) return '';
    if (opts.pick === 'random') return (soon ? 'Sắp hết giờ, ' : 'Hết giờ sẽ ') + 'chọn ngẫu nhiên 1 trong <b>' + tasks.length + ' việc</b>';
    return (soon ? 'Sắp tới: ' : 'Hết giờ: ') + '<b>' + escapeHtml(tasks[0]) + '</b>' + (tasks.length > 1 ? ' và ' + (tasks.length - 1) + ' việc nữa' : '');
  }

  function render() {
    var now = Date.now();
    var idleView = planIdleView();
    var left = idleView ? idleView.left : TC.remaining(state, now);
    var text = TC.format(left);
    var frac = idleView ? 1 : TC.progress(state, now);
    var warn = state.status === 'running' && left > 0 && ((opts.pre && left <= opts.pre * TC.MIN) || left <= FINAL_MS);
    var label = state.status === 'running' ? 'Tạm dừng' : state.status === 'paused' ? 'Tiếp tục' : 'Bắt đầu';
    var sub = idleView ? idleView.sub : subText(now);
    var hasPlan = !!(runPlan && isActive());

    if (!stageOpen) {
      timeText.textContent = text;
      timeText.classList.toggle('is-long', text.length > 5);
      ringBar.style.strokeDashoffset = String(RING_LEN * (1 - frac));
      timerBox.dataset.status = state.status;
      timerBox.dataset.mode = opts.mode;
      timerBox.classList.toggle('is-warning', warn);
      timerBox.classList.toggle('has-plan', hasPlan);
      btnStart.querySelector('span').textContent = label;
      timeSub.textContent = sub;
      if (round > 1 && isActive()) {
        var b = document.createElement('span');
        b.className = 'round-badge';
        b.textContent = 'Lượt ' + round;
        timeSub.appendChild(b);
      }
      btnReset.disabled = state.status === 'idle';
    }

    var stageSub = sub;
    if (hasPlan) {
      var all = TC.planLeft(runPlan.plan, runPlan.pos, left);
      stageSub = 'Cả chuỗi còn ' + TC.format(all) + (state.status === 'running' ? ' · xong lúc ' + clock(now + all) : '');
    } else if (state.status === 'running') {
      stageSub = 'Hết giờ lúc ' + clock(state.endAt) + (round > 1 ? ' · Lượt ' + round : '');
    }

    if (stageOpen) {
      // Chế độ tập trung: đang chạy thì ẩn việc sắp làm và giờ hiện tại, chỉ hiện lại ở phút cuối
      var soon = state.status === 'running' && left <= FOCUS_REVEAL_MS;
      stage.classList.toggle('is-focus', !!(opts.stageFocus && state.status === 'running' && !soon));
      setStageTime(text);
      $('stageTime').classList.toggle('is-long', text.length > 5);
      $('stageSub').textContent = stageSub;
      $('stageRing').style.strokeDashoffset = String(RING_LEN * (1 - frac));
      $('stageBar').style.transform = 'scaleX(' + frac + ')';
      $('stageNext').innerHTML = nextText(soon);
      $('stageClock').textContent = clock(now);
      $('stageStart').querySelector('span').textContent = label;
      $('stageReset').disabled = state.status === 'idle';
      if (hasPlan) $('stageStep').textContent = curStep().name;
      stage.dataset.status = state.status;
      stage.classList.toggle('has-plan', hasPlan);
      stage.classList.toggle('is-warning', warn);
      stage.classList.toggle('is-final', state.status === 'running' && left > 0 && left <= FINAL_MS);
    }

    if (PIP.isOpen()) {
      var vars = TT.cssVars(TT.get(opts.theme));
      if (photoUrl) vars['--st-photo'] = 'url("' + photoUrl + '")';
      PIP.update({ time: text, sub: hasPlan ? curStep().name : (opts.title || stageSub), frac: frac, status: state.status, warn: warn, vars: vars });
    }

    if (!flashTimer) {
      document.title = isActive()
        ? text + (state.status === 'paused' ? ' (dừng)' : '') + (hasPlan ? ' · ' + curStep().name : '') + ' · ' + BASE_TITLE
        : BASE_TITLE;
    }
    syncMusic();
  }

  function fillInputs(ms) {
    var p = TC.split(ms);
    inH.value = p.h;
    inM.value = p.m;
    inS.value = p.s;
    markPreset(ms);
    rememberSingle(ms);
  }
  function rememberSingle(ms) {
    if (opts.singleMs === ms) return;
    opts.singleMs = ms;
    saveOpts();
  }
  function markPreset(ms) {
    presetBtns.forEach(function (b) { b.classList.toggle('is-active', +b.dataset.preset * TC.MIN === ms); });
  }
  function readInputs() { return TC.toMs(inH.value, inM.value, inS.value); }
  // Trạng thái chờ luôn mang thời gian ở 3 ô giờ/phút/giây (kể cả sau khi chạy chuỗi hay báo lại)
  function toIdle() { return TC.idle(readInputs()); }

  /* ---------- Thống kê ---------- */
  function addStats(ms) {
    if (!(ms > 0)) return;
    stats = TC.addRound(stats, TC.dayKey(new Date()), ms);
    store(KEY.stats, stats);
    renderStats();
  }

  function shortDur(ms) {
    if (ms < TC.MIN) return Math.round(ms / TC.SEC) + ' giây';
    return TC.describe(Math.round(ms / TC.MIN) * TC.MIN);
  }

  function renderStats() {
    var s = TC.today(stats, TC.dayKey(new Date()));
    var el = $('todayStats').lastChild;
    if (!s.rounds) el.textContent = 'Hôm nay chưa có lượt nào';
    else el.innerHTML = 'Hôm nay: <b>' + s.rounds + ' lượt</b> · ' + shortDur(s.ms);
    renderWeek();
  }

  // Biểu đồ cột 7 ngày: một dãy số liệu (thời gian), cột hôm nay đậm hơn, rê chuột để xem số
  function renderWeek() {
    var days = TC.lastDays(stats, new Date(), 7);
    var max = 0, sumMs = 0, sumR = 0;
    days.forEach(function (d) { max = Math.max(max, d.ms); sumMs += d.ms; sumR += d.rounds; });
    var chart = $('weekChart'), body = $('weekTable').tBodies[0];
    chart.textContent = '';
    body.textContent = '';
    days.forEach(function (d, i) {
      var col = document.createElement('div');
      col.className = 'week-col' + (i === days.length - 1 ? ' is-today' : '');
      col.tabIndex = 0;
      var info = d.rounds ? d.rounds + ' lượt · ' + shortDur(d.ms) : 'Chưa đếm';
      col.setAttribute('aria-label', d.label + ' ' + d.date + ': ' + info);
      var bar = document.createElement('div');
      bar.className = 'week-bar';
      bar.style.height = max ? Math.max(d.ms ? 4 : 0, Math.round(d.ms / max * 100)) + '%' : '0';
      var lbl = document.createElement('span');
      lbl.className = 'week-lbl';
      lbl.textContent = i === days.length - 1 ? 'Nay' : d.label;
      var tip = document.createElement('span');
      tip.className = 'week-tip';
      tip.innerHTML = '<b></b><span></span>';
      tip.firstChild.textContent = d.label + ' ' + d.date;
      tip.lastChild.textContent = info;
      col.appendChild(bar);
      col.appendChild(lbl);
      col.appendChild(tip);
      chart.appendChild(col);
      var tr = document.createElement('tr');
      [d.label + ' ' + d.date, String(d.rounds), shortDur(d.ms)].forEach(function (v) {
        var td = document.createElement('td');
        td.textContent = v;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    chart.setAttribute('aria-label', 'Biểu đồ thời gian đã đếm 7 ngày qua, tổng ' + sumR + ' lượt');
    $('weekSum').textContent = sumR ? '7 ngày qua: ' + sumR + ' lượt · ' + shortDur(sumMs) : '7 ngày qua: chưa có lượt nào';
  }

  /* ---------- Chạy đồng hồ ----------
     Nhịp 250ms chỉ để vẽ lại; thời điểm hết giờ do một setTimeout riêng canh đúng mốc,
     vì trình duyệt có thể làm chậm nhịp lặp lại khi tab nằm ở nền lâu. */
  var tickTimer = null, endTimer = null, prevLeft = 0;
  function schedule() {
    clearInterval(tickTimer);
    clearTimeout(endTimer);
    tickTimer = endTimer = null;
    prevLeft = TC.remaining(state, Date.now());
    // Khung toàn màn hình / cửa sổ nổi cần nhịp cả khi chưa chạy để cập nhật giờ
    if (state.status === 'running' || stageOpen || PIP.isOpen()) tickTimer = setInterval(onTick, 250);
    if (state.status === 'running') endTimer = setTimeout(onTick, Math.max(0, state.endAt - Date.now()) + 15);
  }
  function onTick() {
    var now = Date.now();
    var next = TC.tick(state, now);
    if (next !== state) {
      state = next;
      if (runPlan) stepEnded(false);
      else { saveState(); finish(false); }
      schedule();
    } else if (state.status === 'running') {
      var left = TC.remaining(state, now);
      if (TC.crossed(prevLeft, left, opts.pre * TC.MIN)) preAlert(left);
      prevLeft = left;
    }
    render();
  }

  function setState(next) {
    state = next;
    saveState();
    schedule();
    render();
  }

  // Bắt đầu một lượt mới theo kiểu đang chọn (1 lần hoặc chuỗi)
  function startFresh() {
    unlockAudio();
    var now = Date.now();
    if (opts.mode === 'plan') {
      var plan = TC.cleanPlan(planDraft);
      if (!plan) { toast('Chuỗi chưa có bước nào, bấm "Thêm bước" trước nhé'); return; }
      runPlan = { plan: plan, pos: { step: 0, cycle: 0 } };
      state = TC.idle(plan.steps[0].ms);
      renderSeqTrack();
    } else {
      var ms = readInputs();
      if (!ms) {
        toast('Bạn chưa đặt thời gian');
        if (stageOpen) closeStage();
        inM.focus();
        return;
      }
      runPlan = null;
      state = TC.idle(ms);
      fillInputs(ms);
    }
    round = 1;
    setState(TC.start(state, now));
    requestWake();
  }

  function startPause() {
    unlockAudio();
    if (state.status === 'running') {
      setState(TC.pause(state, Date.now()));
      releaseWake();
    } else if (state.status === 'paused') {
      setState(TC.start(state, Date.now()));
      requestWake();
    } else {
      startFresh();
    }
  }

  // silent: đặt lại do hệ thống (vd dừng tự đếm lại) thì không cần nút Hoàn tác
  function resetTimer(silent) {
    if (state.status === 'idle') return;
    // Lỡ tay bấm Đặt lại: giữ bản cũ để Hoàn tác. Đang chạy thì mốc kết thúc giữ nguyên,
    // nên hoàn tác xong đồng hồ tiếp tục như chưa từng bị đặt lại.
    var before = isActive() && silent !== true ? { state: state, round: round, runPlan: runPlan && clone(runPlan) } : null;
    round = 0;
    runPlan = null;
    setState(toIdle());
    releaseWake();
    renderSeqTrack();
    if (before) {
      toast('Đã đặt lại đồng hồ', 'Hoàn tác', function () {
        if (isActive()) return;
        round = before.round;
        runPlan = before.runPlan;
        setState(before.state);
        renderSeqTrack();
        if (state.status === 'running') requestWake();
        announce('Đã khôi phục đồng hồ');
      });
    }
  }

  function addMinute() { if (isActive()) setState(TC.addTime(state, TC.MIN, Date.now())); }

  btnStart.addEventListener('click', startPause);
  btnReset.addEventListener('click', resetTimer);
  btnAddMin.addEventListener('click', addMinute);

  [inH, inM, inS].forEach(function (input) {
    input.addEventListener('input', function () {
      var ms = readInputs();
      state = TC.setDuration(state, ms);
      markPreset(ms);
      rememberSingle(ms);
      clearUntil();
      saveState();
      render();
    });
    // Rời ô thì quy đổi cho gọn, vd 90 phút → 1 giờ 30 phút
    input.addEventListener('change', function () { fillInputs(readInputs()); });
    input.addEventListener('focus', function () { input.select(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); fillInputs(readInputs()); startPause(); }
    });
  });

  presetBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      var ms = +b.dataset.preset * TC.MIN;
      fillInputs(ms);
      clearUntil();
      setState(TC.setDuration(toIdle(), ms));
    });
  });

  /* Hẹn đến một giờ cụ thể (24 giờ), vd 11:30 nghỉ trưa, 17:30 tan làm.
     Gõ "1730" tự thành 17:30; bên cạnh có các giờ gợi ý bấm 1 chạm. */
  var inUntil = $('inUntil'), untilBox = $('untilChips'), untilValue = '';

  function clearUntil() {
    untilValue = '';
    inUntil.value = '';
    markUntil();
  }

  function applyUntil(hhmm) {
    var ms = TC.msUntil(hhmm, new Date());
    if (!ms) return false;
    untilValue = hhmm;
    inUntil.value = hhmm;
    fillInputs(ms);
    setState(TC.setDuration(toIdle(), ms));
    markUntil();
    return true;
  }

  function markUntil() {
    untilBox.querySelectorAll('.until-chip').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.time === untilValue ? 'true' : 'false');
    });
  }

  function shortLeft(ms) {
    var m = Math.round(ms / TC.MIN);
    return m < 60 ? m + ' phút' : Math.floor(m / 60) + 'g' + (m % 60 ? (m % 60 < 10 ? '0' : '') + (m % 60) : '');
  }

  function renderUntilChips() {
    untilBox.querySelectorAll('.until-chip').forEach(function (b) { b.remove(); });
    TC.suggestTimes(new Date(), 4).forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip until-chip';
      b.dataset.time = s.time;
      b.innerHTML = '<span></span><small></small>';
      b.firstChild.textContent = s.time;
      b.lastChild.textContent = shortLeft(s.ms);
      b.title = 'Hết giờ lúc ' + s.time + ' (còn ' + TC.describe(s.ms) + ')';
      b.addEventListener('click', function () { applyUntil(s.time); });
      untilBox.appendChild(b);
    });
    markUntil();
  }

  // Ô gõ giờ: chỉ nhận số, tự chèn dấu ":" sau 2 số
  inUntil.addEventListener('input', function () {
    var digits = inUntil.value.replace(/\D/g, '').slice(0, 4);
    inUntil.value = digits.length > 2 ? digits.slice(0, 2) + ':' + digits.slice(2) : digits;
    if (digits.length === 4) {
      var t = TC.parseClock(digits);
      inUntil.classList.toggle('is-bad', !t);
      if (t) applyUntil(t);
    } else {
      inUntil.classList.remove('is-bad');
    }
  });
  function commitUntil() {
    if (!inUntil.value) return;
    var t = TC.parseClock(inUntil.value);
    if (t) { if (t !== untilValue) applyUntil(t); inUntil.value = t; inUntil.classList.remove('is-bad'); }
    else { inUntil.classList.add('is-bad'); toast('Giờ chưa đúng, gõ kiểu 24 giờ như 1730 hoặc 9:30'); }
  }
  inUntil.addEventListener('change', commitUntil);
  inUntil.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); commitUntil(); if (untilValue) startPause(); }
  });
  inUntil.addEventListener('focus', function () { inUntil.select(); });
  renderUntilChips();
  // Giờ gợi ý trôi theo đồng hồ: làm mới mỗi phút (chỉ khi đang chờ, không chạy)
  setInterval(function () { if (!isActive() && opts.mode === 'single') renderUntilChips(); }, 60000);

  /* ---------- Kiểu hẹn giờ: 1 lần / chuỗi ---------- */
  function renderMode() {
    modeBtns.forEach(function (b) {
      var on = b.dataset.mode === opts.mode;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    render();
  }
  modeBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      if (isActive()) return;
      opts.mode = b.dataset.mode;
      saveOpts();
      renderMode();
    });
  });
  radioKeys(modeBtns);

  // Mũi tên trái/phải chuyển lựa chọn trong nhóm nút kiểu radio
  function radioKeys(list) {
    list.forEach(function (b, i) {
      b.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        var other = list[(i + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length];
        other.click();
        other.focus();
      });
    });
  }

  /* ---------- Soạn chuỗi nhiều bước ---------- */
  var planSteps = $('planSteps');

  function renderPlanEditor() {
    planSteps.textContent = '';
    planDraft.steps.forEach(function (st, i) {
      var li = document.createElement('li');
      li.className = 'plan-step';
      var name = document.createElement('input');
      name.type = 'text';
      name.maxLength = TC.MAX_STEP_NAME;
      name.value = st.name;
      name.placeholder = 'Tên bước';
      name.setAttribute('aria-label', 'Tên bước ' + (i + 1));
      name.addEventListener('change', function () {
        st.name = TC.cleanText(name.value).slice(0, TC.MAX_STEP_NAME) || 'Bước ' + (i + 1);
        name.value = st.name;
        savePlan();
        render();
      });
      var time = document.createElement('input');
      time.type = 'text';
      time.className = 'step-time';
      time.inputMode = 'numeric';
      time.value = TC.format(st.ms);
      time.title = 'Gõ số phút (25) hoặc phút:giây (1:30)';
      time.setAttribute('aria-label', 'Thời gian bước ' + (i + 1));
      time.addEventListener('focus', function () { time.select(); });
      time.addEventListener('change', function () {
        var ms = TC.parseDuration(time.value);
        time.classList.toggle('is-bad', !ms);
        if (!ms) { toast('Gõ số phút (vd 25) hoặc phút:giây (vd 1:30)'); return; }
        st.ms = ms;
        time.value = TC.format(ms);
        savePlan();
        updatePlanTotal();
        render();
      });
      [name, time].forEach(function (el) {
        el.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
        });
      });
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'task-del';
      del.title = 'Xóa bước này';
      del.setAttribute('aria-label', 'Xóa bước ' + (i + 1));
      del.innerHTML = '<svg class="ic"><use href="#i-trash"/></svg>';
      del.addEventListener('click', function () {
        planDraft.steps.splice(i, 1);
        savePlan();
        renderPlanEditor();
        render();
      });
      li.appendChild(name);
      li.appendChild(time);
      li.appendChild(del);
      planSteps.appendChild(li);
    });
    $('planRepeat').value = planDraft.repeat;
    $('btnAddStep').disabled = planDraft.steps.length >= TC.MAX_STEPS;
    updatePlanTotal();
  }

  function updatePlanTotal() {
    var p = TC.cleanPlan(planDraft);
    $('planTotal').innerHTML = p ? 'Tổng: <b>' + TC.describe(TC.planTotal(p)) + '</b> · ' + planSummary(p) : 'Chưa có bước nào';
  }

  $('btnAddStep').addEventListener('click', function () {
    if (planDraft.steps.length >= TC.MAX_STEPS) return;
    planDraft.steps.push({ name: 'Bước ' + (planDraft.steps.length + 1), ms: 5 * TC.MIN });
    savePlan();
    renderPlanEditor();
    render();
    var inputs = planSteps.querySelectorAll('.plan-step input:first-child');
    var last = inputs[inputs.length - 1];
    last.focus();
    last.select();
  });
  $('planRepeat').addEventListener('change', function () {
    planDraft.repeat = Math.min(TC.MAX_REPEAT, Math.max(1, Math.floor(+this.value) || 1));
    this.value = planDraft.repeat;
    savePlan();
    updatePlanTotal();
    render();
  });

  PLAN_TEMPLATES.forEach(function (tpl) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = tpl.name;
    b.addEventListener('click', function () {
      var prev = clone(planDraft);
      planDraft = clone(tpl.plan);
      savePlan();
      renderPlanEditor();
      render();
      toast('Đã dùng chuỗi ' + tpl.name, 'Hoàn tác', function () {
        planDraft = prev;
        savePlan();
        renderPlanEditor();
        render();
      });
    });
    $('planTemplates').appendChild(b);
  });

  // Các bước của vòng hiện tại, bước đang chạy được tô đậm
  function renderSeqTrack() {
    var track = $('seqTrack');
    track.textContent = '';
    if (!runPlan) return;
    var p = runPlan.plan;
    p.steps.forEach(function (st, i) {
      var li = document.createElement('li');
      li.textContent = st.name;
      if (i < runPlan.pos.step) li.className = 'is-done';
      if (i === runPlan.pos.step) li.className = 'is-now';
      track.appendChild(li);
    });
    if (p.repeat > 1) {
      var c = document.createElement('li');
      c.className = 'seq-cycle';
      c.textContent = 'Vòng ' + (runPlan.pos.cycle + 1) + '/' + p.repeat;
      track.appendChild(c);
    }
  }

  // Hết một bước: sang bước sau, hoặc báo hết cả chuỗi
  function stepEnded(skipped) {
    var now = Date.now();
    var ran = skipped ? Math.max(0, state.total - TC.remaining(state, now)) : state.total;
    addStats(ran);
    var next = TC.nextPos(runPlan.plan, runPlan.pos);
    if (next) {
      runPlan.pos = next;
      var st = curStep();
      state = TC.start(TC.idle(st.ms), now);
      saveState();
      schedule();
      renderSeqTrack();
      announceStep(st);
      render();
      return;
    }
    var plan = runPlan.plan;
    if (skipped) state = TC.tick({ status: 'running', duration: state.duration, total: state.total, endAt: now, left: 0 }, now);
    finish(false, plan);
    schedule();
    render();
  }

  function skipStep() {
    if (!runPlan || !isActive()) return;
    unlockAudio();
    stepEnded(true);
  }

  function announceStep(st) {
    // Toàn màn hình đã hiện tên bước rất to ở giữa → không cần thêm thông báo nhỏ
    if (!stageOpen) toast('Bắt đầu: ' + st.name + ' (' + TC.describe(st.ms) + ')');
    announce('Bắt đầu ' + st.name + ', ' + TC.describe(st.ms));
    if (opts.sound) playSound(opts.soundType);
    speak('Bắt đầu ' + st.name + ', ' + TC.describe(st.ms));
    if (document.hidden) notifyText(st.name, 'Bắt đầu, ' + TC.describe(st.ms));
    if (navigator.vibrate) { try { navigator.vibrate(200); } catch (e) {} }
    var el = $('stageStep');
    el.classList.remove('is-new');
    void el.offsetWidth;
    el.classList.add('is-new');
  }

  /* ---------- Danh sách việc ---------- */
  var undoTasks = null;

  function renderTasks() {
    taskList.textContent = '';
    tasks.forEach(function (text, i) {
      var li = document.createElement('li');
      li.className = 'task-item';
      li.dataset.index = i;

      var num = document.createElement('span');
      num.className = 'task-num';
      num.title = 'Kéo để sắp xếp (hoặc Alt + mũi tên trong ô)';
      num.setAttribute('aria-hidden', 'true');
      enableDrag(li, num, i);

      // textarea 1 dòng tự giãn để việc dài vẫn đọc được hết trên điện thoại
      var input = document.createElement('textarea');
      input.className = 'task-text';
      input.rows = 1;
      input.maxLength = TC.MAX_TASK_LEN;
      input.value = text;
      input.addEventListener('input', function () { autosize(input); });
      input.setAttribute('aria-label', 'Việc ' + (i + 1));
      input.addEventListener('change', function () {
        var t = TC.cleanText(input.value);
        if (t) tasks[i] = t;
        else tasks.splice(i, 1);
        saveTasks();
        renderTasks();
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault();
          var to = e.key === 'ArrowUp' ? i - 1 : i + 1;
          if (to < 0 || to >= tasks.length) return;
          var t = TC.cleanText(input.value);
          if (t) tasks[i] = t;
          moveTask(i, e.key === 'ArrowUp' ? i - 1 : i + 2);
          taskList.querySelectorAll('.task-text')[to].focus();
        }
      });

      var del = document.createElement('button');
      del.className = 'task-del';
      del.type = 'button';
      del.title = 'Xóa việc này';
      del.setAttribute('aria-label', 'Xóa: ' + text);
      del.innerHTML = '<svg class="ic"><use href="#i-trash"/></svg>';
      del.addEventListener('click', function () {
        var removed = tasks.splice(i, 1)[0];
        saveTasks();
        renderTasks();
        var next = taskList.querySelectorAll('.task-del')[Math.min(i, tasks.length - 1)];
        (next || taskInput).focus();
        toast('Đã xóa "' + removed + '"', 'Hoàn tác', function () {
          tasks.splice(Math.min(i, tasks.length), 0, removed);
          saveTasks();
          renderTasks();
        });
      });

      li.appendChild(num);
      li.appendChild(input);
      li.appendChild(del);
      taskList.appendChild(li);
    });
    taskList.querySelectorAll('.task-text').forEach(autosize);
    taskCount.textContent = tasks.length ? tasks.length + ' việc' : '';
    render();
  }

  // Chèn việc ở vị trí from vào trước vị trí to (to tính theo danh sách cũ)
  function moveTask(from, to) {
    if (to > from) to--;
    if (to === from || to < 0 || to >= tasks.length) return;
    var t = tasks.splice(from, 1)[0];
    tasks.splice(to, 0, t);
    saveTasks();
    renderTasks();
  }

  // Kéo số thứ tự để sắp xếp, dùng được cả chuột và cảm ứng
  function enableDrag(li, handle, index) {
    handle.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      li.classList.add('is-dragging');
      var target = null, after = false;
      function clearMarks() {
        taskList.querySelectorAll('.drop-before, .drop-after').forEach(function (el) { el.classList.remove('drop-before', 'drop-after'); });
      }
      function move(ev) {
        var el = document.elementFromPoint(ev.clientX, ev.clientY);
        var over = el && el.closest && el.closest('.task-item');
        clearMarks();
        target = null;
        if (over && over !== li && taskList.contains(over)) {
          var r = over.getBoundingClientRect();
          after = ev.clientY > r.top + r.height / 2;
          over.classList.add(after ? 'drop-after' : 'drop-before');
          target = over;
        }
      }
      function up() {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        li.classList.remove('is-dragging');
        clearMarks();
        if (target) moveTask(index, +target.dataset.index + (after ? 1 : 0));
      }
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
  }

  function autosize(ta) {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }
  window.addEventListener('resize', function () {
    clearTimeout(autosize._t);
    autosize._t = setTimeout(function () { taskList.querySelectorAll('.task-text').forEach(autosize); }, 150);
  });

  taskForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var t = TC.cleanText(taskInput.value);
    if (!t) { taskInput.focus(); return; }
    if (tasks.length >= TC.MAX_TASKS) { toast('Tối đa ' + TC.MAX_TASKS + ' việc'); return; }
    tasks.push(t);
    saveTasks();
    renderTasks();
    taskInput.value = '';
    taskInput.focus();
  });

  // Mẫu có sẵn: thay danh sách và thời gian (hoàn tác được)
  TEMPLATES.forEach(function (tpl) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.innerHTML = '<span></span><small></small>';
    b.firstChild.textContent = tpl.name;
    b.lastChild.textContent = tpl.minutes + ' phút';
    b.addEventListener('click', function () { applyTemplate(tpl); });
    $('templates').appendChild(b);
  });

  function applyTemplate(tpl) {
    var same = tasks.join('\n') === tpl.tasks.join('\n');
    var prev = { tasks: tasks.slice(), ms: readInputs(), mode: opts.mode };
    tasks = tpl.tasks.slice();
    saveTasks();
    renderTasks();
    if (!isActive()) {
      opts.mode = 'single';
      saveOpts();
      fillInputs(tpl.minutes * TC.MIN);
      setState(TC.idle(tpl.minutes * TC.MIN));
      renderMode();
    }
    if (prev.tasks.length && !same) {
      undoTasks = prev;
      toast('Đã dùng mẫu ' + tpl.name, 'Hoàn tác', function () {
        if (!undoTasks) return;
        tasks = undoTasks.tasks;
        saveTasks();
        renderTasks();
        if (!isActive()) {
          opts.mode = undoTasks.mode;
          saveOpts();
          fillInputs(undoTasks.ms);
          setState(TC.idle(undoTasks.ms));
          renderMode();
        }
        undoTasks = null;
      });
    } else if (isActive()) {
      toast('Đồng hồ đang chạy nên giữ nguyên thời gian, chỉ đổi danh sách');
    }
  }

  // Cách nhắc: cả danh sách / chọn ngẫu nhiên 1 việc
  function renderPick() {
    pickBtns.forEach(function (b) {
      var on = b.dataset.pick === opts.pick;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
  }
  pickBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      opts.pick = b.dataset.pick;
      saveOpts();
      renderPick();
      render();
    });
  });
  radioKeys(pickBtns);

  /* ---------- Hết giờ ---------- */
  var lastPick = -1;

  // chainPlan: có khi vừa xong cả một chuỗi (các bước đã được cộng thống kê rồi)
  function finish(late, chainPlan) {
    var ran = state.total || state.duration;
    if (!late && !chainPlan) addStats(ran);
    var total = chainPlan ? TC.planTotal(chainPlan) : ran;

    // Tự đếm lại: lượt mới chạy ngay, hộp báo vẫn hiện để nhắc việc
    var looping = opts.loop && !late && (chainPlan || state.duration > 0);
    var endedAt = state.endAt;
    if (looping) {
      round = Math.max(1, round) + 1;
      if (chainPlan) {
        runPlan = { plan: chainPlan, pos: { step: 0, cycle: 0 } };
        state = TC.start(TC.idle(chainPlan.steps[0].ms), Date.now());
      } else {
        state = TC.start(TC.reset(state), Date.now());
      }
    } else {
      runPlan = null;
      releaseWake();
    }
    saveState();
    renderSeqTrack();
    openDone(late, looping, total, endedAt, !!chainPlan);
    if (!late) {
      announce('Hết giờ.' + (tasks.length ? ' Việc cần làm: ' + tasks.slice(0, 3).join(', ') : ''));
      if (opts.sound) alarm.start();
      notify(total);
      if (navigator.vibrate) { try { navigator.vibrate([300, 150, 300, 150, 600]); } catch (e) {} }
      flashTitle();
      speakDone();
    }
  }

  function openDone(late, looping, total, endedAt, wasPlan) {
    doneDlg.dataset.mode = looping ? 'loop' : 'once';
    $('doneTitle').textContent = wasPlan ? 'Xong cả chuỗi!' : 'Hết giờ!';
    $('doneSub').textContent = late && endedAt
      ? 'Đã hết giờ lúc ' + clock(endedAt) + ' khi bạn đóng trang'
      : looping
        ? 'Đã đủ ' + TC.describe(total) + '. Lượt ' + round + ' đã bắt đầu' + (runPlan ? '' : ', hết giờ lúc ' + clock(state.endAt))
        : 'Đã đủ ' + TC.describe(total);
    $('btnAgain').querySelector('span').textContent = looping ? 'Đã rõ'
      : opts.mode === 'plan' ? 'Chạy lại chuỗi' : 'Đếm lại ' + TC.describe(readInputs());
    $('btnClose').textContent = looping ? 'Dừng tự đếm lại' : 'Đóng';
    doneBody.textContent = '';

    if (!tasks.length) {
      var p = document.createElement('p');
      p.className = 'done-empty';
      p.textContent = 'Bạn chưa thêm việc nào. Thêm ở mục "Hết giờ thì làm gì?" để lần sau được nhắc cụ thể.';
      doneBody.appendChild(p);
    } else if (opts.pick === 'random') {
      renderPickCard(TC.pickIndex(tasks.length, lastPick, secureRandom), false);
    } else {
      renderChecklist();
    }

    if (!doneDlg.open) {
      if (doneDlg.showModal) doneDlg.showModal();
      else doneDlg.setAttribute('open', '');
    }
    $('btnAgain').focus();
  }

  function checkItem(text, onChange) {
    var label = document.createElement('label');
    label.className = 'done-check';
    var input = document.createElement('input');
    input.type = 'checkbox';
    var box = document.createElement('span');
    box.className = 'done-box';
    box.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>';
    var t = document.createElement('span');
    t.className = 'done-text';
    t.textContent = text;
    input.addEventListener('change', function () { alarm.stop(); if (onChange) onChange(); });
    label.appendChild(input);
    label.appendChild(box);
    label.appendChild(t);
    return label;
  }

  function renderChecklist() {
    var ul = document.createElement('ul');
    ul.className = 'done-list';
    var progress = document.createElement('p');
    progress.className = 'done-progress';
    function update() {
      var n = ul.querySelectorAll('input:checked').length;
      progress.textContent = n === tasks.length ? 'Xong hết rồi!' : 'Đã xong ' + n + '/' + tasks.length;
      progress.classList.toggle('is-all', n === tasks.length);
    }
    tasks.forEach(function (text) {
      var li = document.createElement('li');
      li.appendChild(checkItem(text, update));
      ul.appendChild(li);
    });
    doneBody.appendChild(ul);
    doneBody.appendChild(progress);
    update();
  }

  function renderPickCard(index, rolling) {
    lastPick = index;
    doneBody.textContent = '';
    var card = document.createElement('div');
    card.className = 'pick-card' + (rolling ? ' is-rolling' : '');
    var lbl = document.createElement('div');
    lbl.className = 'pick-label';
    lbl.textContent = 'Việc của bạn bây giờ';
    var txt = document.createElement('p');
    txt.className = 'pick-text';
    txt.textContent = tasks[index];
    var actions = document.createElement('div');
    actions.className = 'pick-actions';
    actions.appendChild(checkItem('Đã làm xong'));
    if (tasks.length > 1) {
      var reroll = document.createElement('button');
      reroll.type = 'button';
      reroll.className = 'btn-ghost';
      reroll.innerHTML = '<svg class="ic"><use href="#i-shuffle"/></svg><span>Đổi việc khác</span>';
      reroll.addEventListener('click', function () {
        alarm.stop();
        renderPickCard(TC.pickIndex(tasks.length, lastPick, secureRandom), true);
        speak(tasks[lastPick]);
        doneBody.querySelector('.pick-actions .btn-ghost').focus();
      });
      actions.appendChild(reroll);
    }
    card.appendChild(lbl);
    card.appendChild(txt);
    card.appendChild(actions);
    doneBody.appendChild(card);
  }

  function secureRandom() {
    if (window.crypto && crypto.getRandomValues) {
      var a = new Uint32Array(1);
      crypto.getRandomValues(a);
      return a[0] / 4294967296;
    }
    return Math.random();
  }

  // Đóng hộp báo: tắt chuông, chọn bước tiếp theo
  function closeDone(next) {
    alarm.stop();
    stopFlash();
    stopSpeak();
    if (next === 'again') {
      state = toIdle();
      startFresh();
    } else if (next === 'snooze') {
      unlockAudio();
      runPlan = null;
      setState(TC.snooze(state, SNOOZE_MS, Date.now()));
      requestWake();
    } else if (next === 'stop') {
      opts.loop = false;
      optLoop.checked = false;
      saveOpts();
      resetTimer(true);
    }
    if (doneDlg.open) doneDlg.close();
  }

  $('btnAgain').addEventListener('click', function () {
    closeDone(doneDlg.dataset.mode === 'loop' ? 'keep' : 'again');
  });
  $('btnSnooze').addEventListener('click', function () { closeDone('snooze'); });
  $('btnClose').addEventListener('click', function () {
    closeDone(doneDlg.dataset.mode === 'loop' ? 'stop' : 'close');
  });
  $('btnMute').addEventListener('click', function () { alarm.stop(); stopSpeak(); });
  doneDlg.addEventListener('cancel', function (e) {
    e.preventDefault();
    // Esc lần đầu chỉ tắt chuông, lần sau mới đóng
    if (alarm.on) { alarm.stop(); stopSpeak(); return; }
    closeDone('close');
  });
  // Trình duyệt có thể tự đóng hộp (vd bấm Esc nhiều lần) mà không qua nút nào
  doneDlg.addEventListener('close', function () {
    alarm.stop();
    stopFlash();
    if (state.status === 'done') {
      round = 0;
      runPlan = null;
      setState(toIdle());
    }
  });
  doneDlg.addEventListener('pointerdown', function () { alarm.stop(); });

  /* ---------- Chuông ----------
     Trình duyệt chỉ cho phát tiếng sau một cú bấm của người dùng,
     nên mở AudioContext ngay khi bấm Bắt đầu. */
  var audioCtx = null;
  function unlockAudio() {
    try {
      if (!audioCtx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audioCtx = new AC();
      }
      if (audioCtx.state === 'suspended') {
        var p = audioCtx.resume();
        if (p && p.then) p.then(function () { if (typeof syncMusic === 'function') syncMusic(); }, function () {});
      }
    } catch (e) {}
  }
  // Tải lại trang khi đang đếm: nhạc phải chờ cú bấm đầu tiên (bất kỳ đâu) mới phát được
  ['pointerdown', 'keydown', 'touchend'].forEach(function (ev) {
    document.addEventListener(ev, function () {
      if (audioCtx && audioCtx.state === 'running') return;
      unlockAudio();
      if (typeof syncMusic === 'function') syncMusic();
    }, true);
  });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && audioCtx && audioCtx.state !== 'running') unlockAudio();
  });
  function playSound(id) { TS.play(audioCtx, id, opts.volume / 100); }

  var alarm = {
    on: false, timer: null, until: 0,
    start: function () {
      unlockAudio();
      if (!audioCtx) return;
      alarm.stop();
      alarm.on = true;
      alarm.until = Date.now() + 60000; // kêu tối đa 1 phút
      doneDlg.classList.add('is-ringing');
      if (music) music.duck(true); // nhạc nền nhỏ lại để nghe rõ chuông
      playSound(opts.soundType);
      // Đang đọc to thì giãn chuông ra để nghe rõ lời
      var every = TS.every(opts.soundType) * (opts.speak && canSpeak ? 3 : 1);
      alarm.timer = setInterval(function () {
        if (Date.now() > alarm.until) alarm.stop();
        else playSound(opts.soundType);
      }, every);
    },
    stop: function () {
      clearInterval(alarm.timer);
      alarm.timer = null;
      if (alarm.on && music) music.duck(false);
      alarm.on = false;
      doneDlg.classList.remove('is-ringing');
    }
  };

  // Đọc cho trình đọc màn hình (người khiếm thị) những lúc quan trọng
  function announce(text) {
    var el = $('srLive');
    el.textContent = '';
    setTimeout(function () { el.textContent = text; }, 50);
  }

  function preAlert(left) {
    announce('Còn ' + TC.describe(left));
    if (opts.sound) playSound('ping');
    speak('Còn ' + TC.describe(left));
    if (document.hidden) notifyText('Sắp hết giờ', 'Còn ' + TC.describe(left));
  }

  $('btnTestSound').addEventListener('click', function () { unlockAudio(); playSound(opts.soundType); });

  /* ---------- Đọc to bằng giọng tiếng Việt của máy ---------- */
  var canSpeak = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  if (canSpeak) $('optSpeakWrap').hidden = false;
  function viVoice() {
    var list = window.speechSynthesis.getVoices();
    for (var i = 0; i < list.length; i++) if (/^vi/i.test(list[i].lang)) return list[i];
    return null;
  }
  function speak(text, delay) {
    if (!opts.speak || !canSpeak || !text) return;
    setTimeout(function () {
      try {
        var u = new SpeechSynthesisUtterance(text);
        u.lang = 'vi-VN';
        var v = viVoice();
        if (v) u.voice = v;
        u.rate = 0.95;
        u.volume = Math.max(0.2, opts.volume / 100);
        window.speechSynthesis.speak(u);
      } catch (e) {}
    }, delay || 0);
  }
  function stopSpeak() { if (canSpeak) { try { window.speechSynthesis.cancel(); } catch (e) {} } }
  function speakDone() {
    var text = 'Hết giờ.';
    if (tasks.length) text += opts.pick === 'random' && lastPick >= 0 ? ' Việc của bạn: ' + tasks[lastPick] : ' ' + tasks.join('. ');
    speak(text, 1100);
  }

  /* ---------- Thông báo hệ thống + nháy tiêu đề tab ---------- */
  function notifyText(title, body) {
    if (!opts.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      var n = new Notification(title, { body: body, icon: 'assets/img/mark-192.png', tag: 'mt-hen-gio', requireInteraction: true });
      n.onclick = function () { window.focus(); n.close(); };
    } catch (e) {}
  }
  function notify(total) {
    if (!document.hidden) return;
    var body = !tasks.length ? 'Đã đủ ' + TC.describe(total)
      : opts.pick === 'random' ? 'Việc của bạn: ' + tasks[lastPick]
      : tasks.slice(0, 3).join(' · ') + (tasks.length > 3 ? '…' : '');
    notifyText('Hết giờ!', body);
  }

  var flashTimer = null;
  function flashTitle() {
    stopFlash();
    var on = false;
    flashTimer = setInterval(function () {
      on = !on;
      document.title = on ? 'Hết giờ! · ' + BASE_TITLE : BASE_TITLE;
    }, 900);
  }
  function stopFlash() {
    clearInterval(flashTimer);
    flashTimer = null;
    document.title = BASE_TITLE;
  }

  /* ---------- Giữ màn hình sáng ---------- */
  var wakeLock = null;
  if ('wakeLock' in navigator) $('optWakeWrap').hidden = false;
  function requestWake() {
    // Ở khung toàn màn hình thì luôn giữ sáng, vì người dùng đang nhìn đồng hồ
    if (!(opts.wake || stageOpen) || !('wakeLock' in navigator) || state.status !== 'running' || wakeLock) return;
    navigator.wakeLock.request('screen').then(function (lock) {
      wakeLock = lock;
      lock.addEventListener('release', function () { wakeLock = null; });
    }, function () {});
  }
  function releaseWake() {
    if (wakeLock) { wakeLock.release().catch(function () {}); wakeLock = null; }
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    onTick();
    requestWake(); // khóa màn hình tự nhả khi chuyển tab, xin lại khi quay về
  });

  /* ---------- Nền (theme) ---------- */
  function paint(el, theme) {
    var vars = TT.cssVars(theme);
    for (var k in vars) el.style.setProperty(k, vars[k]);
    el.dataset.fx = theme.fx || '';
  }

  // Ô xem trước của từng nền, dùng cho cả trang chính và bảng trong khung toàn màn hình
  function renderThemeGrid(grid) {
    grid.textContent = '';
    TT.list.forEach(function (theme) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'theme-tile';
      b.dataset.theme = theme.id;
      var art = document.createElement('span');
      art.className = 'tile-art';
      paint(art, theme);
      art.innerHTML = '<span class="fx"></span><span class="tile-time"></span>';
      art.lastChild.textContent = theme.photo && !photoUrl ? '+ Ảnh' : '25:00';
      // Nhãn ngày lễ; còn ≤ 21 ngày thì tô vàng "Sắp tới"
      if (theme.occasion) {
        var days = TT.daysUntil(theme, new Date());
        var tag = document.createElement('span');
        tag.className = 'tile-date' + (days !== null && days <= 21 ? ' is-soon' : '');
        tag.textContent = days === 0 ? 'Hôm nay' : days !== null && days <= 21 ? 'Còn ' + days + ' ngày' : theme.occasion.label;
        tag.title = theme.occasion.label;
        art.appendChild(tag);
      }
      if (TT.isLocked(theme)) {
        var lock = document.createElement('span');
        lock.className = 'tile-lock';
        lock.innerHTML = '<svg class="ic"><use href="#i-lock"/></svg>';
        art.appendChild(lock);
      }
      var name = document.createElement('span');
      name.className = 'tile-name';
      name.textContent = theme.name;
      if (theme.tier === 'pro') {
        var badge = document.createElement('em');
        badge.className = 'tile-badge';
        badge.textContent = 'PRO';
        name.appendChild(badge);
      }
      b.appendChild(art);
      b.appendChild(name);
      b.setAttribute('aria-label', 'Nền ' + theme.name + (theme.tier === 'pro' ? ' (Pro)' : ''));
      b.addEventListener('click', function () { chooseTheme(theme); });
      grid.appendChild(b);
    });
    markTheme();
  }

  // Bảng nền trong khung toàn màn hình chỉ dựng khi mở bảng (đỡ 25 ô ẩn không cần thiết)
  var stageGridStale = true;
  function renderThemeGrids() {
    renderThemeGrid($('themeGrid'));
    applyThemeFilter();
    stageGridStale = true;
    if (stageOpen && !stagePanel.hidden) renderStageGrid();
  }
  function renderStageGrid() {
    if (!stageGridStale) return;
    renderThemeGrid($('stageThemeGrid'));
    stageGridStale = false;
  }

  /* Lọc nền: Tất cả / Miễn phí / Pro / Theo mùa */
  var themeFilter = 'all';
  var FILTERS = {
    all: function () { return true; },
    free: function (t) { return t.tier === 'free'; },
    pro: function (t) { return t.tier === 'pro'; },
    season: function (t) { return !!t.season; }
  };
  function applyThemeFilter() {
    var now = new Date();
    $('themeGrid').querySelectorAll('.theme-tile').forEach(function (b) {
      var t = TT.get(b.dataset.theme);
      b.hidden = !FILTERS[themeFilter](t);
      // Nhóm ngày lễ: dịp gần nhất lên đầu (ngày âm lịch / dịp bất kỳ xếp sau)
      var days = TT.daysUntil(t, now);
      b.style.order = themeFilter === 'season' ? String(days === null ? 400 : days) : '';
    });
    document.querySelectorAll('[data-filter]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.filter === themeFilter ? 'true' : 'false');
    });
    document.querySelectorAll('[data-count]').forEach(function (el) {
      el.textContent = TT.list.filter(FILTERS[el.dataset.count]).length;
    });
  }
  document.querySelectorAll('[data-filter]').forEach(function (b) {
    b.addEventListener('click', function () {
      themeFilter = b.dataset.filter;
      applyThemeFilter();
    });
  });

  function markTheme() {
    document.querySelectorAll('.theme-tile').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.theme === opts.theme ? 'true' : 'false');
    });
    document.querySelectorAll('[data-photo]').forEach(function (b) { b.hidden = opts.theme !== 'photo'; });
  }

  function chooseTheme(theme) {
    if (TT.isLocked(theme)) { openUnlock(theme); return; }
    if (theme.photo && !photoUrl) { pickPhoto(); return; }
    opts.theme = theme.id;
    saveOpts();
    markTheme();
    if (stageOpen) applyStageTheme();
    applyCardTheme();
    renderMusicSelects(); // nhãn "Theo nền (…)" đổi theo nền mới
    render();
  }

  function applyStageTheme() {
    var theme = TT.get(opts.theme);
    paint(stage, theme);
    buildFx(stageFx, theme.fx);
  }

  /* Nền cũng áp lên đồng hồ trên trang (ô quanh vòng tròn), không cần mở toàn màn hình.
     Phần đặt giờ bên dưới giữ màu của trang cho dễ đọc. Tắt được ở thẻ Giao diện đồng hồ. */
  var dialScreen = $('dialScreen'), dialFx = $('dialFx'), cardFxKey = '';
  function applyCardTheme() {
    var on = opts.cardTheme !== false;
    timerBox.classList.toggle('is-themed', on);
    $('optCardTheme').checked = on;
    if (!on) {
      dialScreen.removeAttribute('data-fx');
      dialFx.textContent = '';
      cardFxKey = '';
      return;
    }
    var theme = TT.get(opts.theme);
    paint(dialScreen, theme);
    // Hạt hiệu ứng (sao, mưa, pháo hoa…) ít hơn hẳn khung toàn màn hình cho nhẹ trang
    if (cardFxKey !== theme.id) { buildFx(dialFx, theme.fx, 0.3); cardFxKey = theme.id; }
  }
  $('optCardTheme').addEventListener('change', function () {
    opts.cardTheme = this.checked;
    saveOpts();
    applyCardTheme();
  });

  function setThemeColor(color) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = color;
  }

  /* Kiểu "Lật số": mỗi chữ số là 1 tấm, chữ số nào đổi thì tấm đó lật */
  var flipChars = '';
  function setStageTime(text) {
    var el = $('stageTime');
    if (stage.dataset.style !== 'flip') {
      if (flipChars) { flipChars = ''; el.textContent = ''; }
      el.textContent = text;
      return;
    }
    if (flipChars.length !== text.length) {
      el.textContent = '';
      for (var i = 0; i < text.length; i++) {
        var s = document.createElement('span');
        s.className = text[i] === ':' ? 'fl-sep' : 'fl';
        s.textContent = text[i];
        el.appendChild(s);
      }
      flipChars = text;
      return;
    }
    var cells = el.children;
    for (var j = 0; j < text.length; j++) {
      if (text[j] === flipChars[j]) continue;
      var c = cells[j];
      c.textContent = text[j];
      if (c.className.indexOf('fl') === 0 && text[j] !== ':') {
        c.classList.remove('is-flip');
        void c.offsetWidth; // khởi động lại hiệu ứng
        c.classList.add('is-flip');
      }
    }
    flipChars = text;
  }

  // Hiệu ứng cần nhiều phần tử (sao, hoa, mưa, tuyết…) chỉ sinh trong khung toàn màn hình.
  // make(i) trả về chuỗi style cho phần tử thứ i.
  function particles(box, n, cls, make) {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < n; i++) {
      var el = document.createElement('span');
      el.className = cls;
      el.style.cssText = make(i);
      frag.appendChild(el);
    }
    box.appendChild(frag);
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pct() { return rnd(0, 100).toFixed(2) + '%'; }

  function buildFx(box, fx, scale) {
    box.textContent = '';
    if (reduceMotion) return;
    // Màn hình nhỏ thì bớt hạt cho nhẹ máy
    var k = (window.innerWidth < 700 ? 0.55 : 1) * (scale || 1);
    var N = function (n) { return Math.round(n * k); };
    if (fx === 'stars') {
      particles(box, N(45), 'fx-star', function () {
        var s = rnd(0.8, 2.6).toFixed(1);
        return 'left:' + pct() + ';top:' + pct() + ';width:' + s + 'px;height:' + s + 'px;animation-duration:' + rnd(2, 6).toFixed(1) + 's;animation-delay:-' + rnd(0, 6).toFixed(1) + 's';
      });
    } else if (fx === 'petals' || fx === 'mai' || fx === 'roses') {
      particles(box, N(fx === 'mai' ? 14 : 16), fx === 'mai' ? 'fx-mai' : fx === 'roses' ? 'fx-petal is-rose' : 'fx-petal', function () {
        var w = rnd(8, fx === 'mai' ? 22 : 18);
        return 'left:' + pct() + ';width:' + w.toFixed(0) + 'px;height:' + (fx === 'mai' ? w : w * 0.7).toFixed(0) + 'px;animation-duration:' + rnd(10, 20).toFixed(1) + 's;animation-delay:-' + rnd(0, 20).toFixed(1) + 's;opacity:' + rnd(0.5, 0.95).toFixed(2);
      });
    } else if (fx === 'rain') {
      particles(box, N(40), 'fx-drop', function () {
        return 'left:' + rnd(0, 130).toFixed(1) + '%;height:' + rnd(50, 110).toFixed(0) + 'px;animation-duration:' + rnd(0.55, 1.1).toFixed(2) + 's;animation-delay:-' + rnd(0, 2).toFixed(2) + 's;opacity:' + rnd(0.3, 0.8).toFixed(2);
      });
    } else if (fx === 'snow') {
      particles(box, N(45), 'fx-flake', function () {
        var s = rnd(2, 6).toFixed(1);
        return 'left:' + pct() + ';width:' + s + 'px;height:' + s + 'px;animation-duration:' + rnd(8, 20).toFixed(1) + 's;animation-delay:-' + rnd(0, 20).toFixed(1) + 's;opacity:' + rnd(0.5, 1).toFixed(2);
      });
    } else if (fx === 'bokeh') {
      var colors = ['255,212,59', '255,146,43', '255,236,153', '255,169,77'];
      particles(box, N(12), 'fx-bokeh', function (i) {
        var s = rnd(40, 160).toFixed(0), c = colors[i % colors.length];
        return 'left:' + rnd(-5, 95).toFixed(1) + '%;top:' + rnd(-5, 90).toFixed(1) + '%;width:' + s + 'px;height:' + s + 'px;background:radial-gradient(circle, rgba(' + c + ',' + rnd(0.25, 0.5).toFixed(2) + ') 0 55%, transparent 70%);' +
          '--dx:' + rnd(-6, 6).toFixed(1) + 'vw;--dy:' + rnd(-8, 8).toFixed(1) + 'vh;animation-duration:' + rnd(14, 30).toFixed(1) + 's;animation-delay:-' + rnd(0, 20).toFixed(1) + 's';
      });
    } else if (fx === 'lantern') {
      particles(box, N(10), 'fx-lantern', function () {
        var w = rnd(14, 34);
        return 'left:' + rnd(2, 95).toFixed(1) + '%;width:' + w.toFixed(0) + 'px;height:' + (w * 1.3).toFixed(0) + 'px;animation-duration:' + rnd(16, 30).toFixed(1) + 's;animation-delay:-' + rnd(0, 30).toFixed(1) + 's;opacity:' + rnd(0.6, 1).toFixed(2);
      });
    } else if (fx === 'fireworks') {
      // Mỗi chùm pháo là 1 điểm, các tia toả đều quanh điểm đó; mỗi chùm nổ lệch nhịp nhau
      var palette = ['#ffd166', '#ef476f', '#06d6a0', '#118ab2', '#ffffff', '#ffd60a', '#ff8fab'];
      for (var b = 0; b < N(4) || b < 2; b++) {
        var burst = document.createElement('span');
        burst.className = 'fx-burst';
        burst.style.cssText = 'left:' + rnd(10, 90).toFixed(1) + '%;top:' + rnd(8, 55).toFixed(1) + '%';
        var color = palette[b % palette.length], delay = rnd(0, 4).toFixed(2), dur = rnd(2.2, 3.2).toFixed(2), r = rnd(70, 150).toFixed(0);
        for (var s = 0; s < 12; s++) {
          var sp = document.createElement('i');
          sp.className = 'fx-spark';
          sp.style.cssText = '--a:' + (s * 30) + 'deg;--c:' + color + ';--delay:' + delay + 's;--dur:' + dur + 's;--r:' + r + 'px';
          burst.appendChild(sp);
        }
        box.appendChild(burst);
      }
    } else if (fx === 'hearts') {
      var pinks = ['#ffccd5', '#ff8fa3', '#ffffff', '#ffb3c1'];
      particles(box, N(12), 'fx-heart', function (i) {
        var w = rnd(10, 24);
        return 'left:' + rnd(2, 95).toFixed(1) + '%;width:' + w.toFixed(0) + 'px;height:' + w.toFixed(0) + 'px;--c:' + pinks[i % pinks.length] + ';animation-duration:' + rnd(12, 24).toFixed(1) + 's;animation-delay:-' + rnd(0, 24).toFixed(1) + 's;opacity:' + rnd(0.45, 0.9).toFixed(2);
      });
      box.querySelectorAll('.fx-heart').forEach(function (h) { h.appendChild(document.createElement('i')); });
    } else if (fx === 'confetti') {
      var colors = ['#ffd43b', '#ff6b6b', '#4dabf7', '#69db7c', '#da77f2', '#ffa94d'];
      particles(box, N(35), 'fx-conf', function (i) {
        var w = rnd(5, 10);
        return 'left:' + pct() + ';width:' + w.toFixed(0) + 'px;height:' + (w * rnd(0.4, 0.7)).toFixed(0) + 'px;background:' + colors[i % colors.length] + ';animation-duration:' + rnd(6, 13).toFixed(1) + 's;animation-delay:-' + rnd(0, 13).toFixed(1) + 's';
      });
    } else if (fx === 'balloons') {
      var balloon = ['#ff6b6b', '#fcc419', '#4dabf7', '#b197fc', '#63e6be', '#ff8fab'];
      particles(box, N(10), 'fx-balloon', function (i) {
        var w = rnd(24, 44);
        return 'left:' + rnd(2, 92).toFixed(1) + '%;width:' + w.toFixed(0) + 'px;height:' + (w * 1.2).toFixed(0) + 'px;--c:' + balloon[i % balloon.length] + ';animation-duration:' + rnd(14, 26).toFixed(1) + 's;animation-delay:-' + rnd(0, 26).toFixed(1) + 's;opacity:' + rnd(0.75, 0.95).toFixed(2);
      });
    } else if (fx === 'embers') {
      particles(box, N(22), 'fx-ember', function () {
        var s = rnd(2, 5).toFixed(1);
        return 'left:' + pct() + ';width:' + s + 'px;height:' + s + 'px;--dx:' + rnd(-6, 6).toFixed(1) + 'vw;animation-duration:' + rnd(5, 11).toFixed(1) + 's;animation-delay:-' + rnd(0, 11).toFixed(1) + 's';
      });
    }
  }

  function nextTheme(step) {
    var usable = TT.list.filter(function (t) { return !TT.isLocked(t) && (!t.photo || photoUrl); });
    var i = usable.findIndex(function (t) { return t.id === opts.theme; });
    chooseTheme(usable[(i + step + usable.length) % usable.length]);
  }

  /* ---------- Ảnh nền của bạn ----------
     Thu nhỏ còn tối đa 1920px, nén JPEG để lưu gọn trong trình duyệt. Ảnh không gửi đi đâu. */
  var photoInput = $('photoInput');
  function pickPhoto() { photoInput.click(); }
  function applyPhoto() {
    if (photoUrl) document.documentElement.style.setProperty('--st-photo', 'url("' + photoUrl + '")');
    else document.documentElement.style.removeProperty('--st-photo');
  }
  photoInput.addEventListener('change', function () {
    var file = photoInput.files[0];
    photoInput.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('Chỉ chọn được file ảnh'); return; }
    var img = new Image();
    var src = URL.createObjectURL(file);
    img.onload = function () {
      URL.revokeObjectURL(src);
      var scale = Math.min(1, 1920 / Math.max(img.naturalWidth, img.naturalHeight));
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      var url = c.toDataURL('image/jpeg', 0.82);
      photoUrl = url;
      var ok = false;
      try { localStorage.setItem(KEY.photo, url); ok = true; } catch (e) {}
      applyPhoto();
      opts.theme = 'photo';
      saveOpts();
      renderThemeGrids();
      if (stageOpen) applyStageTheme();
      toast(ok ? 'Đã đặt ảnh làm nền' : 'Đã đặt ảnh, nhưng ảnh quá lớn để lưu lại cho lần sau');
    };
    img.onerror = function () { URL.revokeObjectURL(src); toast('Không đọc được ảnh này'); };
    img.src = src;
  });
  document.querySelectorAll('[data-photo]').forEach(function (b) { b.addEventListener('click', pickPhoto); });

  /* Hộp mở khóa nền Pro — chỉ hiện khi TimerThemes.lockPremium = true */
  var unlockDlg = $('unlockDialog');
  function openUnlock(theme) {
    // Đã bật bán nền → hộp mua (chọn gói, quét QR); chưa bật → hộp liên hệ như cũ
    if (window.TimerShop && window.TimerShop.available()) { window.TimerShop.open(theme); return; }
    if (window.TimerAccount) window.TimerAccount.decorateUnlock();
    paint($('unlockArt'), theme);
    $('unlockTitle').textContent = 'Nền "' + theme.name + '" thuộc gói Pro';
    $('unlockText').textContent = 'Liên hệ ManhTool để mở khóa nền này và các nền Pro khác.';
    if (unlockDlg.showModal) unlockDlg.showModal();
  }
  $('unlockClose').addEventListener('click', function () { unlockDlg.close(); });
  unlockDlg.addEventListener('click', function (e) { if (e.target === unlockDlg) unlockDlg.close(); });

  /* ---------- Tiêu đề trên màn hình lớn ---------- */
  var titleInputs = document.querySelectorAll('[data-title]');
  function renderTitle() {
    titleInputs.forEach(function (i) { if (document.activeElement !== i) i.value = opts.title; });
    $('stageTitle').textContent = opts.title;
  }
  titleInputs.forEach(function (input) {
    input.addEventListener('input', function () {
      opts.title = input.value.replace(/\s+/g, ' ').slice(0, 80);
      titleInputs.forEach(function (o) { if (o !== input) o.value = opts.title; });
      $('stageTitle').textContent = opts.title.trim();
      clearTimeout(input._t);
      input._t = setTimeout(function () { opts.title = opts.title.trim(); saveOpts(); }, 300);
    });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') input.blur(); });
  });

  /* ---------- Khung toàn màn hình ---------- */
  var stageOpen = false, uiTimer = null, toastHome = toastEl.parentNode;

  function openStage() {
    if (stageOpen) return;
    unlockAudio();
    stageOpen = true;
    stage.hidden = false;
    document.body.classList.add('stage-open');
    applyStageTheme();
    applyStageOpts();
    renderTitle();
    setThemeColor('#000000');
    // Thông báo nhỏ phải nằm trong khung thì mới thấy được khi đang toàn màn hình
    stage.appendChild(toastEl);
    var req = stage.requestFullscreen || stage.webkitRequestFullscreen;
    if (req) {
      try {
        var p = req.call(stage, { navigationUI: 'hide' });
        if (p && p.catch) p.catch(function () {});
      } catch (e) {}
    }
    schedule();
    render();
    requestWake();
    showUi();
    $('stageStart').focus();
  }

  function closeStage() {
    if (!stageOpen) return;
    stageOpen = false;
    var fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (fsEl) {
      var exit = document.exitFullscreen || document.webkitExitFullscreen;
      try { var p = exit.call(document); if (p && p.catch) p.catch(function () {}); } catch (e) {}
    }
    stage.hidden = true;
    stagePanel.hidden = true;
    stage.classList.remove('ui-hidden');
    stageFx.textContent = '';
    document.body.classList.remove('stage-open');
    toastHome.appendChild(toastEl);
    clearTimeout(uiTimer);
    if (!opts.wake) releaseWake();
    setThemeColor('#0E7C5A');
    schedule();
    render();
    $('btnStage').focus();
  }

  function onFullscreenChange() {
    // Người dùng bấm Esc thoát toàn màn hình của trình duyệt → đóng luôn khung
    if (stageOpen && !(document.fullscreenElement || document.webkitFullscreenElement)) closeStage();
  }
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);

  // Ẩn nút điều khiển sau 3 giây không đụng chuột khi đang chạy
  function showUi() {
    stage.classList.remove('ui-hidden');
    clearTimeout(uiTimer);
    uiTimer = setTimeout(function () {
      if (stageOpen && state.status === 'running' && stagePanel.hidden && musicPop.hidden && !doneDlg.open) stage.classList.add('ui-hidden');
    }, 3000);
  }
  ['pointermove', 'pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
    stage.addEventListener(ev, showUi, { passive: true });
  });

  function applyStageOpts() {
    stage.dataset.style = opts.stageStyle;
    stage.dataset.clock = opts.stageClock ? 'on' : 'off';
    stage.dataset.next = opts.stageNext ? 'on' : 'off';
    stagePanel.querySelectorAll('[data-style]').forEach(function (b) {
      b.setAttribute('aria-checked', b.dataset.style === opts.stageStyle ? 'true' : 'false');
    });
    $('optStageClock').checked = opts.stageClock;
    $('optStageNext').checked = opts.stageNext;
    $('optStageFocus').checked = opts.stageFocus;
    if (stageOpen) render(); // đổi kiểu (vd sang Lật số) thì vẽ lại ngay
  }

  $('btnStage').addEventListener('click', openStage);
  $('btnStage2').addEventListener('click', openStage);
  $('stageExit').addEventListener('click', closeStage);
  $('stageStart').addEventListener('click', startPause);
  $('stageReset').addEventListener('click', resetTimer);
  $('stageAdd').addEventListener('click', addMinute);
  $('stageSkip').addEventListener('click', skipStep);
  $('stagePanelBtn').addEventListener('click', function () {
    stagePanel.hidden = !stagePanel.hidden;
    if (!stagePanel.hidden) setMusicPop(false);
    if (!stagePanel.hidden) { renderStageGrid(); $('stagePanelClose').focus(); }
  });
  $('stagePanelClose').addEventListener('click', function () { stagePanel.hidden = true; $('stagePanelBtn').focus(); });
  stagePanel.querySelectorAll('[data-style]').forEach(function (b) {
    b.addEventListener('click', function () { opts.stageStyle = b.dataset.style; saveOpts(); applyStageOpts(); });
  });
  $('optStageClock').addEventListener('change', function () { opts.stageClock = this.checked; saveOpts(); applyStageOpts(); });
  $('optStageNext').addEventListener('change', function () { opts.stageNext = this.checked; saveOpts(); applyStageOpts(); });
  $('optStageFocus').addEventListener('change', function () { opts.stageFocus = this.checked; saveOpts(); applyStageOpts(); });
  stage.addEventListener('click', function (e) {
    if (!stagePanel.hidden && !stagePanel.contains(e.target) && !e.target.closest('#stagePanelBtn')) stagePanel.hidden = true;
  });

  /* ---------- Cửa sổ nổi ---------- */
  var btnPip = $('btnPip');
  if (PIP.supported()) btnPip.hidden = false;
  function togglePip() {
    if (!PIP.supported()) return;
    if (PIP.isOpen()) { PIP.close(); return; }
    unlockAudio();
    PIP.open({ toggle: startPause, add: addMinute }, function () { schedule(); }).then(function () {
      schedule();
      render();
    }, function () { toast('Trình duyệt không mở được cửa sổ nổi'); });
  }
  btnPip.addEventListener('click', togglePip);

  /* ---------- Hẹn giờ đã lưu ---------- */
  function currentConfig() {
    var cfg = { tasks: tasks.slice(), pick: opts.pick, theme: opts.theme, style: opts.stageStyle, title: opts.title };
    if (opts.mode === 'plan') cfg.plan = TC.cleanPlan(planDraft);
    else cfg.ms = readInputs();
    return cfg;
  }

  function configMeta(cfg) {
    var parts = [];
    if (cfg.plan) parts.push(cfg.plan.steps.length + ' bước' + (cfg.plan.repeat > 1 ? ' × ' + cfg.plan.repeat : '') + ' · ' + TC.describe(TC.planTotal(cfg.plan)));
    else parts.push(TC.describe(cfg.ms || 0));
    if (cfg.tasks && cfg.tasks.length) parts.push(cfg.tasks.length + ' việc');
    if (cfg.theme) parts.push('nền ' + TT.get(cfg.theme).name);
    return parts.join(' · ');
  }

  // Áp cài đặt từ mục đã lưu hoặc từ liên kết chia sẻ
  function applyConfig(cfg) {
    if (isActive()) { toast('Đồng hồ đang chạy. Bấm Đặt lại rồi thử lại nhé'); return false; }
    if (cfg.plan) {
      planDraft = clone(cfg.plan);
      opts.mode = 'plan';
      savePlan();
      renderPlanEditor();
    } else if (cfg.ms) {
      opts.mode = 'single';
      fillInputs(cfg.ms);
      state = TC.idle(cfg.ms);
      saveState();
    }
    if (Array.isArray(cfg.tasks)) { tasks = cfg.tasks.slice(); saveTasks(); renderTasks(); }
    if (cfg.pick) opts.pick = cfg.pick;
    if (cfg.theme) {
      var th = TT.get(cfg.theme);
      if (th.id === cfg.theme && !TT.isLocked(th) && (!th.photo || photoUrl)) opts.theme = th.id;
    }
    if (cfg.style) opts.stageStyle = cfg.style;
    if (typeof cfg.title === 'string') opts.title = cfg.title;
    saveOpts();
    renderPick();
    renderMode();
    markTheme();
    renderTitle();
    applyStageOpts();
    render();
    return true;
  }

  function renderSaved() {
    var list = $('savedList');
    list.textContent = '';
    saved.forEach(function (s, i) {
      var li = document.createElement('li');
      li.className = 'saved-item';
      var load = document.createElement('button');
      load.type = 'button';
      load.className = 'saved-load';
      load.innerHTML = '<span class="saved-name"></span><span class="saved-meta"></span>';
      load.firstChild.textContent = s.name;
      load.lastChild.textContent = configMeta(s.cfg);
      load.title = 'Dùng cài đặt "' + s.name + '"';
      load.addEventListener('click', function () {
        var before = currentConfig();
        if (applyConfig(s.cfg)) {
          toast('Đã dùng "' + s.name + '"', 'Hoàn tác', function () { applyConfig(before); });
        }
      });
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'saved-del';
      del.title = 'Xóa';
      del.setAttribute('aria-label', 'Xóa ' + s.name);
      del.innerHTML = '<svg class="ic"><use href="#i-trash"/></svg>';
      del.addEventListener('click', function () {
        var removed = saved.splice(i, 1)[0];
        store(KEY.saved, saved);
        renderSaved();
        toast('Đã xóa "' + removed.name + '"', 'Hoàn tác', function () {
          saved.splice(Math.min(i, saved.length), 0, removed);
          store(KEY.saved, saved);
          renderSaved();
        });
      });
      li.appendChild(load);
      li.appendChild(del);
      list.appendChild(li);
    });
  }

  var saveForm = $('saveForm'), saveName = $('saveName');
  $('btnSave').addEventListener('click', function () {
    if (saved.length >= MAX_SAVED) { toast('Tối đa ' + MAX_SAVED + ' mục, xóa bớt mục cũ trước nhé'); return; }
    saveForm.hidden = false;
    saveName.value = opts.title || (opts.mode === 'plan' ? 'Chuỗi ' + TC.describe(TC.planTotal(TC.cleanPlan(planDraft) || { steps: [], repeat: 1 })) : 'Hẹn ' + TC.describe(readInputs()));
    saveName.focus();
    saveName.select();
  });
  $('saveCancel').addEventListener('click', function () { saveForm.hidden = true; });
  saveForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = TC.cleanText(saveName.value).slice(0, 40);
    if (!name) { saveName.focus(); return; }
    var cfg = currentConfig();
    if (!cfg.plan && !cfg.ms) { toast('Bạn chưa đặt thời gian'); return; }
    saved.unshift({ name: name, cfg: cfg });
    if (!store(KEY.saved, saved)) toast('Không lưu được, bộ nhớ trình duyệt đã đầy');
    saveForm.hidden = true;
    renderSaved();
  });
  saveName.addEventListener('keydown', function (e) { if (e.key === 'Escape') saveForm.hidden = true; });

  /* ---------- Chia sẻ liên kết ---------- */
  $('btnShare').addEventListener('click', function () {
    var cfg = currentConfig();
    if (cfg.theme === 'photo') cfg.theme = null; // ảnh riêng không đi theo liên kết
    var url = location.origin + location.pathname + '?p=' + TC.encodeShare(cfg);
    var coarse = window.matchMedia('(pointer: coarse)').matches;
    if (coarse && navigator.share) {
      navigator.share({ title: opts.title || 'Hẹn giờ nhắc việc', url: url }).catch(function () {});
      return;
    }
    writeClipboard(url).then(
      function () { toast('Đã chép liên kết. Ai mở sẽ thấy đúng cài đặt này'); if (window.nudge) window.nudge.afterCopy(); },
      function () { window.prompt('Chép liên kết này:', url); });
  });

  // Mở trang từ liên kết chia sẻ: áp cài đặt (hoàn tác được), rồi xóa ?p= khỏi thanh địa chỉ
  function readShareLink() {
    var m = /[?&]p=([A-Za-z0-9_-]+)/.exec(location.search);
    if (!m) return;
    var cfg = TC.decodeShare(m[1]);
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
    if (!cfg) { toast('Liên kết không hợp lệ'); return; }
    var before = currentConfig();
    if (applyConfig(cfg)) {
      toast('Đã mở cài đặt từ liên kết', 'Hoàn tác', function () { applyConfig(before); });
    }
  }

  /* ---------- Tùy chọn ---------- */
  TS.choices.forEach(function (s) {
    var o = document.createElement('option');
    o.value = s.id;
    o.textContent = s.name;
    optSoundType.appendChild(o);
  });
  optSound.checked = opts.sound;
  optSoundType.value = opts.soundType;
  optVolume.value = opts.volume;
  optSpeak.checked = opts.speak;
  optPre.value = String(opts.pre);
  optLoop.checked = opts.loop;
  optNotify.checked = opts.notify && 'Notification' in window && Notification.permission === 'granted';
  optWake.checked = opts.wake;

  optSound.addEventListener('change', function () {
    opts.sound = optSound.checked;
    if (opts.sound) unlockAudio();
    else alarm.stop();
    saveOpts();
  });
  optSoundType.addEventListener('change', function () {
    opts.soundType = optSoundType.value;
    saveOpts();
    unlockAudio();
    playSound(opts.soundType);
  });
  optVolume.addEventListener('input', function () { opts.volume = +optVolume.value; saveOpts(); });
  optVolume.addEventListener('change', function () { unlockAudio(); playSound(opts.soundType); });
  optSpeak.addEventListener('change', function () {
    opts.speak = optSpeak.checked;
    saveOpts();
    if (opts.speak) {
      speak('Đã bật đọc to');
      if (!viVoice()) toast('Máy chưa có giọng tiếng Việt, sẽ đọc bằng giọng mặc định');
    } else stopSpeak();
  });
  optPre.addEventListener('change', function () { opts.pre = +optPre.value; saveOpts(); render(); });
  optLoop.addEventListener('change', function () { opts.loop = optLoop.checked; saveOpts(); });

  optNotify.addEventListener('change', function () {
    function off(msg) { optNotify.checked = false; opts.notify = false; saveOpts(); if (msg) toast(msg); }
    if (!optNotify.checked) { off(); return; }
    if (!('Notification' in window)) { off('Trình duyệt này không hỗ trợ thông báo'); return; }
    if (Notification.permission === 'denied') { off('Bạn đã chặn thông báo cho trang này, mở lại trong cài đặt trình duyệt'); return; }
    if (Notification.permission === 'granted') { opts.notify = true; saveOpts(); return; }
    Notification.requestPermission().then(function (p) {
      if (p === 'granted') { opts.notify = true; saveOpts(); toast('Đã bật, hết giờ sẽ có thông báo dù bạn ở tab khác'); }
      else off('Chưa được cấp quyền thông báo');
    });
  });

  optWake.addEventListener('change', function () {
    opts.wake = optWake.checked;
    saveOpts();
    if (opts.wake) requestWake();
    else if (!stageOpen) releaseWake();
  });

  /* ---------- Phím tắt ---------- */
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || doneDlg.open || unlockDlg.open) return;
    var el = document.activeElement;
    var tag = el && el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el && el.isContentEditable)) return;
    if (e.code === 'Space' && tag !== 'BUTTON' && tag !== 'A') {
      e.preventDefault();
      startPause();
    } else if (e.code === 'KeyR') {
      e.preventDefault();
      resetTimer();
    } else if (e.code === 'KeyF') {
      e.preventDefault();
      if (stageOpen) closeStage(); else openStage();
    } else if (e.code === 'KeyT' && stageOpen) {
      e.preventDefault();
      nextTheme(e.shiftKey ? -1 : 1);
    } else if (e.code === 'KeyP') {
      e.preventDefault();
      togglePip();
    } else if (e.code === 'KeyM') {
      e.preventDefault();
      setMusicOn(!opts.musicOn);
    } else if (e.code === 'KeyG' && !stageOpen) {
      e.preventDefault();
      setCompact(!opts.compact);
    } else if (e.key === '?' || (e.code === 'Slash' && e.shiftKey)) {
      e.preventDefault();
      startTour(0);
    } else if (e.code === 'KeyN') {
      e.preventDefault();
      skipStep();
    } else if (e.key === 'Escape' && stageOpen) {
      // Trình duyệt không hỗ trợ toàn màn hình thật (vd iPhone) thì khung chỉ là lớp phủ
      if (!musicPop.hidden) { setMusicPop(false); $('stageMusic').focus(); }
      else if (!stagePanel.hidden) stagePanel.hidden = true;
      else closeStage();
    } else if (e.key === '+' || e.key === '=') {
      addMinute();
    }
  });

  /* ---------- Sao chép ---------- */
  function writeClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () {
        if (!fallbackCopy(text)) throw new Error('copy');
      });
    }
    return fallbackCopy(text) ? Promise.resolve() : Promise.reject(new Error('copy'));
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    return ok;
  }
  document.querySelectorAll('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var text = b.dataset.copy;
      writeClipboard(text).then(
        function () { toast('Đã chép số ' + text); if (window.nudge) window.nudge.afterCopy(); },
        function () { toast('Không sao chép được, số là ' + text); });
    });
  });

  /* ---------- Giao diện sáng / tối của trang ---------- */
  var root = document.documentElement;
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  $('themeToggle').addEventListener('click', function () {
    var current = root.getAttribute('data-theme') || (mq.matches ? 'dark' : 'light');
    var next = current === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('mt-theme', next); } catch (e) {}
  });

  /* ---------- QR ủng hộ ---------- */
  var qrDlg = $('qrDialog');
  $('qrOpen').addEventListener('click', function () {
    if (qrDlg.showModal) qrDlg.showModal();
    else window.open(qrDlg.querySelector('img').src, '_blank');
  });
  qrDlg.addEventListener('click', function (e) { if (e.target === qrDlg) qrDlg.close(); });

  /* ---------- Thông báo nhỏ (có thể kèm nút) ---------- */
  var toastTimer, toastFn = null;
  function toast(msg, actionLabel, onAction) {
    toastMsg.textContent = msg;
    toastFn = onAction || null;
    toastAction.hidden = !onAction;
    toastAction.textContent = actionLabel || '';
    toastEl.classList.toggle('has-action', !!onAction);
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); toastFn = null; }, onAction ? 5000 : 2400);
  }
  toastAction.addEventListener('click', function () {
    var fn = toastFn;
    toastFn = null;
    toastEl.classList.remove('show');
    if (fn) fn();
  });

  /* ---------- Cài như ứng dụng (PWA) ---------- */
  var installEvt = null, btnInstall = $('btnInstall');
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    installEvt = e;
    btnInstall.hidden = false;
  });
  btnInstall.addEventListener('click', function () {
    if (!installEvt) return;
    installEvt.prompt();
    installEvt.userChoice.then(function () { installEvt = null; btnInstall.hidden = true; }, function () {});
  });
  window.addEventListener('appinstalled', function () {
    btnInstall.hidden = true;
    toast('Đã cài xong, mở "Hẹn giờ" từ màn hình chính hoặc menu ứng dụng');
  });

  /* ---------- Nhạc nền (tạo bằng Web Audio, xem assets/js/soundscapes.js) ----------
     Mặc định chỉ phát khi đang đếm: bấm Bắt đầu là nhạc lên dần, tạm dừng / hết giờ là nhỏ dần rồi tắt.
     "Theo nền": đổi nền là đổi nhạc. "Nhạc của bạn": file trên máy, không gửi đi đâu, tải lại trang phải chọn lại. */
  var music = TM ? TM.createEngine() : null;
  var musicFile = null;            // { url, name }
  var lastMusicKey = '';
  var preview = { id: null, timer: null };
  var musicBlockedTold = false;
  var musicPop = $('stageMusicPop');
  var library = [];                // bài trong Thư viện ManhTool (quản trị viên tải lên, có giấy phép)

  function libTrack(src) {
    if (!/^lib:/.test(src || '')) return null;
    var id = src.slice(4);
    return library.find(function (t) { return t.id === id; }) || null;
  }
  // Tải danh sách thư viện (không có máy chủ / lỗi mạng thì thôi, vẫn còn nhạc tạo bằng máy)
  function loadLibrary() {
    if (!window.HGApi || location.protocol === 'file:') return;
    window.HGApi.request('GET', '/music').then(function (r) {
      if (!r.ok || !r.data || !Array.isArray(r.data.tracks)) return;
      library = r.data.tracks;
      renderMusicSelects();
      syncMusic();
    }, function () {});
  }
  var musicSelects = document.querySelectorAll('[data-music-src]');
  var musicVols = document.querySelectorAll('[data-music-vol]');

  function userIsPro() {
    var a = window.TimerAccount && window.TimerAccount.state();
    return !!(a && a.user && a.user.pro);
  }
  // Nhạc Pro chỉ khóa khi đang bán nền; người có gói Pro hoặc đang dùng nền Pro thì nghe được
  function musicLocked(s) { return !!(s && s.tier === 'pro' && TT.lockPremium && !userIsPro()); }

  function themeMusicId() {
    var t = TT.get(opts.theme), s = TM.get(t.music) || TM.get('brown');
    if (musicLocked(s) && t.tier !== 'pro') return 'brown';
    return s.id;
  }

  // Bản nhạc sẽ phát theo lựa chọn (chưa xét đang đếm hay không)
  function chosenMusic() {
    if (opts.musicSrc === 'file') return musicFile ? 'file' : themeMusicId();
    if (/^lib:/.test(opts.musicSrc)) {
      var lt = libTrack(opts.musicSrc);
      return lt && !lt.locked ? opts.musicSrc : themeMusicId();
    }
    if (opts.musicSrc === 'theme') return themeMusicId();
    var s = TM.get(opts.musicSrc);
    return !s || musicLocked(s) ? themeMusicId() : s.id;
  }

  function syncMusic() {
    if (!music) return;
    var target = preview.id || (opts.musicOn && (!opts.musicRun || state.status === 'running') ? chosenMusic() : null);
    var key = target ? target + (target === 'file' ? ':' + musicFile.url : '') : '';
    if (key === lastMusicKey) return;
    if (!target) { lastMusicKey = ''; music.stop(); renderMusicButtons(); return; }
    if (!audioCtx) { // chưa có cú bấm nào thì trình duyệt chưa cho phát tiếng
      if (!musicBlockedTold) { musicBlockedTold = true; toast('Bấm vào bất kỳ đâu trên trang để bật nhạc nền'); }
      return;
    }
    lastMusicKey = key;
    music.attach(audioCtx);
    music.setVolume(opts.musicVol / 100);
    var lt = libTrack(target);
    if (lt) music.play('file', lt.url);
    else music.play(target, musicFile && musicFile.url);
    renderMusicButtons();
  }

  function musicLabel(id) {
    if (id === 'file') return musicFile ? musicFile.name : 'Nhạc của bạn';
    var lt = libTrack(id);
    if (lt) return lt.title;
    var s = TM.get(id);
    return s ? s.name : '';
  }

  // Danh sách chọn nhạc (có 2 chỗ: tùy chọn trên trang và bảng Giao diện ở toàn màn hình)
  function renderMusicSelects() {
    if (!TM) return;
    musicSelects.forEach(function (sel) {
      sel.textContent = '';
      var o = document.createElement('option');
      o.value = 'theme';
      o.textContent = 'Theo nền (' + musicLabel(themeMusicId()) + ')';
      sel.appendChild(o);
      Object.keys(TM.groups).forEach(function (g) {
        var og = document.createElement('optgroup');
        og.label = TM.groups[g];
        TM.list.filter(function (s) { return s.group === g; }).forEach(function (s) {
          var op = document.createElement('option');
          op.value = s.id;
          op.textContent = s.name + (musicLocked(s) ? ' · Pro' : '') + ' — ' + s.desc;
          og.appendChild(op);
        });
        sel.appendChild(og);
      });
      if (library.length) {
        var lg = document.createElement('optgroup');
        lg.label = 'Thư viện ManhTool';
        library.forEach(function (t) {
          var op = document.createElement('option');
          op.value = 'lib:' + t.id;
          op.textContent = t.title + (t.locked ? ' · Pro' : '') + ' — ' + t.artist + (t.mood ? ', ' + t.mood : '');
          lg.appendChild(op);
        });
        sel.appendChild(lg);
      }
      var f = document.createElement('option');
      f.value = 'file';
      f.textContent = musicFile ? 'Nhạc của bạn: ' + musicFile.name : 'Nhạc của bạn (chọn file trên máy)…';
      sel.appendChild(f);
      sel.value = opts.musicSrc;
      if (sel.value !== opts.musicSrc) sel.value = 'theme';
    });
    musicVols.forEach(function (r) { r.value = opts.musicVol; });
    $('optMusic').checked = opts.musicOn;
    $('optMusicRun').checked = opts.musicRun;
    renderMusicButtons();
  }

  function renderMusicButtons() {
    var b = $('stageMusic');
    b.setAttribute('aria-pressed', opts.musicOn ? 'true' : 'false');
    b.title = (opts.musicOn ? 'Tắt nhạc nền' : 'Bật nhạc nền') + ' (M)' + (opts.musicOn ? ': ' + musicLabel(chosenMusic()) : '');
    $('btnMusicTry').textContent = preview.id ? 'Dừng nghe thử' : 'Nghe thử';
    renderNowPlaying();
    renderMusicPop();
  }

  // Dòng "Đang phát": tên bài + tác giả + giấy phép (bài CC BY bắt buộc ghi công)
  function renderNowPlaying() {
    var id = music && music.playing() ? (preview.id || chosenMusic()) : null;
    document.querySelectorAll('[data-music-now]').forEach(function (p) {
      p.textContent = '';
      p.hidden = !id;
      if (!id) return;
      var b = document.createElement('b');
      p.appendChild(document.createTextNode(preview.id ? 'Nghe thử: ' : 'Đang phát: '));
      p.appendChild(b);
      var lt = libTrack(id), s = TM.get(id), rest;
      if (lt) {
        b.textContent = lt.title;
        rest = ' — ' + lt.artist + ' · ' + lt.license;
      } else if (id === 'file') {
        b.textContent = musicLabel('file');
        rest = ' · file trên máy bạn';
      } else if (s && s.author) {
        b.textContent = s.name;
        rest = ' — ' + s.author + ' · phạm vi công cộng, piano ManhTool';
      } else {
        b.textContent = s ? s.name : '';
        rest = ' · âm thanh tạo bằng máy';
      }
      p.appendChild(document.createTextNode(rest));
      if (lt && lt.source) {
        var a = document.createElement('a');
        a.href = lt.source;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = 'nguồn';
        p.appendChild(document.createTextNode(' · '));
        p.appendChild(a);
      }
    });
  }

  function setMusicOn(on) {
    unlockAudio();
    opts.musicOn = !!on;
    saveOpts();
    $('optMusic').checked = opts.musicOn;
    syncMusic();
    renderMusicButtons();
    if (opts.musicOn && opts.musicRun && state.status !== 'running') toast('Nhạc sẽ phát khi bạn bấm Bắt đầu');
  }

  function stopPreview() {
    clearTimeout(preview.timer);
    preview.id = null;
    syncMusic();
    renderMusicButtons();
  }

  // Chọn một bài (từ ô chọn ở trang hoặc danh sách trong khung toàn màn hình).
  // turnOn: chọn trong khung là muốn nghe luôn → bật nhạc nền thay vì chỉ nghe thử
  function chooseMusic(v, turnOn) {
    if (v === 'file') { $('musicInput').click(); return; }
    var lt = libTrack(v);
    if (lt && lt.locked) {
      if (window.TimerShop && window.TimerShop.available()) window.TimerShop.open(null);
      else toast('Bài này dành cho gói Pro');
      return;
    }
    var s = TM.get(v);
    if (s && musicLocked(s)) {
      openUnlock(TT.list.find(function (t) { return t.music === s.id && t.tier === 'pro'; }) || TT.get('lofi'));
      return;
    }
    unlockAudio();
    opts.musicSrc = v;
    if (turnOn) opts.musicOn = true;
    saveOpts();
    renderMusicSelects();
    // Đang nghe thử → chuyển sang bản mới; chưa phát gì → cho nghe thử luôn để biết nó thế nào
    if (preview.id || !opts.musicOn || (opts.musicRun && state.status !== 'running')) startPreview();
    else syncMusic();
  }
  musicSelects.forEach(function (sel) {
    sel.addEventListener('change', function () {
      var v = sel.value;
      sel.value = opts.musicSrc; // bị khóa / mở file thì giữ nguyên; chọn được thì renderMusicSelects đặt lại
      chooseMusic(v, false);
    });
  });

  /* Bảng nhạc trong khung toàn màn hình: bấm nút nốt nhạc để mở, chọn bài là phát luôn */
  function musicItem(value, name, desc, locked) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'music-item';
    b.setAttribute('role', 'option');
    b.dataset.value = value;
    b.setAttribute('aria-selected', opts.musicSrc === value ? 'true' : 'false');
    b.innerHTML = '<span class="mi-text"><b></b><small></small></span><svg class="ic mi-mark"><use href="#i-' + (locked ? 'lock' : 'check') + '"/></svg>';
    b.querySelector('b').textContent = name;
    b.querySelector('small').textContent = desc;
    if (locked) b.classList.add('is-locked');
    b.addEventListener('click', function () { chooseMusic(value, true); });
    return b;
  }
  function renderMusicPop() {
    if (!TM || !musicPop || musicPop.hidden) return;
    var list = $('stageMusicList');
    var top = list.scrollTop;
    list.textContent = '';
    list.appendChild(musicItem('theme', 'Theo nền', musicLabel(themeMusicId()) + ' · đổi nền là đổi nhạc', false));
    function group(label) {
      var h = document.createElement('div');
      h.className = 'music-group-label';
      h.textContent = label;
      list.appendChild(h);
    }
    Object.keys(TM.groups).forEach(function (g) {
      group(TM.groups[g]);
      TM.list.filter(function (s) { return s.group === g; }).forEach(function (s) {
        list.appendChild(musicItem(s.id, s.name, s.desc, musicLocked(s)));
      });
    });
    if (library.length) {
      group('Thư viện ManhTool');
      library.forEach(function (t) {
        list.appendChild(musicItem('lib:' + t.id, t.title, t.artist + (t.mood ? ' · ' + t.mood : ''), t.locked));
      });
    }
    group('Của bạn');
    list.appendChild(musicItem('file', musicFile ? musicFile.name : 'Chọn file nhạc trên máy…', musicFile ? 'File trên máy, không gửi đi đâu' : 'MP3, M4A… chỉ phát trên máy này', false));
    list.scrollTop = top;
    $('stageMusicOn').checked = opts.musicOn;
  }
  function setMusicPop(open) {
    musicPop.hidden = !open;
    $('stageMusic').setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open) return;
    stagePanel.hidden = true;
    renderMusicPop();
    var cur = musicPop.querySelector('[aria-selected="true"]');
    if (cur) { cur.scrollIntoView({ block: 'center' }); cur.focus({ preventScroll: true }); }
  }
  $('stageMusicOn').addEventListener('change', function () { setMusicOn(this.checked); });
  stage.addEventListener('click', function (e) {
    // e.target đã bị vẽ lại (vừa chọn bài) thì không còn trong trang → không tính là bấm ra ngoài
    if (!musicPop.hidden && e.target.isConnected && !musicPop.contains(e.target) && !e.target.closest('#stageMusic')) setMusicPop(false);
  });

  function startPreview() {
    unlockAudio();
    clearTimeout(preview.timer);
    preview.id = chosenMusic();
    syncMusic();
    renderMusicButtons();
    preview.timer = setTimeout(stopPreview, 15000);
  }

  musicVols.forEach(function (r) {
    r.addEventListener('input', function () {
      opts.musicVol = +r.value;
      musicVols.forEach(function (o) { if (o !== r) o.value = r.value; });
      if (music) music.setVolume(opts.musicVol / 100);
    });
    r.addEventListener('change', saveOpts);
  });

  $('optMusic').addEventListener('change', function () { setMusicOn(this.checked); });
  $('optMusicRun').addEventListener('change', function () { opts.musicRun = this.checked; saveOpts(); syncMusic(); });
  $('stageMusic').addEventListener('click', function () { setMusicPop(musicPop.hidden); });

  // Nghe thử 15 giây bản đang chọn, kể cả khi chưa bật nhạc / chưa đếm
  $('btnMusicTry').addEventListener('click', function () {
    if (preview.id) stopPreview(); else startPreview();
  });

  $('musicInput').addEventListener('change', function () {
    var f = this.files[0];
    this.value = '';
    if (!f) return;
    if (!/^audio\//.test(f.type)) { toast('Chỉ chọn được file nhạc'); return; }
    if (musicFile) URL.revokeObjectURL(musicFile.url);
    musicFile = { url: URL.createObjectURL(f), name: f.name.replace(/\.[^.]+$/, '').slice(0, 40) };
    unlockAudio();
    opts.musicSrc = 'file';
    opts.musicOn = true;
    saveOpts();
    renderMusicSelects();
    syncMusic();
    toast('Đã chọn "' + musicFile.name + '". File chỉ phát trên máy này, không gửi đi đâu');
  });

  /* ---------- Chế độ gọn: chỉ còn đồng hồ ở giữa trang ---------- */
  var btnCompact = $('btnCompact');
  function setCompact(on) {
    opts.compact = !!on;
    saveOpts();
    document.body.classList.toggle('is-compact', opts.compact);
    btnCompact.setAttribute('aria-pressed', opts.compact ? 'true' : 'false');
    btnCompact.querySelector('span').textContent = opts.compact ? 'Mở rộng' : 'Thu gọn';
    btnCompact.title = opts.compact ? 'Hiện lại đầy đủ (G)' : 'Thu gọn: chỉ còn đồng hồ (G)';
    if (opts.compact) window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }
  btnCompact.addEventListener('click', function () { setCompact(!opts.compact); });

  /* ---------- Hướng dẫn nhanh (lần đầu vào, hoặc bấm nút ? / phím ?) ---------- */
  var TOUR = [
    { target: '.timer-pane .dial', title: 'Đặt thời gian', text: 'Bấm giờ có sẵn, gõ số phút, hoặc gõ "Hết giờ lúc" để hẹn tới một giờ cụ thể. Muốn làm Pomodoro thì chọn "Chuỗi nhiều bước".' },
    { target: '.task-pane', title: 'Hết giờ thì làm gì?', text: 'Thêm vài việc cần làm. Hết giờ sẽ nhắc cả danh sách, hoặc chọn ngẫu nhiên 1 việc cho bạn.' },
    { target: '#btnStart', title: 'Bắt đầu', text: 'Bấm Bắt đầu hoặc phím cách. Tải lại trang hay chuyển tab, đồng hồ vẫn đếm đúng.' },
    { target: '#btnStage', title: 'Toàn màn hình & ' + TT.list.length + ' nền', text: 'Treo lên TV, máy chiếu, màn hình phụ. Có nền cho cả Tết, 8/3, 20/10, 20/11… Phím F để mở nhanh.' },
    { target: '#btnCompact', title: 'Chỉ cần đồng hồ?', text: 'Bấm Thu gọn để ẩn mọi thứ khác, chỉ còn đồng hồ ở giữa trang.' },
    { target: '#btnLogin', title: 'Dùng trên mọi thiết bị', text: 'Đăng nhập Google để lưu việc, chuỗi, cài đặt và mở lại trên máy khác.' }
  ];
  var tour = { el: null, steps: [], i: 0 };

  function tourVisible(sel) {
    var el = document.querySelector(sel);
    return el && el.offsetParent !== null && el.getClientRects().length ? el : null;
  }

  function buildTour() {
    var wrap = document.createElement('div');
    wrap.className = 'tour';
    wrap.hidden = true;
    wrap.innerHTML = '<div class="tour-spot"></div><div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tourTitle">' +
      '<span class="tour-step"></span><b class="tour-title" id="tourTitle"></b><p class="tour-text"></p>' +
      '<div class="tour-foot"><button type="button" class="link-btn tour-skip">Bỏ qua</button>' +
      '<div class="tour-nav"><button type="button" class="btn-ghost tour-prev">Trước</button><button type="button" class="btn-primary tour-next">Tiếp</button></div></div></div>';
    document.body.appendChild(wrap);
    wrap.querySelector('.tour-skip').addEventListener('click', endTour);
    wrap.querySelector('.tour-prev').addEventListener('click', function () { showTourStep(tour.i - 1); });
    wrap.querySelector('.tour-next').addEventListener('click', function () {
      if (tour.i >= tour.steps.length - 1) endTour(); else showTourStep(tour.i + 1);
    });
    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); endTour(); }
      else if (e.key === 'ArrowRight') wrap.querySelector('.tour-next').click();
      else if (e.key === 'ArrowLeft' && tour.i > 0) showTourStep(tour.i - 1);
    });
    window.addEventListener('resize', function () { if (!wrap.hidden) placeTour(); });
    window.addEventListener('scroll', function () { if (!wrap.hidden) placeTour(); }, { passive: true });
    tour.el = wrap;
  }

  function startTour(i) {
    if (stageOpen || doneDlg.open) return;
    if (opts.compact) setCompact(false);
    if (!tour.el) buildTour();
    tour.steps = TOUR.filter(function (s) { return tourVisible(s.target); });
    if (!tour.steps.length) return;
    tour.el.hidden = false;
    document.body.classList.add('tour-open');
    showTourStep(i || 0);
  }

  function showTourStep(i) {
    tour.i = Math.max(0, Math.min(i, tour.steps.length - 1));
    var s = tour.steps[tour.i];
    var card = tour.el.querySelector('.tour-card');
    card.querySelector('.tour-step').textContent = (tour.i + 1) + '/' + tour.steps.length;
    card.querySelector('.tour-title').textContent = s.title;
    card.querySelector('.tour-text').textContent = s.text;
    tour.el.querySelector('.tour-prev').hidden = tour.i === 0;
    tour.el.querySelector('.tour-next').textContent = tour.i === tour.steps.length - 1 ? 'Bắt đầu dùng' : 'Tiếp';
    document.querySelector(s.target).scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    setTimeout(placeTour, reduceMotion ? 0 : 350);
    tour.el.querySelector('.tour-next').focus();
  }

  // Khoanh vùng phần đang giới thiệu, đặt thẻ hướng dẫn ngay dưới (hoặc trên) phần đó
  function placeTour() {
    var s = tour.steps[tour.i], target = document.querySelector(s.target);
    if (!target) return;
    var r = target.getBoundingClientRect(), pad = 8;
    var spot = tour.el.querySelector('.tour-spot'), card = tour.el.querySelector('.tour-card');
    spot.style.cssText = 'left:' + (r.left - pad) + 'px;top:' + (r.top - pad) + 'px;width:' + (r.width + pad * 2) + 'px;height:' + (r.height + pad * 2) + 'px';
    var cw = card.offsetWidth, ch = card.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    var left = Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), vw - cw - 12);
    var top;
    if (r.bottom + pad + 12 + ch <= vh - 12) top = r.bottom + pad + 12;          // dưới
    else if (r.top - pad - 12 - ch >= 12) top = r.top - pad - 12 - ch;          // trên
    else {
      // Phần đang giới thiệu quá cao: đặt thẻ sang bên cạnh nếu đủ chỗ, không thì để ở đáy màn hình
      top = Math.min(Math.max(12, r.top), vh - ch - 12);
      if (r.left - pad - 12 - cw >= 12) left = r.left - pad - 12 - cw;
      else if (r.right + pad + 12 + cw <= vw - 12) left = r.right + pad + 12;
      else top = vh - ch - 12;
    }
    card.style.top = top + 'px';
    card.style.left = left + 'px';
  }

  function endTour() {
    if (!tour.el) return;
    tour.el.hidden = true;
    document.body.classList.remove('tour-open');
    try { localStorage.setItem('mt-hg-tour', '1'); } catch (e) {}
  }
  $('btnHelp').addEventListener('click', function () { startTour(0); });

  /* ---------- Gợi ý nền theo ngày lễ sắp tới (trong 7 ngày) ---------- */
  function renderOccasionHint() {
    var box = $('occasionHint');
    var now = new Date(), best = null;
    TT.list.forEach(function (t) {
      var d = TT.daysUntil(t, now);
      if (d !== null && d <= 7 && (!best || d < best.d)) best = { t: t, d: d };
    });
    var dismissed = '';
    try { dismissed = localStorage.getItem('mt-hg-hint') || ''; } catch (e) {}
    var key = best ? best.t.id + '-' + now.getFullYear() : '';
    if (!best || opts.theme === best.t.id || dismissed === key) { box.hidden = true; return; }
    $('occasionText').textContent = (best.d === 0 ? 'Hôm nay là ' : 'Còn ' + best.d + ' ngày nữa là ') + best.t.occasion.label + '. Thử nền "' + best.t.name + '" cho màn hình thêm không khí?';
    box.hidden = false;
    box.dataset.theme = best.t.id;
    box.dataset.key = key;
  }
  $('occasionTry').addEventListener('click', function () {
    var t = TT.get($('occasionHint').dataset.theme);
    if (TT.isLocked(t)) { openUnlock(t); return; }
    chooseTheme(t);
    $('occasionHint').hidden = true;
    openStage();
  });
  $('occasionClose').addEventListener('click', function () {
    try { localStorage.setItem('mt-hg-hint', $('occasionHint').dataset.key); } catch (e) {}
    $('occasionHint').hidden = true;
  });

  /* ---------- Cho account.js dùng chung ---------- */
  window.TimerApp = {
    toast: toast,
    paint: paint,
    // Bản nhạc nền đang phát (null nếu im lặng) — để kiểm tra / hiển thị
    musicPlaying: function () { return music ? music.playing() : null; },
    audioState: function () { return audioCtx ? audioCtx.state : 'none'; },
    isBusy: function () { return isActive() || doneDlg.open; },
    // Chọn nền (sau khi mua xong)
    useTheme: function (id) { chooseTheme(TT.get(id)); },
    copy: writeClipboard,
    // Gọi lại khi quyền Pro / chế độ khóa nền thay đổi
    refreshThemes: function () {
      if (TT.isLocked(TT.get(opts.theme))) { opts.theme = TT.list[0].id; saveOpts(); }
      renderThemeGrids();
      $('themeNote').hidden = TT.lockPremium;
      if (stageOpen) applyStageTheme();
      applyCardTheme();
      renderMusicSelects(); // quyền Pro đổi → nhạc Pro mở / khóa theo
      lastMusicKey = '';
      syncMusic();
      loadLibrary();
    }
  };

  /* ---------- Khởi động ---------- */
  if (firstVisit) saveTasks();
  if (!isActive()) { round = 0; if (state.status !== 'done') runPlan = null; }
  applyPhoto();
  renderThemeGrids();
  applyCardTheme();
  $('themeNote').hidden = TT.lockPremium;
  renderPlanEditor();
  renderTasks();
  renderPick();
  renderMode();
  renderTitle();
  renderSaved();
  renderStats();
  renderSeqTrack();
  fillInputs(opts.singleMs || (runPlan ? TEMPLATES[0].minutes * TC.MIN : state.duration));
  schedule();
  render();
  readShareLink();
  if (state.status === 'running') requestWake();
  // Hết giờ trong lúc trang đóng → báo luôn khi mở lại (không kêu chuông vì chưa có cú bấm nào)
  if (state.status === 'done') finish(true);
  setCompact(opts.compact);
  if (TM) { renderMusicSelects(); loadLibrary(); } else document.querySelector('.music-group').hidden = true;
  renderOccasionHint();
  // Lần đầu vào trang (và không đang đếm) → mở hướng dẫn nhanh
  var toured = false;
  try { toured = localStorage.getItem('mt-hg-tour') === '1'; } catch (e) {}
  if (!toured && !isActive() && !OPENED_FROM_SHARE) setTimeout(function () { startTour(0); }, 900);

  /* ---------- Lời mời tư vấn ---------- */
  var nudge = (function () {
    var KEY = 'mt-nudge-dismissed';
    var el = $('nudge');
    if (!el) return { afterCopy: function () {} };
    var wanted = false, suppressed = false, timer;

    function dismissed() {
      try { return !!sessionStorage.getItem(KEY); } catch (e) { return false; }
    }
    function sync() { el.hidden = !wanted || suppressed || dismissed(); }
    function want() {
      if (wanted || dismissed()) return;
      wanted = true;
      sync();
    }
    function dismiss() {
      wanted = false;
      clearTimeout(timer);
      try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
      sync();
    }

    if (!dismissed()) {
      timer = setTimeout(want, 25000);
      if ('IntersectionObserver' in window) {
        var guide = document.querySelector('.guide, .about, .faq, .seo-tips, .quick-tips, .brand-card');
        if (guide) {
          var io = new IntersectionObserver(function (en) {
            if (en[0].isIntersecting) { want(); io.disconnect(); }
          });
          io.observe(guide);
        }
        var seen = new Set();
        var hideIo = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) { if (e.isIntersecting) seen.add(e.target); else seen.delete(e.target); });
          suppressed = seen.size > 0;
          sync();
        });
        document.querySelectorAll('.brand-section, .site-footer').forEach(function (t) { hideIo.observe(t); });
      }
    }

    var btnClose = $('nudgeClose');
    if (btnClose) btnClose.addEventListener('click', dismiss);
    var btnGo = $('nudgeGo');
    if (btnGo) btnGo.addEventListener('click', dismiss);
    return { afterCopy: function () { setTimeout(want, 1500); } };
  })();
  window.nudge = nudge;
})();
