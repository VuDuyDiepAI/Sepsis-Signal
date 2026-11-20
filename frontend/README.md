# Sepsis Signal — Clinical UI

Giao diện nghiên cứu UI/UX nằm trong repository **VuDuyDiepAI/Sepsis-Signal**, nhánh `feat/clinical-ui-refresh`. Bản Streamlit, Python và mô hình gốc được giữ nguyên. Đây chưa phải phần mềm triển khai lâm sàng.

## Chạy trên máy

Yêu cầu Node.js **22.13 trở lên** (có `node:sqlite`) và npm. Từ thư mục repository:

```powershell
cd frontend
npm ci
npm run dev
```

Mở **http://localhost:3000**. Các hồ sơ mẫu vẫn xem độc lập, không cần chạy Streamlit. Chạy production cục bộ: `npm run build`, sau đó `npm run start`.

### Tạo ca mới và chấm điểm nhập tay

Bấm **Tạo ca mới** ở Hồ sơ theo dõi. Tạo thông tin ban đầu, nhập sinh hiệu/xét nghiệm tại **T0** rồi lưu. Chọn **T0+1h**, nhập bổ sung nếu có hoặc bỏ chọn sinh hiệu mới để dùng bản ghi T0, rồi bấm **Lưu dữ liệu và chấm điểm**. Tiếp tục ở T0+2h và các giờ sau.

Hồ sơ nhập tay, các lần nhập, kết quả dự báo và ghi nhận xem xét được lưu trong **SQLite phía máy chủ** tại `data/frontend_clinical.sqlite3`. Có thể đóng tab, mở lại hoặc dùng tab khác trên cùng máy chủ mà vẫn xem được hồ sơ. Giao diện tải lại dữ liệu khi quay về tab và đồng bộ định kỳ 10 giây. Không nhập danh tính người bệnh thật.

Chấm điểm nhập tay cần Python đã cài `requirements.txt` ở máy chạy Next.js. Route `PUT /api/cases/[id]/entries` gọi `scripts/score_frontend_case.py` và lưu dữ liệu cùng kết quả bằng một transaction. `/api/manual-score` vẫn hỗ trợ chấm không lưu. Cả hai tái sử dụng nguyên logic Python hiện có, tạo SQLite tạm riêng cho mỗi yêu cầu rồi xóa. Không thay đổi workbook, model hoặc SQLite cũ. Bộ chấm tính lại mọi giờ đã chấm khi sửa dữ liệu; giờ không đủ sinh hiệu sẽ không giữ điểm cũ. Ngưỡng và điểm được trả từ model, không sinh ngẫu nhiên.

Server tìm Python ở `.venv` của repository hoặc môi trường `sepsis-prototype` liền kề trên máy phát triển. Có thể đặt đường dẫn rõ ràng trước khi chạy Next.js:

```powershell
$env:SEPSIS_PYTHON = 'D:\duong-dan\.venv\Scripts\python.exe'
npm run dev
```

Đây là cầu nối chấm điểm cục bộ, chưa phải API EMR hay dịch vụ triển khai độc lập; không đóng gói Python vào bundle Next.js. Khi thiếu môi trường Python, biểu mẫu hiển thị lỗi và giữ dữ liệu đang nhập.

## Màn hình và tương tác

| Đường dẫn | Nội dung |
| --- | --- |
| `/dashboard` | Theo dõi & Cảnh báo: một bảng duy nhất, mặc định các ca vượt ngưỡng hiện tại chưa xem xét. Có hai phạm vi Hiện tại/Lịch sử, bộ lọc xem xét độc lập, dữ liệu vừa thay đổi và liên kết mở đúng hồ sơ/giờ. |
| `/patients` | Danh sách đầy đủ, mặc định T0 mới nhất trước. Tìm mã, lọc nguồn nhập tay/mẫu, khoa, cảnh báo, xem xét; sắp xếp và phân trang. Liên kết mã hồ sơ hỗ trợ bàn phím. |
| `/patients/new` | Tạo ca và nhập dữ liệu tại T0; theo dõi ở các mốc sau bằng mô hình Python đang lưu. |
| `/patients/[id]?hour=8` | Điểm và ngưỡng nguồn, thay đổi điểm phần trăm, biểu đồ đến giờ chọn, sinh hiệu, xét nghiệm, ghi nhận xem xét theo phiên bản. |
| `/alerts` | Đường dẫn tương thích, chuyển về `/dashboard` và giữ các bộ lọc hợp lệ. Không còn màn hình/sidebar cảnh báo độc lập. |
| `/sample-cases` | Chọn hồ sơ, đi qua T0–T0+36, hiển thị dữ liệu theo availability. Mốc khởi phát chỉ tải/hiện khi bật tùy chọn tham chiếu. |
| `/model-monitoring` | Metadata và chỉ số validation/temporal holdout sepsis. Mô hình shock nằm trong phần mở rộng riêng. |

