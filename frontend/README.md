# Sepsis Signal — Clinical UI

Giao diện nghiên cứu UI/UX nằm trong repository **VuDuyDiepAI/Sepsis-Signal**, nhánh `feat/clinical-ui-refresh`. Bản Streamlit, Python và mô hình gốc được giữ nguyên. Đây chưa phải phần mềm triển khai lâm sàng.

## Chạy trên máy

Yêu cầu Node.js **22.13 trở lên** (có `node:sqlite`) và npm. Từ thư mục repository:

```powershell
cd frontend
npm ci
npm run dev
```

Mở **http://localhost:3000**, đăng nhập bằng tài khoản có sẵn dưới biểu mẫu (không có đăng ký). Các hồ sơ mẫu vẫn xem độc lập, không cần chạy Streamlit. Chạy production cục bộ: `npm run build`, sau đó `npm run start`.

### Tạo ca mới và chấm điểm nhập tay

Bấm **Tạo ca mới** ở Hồ sơ theo dõi. Tạo thông tin ban đầu, nhập sinh hiệu/xét nghiệm tại **T0** rồi lưu. Chọn **T0+1h**, nhập bổ sung nếu có hoặc bỏ chọn sinh hiệu mới để dùng bản ghi T0, rồi bấm **Lưu dữ liệu và chấm điểm**. Tiếp tục ở T0+2h và các giờ sau.

Hồ sơ nhập tay, các lần nhập, kết quả dự báo và ghi nhận xem xét được lưu trong **SQLite phía máy chủ** tại `data/frontend_clinical.sqlite3`. Có thể đóng tab, mở lại hoặc dùng tab khác trên cùng máy chủ mà vẫn xem được hồ sơ. Giao diện tải lại dữ liệu khi quay về tab và đồng bộ định kỳ 10 giây. Không nhập danh tính người bệnh thật.

Chấm điểm nhập tay cần Python đã cài `requirements.txt` ở máy chạy Next.js. Route `PUT /api/cases/[id]/entries` ghi chỉ số và revision vào SQLite trước, đánh dấu dự báo cần tính lại rồi trả dữ liệu đã lưu. Giao diện gọi `POST /api/cases/[id]/rescore` để chạy `scripts/score_frontend_case.py`. Python lỗi không làm mất chỉ số; có nút **Chấm lại dữ liệu đã lưu**. `/api/manual-score` hỗ trợ chấm không lưu sau xác thực. Bộ chấm tái sử dụng logic Python hiện có, tạo SQLite tạm riêng cho mỗi yêu cầu rồi xóa. Không thay đổi workbook, model hoặc SQLite cũ. Bộ chấm tính lại mọi giờ đã chấm khi sửa dữ liệu; giờ không đủ sinh hiệu sẽ không giữ điểm cũ. Ngưỡng và điểm được trả từ model, không sinh ngẫu nhiên.

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

Ghi nhận xem xét lưu trên máy chủ, không tự hết hạn sau 8 giờ, gắn với `predictionId` và `revision`. Mỗi lượt đánh giá có ID riêng. Xác nhận đầu tiên quyết định trạng thái hàng đợi; các lượt sau nằm trong **Các lượt đánh giá**, không ghi đè nhau. `requestId` giúp gửi lại cùng một thao tác mà không nhân đôi. API lấy danh tính từ session, từ chối trường `reviewer` do client gửi. Kết quả thay đổi không kế thừa xác nhận cũ; lịch sử vẫn được giữ.

### Đăng nhập và quyền truy cập

Tất cả API đọc/ghi hồ sơ và chấm điểm đều kiểm tra session phía server. Token ngẫu nhiên 256 bit chỉ lưu bản băm trong SQLite; cookie `HttpOnly`, `SameSite=Strict`, hết hạn sau 8 giờ, có `Secure` khi cấu hình HTTPS. Đăng xuất thu hồi session trên server. Mật khẩu băm bằng scrypt với salt riêng. Sau 5 lần nhập sai, tài khoản tạm khóa 5 phút. Lịch sử xem xét không hết hạn cùng session.

