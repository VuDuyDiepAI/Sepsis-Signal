# Xác nhận chuyển đổi — 21/11/2026

## Bằng chứng đã chạy

- Baseline Next.js: `76bc675186d3905755d39264c629aece48a5aca2`; các thay đổi ở `codex/react-vite-fastapi`, Draft PR #5, base `feat/clinical-ui-refresh`. Không merge main.
- Commit `69f8999fcb489dee32c06ef762ec88187782a0c6`: cả push và pull_request đều có `Python tests` / `Next.js checks` thành công. Python: **100 passed, 1 skipped** (skip kiểm tra PostgreSQL trên biến thể SQLite), Vitest: **28 passed**, Playwright: **20 passed**, zero retries. Có thêm bước build image và nạp model trong Docker.
- [Python CI](https://github.com/VuDuyDiepAI/Sepsis-Signal/actions/runs/44870215736), [Web + Docker CI](https://github.com/VuDuyDiepAI/Sepsis-Signal/actions/runs/44870215687).
- Backend local: **57 passed, 1 skipped** trên hai adapter trước hai ca kiểm tra receipt/JSON bổ sung; hai ca bổ sung chạy trên cả adapter đạt **4 passed**.
- Cả 20 browser workflow chạy đạt trên PostgreSQL cục bộ; trước đó cũng đạt trên SQLite test riêng. Không dùng DB ứng dụng để reset test.

Bổ sung sau kiểm chứng trên: thứ tự mobile được kiểm tra trạng thái nguy cơ đứng trước biểu đồ; form chỉ kiểm tra event đang nhập, không áp giới hạn/duy nhất giờ của bản nhập tay lên toàn bộ stream EMR. Đã chạy đạt ca E2E thực nhận hai event EMR cùng giờ rồi nhập/chấm giờ tiếp theo; tổng bộ browser là 21 workflow.

Các kiểm tra CI trên đây gắn đúng commit được dẫn; sau mọi thay đổi tiếp theo vẫn phải xem check trên HEAD mới, không dùng kết quả của commit trước thay thế.

## Dữ liệu và vòng đời tiến trình

- Sao lưu SQLite nguồn bằng online backup, migration mở read-only và so sánh từng trường. Giữ 2 tài khoản, 2 session, 1 review; nguồn không có ca nhập tay. Dữ liệu fixture cũ được giữ để truy vết, fixture hiện hành được đồng bộ bằng định danh nội dung. File backup nguồn không thay đổi checksum.
- Đã dừng worker, gửi một canonical EMR event tổng hợp, xác nhận input + pending job có trong PostgreSQL; khởi động worker, nhận đúng một dự báo và trạng thái ready.
- Đã restart API, đăng nhập bằng browser mới và xác nhận hồ sơ cùng lịch sử xem xét còn tồn tại. Trình duyệt không có pageerror khi xem dashboard/chi tiết.
- Đã pg_dump dạng custom và pg_restore vào DB riêng `sepsis_restore_test`; so sánh tất cả cột/hàng của **15 bảng** bằng giá trị, không chỉ đếm hàng. Bản sao lưu/dump/trace không commit lên Git.
- Docker Compose hiện dùng PostgreSQL 17, API và worker là hai tiến trình/container riêng. Chạy bằng CPU; không cần Streamlit cho web.

## Kết luận kiến trúc và việc tiếp theo

Luồng triển khai cục bộ đã được kiểm chứng. Adapter EMR hiện nhận dữ liệu tổng hợp theo hợp đồng API; chưa có kết nối hệ thống bệnh viện hoặc dữ liệu bệnh nhân thật. Cần thống nhất mapping nguồn, quyền dữ liệu, timezone, vận hành/bảo mật và kiểm định lâm sàng trước triển khai thực tế.

Benchmark được lưu trong [snapshot-benchmark.json](snapshot-benchmark.json): 4N+5 câu SQL cho N ca; 300 ca đạt p50 khoảng 5,8 giây trên máy Docker Windows đang chạy các kiểm thử khác. Đây là chỉ dấu cần batch queries/phân trang trước tăng quy mô, không phải số đo SLA. Không kết luận hệ thống đạt tải nhiều khoa hoặc hiệu năng mô hình thực tế từ phép thử này.

Đã gặp hết ổ C làm Docker dừng. Cache phụ thuộc phát sinh được chuyển sang ổ D, volume dữ liệu được giữ; kiểm tra dung lượng host phải nằm trong vận hành. Thêm kiểm tra import/model ngay trong Docker build để bắt image không đủ dependency/workbook trước khi chạy.

Đã đọc được cấu hình Branch Protection của main: bắt buộc PR, strict status checks `Python tests` và `Next.js checks` từ GitHub Actions. Giữ nguyên tên check tương thích dù web đã chuyển Vite.

PR vẫn Draft. Chưa có thay đổi Branch Protection, không merge PR #4/#5 trong đợt triển khai này.
