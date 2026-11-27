# Sepsis Signal

**MVP hỗ trợ cảnh báo sớm nguy cơ nhiễm khuẩn huyết (sepsis) trong 6 giờ tiếp theo**, giúp ưu tiên đánh giá các ca có diễn biến bất thường và hỗ trợ can thiệp kịp thời từ dữ liệu bệnh án điện tử (EMR) theo chuỗi thời gian.

> **Phạm vi & An toàn**: Hệ thống sử dụng **dữ liệu EMR mô phỏng** (`SYNTHETIC_MOCK_EMR`, 360 lượt khám / 12.960 mốc giờ) và **chưa kết nối EMR bệnh viện**. Kết quả chỉ phục vụ nghiên cứu và trải nghiệm luồng kỹ thuật, không dùng để chẩn đoán hay ra quyết định lâm sàng. Trạng thái **“đã xem xét”** chỉ ghi nhận việc rà soát cảnh báo, không đồng nghĩa đã hoàn tất xử trí.

## Chức năng chính

| Màn hình | Chức năng |
| --- | --- |
| **Theo dõi & Cảnh báo** (`/dashboard`) | Sắp xếp ưu tiên các cảnh báo hiện tại chưa xem xét; tách biệt với lịch sử. |
| **Hồ sơ theo dõi** (`/patients`) | Tìm kiếm, lọc, tạo ca mới và nhập sinh hiệu/xét nghiệm theo từng mốc giờ. |
| **Chi tiết hồ sơ** (`/patients/:id`) | Đối chiếu điểm nguy cơ, biểu đồ diễn biến, dữ liệu mới cập nhật và ghi nhận xem xét theo đúng phiên bản dự báo. |
| **Diễn tiến ca mẫu** (`/sample-cases`) | Tua lại diễn biến dữ liệu và điểm nguy cơ theo từng giờ trên 9 hồ sơ mô phỏng. |
| **Đánh giá mô hình** (`/model-monitoring`) | Theo dõi độ nhạy cấp người bệnh, PPV theo đợt 6 giờ, tải cảnh báo giả, thời gian báo trước, hiệu chỉnh và KTC 95% bootstrap. |

## Kiến trúc & Dữ liệu

```text
Sinh hiệu / Xét nghiệm / Triệu chứng (React UI hoặc Adapter EMR mô phỏng)
  → FastAPI (xác thực phiên, kiểm tra thời gian & revision, lưu PostgreSQL + hàng đợi work_jobs)
  → Worker chấm điểm độc lập (chỉ lọc dữ liệu available_at <= mốc dự báo, tổng hợp 36 đặc trưng trong [T0, t])
  → Tiền xử lý + Logistic Regression L2 (dự báo nguy cơ sepsis 6 giờ tới, ngưỡng 40,80%)
  → Kết quả theo revision, poll trạng thái qua /api/jobs/{job_id}, cảnh báo và lịch sử xem xét
```

* **Trục thời gian & chống rò rỉ**: $T_0$ là mốc hoàn tất phân loại; hệ thống chấm từ $T_0+1\text{h}$ đến $T_0+36\text{h}$ trên cửa sổ quan sát mở rộng $[T_0, t]$. Xét nghiệm chỉ được đưa vào tính điểm từ thời điểm trả kết quả (`available_at`), không hồi tố dữ liệu đến muộn. Cổng đầu vào kiểm tra chéo `DBP < SBP` và ngưỡng sinh lý theo đúng đơn vị từng xét nghiệm.
* **Chính sách cảnh báo (`alert-episodes-6h-v2`) & Đối chứng lâm sàng**: Ngưỡng cảnh báo (`40,80%`) chọn trên tập validation đạt độ nhạy cấp người bệnh $\ge 80\%$ theo đợt cảnh báo khóa cứng 6 giờ. Giao diện ca bệnh đối chiếu song song `qSOFA / SIRS / MEWS`, hộp tham khảo *SSC Hour-1 Sepsis Bundle* và phân loại phản hồi lâm sàng có cấu trúc.
* **Vận hành & Kiểm định tiền cứu im lặng**: Serving tải mô hình độc lập qua `artifacts/mock_emr_hourly_lr/manifest.json` (không yêu cầu mount file Excel huấn luyện), đo độ trễ từng job (`duration_ms`), kiểm tra sức khỏe mô hình/hàng đợi qua `GET /api/health`, và hỗ trợ `SEPSIS_SILENT_MODE=1` (lưu đủ dự báo vào DB phục vụ nghiên cứu nhưng ẩn cảnh báo khỏi UI lâm sàng).
* **Adapter EMR mô phỏng**: `POST /api/emr/events` nhận sự kiện có xác thực Bearer key, chuẩn hóa đơn vị xét nghiệm (`µmol/L → mg/dL`), chống trùng lặp và ghi nhận thời điểm thực nhận (`received_at`).