Vai trò `viewer` chỉ đọc; `doctor` và `admin` được nhập/chấm/xem xét. Đây là tài khoản của ứng dụng, chưa kết nối SSO bệnh viện hay phân quyền theo khoa. Các tài khoản trải nghiệm là tài khoản dùng chung, không chứng minh danh tính cá nhân của bác sĩ.

`npm run dev`/`npm run start` dùng launcher chỉ bind `127.0.0.1` và bật hai tài khoản trải nghiệm. Chạy Next trực tiếp không mặc định bật demo. Khi có `SEPSIS_PUBLIC_ORIGIN`, tài khoản demo cùng các session demo cũ bị từ chối dù `SEPSIS_DEMO_ACCOUNTS=1`.

Kiểm tra Host/Origin chỉ phục vụ định tuyến và chống yêu cầu khác nguồn, không chứng minh danh tính. Bộ chấm vẫn giới hạn 2 yêu cầu đồng thời, 20 yêu cầu/phút trên một tiến trình. `SEPSIS_API_TOKEN` không còn là cơ chế truy cập API; không đưa thông tin bí mật vào `NEXT_PUBLIC_*`.

### Cấp tài khoản và cấu hình truy cập qua mạng

Sau khi khởi động bản mới một lần để tạo/nâng cấp schema, từ `frontend/` có thể cấp hoặc đặt lại tài khoản bằng công cụ phía máy chủ:

```powershell
# Cấp qua biến môi trường bảo mật; không ghi mật khẩu thật vào Git hoặc tham số dòng lệnh.
$env:SEPSIS_USER_PASSWORD = '<mat-khau-rieng-tu-12-ky-tu>'
node scripts/manage-user.mjs --username doctor.a --name 'Bác sĩ A' --role doctor
Remove-Item Env:SEPSIS_USER_PASSWORD
# Chỉ đọc: --role viewer. Vô hiệu hóa: --username doctor.a --disable.
```

Cập nhật mật khẩu/quyền hoặc vô hiệu hóa sẽ thu hồi session cũ. Chọn đúng `SEPSIS_WEB_DB` khi thao tác nhiều bản cài đặt.

Để truy cập qua mạng: dùng reverse proxy HTTPS tới server loopback và đặt `SEPSIS_PUBLIC_ORIGIN` bằng origin HTTPS chính xác (ví dụ `https://sepsis.example.org`, không có dấu `/` cuối). Proxy chuyển tiếp Host của tên miền đó. Khởi động lại ứng dụng sau khi cấu hình. Có thể cấp tài khoản quản trị đầu tiên bằng `SEPSIS_BOOTSTRAP_USERNAME`, `SEPSIS_BOOTSTRAP_PASSWORD`, `SEPSIS_BOOTSTRAP_NAME` từ nơi quản lý bí mật; chỉ tạo khi username chưa tồn tại, không tự đặt lại mật khẩu. Chưa triển khai truy cập mạng trong thay đổi này. Triển khai nhiều tiến trình/máy chủ cần giới hạn dùng chung và phương án cơ sở dữ liệu phù hợp.

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

`createClinicalReader` là lớp đọc chung cho các màn hình: fixture và ca nhập tay được hợp nhất trước khi áp dụng cùng quy tắc as-of. `ClinicalDataProvider` bất đồng bộ dùng cùng lớp đọc, là ranh giới để nối FastAPI về sau. Khi nối hệ thống bệnh viện cần SSO và quyền truy cập theo khoa; session, kiểm tra revision và lịch sử thao tác đã nằm phía server. Không coi state trình duyệt là hồ sơ bệnh viện.

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
- `POST /api/cases`: tạo hồ sơ; `PUT /api/cases/[id]/entries`: kiểm tra revision, lưu chỉ số và vô hiệu hóa kết quả hiện hành trong cùng transaction; Python chạy riêng ở `POST /api/cases/[id]/rescore`.
- `POST /api/reviews/import`: lưu bản gốc các ghi nhận cũ vào `legacy_reviews`; ghi nhận lỗi thời không tự áp dụng vào dự báo hiện tại.
- `POST /api/reviews`: kiểm tra dự báo còn hiệu lực, lưu tài khoản từ session, ghi chú và giờ máy chủ. Nhiều bác sĩ được đánh giá cùng kết quả; gửi lại cùng `requestId` không tạo bản trùng.
- `POST /api/cases/import`: lưu dữ liệu phiên tab cũ và bản gốc trong `legacy_imports` trước khi chấm lại. Ghi nhận cũ được lưu để truy vết, không mạo danh tài khoản đã xác thực.
- `manual_entries` là dữ liệu hiện hành; `entry_history` và các phiên bản `predictions` cũ giữ lịch sử. `review_events` tham chiếu trực tiếp bản dự báo đã xem. `scoring_jobs` lưu revision/trạng thái mỗi lần chấm; kết quả chỉ commit khi revision và mã lần chạy còn khớp. Job hết lease sau 60 giây có thể chấm lại; worker cũ không được ghi đè worker mới. Không cung cấp nút xóa lịch sử từ giao diện.
- Khi mở tab cũ, bấm **Chuyển dữ liệu lên máy chủ** ở thông báo đầu trang. Nếu chuyển thất bại, dữ liệu cũ vẫn được giữ. Sau khi thành công, tab giữ thêm bản sao `sepsis-legacy-backup`; các bản xem xét không khớp chỉ nằm trong bản gốc, không gắn vào dự báo mới.

