const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const TT = require('../public/assets/js/themes.js');

test('mỗi nền có id riêng, tên, hạng hợp lệ và đủ màu cơ bản', () => {
  const ids = new Set();
  for (const t of TT.list) {
    assert.ok(/^[a-z0-9-]+$/.test(t.id), t.id);
    assert.ok(!ids.has(t.id), 'trùng id ' + t.id);
    ids.add(t.id);
    assert.ok(t.name);
    assert.ok(t.tier === 'free' || t.tier === 'pro', t.id);
    for (const k of ['bg', 'text', 'sub', 'accent', 'track']) assert.ok(t.vars[k], t.id + ' thiếu ' + k);
    if (t.font) assert.ok(TT.fonts[t.font], t.id + ' dùng phông không có: ' + t.font);
  }
  assert.ok(TT.list.some(t => t.tier === 'free'));
});

test('có đủ nhóm nền: miễn phí, Pro, theo mùa; nền ảnh riêng nằm cuối', () => {
  assert.ok(TT.list.length >= 60);
  assert.ok(TT.list.filter((t) => t.tier === 'free').length >= 11);
  const season = TT.list.filter((t) => t.season);
  assert.ok(season.length >= 27);
  for (const id of ['tet', 'trungthu', 'christmas', 'women83', 'women2010', 'nhagiao', 'quockhanh', 'valentine']) {
    assert.ok(season.some((t) => t.id === id), 'thiếu nền ' + id);
  }
  for (const t of season) {
    assert.equal(t.tier, 'pro', t.id);
    assert.ok(t.occasion && t.occasion.label, t.id + ' thiếu nhãn ngày');
    if (t.occasion.m) assert.ok(t.occasion.m >= 1 && t.occasion.m <= 12 && t.occasion.d >= 1 && t.occasion.d <= 31, t.id);
  }
  assert.equal(TT.list[TT.list.length - 1].id, 'photo');
  assert.match(TT.fontsUrl(), /Bebas\+Neue/);
});

test('mọi hiệu ứng (fx) mà nền dùng đều có CSS trong stage.css, mọi nền đều có nhạc gợi ý', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'css', 'stage.css'), 'utf8');
  for (const t of TT.list) {
    if (t.fx && !t.photo) assert.ok(css.includes('[data-fx="' + t.fx + '"]'), t.id + ': thiếu CSS cho fx ' + t.fx);
    assert.ok(t.music, t.id + ' thiếu nhạc');
  }
  const songs = new Set(require('../public/assets/js/soundscapes.js').list.map((s) => s.id));
  for (const t of TT.list) assert.ok(songs.has(t.music), t.id + ': nhạc không tồn tại ' + t.music);
});

test('bộ nền mới: có cả nền miễn phí, Pro và ngày lễ', () => {
  const fresh = TT.list.filter((t) => t.fresh);
  assert.ok(fresh.length >= 20);
  assert.ok(fresh.some((t) => t.tier === 'free'));
  assert.ok(fresh.some((t) => t.tier === 'pro' && !t.season));
  assert.ok(fresh.some((t) => t.season));
});

test('daysUntil: đếm tới ngày lễ dương lịch gần nhất, qua rồi thì sang năm sau', () => {
  const now = new Date(2026, 9, 17, 15, 0); // 17/10/2026
  assert.equal(TT.daysUntil(TT.get('women2010'), now), 3);
  assert.equal(TT.daysUntil(TT.get('nhagiao'), now), 34);
  assert.equal(TT.daysUntil(TT.get('women83'), now), 142); // 8/3/2027
  assert.equal(TT.daysUntil(TT.get('women83'), new Date(2027, 2, 8, 23, 0)), 0);
  assert.equal(TT.daysUntil(TT.get('tet'), now), null); // âm lịch
  assert.equal(TT.daysUntil(TT.get('forest'), now), null);
});

test('get trả về nền mặc định khi id lạ', () => {
  assert.equal(TT.get('neon').id, 'neon');
  assert.equal(TT.get('khong-co').id, TT.list[0].id);
});

test('cssVars ghép giá trị mặc định', () => {
  const v = TT.cssVars(TT.get('light'));
  assert.equal(v['--st-text'], '#0f2620');
  assert.equal(v['--st-glow'], 'none');
  assert.equal(v['--st-font'], 'var(--font)');
  assert.match(TT.cssVars(TT.get('neon'))['--st-font'], /Orbitron/);
});

test('khóa nền Pro chỉ khi bật lockPremium và chưa sở hữu', () => {
  const pro = TT.list.find(t => t.tier === 'pro');
  const free = TT.list.find(t => t.tier === 'free');
  assert.equal(TT.isLocked(pro), false);
  TT.lockPremium = true;
  try {
    assert.equal(TT.isLocked(pro), true);
    assert.equal(TT.isLocked(free), false);
    TT.owned.push(pro.id);
    assert.equal(TT.isLocked(pro), false);
  } finally {
    TT.lockPremium = false;
    TT.owned.length = 0;
  }
});

test('fontsUrl chỉ xin ký tự số', () => {
  const url = TT.fontsUrl();
  assert.match(url, /^https:\/\/fonts\.googleapis\.com\/css2\?/);
  assert.match(url, /text=0123456789%3A/);
});
