# Vinmec AI Clinical Training Hub

Ứng dụng nội bộ hỗ trợ quản lý tri thức và đào tạo nhân viên y tế bằng tiếng Việt.

Luồng nghiệp vụ: tài liệu → kiểm duyệt → tra cứu có nguồn → học liệu → phê duyệt → xuất bản → phân công → học và quiz → báo cáo.

## Chức năng và vai trò

| Vai trò | Phạm vi sử dụng |
|---|---|
| Admin | Quản lý tài liệu, biên soạn/xuất bản học liệu, phân công, báo cáo, góp ý, tài khoản và tổ chức. |
| Reviewer | Kiểm duyệt tài liệu và học liệu trong phạm vi khoa/phòng, chuyên môn được cấp. |
| Staff | Tra cứu tài liệu/AI, học khóa được giao, làm quiz, xem lịch và chứng chỉ cá nhân, gửi góp ý. |

Mỗi tài khoản có một vai trò. Backend kiểm tra vai trò và phạm vi truy cập; phê duyệt chuyên môn yêu cầu người độc lập với người tạo, sửa hoặc gửi duyệt nội dung.

## Kiến trúc

React/TypeScript/Vite phục vụ giao diện; FastAPI cung cấp REST API. SQLAlchemy và Alembic quản lý dữ liệu/migration. SQLite dùng cho local, PostgreSQL/pgvector dùng trong Docker. Worker xử lý tác vụ qua hàng đợi lưu trong database.

```text
src/
  app/              App, layout và điều hướng
  features/         Giao diện theo phân hệ
  shared/           API client, quyền, context, hook, UI và CSS dùng chung
backend/
  main.py           Entry point backend.main:app
  api/              Router tổng, health và middleware
  bootstrap/        Khởi tạo và dữ liệu demo
  core/             Database, xác thực và phân quyền
  infrastructure/   AI provider, vector, storage và worker
  models/           ORM theo miền dữ liệu
  modules/          Endpoint, schema và xử lý theo phân hệ
migrations/         Revision và snapshot database
scripts/            Tạo tài liệu mẫu và đóng gói source
tests/             Kiểm thử cấu trúc và workflow
demo/              Tài liệu giả lập
```

## Chạy ứng dụng

Yêu cầu Python 3.12+, Node.js 22.12+ và npm. Chạy từ thư mục `Prototype/clinical-training-hub`:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
.\start.ps1
```

Script cài thư viện, build giao diện, chạy migration và mở máy chủ. Ứng dụng tại [http://127.0.0.1:8000](http://127.0.0.1:8000); tài liệu API tại [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

Chạy bằng Docker:

```powershell
docker compose up --build -d
```

Ứng dụng Docker tại [http://127.0.0.1:8088](http://127.0.0.1:8088). Database và file upload được lưu trong volume.

Dữ liệu demo được tạo trên database rỗng khi `DEMO_MODE=true`. Tài khoản mẫu: `admin@demo.local`, `reviewer@demo.local`, `staff@demo.local`. Mật khẩu mặc định `Demo@2026!`, cấu hình bằng `DEMO_PASSWORD` trước lần khởi tạo.

## Phát triển và kiểm thử

Backend phát triển:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8000
```

Frontend chạy ở terminal riêng bằng `npm ci` và `npm run dev`. Vite dùng cổng 5173, chuyển `/api` tới backend cổng 8000. Terminal phát triển trực tiếp nhận cấu hình từ biến môi trường của shell; `start.ps1` nạp cấu hình từ `.env`.

Các lệnh kiểm tra:

```powershell
npm run build
.\.venv\Scripts\python.exe -m ruff check backend scripts tests
.\.venv\Scripts\python.exe -m ruff format --check backend scripts tests
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Test dùng SQLite và upload trong thư mục tạm riêng. Kiểm thử PostgreSQL dùng `TEST_DATABASE_URL` trỏ tới database rỗng, tên kết thúc `_test`, có pgvector khả dụng. CI kiểm tra build frontend, cấu trúc/import, định dạng và workflow trên SQLite/PostgreSQL.

Nhóm làm việc trên nhánh riêng và gửi Pull Request vào `main`. Frontend dùng alias `@/`; backend dùng import tường minh `backend...`. Model thay đổi đi kèm revision Alembic; các revision/snapshot đã phát hành được giữ nguyên.

## Cấu hình và dữ liệu

- `.env.example` liệt kê cấu hình mẫu; `.env` chứa cấu hình riêng từng môi trường.
- `DATA_DIR` và `DATABASE_URL` xác định nơi lưu upload và database; local mặc định dùng `data/hub.db`.
- `DEMO_MODE=false` cùng `BOOTSTRAP_ADMIN_EMAIL` và `BOOTSTRAP_ADMIN_PASSWORD` tối thiểu 12 ký tự khởi tạo Admin cho database rỗng.
- `AI_PROVIDER=demo` dùng truy xuất từ khóa/vector hash và template có nguồn. Provider khác cấu hình qua `AI_BASE_URL`, `AI_MODEL`, `AI_EMBEDDING_MODEL`, `AI_API_KEY`; `ALLOW_EXTERNAL_AI` kiểm soát gửi dữ liệu ra ngoài local.
- Database, upload, `.env`, thư viện và bản build thuộc môi trường chạy; Git lưu source và cấu hình mẫu.

Tài liệu demo là tình huống giả lập. PDF cần có lớp văn bản. Nhắc hạn hiển thị trong ứng dụng; kết quả học tập và thời hạn chứng chỉ được quản lý riêng.
