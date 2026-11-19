# Sepsis Signal — Clinical UI

Giao diện nghiên cứu UI/UX nằm trong repository **VuDuyDiepAI/Sepsis-Signal**, nhánh `feat/clinical-ui-refresh`. Bản Streamlit, Python và mô hình gốc được giữ nguyên. Đây chưa phải phần mềm triển khai lâm sàng.

## Chạy trên máy

Yêu cầu Node.js 22 và npm. Từ thư mục repository:

```powershell
cd frontend
npm ci
npm run dev
```

Mở **http://localhost:3000**. Các hồ sơ mẫu vẫn xem độc lập, không cần chạy Streamlit. Chạy production cục bộ: `npm run build`, sau đó `npm run start`.

### Tạo ca mới và chấm điểm nhập tay

Bấm **Tạo ca mới** ở Tổng quan hoặc Hồ sơ. Tạo thông tin ban đầu, nhập sinh hiệu/xét nghiệm tại **T0** rồi lưu. Chọn **T0+1h**, nhập bổ sung nếu có hoặc bỏ chọn sinh hiệu mới để dùng bản ghi T0, rồi bấm **Lưu dữ liệu và chấm điểm**. Tiếp tục ở T0+2h và các giờ sau.

Ca nhập tay được giữ trong **sessionStorage của tab**, còn sau tải lại trang và mất khi kết thúc phiên tab. Không nhập danh tính người bệnh thật. Danh sách theo dõi, tổng quan và cảnh báo bao gồm cả các ca nhập tay trong tab.

Chấm điểm nhập tay cần Python đã cài `requirements.txt` ở máy chạy Next.js. Route `/api/manual-score` gọi `scripts/score_frontend_case.py`, tái sử dụng nguyên logic Python hiện có, tạo SQLite tạm riêng cho mỗi yêu cầu rồi xóa. Không thay đổi workbook, model hoặc SQLite cũ. Bộ chấm tính lại mọi giờ đã chấm khi sửa dữ liệu; giờ không đủ sinh hiệu sẽ không giữ điểm cũ. Ngưỡng và điểm được trả từ model, không sinh ngẫu nhiên.

Server tìm Python ở `.venv` của repository hoặc môi trường `sepsis-prototype` liền kề trên máy phát triển. Có thể đặt đường dẫn rõ ràng trước khi chạy Next.js:

```powershell
$env:SEPSIS_PYTHON = 'D:\duong-dan\.venv\Scripts\python.exe'
npm run dev
```

Đây là cầu nối chấm điểm cục bộ, chưa phải API EMR hay dịch vụ triển khai độc lập; không đóng gói Python vào bundle Next.js. Khi thiếu môi trường Python, biểu mẫu hiển thị lỗi và giữ dữ liệu đang nhập.

## Màn hình và tương tác

| Đường dẫn | Nội dung |
| --- | --- |
| `/dashboard` | Hàng đợi công việc: 3 cảnh báo hiện tại chưa xem xét có điểm cao nhất, hồ sơ chưa có kết quả, các ghi nhận vừa xem xét và phạm vi theo dõi. Không lặp lại bảng danh sách. |
| `/patients` | Danh sách đầy đủ, mặc định T0 mới nhất trước. Tìm mã, lọc nguồn nhập tay/mẫu, khoa, cảnh báo, xem xét; sắp xếp và phân trang. Liên kết mã hồ sơ hỗ trợ bàn phím. |
| `/patients/new` | Tạo ca và nhập dữ liệu tại T0; theo dõi ở các mốc sau bằng mô hình Python đang lưu. |
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
- Tổng quan dùng một mốc hiện tại cố định cho từng hồ sơ mẫu, chọn trong các bản nguồn để trải nghiệm nhiều trạng thái. Ca nhập tay dùng giờ đã lưu mới nhất. Cảnh báo lịch sử chỉ tính đến mốc đó.
- Biểu mẫu chỉ nhận giờ đo/lấy mẫu trong `[T0, T0+N]`. Giờ có dữ liệu được phép muộn hơn giờ đang xem; UI thông báo kết quả đang chờ và không dùng sớm. Các bản sửa cùng giờ đo hoặc cùng xét nghiệm/giờ lấy mẫu thay thế bản cũ trước khi lọc availability, tương ứng với cầu nối Python.
- Mốc giờ nằm trong URL `?hour=N`; đổi giờ, mở lại liên kết và tải lại đều giữ đúng mốc đang xem.
- Kết cục tham chiếu tách riêng khỏi fixture lâm sàng và không được đưa vào đầu vào mô hình. Không có dữ liệu người bệnh thật trong frontend.

