# Sepsis Signal — Clinical UI

Giao diện nghiên cứu UI/UX nằm trong repository **VuDuyDiepAI/Sepsis-Signal**, nhánh `feat/clinical-ui-refresh`. Bản Streamlit, Python và mô hình gốc được giữ nguyên. Đây chưa phải phần mềm triển khai lâm sàng.

## Chạy trên máy

Yêu cầu Node.js 22 và npm. Từ thư mục repository:

```powershell
cd frontend
npm ci
npm run dev
```

Mở **http://localhost:3000**. Không cần chạy Python hoặc Streamlit để trải nghiệm giao diện. Chạy production cục bộ: `npm run build`, sau đó `npm run start`.

## Màn hình và tương tác

| Đường dẫn | Nội dung |
| --- | --- |
| `/dashboard` | Tổng hồ sơ, cảnh báo chờ xem xét, số hồ sơ đã xem xét và chưa có kết quả. Bảng có tìm kiếm, lọc khoa/cảnh báo/xem xét, sắp xếp, phân trang và mở hồ sơ. |
| `/patients` | Danh sách hồ sơ với cùng bộ lọc và thứ tự ưu tiên. |
| `/patients/[id]?hour=8` | Điểm và ngưỡng nguồn, thay đổi điểm phần trăm, biểu đồ đến giờ chọn, sinh hiệu, xét nghiệm, ghi nhận xem xét theo phiên bản. |
| `/alerts` | Cảnh báo hiện tại chưa xem xét, các bản đã xem xét và lịch sử vượt ngưỡng. Mỗi bản liên kết đến đúng hồ sơ/giờ. |
| `/sample-cases` | Chọn hồ sơ, đi qua T0–T0+36, hiển thị dữ liệu theo availability. Mốc khởi phát chỉ tải/hiện khi bật tùy chọn tham chiếu. |
| `/model-monitoring` | Metadata và chỉ số validation/temporal holdout sepsis. Mô hình shock nằm trong phần mở rộng riêng. |

Sidebar thu gọn trên desktop; menu dialog trên tablet/mobile. Có trạng thái tải, không tìm thấy, dữ liệu thiếu và lỗi có nút thử lại. Biểu đồ có tooltip và chọn điểm để quay về giờ cũ; bộ chọn giờ cho phép đi tiếp.

## Dữ liệu và quy tắc

- Fixtures chứa **9 lượt khám mô phỏng, 178 điểm dự báo** từ workbook `data/mock_ed_hospital_emr_v3_hourly.xlsx` và mô hình sepsis đang lưu. Không sinh điểm ngẫu nhiên.
- `scripts/export_frontend_demo.py` chỉ đọc workbook/artifacts, gọi `predict_proba` trên đúng 36 đặc trưng nguồn và xuất JSON. Không huấn luyện, không cập nhật nguồn. Kiểm tra SHA-256 của workbook và artifacts trước/sau xuất.
- Điểm được xuất từ các snapshot đủ điều kiện theo hợp đồng của trang ca mẫu hiện có. Một số giờ không có điểm nguồn; UI hiển thị **chưa có kết quả**, không thay bằng 0 hay điểm của giờ khác.
- T0 là hoàn tất phân loại, chưa chấm điểm. Các lần dự báo từ T0+1h đến T0+36h; horizon 6 giờ tương lai khác cửa sổ quan sát tăng dần `[T0, giờ dự báo]`.
- Sinh hiệu/xét nghiệm chỉ hiện nếu thời điểm đo/lấy mẫu từ T0 và `measured/collected_at <= available_at <= giờ đang xem`. Chọn giá trị theo thứ tự thời gian đo/lấy mẫu, rồi availability. Giữ nguyên null và đơn vị nguồn.
- Múi giờ cố định `Asia/Ho_Chi_Minh` (+07:00), kể cả khi trình duyệt chạy múi giờ khác.
- Ngưỡng hiện tại lấy từ metadata: khoảng **2,76%**; UI giữ nguyên độ chính xác số khi so sánh. Phần trăm hiển thị được làm tròn 2 chữ số.
- Bảng tổng quan dùng một mốc hiện tại cố định cho từng hồ sơ, chọn trong các bản nguồn để trải nghiệm nhiều trạng thái. Cảnh báo lịch sử chỉ tính đến mốc đó.
- Kết cục tham chiếu tách riêng khỏi fixture lâm sàng và không được đưa vào đầu vào mô hình. Không có dữ liệu người bệnh thật trong frontend.

