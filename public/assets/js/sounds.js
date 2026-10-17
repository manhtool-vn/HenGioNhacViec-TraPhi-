/* ManhTool — Hẹn giờ nhắc việc: các kiểu chuông, tạo bằng Web Audio (không cần file âm thanh) */
(function (root) {
  'use strict';

  function tone(ctx, dest, t, o) {
    var osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.glide) osc.frequency.exponentialRampToValueAtTime(o.glide, t + o.dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.3, t + (o.attack || 0.015));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
  }

  // every: khoảng cách giữa 2 lần lặp khi chuông kêu liên tục (ms)
  var SOUNDS = {
    bell: {
      name: 'Chuông', every: 1600,
      play: function (ctx, d, t) {
        tone(ctx, d, t, { freq: 880, dur: 0.2, vol: 0.32 });
        tone(ctx, d, t + 0.24, { freq: 880, dur: 0.2, vol: 0.32 });
        tone(ctx, d, t + 0.48, { freq: 1175, dur: 0.4, vol: 0.34 });
        tone(ctx, d, t + 0.48, { freq: 2350, dur: 0.25, vol: 0.06 });
      }
    },
    digital: {
      name: 'Tít tít', every: 1100,
      play: function (ctx, d, t) {
        for (var i = 0; i < 4; i++) tone(ctx, d, t + i * 0.14, { freq: 1000, dur: 0.08, vol: 0.12, type: 'square', attack: 0.004 });
      }
    },
    soft: {
      name: 'Nhẹ nhàng', every: 2400,
      play: function (ctx, d, t) {
        tone(ctx, d, t, { freq: 523.25, dur: 1.4, vol: 0.18, attack: 0.06 });
        tone(ctx, d, t + 0.14, { freq: 659.25, dur: 1.3, vol: 0.16, attack: 0.06 });
        tone(ctx, d, t + 0.28, { freq: 783.99, dur: 1.4, vol: 0.15, attack: 0.06 });
      }
    },
    gong: {
      name: 'Cồng', every: 4200,
      play: function (ctx, d, t) {
        // Các bồi âm lệch nhau một chút cho ra tiếng kim loại
        tone(ctx, d, t, { freq: 98, dur: 3.8, vol: 0.32, attack: 0.008 });
        tone(ctx, d, t, { freq: 197.5, dur: 3.2, vol: 0.16, attack: 0.008 });
        tone(ctx, d, t, { freq: 291, dur: 2.6, vol: 0.1, attack: 0.008 });
        tone(ctx, d, t, { freq: 413, dur: 1.8, vol: 0.06, attack: 0.008 });
        tone(ctx, d, t, { freq: 590, dur: 1.2, vol: 0.03, attack: 0.008 });
      }
    },
    ping: {
      name: 'Báo trước', every: 0,
      play: function (ctx, d, t) {
        tone(ctx, d, t, { freq: 1320, dur: 0.3, vol: 0.16 });
        tone(ctx, d, t + 0.18, { freq: 1760, dur: 0.35, vol: 0.12 });
      }
    }
  };

  root.TimerSounds = {
    // Các kiểu cho người dùng chọn (không gồm tiếng báo trước)
    choices: ['bell', 'digital', 'soft', 'gong'].map(function (id) { return { id: id, name: SOUNDS[id].name }; }),
    has: function (id) { return Object.prototype.hasOwnProperty.call(SOUNDS, id); },
    every: function (id) { return (SOUNDS[id] || SOUNDS.bell).every; },
    play: function (ctx, id, volume) {
      if (!ctx) return;
      var master = ctx.createGain();
      master.gain.value = Math.max(0, Math.min(1, volume));
      master.connect(ctx.destination);
      (SOUNDS[id] || SOUNDS.bell).play(ctx, master, ctx.currentTime + 0.03);
    }
  };
})(typeof self !== 'undefined' ? self : this);