## Khởi chạy nhanh

### 1. Chạy đầy đủ bằng Docker (Khuyến nghị)

Yêu cầu **Docker Desktop**.

```powershell
Copy-Item .env.example .env
# Cập nhật các secret riêng trong .env
docker compose up -d --build
```

Mở ứng dụng tại `http://127.0.0.1:8000` (gồm PostgreSQL 17, FastAPI API và tiến trình Worker chấm điểm riêng). Khi bật `SEPSIS_DEMO_ACCOUNTS=1` ở môi trường cục bộ, có thể đăng nhập bằng `bacsi.demo1` hoặc `bacsi.demo2` (mật khẩu: `SepsisDemo2026!`).

### 2. Chạy phát triển cục bộ

Yêu cầu **Python 3.11** và **Node.js 22.12+**.

```powershell
# Backend + worker nhúng (Terminal 1)
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
docker compose up -d db
.\.venv\Scripts\python.exe scripts/serve_api.py --port 8000 --embedded-worker

# Frontend Vite (Terminal 2 - mở http://127.0.0.1:3000)
cd frontend
npm ci
npm run dev
```

## Kiểm thử & Huấn luyện lại

```powershell
# Kiểm thử Python (lõi đặc trưng, đánh giá cảnh báo, golden fixtures, FastAPI & DB)
.\.venv\Scripts\python.exe -m pytest -q tests backend/tests

# Kiểm thử & build Frontend
cd frontend
npm run typecheck
npm run lint
npm test
npm run build
# Tùy chọn E2E trên trình duyệt (cần cài Chromium 1 lần: npx playwright install chromium)
npm run test:e2e
```

```powershell
# Huấn luyện lại mô hình & xuất lại dữ liệu mẫu frontend (khi cập nhật workbook)
.\.venv\Scripts\python.exe scripts/train_mock_emr.py
.\.venv\Scripts\python.exe scripts/export_frontend_demo.py

# Benchmark độc lập (LR L2 vs RandomForest vs HistGBDT vs qSOFA/SIRS/MEWS/NEWS2)
.\.venv\Scripts\python.exe scripts/benchmark_models.py --source mock
# Hoặc chạy ETL + CV trên bộ zip MIMIC-IV Demo + MIMIC-IV-ED Demo
.\.venv\Scripts\python.exe scripts/benchmark_models.py --source mimic-demo --mimic-zip <path-mimic.zip> --ed-zip <path-ed.zip>
```

## Cấu trúc thư mục

```text
frontend/    Giao diện web React + Vite + TypeScript, unit tests và Playwright E2E
backend/     FastAPI, SQLAlchemy (PostgreSQL/SQLite), xác thực, adapter EMR và worker
src/         Lõi Python: tổng hợp đặc trưng [T0, t], suy luận mô hình và đánh giá đợt cảnh báo 6h
scripts/     Huấn luyện mô hình, xuất fixtures, cầu nối chấm điểm và tiện ích vận hành
data/        Workbook EMR mô phỏng (mock_ed_hospital_emr_v3_hourly.xlsx)
artifacts/   Mô hình đã huấn luyện và metadata kiểm định (SHA-256)
tests/       Kiểm thử đơn vị, tích hợp và golden fixtures đối chiếu
```
