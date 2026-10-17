# ManhTool — Quy tắc chung cho mọi công cụ

Mỗi thư mục con là một công cụ web tĩnh (HTML/CSS/JS thuần, không build) thuộc kho **ManhTool** — https://manhtool.id.vn.
Thông tin thương hiệu gốc: `brand/# ManhTool — Kho công cụ trực tuyến.txt`.

## Riêng công cụ này (Hẹn giờ nhắc việc)
- `public/` là toàn bộ trang (chỉ thư mục này được phục vụ ra ngoài); `server/` là máy chủ Node không thư viện ngoài
  (config → lib → db → services → routes); `brand/` là ảnh gốc; `data/` và `.env` không bao giờ đưa lên git.
- Đăng nhập: Google OAuth (PKCE) → JWT HS256 trong cookie HttpOnly `hg_at` (15 phút) + refresh token xoay vòng `hg_rt`.
  Thao tác ghi phải kèm `X-Requested-With: hengio`; gọi API phía trang qua `public/assets/js/api.js` (tự làm mới token).
- CSP chặn script inline: không viết `<script>…</script>` hay `onclick=` trong HTML, mọi script để trong file riêng.
- Kiểm thử: `npm test` (lõi + máy chủ giả lập Google + kiểm tra cú pháp).

## Thương hiệu
- Tên: **ManhTool** · Slogan: "Những công cụ nhỏ – Tạo nên giá trị lớn." · Tagline logo: "Công cụ hữu ích · Dùng ngay"
- Điện thoại / Zalo: **0988 392 321** (`tel:0988392321`, `https://zalo.me/0988392321`)
- Logo: `brand/logo.png` (nền gần trắng, luôn đặt trên ô nền trắng bo góc). Thu nhỏ trước khi dùng (logo ~512px, icon ~192px) — không nhúng bản gốc 1,2MB.
- Mã QR ủng hộ: `brand/donate-qr.png` (Techcombank / VietQR).

## Màu (lấy từ logo)
| Token | Mã | Dùng cho |
|---|---|---|
| ink | `#0f2620` | chữ chính (giống chữ "Manh") |
| brand-700 | `#0e7c5a` | nút chính, liên kết |
| brand-500 | `#12b886` | viền focus, trạng thái chọn |
| leaf | `#4cb944` | trạng thái thành công |
| lime | `#c4e43a` | điểm nhấn |
| gradient | `linear-gradient(115deg,#0e7c5a,#12b886 50%,#7ccf3e 85%,#c4e43a)` | tiêu đề, nhấn mạnh |

Luôn có nền sáng + nền tối (token trên `:root`, `prefers-color-scheme` + `data-theme`), nút đổi giao diện ở header.

## Khối bắt buộc trên mọi công cụ
1. **Header**: logo + "Manh**Tool**", link "Tất cả công cụ" về manhtool.id.vn, nút sáng/tối.
2. **Công cụ chính** ngay trên màn hình đầu tiên, tiêu đề H1 ngắn.
3. **Ủng hộ**: thẻ có mã QR, bấm để phóng to, dòng "Quét bằng app ngân hàng bất kỳ".
4. **Về ManhTool + Hợp tác** (`.brand-section`) đặt trước footer, gồm 2 thẻ:
   - `.brand-card`: logo, nhãn "Về chúng tôi", "ManhTool — Kho công cụ trực tuyến", slogan, mô tả, nút "Xem tất cả công cụ".
   - `.hire-card` (nền xanh đậm, luôn tối): nhãn "Hợp tác cùng ManhTool", tiêu đề "Bạn cần quảng cáo hoặc phát triển website/app?", 3 dịch vụ (Hợp tác quảng cáo · Thiết kế website · Phát triển website, ứng dụng), nút gọi lớn "Liên hệ ngay 0988 392 321", các nút phụ "Chép số điện thoại" · "Zalo" · "Xem website", dòng "Tư vấn nhanh · Hỗ trợ tận tâm · Giải pháp theo nhu cầu".
   - Mẫu chuẩn để sao chép: `Chuyen-chu-hoa-chu-thuong/index.html` (HTML) và cuối `assets/css/style.css` (CSS).
5. **Footer**: logo nhỏ + "ManhTool · slogan", bên phải "© <năm> manhtool.id.vn".

## Câu chữ
- Tiếng Việt tự nhiên, ngắn gọn, như người thật viết. Tránh văn phong "AI": không dồn nhãn kiểu "Miễn phí · Không cần đăng nhập · Bảo mật", không câu sáo rỗng, không dùng emoji trong giao diện.
- Không hiện thông báo (toast) cho thao tác mà kết quả đã thấy ngay; chỉ báo khi sao chép, lỗi, hoặc hành động không thấy được.

## Icon
- Một bộ icon SVG nét (stroke 2, bo tròn, kiểu Lucide) khai báo `<symbol>` đầu trang, dùng `<svg class="ic"><use href="#i-..."/></svg>`. Không dùng emoji hay ký tự tự chế làm icon.

## Bố cục & thích ứng
- Font **Be Vietnam Pro** (Google Fonts).
- Kiểm tra ở 320, 375, 768, 1280px: không tràn ngang (dùng `minmax(0,1fr)` cho cột grid), nút không bị ngắt chữ giữa từ.
- Điện thoại: nút chính rộng hết chiều ngang, nút phụ chỉ icon; ẩn phần chỉ hữu ích với bàn phím (phím tắt) khi `hover: none`.
- Desktop ≥1024px: công cụ bên trái + cột bên ~288px (ủng hộ, phím tắt) dính khi cuộn.
- Dữ liệu người dùng chỉ xử lý trên trình duyệt; bọc mọi `localStorage` trong try/catch.

## Tính năng nền nên có (nếu công cụ có ô nhập văn bản)
- Hoàn tác / Làm lại dùng chung một lịch sử cho mọi thao tác (kể cả gõ tay), Ctrl+Z / Ctrl+Y.
- Sao chép, Dán, Mở file + kéo thả file, Tải về .txt (UTF-8 có BOM), Xóa (hoàn tác được), tự lưu nháp.

## Kiểm thử
- Tách phần xử lý thuần (không đụng DOM) ra file riêng dạng UMD để chạy được trong Node; viết test `node:test` trong `tests/`, chạy bằng `npm test`.
- Trước khi bàn giao: chạy `npm test`, kiểm thử luồng thao tác thật trên trình duyệt, kiểm tra console không lỗi, và đo tràn ngang ở 320 / 375 / 768 / 1280px.
- Sao chép vào bộ nhớ tạm chỉ chạy với cú bấm thật — kiểm thử bằng click chuột, không bằng `element.click()` trong script.
