# Phát triển và kiểm thử

Khởi đầu từ thư mục gốc repository; chuyển vào `frontend/` khi chạy web hoặc kiểm thử frontend. Các lệnh Python thực hiện tại thư mục gốc repository.

## Chạy trên máy

Yêu cầu Node.js **22.13 trở lên** (có `node:sqlite`) và npm. Từ thư mục repository:

```powershell
cd frontend
npm ci
npm run dev
```

Mở **http://127.0.0.1:3000**, đăng nhập bằng tài khoản có sẵn dưới biểu mẫu (không có đăng ký). Các hồ sơ mẫu vẫn xem độc lập, không cần chạy Streamlit. Chạy production cục bộ: `npm run build`, sau đó `npm run start`.

### Tạo ca mới và chấm điểm nhập tay

Bấm **Tạo ca mới** ở Hồ sơ theo dõi. Tạo thông tin ban đầu, nhập sinh hiệu/xét nghiệm tại **T0** rồi lưu. Chọn **T0+1h**, nhập bổ sung nếu có hoặc bỏ chọn sinh hiệu mới để dùng bản ghi T0, rồi bấm **Lưu dữ liệu và chấm điểm**. Tiếp tục ở T0+2h và các giờ sau.

Hồ sơ nhập tay, các lần nhập, kết quả dự báo và ghi nhận xem xét được lưu trong **SQLite phía máy chủ** tại `data/frontend_clinical.sqlite3`. Có thể đóng tab, mở lại hoặc dùng tab khác trên cùng máy chủ mà vẫn xem được hồ sơ. Giao diện tải lại dữ liệu khi quay về tab và đồng bộ định kỳ 10 giây. Không nhập danh tính người bệnh thật.

Chấm điểm nhập tay cần Python đã cài `requirements.txt` ở máy chạy Next.js. Route `PUT /api/cases/[id]/entries` ghi chỉ số và revision vào SQLite trước, đánh dấu dự báo cần tính lại rồi trả dữ liệu đã lưu. Giao diện gọi `POST /api/cases/[id]/rescore` để chạy `scripts/score_frontend_case.py`. Python lỗi không làm mất chỉ số; có nút **Chấm lại dữ liệu đã lưu**. `/api/manual-score` hỗ trợ chấm không lưu sau xác thực. Bộ chấm tái sử dụng logic Python hiện có, tạo SQLite tạm riêng cho mỗi yêu cầu rồi xóa. Không thay đổi workbook, model hoặc SQLite cũ. Bộ chấm tính lại mọi giờ đã chấm khi sửa dữ liệu; giờ không đủ sinh hiệu sẽ không giữ điểm cũ. Ngưỡng và điểm được trả từ model, không sinh ngẫu nhiên.

Server tìm Python ở `.venv` của repository hoặc môi trường `sepsis-prototype` liền kề trên máy phát triển. Có thể đặt đường dẫn rõ ràng trước khi chạy Next.js:

```powershell
$env:SEPSIS_PYTHON = 'D:\duong-dan\.venv\Scripts\python.exe'
npm run dev
```

Đây là cầu nối chấm điểm cục bộ, chưa phải API EMR hay dịch vụ triển khai độc lập; không đóng gói Python vào bundle Next.js. Khi thiếu môi trường Python, biểu mẫu hiển thị lỗi và giữ dữ liệu đang nhập.

## Tổ chức kiểm thử

| Vị trí | Phạm vi |
| --- | --- |
| `frontend/tests/unit/` | Hợp đồng dữ liệu/thời gian, hàng đợi, client với mock và giới hạn chấm điểm. |
| `frontend/tests/integration/` | SQLite, session/quyền, migrations, lưu dữ liệu và phiên bản dự báo. |
| `frontend/tests/e2e/` | Đăng nhập, nhập ca, chấm, xem xét và bố cục trên trình duyệt. |
| `tests/unit/` | Đánh giá cảnh báo Python. |
| `tests/integration/` | Dữ liệu nguồn, đặc trưng, mô hình và ca nhập tay. |
| `tests/streamlit/` | Đăng nhập và thao tác trên giao diện Streamlit. |

Từ thư mục gốc repository, cài `requirements-dev.txt` rồi chạy `python -m pytest -q tests`. Vitest tự tìm các file trong `unit` và `integration`; Playwright chỉ chạy `e2e`. CI giữ cả hai bộ kiểm tra Python và web.

## Kiểm tra bản web

Bộ kiểm tra gồm hợp đồng thời gian/dữ liệu, giới hạn API, luồng trình duyệt và chấm điểm Python thực:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Playwright dùng production build trên cổng 3100, độc lập với server phát triển cổng 3000; cần Python đã cài requirements. Kiểm thử gồm Dashboard khác Registry, tìm/lọc/sắp xếp và bàn phím, URL mốc giờ, review qua tải lại, xét nghiệm trả muộn và sửa dữ liệu khiến giờ đã chấm không còn đủ điều kiện. Kiểm tra bố cục ở 1440, 1280, 1024, 768 và 390 px. GitHub Actions chạy các kiểm tra trên; CI Python gốc được giữ nguyên.

## File sinh tự động

`__pycache__`, `.pytest_cache`, `frontend/test-results`, `frontend/playwright-report`, `frontend/coverage` và `*.tsbuildinfo` có thể tạo lại và không đưa lên Git. Chỉ xóa DB `data/frontend_e2e.sqlite3` cùng WAL/SHM khi server kiểm thử đã dừng. Giữ các DB hồ sơ/tài khoản đang sử dụng. Giữ `node_modules` để chạy ứng dụng và `.next` để phục vụ bản build; không cần xóa chúng sau mỗi lần kiểm thử.
