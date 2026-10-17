/* ManhTool — Hẹn giờ nhắc việc: bộ nền cho chế độ toàn màn hình.
   Mỗi nền chỉ là dữ liệu (màu, nền, phông, hiệu ứng). Thêm nền mới = thêm 1 phần tử vào THEMES,
   hiệu ứng động (fx) khai báo trong assets/css/stage.css. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TimerThemes = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Phông chữ riêng cho phần số. Chỉ tải các ký tự số (tham số text) nên rất nhẹ.
  var FONTS = {
    orbitron: { family: '"Orbitron", sans-serif', google: 'Orbitron:wght@700' },
    playfair: { family: '"Playfair Display", Georgia, serif', google: 'Playfair+Display:wght@700' },
    caveat: { family: '"Caveat", cursive', google: 'Caveat:wght@700' },
    mono: { family: '"JetBrains Mono", ui-monospace, Consolas, monospace', google: 'JetBrains+Mono:wght@700' },
    bebas: { family: '"Bebas Neue", Impact, sans-serif', google: 'Bebas+Neue' },
    dot: { family: '"DotGothic16", ui-monospace, monospace', google: 'DotGothic16' }
  };

  /* tier: 'free' | 'pro'. Nền Pro hiện vẫn cho dùng, chỉ gắn nhãn.
     Khi bắt đầu bán: đặt api.lockPremium = true và nối isOwned() với hệ thống giấy phép. */
  var THEMES = [
    {
      id: 'forest', name: 'Rừng xanh', tier: 'free', fx: 'glow',
      vars: {
        bg: 'radial-gradient(1100px 700px at 85% -10%, rgba(196,228,58,.22), transparent 60%), radial-gradient(900px 600px at 0% 110%, rgba(18,184,134,.32), transparent 60%), linear-gradient(160deg, #0f2a21, #07120e)',
        text: '#f2fbf6', sub: 'rgba(242,251,246,.62)', accent: '#c4e43a', accent2: '#12b886', track: 'rgba(255,255,255,.09)'
      }
    },
    {
      id: 'light', name: 'Trắng tối giản', tier: 'free', fx: null,
      vars: {
        bg: 'linear-gradient(180deg, #fbfcfb, #edf2ef)',
        text: '#0f2620', sub: '#5b6b65', accent: '#12b886', accent2: '#0e7c5a', track: 'rgba(15,38,32,.08)', warn: '#e8590c'
      }
    },
    {
      id: 'midnight', name: 'Nửa đêm', tier: 'free', fx: null,
      vars: {
        bg: 'radial-gradient(1000px 520px at 50% -12%, #26346a 0%, transparent 70%), linear-gradient(180deg, #0b1020, #04060d)',
        text: '#e8edff', sub: 'rgba(232,237,255,.58)', accent: '#7aa2ff', accent2: '#b18cff', track: 'rgba(255,255,255,.08)'
      }
    },
    {
      id: 'paper', name: 'Giấy cũ', tier: 'free', fx: 'grain', font: 'playfair',
      vars: {
        bg: 'radial-gradient(circle at 25% 20%, rgba(255,255,255,.55), transparent 45%), linear-gradient(180deg, #f4ecdc, #e6d7bb)',
        text: '#3a2e22', sub: '#7a6a55', accent: '#b5562b', accent2: '#d9883f', track: 'rgba(58,46,34,.1)', warn: '#b42318'
      }
    },
    {
      id: 'sunset', name: 'Hoàng hôn', tier: 'pro', fx: 'shift',
      vars: {
        bg: 'linear-gradient(200deg, #ffc27a 0%, #ff7a5c 28%, #d1477a 55%, #5b2a86 80%, #241446 100%)',
        bgSize: '100% 260%',
        text: '#fff8f1', sub: 'rgba(255,248,241,.78)', accent: '#fff1c1', accent2: '#ffd27a', track: 'rgba(255,255,255,.2)',
        glow: '0 6px 40px rgba(60,10,40,.35)', warn: '#fff1c1'
      }
    },
    {
      id: 'aurora', name: 'Cực quang', tier: 'pro', fx: 'aurora',
      vars: {
        bg: 'linear-gradient(180deg, #020b14, #06141f 60%, #0a1d22)',
        text: '#eafff7', sub: 'rgba(234,255,247,.6)', accent: '#5cf2b0', accent2: '#9b7bff', track: 'rgba(255,255,255,.08)',
        glow: '0 0 50px rgba(92,242,176,.3)'
      }
    },
    {
      id: 'ocean', name: 'Đại dương', tier: 'pro', fx: 'waves',
      vars: {
        bg: 'linear-gradient(180deg, #082c4d 0%, #0a5d8c 55%, #0b86ab 100%)',
        text: '#f0fbff', sub: 'rgba(240,251,255,.7)', accent: '#7ff0ff', accent2: '#38bdf8', track: 'rgba(255,255,255,.14)',
        glow: '0 4px 30px rgba(0,30,60,.35)'
      }
    },
    {
      id: 'neon', name: 'Neon', tier: 'pro', fx: 'grid', font: 'orbitron',
      vars: {
        bg: 'radial-gradient(900px 400px at 50% 62%, rgba(255,61,242,.22), transparent 70%), linear-gradient(180deg, #07020f, #12021f)',
        text: '#fdf4ff', sub: 'rgba(253,244,255,.65)', accent: '#ff3df2', accent2: '#2de2ff', track: 'rgba(255,255,255,.08)',
        glow: '0 0 10px #ff3df2, 0 0 40px rgba(255,61,242,.55)', warn: '#ffe14d'
      }
    },
    {
      id: 'starry', name: 'Trời sao', tier: 'pro', fx: 'stars',
      vars: {
        bg: 'radial-gradient(ellipse at 50% 125%, #2f2868 0%, #0f0c2b 50%, #04030d 100%)',
        text: '#fffaf0', sub: 'rgba(255,250,240,.62)', accent: '#ffe9a8', accent2: '#a9b8ff', track: 'rgba(255,255,255,.08)',
        glow: '0 0 40px rgba(255,233,168,.25)'
      }
    },
    {
      id: 'sakura', name: 'Hoa anh đào', tier: 'pro', fx: 'petals',
      vars: {
        bg: 'radial-gradient(800px 500px at 80% 0%, rgba(255,255,255,.7), transparent 60%), linear-gradient(170deg, #fff1f4 0%, #ffd9e2 55%, #f6bfd0 100%)',
        text: '#5a2236', sub: '#a0607a', accent: '#ff6f9c', accent2: '#ffa3be', track: 'rgba(90,34,54,.1)', warn: '#d6336c'
      }
    },
    {
      id: 'chalk', name: 'Bảng phấn', tier: 'pro', fx: 'chalk', font: 'caveat',
      vars: {
        bg: 'radial-gradient(ellipse at center, #34503f 0%, #22382c 70%, #17261e 100%)',
        text: '#f4f1e8', sub: 'rgba(244,241,232,.65)', accent: '#f4f1e8', accent2: '#ffd166', track: 'rgba(255,255,255,.12)',
        glow: '0 0 2px rgba(255,255,255,.5)', warn: '#ffd166'
      }
    },
    {
      id: 'terminal', name: 'Terminal', tier: 'pro', fx: 'scan', font: 'mono',
      vars: {
        bg: 'radial-gradient(ellipse at center, #062a0f 0%, #020a03 75%)',
        text: '#7dff9b', sub: 'rgba(125,255,155,.6)', accent: '#39ff7a', accent2: '#39ff7a', track: 'rgba(57,255,122,.12)',
        glow: '0 0 8px rgba(57,255,122,.6)', warn: '#ffd23f'
      }
    },
    /* --- Bộ nền bổ sung --- */
    {
      id: 'graphite', name: 'Than chì', tier: 'free', fx: null, font: 'bebas',
      vars: {
        bg: 'linear-gradient(180deg, #1b1d21, #0e0f12)',
        text: '#f1f3f5', sub: 'rgba(241,243,245,.55)', accent: '#ced4da', accent2: '#868e96', track: 'rgba(255,255,255,.08)'
      }
    },
    {
      id: 'pastel', name: 'Pastel', tier: 'free', fx: 'glow',
      vars: {
        bg: 'radial-gradient(900px 600px at 10% 0%, #ffe3ec, transparent 60%), radial-gradient(900px 600px at 100% 100%, #d0ebff, transparent 60%), linear-gradient(135deg, #fff5f8, #eef6ff)',
        text: '#3b3355', sub: '#7c7396', accent: '#9775fa', accent2: '#f783ac', track: 'rgba(59,51,85,.1)', warn: '#e8590c'
      }
    },
    {
      id: 'coffee', name: 'Cà phê sáng', tier: 'free', fx: 'grain', font: 'playfair',
      vars: {
        bg: 'radial-gradient(circle at 70% 20%, rgba(255,214,165,.35), transparent 50%), linear-gradient(160deg, #5a3a28, #2a1a12)',
        text: '#fff4e6', sub: 'rgba(255,244,230,.7)', accent: '#ffc078', accent2: '#e8a87c', track: 'rgba(255,255,255,.12)', warn: '#ffd8a8'
      }
    },
    {
      id: 'rain', name: 'Mưa đêm', tier: 'pro', fx: 'rain',
      vars: {
        bg: 'radial-gradient(800px 500px at 50% 0%, rgba(90,140,200,.25), transparent 70%), linear-gradient(180deg, #0d1726, #070b13)',
        text: '#e7f0ff', sub: 'rgba(231,240,255,.6)', accent: '#74c0fc', accent2: '#4dabf7', track: 'rgba(255,255,255,.08)',
        glow: '0 2px 30px rgba(116,192,252,.25)'
      }
    },
    {
      id: 'snow', name: 'Tuyết rơi', tier: 'pro', fx: 'snow',
      vars: {
        bg: 'linear-gradient(180deg, #1c3550 0%, #2f5878 60%, #8fb3cc 100%)',
        text: '#ffffff', sub: 'rgba(255,255,255,.78)', accent: '#e7f5ff', accent2: '#a5d8ff', track: 'rgba(255,255,255,.18)',
        glow: '0 2px 24px rgba(10,30,50,.45)', warn: '#ffe066'
      }
    },
    {
      id: 'synthwave', name: 'Retro 80', tier: 'pro', fx: 'synth', font: 'bebas',
      vars: {
        bg: 'linear-gradient(180deg, #0d0221 0%, #261447 48%, #2e0f4f 52%, #0d0221 100%)',
        text: '#ffe5f7', sub: 'rgba(255,229,247,.72)', accent: '#ff6ad5', accent2: '#ffb86b', track: 'rgba(255,255,255,.12)',
        glow: '0 0 18px rgba(255,106,213,.7)', warn: '#fff36b'
      }
    },
    {
      id: 'bokeh', name: 'Ánh đèn', tier: 'pro', fx: 'bokeh',
      vars: {
        bg: 'radial-gradient(ellipse at 50% 120%, #3b1f0e, #120a06 70%)',
        text: '#fff6e5', sub: 'rgba(255,246,229,.68)', accent: '#ffd43b', accent2: '#ff922b', track: 'rgba(255,255,255,.1)',
        glow: '0 0 30px rgba(255,180,60,.35)'
      }
    },
    {
      id: 'lofi', name: 'Lofi', tier: 'pro', fx: 'glow',
      vars: {
        bg: 'linear-gradient(160deg, #2b1f44 0%, #4b2c5e 50%, #c06c84 100%)',
        text: '#fdf0f5', sub: 'rgba(253,240,245,.72)', accent: '#ffd6e7', accent2: '#f8a5c2', track: 'rgba(255,255,255,.15)',
        glow: '0 4px 30px rgba(43,31,68,.45)', warn: '#ffe066'
      }
    },
    {
      id: 'scoreboard', name: 'Bảng điện', tier: 'pro', fx: 'led', font: 'dot',
      vars: {
        bg: 'radial-gradient(ellipse at center, #1a1a1a, #050505 80%)',
        text: '#ffb000', sub: 'rgba(255,176,0,.62)', accent: '#ffb000', accent2: '#ff6a00', track: 'rgba(255,176,0,.12)',
        glow: '0 0 6px #ffb000, 0 0 24px rgba(255,140,0,.6)', warn: '#ff3b30'
      }
    },
    {
      id: 'tet', name: 'Tết Nguyên đán', tier: 'pro', fx: 'mai', font: 'playfair', season: true, occasion: { label: 'Mùng 1 Tết âm lịch', lunar: true },
      vars: {
        bg: 'radial-gradient(900px 500px at 50% 0%, rgba(255,214,102,.25), transparent 70%), linear-gradient(170deg, #b3121f 0%, #7a0a14 100%)',
        text: '#ffe8a3', sub: 'rgba(255,232,163,.82)', accent: '#ffd166', accent2: '#ffb703', track: 'rgba(255,255,255,.15)',
        glow: '0 2px 20px rgba(80,0,0,.45)', warn: '#ffffff'
      }
    },
    {
      id: 'trungthu', name: 'Trung thu', tier: 'pro', fx: 'lantern', season: true, occasion: { label: '15/8 âm lịch', lunar: true },
      vars: {
        bg: 'linear-gradient(180deg, #0b1a3a 0%, #132a55 70%, #1d3b6b 100%)',
        text: '#fff4d6', sub: 'rgba(255,244,214,.72)', accent: '#ffc947', accent2: '#ff7b39', track: 'rgba(255,255,255,.12)',
        glow: '0 0 30px rgba(255,201,71,.25)'
      }
    },
    {
      id: 'christmas', name: 'Giáng sinh', tier: 'pro', fx: 'snow', season: true, occasion: { label: '24–25/12', m: 12, d: 25 },
      vars: {
        bg: 'radial-gradient(800px 500px at 50% 110%, rgba(255,255,255,.12), transparent 70%), linear-gradient(180deg, #0f3d2e 0%, #0a2a20 100%)',
        text: '#ffffff', sub: 'rgba(255,255,255,.72)', accent: '#ff6b6b', accent2: '#ffd43b', track: 'rgba(255,255,255,.14)',
        glow: '0 2px 20px rgba(0,0,0,.35)'
      }
    },
    /* --- Ngày lễ & dịp đặc biệt trong năm (season: true, occasion: ngày diễn ra) ---
       occasion.m / d: ngày dương lịch để xếp "sắp tới"; lunar: ngày âm lịch (chỉ hiện nhãn). */
    {
      id: 'newyear', name: 'Năm mới', tier: 'pro', fx: 'fireworks', font: 'bebas', season: true, occasion: { label: '1/1', m: 1, d: 1 },
      vars: {
        bg: 'radial-gradient(ellipse at 50% 120%, #1b2a5c, #070a1c 70%)',
        text: '#ffffff', sub: 'rgba(255,255,255,.7)', accent: '#ffd166', accent2: '#ef476f', track: 'rgba(255,255,255,.12)',
        glow: '0 0 30px rgba(255,209,102,.35)'
      }
    },
    {
      id: 'valentine', name: 'Valentine', tier: 'pro', fx: 'hearts', font: 'playfair', season: true, occasion: { label: '14/2', m: 2, d: 14 },
      vars: {
        bg: 'radial-gradient(800px 500px at 50% 0%, rgba(255,255,255,.18), transparent 70%), linear-gradient(160deg, #ff5c8a, #c9184a 60%, #800f2f)',
        text: '#fff0f3', sub: 'rgba(255,240,243,.82)', accent: '#ffccd5', accent2: '#ff8fa3', track: 'rgba(255,255,255,.2)',
        glow: '0 2px 24px rgba(128,15,47,.5)', warn: '#fff3b0'
      }
    },
    {
      id: 'thaythuoc', name: 'Thầy thuốc Việt Nam', tier: 'pro', fx: 'pulse', season: true, occasion: { label: '27/2', m: 2, d: 27 },
      vars: {
        bg: 'radial-gradient(900px 500px at 50% 0%, #ffffff, transparent 70%), linear-gradient(180deg, #e6fcf5, #c3fae8)',
        text: '#087f5b', sub: '#2b8a6e', accent: '#12b886', accent2: '#0ca678', track: 'rgba(8,127,91,.12)', warn: '#e03131'
      }
    },
    {
      id: 'women83', name: 'Quốc tế Phụ nữ', tier: 'pro', fx: 'roses', font: 'playfair', season: true, occasion: { label: '8/3', m: 3, d: 8 },
      vars: {
        bg: 'radial-gradient(900px 600px at 80% 0%, #ffd6e8, transparent 60%), linear-gradient(160deg, #f8e1f4, #e0b0ff 55%, #b07bd8)',
        text: '#4a1050', sub: '#7d3c87', accent: '#d6336c', accent2: '#ae3ec9', track: 'rgba(74,16,80,.12)', warn: '#c2255c'
      }
    },
    {
      id: 'hungvuong', name: 'Giỗ Tổ Hùng Vương', tier: 'pro', fx: 'drum', font: 'playfair', season: true, occasion: { label: '10/3 âm lịch', lunar: true },
      vars: {
        bg: 'radial-gradient(circle at 50% 50%, #8a5a2b, #3d2412 75%)',
        text: '#ffe8b0', sub: 'rgba(255,232,176,.75)', accent: '#ffc857', accent2: '#c77d2e', track: 'rgba(255,232,176,.15)',
        glow: '0 2px 20px rgba(0,0,0,.4)'
      }
    },
    {
      id: 'earthday', name: 'Giờ Trái Đất', tier: 'pro', fx: 'earth', season: true, occasion: { label: 'Cuối tháng 3' },
      vars: {
        bg: 'radial-gradient(circle at 50% 0%, #10241c, #020806 70%)',
        text: '#d3f9d8', sub: 'rgba(211,249,216,.62)', accent: '#69db7c', accent2: '#38d9a9', track: 'rgba(255,255,255,.08)',
        glow: '0 0 30px rgba(105,219,124,.35)'
      }
    },
    {
      id: 'reunification', name: '30/4 · 1/5', tier: 'pro', fx: 'fireworks', font: 'bebas', season: true, occasion: { label: '30/4 · 1/5', m: 4, d: 30 },
      vars: {
        bg: 'linear-gradient(160deg, #c1121f 0%, #780000 60%, #3a0000 100%)',
        text: '#fff3b0', sub: 'rgba(255,243,176,.82)', accent: '#ffd60a', accent2: '#ffc300', track: 'rgba(255,255,255,.15)',
        glow: '0 2px 20px rgba(0,0,0,.4)', warn: '#ffffff'
      }
    },
    {
      id: 'thieunhi', name: 'Quốc tế Thiếu nhi', tier: 'pro', fx: 'balloons', season: true, occasion: { label: '1/6', m: 6, d: 1 },
      vars: {
        bg: 'radial-gradient(700px 400px at 20% 10%, rgba(255,255,255,.7), transparent 60%), linear-gradient(180deg, #74c0fc 0%, #a5d8ff 60%, #d0ebff 100%)',
        text: '#1c3d5a', sub: '#3b5b7a', accent: '#ff6b6b', accent2: '#fcc419', track: 'rgba(28,61,90,.12)', warn: '#e03131'
      }
    },
    {
      id: 'graduation', name: 'Lễ tốt nghiệp', tier: 'pro', fx: 'confetti', font: 'playfair', season: true, occasion: { label: 'Tháng 6–7', m: 6, d: 25 },
      vars: {
        bg: 'radial-gradient(800px 500px at 50% 0%, rgba(255,214,102,.2), transparent 70%), linear-gradient(180deg, #14213d, #0b1324)',
        text: '#ffd166', sub: 'rgba(255,209,102,.72)', accent: '#ffd166', accent2: '#fca311', track: 'rgba(255,255,255,.1)',
        glow: '0 0 24px rgba(255,209,102,.3)'
      }
    },
    {
      id: 'vulan', name: 'Vu Lan báo hiếu', tier: 'pro', fx: 'lantern', season: true, occasion: { label: '15/7 âm lịch', lunar: true },
      vars: {
        bg: 'linear-gradient(180deg, #1a1033 0%, #2b1b4f 55%, #0f2a3d 100%)',
        text: '#fff5e1', sub: 'rgba(255,245,225,.72)', accent: '#ffd8a8', accent2: '#ff8787', track: 'rgba(255,255,255,.1)',
        glow: '0 0 30px rgba(255,216,168,.3)'
      }
    },
    {
      id: 'quockhanh', name: 'Quốc khánh', tier: 'pro', fx: 'star', font: 'bebas', season: true, occasion: { label: '2/9', m: 9, d: 2 },
      vars: {
        bg: 'radial-gradient(circle at 50% 40%, #e5383b, #a4161a 60%, #660708 100%)',
        text: '#ffd60a', sub: 'rgba(255,214,10,.82)', accent: '#ffd60a', accent2: '#ffea00', track: 'rgba(255,255,255,.15)',
        glow: '0 2px 24px rgba(0,0,0,.45)', warn: '#ffffff'
      }
    },
    {
      id: 'khaigiang', name: 'Khai giảng', tier: 'pro', fx: 'confetti', season: true, occasion: { label: '5/9', m: 9, d: 5 },
      vars: {
        bg: 'radial-gradient(800px 500px at 20% 0%, #ffffff, transparent 60%), linear-gradient(180deg, #e7f5ff, #bac8ff)',
        text: '#1b2a6b', sub: '#4c5a9a', accent: '#4263eb', accent2: '#f59f00', track: 'rgba(27,42,107,.1)', warn: '#e8590c'
      }
    },
    {
      id: 'women2010', name: 'Phụ nữ Việt Nam', tier: 'pro', fx: 'petals', font: 'playfair', season: true, occasion: { label: '20/10', m: 10, d: 20 },
      vars: {
        bg: 'radial-gradient(900px 600px at 50% 0%, rgba(255,255,255,.35), transparent 60%), linear-gradient(160deg, #ff8fab, #fb6f92 50%, #c9184a)',
        text: '#ffffff', sub: 'rgba(255,255,255,.85)', accent: '#fff0f3', accent2: '#ffc2d1', track: 'rgba(255,255,255,.22)',
        glow: '0 2px 20px rgba(120,0,40,.35)', warn: '#fff3b0'
      }
    },
    {
      id: 'halloween', name: 'Halloween', tier: 'pro', fx: 'embers', font: 'bebas', season: true, occasion: { label: '31/10', m: 10, d: 31 },
      vars: {
        bg: 'radial-gradient(circle at 78% 18%, rgba(255,236,170,.28), transparent 16%), linear-gradient(180deg, #1b0b2e, #2d0a3a 60%, #120614)',
        text: '#ff922b', sub: 'rgba(255,146,43,.75)', accent: '#ff922b', accent2: '#be4bdb', track: 'rgba(255,255,255,.08)',
        glow: '0 0 20px rgba(255,146,43,.55)', warn: '#ffe066'
      }
    },
    {
      id: 'nhagiao', name: 'Nhà giáo Việt Nam', tier: 'pro', fx: 'confetti', font: 'caveat', season: true, occasion: { label: '20/11', m: 11, d: 20 },
      vars: {
        bg: 'radial-gradient(ellipse at center, #2f5d50 0%, #1f3d34 70%, #142a23 100%)',
        text: '#fdf6e3', sub: 'rgba(253,246,227,.72)', accent: '#ffd6a5', accent2: '#ff99c8', track: 'rgba(255,255,255,.12)',
        glow: '0 0 2px rgba(255,255,255,.5)', warn: '#ffd166'
      }
    },
    {
      id: 'birthday', name: 'Sinh nhật', tier: 'pro', fx: 'balloons', season: true, occasion: { label: 'Dịp bất kỳ' },
      vars: {
        bg: 'linear-gradient(160deg, #ffe066 0%, #ffa8a8 50%, #b197fc 100%)',
        text: '#3b2a5c', sub: '#5c4a7c', accent: '#7048e8', accent2: '#f06595', track: 'rgba(59,42,92,.12)', warn: '#e8590c'
      }
    },
    {
      // Ảnh người dùng tự chọn; app.js gắn ảnh vào biến --st-photo trên :root
      id: 'photo', name: 'Ảnh của bạn', tier: 'pro', fx: 'photo', photo: true,
      vars: {
        bg: 'linear-gradient(rgba(0,0,0,.28), rgba(0,0,0,.5)), var(--st-photo, linear-gradient(135deg, #3a4a5a, #11181f))',
        bgSize: 'cover',
        text: '#ffffff', sub: 'rgba(255,255,255,.8)', accent: '#ffffff', accent2: '#c4e43a', track: 'rgba(255,255,255,.22)',
        glow: '0 2px 24px rgba(0,0,0,.55)'
      }
    }
  ];

  var DEFAULT_VARS = {
    bg: '#000', bgSize: 'auto', text: '#fff', sub: 'rgba(255,255,255,.6)', accent: '#12b886', accent2: '#12b886',
    track: 'rgba(255,255,255,.1)', glow: 'none', warn: '#ffb347'
  };

  var api = {
    list: THEMES,
    fonts: FONTS,
    lockPremium: false,
    // Danh sách id nền đã mua. Hiện chưa có hệ thống bán nên luôn rỗng.
    owned: [],
    get: function (id) {
      for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i];
      return THEMES[0];
    },
    // Còn bao nhiêu ngày tới dịp lễ (dương lịch) của nền; null nếu không có ngày cố định (âm lịch, dịp bất kỳ)
    daysUntil: function (theme, now) {
      var o = theme.occasion;
      if (!o || !o.m || !o.d) return null;
      var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      var t = new Date(now.getFullYear(), o.m - 1, o.d);
      if (t < today) t = new Date(now.getFullYear() + 1, o.m - 1, o.d);
      return Math.round((t - today) / 86400000);
    },
    isLocked: function (theme) {
      return api.lockPremium && theme.tier === 'pro' && api.owned.indexOf(theme.id) === -1;
    },
    // Biến CSS đầy đủ (đã ghép giá trị mặc định) để gắn lên khung toàn màn hình hoặc ô xem trước
    cssVars: function (theme) {
      var v = {}, k;
      for (k in DEFAULT_VARS) v[k] = DEFAULT_VARS[k];
      for (k in theme.vars) v[k] = theme.vars[k];
      var font = theme.font && FONTS[theme.font];
      return {
        '--st-bg': v.bg, '--st-bg-size': v.bgSize, '--st-text': v.text, '--st-sub': v.sub,
        '--st-accent': v.accent, '--st-accent2': v.accent2, '--st-track': v.track,
        '--st-glow': v.glow, '--st-warn': v.warn,
        '--st-font': font ? font.family : 'var(--font)'
      };
    },
    // 1 đường dẫn Google Fonts cho mọi phông số, chỉ gồm ký tự số và dấu hai chấm
    fontsUrl: function () {
      var fam = [];
      for (var k in FONTS) fam.push('family=' + FONTS[k].google);
      return 'https://fonts.googleapis.com/css2?' + fam.join('&') + '&text=' + encodeURIComponent('0123456789:') + '&display=swap';
    }
  };
  return api;
});