Sidebar thu gọn trên desktop; menu dialog trên tablet/mobile. Có trạng thái tải, không tìm thấy, dữ liệu thiếu và lỗi có nút thử lại. Biểu đồ có tooltip và chọn điểm để quay về giờ cũ; bộ chọn giờ cho phép đi tiếp.

Sidebar có hai màn hình lâm sàng (Theo dõi & Cảnh báo, Hồ sơ theo dõi) và hai màn hình nghiên cứu (Diễn tiến ca mẫu, Đánh giá mô hình). Không có danh sách ưu tiên thứ hai, khối Vừa xem xét hoặc Phạm vi theo dõi trên trang chính. Hồ sơ chi tiết đi thẳng vào thanh người bệnh, mốc giờ và dữ liệu lâm sàng. Thông tin thuật toán nằm ở trang Đánh giá mô hình.

Luồng chính: nhận cảnh báo → mở hồ sơ → đối chiếu dữ liệu → ghi nhận xem xét → quay về đúng bộ lọc danh sách. `returnTo` chỉ nhận hai đường dẫn danh sách nội bộ và được giữ khi đổi giờ. Ghi nhận xem xét không đồng nghĩa đã hoàn tất xử trí; chỉ có hiệu lực với đúng ID/revision dự báo.

Trên desktop (từ 1024 px), các màn hình dùng chiều cao cửa sổ: thanh công cụ và phân trang cố định, số dòng tự điều chỉnh theo vùng bảng. Không kéo dài toàn bộ trang; dữ liệu dài hoặc mở thêm chi tiết được cuộn trong vùng nội dung. Trên mobile hoặc khi phóng to làm cửa sổ hẹp hơn, trang cho phép cuộn tự nhiên để giữ chữ và thao tác dễ đọc.

Hồ sơ hiển thị nguy cơ, biểu đồ, sinh hiệu, xét nghiệm và ghi nhận xem xét đồng thời trên một bảng điều khiển vừa khung desktop. Ca nhập tay có thêm mục Nhập chỉ số tách biệt với bảng tổng hợp; không chia dữ liệu lâm sàng ra nhiều tab. Biểu mẫu nhập có ba nhóm Sinh hiệu, Xét nghiệm, Triệu chứng và khoa; đổi nhóm giữ nguyên giá trị chưa lưu. Giờ sinh hiệu mặc định theo mốc đang nhập, có thể mở mục Chỉnh giờ đo và giờ có trên EMR để sửa. Sau khi chấm thành công, giao diện chuyển sang Tổng hợp. Đánh giá mô hình cũng dùng tab cho sepsis, shock và nguồn dữ liệu.

Hiện tại chỉ gồm bản vượt ngưỡng tại `currentHour` của mỗi ca; Lịch sử chỉ gồm các bản trước giờ đó, không lẫn hiện tại hoặc tương lai. Trạng thái xem xét được lọc riêng trong từng phạm vi. Số liệu tóm tắt luôn tính theo mốc hiện tại, chưa áp dụng bộ lọc tìm kiếm. Dữ liệu vừa thay đổi so sánh giá trị gần nhất đã có tại giờ chọn với giờ trước, kèm cả thời điểm đo/lấy mẫu và thời điểm có trên EMR. Giá trị thiếu, kết quả chưa trả hoặc mẫu cũ trả muộn không được suy diễn thành thay đổi; đây không phải giải thích đóng góp đặc trưng hay nguyên nhân gây sepsis.

## Dữ liệu và quy tắc

