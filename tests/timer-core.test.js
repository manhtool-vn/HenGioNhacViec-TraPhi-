const test = require('node:test');
const assert = require('node:assert/strict');
const TC = require('../public/assets/js/timer-core.js');

const MIN = 60000;

test('toMs quy đổi và giới hạn', () => {
  assert.equal(TC.toMs(0, 45, 0), 45 * MIN);
  assert.equal(TC.toMs(0, 90, 0), 90 * MIN);
  assert.equal(TC.toMs('1', '2', '3'), 3723000);
  assert.equal(TC.toMs(-1, 'abc', null), 0);
  assert.equal(TC.toMs(99, 0, 0), TC.MAX_MS);
});

test('format và describe', () => {
  assert.equal(TC.format(0), '00:00');
  assert.equal(TC.format(45 * MIN), '45:00');
  assert.equal(TC.format(5400000), '1:30:00');
  assert.equal(TC.format(59001), '01:00'); // làm tròn lên theo giây
  assert.equal(TC.format(-5), '00:00');
  assert.equal(TC.describe(45 * MIN), '45 phút');
  assert.equal(TC.describe(5400000), '1 giờ 30 phút');
  assert.equal(TC.describe(90000), '1 phút 30 giây');
  assert.equal(TC.describe(0), '0 giây');
});

test('chạy, tạm dừng, tiếp tục, hết giờ', () => {
  let st = TC.idle(10 * MIN);
  st = TC.start(st, 1000);
  assert.equal(st.status, 'running');
  assert.equal(TC.remaining(st, 1000 + MIN), 9 * MIN);

  st = TC.pause(st, 1000 + 2 * MIN);
  assert.equal(st.status, 'paused');
  assert.equal(TC.remaining(st, 999999999), 8 * MIN); // tạm dừng thì không trôi

  st = TC.start(st, 50000000);
  assert.equal(st.endAt, 50000000 + 8 * MIN);
  assert.equal(TC.tick(st, st.endAt - 1), st); // chưa hết giờ → giữ nguyên đối tượng

  const done = TC.tick(st, st.endAt);
  assert.equal(done.status, 'done');
  assert.equal(TC.remaining(done, st.endAt + 5000), 0);
  assert.equal(TC.progress(done, 0), 0);

  const again = TC.start(done, 0);
  assert.equal(again.status, 'running');
  assert.equal(again.endAt, 10 * MIN);
});

test('không chạy khi thời gian bằng 0', () => {
  const st = TC.idle(0);
  assert.equal(TC.start(st, 0), st);
});

test('setDuration bị bỏ qua khi đang chạy', () => {
  const run = TC.start(TC.idle(MIN), 0);
  assert.equal(TC.setDuration(run, 5 * MIN), run);
  assert.equal(TC.setDuration(TC.idle(MIN), 5 * MIN).duration, 5 * MIN);
});

test('addTime cộng thêm và cập nhật tổng để vòng tiến độ đúng', () => {
  let st = TC.start(TC.idle(MIN), 0);
  st = TC.addTime(st, MIN, 30000);
  assert.equal(TC.remaining(st, 30000), 90000);
  assert.equal(st.total, 2 * MIN);
  assert.equal(st.duration, MIN); // lần sau vẫn đếm lại đúng thời gian đã đặt

  let p = TC.pause(st, 30000);
  p = TC.addTime(p, MIN, 0);
  assert.equal(p.left, 150000);
  assert.equal(TC.addTime(TC.idle(MIN), MIN, 0).duration, MIN);
});

test('snooze chạy lượt ngắn, giữ thời gian đã đặt', () => {
  const done = TC.tick(TC.start(TC.idle(45 * MIN), 0), 45 * MIN);
  const s = TC.snooze(done, 5 * MIN, 1000);
  assert.equal(s.status, 'running');
  assert.equal(TC.remaining(s, 1000), 5 * MIN);
  assert.equal(s.total, 5 * MIN);
  assert.equal(s.duration, 45 * MIN);
  assert.equal(TC.snooze(done, 0, 0), done);
});

