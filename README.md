# Sepsis Signal

**AI hỗ trợ cảnh báo sớm nguy cơ nhiễm khuẩn huyết tại Khoa Cấp cứu – Bệnh viện Đa khoa Quốc tế Vinmec.**

Sepsis Signal tổng hợp sinh hiệu, xét nghiệm và diễn biến người bệnh theo thời gian để dự báo **nguy cơ sepsis trong 6 giờ tiếp theo**. Mục tiêu là hỗ trợ bác sĩ nhận diện ca cần đánh giá sớm và có cơ hội can thiệp kịp thời. Giảm công tổng hợp dữ liệu là lợi ích hỗ trợ cho mục tiêu lâm sàng này.

## Trải nghiệm ứng dụng

| Khu vực | Chức năng |
| --- | --- |
| **Theo dõi & Cảnh báo** | Ưu tiên các cảnh báo hiện tại chưa xem xét; phân biệt với lịch sử. |
| **Hồ sơ theo dõi** | Tìm kiếm, tạo ca, nhập sinh hiệu và xét nghiệm theo giờ. |
| **Chi tiết hồ sơ** | Đối chiếu điểm nguy cơ, biểu đồ, dữ kiện thay đổi và ghi nhận xem xét. |
| **Diễn tiến ca mẫu** | Xem dữ liệu và nguy cơ thay đổi qua các mốc thời gian. |
| **Đánh giá mô hình** | Theo dõi độ nhạy theo người bệnh, PPV theo đợt, cảnh báo giả và thời gian báo trước. |

Luồng chính: **nhận cảnh báo → mở hồ sơ → đánh giá dữ liệu → ghi nhận xem xét**. Ghi nhận đã xem xét gắn với đúng phiên bản dự báo, không đồng nghĩa đã hoàn tất xử trí.

## Chạy bản web

Bản web dùng **React + Vite → FastAPI → PostgreSQL**, với tiến trình worker chấm điểm riêng. Không cần chạy Streamlit. Yêu cầu Docker Desktop; Node.js 22.12+ nếu phát triển giao diện trên máy.

```powershell
Copy-Item .env.example .env
# Thay các secret mẫu trong .env bằng giá trị ngẫu nhiên riêng.
docker compose up -d --build
```

Mở [Sepsis Signal](http://127.0.0.1:8000). Khi bật `SEPSIS_DEMO_ACCOUNTS=1` trong môi trường cục bộ, tài khoản trải nghiệm là `bacsi.demo1` hoặc `bacsi.demo2`, mật khẩu `SepsisDemo2026!`. Không có đăng ký. Dữ liệu nằm trong volume PostgreSQL, không mất khi đóng tab hoặc đăng xuất.

Để phát triển UI trong terminal riêng:

```powershell
cd frontend
npm ci
npm run dev
```

Mở [giao diện phát triển](http://127.0.0.1:3000); Vite chuyển tiếp `/api` đến FastAPI cổng 8000. Khi chỉ chạy API trên máy, xem [hướng dẫn phát triển](docs/development.md). Không đưa secret vào biến `VITE_*`.

## Đường đi của dữ liệu

```text
Sinh hiệu / xét nghiệm / triệu chứng theo thời gian
    → Chỉ chọn dữ liệu đã có trên EMR tại mốc dự báo
    → Tổng hợp 36 đặc trưng trong [T0, mốc dự báo]
    → Tiền xử lý + hồi quy logistic L2
    → Điểm nguy cơ sepsis trong 6 giờ tiếp theo
    → Cảnh báo, diễn biến và ghi nhận xem xét
```

T0 là thời điểm hoàn tất phân loại: có thể nhập và lưu dữ liệu ngay tại T0; chấm từ T0+1 đến T0+36 giờ. **6 giờ dự báo tương lai khác với cửa sổ quan sát tăng dần từ T0.** Xét nghiệm chỉ được dùng từ thời điểm trả kết quả, không phải thời điểm lấy mẫu.

Ca nhập tay, dữ liệu EMR chuẩn hóa, dự báo, job và lịch sử xem xét được lưu trong **PostgreSQL**. Lưu chỉ số và tạo job nằm trong cùng transaction. Worker nạp mô hình Python, chấm ngoài HTTP request và chỉ ghi kết quả khi revision, mã lần chạy và chính sách mô hình còn khớp. Phiên đăng nhập hết hạn sau 8 giờ; dữ liệu và ghi nhận xem xét không hết hạn cùng phiên.

Adapter EMR đã nhận được sự kiện mô phỏng qua API, chuẩn hóa đơn vị, chống trùng và giữ thời điểm dữ liệu đến. **Chưa kết nối EMR bệnh viện.** Bộ chuyển đổi SQLite cũ có đối chiếu từng trường và không ghi đè nguồn: [kế hoạch chuyển đổi](docs/migration/PLAN.md).

## Cấu trúc repository

```text
frontend/       React + Vite: màn hình theo tính năng, API client, E2E
backend/        FastAPI, PostgreSQL, xác thực, adapter EMR và worker
src/            Lõi Python: dữ liệu, đặc trưng, suy luận, đánh giá
scripts/        Huấn luyện, xuất ca mẫu, cầu nối Python, sao lưu
data/           Workbook mẫu; SQLite cục bộ không đưa lên Git
artifacts/      Mô hình đã huấn luyện, tiền xử lý và metadata
tests/          Kiểm thử lõi Python và fixtures đối chiếu mô hình
app/            Giao diện Streamlit chạy độc lập, dùng chung lõi Python
docs/           Kiến trúc, dữ liệu, phát triển và vận hành
.github/        CI cho Python và web
```

## Dữ liệu và tài liệu

Dữ liệu đi kèm là **EMR mô phỏng: 360 lượt khám / 12.960 mốc giờ**. Workbook có sheet `Guide` và `DataDictionary` mô tả schema, đơn vị và vai trò từng trường. Mô hình hiện tại học trên dữ liệu mô phỏng; kết quả chưa chứng minh hiệu năng lâm sàng trên người bệnh thật. Điểm và cảnh báo hỗ trợ đánh giá, không xác định chẩn đoán sepsis.

- [Tải workbook và xem schema](data/mock_ed_hospital_emr_v3_hourly.xlsx).
- [Kiến trúc và ranh giới các thành phần](docs/architecture.md).
- [Dữ liệu, đặc trưng và cách đánh giá](docs/data-and-model.md).
- [Cài đặt, phát triển và kiểm thử](docs/development.md).
- [Đăng nhập, PostgreSQL, migrations và sao lưu](docs/operations.md).
- [Huấn luyện và cập nhật dữ liệu](docs/model-development.md).
- [Chạy giao diện Streamlit](docs/streamlit.md).