- Fixtures chứa **9 lượt khám mô phỏng, 178 điểm dự báo** từ workbook `data/mock_ed_hospital_emr_v3_hourly.xlsx` và mô hình sepsis đang lưu. Không sinh điểm ngẫu nhiên.
- `scripts/export_frontend_demo.py` chỉ đọc workbook/artifacts, gọi `predict_proba` trên đúng 36 đặc trưng nguồn và xuất JSON. Không huấn luyện, không cập nhật nguồn. Kiểm tra SHA-256 của workbook và artifacts trước/sau xuất.
- Điểm được xuất từ các snapshot đủ điều kiện theo hợp đồng của trang ca mẫu hiện có. Một số giờ không có điểm nguồn; UI hiển thị **chưa có kết quả**, không thay bằng 0 hay điểm của giờ khác.
- T0 là hoàn tất phân loại, chưa chấm điểm. Các lần dự báo từ T0+1h đến T0+36h; horizon 6 giờ tương lai khác cửa sổ quan sát tăng dần `[T0, giờ dự báo]`.
- Sinh hiệu/xét nghiệm chỉ hiện nếu thời điểm đo/lấy mẫu từ T0 và `measured/collected_at <= available_at <= giờ đang xem`. Chọn giá trị theo thứ tự thời gian đo/lấy mẫu, rồi availability. Giữ nguyên null và đơn vị nguồn.
- Múi giờ cố định `Asia/Ho_Chi_Minh` (+07:00), kể cả khi trình duyệt chạy múi giờ khác.
- Ngưỡng hiện tại lấy từ metadata: khoảng **40,80%**; UI giữ nguyên độ chính xác số khi so sánh. Phần trăm hiển thị được làm tròn 2 chữ số.
- Theo dõi & Cảnh báo dùng một mốc hiện tại cố định cho từng hồ sơ mẫu, chọn trong các bản nguồn để trải nghiệm nhiều trạng thái. Ca nhập tay dùng giờ đã lưu mới nhất. Cảnh báo lịch sử chỉ tính các giờ trước mốc đó.
- Biểu mẫu chỉ nhận giờ đo/lấy mẫu trong `[T0, T0+N]`. Giờ có dữ liệu được phép muộn hơn giờ đang xem; UI thông báo kết quả đang chờ và không dùng sớm. Các bản sửa cùng giờ đo hoặc cùng xét nghiệm/giờ lấy mẫu thay thế bản cũ trước khi lọc availability, tương ứng với cầu nối Python.
- Mốc giờ nằm trong URL `?hour=N`; đổi giờ, mở lại liên kết và tải lại đều giữ đúng mốc đang xem.
- Kết cục tham chiếu tách riêng khỏi fixture lâm sàng và không được đưa vào đầu vào mô hình. Không có dữ liệu người bệnh thật trong frontend.

Xuất lại fixtures từ thư mục repository, dùng Python đã cài requirements:

```powershell
python scripts/export_frontend_demo.py
```

## Giới hạn thao tác trải nghiệm

**Đây là mô hình nghiên cứu trên dữ liệu EMR mô phỏng, chưa được xác thực lâm sàng trên người bệnh thực tế.** Điểm mô hình không phải xác suất lâm sàng đã được hiệu chỉnh hay chẩn đoán. Dưới ngưỡng không loại trừ sepsis.

Ghi nhận xem xét lưu trên máy chủ, không tự hết hạn sau 8 giờ, gắn `predictionId` và `revision`. Bản tính thay đổi hoặc không còn đủ dữ liệu không thừa hưởng ghi nhận cũ; lịch sử vẫn đọc được trong phần xem xét của mốc đó. Nhấn lưu chỉ báo thành công sau khi server ghi xong; yêu cầu cũ bị từ chối bằng HTTP 409 để tránh ghi đè giữa hai tab. Người nhập tên chưa được xác thực bằng tài khoản bệnh viện. Bản Next.js chưa có SSO, đồng bộ EMR hoặc API ghi hồ sơ bệnh viện; phạm vi truy cập vẫn là máy cục bộ. Bản Streamlit và các SQLite cũ giữ nguyên.

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


### Đánh giá theo đề cương

Ngưỡng sepsis được chọn cao nhất trên validation vẫn đạt độ nhạy cấp người bệnh ≥80% khi áp dụng đợt cảnh báo 6 giờ. Không đặt trần ngưỡng tùy ý hoặc ràng buộc Recall theo giờ. Đợt bắt đầu ở lần vượt ngưỡng đầu tiên; các lần vượt tiếp theo đến hết 6 giờ được gộp vào đợt đó và không kéo dài khóa. Chỉ khi sepsis khởi phát trong `(đầu đợt, đầu đợt + 6h]`, đợt mới được tính đúng. Cảnh báo quá sớm trên một ca sau đó có sepsis vẫn tính là giả.

Trang Đánh giá mô hình ưu tiên độ nhạy người bệnh, PPV theo đợt, đợt giả/100 người bệnh, đợt giả/đợt đúng, thời gian báo trước và tỷ lệ lần vượt được gộp. Chỉ số theo mốc giờ nằm ở nhóm bổ sung riêng. Nhóm Phân biệt & hiệu chỉnh có AUROC, AUPRC cùng tỷ lệ biến cố, Brier, intercept, slope và biểu đồ hiệu chỉnh. KTC 95% dùng bootstrap 1.000 lần theo người bệnh, giữ nguyên mô hình và ngưỡng; tỷ lệ không có mẫu số được hiển thị là chưa ước lượng, không thay bằng 0.