test('progress đi từ 1 về 0', () => {
  const st = TC.start(TC.idle(100000), 0);
  assert.equal(TC.progress(st, 0), 1);
  assert.equal(TC.progress(st, 25000), 0.75);
  assert.equal(TC.progress(st, 200000), 0);
  assert.equal(TC.progress(TC.idle(5000), 0), 1);
});

test('revive: dữ liệu hỏng, đang chạy, đã hết giờ khi đóng trang', () => {
  assert.deepEqual(TC.revive(null, 0, MIN), TC.idle(MIN));
  assert.deepEqual(TC.revive({ status: 'xyz' }, 0, MIN), TC.idle(MIN));
  assert.deepEqual(TC.revive({ status: 'idle', duration: -5 }, 0, MIN), TC.idle(MIN));

  const run = TC.start(TC.idle(10 * MIN), 0);
  const back = TC.revive(JSON.parse(JSON.stringify(run)), 4 * MIN, MIN);
  assert.equal(back.status, 'running');
  assert.equal(TC.remaining(back, 4 * MIN), 6 * MIN);

  const late = TC.revive(run, 11 * MIN, MIN);
  assert.equal(late.status, 'done');
  assert.equal(late.endAt, 10 * MIN);

  const paused = TC.revive({ status: 'paused', duration: MIN, total: MIN, left: 20000 }, 0);
  assert.equal(paused.status, 'paused');
  assert.equal(paused.left, 20000);
});

test('crossed chỉ báo đúng lúc vượt ngưỡng', () => {
  assert.equal(TC.crossed(61000, 59000, MIN), true);
  assert.equal(TC.crossed(60000, 59000, MIN), false); // đã ở dưới ngưỡng từ trước
  assert.equal(TC.crossed(61000, 0, MIN), false);     // hết giờ luôn thì để chuông chính lo
  assert.equal(TC.crossed(61000, 59000, 0), false);   // tắt báo trước
});

test('lịch sử theo ngày', () => {
  assert.equal(TC.dayKey(new Date(2026, 0, 5)), '2026-01-05');
  let h = TC.addRound(null, '2026-10-17', 45 * MIN);
  h = TC.addRound(h, '2026-10-17', 5 * MIN);
  h = TC.addRound(h, '2026-10-18', MIN);
  assert.deepEqual(TC.today(h, '2026-10-17'), { day: '2026-10-17', rounds: 2, ms: 50 * MIN });
  assert.deepEqual(TC.today(h, '2026-10-19'), { day: '2026-10-19', rounds: 0, ms: 0 });
  // dữ liệu hỏng thì về 0
  assert.deepEqual(TC.today({ '2026-10-17': { rounds: -3, ms: 'x' } }, '2026-10-17'), { day: '2026-10-17', rounds: 0, ms: 0 });
});

test('lịch sử: đọc được dạng cũ và chỉ giữ 60 ngày', () => {
  const old = { day: '2026-10-17', rounds: 3, ms: 900000 };
  assert.deepEqual(TC.today(old, '2026-10-17'), { day: '2026-10-17', rounds: 3, ms: 900000 });
  let h = {};
  for (let i = 1; i <= 70; i++) h[TC.dayKey(new Date(2026, 0, i))] = { rounds: 1, ms: 1 };
  h = TC.addRound(h, '2026-03-20', 1);
  const keys = Object.keys(h);
  assert.equal(keys.length, 60);
  assert.ok(keys.includes('2026-03-20'));
  assert.ok(!keys.includes('2026-01-01'));
});

test('lastDays trả về đủ n ngày, cũ trước mới sau', () => {
  const h = TC.addRound(null, '2026-10-17', MIN);
  const days = TC.lastDays(h, new Date(2026, 9, 17), 7);
  assert.equal(days.length, 7);
  assert.equal(days[0].key, '2026-10-11');
  assert.equal(days[6].key, '2026-10-17');
  assert.equal(days[6].rounds, 1);
  assert.equal(days[6].label, 'T7'); // 17/10/2026 là thứ Bảy
  assert.equal(days[6].date, '17/10');
});

