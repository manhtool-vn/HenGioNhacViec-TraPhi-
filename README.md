# Hẹn giờ nhắc việc — ManhTool

Đặt giờ đếm ngược, hết giờ thì nhắc việc cần làm (đứng dậy vận động, nghỉ mắt, uống nước…). Trang viết bằng HTML/CSS/JS thuần, không cần build. Máy chủ Node không dùng thư viện ngoài, lo đăng nhập Google, tài khoản và quản trị.

## Chạy
- Đầy đủ (đăng nhập, đồng bộ, quản trị): `npm start` → http://localhost:5173, quản trị ở http://localhost:5173/admin. Cần Node 18 trở lên.
- Chỉ phần hẹn giờ: đưa thư mục `public/` lên hosting tĩnh bất kỳ. Không có máy chủ thì nút Đăng nhập tự ẩn, mọi tính năng khác vẫn chạy.
- Kiểm thử: `npm test` (lõi đồng hồ, bộ nền, máy chủ với Google giả lập, kiểm tra cú pháp mọi file JS).

## Cấu trúc thư mục
```
public/                     TOÀN BỘ những gì được phục vụ ra ngoài (máy chủ chỉ đọc thư mục này)
  index.html                trang hẹn giờ
  admin.html                trang quản trị
  manifest.webmanifest, sw.js   cài như ứng dụng, chạy offline
  assets/css/               style.css (chung) · stage.css (toàn màn hình, nền) · account.css (tài khoản, quản trị)
  assets/js/
    boot.js                 áp nền sáng/tối sớm (thay cho script inline)
    timer-core.js           lõi đồng hồ, chuỗi bước, lịch sử, liên kết chia sẻ (thuần, chạy được trong Node)
    themes.js               dữ liệu 41 nền (7 miễn phí, 34 Pro, trong đó 19 nền ngày lễ có ngày diễn ra)
    sounds.js, pip.js       chuông Web Audio, cửa sổ nổi
    app.js                  giao diện hẹn giờ
    api.js                  gọi API, tự làm mới token khi hết hạn
    account.js              đăng nhập, hộp tài khoản, đồng bộ
    admin.js                trang quản trị
  assets/img/               logo, biểu tượng, mã QR (bản đã thu nhỏ)
server/
  index.js                  khởi động (npm start), kiểm tra cấu hình, tắt êm
  app.js                    ghép các phần + chặn CSRF
  config.js                 cấu hình từ .env
  lib/                      env.js (đọc .env) · http.js (header bảo mật, cookie, JSON) · jwt.js (HS256) · rateLimit.js
  db/store.js               lưu dữ liệu vào data/db.json (thay bằng PostgreSQL/SQLite sau này chỉ cần viết lại file này)
  services/                 tokens.js (JWT + refresh) · google.js (OAuth) · users.js (tài khoản, đồng bộ) · payments.js (bán nền, webhook)
  routes/                   auth.js · me.js · shop.js (đơn hàng, webhook) · admin.js · static.js
tests/                      timer-core · themes · server
scripts/check-syntax.js     kiểm tra cú pháp
brand/                      logo gốc, mã QR gốc, thông tin thương hiệu (không phục vụ ra ngoài)
data/                       dữ liệu chạy thật (KHÔNG đưa lên git, nhớ sao lưu)
.env / .env.example         cấu hình thật (KHÔNG đưa lên git) / file mẫu
```

