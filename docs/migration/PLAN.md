# Chuyển đổi React/Vite + FastAPI + PostgreSQL

Nhánh nguồn: `feat/clinical-ui-refresh`, baseline `76bc675186d3905755d39264c629aece48a5aca2`. Nhánh triển khai: `codex/react-vite-fastapi`. Không merge main trong quá trình chuyển đổi.

| Giai đoạn | Đầu ra và điều kiện kiểm chứng |
| --- | --- |
| 1. Khảo sát và đóng băng | Giữ model/workbook/golden; sao lưu SQLite nhất quán; nhánh riêng. |
| 2. Hợp đồng backend | FastAPI schema, session/role/origin, thời điểm và API tương thích; HTTP tests. |
| 3. PostgreSQL và migration | Schema v3, transaction, ID/history, read-only SQLite import và đối chiếu từng trường. |
| 4. Queue và worker | PostgreSQL durable jobs, retry/lease/revision/attempt, lỗi không mất dữ liệu; worker riêng. |
| 5. Giao diện React/Vite | Feature folders, router/deep links/query filters, giữ UX hiện có và khả năng nhập T0. |
| 6. Đối chiếu và CI | Golden thật, PostgreSQL + SQLite, legacy identities, browser E2E zero retries, artifacts khi lỗi. |
| 7. Tích hợp EMR mô phỏng | Canonical HTTP contract, unit conversion, receipt time, chống trùng/correction; replay tổng hợp. Connector bệnh viện là bước tiếp theo phụ thuộc hợp đồng/quyền truy cập. |
| 8. Chạy, đo và bàn giao | Docker Compose, backup/restore/rollback, benchmark snapshot, tài liệu và Draft PR. |

## Quy tắc giữ nguyên

- Không huấn luyện lại, đổi feature schema hoặc đổi chính sách chọn ngưỡng trong đợt migration.
- T0 lưu được dữ liệu; scoring T0+1..36, quan sát từ T0, horizon 6 giờ.
- Đã xem xét gắn phiên bản dự báo; không có nghĩa đã hoàn tất xử trí.
- Thay input vô hiệu hóa kết quả cũ; kết quả thiếu điều kiện không được tồn tại như hiện hành.
- Dữ liệu, job và revision cùng transaction; worker cũ không ghi đè revision/attempt mới.
- Không dùng tài khoản demo với dữ liệu bệnh nhân thật; không tuyên bố đã tích hợp EMR thật.

## Bằng chứng và giới hạn

Backend tests kiểm tra từng trường SQLite->PostgreSQL, password/session Node tương thích, fixture identities, 5 golden scenarios, temporal validation, nhiều bác sĩ, idempotent retries, parallel workers, bounded retry và EMR correction. E2E giữ 20 workflow, responsive 390..1440 px và desktop viewport.

[snapshot-benchmark.json](snapshot-benchmark.json) là đo SQL + snapshot assembly + JSON trên PostgreSQL 17 Docker cục bộ, 10 mẫu/cỡ. Không phải tải lâm sàng. Kết quả ban đầu 4N+5 SQL (gồm lệnh đặt isolation) statements cho N ca cho thấy cần batching/phân trang trước mở rộng. Chưa đổi API snapshot trong migration để giữ hợp đồng; đã có số đo làm cơ sở tối ưu sau.

Hai required check giữ tên `Python tests` / `Next.js checks` để tương thích Branch Protection; nội dung check thứ hai đã chuyển Vite/FastAPI. Không bỏ qua check do thay Python/model/data/docs. PR ở Draft, chỉ merge sau khi check xanh trên đúng SHA và được review.

Kết quả kiểm chứng: [VERIFICATION.md](VERIFICATION.md).