Xuất lại fixtures từ thư mục repository, dùng Python đã cài requirements:

```powershell
python scripts/export_frontend_demo.py
```

## Giới hạn thao tác trải nghiệm

**Đây là mô hình nghiên cứu trên dữ liệu EMR mô phỏng, chưa được xác thực lâm sàng trên người bệnh thực tế.** Điểm mô hình không phải xác suất lâm sàng đã được hiệu chỉnh hay chẩn đoán. Dưới ngưỡng không loại trừ sepsis.

Ghi nhận xem xét được giữ trong sessionStorage của cùng tab, tối đa 8 giờ, gắn `predictionId` và `revision`. Tải lại vẫn giữ; bản tính thay đổi không thừa hưởng ghi nhận của bản cũ. Người nhập tên không được xác thực; không ghi vào cơ sở dữ liệu bệnh viện, không có cảnh báo hay escalation tự động. Bản Next.js chưa có đăng nhập bệnh viện, đồng bộ EMR hoặc API ghi hồ sơ bệnh viện. Bản Streamlit vẫn giữ nguyên.

`npm run dev` và `npm run start` mặc định chỉ lắng nghe `127.0.0.1`. API chấm điểm từ chối nguồn khác host và truy cập qua host từ xa khi chưa cấu hình token; giới hạn **2 yêu cầu đồng thời**, **20 yêu cầu/phút** trên mỗi tiến trình Next.js. Trả HTTP 429 kèm `Retry-After` khi đầy. Đây là biện pháp giới hạn cho demo cục bộ, chưa thay thế xác thực người dùng hoặc giới hạn phân tán. Không công khai server chỉ bằng cách đổi hostname.

Tích hợp API do người vận hành kiểm soát có thể đặt `SEPSIS_API_TOKEN` và gửi `Authorization: Bearer ...` từ phía server được tin cậy. Không đưa token vào biến `NEXT_PUBLIC_*` hoặc trình duyệt. Biểu mẫu trình duyệt hiện không cấp token này. Triển khai cho nhiều người dùng cần lớp đăng nhập, phiên người dùng, phân quyền và rate limit dùng chung phía server.

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
```

Next.js App Router, React, TypeScript strict, Tailwind, shadcn/ui, Lucide, Recharts, TanStack Table v8, React Hook Form và Zod. Font Inter được đóng gói cục bộ. Không phụ thuộc Google Fonts khi build/chạy.

`createClinicalReader` là lớp đọc chung cho các màn hình: fixture và ca nhập tay được hợp nhất trước khi áp dụng cùng quy tắc as-of. `ClinicalDataProvider` bất đồng bộ dùng cùng lớp đọc, là ranh giới để nối FastAPI về sau. Khi nối API cần bổ sung xác thực, quyền truy cập theo khoa, kiểm tra revision khi ghi review và audit phía server. Không coi state trình duyệt là hồ sơ bệnh viện.

## Kiểm tra bản demo

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

## Bàn giao Git

Chỉ push nhánh `feat/clinical-ui-refresh`, tạo Draft PR vào `main`; không merge. Không đưa `.next`, `node_modules`, `.env` hoặc SQLite vào Git.