## Đăng nhập & bảo mật
- **Google OAuth 2.0 Authorization Code + PKCE.** `state` dùng 1 lần, hết hạn sau 10 phút. Máy chủ đổi code lấy token rồi lấy hồ sơ qua HTTPS, chỉ nhận email đã xác minh. Ảnh đại diện chỉ nhận từ `*.googleusercontent.com`.
- **JWT:**
  - *Access token*: JWT HS256 sống 15 phút, nằm trong cookie `hg_at` (HttpOnly, SameSite=Lax), chứa `sub`, `tv` (token version), `iss`, `aud`. Chỉ chấp nhận đúng HS256 (chặn kiểu `alg: none`), so chữ ký theo thời gian không đổi.
  - *Refresh token*: 256 bit ngẫu nhiên, cookie `hg_rt` (HttpOnly, SameSite=Strict, chỉ gửi tới `/api/auth`). Máy chủ chỉ lưu bản băm SHA-256. Mỗi lần làm mới sẽ cấp token mới (xoay vòng). Token cũ bị dùng lại sau 30 giây được coi là bị đánh cắp và cả chuỗi phiên của thiết bị đó bị hủy.
  - *Đăng xuất mọi nơi* hoặc *khóa tài khoản*: tăng `tokenVersion`, nên mọi access token đang lưu hành mất hiệu lực ngay, không phải chờ 15 phút.
  - JavaScript trên trang không đọc được token nào (`document.cookie` rỗng). `api.js` tự làm mới token khi nhận 401 `token_expired`.
- **CSRF:** thao tác ghi phải kèm header `X-Requested-With: hengio`; nếu trình duyệt gửi `Origin` / `Sec-Fetch-Site` thì phải là cùng trang. Máy chủ không bật CORS.
- **Header bảo mật:** CSP chặn script inline và script từ trang khác (`script-src 'self'`), `frame-ancestors 'none'`, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP/CORP. HSTS tự bật khi chạy https.
- **Khác:** giới hạn tần suất đăng nhập / làm mới / đồng bộ theo IP; giới hạn kích thước request (512 KB) và dữ liệu đồng bộ (300 KB); chỉ nhận JSON; chỉ phục vụ file trong `public/` (chặn file ẩn và đi ngược thư mục); Client secret không bao giờ trả về trang quản trị; `data/db.json` ghi qua file tạm, quyền 600.
- **Chạy thật** (`NODE_ENV=production`): máy chủ từ chối khởi động nếu `PUBLIC_URL` không phải https hoặc `JWT_SECRET` ngắn hơn 32 ký tự.

## Tài khoản & quản trị
- Tài khoản đầu tiên đăng nhập, hoặc email trong `ADMIN_EMAILS`, là quản trị viên.
- **Người dùng** làm được: xem gói (Miễn phí/Pro) và số thiết bị đang đăng nhập, đổi tên, đồng bộ ngay, tải dữ liệu `.json`, khôi phục bản trên máy, đăng xuất / đăng xuất mọi thiết bị (tùy chọn xóa dữ liệu trên máy dùng chung), xóa tài khoản.
- **Đồng bộ:** việc cần làm, chuỗi bước, mục đã lưu, tùy chọn, thống kê. Ảnh nền riêng và đồng hồ đang chạy chỉ ở máy đó. Mỗi lần ghi có số phiên bản nên phát hiện được thiết bị khác vừa ghi (409), và bản trên máy luôn được giữ dự phòng.
- **Quản trị** (`/admin`): số liệu tổng, tìm người dùng, cấp/bỏ Pro, khóa/mở, cấp quyền quản trị, xóa; cài đặt Google, đóng/mở đăng ký, **khóa nền Pro** để bắt đầu bán; nhật ký thao tác.

## Bán nền (chuyển khoản VietQR + SePay)
**Bảng giá mặc định** (sửa ở Quản trị → Cài đặt → Thanh toán):
| Gói | Giá | Gồm |
|---|---|---|
| Nền lẻ | 9.000đ | 1 nền Pro, dùng mãi mãi |
| Gói Lễ, Tết cả năm | 29.000đ | 19 nền ngày lễ: Tết, 8/3, 30/4, 1/6, 2/9, 20/10, 20/11, Noel… |
| Gói Pro trọn đời | 49.000đ | Tất cả nền Pro hiện có + nền ra mắt sau này + ảnh của bạn |

Giá thấp, mua 1 lần, không gia hạn, để người dùng dễ quyết định; gói Pro rẻ hơn mua lẻ 6 nền nên đa số sẽ chọn Pro.

