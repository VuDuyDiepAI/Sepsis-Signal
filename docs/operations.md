# Vận hành bản web

Các lệnh Node thực hiện tại `frontend/`; lệnh sao lưu Python thực hiện tại thư mục gốc repository.

## Giới hạn thao tác trải nghiệm

**Đây là mô hình nghiên cứu trên dữ liệu EMR mô phỏng, chưa được xác thực lâm sàng trên người bệnh thực tế.** Điểm mô hình không phải xác suất lâm sàng đã được hiệu chỉnh hay chẩn đoán. Dưới ngưỡng không loại trừ sepsis.

Ghi nhận xem xét lưu trên máy chủ, không tự hết hạn sau 8 giờ, gắn với `predictionId` và `revision`. Mỗi lượt đánh giá có ID riêng. Xác nhận đầu tiên quyết định trạng thái hàng đợi; các lượt sau nằm trong **Các lượt đánh giá**, không ghi đè nhau. `requestId` giúp gửi lại cùng một thao tác mà không nhân đôi. API lấy danh tính từ session, từ chối trường `reviewer` do client gửi. Kết quả thay đổi không kế thừa xác nhận cũ; lịch sử vẫn được giữ.

### Đăng nhập và quyền truy cập

Tất cả API đọc/ghi hồ sơ và chấm điểm đều kiểm tra session phía server. Token ngẫu nhiên 256 bit chỉ lưu bản băm trong SQLite; cookie `HttpOnly`, `SameSite=Strict`, hết hạn sau 8 giờ, có `Secure` khi cấu hình HTTPS. Đăng xuất thu hồi session trên server. Mật khẩu băm bằng scrypt với salt riêng. Sau 5 lần nhập sai, tài khoản tạm khóa 5 phút. Lịch sử xem xét không hết hạn cùng session.

Vai trò `viewer` chỉ đọc; `doctor` và `admin` được nhập/chấm/xem xét. Đây là tài khoản của ứng dụng, chưa kết nối SSO bệnh viện hay phân quyền theo khoa. Các tài khoản trải nghiệm là tài khoản dùng chung, không chứng minh danh tính cá nhân của bác sĩ.

`npm run dev`/`npm run start` dùng launcher chỉ bind `127.0.0.1` và bật hai tài khoản trải nghiệm. Chạy Next trực tiếp không mặc định bật demo. Khi có `SEPSIS_PUBLIC_ORIGIN`, tài khoản demo cùng các session demo cũ bị từ chối dù `SEPSIS_DEMO_ACCOUNTS=1`.

Kiểm tra Host/Origin chỉ phục vụ định tuyến và chống yêu cầu khác nguồn, không chứng minh danh tính. Bộ chấm vẫn giới hạn 2 yêu cầu đồng thời, 20 yêu cầu/phút trên một tiến trình. `SEPSIS_API_TOKEN` không còn là cơ chế truy cập API; không đưa thông tin bí mật vào `NEXT_PUBLIC_*`.

### Cấp tài khoản và cấu hình truy cập qua mạng

Sau khi khởi động bản mới một lần để tạo/nâng cấp schema, từ `frontend/` có thể cấp hoặc đặt lại tài khoản bằng công cụ phía máy chủ:

```powershell
# Cấp qua biến môi trường bảo mật; không ghi mật khẩu thật vào Git hoặc tham số dòng lệnh.
$env:SEPSIS_USER_PASSWORD = '<mat-khau-rieng-tu-12-ky-tu>'
node scripts/manage-user.mjs --username doctor.a --name 'Bác sĩ A' --role doctor
Remove-Item Env:SEPSIS_USER_PASSWORD
# Chỉ đọc: --role viewer. Vô hiệu hóa: --username doctor.a --disable.
```

Cập nhật mật khẩu/quyền hoặc vô hiệu hóa sẽ thu hồi session cũ. Chọn đúng `SEPSIS_WEB_DB` khi thao tác nhiều bản cài đặt.

Để truy cập qua mạng: dùng reverse proxy HTTPS tới server loopback và đặt `SEPSIS_PUBLIC_ORIGIN` bằng origin HTTPS chính xác (ví dụ `https://sepsis.example.org`, không có dấu `/` cuối). Proxy chuyển tiếp Host của tên miền đó. Khởi động lại ứng dụng sau khi cấu hình. Có thể cấp tài khoản quản trị đầu tiên bằng `SEPSIS_BOOTSTRAP_USERNAME`, `SEPSIS_BOOTSTRAP_PASSWORD`, `SEPSIS_BOOTSTRAP_NAME` từ nơi quản lý bí mật; chỉ tạo khi username chưa tồn tại, không tự đặt lại mật khẩu. Chưa triển khai truy cập mạng trong thay đổi này. Triển khai nhiều tiến trình/máy chủ cần giới hạn dùng chung và phương án cơ sở dữ liệu phù hợp.

## Lưu trữ SQLite của bản web

