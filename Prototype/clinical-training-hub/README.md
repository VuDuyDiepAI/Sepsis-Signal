# Vinmec AI Clinical Training Hub

Ứng dụng đào tạo nội bộ bằng tiếng Việt: tài liệu → kiểm duyệt → tra cứu có nguồn → tạo học liệu → phê duyệt → xuất bản → phân công → học và kiểm tra → báo cáo và góp ý.

## Chạy ứng dụng

Yêu cầu Python 3.12+, Node.js 22.12+ và npm. Trong thư mục dự án:

```powershell
Copy-Item .env.example .env
.\start.ps1
```

Script cài thư viện, build giao diện, chạy migration và mở máy chủ tại [http://127.0.0.1:8000](http://127.0.0.1:8000). Nếu đã có `.env`, giữ file hiện tại. Lần đầu cần Internet để cài thư viện; chế độ demo chạy cục bộ, không cần API key trả phí.

Chạy để phát triển: backend dùng `python -m uvicorn backend.main:app --reload --port 8000` sau khi cài requirements và chạy `python -m alembic upgrade head`; frontend dùng `npm ci` rồi `npm run dev` tại cổng 5173. Kiểm tra bản build bằng `npm run build`.

Docker Compose:

```powershell
docker compose up --build -d
```

Ứng dụng Docker dùng cổng 8088 và PostgreSQL/pgvector. Cấu hình này chưa được xác nhận runtime trên máy hiện tại do lỗi lưu trữ Docker Desktop. Bản local dùng SQLite.

## Tài khoản demo

Mật khẩu mặc định: **`Demo@2026!`**. Mỗi dòng là một nhân viên giả lập khác nhau, mỗi nhân viên chỉ có một tài khoản.

| Email | Chức danh và quyền trong khoa Cấp cứu |
|---|---|
| `admin@demo.local` | Trưởng khoa — Admin |
| `manager@demo.local` | Điều dưỡng trưởng — Admin |
| `reviewer@demo.local` | Bác sĩ — Reviewer chuyên môn Cấp cứu |
| `staff@demo.local` | Điều dưỡng — Staff |
| `staff2@demo.local` | Bác sĩ — Staff |

Giao diện chia theo công việc: Admin chỉ thấy các phân hệ quản lý; Reviewer chỉ thấy tổng quan và kiểm duyệt; nhân viên giữ các chức năng học tập, tra cứu, lịch và chứng chỉ. Mỗi tài khoản có đúng một vai trò: Admin, Reviewer hoặc Staff; phạm vi khoa/phòng và chuyên môn được kiểm tra ở backend. Admin không có quyền Staff và không phê duyệt chuyên môn; Reviewer không tạo/sửa/xuất bản học liệu hoặc học như Staff. Vai trò Manager cũ được chuyển thành Admin qua migration 008. Vào **Quản trị hệ thống → Nhân viên → Chỉnh sửa** để chọn một vai trò và cấp/thu hồi phạm vi khoa, chuyên môn Reviewer. Người tạo, sửa hoặc gửi duyệt không được tự phê duyệt nội dung của mình.

Seed chỉ tạo tài khoản demo trên database mới khi `DEMO_MODE=true`. Đổi `DEMO_PASSWORD` trước lần seed đầu để dùng mật khẩu khác. Khi dùng database mới không có dữ liệu demo, đặt `DEMO_MODE=false`, `BOOTSTRAP_ADMIN_EMAIL` và `BOOTSTRAP_ADMIN_PASSWORD` tối thiểu 12 ký tự. Đổi cấu hình không xóa tài khoản cũ.

## Dữ liệu và các thư mục cần giữ

- `src/app/`: ghép ứng dụng, layout, điều hướng theo vai trò và thứ tự nạp CSS.
- `src/features/`: từng phân hệ — quản trị, tài liệu, trợ lý AI, học liệu, học tập, lịch, chứng chỉ, dashboard, báo cáo, góp ý và tác vụ xử lý. Component và CSS riêng nằm cùng phân hệ.
- `src/shared/`: API client, kiểu dữ liệu/quyền tài khoản, context, hook, hàm xử lý và UI/CSS dùng chung.
- `src/main.tsx`: điểm khởi chạy frontend; `backend/`: API và nghiệp vụ.
- `migrations/`: schema, phiên bản và snapshot bắt buộc để khởi tạo/nâng database.
- `data/`: database đang dùng, file upload, backup và log vận hành. Không xóa nếu muốn giữ dữ liệu.
- `demo/` và `scripts/create_samples.py`: tài liệu giả lập phục vụ seed; backend có sử dụng script này.
- `dist/`: giao diện đã build đang được máy chủ phục vụ; `node_modules/`: thư viện frontend đã cài.
- `scripts/package_source.py`: đóng gói source, loại trừ dữ liệu riêng và thư viện đã cài.
- [Hướng dẫn sử dụng](docs/PILOT_GUIDE.md).

API được sinh trực tiếp tại [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs). Không cần lưu bản báo cáo hoặc snapshot OpenAPI riêng.

## Quy ước frontend

```text
src/
├── main.tsx
├── app/                 # App, layout, workspace, styles.css
├── features/
│   ├── administration/  # Quản trị tài khoản, khoa/phòng, nhóm
│   ├── assistant/       # Chatbot và hội thoại
│   ├── calendar/        # Lịch đào tạo và nhắc hạn
│   ├── courses/         # Tạo, biên tập, kiểm duyệt, phân công học liệu
│   ├── credentials/     # Chứng chỉ
│   ├── dashboard/       # Tổng quan theo vai trò
│   ├── documents/       # Tài liệu, phiên bản, nguồn và kiểm duyệt
│   ├── feedback/        # Gửi và xử lý góp ý
│   ├── jobs/            # Tác vụ xử lý
│   ├── reports/         # Báo cáo đào tạo
│   └── training/        # Khóa học của tôi, học/quiz, hộp phân công
└── shared/
    ├── api/             # HTTP client
    ├── auth/            # Kiểu User và hàm kiểm tra quyền
    ├── context/         # Trạng thái dùng chung của ứng dụng
    ├── hooks/           # Hook tải dữ liệu
    ├── lib/             # Ngày, nhãn trạng thái, thống kê dùng chung
    ├── styles/          # CSS nền và quy tắc dùng nhiều phân hệ
    └── ui/              # Modal, bảng, bộ lọc, toast, trình soạn thảo
```

Dùng alias `@/` để import từ gốc `src`, ví dụ `@/shared/api/client`. Khi thêm trang, đặt trong phân hệ tương ứng và nối vào `app/App.tsx`; tránh gom các trang khác nghiệp vụ vào một file. `shared/` không import từ `features/` hoặc `app/`. Chỉ đưa phần được nhiều phân hệ sử dụng vào `shared/`.

CSS được nạp tập trung qua `app/styles.css` để giữ thứ tự ưu tiên. Khi thêm CSS của phân hệ, đăng ký tại đây; tránh import lại cùng stylesheet ở nhiều component. Sau khi đổi cấu trúc hoặc import, chạy `npm run build` và kiểm tra các trang bị ảnh hưởng.

## Giao diện và thao tác

Giao diện dùng header xanh, menu phân cấp theo quyền, các panel nghiệp vụ và bảng có sắp xếp/phân trang. Thư viện có bộ lọc nâng cao theo ngày và xuất danh sách đang lọc ra CSV. Trợ lý AI hiển thị lịch sử, nội dung trả lời và nguồn thực tế trong ba vùng riêng. Trang tạo khóa học bắt đầu bằng thông tin chung và chọn tài liệu nguồn được duyệt, sau đó tạo bản nháp có lưu tên, đối tượng và thời lượng. Trình biên tập gồm bốn bước; chuyển bước giữ nguyên bản nháp, có cảnh báo chưa lưu và xác nhận trước khi duyệt/xuất bản. Trên điện thoại, menu chuyển thành drawer và bảng hỗ trợ cuộn ngang.

Các chức năng chưa có API như đăng ký/điểm danh buổi học, tải tệp chứng chỉ, phân công người xử lý và trao đổi phản hồi được ghi rõ là chưa khả dụng. Không giả lập kết quả thành công. Kiểm tra giao diện và luồng nghiệp vụ dùng dữ liệu thử riêng trong `data/runtime/`; source đóng gói không chứa dữ liệu này.

## Cấu hình AI và giới hạn

Mặc định `AI_PROVIDER=demo`: truy xuất từ khóa/vector hash và tạo học liệu bằng template có trích dẫn; không gọi LLM. Tài liệu mẫu là tình huống giả lập, không phải quy trình y khoa chính thức.

Có thể cấu hình Ollama hoặc endpoint tương thích OpenAI qua `.env`: `AI_PROVIDER=ollama` hoặc `openai-compatible`, `AI_BASE_URL`, `AI_MODEL`, `AI_EMBEDDING_MODEL`, `AI_API_KEY`. Provider cần hỗ trợ `/embeddings`, `/chat/completions` và JSON response. Đổi mô hình embedding cần tạo lại index. Gửi tài liệu tới endpoint ngoài local bị chặn mặc định; chỉ bật `ALLOW_EXTERNAL_AI=true` sau khi tổ chức phê duyệt. Provider thực chưa được kiểm chứng với mô hình của tổ chức.

PDF cần có text layer; chưa có OCR. Nhắc hạn chỉ hiển thị trong ứng dụng. Chuyên môn Reviewer do Admin phân công, chưa đối chiếu tự động với hồ sơ năng lực. Kết quả học tập không tự gia hạn chứng chỉ hoặc công nhận CME.

File upload được bảo vệ bởi API; session dùng cookie HttpOnly, mật khẩu được hash. Khi triển khai thật cần HTTPS, `COOKIE_SECURE=true`, mật khẩu riêng, backup và đánh giá bảo mật/chuyên môn. Không dùng dữ liệu người bệnh thật trong prototype.
