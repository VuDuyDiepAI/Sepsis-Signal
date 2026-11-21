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

Yêu cầu **Node.js ≥22.13**, npm và **Python 3.11**. Thực hiện tại thư mục gốc repository trong PowerShell:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd frontend
npm ci
npm run dev
```

Mở [Sepsis Signal trên máy](http://127.0.0.1:3000). Bên dưới biểu mẫu đăng nhập có hai tài khoản trải nghiệm dùng chung: `bacsi.demo1`, `bacsi.demo2`, mật khẩu `SepsisDemo2026!`. Không có bước đăng ký. Launcher cục bộ chỉ mở trên `127.0.0.1`.

Để chạy bản build, từ `frontend/` dùng `npm run build`, sau đó `npm run start`. Chấm ca nhập tay cần môi trường Python; nếu Python ở vị trí khác, đặt `SEPSIS_PYTHON` tới executable tương ứng trước khi chạy web. Không cần khởi chạy Streamlit.

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

Ca nhập tay, các bản dự báo và lịch sử xem xét được lưu trong **SQLite phía máy chủ** tại `data/frontend_clinical.sqlite3` (đổi bằng `SEPSIS_WEB_DB`). Lưu chỉ số tách khỏi chấm điểm: Python lỗi vẫn giữ dữ liệu để chấm lại. Phiên đăng nhập hết hạn sau 8 giờ; dữ liệu và ghi nhận xem xét không hết hạn cùng phiên.

## Cấu trúc repository

```text
frontend/       Web Next.js, API và kiểm thử giao diện
src/            Lõi Python: dữ liệu, đặc trưng, suy luận, đánh giá
scripts/        Huấn luyện, xuất ca mẫu, cầu nối Python, sao lưu
data/           Workbook mẫu; SQLite cục bộ không đưa lên Git
artifacts/      Mô hình đã huấn luyện, tiền xử lý và metadata
tests/          Kiểm thử Python: unit, integration, streamlit
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
- [Đăng nhập, SQLite, migrations và sao lưu](docs/operations.md).
- [Huấn luyện và cập nhật dữ liệu](docs/model-development.md).
- [Chạy giao diện Streamlit](docs/streamlit.md).
