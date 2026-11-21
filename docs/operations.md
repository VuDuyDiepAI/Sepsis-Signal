# Vận hành web React / FastAPI

## Khởi động

Sao chép `.env.example` sang `.env`, đặt password PostgreSQL và EMR key ngẫu nhiên riêng. Không commit `.env`, DB, dump, token hoặc log dữ liệu người bệnh. `docker compose up -d --build` chạy PostgreSQL, API tại 127.0.0.1:8000 và worker riêng. Volume `sepsis_pgdata` giữ dữ liệu khi container khởi động lại. Không dùng `docker compose down -v` trên dữ liệu cần giữ.

`GET /api/health` xác minh kết nối DB, không đồng nghĩa worker đang hoạt động. Theo dõi `work_jobs` pending lâu, failed, lease hết hạn và số retry; `docker compose logs --tail 50 worker` không in chỉ số người bệnh. Sau restart, worker tự lấy lại job pending hoặc running hết lease 120 giây. Tối đa 3 lần thử; nút chấm lại tái sử dụng dữ liệu đã lưu.

## Đăng nhập và phân quyền

Session ngẫu nhiên 256 bit, chỉ lưu hash trong DB; cookie HttpOnly, SameSite Strict, 8 giờ. Đăng xuất thu hồi session. Password dùng scrypt tương thích bản Next.js cũ. Sau 5 lần sai, tài khoản khóa 5 phút. Viewer chỉ đọc; doctor/admin nhập và xem xét. Chưa có SSO hay phân quyền theo khoa. Ghi nhận xem xét bền vững và không hết hạn cùng session.

Tài khoản demo công khai chỉ bật với `SEPSIS_DEMO_ACCOUNTS=1` ở môi trường cục bộ. `SEPSIS_PUBLIC_ORIGIN` phải là HTTPS origin chính xác; khi có giá trị, mọi session/demo account bị từ chối. Không có đăng ký.

Cấp tài khoản trên đúng DB đích, bằng biến môi trường bảo mật, không truyền mật khẩu trên command line:

```powershell
$env:SEPSIS_USER_PASSWORD = '<mat-khau-rieng-tu-12-ky-tu>'
# Đặt SEPSIS_DATABASE_URL tương ứng trước khi chạy công cụ.
.\.venv\Scripts\python.exe -m backend.scripts.manage_user --username doctor.a --name 'Bác sĩ A' --role doctor
Remove-Item Env:SEPSIS_USER_PASSWORD
```

Đặt lại quyền/password hay vô hiệu hóa sẽ thu hồi các session của tài khoản. Có thể chạy cùng công cụ trong container với secret được truyền từ hệ thống quản lý bí mật. Demo không chứng minh danh tính bác sĩ thật.

HTTP kiểm tra Host, Origin, Sec-Fetch-Site, actor đang hiển thị, dữ liệu tối đa 200 kB, thời gian và revision. Stateless score giới hạn 2 request đồng thời, 20 request/phút/IP; login 30/phút/IP, API chung 1200/phút/IP. Rate limit HTTP hiện trong từng tiến trình; triển khai nhiều replica cần gateway giới hạn dùng chung và cấu hình trusted proxy chính xác. Queue/revision/lease được phối hợp trên PostgreSQL giữa các worker.

## Sao lưu và chuyển SQLite cũ

Dừng ghi vào bản web cũ trước thời điểm cutover. Giữ nguyên nhánh cũ và nguồn SQLite. Dùng `scripts/backup_web_db.py` để sao lưu nhất quán cả WAL; không chỉ chép file đang chạy.

```powershell
.\.venv\Scripts\python.exe scripts/backup_web_db.py data/frontend_clinical.sqlite3 backups/pre-fastapi.sqlite3
# Chọn DB PostgreSQL đích RỖNG và export SEPSIS_DATABASE_URL đến đích đó.
.\.venv\Scripts\python.exe -m backend.scripts.migrate_sqlite backups/pre-fastapi.sqlite3
```

Công cụ mở nguồn read-only, chạy integrity_check, nhận schema v2/v3, giữ ID/user/session/prediction/review và so sánh từng trường sau copy. Đích có hồ sơ/tài khoản/review/job bị từ chối, không có chế độ ghi đè. Job cũ đang pending/running phải yêu cầu chấm lại ở bản mới; không giả định lease cũ là job queue mới.

Sao lưu PostgreSQL bằng `pg_dump --format=custom --file=<absolute-backup-file>` trên cùng major version 17, cung cấp kết nối qua secret môi trường. Trong PowerShell, không redirect binary dump bằng `>`: dùng `--file`, hoặc `docker compose exec -T db pg_dump -U sepsis -d sepsis -Fc -f /tmp/sepsis-backup.dump` rồi `docker compose cp db:/tmp/sepsis-backup.dump <backup-file>`.

Kiểm tra phục hồi bằng `pg_restore --exit-on-error --no-owner` vào DB mới, đối chiếu số hàng và lịch sử trước cutover. Để rollback, dừng API/worker mới rồi chạy nhánh cũ trên **bản sao làm việc** của SQLite backup. Dữ liệu phát sinh sau cutover không tự đồng bộ ngược; cần xuất/đối soát riêng trước rollback. Không đưa PostgreSQL schema mới vào SQLite cũ.

## EMR

`POST /api/emr/events` dùng Bearer service key riêng >=32 ký tự, không dùng tài khoản bác sĩ. Có source/eventId/eventVersion, encounterId, entry, đơn vị; lưu payload gốc và normalized entry trong cùng transaction với revision/job. Duplicate cùng nội dung trả idempotent; cùng ID/version nhưng khác nội dung hoặc version cũ trả 409. Không xóa raw history khi correction.

`python -m backend.scripts.replay_mock_emr` gửi **một ca tổng hợp** tới API cục bộ, không truy cập hệ thống bệnh viện. Mapping, timezone, mã xét nghiệm, quyền truy cập, SLA và dữ liệu hợp lệ cần xác nhận cùng CNTT trước làm connector EMR thật. Không mở cổng này ra Internet chỉ dựa vào key khi chưa có gateway/TLS và kiểm soát truy cập.

## Phiên bản mô hình và kiểm tra vận hành

API/worker dùng cùng image và model artifacts. Khởi động lại cả hai khi đổi artifacts; không thay nóng file joblib. Job pin model/metadata checksum, schema feature, threshold và model version. Mọi cập nhật cần xuất lại fixture, kiểm tra parity/golden và quản lý phiên bản mô hình rõ ràng. Kết quả mô phỏng không chứng minh hiệu năng trên bệnh nhân thật.

Theo dõi dung lượng ổ host Docker, backup, volume và queue; Docker Desktop dừng khi ổ host hết chỗ dù DB nằm trong volume. DB/backup/dump chỉ nằm ở vùng truy cập được kiểm soát. E2E/backend/benchmark chỉ reset DB riêng tên kết thúc `_test`, không dùng DB ứng dụng.
