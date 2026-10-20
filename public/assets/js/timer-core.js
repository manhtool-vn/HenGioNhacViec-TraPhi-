/* ManhTool — Hẹn giờ nhắc việc: phần xử lý thuần (dùng được cả trên trình duyệt và Node để kiểm thử) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TimerCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SEC = 1000, MIN = 60 * SEC, HOUR = 60 * MIN;
  var MAX_MS = 24 * HOUR - SEC;          // tối đa 23:59:59
  var MAX_TASK_LEN = 120;
  var MAX_TASKS = 30;

  function toInt(v) {
    var n = Math.floor(Number(v));
    return isFinite(n) && n > 0 ? n : 0;
  }

  // Giờ/phút/giây người dùng gõ → mili giây. Cho phép gõ "90 phút", tự quy đổi thành 1:30:00.
  function toMs(h, m, s) {
    var ms = (toInt(h) * 3600 + toInt(m) * 60 + toInt(s)) * SEC;
    return Math.min(ms, MAX_MS);
  }

  // Làm tròn lên theo giây để 00:00 chỉ hiện đúng lúc hết giờ
  function split(ms) {
    var t = Math.ceil(Math.max(0, ms) / SEC);
    return { h: Math.floor(t / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function format(ms) {
    var p = split(ms);
    return p.h ? p.h + ':' + pad(p.m) + ':' + pad(p.s) : pad(p.m) + ':' + pad(p.s);
  }

  // 2700000 → "45 phút", 5400000 → "1 giờ 30 phút"
  function describe(ms) {
    var p = split(ms), out = [];
    if (p.h) out.push(p.h + ' giờ');
    if (p.m) out.push(p.m + ' phút');
    if (p.s) out.push(p.s + ' giây');
    return out.length ? out.join(' ') : '0 giây';
  }

  /* ---------- Trạng thái đồng hồ ----------
     Không đếm theo từng nhịp setInterval (trình duyệt làm chậm nhịp khi tab ở nền),
     mà lưu mốc kết thúc endAt rồi tính phần còn lại từ giờ hệ thống. */
  var STATUSES = ['idle', 'running', 'paused', 'done'];

  function idle(duration) {
    var d = Math.min(Math.max(0, Math.floor(Number(duration) || 0)), MAX_MS);
    return { status: 'idle', duration: d, total: d, endAt: null, left: d };
  }

  function start(st, now) {
    if (st.status === 'running') return st;
    if (st.status === 'paused') {
      if (st.left <= 0) return st;
      return { status: 'running', duration: st.duration, total: st.total, endAt: now + st.left, left: st.left };
    }
    if (st.duration <= 0) return st;
    return { status: 'running', duration: st.duration, total: st.duration, endAt: now + st.duration, left: st.duration };
  }

  // Báo lại sau ms: chạy một lượt ngắn nhưng giữ nguyên thời gian đã đặt cho lần "Đếm lại" sau
  function snooze(st, ms, now) {
    var d = Math.min(Math.max(0, ms), MAX_MS);
    if (!d) return st;
    return { status: 'running', duration: st.duration, total: d, endAt: now + d, left: d };
  }

  function pause(st, now) {
    if (st.status !== 'running') return st;
    var left = Math.max(0, st.endAt - now);
    return { status: 'paused', duration: st.duration, total: st.total, endAt: null, left: left };
  }

  function reset(st) { return idle(st.duration); }

  function setDuration(st, ms) {
    if (st.status === 'running' || st.status === 'paused') return st;
    return idle(ms);
  }

  function remaining(st, now) {
    if (st.status === 'running') return Math.max(0, st.endAt - now);
    if (st.status === 'done') return 0;
    return st.left;
  }

  // Phần còn lại / tổng, từ 1 (vừa bắt đầu) về 0 (hết giờ)
  function progress(st, now) {
    if (!st.total) return st.status === 'done' ? 0 : 1;
    return Math.min(1, Math.max(0, remaining(st, now) / st.total));
  }

  // Trả về chính st nếu chưa có gì đổi, để phía giao diện so sánh bằng ===
  function tick(st, now) {
    if (st.status !== 'running' || now < st.endAt) return st;
    return { status: 'done', duration: st.duration, total: st.total, endAt: st.endAt, left: 0 };
  }

  function addTime(st, ms, now) {
    if (st.status === 'running') {
      var left = Math.min(MAX_MS, Math.max(0, st.endAt - now) + ms);
      return { status: 'running', duration: st.duration, total: Math.min(MAX_MS, st.total + ms), endAt: now + left, left: left };
    }
    if (st.status === 'paused') {
      var l = Math.min(MAX_MS, st.left + ms);
      return { status: 'paused', duration: st.duration, total: Math.min(MAX_MS, st.total + ms), endAt: null, left: l };
    }
    return st;
  }

  // Khôi phục trạng thái đã lưu (có thể hỏng hoặc từ phiên bản cũ). Nếu đã hết giờ khi trang đóng → 'done'.
  function revive(raw, now, fallbackDuration) {
    var base = idle(fallbackDuration || 0);
    if (!raw || typeof raw !== 'object' || STATUSES.indexOf(raw.status) === -1) return base;
    var d = Number(raw.duration);
    if (!isFinite(d) || d < 0 || d > MAX_MS) return base;
    var st = idle(d);
    var total = Number(raw.total);
    if (raw.status === 'running') {
      var endAt = Number(raw.endAt);
      if (!isFinite(endAt) || !isFinite(total) || total <= 0) return st;
      st = { status: 'running', duration: st.duration, total: Math.min(total, MAX_MS), endAt: endAt, left: 0 };
      st.left = remaining(st, now);
      return tick(st, now);
    }
    if (raw.status === 'paused') {
      var left = Number(raw.left);
      if (!isFinite(left) || left <= 0 || !isFinite(total) || total <= 0) return st;
      return { status: 'paused', duration: st.duration, total: Math.min(total, MAX_MS), endAt: null, left: Math.min(left, MAX_MS) };
    }
    if (raw.status === 'done') {
      return { status: 'done', duration: st.duration, total: st.duration, endAt: Number(raw.endAt) || null, left: 0 };
    }
    return st;
  }

  /* ---------- Danh sách việc ---------- */
  function cleanText(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, MAX_TASK_LEN);
  }

  // Nhận mảng chuỗi hoặc {text}, bỏ dòng trống, giới hạn số lượng
  function cleanTasks(list) {
    if (!Array.isArray(list)) return [];
    var out = [];
    for (var i = 0; i < list.length && out.length < MAX_TASKS; i++) {
      var item = list[i];
      var t = cleanText(item && typeof item === 'object' ? item.text : item);
      if (t) out.push(t);
    }
    return out;
  }

  // Chọn ngẫu nhiên 1 chỉ số trong [0, n), tránh lặp lại việc vừa chọn (nếu có hơn 1 việc)
  function pickIndex(n, exclude, rand) {
    rand = rand || Math.random;
    if (!(n > 0)) return -1;
    if (n === 1) return 0;
    var skip = typeof exclude === 'number' && exclude >= 0 && exclude < n;
    var i = Math.floor(rand() * (skip ? n - 1 : n));
    if (i >= (skip ? n - 1 : n)) i = (skip ? n - 2 : n - 1); // phòng rand() trả về đúng 1
    if (skip && i >= exclude) i++;
    return i;
  }

  /* ---------- Báo trước & thống kê ---------- */

  // Vừa vượt qua ngưỡng báo trước giữa 2 lần kiểm tra (không báo lại khi tải trang giữa chừng)
  function crossed(prevLeft, left, threshold) {
    return threshold > 0 && prevLeft > threshold && left <= threshold && left > 0;
  }

  function dayKey(date) {
    var m = date.getMonth() + 1, d = date.getDate();
    return date.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }

  /* Lịch sử theo ngày: { 'YYYY-MM-DD': { rounds, ms } }, giữ tối đa KEEP_DAYS ngày gần nhất.
     Nhận cả dạng cũ { day, rounds, ms } (chỉ 1 ngày) để không mất số liệu khi nâng cấp. */
  var KEEP_DAYS = 60;
  var DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

  function cleanDay(v) {
    var r = Math.floor(Number(v && v.rounds)), ms = Math.floor(Number(v && v.ms));
    return { rounds: r > 0 ? r : 0, ms: ms > 0 ? ms : 0 };
  }

  function cleanHistory(raw) {
    var out = {};
    if (!raw || typeof raw !== 'object') return out;
    if (typeof raw.day === 'string' && DAY_RE.test(raw.day)) {
      out[raw.day] = cleanDay(raw);
      return out;
    }
    var keys = Object.keys(raw).filter(function (k) { return DAY_RE.test(k); }).sort().slice(-KEEP_DAYS);
    keys.forEach(function (k) { out[k] = cleanDay(raw[k]); });
    return out;
  }

  function today(hist, key) {
    var d = cleanHistory(hist)[key];
    return { day: key, rounds: d ? d.rounds : 0, ms: d ? d.ms : 0 };
  }

  function addRound(hist, key, ms) {
    var h = cleanHistory(hist);
    var d = h[key] || { rounds: 0, ms: 0 };
    h[key] = { rounds: d.rounds + 1, ms: d.ms + Math.max(0, Math.floor(Number(ms) || 0)) };
    return cleanHistory(h);
  }

  // n ngày gần nhất tính đến date (cũ → mới), kèm nhãn thứ
  var WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  function lastDays(hist, date, n) {
    var h = cleanHistory(hist), out = [];
    for (var i = n - 1; i >= 0; i--) {
      var d = new Date(date.getFullYear(), date.getMonth(), date.getDate() - i);
      var k = dayKey(d), v = h[k] || { rounds: 0, ms: 0 };
      out.push({ key: k, label: WEEKDAYS[d.getDay()], date: d.getDate() + '/' + (d.getMonth() + 1), rounds: v.rounds, ms: v.ms });
    }
    return out;
  }

  /* ---------- Chuỗi nhiều bước (Pomodoro, HIIT, thuyết trình…) ---------- */
  var MAX_STEPS = 20, MAX_REPEAT = 20, MAX_STEP_NAME = 40;

  function cleanPlan(raw) {
    if (!raw || !Array.isArray(raw.steps)) return null;
    var steps = [];
    for (var i = 0; i < raw.steps.length && steps.length < MAX_STEPS; i++) {
      var s = raw.steps[i];
      if (!s || typeof s !== 'object') continue;
      var ms = Math.min(MAX_MS, Math.floor(Number(s.ms) || 0));
      if (!(ms > 0)) continue;
      steps.push({ name: cleanText(s.name).slice(0, MAX_STEP_NAME) || 'Bước ' + (steps.length + 1), ms: ms });
    }
    if (!steps.length) return null;
    var repeat = Math.floor(Number(raw.repeat) || 1);
    return { steps: steps, repeat: Math.min(MAX_REPEAT, Math.max(1, repeat)) };
  }

  function planTotal(plan) {
    var sum = 0;
    plan.steps.forEach(function (s) { sum += s.ms; });
    return sum * plan.repeat;
  }

  // Vị trí kế tiếp trong chuỗi, null nếu đã hết
  function nextPos(plan, pos) {
    var step = pos.step + 1, cycle = pos.cycle;
    if (step >= plan.steps.length) { step = 0; cycle++; }
    return cycle >= plan.repeat ? null : { step: step, cycle: cycle };
  }

  function validPos(plan, pos) {
    return !!(plan && pos && pos.step >= 0 && pos.step < plan.steps.length && pos.cycle >= 0 && pos.cycle < plan.repeat &&
      Math.floor(pos.step) === pos.step && Math.floor(pos.cycle) === pos.cycle);
  }

  // Tổng thời gian còn lại của cả chuỗi = phần còn của bước đang chạy + các bước phía sau
  function planLeft(plan, pos, stepLeft) {
    var left = Math.max(0, stepLeft), p = nextPos(plan, pos);
    while (p) { left += plan.steps[p.step].ms; p = nextPos(plan, p); }
    return left;
  }

  // "25" → 25 phút, "1:30" → 1 phút 30 giây, "1:00:00" → 1 giờ
  function parseDuration(text) {
    var parts = String(text == null ? '' : text).trim().replace(/[.,]/g, ':').split(':');
    if (parts.length > 3 || parts.some(function (p) { return !/^\d{1,4}$/.test(p.trim()); })) return 0;
    var n = parts.map(function (p) { return parseInt(p, 10); });
    if (n.length === 1) return toMs(0, n[0], 0);
    if (n.length === 2) return toMs(0, n[0], n[1]);
    return toMs(n[0], n[1], n[2]);
  }

  // Thời gian từ bây giờ tới giờ "HH:MM" gần nhất (hôm nay, hoặc ngày mai nếu đã qua)
  function msUntil(hhmm, now) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    if (!m) return 0;
    var h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return 0;
    var t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, mi, 0, 0);
    if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1);
    return Math.min(MAX_MS, Math.round((t.getTime() - now.getTime()) / SEC) * SEC);
  }

  // Hiểu giờ người dùng gõ (24 giờ): "9" → 09:00, "930" → 09:30, "1730" / "17:30" / "17h30" → 17:30
  function parseClock(text) {
    var s = String(text == null ? '' : text).trim().toLowerCase().replace(/h/, ':');
    var h, m;
    var mm = /^(\d{1,2})\s*:\s*(\d{1,2})?$/.exec(s);
    if (mm) { h = +mm[1]; m = mm[2] ? +mm[2] : 0; }
    else if (/^\d{1,4}$/.test(s)) {
      if (s.length <= 2) { h = +s; m = 0; }
      else if (s.length === 3) { h = +s[0]; m = +s.slice(1); }
      else { h = +s.slice(0, 2); m = +s.slice(2); }
    } else return null;
    if (h > 23 || m > 59) return null;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  // Giờ gợi ý: 3 mốc :00/:30 kế tiếp (cách bây giờ ít nhất 10 phút) + vài giờ quen thuộc còn lại trong ngày
  function suggestTimes(now, max) {
    max = max || 5;
    var out = [], seen = {};
    function add(h, m) {
      var key = (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
      if (seen[key]) return;
      var ms = msUntil(key, now);
      if (ms < 10 * MIN) return;
      seen[key] = true;
      out.push({ time: key, ms: ms });
    }
    var t = new Date(now.getTime() + 10 * MIN);
    var mins = t.getHours() * 60 + t.getMinutes();
    var slot = Math.ceil(mins / 30) * 30;
    for (var i = 0; i < 3; i++) { var x = (slot + i * 30) % 1440; add(Math.floor(x / 60), x % 60); }
    [[11, 30], [12, 0], [13, 30], [17, 0], [17, 30], [22, 0]].forEach(function (p) {
      var ms = msUntil((p[0] < 10 ? '0' : '') + p[0] + ':' + (p[1] < 10 ? '0' : '') + p[1], now);
      if (ms < 12 * HOUR) add(p[0], p[1]);
    });
    return out.sort(function (a, b) { return a.ms - b.ms; }).slice(0, max);
  }

  /* ---------- Liên kết chia sẻ ----------
     Gói cài đặt thành 1 chuỗi base64url gọn để dán vào ?p=… */
  function toB64Url(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64Url(s) {
    var b = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    var bin = atob(b), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  // Kiểu hiển thị toàn màn hình, đúng thứ tự nút trong bảng Giao diện
  var STYLES = ['ring', 'bar', 'digits', 'flip', 'ticks', 'glass'];

  function encodeShare(cfg) {
    var o = {};
    if (cfg.plan) o.p = { s: cfg.plan.steps.map(function (s) { return [s.name, s.ms]; }), r: cfg.plan.repeat };
    else o.t = cfg.ms;
    if (cfg.tasks && cfg.tasks.length) o.k = cfg.tasks;
    if (cfg.pick === 'random') o.r = 1;
    if (cfg.theme) o.h = cfg.theme;
    if (cfg.style) o.y = cfg.style;
    if (cfg.title) o.n = cfg.title;
    return toB64Url(JSON.stringify(o));
  }

  // Trả về null nếu chuỗi hỏng. Mọi giá trị đều được làm sạch lại.
  function decodeShare(str) {
    var o;
    try { o = JSON.parse(fromB64Url(str)); } catch (e) { return null; }
    if (!o || typeof o !== 'object') return null;
    var cfg = { ms: 0, plan: null, tasks: cleanTasks(o.k), pick: o.r === 1 ? 'random' : 'list', theme: null, style: null, title: '' };
    if (o.p && Array.isArray(o.p.s)) {
      cfg.plan = cleanPlan({ steps: o.p.s.map(function (s) { return Array.isArray(s) ? { name: s[0], ms: s[1] } : null; }), repeat: o.p.r });
    } else {
      cfg.ms = Math.min(MAX_MS, Math.max(0, Math.floor(Number(o.t) || 0)));
    }
    if (typeof o.h === 'string' && /^[a-z0-9-]{1,30}$/.test(o.h)) cfg.theme = o.h;
    if (STYLES.indexOf(o.y) !== -1) cfg.style = o.y;
    cfg.title = cleanText(o.n).slice(0, 80);
    if (!cfg.plan && !cfg.ms && !cfg.tasks.length) return null;
    return cfg;
  }

  return {
    crossed: crossed, dayKey: dayKey, today: today, addRound: addRound, cleanHistory: cleanHistory, lastDays: lastDays,
    MAX_STEPS: MAX_STEPS, MAX_REPEAT: MAX_REPEAT, MAX_STEP_NAME: MAX_STEP_NAME,
    cleanPlan: cleanPlan, planTotal: planTotal, nextPos: nextPos, validPos: validPos, planLeft: planLeft,
    parseDuration: parseDuration, msUntil: msUntil, parseClock: parseClock, suggestTimes: suggestTimes, encodeShare: encodeShare, decodeShare: decodeShare, STYLES: STYLES,
    SEC: SEC, MIN: MIN, HOUR: HOUR, MAX_MS: MAX_MS, MAX_TASKS: MAX_TASKS, MAX_TASK_LEN: MAX_TASK_LEN,
    toMs: toMs, split: split, format: format, describe: describe,
    idle: idle, start: start, snooze: snooze, pause: pause, reset: reset, setDuration: setDuration,
    remaining: remaining, progress: progress, tick: tick, addTime: addTime, revive: revive,
    cleanText: cleanText, cleanTasks: cleanTasks, pickIndex: pickIndex
  };
});