**Luồng:** bấm nền có ổ khóa (hoặc "Xem bảng giá" / "Nâng cấp Pro") → chọn gói → đăng nhập Google nếu chưa (đăng nhập xong tự mở lại đúng gói) → máy chủ tạo đơn có mã `MTHG` + 6 ký tự (bỏ 0/O/1/I dễ nhầm) → hiện VietQR (img.vietqr.io) với số tiền + nội dung = mã đơn, đếm ngược 30 phút → trang hỏi máy chủ mỗi 4 giây → tiền về là tự mở khóa, sang màn "Đã mở khóa".

**Đối soát:** SePay gọi `POST PUBLIC_URL/api/payments/webhook` (header `Authorization: Apikey <PAYMENT_WEBHOOK_KEY>`). Máy chủ đọc các trường `id`, `transferType`, `transferAmount`, `content` / `code`, tìm mã đơn trong nội dung (bỏ qua dấu cách, gạch, hoa/thường), đủ tiền thì mở khóa và trả `{"success": true}`. Có chống xử lý trùng theo `id` giao dịch; chuyển muộn trong 7 ngày (kể cả đơn đã hủy) vẫn được ghi nhận; chuyển thiếu, chuyển 2 lần, ghi sai nội dung được đưa vào mục "Tiền vào chưa khớp đơn" để quản trị xử lý. **Hãy đối chiếu tên trường với mục Webhooks trên trang SePay của bạn** trước khi chạy thật.

**Cài đặt:**
1. `.env`: đặt `PAYMENT_WEBHOOK_KEY` (≥ 16 ký tự, đã sinh sẵn).
2. Quản trị → Cài đặt → Thanh toán: bật bán nền, mã ngân hàng (TCB, MB, VCB… hoặc mã BIN), số tài khoản, tên chủ tài khoản, giá.
3. Bật "Khóa nền Pro với người chưa có gói Pro" để bắt đầu thu tiền.
4. SePay → Webhooks → thêm URL webhook (trang quản trị có nút chép), kiểu chứng thực API Key, dán khóa ở bước 1.
5. Chưa nối SePay vẫn bán được: khách chuyển khoản, bạn vào Quản trị → Đơn hàng bấm "Xác nhận".

**Bảo mật:** giá do máy chủ tính (trang gửi giá lên cũng bị bỏ qua); khóa webhook so theo thời gian không đổi, không bao giờ trả ra trang quản trị; webhook là đường duy nhất được miễn kiểm tra CSRF và có giới hạn tần suất; người dùng chỉ xem được đơn của chính mình; tối đa 3 đơn chờ / người, 20 đơn / giờ.

## Tên ứng dụng trên màn hình đăng nhập Google
Dòng "to continue to …" lấy từ **OAuth consent screen** của dự án Google Cloud chứa Client ID, không nằm trong code. Để hiện "ManhTool":
1. https://console.cloud.google.com → chọn đúng dự án của Client ID → **APIs & Services → OAuth consent screen** (bản mới: **Google Auth Platform → Branding**).
2. Đổi **App name** thành `ManhTool`, thêm logo (`brand/logo-512.png`), email hỗ trợ, trang chủ `https://manhtool.id.vn`. Lưu lại.

Khuyên dùng: tạo **dự án Google Cloud riêng tên ManhTool** với OAuth Client mới (loại Web application, Redirect URI `http://localhost:5173/api/auth/google/callback` và địa chỉ thật khi đưa lên mạng), rồi thay `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` trong `.env`. Như vậy không đụng tới dự án cũ đang dùng chung client này.

## Đưa lên mạng
1. Chạy `npm start` trên máy có Node (VPS, Render, Railway…) với `NODE_ENV=production`, `PUBLIC_URL=https://ten-mien`, `JWT_SECRET` ngẫu nhiên, và `TRUST_PROXY=true` nếu đứng sau Nginx/Cloudflare.
2. Google Cloud → OAuth client → thêm Redirect URI `https://ten-mien/api/auth/google/callback` (trang Quản trị → Cài đặt có nút chép đúng địa chỉ này).
3. OAuth consent screen: chuyển sang **In production** để ai cũng đăng nhập được.
4. Sao lưu thư mục `data/` định kỳ.