Đây là đánh giá trên bộ dữ liệu mô phỏng. Chọn ngưỡng hiện dùng validation độc lập, chưa phải dự báo ngoài mẫu sau nested CV và hiệu chỉnh xác suất. Các đường/hệ số hiệu chỉnh là chẩn đoán, không tự thay đổi xác suất. Chưa có số liệu vận hành EMR thực để báo cáo độ trễ, lỗi hoặc uptime. Thay đổi này giữ nguyên workbook và trọng số logistic, cập nhật metadata và phiên bản chính sách; ca nhập tay cũ giữ dữ liệu nhưng cần chấm lại, không kế thừa review của kết quả/chính sách cũ.


## Lưu trữ SQLite của bản web

- `GET /api/clinical-state`: lấy hồ sơ và lịch sử xem xét; `Cache-Control: no-store`.
- `POST /api/cases`: tạo hồ sơ; `PUT /api/cases/[id]/entries`: kiểm tra revision, tính lại bằng Python phía server rồi lưu nguyên tử.
- `POST /api/reviews/import`: lưu bản gốc các ghi nhận cũ vào `legacy_reviews`; ghi nhận lỗi thời không tự áp dụng vào dự báo hiện tại.
- `POST /api/reviews`: kiểm tra dự báo còn hiệu lực, lưu người nhập tên/ghi chú và giờ máy chủ. Gửi lại cùng yêu cầu không ghi đè người xem xét đầu tiên.
- `POST /api/cases/import`: kiểm tra và chấm lại dữ liệu phiên tab cũ; lưu bản gốc trong `legacy_imports`. Chỉ chuyển trạng thái xem xét sang kết quả mới nếu feature hash, điểm, mô hình và ngưỡng đều khớp.
- `manual_entries` là dữ liệu hiện hành; `entry_history` và các phiên bản `predictions` cũ giữ lịch sử. `reviews` tham chiếu trực tiếp bản dự báo đã xem. Không cung cấp nút xóa lịch sử từ giao diện.
- Khi mở tab cũ, bấm **Chuyển dữ liệu lên máy chủ** ở thông báo đầu trang. Nếu chuyển thất bại, dữ liệu cũ vẫn được giữ. Sau khi thành công, tab giữ thêm bản sao `sepsis-legacy-backup`; các bản xem xét không khớp chỉ nằm trong bản gốc, không gắn vào dự báo mới.

Đổi vị trí lưu trước khi khởi động Next.js (chọn một ổ lưu trữ bền vững trên cùng máy chủ):

```powershell
$env:SEPSIS_WEB_DB = 'D:\SepsisStorage\frontend_clinical.sqlite3'
npm run start
```

SQLite dùng WAL, khóa ghi có thời gian chờ và transaction. Không đặt file trên thư mục public, ổ mạng hay filesystem tạm của serverless; không đưa file DB/WAL/SHM lên Git. Chạy nhiều máy chủ hoặc cần nhiều người ghi đồng thời thì chuyển adapter lưu trữ sang cơ sở dữ liệu máy chủ như PostgreSQL. API lưu trữ áp dụng giới hạn truy cập cục bộ/nguồn yêu cầu giống bộ chấm; đây chưa phải xác thực danh tính nhân viên bệnh viện.

### Sao lưu và phục hồi

Từ thư mục gốc repository, sao lưu nhất quán cả dữ liệu đã commit trong WAL bằng SQLite backup API:

```powershell
python scripts/backup_web_db.py data/frontend_clinical.sqlite3 backups/frontend_clinical-2026-11-20.sqlite3
```

Script không ghi đè file sao lưu đã tồn tại. Giữ bản sao trên vị trí được kiểm soát truy cập; tự động hóa lịch sao lưu theo nhu cầu vận hành. Để phục hồi: dừng Next.js, đặt `SEPSIS_WEB_DB` tới **một bản sao làm việc** của file backup rồi khởi động lại. Giữ nguyên file gốc để có thể quay lại. Không chỉ chép file `.sqlite3` đang chạy vì có thể bỏ sót WAL.

Kiểm thử Playwright dùng riêng `data/frontend_e2e.sqlite3`, luôn mở server riêng cổng 3100; không xóa dữ liệu web ở cổng 3000.
