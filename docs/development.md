# Phát triển và kiểm thử

Yêu cầu Python 3.11, Node.js 22.12+, Docker Desktop cho PostgreSQL.

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
Copy-Item .env.example .env
# Đặt secret riêng trong .env.
docker compose up -d db
.\.venv\Scripts\python.exe scripts/serve_api.py --port 8000 --embedded-worker
```

Terminal khác: `cd frontend`, `npm ci`, `npm run dev`. Chế độ embedded chỉ tiện cho phát triển; Docker Compose chạy worker riêng. Chạy SQLite độc lập: đặt `SEPSIS_DATABASE_URL=sqlite:///data/local.sqlite3`; luôn chọn DB riêng, không nâng cấp trực tiếp DB cũ khi chưa sao lưu.

## Kiểm thử

Chỉ giữ bộ kiểm thử của web React/FastAPI và lõi Python đang dùng:

| Vị trí | Phạm vi |
| --- | --- |
| `tests/unit/` | Cửa sổ cảnh báo, chọn ngưỡng, đợt cảnh báo và calibration |
| `tests/integration/` | Workbook, đặc trưng tại thời điểm, suy luận và golden scoring |
| `tests/fixtures/` | Đầu vào/kết quả cố định, định danh tương thích bản web cũ |
| `backend/tests/` | FastAPI, xác thực, PostgreSQL/SQLite, queue, revision, migration và EMR |
| `frontend/tests/unit/` | Hợp đồng dữ liệu, điều hướng và logic hàng đợi hiển thị |
| `frontend/tests/e2e/` | Các thao tác trình duyệt và bố cục responsive |

Các test giao diện/đăng nhập Streamlit cũ đã được bỏ khỏi repository; môi trường dev và CI không cần cài Streamlit. Nếu chạy ứng dụng cũ để tham khảo, cài riêng `requirements-streamlit.txt`.

- `python -m pytest -q tests backend/tests`: lõi dữ liệu, feature parity, model golden, FastAPI và SQLite.
- Đặt `SEPSIS_TEST_POSTGRES_URL` đến DB **riêng kết thúc `_test`** để cùng bộ backend chạy thêm PostgreSQL. Bộ test xóa bảng trong DB này.
- Trong `frontend/`: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- `npx playwright install chromium`, rồi `npm run test:e2e`. Đặt `SEPSIS_E2E_DATABASE_URL` đến DB riêng `_test` để E2E chạy PostgreSQL; nếu không dùng SQLite test riêng. E2E reset hồ sơ/xem xét; không dùng DB ứng dụng.
- Golden fixtures so sánh score với sai số tuyệt đối 1e-12, feature hash, model version, threshold, trạng thái cảnh báo, giờ trả xét nghiệm. Không tự cập nhật expected để làm test xanh.

`frontend/test-results/`, `frontend/playwright-report/`, `.pytest_cache/` và `__pycache__/` là kết quả/cache tự sinh, được Git bỏ qua và có thể xóa sau khi kiểm thử. Không cần giữ thư mục development/production của Playwright từ bản Next.js cũ.

## CI

Python và frontend chạy cho mọi PR, không lọc `paths`. Push main, feat/clinical-ui-refresh và codex/** chạy web. Cả hai job có PostgreSQL 17 riêng; E2E chạy build Vite được FastAPI phục vụ, zero retries, lưu trace/screenshot/report khi lỗi. Giữ tên required check `Python tests` và `Next.js checks` để không làm hỏng Branch Protection hiện có; tên thứ hai là tên tương thích, code không còn dùng Next.js.

Các bài test Node backend cũ được thay bằng `backend/tests/test_contracts.py`: đăng nhập/session, rate limit, revision, lease, lỗi worker, history, idempotency, SQLite migration và golden scoring. Các test domain/monitoring TypeScript và E2E vẫn giữ chức năng kiểm chứng.
