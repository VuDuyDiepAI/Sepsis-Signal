# Làm việc cùng VinmecStudyAI

Source ứng dụng nằm trong `Prototype/clinical-training-hub`. Chạy các lệnh ứng dụng bên dưới từ thư mục này. Cấu trúc và quy ước chi tiết nằm trong [README ứng dụng](Prototype/clinical-training-hub/README.md).

## Chia việc theo phân hệ

| Phần việc | Frontend | Backend |
|---|---|---|
| Tài liệu, kiểm duyệt, nguồn | `src/features/documents/` | `backend/modules/documents/` |
| Trợ lý AI, hội thoại | `src/features/assistant/` | `backend/modules/assistant/` |
| Học liệu, phê duyệt, xuất bản | `src/features/courses/` | `backend/modules/courses/` |
| Phân công, học, quiz | `src/features/training/` | `backend/modules/training/` |
| Lịch, chứng chỉ | `src/features/calendar/`, `credentials/` | `backend/modules/calendar/`, `credentials/`, `notifications/` |
| Báo cáo | `src/features/reports/` | `backend/modules/reports/` |
| Quản trị và tổ chức | `src/features/administration/` | `backend/modules/administration/`, `organization/`, `identity/` |
| Góp ý | `src/features/feedback/` | `backend/modules/feedback/` |
| Tác vụ xử lý | `src/features/jobs/` | `backend/modules/jobs/`, `backend/infrastructure/` |

Trao đổi trước khi cùng sửa layout, kiểu dữ liệu dùng chung, phân quyền, model hoặc migration. Khi đổi model, tạo revision Alembic mới; giữ nguyên các migration/snapshot đã phát hành. Không sửa lịch sử migration để khớp model mới.

## Chạy khi phát triển

Cài thư viện backend vào môi trường riêng rồi chạy migration:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8000
```

Mở terminal thứ hai trong thư mục ứng dụng:

```powershell
npm ci
npm run dev
```

Frontend chạy ở cổng 5173 và chuyển `/api` tới backend cổng 8000. Terminal phát triển trực tiếp không tự nạp `.env`; hãy đặt các biến môi trường cần dùng trong terminal hoặc dùng `start.ps1` để chạy bản build với cấu hình `.env`.

## Kiểm tra trước khi gửi PR

```powershell
npm run build
.\.venv\Scripts\python.exe -m ruff check backend scripts tests
.\.venv\Scripts\python.exe -m ruff format --check backend scripts tests
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Bộ kiểm thử tạo SQLite và file upload trong thư mục tạm riêng; không dùng `DATABASE_URL` vận hành. Nó kiểm tra quyền ba vai trò, phạm vi khoa, tài liệu/kiểm duyệt, tạo và xuất bản học liệu, phân công, học/quiz, báo cáo, chatbot có nguồn, góp ý, lịch và khởi động lại ứng dụng. Dữ liệu tạm được dọn sau khi chạy.

Để kiểm tra PostgreSQL, tạo database thử **mới, rỗng**, tên kết thúc `_test`, có extension `vector` khả dụng, rồi đặt `TEST_DATABASE_URL` trước khi chạy test. Không trỏ biến này vào database đang dùng. Mỗi lượt kiểm thử PostgreSQL cần database rỗng; test chủ động từ chối database đã có bảng. GitHub Actions cấp database riêng cho từng lượt chạy.

Kiểm tra thêm các thao tác UI bị ảnh hưởng. CI kiểm tra build, cấu trúc/import, định dạng và workflow trên SQLite lẫn PostgreSQL; không thay thế việc kiểm tra giao diện hoặc nghiệp vụ mới.

## Nhánh và Pull Request

Từ gốc repository:

```powershell
git switch main
git pull --ff-only
git switch -c feature/ten-cong-viec
```

Commit theo một công việc cụ thể, kiểm tra `git diff --cached`, rồi push nhánh và mở PR vào `main`. Mô tả vấn đề, hành vi sau thay đổi, kiểm thử đã chạy và ảnh giao diện nếu có. Review và xử lý CI trước khi merge. Tránh sửa chung một nhánh của người khác hoặc force-push lịch sử của nhóm.

Không commit `.env`, API key, database, log, upload thực tế, thư viện đã cài hoặc bản build. Chỉ dùng dữ liệu giả lập. Giữ ba vai trò và phạm vi hiện có, trừ khi công việc đã thống nhất thay đổi phân quyền.
