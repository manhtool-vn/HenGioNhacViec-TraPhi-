/* Thư viện nhạc nền do quản trị viên tải lên (nhạc có giấy phép rõ ràng: CC0, CC BY, phạm vi công cộng, đã mua…).
   File nằm trong data/music/ (không phục vụ trực tiếp), thông tin bài trong db.data.music.
   Mỗi bài bắt buộc có giấy phép + nguồn để trang ghi công tác giả khi phát. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_TRACKS = 200;
const LICENSES = ['CC0', 'CC BY 4.0', 'CC BY-SA 4.0', 'Phạm vi công cộng', 'Đã mua bản quyền', 'Tự sáng tác'];

// Nhận diện định dạng bằng mấy byte đầu file, không tin phần đuôi tên file hay Content-Type người gửi khai
function sniffAudio(buf) {
  if (!buf || buf.length < 12) return null;
  const s = (a, b) => buf.toString('latin1', a, b);
  if (s(0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return { ext: 'mp3', mime: 'audio/mpeg' };
  if (s(0, 4) === 'OggS') return { ext: 'ogg', mime: 'audio/ogg' };
  if (s(0, 4) === 'RIFF' && s(8, 12) === 'WAVE') return { ext: 'wav', mime: 'audio/wav' };
  if (s(0, 4) === 'fLaC') return { ext: 'flac', mime: 'audio/flac' };
  if (s(4, 8) === 'ftyp') return { ext: 'm4a', mime: 'audio/mp4' };
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { ext: 'webm', mime: 'audio/webm' };
  return null;
}

const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// Kiểm tra + chuẩn hóa thông tin bài; partial = chỉ sửa vài trường
function cleanMeta(input, partial) {
  const out = {};
  const has = (k) => input && Object.prototype.hasOwnProperty.call(input, k);
  if (!partial || has('title')) {
    out.title = clean(input.title, 80);
    if (!out.title) return { error: 'Cần nhập tên bài' };
  }
  if (!partial || has('artist')) {
    out.artist = clean(input.artist, 80);
    if (!out.artist) return { error: 'Cần nhập tác giả / nghệ sĩ' };
  }
  if (!partial || has('license')) {
    out.license = clean(input.license, 40);
    if (!LICENSES.includes(out.license)) return { error: 'Giấy phép không hợp lệ' };
  }
  if (!partial || has('source')) {
    out.source = clean(input.source, 300);
    if (out.source && !/^https?:\/\/[^\s]+$/i.test(out.source)) return { error: 'Nguồn phải là đường dẫn http(s)' };
    if (!out.source && /^CC BY/.test(out.license || '')) return { error: 'Giấy phép CC BY cần đường dẫn nguồn để ghi công' };
  }
  if (!partial || has('mood')) out.mood = clean(input.mood, 40);
  if (!partial || has('tier')) out.tier = input.tier === 'pro' ? 'pro' : 'free';
  if (has('active')) out.active = input.active !== false;
  return { meta: out };
}

function createMusicService({ config, db, now }) {
  const dir = path.join(config.dataDir, 'music');
  const tracks = () => db.data.music || (db.data.music = {});
  const fileOf = (t) => path.join(dir, t.id + '.' + t.ext);

  function toPublic(t, admin) {
    const out = {
      id: t.id, title: t.title, artist: t.artist, license: t.license, source: t.source, mood: t.mood || '',
      tier: t.tier, url: '/api/music/' + t.id + '/file'
    };
    if (admin) Object.assign(out, { active: t.active, size: t.size, mime: t.mime, createdAt: t.createdAt, by: t.by });
    return out;
  }

  function list(admin) {
    return Object.values(tracks())
      .filter((t) => admin || t.active)
      .sort((a, b) => (a.order || 0) - (b.order || 0) || a.createdAt - b.createdAt)
      .map((t) => toPublic(t, admin));
  }

  function add(buf, input, by) {
    if (!buf || !buf.length) return { status: 400, error: 'Chưa có file nhạc' };
    if (buf.length > MAX_BYTES) return { status: 413, error: 'File quá lớn (tối đa 25 MB)' };
    if (Object.keys(tracks()).length >= MAX_TRACKS) return { status: 400, error: 'Thư viện đã đủ ' + MAX_TRACKS + ' bài' };
    if (!input || input.confirm !== true) return { status: 400, error: 'Cần xác nhận bạn có quyền phát hành bản nhạc này' };
    const kind = sniffAudio(buf);
    if (!kind) return { status: 415, error: 'Chỉ nhận MP3, M4A, OGG, WAV, FLAC hoặc WEBM' };
    const m = cleanMeta(input, false);
    if (m.error) return { status: 400, error: m.error };
    const t = Object.assign(m.meta, {
      id: crypto.randomUUID(), ext: kind.ext, mime: kind.mime, size: buf.length, active: true,
      createdAt: now(), by: by || null, order: now()
    });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fileOf(t), buf, { mode: 0o600 });
    tracks()[t.id] = t;
    db.save();
    return { track: t };
  }

  function update(id, input) {
    const t = tracks()[id];
    if (!t) return { status: 404, error: 'Không tìm thấy bài' };
    const m = cleanMeta(Object.assign({ license: t.license }, input), true);
    if (m.error) return { status: 400, error: m.error };
    if (/^CC BY/.test(m.meta.license || t.license) && !(m.meta.source !== undefined ? m.meta.source : t.source)) {
      return { status: 400, error: 'Giấy phép CC BY cần đường dẫn nguồn để ghi công' };
    }
    Object.assign(t, m.meta);
    db.save();
    return { track: t };
  }

  function remove(id) {
    const t = tracks()[id];
    if (!t) return false;
    try { fs.unlinkSync(fileOf(t)); } catch (e) { /* file đã mất: vẫn xóa thông tin */ }
    delete tracks()[id];
    db.save();
    return true;
  }

  return { list, add, update, remove, get: (id) => tracks()[id] || null, fileOf, toPublic, MAX_BYTES };
}

module.exports = { createMusicService, sniffAudio, cleanMeta, LICENSES, MAX_BYTES };