## Tính năng hẹn giờ
- Đặt giờ/phút/giây, chọn nhanh, **hết giờ lúc** một giờ cụ thể (ô gõ 24 giờ: gõ `1730` thành 17:30, kèm giờ gợi ý bấm 1 chạm); bắt đầu / tạm dừng / thêm 1 phút / đặt lại.
- **Chuỗi nhiều bước** (Pomodoro, 52/17, HIIT 40/20, Thuyết trình, Làm bài kiểm tra), lặp N vòng, phím `N` sang bước tiếp.
- Danh sách việc (thêm, sửa, kéo sắp xếp, xóa có hoàn tác) và 4 mẫu. Hết giờ thì nhắc **cả danh sách** (tick từng việc) hoặc **chọn ngẫu nhiên 1 việc**.
- 4 kiểu chuông + âm lượng, đọc to bằng giọng tiếng Việt, báo trước 1/2/5 phút, tự đếm lại, báo lại sau 5 phút, thông báo hệ thống, rung, giữ màn hình sáng.
- **Toàn màn hình** (phím `F`): 4 kiểu hiển thị (vòng tròn, thanh ngang, chỉ số, lật số), tiêu đề màn hình lớn, 25 nền có lọc Miễn phí / Pro / Theo mùa (Tết, Trung thu, Giáng sinh), ảnh của bạn, phím `T` đổi nền. Ô xem trước chỉ chạy hiệu ứng khi rê chuột cho nhẹ máy. **Cửa sổ nổi** (phím `P`).
- Hẹn giờ đã lưu, **chia sẻ liên kết** `?p=…`, biểu đồ 7 ngày, cài như ứng dụng (PWA). Đổi `VERSION` trong `public/sw.js` mỗi lần phát hành.

### Dễ dùng
- **Hướng dẫn nhanh** 6 bước tự bật lần đầu vào trang (không bật khi đang đếm hoặc mở từ liên kết chia sẻ); mở lại bằng nút ? trên thanh đầu hoặc phím ?.
- **Thu gọn** (nút trong ô đồng hồ, phím G): ẩn mọi thứ, chỉ còn đồng hồ to ở giữa trang.
- **Chế độ tập trung** khi toàn màn hình: ẩn việc sắp làm và giờ hiện tại, hiệu ứng nền dịu đi, phút cuối mới hiện lại.
- **Hoàn tác khi lỡ bấm Đặt lại**: đồng hồ chạy tiếp đúng mốc cũ.
- **Gợi ý nền ngày lễ** khi còn ≤ 7 ngày (vd "Còn 3 ngày nữa là 20/10"), bấm Xem thử là mở toàn màn hình với nền đó; ẩn được, mỗi dịp chỉ hỏi 1 lần.
- **Trình đọc màn hình**: đọc "Còn N phút", sang bước mới, hết giờ và việc cần làm.

### Thêm nền mới
Thêm 1 phần tử vào `THEMES` trong `public/assets/js/themes.js`. Hiệu ứng mới: thêm khối `[data-fx="ten"] > .fx::before/::after` trong `stage.css`; cần nhiều hạt (sao, cánh hoa) thì sinh trong `buildFx()` ở `app.js`.

## Ghi chú kỹ thuật
- Đồng hồ tính theo mốc kết thúc `endAt` và giờ hệ thống nên tab ở nền vẫn đúng giờ; thời điểm hết giờ do một `setTimeout` riêng canh.
- Trình duyệt chỉ cho phát tiếng sau một cú bấm, nên `AudioContext` mở ngay khi bấm Bắt đầu.
- Trên điện thoại, khóa màn hình có thể làm trình duyệt ngừng chạy JS; bật "Giữ màn hình sáng" để tránh.