test('cleanPlan làm sạch chuỗi bước', () => {
  assert.equal(TC.cleanPlan(null), null);
  assert.equal(TC.cleanPlan({ steps: [{ name: 'x', ms: 0 }] }), null);
  const p = TC.cleanPlan({ steps: [{ name: '  Tập   trung ', ms: 25 * MIN }, null, { name: '', ms: 5 * MIN }], repeat: 99 });
  assert.deepEqual(p, { steps: [{ name: 'Tập trung', ms: 25 * MIN }, { name: 'Bước 2', ms: 5 * MIN }], repeat: TC.MAX_REPEAT });
  assert.equal(TC.cleanPlan({ steps: [{ ms: MIN }], repeat: 0 }).repeat, 1);
  assert.equal(TC.cleanPlan({ steps: Array(30).fill({ ms: MIN }) }).steps.length, TC.MAX_STEPS);
});

test('đi qua chuỗi bước và tính thời gian còn lại', () => {
  const plan = { steps: [{ name: 'A', ms: 10 * MIN }, { name: 'B', ms: 2 * MIN }], repeat: 2 };
  assert.equal(TC.planTotal(plan), 24 * MIN);
  let pos = { step: 0, cycle: 0 };
  const seen = [];
  while (pos) { seen.push(pos.step + '/' + pos.cycle); pos = TC.nextPos(plan, pos); }
  assert.deepEqual(seen, ['0/0', '1/0', '0/1', '1/1']);
  assert.equal(TC.planLeft(plan, { step: 0, cycle: 0 }, 10 * MIN), 24 * MIN);
  assert.equal(TC.planLeft(plan, { step: 1, cycle: 1 }, 30000), 30000);
  assert.equal(TC.validPos(plan, { step: 1, cycle: 1 }), true);
  assert.equal(TC.validPos(plan, { step: 2, cycle: 0 }), false);
  assert.equal(TC.validPos(plan, { step: 0.5, cycle: 0 }), false);
});

test('parseDuration hiểu phút, phút:giây, giờ:phút:giây', () => {
  assert.equal(TC.parseDuration('25'), 25 * MIN);
  assert.equal(TC.parseDuration('1:30'), 90000);
  assert.equal(TC.parseDuration('0:40'), 40000);
  assert.equal(TC.parseDuration('1:00:00'), 60 * MIN);
  assert.equal(TC.parseDuration('1.30'), 90000);
  assert.equal(TC.parseDuration('abc'), 0);
  assert.equal(TC.parseDuration(''), 0);
  assert.equal(TC.parseDuration('1:2:3:4'), 0);
});

test('msUntil tính tới giờ hẹn gần nhất', () => {
  const now = new Date(2026, 9, 17, 10, 30, 15);
  assert.equal(TC.msUntil('11:30', now), 59 * MIN + 45000);
  assert.equal(TC.msUntil('10:00', now), (23 * 60 + 29) * MIN + 45000); // đã qua → ngày mai
  assert.equal(TC.msUntil('25:00', now), 0);
  assert.equal(TC.msUntil('xx', now), 0);
});

test('parseClock hiểu nhiều kiểu gõ giờ 24h', () => {
  assert.equal(TC.parseClock('9'), '09:00');
  assert.equal(TC.parseClock('930'), '09:30');
  assert.equal(TC.parseClock('1730'), '17:30');
  assert.equal(TC.parseClock('17:30'), '17:30');
  assert.equal(TC.parseClock('17h30'), '17:30');
  assert.equal(TC.parseClock('17:'), '17:00');
  assert.equal(TC.parseClock('2460'), null);
  assert.equal(TC.parseClock('25'), null);
  assert.equal(TC.parseClock('abc'), null);
  assert.equal(TC.parseClock(''), null);
});

