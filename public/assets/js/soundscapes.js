/* ManhTool — Hẹn giờ nhắc việc: nhạc nền tạo trực tiếp bằng Web Audio.
   Không dùng bản ghi âm nào: mọi âm thanh (tiếng ồn, mưa, sóng, đàn tranh, hộp nhạc, lofi…) đều được
   sinh bằng thuật toán ngay trên máy người nghe, nên không vướng bản quyền, file nặng 0 KB, phát mãi không lặp.
   Phần thuần (tạo tiếng ồn, gảy dây Karplus-Strong, đi giai điệu) chạy được trong Node để kiểm thử. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TimerMusic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* tier: 'free' | 'pro' (nhạc Pro chỉ khóa khi bật bán nền) */
  var SOUNDS = [
    { id: 'brown', name: 'Tiếng ồn nâu', desc: 'Trầm và đều, dễ tập trung', group: 'focus', tier: 'free' },
    { id: 'pink', name: 'Tiếng ồn hồng', desc: 'Như tiếng quạt, át tiếng ồn xung quanh', group: 'focus', tier: 'free' },
    { id: 'rain', name: 'Mưa', desc: 'Mưa rả rích', group: 'nature', tier: 'free' },
    { id: 'waves', name: 'Sóng biển', desc: 'Sóng vỗ chậm', group: 'nature', tier: 'free' },
    { id: 'wind', name: 'Gió', desc: 'Gió thổi nhẹ', group: 'nature', tier: 'free' },
    { id: 'fire', name: 'Lửa trại', desc: 'Lửa tí tách', group: 'nature', tier: 'free' },
    { id: 'ambient', name: 'Không gian', desc: 'Hợp âm êm, chậm', group: 'music', tier: 'pro' },
    { id: 'lofi', name: 'Lofi', desc: 'Nhịp chậm, piano điện, tiếng đĩa than', group: 'music', tier: 'pro' },
    { id: 'dantranh', name: 'Đàn tranh', desc: 'Giai điệu ngũ cung', group: 'music', tier: 'pro' },
    { id: 'musicbox', name: 'Hộp nhạc', desc: 'Leng keng, trong trẻo', group: 'music', tier: 'pro' },
    // Tác phẩm cổ điển đã hết thời hạn bảo hộ (tác giả mất trên 100 năm); bản phát là piano tổng hợp của ManhTool, không dùng bản thu âm của ai
    { id: 'bach', name: 'Prelude in C', desc: 'J.S. Bach, 1722', author: 'Johann Sebastian Bach', group: 'classic', tier: 'free' },
    { id: 'furelise', name: 'Für Elise', desc: 'L. v. Beethoven, 1810', author: 'Ludwig van Beethoven', group: 'classic', tier: 'free' },
    { id: 'odetojoy', name: 'Ode to Joy (Hoan ca)', desc: 'L. v. Beethoven, 1824', author: 'Ludwig van Beethoven', group: 'classic', tier: 'free' },
    { id: 'canon', name: 'Canon in D', desc: 'J. Pachelbel, khoảng 1680', author: 'Johann Pachelbel', group: 'classic', tier: 'pro' },
    { id: 'gymnopedie', name: 'Gymnopédie No.1', desc: 'E. Satie, 1888', author: 'Erik Satie', group: 'classic', tier: 'pro' },
    { id: 'greensleeves', name: 'Greensleeves', desc: 'Dân ca Anh, thế kỷ 16', author: 'Dân ca Anh', group: 'classic', tier: 'pro' }
  ];
  var GROUPS = { focus: 'Tập trung', nature: 'Thiên nhiên', music: 'Nhạc không lời', classic: 'Cổ điển nổi tiếng (piano)' };

  /* ---------- Bản nhạc cổ điển viết bằng ký hiệu chữ ----------
     Mỗi nốt: TÊN[+TÊN…]:PHÁCH, vd "C4:1" (Đô 4, một phách), "E4+G4:2" (hợp âm), "r:.5" (nghỉ), "|" chỉ để dễ đọc.
     Mỗi bản có nhiều bè chơi cùng lúc; mọi bè phải dài bằng nhau để lặp lại khớp nhau (có kiểm thử). */
  function rep(s, n) { var out = []; for (var i = 0; i < n; i++) out.push(s); return out.join(' '); }

  // Bach — Prelude in C (BWV 846): mỗi ô nhịp là một hợp âm 5 nốt rải theo cùng một hình
  var BACH_CHORDS = [
    'C4 E4 G4 C5 E5', 'C4 D4 A4 D5 F5', 'B3 D4 G4 D5 F5', 'C4 E4 G4 C5 E5', 'C4 E4 A4 E5 A5', 'C4 D4 F#4 A4 D5',
    'B3 D4 G4 D5 G5', 'B3 C4 E4 G4 C5', 'A3 C4 E4 G4 C5', 'D3 A3 D4 F#4 C5', 'G3 B3 D4 G4 B4', 'G3 Bb3 E4 G4 C#5',
    'F3 A3 D4 A4 D5', 'F3 Ab3 D4 F4 B4', 'E3 G3 C4 G4 C5', 'E3 F3 A3 C4 F4', 'D3 F3 A3 C4 F4', 'G2 D3 G3 B3 F4',
    'C3 E3 G3 C4 E4', 'C3 G3 Bb3 C4 E4', 'F2 F3 A3 C4 E4', 'F#2 C3 A3 C4 Eb4', 'Ab2 F3 B3 C4 D4', 'G2 F3 G3 B3 D4',
    'G2 E3 G3 C4 E4', 'G2 D3 G3 C4 F4', 'G2 D3 G3 B3 F4', 'G2 Eb3 A3 C4 F#4', 'G2 E3 G3 C4 G4', 'G2 D3 G3 C4 F4',
    'G2 D3 G3 B3 F4', 'C2 C3 G3 Bb3 E4'
  ].map(function (s) { return s.split(' '); });
  function bachVoices() {
    var lo = [], mid = [], hi = [];
    BACH_CHORDS.forEach(function (c) {
      var half = 'r:.5 ' + [c[2], c[3], c[4], c[2], c[3], c[4]].join(':.25 ') + ':.25';
      hi.push(half, half);
      mid.push('r:.25 ' + c[1] + ':1.75', 'r:.25 ' + c[1] + ':1.75');
      lo.push(c[0] + ':2', c[0] + ':2');
    });
    lo.push('C2+C3:8'); mid.push('r:.25 E3+G3:7.75'); hi.push('r:.5 C4+E4+G4+C5:7.5');
    return [{ notes: lo.join(' '), vol: 0.9 }, { notes: mid.join(' '), vol: 0.75 }, { notes: hi.join(' '), vol: 0.7 }];
  }

  // Pachelbel — Canon in D: vòng hợp âm 8 bậc lặp lại, giai điệu biến tấu dần
  function canonVoices() {
    var bass = 'D3:2 A2:2 B2:2 F#2:2 G2:2 D2:2 G2:2 A2:2';
    var pad = 'D4+F#4+A4:2 C#4+E4+A4:2 D4+F#4+B4:2 C#4+F#4+A4:2 D4+G4+B4:2 D4+F#4+A4:2 D4+G4+B4:2 C#4+E4+A4:2';
    var arp = ['D5 F#5 A5', 'C#5 E5 A5', 'B4 D5 F#5', 'A4 C#5 F#5', 'B4 D5 G5', 'A4 D5 F#5', 'G4 B4 D5', 'A4 C#5 E5']
      .map(function (c) { var n = c.split(' '); return [n[0], n[1], n[2], n[1]].join(':.5 ') + ':.5'; }).join(' ');
    var v1 = 'F#5:2 E5:2 D5:2 C#5:2 B4:2 A4:2 B4:2 C#5:2';
    var v2 = 'D5:2 C#5:2 B4:2 A4:2 G4:2 F#4:2 G4:2 E4:2';
    var v3 = 'D5 F#5 A5 G5 F#5 D5 F#5 E5 D5 B4 D5 A5 G5 B5 A5 G5'.split(' ').join(':1 ') + ':1';
    var mel = ['r:16', v1, v2, v3, arp, v3, v1].join(' ');
    return [{ notes: rep(bass, 7), vol: 0.85 }, { notes: rep(pad, 7), vol: 0.3 }, { notes: mel, vol: 0.75 }];
  }

  // Satie — Gymnopédie No.1: tay trái bập bềnh hai hợp âm, tay phải hát chậm
  function gymnoVoices() {
    var mel = 'r:12 r:1 F#5:1 A5:1 G5:1 F#5:1 C#5:1 B4:1 C#5:1 D5:1 A4:3 F#4:12 ' +
      'r:1 F#5:1 A5:1 G5:1 F#5:1 C#5:1 B4:1 C#5:1 D5:1 A4:3 C#5:3 F#5:3 E5:6';
    return [{ notes: rep('G2:1 B3+D4+F#4:2 D2:1 A3+C#4+F#4:2', 10), vol: 0.6 }, { notes: mel, vol: 0.75 }];
  }

  var BAR_A = 'E5:.5 D#5:.5 E5:.5 B4:.5 D5:.5 C5:.5';
  var LH_A = 'A2:.5 E3:.5 A3:.5 r:1.5', LH_E = 'E2:.5 E3:.5 G#3:.5 r:1.5';
  var C_ = 'C3+E3+G3', G_ = 'B2+D3+G3';
  var ODE_BARS = [C_, G_, C_, G_, C_, G_, C_, G_ + '|' + C_, G_, G_, G_, C_ + '|' + G_, C_, G_, C_, G_ + '|' + C_];

  var SCORES = {
    bach: { bpm: 66, voices: bachVoices },
    canon: { bpm: 62, voices: canonVoices },
    gymnopedie: { bpm: 70, voices: gymnoVoices },
    // Beethoven — Für Elise (đoạn A quen thuộc); 1 phách = 1 móc đơn
    furelise: {
      bpm: 132,
      voices: function () {
        var a = [BAR_A, 'A4:1 r:.5 C4:.5 E4:.5 A4:.5', 'B4:1 r:.5 E4:.5 G#4:.5 B4:.5', 'C5:1 r:.5 E4:.5 E5:.5 D#5:.5',
          BAR_A, 'A4:1 r:.5 C4:.5 E4:.5 A4:.5', 'B4:1 r:.5 E4:.5 C5:.5 B4:.5'].join(' ');
        var b = ['A4:1 r:.5 B4:.5 C5:.5 D5:.5', 'E5:1.5 G4:.5 F5:.5 E5:.5', 'D5:1.5 F4:.5 E5:.5 D5:.5', 'C5:1.5 E4:.5 D5:.5 C5:.5',
          'B4:1 r:.5 E4:.5 E5:.5 r:.5', 'r:.5 E5:.5 E6:.5 r:.5 r:.5 D#5:.5', 'E5:.5 r:.5 r:.5 D#5:.5 E5:.5 D#5:.5'].join(' ');
        var la = ['r:3', LH_A, LH_E, LH_A, 'r:3', LH_A, LH_E].join(' ');
        var lb = [LH_A, 'C3:.5 G3:.5 C4:.5 r:1.5', 'G2:.5 G3:.5 B3:.5 r:1.5', LH_A, 'E2:.5 E3:.5 E4:.5 r:1.5', 'r:3', 'r:3'].join(' ');
        return [
          { notes: ['E5:.5 D#5:.5', a, b, a, 'A4:2'].join(' '), vol: 0.75 },
          { notes: ['r:1', la, lb, la, 'A2:.5 E3:.5 A3:.5 r:.5'].join(' '), vol: 0.65 }
        ];
      }
    },
    // Beethoven — Ode to Joy (chủ đề chương 4, Giao hưởng số 9)
    odetojoy: {
      bpm: 104,
      voices: function () {
        var mel = 'E5 E5 F5 G5 G5 F5 E5 D5 C5 C5 D5 E5 E5:1.5 D5:.5 D5:2 ' +
          'E5 E5 F5 G5 G5 F5 E5 D5 C5 C5 D5 E5 D5:1.5 C5:.5 C5:2 ' +
          'D5 D5 E5 C5 D5 E5:.5 F5:.5 E5 C5 D5 E5:.5 F5:.5 E5 D5 C5 D5 G4:2 ' +
          'E5 E5 F5 G5 G5 F5 E5 D5 C5 C5 D5 E5 D5:1.5 C5:.5 C5:2';
        var lh = ODE_BARS.map(function (b) {
          var p = b.split('|');
          return p.length > 1 ? p[0] + ':2 ' + p[1] + ':2' : b + ':2 ' + b + ':2';
        }).join(' ');
        return [{ notes: mel, vol: 0.75 }, { notes: lh, vol: 0.45 }];
      }
    },
    // Greensleeves — dân ca Anh thời Phục hưng, nhịp 6/8 (1 phách = 1 móc đơn)
    greensleeves: {
      bpm: 168,
      voices: function () {
        var b1 = 'C5:2 D5:1 E5:1.5 F5:.5 E5:1', b2 = 'D5:2 B4:1 G4:1.5 A4:.5 B4:1', b3 = 'C5:2 A4:1 A4:1.5 G#4:.5 A4:1';
        var b4 = 'B4:2 G#4:1 E4:2 A4:1', b7 = 'C5:1.5 B4:.5 A4:1 G#4:1.5 F#4:.5 G#4:1', r1 = 'G5:3 G5:1.5 F#5:.5 E5:1';
        var mel = ['A4:1', b1, b2, b3, b4, b1, b2, b7, 'A4:3 A4:3', r1, b2, b3, 'B4:2 G#4:1 E4:3', r1, b2, b7, 'A4:3 A4:2'].join(' ');
        var Am = 'A2:3 E3+A3+C4:3', G = 'G2:3 D3+G3+B3:3', E = 'E2:3 B2+E3+G#3:3', C = 'C3:3 E3+G3+C4:3', AE = 'A2:3 B2+E3+G#3:3';
        var lh = ['r:1', Am, G, Am, E, Am, G, AE, Am, C, G, Am, E, C, G, AE, 'A2:3 E3+A3+C4:2'].join(' ');
        return [{ notes: mel, vol: 0.75 }, { notes: lh, vol: 0.5 }];
      }
    }
  };

  var PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function noteToMidi(name) {
    var m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
    if (!m) throw new Error('Nốt không hợp lệ: ' + name);
    return 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  }
  // "C4:1 r:.5 E4+G4:2" → { events: [{ notes: [60], beats: 1 }, …], beats: 3.5 }
  function parseScore(str) {
    var events = [], total = 0;
    String(str).split(/\s+/).forEach(function (tok) {
      if (!tok || tok === '|') return;
      var p = tok.split(':'), d = p.length > 1 ? parseFloat(p[1]) : 1;
      if (!(d > 0)) throw new Error('Độ dài không hợp lệ: ' + tok);
      events.push({ notes: p[0] === 'r' ? [] : p[0].split('+').map(noteToMidi), beats: d });
      total += d;
    });
    return { events: events, beats: Math.round(total * 1000) / 1000 };
  }

  /* ---------- Phần thuần ---------- */

  // Tiếng ồn trắng / hồng (bộ lọc Paul Kellet) / nâu (tích phân tiếng ồn trắng)
  function makeNoise(kind, length, rand) {
    rand = rand || Math.random;
    var out = new Float32Array(length);
    var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (var i = 0; i < length; i++) {
      var w = rand() * 2 - 1;
      if (kind === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        out[i] = last * 3.5;
      } else {
        out[i] = w;
      }
    }
    return out;
  }

  // Gảy dây Karplus–Strong: âm đàn dây (đàn tranh) từ một đoạn tiếng ồn đi qua vòng trễ có lọc
  function pluck(freq, sampleRate, seconds, rand, damping) {
    rand = rand || Math.random;
    damping = damping || 0.996;
    var n = Math.max(2, Math.round(sampleRate / freq));
    var ring = new Float32Array(n);
    for (var i = 0; i < n; i++) ring[i] = rand() * 2 - 1;
    var len = Math.floor(sampleRate * seconds);
    var out = new Float32Array(len);
    for (var j = 0; j < len; j++) {
      var k = j % n;
      out[j] = ring[k];
      ring[k] = damping * 0.5 * (ring[k] + ring[(k + 1) % n]);
    }
    return out;
  }

  // Bước kế tiếp của giai điệu: đi lên/xuống 1–2 bậc trong thang âm, ít nhảy xa cho dễ nghe
  function walk(prev, size, rand) {
    rand = rand || Math.random;
    var steps = [-2, -1, -1, 1, 1, 2, 0];
    var next = prev + steps[Math.floor(rand() * steps.length) % steps.length];
    if (next < 0) next = 1;
    if (next >= size) next = size - 2;
    return Math.max(0, Math.min(size - 1, next));
  }

  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function get(id) {
    for (var i = 0; i < SOUNDS.length; i++) if (SOUNDS[i].id === id) return SOUNDS[i];
    return null;
  }

  /* ---------- Bộ máy phát (chỉ chạy trên trình duyệt) ---------- */
  function Engine() {
    this.ctx = null;
    this.master = null;
    this.wet = null;
    this.cur = null;      // { id, out, stop() }
    this.vol = 0.4;
    this.ducked = false;
    this.buffers = {};
    this.fileEl = null;
  }

  Engine.prototype.attach = function (ctx) {
    if (!ctx || this.ctx === ctx) return;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    // Lọc nhẹ phần cao cho mọi nhạc nền đỡ chói khi nghe lâu
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 9000;
    this.master.connect(this.tone);
    this.tone.connect(ctx.destination);
    // Vang (reverb) dựng bằng xung tiếng ồn tắt dần, dùng chung cho các bản nhạc
    this.wet = ctx.createConvolver();
    this.wet.buffer = this.impulse(1.2);
    var wetGain = ctx.createGain();
    wetGain.gain.value = 0.5;
    this.wet.connect(wetGain);
    wetGain.connect(this.master);
  };

  Engine.prototype.impulse = function (seconds) {
    var ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds);
    var buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var c = 0; c < 2; c++) {
      var d = buf.getChannelData(c);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  };

  Engine.prototype.noise = function (kind) {
    if (!this.buffers[kind]) {
      var ctx = this.ctx, len = ctx.sampleRate * 6;
      var b = ctx.createBuffer(1, len, ctx.sampleRate);
      b.getChannelData(0).set(makeNoise(kind, len));
      // Nối đầu-cuối mượt để vòng lặp không nghe tiếng "tách"
      var d = b.getChannelData(0), fade = 2000;
      for (var i = 0; i < fade; i++) { var t = i / fade; d[len - fade + i] = d[len - fade + i] * (1 - t) + d[i] * t; }
      this.buffers[kind] = b;
    }
    return this.buffers[kind];
  };

  Engine.prototype.level = function () { return this.vol * (this.ducked ? 0.15 : 1); };

  Engine.prototype.fadeTo = function (v, sec) {
    var g = this.master.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(v, t + (sec || 0.8));
  };

  // Phát một bản (id trong SOUNDS hoặc 'file'); đổi bản thì nhỏ dần bản cũ rồi mới bật bản mới
  Engine.prototype.play = function (id, fileUrl) {
    if (!this.ctx) return;
    var key = id === 'file' ? 'file:' + fileUrl : id;
    if (this.cur && this.cur.key === key) { this.fadeTo(this.level(), 0.6); return; }
    this.stopVoice(0.8);
    var out = this.ctx.createGain();
    out.gain.value = 0;
    out.connect(this.master);
    var t = this.ctx.currentTime;
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(1, t + 1.5);
    var voice = id === 'file' ? this.fileVoice(out, fileUrl) : BUILDERS[id] ? BUILDERS[id](this, out) : null;
    if (!voice) return;
    this.cur = { key: key, id: id, out: out, stop: voice.stop };
    this.fadeTo(this.level(), 0.6);
  };

  Engine.prototype.stopVoice = function (sec) {
    var c = this.cur;
    if (!c) return;
    this.cur = null;
    var t = this.ctx.currentTime;
    c.out.gain.cancelScheduledValues(t);
    c.out.gain.setValueAtTime(c.out.gain.value, t);
    c.out.gain.linearRampToValueAtTime(0, t + sec);
    setTimeout(function () { try { c.stop(); c.out.disconnect(); } catch (e) {} }, sec * 1000 + 100);
  };

  Engine.prototype.stop = function () { if (this.ctx) this.stopVoice(1.2); };
  Engine.prototype.playing = function () { return this.cur ? this.cur.id : null; };
  Engine.prototype.setVolume = function (v) { this.vol = Math.max(0, Math.min(1, v)); if (this.cur) this.fadeTo(this.level(), 0.2); };
  // Chuông hết giờ kêu thì nhạc nhỏ lại cho nghe rõ chuông
  Engine.prototype.duck = function (on) { this.ducked = !!on; if (this.cur) this.fadeTo(this.level(), on ? 0.3 : 1.5); };

  Engine.prototype.fileVoice = function (out, url) {
    if (!this.fileEl) {
      this.fileEl = new Audio();
      this.fileEl.loop = true;
      this.fileEl.crossOrigin = 'anonymous';
      this.fileSrc = this.ctx.createMediaElementSource(this.fileEl);
    }
    var el = this.fileEl;
    if (el.src !== url) el.src = url;
    try { this.fileSrc.disconnect(); } catch (e) {}
    this.fileSrc.connect(out);
    var p = el.play();
    if (p && p.catch) p.catch(function () {});
    return { stop: function () { el.pause(); } };
  };

  /* Bộ lập lịch nốt: hẹn trước một khoảng ngắn theo đồng hồ âm thanh (chính xác hơn setTimeout).
     Tab ở nền thì trình duyệt gọi thưa hơn → hẹn trước xa hơn để nhạc không bị hụt. */
  function scheduler(ctx, step) {
    var next = ctx.currentTime + 0.1, stopped = false;
    function tick() {
      if (stopped) return;
      var ahead = (typeof document !== 'undefined' && document.hidden) ? 2 : 0.45;
      while (next < ctx.currentTime + ahead) next += step(next);
    }
    var id = setInterval(tick, 100);
    tick();
    return function () { stopped = true; clearInterval(id); };
  }

  function loopNoise(eng, kind, dest, gain) {
    var ctx = eng.ctx, src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = eng.noise(kind);
    src.loop = true;
    g.gain.value = gain;
    src.connect(g);
    g.connect(dest);
    src.start();
    return { src: src, gain: g };
  }

  function filter(ctx, type, freq, q) {
    var f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q) f.Q.value = q;
    return f;
  }

  // Dao động rất chậm (LFO) điều khiển một tham số, vd tần số lọc của sóng biển
  function lfo(ctx, rate, depth, param) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = rate;
    g.gain.value = depth;
    o.connect(g);
    g.connect(param);
    o.start();
    return o;
  }

  // Một tiếng "lách tách" ngắn (giọt mưa, lửa nổ, tiếng đĩa than)
  function burst(eng, dest, t, dur, ftype, freq, peak) {
    var ctx = eng.ctx, src = ctx.createBufferSource(), f = filter(ctx, ftype, freq, ftype === 'bandpass' ? 6 : 0.7), g = ctx.createGain();
    src.buffer = eng.noise('white');
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t, Math.random() * 5, dur + 0.05);
  }

  function tone(ctx, dest, t, o) {
    var osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.detune) osc.detune.value = o.detune;
    if (o.glide) osc.frequency.exponentialRampToValueAtTime(o.glide, t + (o.glideTime || o.dur));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.vol, t + (o.attack || 0.01));
    g.gain.setTargetAtTime(0.0001, t + (o.attack || 0.01) + (o.hold || 0), o.decay || 0.4);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + (o.attack || 0.01) + (o.hold || 0) + (o.decay || 0.4) * 6);
  }

  function stopAll(list) {
    return function () {
      list.forEach(function (x) {
        try { if (typeof x === 'function') x(); else x.stop(); } catch (e) {}
      });
    };
  }

  /* Piano tổng hợp: vài bồi âm (cơ bản + bát độ + quãng 12) tắt dần, nốt trầm ngân lâu hơn nốt cao.
     Có "pedal": nhả phím vẫn ngân thêm một chút cho liền tiếng như đánh đàn thật. */
  function piano(ctx, dest, t, midi, dur, vel) {
    var f = midiToFreq(midi);
    var ring = Math.max(0.9, 4.2 - (midi - 36) * 0.07); // giây tắt dần tự nhiên
    var end = t + Math.min(dur, ring * 1.6) + 0.35;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.006);
    g.gain.setTargetAtTime(vel * 0.35, t + 0.006, 0.12);   // tiếng búa gõ tắt nhanh
    g.gain.setTargetAtTime(0.0001, t + 0.15, ring / 3);     // phần ngân tắt chậm
    g.gain.setTargetAtTime(0.0001, t + dur + 0.05, 0.12);   // nhả phím
    g.connect(dest);
    [[1, 1, 'triangle'], [2, 0.35, 'sine'], [3, 0.12, 'sine'], [1, 0.4, 'sine']].forEach(function (p, i) {
      var o = ctx.createOscillator();
      o.type = p[2];
      o.frequency.value = f * p[0];
      if (i === 3) o.detune.value = 4; // hơi lệch dây cho ấm tiếng
      var pg = ctx.createGain();
      pg.gain.value = p[1] * 0.5;
      o.connect(pg);
      pg.connect(g);
      o.start(t);
      o.stop(end + 0.6);
    });
  }

  // Phát một bản cổ điển: mỗi bè một bộ lập lịch, cùng mốc thời gian nên luôn khớp nhịp; hết bản nghỉ 2 phách rồi lặp
  function scorePlayer(eng, out, score) {
    var ctx = eng.ctx, beat = 60 / score.bpm;
    var bus = filter(ctx, 'lowpass', 5200);
    bus.connect(out);
    bus.connect(eng.wet);
    var voices = score.voices().map(function (v) { return { vol: v.vol, s: parseScore(v.notes + ' r:2') }; });
    var stops = voices.map(function (v) {
      var i = 0;
      return scheduler(ctx, function (t) {
        var e = v.s.events[i];
        i = (i + 1) % v.s.events.length;
        var dur = e.beats * beat;
        e.notes.forEach(function (m, k) {
          var vel = 0.4 * v.vol * (0.85 + Math.random() * 0.25) / Math.sqrt(e.notes.length);
          piano(ctx, bus, t + k * 0.008 + Math.random() * 0.006, m, dur, vel);
        });
        return dur;
      });
    });
    return { stop: stopAll(stops) };
  }

  var BUILDERS = {
    brown: function (eng, out) {
      var n = loopNoise(eng, 'brown', out, 0.55);
      return { stop: stopAll([n.src]) };
    },
    pink: function (eng, out) {
      var f = filter(eng.ctx, 'lowpass', 5000);
      f.connect(out);
      var n = loopNoise(eng, 'pink', f, 0.4);
      return { stop: stopAll([n.src]) };
    },
    rain: function (eng, out) {
      var ctx = eng.ctx;
      var hp = filter(ctx, 'highpass', 400), lp = filter(ctx, 'lowpass', 6500);
      hp.connect(lp);
      lp.connect(out);
      var bed = loopNoise(eng, 'pink', hp, 0.32);
      // Giọt mưa: tiếng tách ngắn ở cao độ ngẫu nhiên, dày thưa ngẫu nhiên
      var drops = scheduler(ctx, function (t) {
        burst(eng, out, t, 0.02 + Math.random() * 0.03, 'bandpass', 1800 + Math.random() * 3500, 0.03 + Math.random() * 0.09);
        return 0.03 + Math.random() * 0.12;
      });
      return { stop: stopAll([bed.src, drops]) };
    },
    waves: function (eng, out) {
      var ctx = eng.ctx;
      var lp = filter(ctx, 'lowpass', 700), g = ctx.createGain();
      g.gain.value = 0.4;
      lp.connect(g);
      g.connect(out);
      var n = loopNoise(eng, 'brown', lp, 0.9);
      // Một con sóng ~ 12 giây: tần số lọc và âm lượng cùng dâng lên rồi rút xuống
      var o1 = lfo(ctx, 0.08, 500, lp.frequency);
      var o2 = lfo(ctx, 0.08, 0.28, g.gain);
      // Bọt sóng: tiếng xì nhẹ ở phần cao
      var foamF = filter(ctx, 'highpass', 2500), foamG = ctx.createGain();
      foamG.gain.value = 0.03;
      foamF.connect(foamG);
      foamG.connect(out);
      var foam = loopNoise(eng, 'pink', foamF, 1);
      var o3 = lfo(ctx, 0.08, 0.025, foamG.gain);
      return { stop: stopAll([n.src, foam.src, o1, o2, o3]) };
    },
    wind: function (eng, out) {
      var ctx = eng.ctx;
      var bp = filter(ctx, 'bandpass', 520, 0.8), g = ctx.createGain();
      g.gain.value = 0.35;
      bp.connect(g);
      g.connect(out);
      var n = loopNoise(eng, 'white', bp, 0.6);
      var o1 = lfo(ctx, 0.045, 280, bp.frequency);
      var o2 = lfo(ctx, 0.07, 0.18, g.gain);
      return { stop: stopAll([n.src, o1, o2]) };
    },
    fire: function (eng, out) {
      var ctx = eng.ctx;
      var lp = filter(ctx, 'lowpass', 450);
      lp.connect(out);
      var bed = loopNoise(eng, 'brown', lp, 0.6);
      var crackle = scheduler(ctx, function (t) {
        var n = Math.random() < 0.25 ? 3 : 1;
        for (var i = 0; i < n; i++) burst(eng, out, t + i * 0.02, 0.006 + Math.random() * 0.01, 'highpass', 1500 + Math.random() * 2500, 0.05 + Math.random() * 0.25);
        return 0.05 + Math.random() * 0.35;
      });
      return { stop: stopAll([bed.src, crackle]) };
    },

    // Hợp âm êm chậm + vài nốt lấp lánh, nhiều vang
    ambient: function (eng, out) {
      var ctx = eng.ctx;
      var lp = filter(ctx, 'lowpass', 1400);
      lp.connect(out);
      lp.connect(eng.wet);
      var chords = [[48, 55, 64, 71], [45, 52, 60, 67], [41, 48, 57, 64], [43, 50, 59, 62]];
      var ci = 0;
      var pad = scheduler(ctx, function (t) {
        chords[ci % chords.length].forEach(function (m, i) {
          var f = midiToFreq(m);
          tone(ctx, lp, t + i * 0.12, { freq: f, vol: 0.05, attack: 2.4, hold: 4.5, decay: 1.6 });
          tone(ctx, lp, t + i * 0.12, { freq: f, vol: 0.03, type: 'triangle', detune: 6, attack: 2.4, hold: 4.5, decay: 1.6 });
        });
        ci++;
        return 7.5;
      });
      var scale = [72, 74, 76, 79, 81, 84], si = 2;
      var sparkle = scheduler(ctx, function (t) {
        si = walk(si, scale.length);
        if (Math.random() < 0.6) tone(ctx, eng.wet, t, { freq: midiToFreq(scale[si]), vol: 0.035, attack: 0.02, decay: 0.9 });
        return 1.8 + Math.random() * 2.5;
      });
      return { stop: stopAll([pad, sparkle]) };
    },

    // Lofi 72 BPM: piano điện, trống nhẹ, hi-hat lắc nhịp, tiếng đĩa than
    lofi: function (eng, out) {
      var ctx = eng.ctx;
      var warm = filter(ctx, 'lowpass', 3200);
      warm.connect(out);
      var beat = 60 / 72, eighth = beat / 2, step = 0;
      var chords = [[60, 64, 67, 71], [57, 60, 64, 67], [62, 65, 69, 72], [55, 59, 62, 65]];
      var keys = filter(ctx, 'lowpass', 1800);
      keys.connect(warm);
      keys.connect(eng.wet);
      var drums = scheduler(ctx, function (t) {
        var s = step % 8, bar = Math.floor(step / 8);
        var swing = s % 2 ? eighth * 0.16 : 0;
        var tt = t + swing;
        // piano điện: hợp âm phách 1 và nhắc lại nhẹ ở phách "và 2"
        if (s === 0 || s === 3) {
          chords[bar % chords.length].forEach(function (m, i) {
            var f = midiToFreq(m);
            tone(ctx, keys, tt + i * 0.015, { freq: f, vol: s === 0 ? 0.05 : 0.03, attack: 0.008, decay: 0.9 });
            tone(ctx, keys, tt + i * 0.015, { freq: f * 2, vol: 0.008, attack: 0.005, decay: 0.3 });
          });
        }
        // trống cái phách 1 và 3 (thỉnh thoảng thêm "và 3")
        if (s === 0 || s === 4 || (s === 5 && Math.random() < 0.3)) {
          tone(ctx, warm, tt, { freq: 110, glide: 42, glideTime: 0.12, vol: 0.42, attack: 0.004, decay: 0.12 });
        }
        // trống con nhẹ phách 2 và 4
        if (s === 2 || s === 6) burst(eng, warm, tt, 0.14, 'bandpass', 1700, 0.09);
        // hi-hat mọi móc đơn
        burst(eng, warm, tt, 0.03, 'highpass', 7500, s % 2 ? 0.02 : 0.035);
        step++;
        return eighth;
      });
      var vinylF = filter(ctx, 'highpass', 1200);
      vinylF.connect(out);
      var vinyl = loopNoise(eng, 'pink', vinylF, 0.012);
      var crackle = scheduler(ctx, function (t) {
        burst(eng, out, t, 0.004, 'highpass', 3000, 0.02 + Math.random() * 0.05);
        return 0.15 + Math.random() * 0.6;
      });
      return { stop: stopAll([drums, vinyl.src, crackle]) };
    },

    // Đàn tranh: gảy dây Karplus–Strong trên thang ngũ cung, có luyến (nhấn) như tiếng đàn Việt
    dantranh: function (eng, out) {
      var ctx = eng.ctx;
      var notes = [60, 62, 65, 67, 69, 72, 74, 77, 79, 81];
      var bufs = notes.map(function (m) {
        var b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2.6), ctx.sampleRate);
        b.getChannelData(0).set(pluck(midiToFreq(m), ctx.sampleRate, 2.6));
        return b;
      });
      var bass = [48, 55].map(function (m) {
        var b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 3.5), ctx.sampleRate);
        b.getChannelData(0).set(pluck(midiToFreq(m), ctx.sampleRate, 3.5, null, 0.998));
        return b;
      });
      var bus = filter(ctx, 'lowpass', 4200);
      bus.connect(out);
      bus.connect(eng.wet);
      function play(buf, t, vol, bend) {
        var src = ctx.createBufferSource(), g = ctx.createGain();
        src.buffer = buf;
        g.gain.value = vol;
        if (bend) {
          // nhấn: kéo cao giọng lên rồi trả về, đặc trưng đàn tranh
          src.playbackRate.setValueAtTime(1, t);
          src.playbackRate.linearRampToValueAtTime(1.06, t + 0.18);
          src.playbackRate.linearRampToValueAtTime(1, t + 0.42);
        }
        src.connect(g);
        g.connect(bus);
        src.start(t);
      }
      var beat = 60 / 66, idx = 4, left = 0, bassStep = 0;
      var melody = scheduler(ctx, function (t) {
        if (left <= 0) { left = 6 + Math.floor(Math.random() * 6); return beat * (1.5 + Math.random() * 2); } // nghỉ giữa câu
        idx = walk(idx, notes.length);
        play(bufs[idx], t, 0.5, Math.random() < 0.22);
        if (Math.random() < 0.18 && idx + 2 < notes.length) play(bufs[idx + 2], t + beat * 0.25, 0.3, false); // láy
        left--;
        var d = [0.5, 0.5, 1, 1, 1.5][Math.floor(Math.random() * 5)];
        return beat * d;
      });
      var drone = scheduler(ctx, function (t) {
        play(bass[bassStep++ % 2], t, 0.35, false);
        return beat * 4;
      });
      return { stop: stopAll([melody, drone]) };
    },

    // Hộp nhạc: tiếng chuông nhỏ (vài bồi âm tắt nhanh) trên ngũ cung trưởng
    musicbox: function (eng, out) {
      var ctx = eng.ctx;
      var bus = ctx.createGain();
      bus.gain.value = 1;
      bus.connect(out);
      bus.connect(eng.wet);
      var scale = [72, 74, 76, 79, 81, 84, 86, 88];
      function bell(m, t, vol) {
        var f = midiToFreq(m);
        tone(ctx, bus, t, { freq: f, vol: vol, attack: 0.003, decay: 0.45 });
        tone(ctx, bus, t, { freq: f * 2, vol: vol * 0.3, attack: 0.002, decay: 0.2 });
        tone(ctx, bus, t, { freq: f * 3.01, vol: vol * 0.12, attack: 0.002, decay: 0.12 });
      }
      var beat = 60 / 96, i = 2, step = 0;
      var tune = scheduler(ctx, function (t) {
        if (step % 16 === 15 && Math.random() < 0.6) { step++; return beat; } // ngắt câu
        i = walk(i, scale.length);
        bell(scale[i], t, 0.06);
        if (step % 4 === 0) bell(step % 8 === 0 ? 60 : 67, t, 0.035); // nốt trầm nhịp 1
        step++;
        return beat * (Math.random() < 0.2 ? 1 : 0.5);
      });
      return { stop: stopAll([tune]) };
    }
  };
  Object.keys(SCORES).forEach(function (id) {
    BUILDERS[id] = function (eng, out) { return scorePlayer(eng, out, SCORES[id]); };
  });

  return {
    list: SOUNDS, groups: GROUPS, get: get, scores: SCORES, parseScore: parseScore, noteToMidi: noteToMidi,
    makeNoise: makeNoise, pluck: pluck, walk: walk, midiToFreq: midiToFreq,
    createEngine: function () { return new Engine(); },
    builders: BUILDERS
  };
});