Xuất lại fixtures từ thư mục repository, dùng Python đã cài requirements:

```powershell
python scripts/export_frontend_demo.py
```

## Giới hạn thao tác trải nghiệm

**Đây là mô hình nghiên cứu trên dữ liệu EMR mô phỏng, chưa được xác thực lâm sàng trên người bệnh thực tế.** Điểm mô hình không phải xác suất lâm sàng đã được hiệu chỉnh hay chẩn đoán. Dưới ngưỡng không loại trừ sepsis.

Ghi nhận xem xét chỉ giữ trong React Context của phiên trình duyệt, gắn `predictionId` và `revision`. Tải lại trang sẽ mất. Người nhập tên không được xác thực; không ghi SQLite, không gửi hệ thống bệnh viện, không có cảnh báo hay escalation tự động. Bản Next.js chưa có nhập ca mới/chấm trực tiếp, đăng nhập bệnh viện, đồng bộ EMR hoặc API ghi dữ liệu. Bản Streamlit vẫn giữ chức năng nhập tay hiện có.

## Cấu trúc triển khai

```text
frontend/
  src/app/                  # App Router, layout, 5 màn hình + danh sách hồ sơ
  src/components/layout/    # Shell, điều hướng, header, panel
  src/components/clinical/  # Workspace, biểu đồ, sinh hiệu, xét nghiệm, review, replay
  src/components/dashboard/ # Summary và TanStack Table
  src/components/shared/    # Empty state, clinical note
  src/components/ui/        # shadcn/ui (Base UI primitives)
  src/components/review-context.tsx
  src/lib/clinical-types.ts # Hợp đồng TypeScript
  src/lib/clinical-data.ts  # Typed read adapter và hàm as-of
  src/data/                 # Fixture nguồn + tham chiếu tách biệt
  tests/                    # Contract/component tests + Playwright
```

Next.js App Router, React, TypeScript strict, Tailwind, shadcn/ui, Lucide, Recharts, TanStack Table v8, React Hook Form và Zod. Font Inter được đóng gói cục bộ. Không phụ thuộc Google Fonts khi build/chạy.

`ClinicalDataProvider` định nghĩa lớp đọc bất đồng bộ để thay bằng FastAPI về sau. Khi nối API cần bổ sung xác thực, quyền truy cập theo khoa, kiểm tra revision khi ghi review và audit phía server. Không coi state trình duyệt là hồ sơ bệnh viện.

## Kiểm thử

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Nếu đã có Chromium: đặt `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` trỏ đến executable trước khi chạy E2E. Playwright tự chạy dev server nếu cổng 3000 chưa có server. CI frontend dùng Node 22, `npm ci`, các kiểm tra trên và Chromium. Workflow backend giữ nguyên.

Contract tests kiểm tra metadata/checksum, thứ tự ưu tiên, scope revision, giờ +07:00, dữ liệu trả muộn, không xuất nhãn vào fixture lâm sàng, thiếu dữ liệu và chênh lệch điểm. Component tests đối chiếu số nguồn và T0. E2E kiểm tra search/filter/sort/pagination/navigation, review trong phiên, replay, tham chiếu, metrics, unknown ID và cả 5 màn hình ở **1440/1280/1024/768/390px**.

## Bàn giao Git

Ảnh cả 5 màn hình và biên bản kiểm tra ở [`docs/VALIDATION.md`](docs/VALIDATION.md).

Chỉ push nhánh `feat/clinical-ui-refresh`, tạo Draft PR vào `main`; không merge. Không đưa `.next`, `node_modules`, `.env`, SQLite hoặc traces chạy test vào Git.
