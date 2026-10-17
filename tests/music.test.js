const test = require('node:test');
const assert = require('node:assert/strict');
const TM = require('../public/assets/js/soundscapes.js');
const TT = require('../public/assets/js/themes.js');

// Số ngẫu nhiên lặp lại được để test ổn định
function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

test('danh sách nhạc: id riêng, có tên, nhóm và hạng hợp lệ, mỗi bản có bộ dựng', () => {
  const ids = new Set();
  for (const s of TM.list) {
    assert.ok(!ids.has(s.id), 'trùng ' + s.id);
    ids.add(s.id);
    assert.ok(s.name && s.desc, s.id);
    assert.ok(TM.groups[s.group], s.id + ' nhóm lạ');
    assert.ok(s.tier === 'free' || s.tier === 'pro', s.id);
    assert.equal(typeof TM.builders[s.id], 'function', s.id + ' thiếu bộ dựng');
  }
  assert.ok(TM.list.filter((s) => s.tier === 'free').length >= 4, 'cần đủ nhạc miễn phí');
  assert.equal(TM.get('khong-co'), null);
});

test('mỗi nền đều có nhạc gợi ý hợp lệ', () => {
  for (const t of TT.list) assert.ok(TM.get(t.music), t.id + ' → ' + t.music);
  assert.equal(TT.get('rain').music, 'rain');
  assert.equal(TT.get('tet').music, 'dantranh');
  assert.equal(TT.get('ocean').music, 'waves');
});

test('tiếng ồn: nằm trong khoảng an toàn, nâu trầm hơn trắng', () => {
  const n = 20000;
  const white = TM.makeNoise('white', n, seeded(1));
  const pink = TM.makeNoise('pink', n, seeded(2));
  const brown = TM.makeNoise('brown', n, seeded(3));
  for (const arr of [white, pink, brown]) {
    let max = 0;
    for (const v of arr) { assert.ok(Number.isFinite(v)); max = Math.max(max, Math.abs(v)); }
    assert.ok(max <= 1.2, 'quá to: ' + max); // không méo tiếng
  }
  // Độ thay đổi giữa 2 mẫu liền nhau: tiếng ồn nâu nhỏ hơn hẳn trắng (nhiều âm trầm)
  const diff = (a) => { let s = 0; for (let i = 1; i < a.length; i++) s += Math.abs(a[i] - a[i - 1]); return s / a.length; };
  assert.ok(diff(brown) < diff(white) / 10);
  assert.ok(diff(pink) < diff(white));
});

test('gảy dây Karplus-Strong: đúng độ dài, tắt dần, không méo', () => {
  const sr = 44100;
  const out = TM.pluck(440, sr, 1, seeded(4));
  assert.equal(out.length, sr);
  const energy = (from, to) => { let s = 0; for (let i = from; i < to; i++) s += out[i] * out[i]; return s; };
  assert.ok(energy(0, 2000) > energy(sr - 2000, sr) * 5, 'phải tắt dần');
  for (const v of out) assert.ok(Math.abs(v) <= 1);
});

test('ký hiệu bản nhạc: đọc đúng nốt, hợp âm, dấu nghỉ và tổng số phách', () => {
  assert.equal(TM.noteToMidi('C4'), 60);
  assert.equal(TM.noteToMidi('A4'), 69);
  assert.equal(TM.noteToMidi('F#2'), 42);
  assert.equal(TM.noteToMidi('Bb3'), 58);
  const s = TM.parseScore('C4:1 | r:.5 E4+G4:2 D5');
  assert.deepEqual(s.events.map((e) => e.notes), [[60], [], [64, 67], [74]]);
  assert.equal(s.beats, 4.5);
  assert.throws(() => TM.parseScore('H4:1'));
  assert.throws(() => TM.parseScore('C4:0'));
});

test('bản cổ điển: mọi bè dài bằng nhau để lặp khớp nhịp, nốt trong tầm đàn piano', () => {
  for (const id of Object.keys(TM.scores)) {
    const sc = TM.scores[id];
    assert.ok(TM.get(id) && TM.get(id).group === 'classic', id + ' chưa có trong danh sách');
    assert.ok(TM.get(id).author, id + ' thiếu tác giả');
    const voices = sc.voices().map((v) => TM.parseScore(v.notes));
    assert.ok(voices.length >= 2, id);
    for (const v of voices) {
      assert.equal(v.beats, voices[0].beats, id + ' lệch phách giữa các bè');
      for (const e of v.events) for (const m of e.notes) assert.ok(m >= 21 && m <= 108, id + ' nốt ngoài tầm ' + m);
    }
    const seconds = voices[0].beats * 60 / sc.bpm;
    assert.ok(seconds >= 25, id + ' quá ngắn, nghe lặp nhiều: ' + seconds);
  }
});

test('giai điệu đi bậc nhỏ, luôn nằm trong thang âm', () => {
  const rand = seeded(5);
  let i = 3;
  for (let k = 0; k < 2000; k++) {
    const next = TM.walk(i, 8, rand);
    assert.ok(next >= 0 && next < 8);
    assert.ok(Math.abs(next - i) <= 2);
    i = next;
  }
  assert.equal(Math.round(TM.midiToFreq(69)), 440);
  assert.equal(Math.round(TM.midiToFreq(60)), 262);
});