test('suggestTimes: mốc :00/:30 kế tiếp + giờ quen thuộc, tăng dần, cách ít nhất 10 phút', () => {
  const s = TC.suggestTimes(new Date(2026, 9, 17, 11, 42), 5);
  assert.deepEqual(s.map((x) => x.time), ['12:00', '12:30', '13:00', '13:30', '17:00']);
  assert.equal(s[0].ms, 18 * MIN);
  const late = TC.suggestTimes(new Date(2026, 9, 17, 11, 52), 3);
  assert.equal(late[0].time, '12:30'); // 12:00 chỉ còn 8 phút → bỏ
  const night = TC.suggestTimes(new Date(2026, 9, 17, 23, 40), 3);
  assert.deepEqual(night.map((x) => x.time), ['00:00', '00:30', '01:00']);
});

test('liên kết chia sẻ: mã hóa rồi giải mã giữ nguyên cài đặt', () => {
  const cfg = { ms: 45 * MIN, tasks: ['Đứng dậy', 'Uống nước'], pick: 'random', theme: 'neon', style: 'flip', title: 'Lớp 10A — kiểm tra' };
  const back = TC.decodeShare(TC.encodeShare(cfg));
  assert.deepEqual(back, { ms: 45 * MIN, plan: null, tasks: cfg.tasks, pick: 'random', theme: 'neon', style: 'flip', title: cfg.title });
  const plan = { steps: [{ name: 'Tập trung', ms: 25 * MIN }, { name: 'Nghỉ', ms: 5 * MIN }], repeat: 4 };
  const p2 = TC.decodeShare(TC.encodeShare({ plan, tasks: [] }));
  assert.deepEqual(p2.plan, plan);
  assert.equal(TC.encodeShare(cfg).indexOf('='), -1);
  assert.match(TC.encodeShare(cfg), /^[A-Za-z0-9_-]+$/);
});

test('liên kết chia sẻ giữ được mọi kiểu hiển thị, kể cả Vạch chia và Thẻ kính', () => {
  for (const style of ['ring', 'bar', 'digits', 'flip', 'ticks', 'glass']) {
    assert.ok(TC.STYLES.includes(style), style);
    assert.equal(TC.decodeShare(TC.encodeShare({ ms: 5 * MIN, style })).style, style);
  }
});

test('liên kết chia sẻ hỏng hoặc độc hại thì bị bỏ qua / làm sạch', () => {
  assert.equal(TC.decodeShare('%%%'), null);
  assert.equal(TC.decodeShare(Buffer.from('{"t":0}').toString('base64')), null);
  const evil = Buffer.from(JSON.stringify({ t: 1e12, h: '<script>', y: 'x', n: 'a'.repeat(300) })).toString('base64');
  const c = TC.decodeShare(evil);
  assert.equal(c.ms, TC.MAX_MS);
  assert.equal(c.theme, null);
  assert.equal(c.style, null);
  assert.equal(c.title.length, 80);
});

test('cleanTasks bỏ dòng trống, gọn khoảng trắng, giới hạn số lượng', () => {
  assert.deepEqual(TC.cleanTasks(['  Đứng   dậy ', '', null, { text: 'Uống nước' }, 5]), ['Đứng dậy', 'Uống nước', '5']);
  assert.deepEqual(TC.cleanTasks('abc'), []);
  assert.equal(TC.cleanTasks(Array(50).fill('x')).length, TC.MAX_TASKS);
  assert.equal(TC.cleanText('a'.repeat(500)).length, TC.MAX_TASK_LEN);
});

test('pickIndex không lặp lại việc vừa chọn', () => {
  assert.equal(TC.pickIndex(0), -1);
  assert.equal(TC.pickIndex(1, 0), 0);
  for (let r = 0; r < 1; r += 0.05) {
    const i = TC.pickIndex(4, 2, () => r);
    assert.ok(i >= 0 && i < 4);
    assert.notEqual(i, 2);
  }
  assert.equal(TC.pickIndex(3, 0, () => 0.9999), 2);
  assert.equal(TC.pickIndex(3, undefined, () => 1), 2); // rand() = 1 vẫn trong khoảng
  // Không có việc vừa chọn → mọi chỉ số đều có thể ra
  const seen = new Set();
  for (let r = 0; r < 1; r += 0.1) seen.add(TC.pickIndex(3, -1, () => r));
  assert.deepEqual([...seen].sort(), [0, 1, 2]);
});
