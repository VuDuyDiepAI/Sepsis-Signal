# SEPSIS SIGNAL — TC-08

**MVP nghiên cứu hỗ trợ dự báo sớm nguy cơ nhiễm khuẩn huyết (sepsis) trong 6 giờ tiếp theo, trên dữ liệu mô phỏng.**

> Tài liệu này là **bản dự thảo để rà soát trước khi bàn giao**. Việc có mặt trên nhánh phát triển công khai không đồng nghĩa nội dung hoặc toàn bộ source đã được phép đưa sang repository nộp bài do đơn vị tổ chức quản lý. Không sử dụng hệ thống để quyết định lâm sàng.

## Bài toán và mục tiêu

Sinh hiệu, triệu chứng và kết quả xét nghiệm xuất hiện ở nhiều mốc thời gian, trong khi nguy cơ sepsis có thể diễn tiến nhanh. SEPSIS SIGNAL hỗ trợ người đánh giá xem lại diễn biến, nhận diện người bệnh cần được đánh giá kịp thời và ghi nhận việc xem xét cảnh báo. **Mục tiêu lâm sàng** là tạo điều kiện cho đánh giá/can thiệp sớm, hướng tới hạn chế diễn biến nặng; hiện chưa có bằng chứng kiểm định hiệu quả trên người bệnh thật.

## Giải pháp

- Mô hình **Logistic Regression điều chuẩn L2**, xây dựng bằng **Python/scikit-learn**, xử lý **36 đặc trưng**; thời hạn dự báo là **6 giờ tiếp theo**.
- **React / Vite / TypeScript + FastAPI**: màn hình Theo dõi & Cảnh báo, Hồ sơ, Chi tiết ca, Diễn tiến ca mẫu và Đánh giá mô hình.
- **PostgreSQL phía server** lưu ca nhập tay, sinh hiệu/xét nghiệm, phiên bản dự báo và sự kiện xem xét. Dữ liệu không mất chỉ vì đóng tab hoặc hết phiên đăng nhập.
- Khi sửa dữ liệu đầu vào, kết quả bị ảnh hưởng phải được vô hiệu hóa; chấm điểm mới chỉ được ghi nếu revision và lần chạy còn đúng. Ghi nhận “đã xem xét” **không đồng nghĩa đã chẩn đoán hay xử trí**.
- Chỉ dùng dữ liệu đã sẵn có tại thời điểm dự báo; không lấy kết quả xét nghiệm trước thời điểm trả kết quả.

**Ranh giới:** Chưa kết nối EMR bệnh viện; chưa thẩm định lâm sàng; không có bằng chứng dự án đã giảm biến chứng hoặc tử vong. Độ nhạy/PPV trên dữ liệu mô phỏng không tương đương hiệu quả triển khai thực tế.

## Công nghệ và cấu trúc

| Thành phần | Thư mục / công nghệ |
| --- | --- |
| Giao diện & API | `frontend/` — React/Vite; `backend/` — FastAPI |
| Lõi xử lý, huấn luyện, đánh giá | `src/`, `scripts/` — Python, scikit-learn |
| Mô hình và metadata | `artifacts/` |
| Dữ liệu mô phỏng | `data/` và fixtures trong `frontend/src/data/` |
| Kiểm thử | `tests/` và `frontend/tests/` — Python, Vitest, Playwright |
| Tài liệu phát triển/vận hành | `docs/` |

## Cài đặt và chạy cục bộ

Yêu cầu: **Node.js ≥ 22.13**, npm và **Python 3.11**. Chạy từ thư mục gốc trong PowerShell:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-api.txt
cd frontend
npm ci
npm run dev
```

Mở `http://127.0.0.1:3000`. Mọi tài khoản demo chỉ dùng trong môi trường kiểm thử được phép, **không đăng thông tin đăng nhập đang hoạt động vào bản nộp**.

## Kiểm thử

Tại `frontend/`:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Bộ test Python xem hướng dẫn trong [README của repository phát triển](../../README.md) và tài liệu [phát triển](../development.md). Chỉ ghi kết quả CI đã quan sát trên đúng commit, không coi “build thành công” là đã đủ kiểm chứng.

## Điều kiện trước khi chuyển sang repository nộp bài

Đọc [PRE_PUSH_CHECKLIST.md](PRE_PUSH_CHECKLIST.md) và yêu cầu của Owner. Chỉ chuyển các file **đã được phép chia sẻ**, không sao chép nguyên lịch sử Git; loại trừ dữ liệu cá nhân, thông tin tổ chức/nội bộ chưa được duyệt, bí mật, file SQLite, backup/log và file nhị phân chưa được rà soát. Repository Private không tự động làm dữ liệu trở thành an toàn.

Tài liệu này chỉ dành cho bước chuẩn bị nội dung. Quy định trong repository đích và phê duyệt trước khi tải lên vẫn có hiệu lực.