Đổi vị trí lưu trước khi khởi động Next.js (chọn một ổ lưu trữ bền vững trên cùng máy chủ):

```powershell
$env:SEPSIS_WEB_DB = 'D:\SepsisStorage\frontend_clinical.sqlite3'
npm run start
```

SQLite dùng WAL, khóa ghi có thời gian chờ và transaction. Không đặt file trên thư mục public, ổ mạng hay filesystem tạm của serverless; không đưa file DB/WAL/SHM lên Git. Chạy nhiều máy chủ hoặc cần nhiều người ghi đồng thời thì chuyển adapter lưu trữ sang cơ sở dữ liệu máy chủ như PostgreSQL. API lưu trữ yêu cầu session và quyền phù hợp; đây chưa phải SSO hay tài khoản nhân viên bệnh viện.

### Sao lưu và phục hồi

Từ thư mục gốc repository, sao lưu nhất quán cả dữ liệu đã commit trong WAL bằng SQLite backup API:

```powershell
python scripts/backup_web_db.py data/frontend_clinical.sqlite3 backups/frontend_clinical-2026-11-20.sqlite3
```

Script không ghi đè file sao lưu đã tồn tại. Giữ bản sao trên vị trí được kiểm soát truy cập; tự động hóa lịch sao lưu theo nhu cầu vận hành. Để phục hồi: dừng Next.js, đặt `SEPSIS_WEB_DB` tới **một bản sao làm việc** của file backup rồi khởi động lại. Giữ nguyên file gốc để có thể quay lại. Không chỉ chép file `.sqlite3` đang chạy vì có thể bỏ sót WAL.

Kiểm thử Playwright dùng riêng `data/frontend_e2e.sqlite3`, luôn mở server riêng cổng 3100; không xóa dữ liệu web ở cổng 3000.


### Migrations và phiên bản ca mẫu

`src/lib/server/migrations.ts` chứa migration có thứ tự. Bản hiện tại nâng SQLite v1 lên v2: giữ chỉ số/dự báo cũ, chuyển từng dòng `reviews` thành sự kiện `legacy-v1`, thêm job chấm, actor nhập liệu và bảng tài khoản/session. Toàn bộ nâng cấp chạy trong transaction; lỗi sẽ rollback cả schema và `user_version`. Database mới hơn ứng dụng hoặc file không nhận diện được sẽ bị từ chối. Sao lưu trước khi nâng cấp; khôi phục phải dùng bản sao làm việc của backup, không hạ `user_version` bằng tay.

ID fixture phía server băm cả ID nguồn, nội dung dự báo và SHA-256 dữ liệu đầu vào. Cùng ID nguồn nhưng dữ liệu/điểm thay đổi sẽ tạo phiên bản bất biến mới; bản cũ giữ nguyên để tra lịch sử. Frontend dùng ID phiên bản do API trả về cho các màn hình lâm sàng. Exporter cũng đổi fingerprint khi workbook thay đổi. Sau lần nâng cấp này, các ca mẫu cũ cần được xem xét lại; lịch sử gốc vẫn còn.