- `GET /api/clinical-state`: lấy hồ sơ và lịch sử xem xét; `Cache-Control: no-store`.
- `POST /api/cases`: tạo hồ sơ; `PUT /api/cases/[id]/entries`: kiểm tra revision, lưu chỉ số và vô hiệu hóa kết quả hiện hành trong cùng transaction; Python chạy riêng ở `POST /api/cases/[id]/rescore`.
- `POST /api/reviews/import`: lưu bản gốc các ghi nhận cũ vào `legacy_reviews`; ghi nhận lỗi thời không tự áp dụng vào dự báo hiện tại.
- `POST /api/reviews`: kiểm tra dự báo còn hiệu lực, lưu tài khoản từ session, ghi chú và giờ máy chủ. Nhiều bác sĩ được đánh giá cùng kết quả; gửi lại cùng `requestId` không tạo bản trùng.
- `POST /api/cases/import`: lưu dữ liệu phiên tab cũ và bản gốc trong `legacy_imports` trước khi chấm lại. Ghi nhận cũ được lưu để truy vết, không mạo danh tài khoản đã xác thực.
- `manual_entries` là dữ liệu hiện hành; `entry_history` và các phiên bản `predictions` cũ giữ lịch sử. `review_events` tham chiếu trực tiếp bản dự báo đã xem. `scoring_jobs` lưu revision/trạng thái mỗi lần chấm; kết quả chỉ commit khi revision và mã lần chạy còn khớp. Job hết lease sau 60 giây có thể chấm lại; worker cũ không được ghi đè worker mới. Không cung cấp nút xóa lịch sử từ giao diện.
- Khi mở tab cũ, bấm **Chuyển dữ liệu lên máy chủ** ở thông báo đầu trang. Nếu chuyển thất bại, dữ liệu cũ vẫn được giữ. Sau khi thành công, tab giữ thêm bản sao `sepsis-legacy-backup`; các bản xem xét không khớp chỉ nằm trong bản gốc, không gắn vào dự báo mới.

Đổi vị trí lưu trước khi khởi động Next.js (chọn một ổ lưu trữ bền vững trên cùng máy chủ):

```powershell
$env:SEPSIS_WEB_DB = 'D:\SepsisStorage\frontend_clinical.sqlite3'
npm run start
```

SQLite dùng WAL, khóa ghi có thời gian chờ và transaction. Không đặt file trên thư mục public, ổ mạng hay filesystem tạm của serverless; không đưa file DB/WAL/SHM lên Git. Chạy nhiều máy chủ hoặc cần nhiều người ghi đồng thời thì chuyển adapter lưu trữ sang cơ sở dữ liệu máy chủ như PostgreSQL. API lưu trữ yêu cầu session và quyền phù hợp; đây chưa phải SSO hay tài khoản nhân viên bệnh viện.

### Sao lưu và phục hồi

Từ thư mục gốc repository, sao lưu nhất quán cả dữ liệu đã commit trong WAL bằng SQLite backup API:

```powershell
python scripts/backup_web_db.py data/frontend_clinical.sqlite3 backups/frontend_clinical-2026-11-20.sqlite3
```

Script không ghi đè file sao lưu đã tồn tại. Giữ bản sao trên vị trí được kiểm soát truy cập; tự động hóa lịch sao lưu theo nhu cầu vận hành. Để phục hồi: dừng Next.js, đặt `SEPSIS_WEB_DB` tới **một bản sao làm việc** của file backup rồi khởi động lại. Giữ nguyên file gốc để có thể quay lại. Không chỉ chép file `.sqlite3` đang chạy vì có thể bỏ sót WAL.

Kiểm thử Playwright dùng riêng `data/frontend_e2e.sqlite3`, luôn mở server riêng cổng 3100; không xóa dữ liệu web ở cổng 3000.


### Migrations và phiên bản ca mẫu

`src/lib/server/migrations.ts` chứa migration có thứ tự. Bản hiện tại nâng SQLite v1 lên v2: giữ chỉ số/dự báo cũ, chuyển từng dòng `reviews` thành sự kiện `legacy-v1`, thêm job chấm, actor nhập liệu và bảng tài khoản/session. Toàn bộ nâng cấp chạy trong transaction; lỗi sẽ rollback cả schema và `user_version`. Database mới hơn ứng dụng hoặc file không nhận diện được sẽ bị từ chối. Sao lưu trước khi nâng cấp; khôi phục phải dùng bản sao làm việc của backup, không hạ `user_version` bằng tay.

ID fixture phía server băm cả ID nguồn, nội dung dự báo và SHA-256 dữ liệu đầu vào. Cùng ID nguồn nhưng dữ liệu/điểm thay đổi sẽ tạo phiên bản bất biến mới; bản cũ giữ nguyên để tra lịch sử. Frontend dùng ID phiên bản do API trả về cho các màn hình lâm sàng. Exporter cũng đổi fingerprint khi workbook thay đổi. Sau lần nâng cấp này, các ca mẫu cũ cần được xem xét lại; lịch sử gốc vẫn còn.
