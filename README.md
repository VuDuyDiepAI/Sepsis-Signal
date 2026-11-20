# Sepsis Signal

**Theo dõi nguy cơ nhiễm khuẩn huyết theo giờ, hỗ trợ bác sĩ Khoa Cấp cứu nhận diện người bệnh cần đánh giá sớm.**

Sepsis Signal là ứng dụng hỗ trợ theo dõi nguy cơ nhiễm khuẩn huyết, cho phép nhập sinh hiệu, kết quả xét nghiệm và triệu chứng của một ca bệnh qua nhiều thời điểm. Ở mỗi mốc giờ, hệ thống tổng hợp thông tin đã có, tính điểm nguy cơ sepsis trong **6 giờ tiếp theo** và hiển thị cảnh báo khi điểm vượt ngưỡng của mô hình.

Đầu mối dự án là **Khoa Cấp cứu – Bệnh viện Đa khoa Quốc tế Vinmec**. Ứng dụng tổ chức dữ liệu và diễn biến nguy cơ theo từng ca, với các khu vực điều trị gồm Cấp cứu, Nội trú và Hồi sức tích cực.

## Bản web Next.js

Bản web mới nằm trong `frontend/`. Hồ sơ nhập tay, kết quả dự báo và ghi nhận xem xét được lưu trên máy chủ bằng SQLite tại `data/frontend_clinical.sqlite3` (đổi bằng `SEPSIS_WEB_DB`), giữ lại khi đóng tab và không tự xóa ghi nhận sau 8 giờ. Hướng dẫn chạy, chuyển dữ liệu tab cũ và sao lưu nằm trong [frontend/README.md](frontend/README.md). Các mô tả đăng nhập/SQLite Streamlit ở phần dưới áp dụng cho bản Streamlit.

## Hỗ trợ nhận diện nguy cơ qua diễn biến người bệnh

Thông tin của một người bệnh xuất hiện dần theo thời gian. Sinh hiệu được đo lại, xét nghiệm có kết quả sau khi lấy mẫu, triệu chứng và nơi điều trị tiếp tục thay đổi. Bác sĩ cần tổng hợp những thông tin này để nhận ra diễn biến đáng lo ngại giữa nhiều ca đang theo dõi.

Sepsis Signal tập hợp **điểm nguy cơ hiện tại, trạng thái cảnh báo, diễn biến theo giờ và dữ liệu tại từng mốc** trên cùng một màn hình. Bác sĩ xem lại dữ liệu và trực tiếp đánh giá người bệnh khi có cảnh báo.

Mục tiêu của ứng dụng là hỗ trợ bác sĩ nhận diện nguy cơ sớm, theo dõi sự thay đổi giữa các lần cập nhật và ưu tiên xem xét những ca có cảnh báo.

**Cửa sổ dự báo 6 giờ** trả lời câu hỏi “tại thời điểm này, người bệnh có nguy cơ khởi phát sepsis trong 6 giờ tới hay không?”. Điểm được cập nhật khi người dùng bổ sung thông tin và chấm lại tại mốc tiếp theo.

## Chức năng chính

| Trang | Người dùng làm gì? | Kết quả nhận được |
| --- | --- | --- |
| **Chạy ca mẫu** | Chọn hồ sơ có sẵn và chuyển qua từng giờ. | Điểm sepsis, trạng thái cảnh báo, biểu đồ, sinh hiệu gần nhất và xét nghiệm mới trả. |
| **Nhập ca theo giờ** | Tạo hồ sơ, cập nhật chỉ số và ghi nhận đã xem xét kết quả. | Cảnh báo, dữ kiện thay đổi, biểu đồ và lịch sử xem xét theo từng bản tính. |
| **Danh sách theo dõi** | Lọc ca theo cảnh báo, trạng thái xem xét và khoa. Chọn một dòng để mở hồ sơ. | Ưu tiên ca vượt ngưỡng đang chờ xem xét, kèm điểm mới nhất và người ghi nhận. |
| **Đánh giá mô hình** | Xem cách chọn ngưỡng và kết quả kiểm tra mô hình. | Độ nhạy người bệnh, PPV theo đợt, tải cảnh báo giả, thời gian báo trước, hiệu chỉnh và chỉ số bổ sung theo giờ. |

Quy trình sử dụng là **tạo ca → nhập chỉ số → lưu và chấm điểm → xem cảnh báo → cập nhật ở giờ tiếp theo**. Người dùng nhập trực tiếp trên biểu mẫu hoặc chọn hồ sơ mẫu có sẵn để xem diễn biến theo thời gian.

## Đăng nhập và không gian làm việc

Ứng dụng mở trực tiếp màn hình **Đăng nhập**, không có bước đăng ký. Bên dưới biểu mẫu có hai tài khoản trải nghiệm được tạo sẵn. Chọn một tài khoản để điền tên và mật khẩu, sau đó bấm **Đăng nhập**.

| Tài khoản | Tên hiển thị | Mật khẩu |
| --- | --- | --- |
| `bacsi.demo1` | Bác sĩ trải nghiệm 01 | `SepsisDemo2026!` |
| `bacsi.demo2` | Bác sĩ trải nghiệm 02 | `SepsisDemo2026!` |

Hai tài khoản có cùng các chức năng và dùng chung danh sách hồ sơ. Đây là thông tin đăng nhập công khai phục vụ trải nghiệm; tên được lưu khi xem xét là danh tính tài khoản chung.

Sau đăng nhập, ứng dụng mở **Danh sách theo dõi** với tìm kiếm, bộ lọc theo khoa, trạng thái cảnh báo và xem xét. Bấm **Tạo hồ sơ** để nhập thông tin ban đầu, hoặc chọn một dòng để mở diễn biến. Trong từng ca, trạng thái và biểu đồ nằm cạnh bảng thay đổi chỉ số. Biểu mẫu cập nhật nằm trong **Nhập chỉ số và cập nhật kết quả**. Nút **Đã xem xét kết quả** ghi nhận tên và mã tài khoản đang đăng nhập.

Tài khoản được lưu cục bộ tại `data/accounts.sqlite3`, tách khỏi hồ sơ. Mật khẩu được băm PBKDF2-HMAC-SHA256 với salt riêng và 600.000 vòng; token phiên chỉ lưu bản băm trên máy chủ. Phiên hết hạn sau 8 giờ và bị thu hồi khi đăng xuất. Sau 5 lần nhập sai liên tiếp, tên đăng nhập tạm khóa 5 phút. Tải lại toàn bộ trang cần đăng nhập lại do phiên gắn với kết nối Streamlit.

Có thể đặt `SEPSIS_AUTH_DB` và `SEPSIS_MANUAL_DB` để dùng đường dẫn lưu trữ riêng. Hai tệp SQLite này không được đưa lên Git. Cơ chế hiện tại là tài khoản nội bộ cho một bản cài đặt; chưa kết nối SSO bệnh viện hay phân quyền theo khoa. Khi dùng với dữ liệu bệnh nhân thật, cần thay tài khoản trải nghiệm công khai bằng tài khoản cá nhân do đơn vị quản lý.

## Thử một ca trong vài phút

Sau khi chạy ứng dụng, chọn một tài khoản trải nghiệm ở màn hình đăng nhập rồi bấm **Đăng nhập**. Trang chính là **Danh sách theo dõi**. Mở **Chạy ca mẫu** để xem một hồ sơ có sẵn.

1. Chọn hồ sơ **E0009** và mốc **T0+7h**.
2. Xem điểm sepsis, trạng thái cảnh báo và các chỉ số đang có.
3. Bấm **Sang mốc tiếp theo** để đến **T0+8h**. Với bộ dữ liệu và mô hình hiện tại, điểm và trạng thái được cập nhật theo dữ liệu mới. Điểm cụ thể và ngưỡng phụ thuộc phiên bản mô hình đang phục vụ.
4. Đối chiếu mục **Xét nghiệm mới trả** và **Sinh hiệu gần nhất** để hiểu thông tin nào đã có thêm tại mốc mới.
5. Bật **Hiện mốc khởi phát tham chiếu** để so thời điểm cảnh báo với diễn biến được thiết kế trong hồ sơ mẫu.

Muốn thử nhập trực tiếp, mở **Hồ sơ và chỉ số**, tạo hồ sơ và nhập sinh hiệu, xét nghiệm ban đầu tại **T0 (Giờ sau T0 = 0)** rồi bấm **Lưu dữ liệu T0**. Chuyển sang **T0+1h** để chấm lần đầu, sử dụng dữ liệu T0 còn hiệu lực và những thông tin mới đã có. Tiếp tục cập nhật tại T0+2 và các mốc sau. Xét nghiệm trả sau chỉ được dùng từ giờ có kết quả trên EMR, dù lấy mẫu tại T0.

**T0 là thời điểm hoàn tất phân loại ban đầu.** Người dùng nhập dữ liệu được ngay tại T0; mốc này lưu thông tin ban đầu và chưa tạo điểm cảnh báo. Mô hình hiện tại hỗ trợ chấm từ **T0+1 đến T0+36 giờ**. Điểm hiển thị được đối chiếu với ngưỡng cảnh báo và diễn biến của các mốc trước để hỗ trợ bác sĩ xem xét ca bệnh.

## Dữ liệu đầu vào gồm những gì?

Bộ dữ liệu mô phỏng cấu trúc EMR và thời điểm thông tin có sẵn trong hành trình điều trị.

| Nhóm thông tin | Dữ liệu được dùng để tạo đầu vào mô hình sepsis hiện tại |
| --- | --- |
| Hồ sơ và bối cảnh | Tuổi, giới, BMI, khu vực điều trị. |
| Bệnh nền | Đái tháo đường, tim mạch, thận mạn, gan mạn, hô hấp mạn, ung thư, suy giảm miễn dịch. |
| Sinh hiệu | Nhịp tim, nhịp thở, huyết áp tâm thu, MAP, SpO₂, nhiệt độ, GCS. |
| Xét nghiệm | Bạch cầu, tiểu cầu, creatinine, bilirubin toàn phần, CRP, procalcitonin. |
| Triệu chứng | Các nhóm hô hấp, tiết niệu, tiêu hóa và ổ bụng, da và mô mềm, thần kinh trung ương. |
| Diễn biến và mức độ đầy đủ | Thay đổi nhịp tim và huyết áp, nhịp tim trung bình, số lần đo tích lũy từ T0, cờ có xét nghiệm và thời gian từ kết quả creatinine gần nhất. |

Biểu mẫu còn nhận huyết áp tâm trương để tính MAP khi cần. Workbook chứa thêm các trường phục vụ mô tả hồ sơ và xây dựng nhãn. Danh sách **36 đặc trưng đầu vào** được lưu trong metadata mô hình.

### Link dữ liệu mẫu và schema

- **[Mở thư mục dữ liệu trên GitHub](https://github.com/VuDuyDiepAI/Sepsis-Signal/tree/main/data)** để xem và tải dữ liệu đi kèm ứng dụng.
- **[Tải workbook EMR mẫu](data/mock_ed_hospital_emr_v3_hourly.xlsx)** gồm **360 lượt khám và 12.960 mốc theo giờ**. Trong Excel, mở sheet **`Guide`** để đọc hướng dẫn và **`DataDictionary`** để xem schema, kiểu dữ liệu, đơn vị và vai trò của các trường.
- Các sheet tách hồ sơ, sự kiện, đặc trưng và nhãn để kiểm tra đường đi từ dữ liệu đến kết quả dự báo.

Bộ hồ sơ đi kèm và dữ liệu huấn luyện mô hình là **EMR mô phỏng**, được tạo theo kịch bản với tình huống thiếu dữ liệu và thời điểm trả kết quả. Điểm hiển thị phản ánh mô hình học trên bộ dữ liệu này. Khi trải nghiệm nhập tay, sử dụng mã ca và thông tin mô phỏng.

## Mô hình tính điểm như thế nào?

Phiên bản đang phục vụ sử dụng **hồi quy logistic có điều chuẩn L2**. Mô hình đã được huấn luyện và đóng gói cùng bộ tiền xử lý, ngưỡng cảnh báo và metadata trong repo.

1. **Lấy dữ liệu tại mốc cần chấm.** Chỉ dùng bản ghi đã có trên EMR tại mốc đó. Kết quả xét nghiệm trả ở T0+2 được sử dụng từ T0+2.
2. **Tạo đặc trưng.** Tổng hợp giá trị gần nhất, thay đổi đầu–cuối, mạch trung bình và số lần đo trên toàn bộ khoảng **[T0, mốc dự báo]** thành 36 trường đầu vào. Cửa sổ quan sát tăng dần, không loại sinh hiệu chỉ vì đã quá 6 giờ hoặc xét nghiệm đã quá 24 giờ. Chỉ dùng bản ghi đã có trên EMR tại mốc đó; giá trị gần nhất được chọn theo giờ đo hoặc lấy mẫu để kết quả cũ trả muộn không ghi đè bản đo mới hơn.
3. **Tiền xử lý.** Tạo các biến bổ sung, xử lý giá trị thiếu, chuẩn hóa và mã hóa theo bộ biến đổi đã học trong quá trình huấn luyện.
4. **Tính điểm và so ngưỡng.** Mô hình trả điểm sepsis. Điểm bằng hoặc cao hơn ngưỡng tạo trạng thái cảnh báo.
5. **Hiển thị và lưu lịch sử.** Người dùng xem điểm cùng sinh hiệu, xét nghiệm và biểu đồ để đối chiếu qua các giờ.

Khi huấn luyện, các mốc của cùng lượt khám được giữ trong cùng nhóm. Tham số được chọn qua xác thực chéo theo nhóm trên tập huấn luyện, ngưỡng được chọn trên tập xác thực riêng và kết quả cuối được báo trên tập giữ lại theo thời gian mô phỏng. Ngưỡng cao nhất đạt độ nhạy người bệnh ≥80% được chọn theo đợt cảnh báo gộp trong 6 giờ. Không bắt buộc Recall theo giờ ≥80%. PPV theo đợt và cảnh báo giả được đánh giá riêng, có khoảng tin cậy bootstrap theo người bệnh. Xác suất chưa tái hiệu chỉnh; cách chọn ngưỡng hiện dùng validation độc lập, chưa thay thế đầy đủ quy trình nested CV và hiệu chỉnh ngoài mẫu trong đề cương. Metadata lưu cấu hình, phiên bản và checksum workbook để đối chiếu. [Xem metadata sepsis](artifacts/mock_emr_hourly_lr/sepsis_metadata.json).

## Cài đặt và chạy trên Windows

Dùng **Python 3.11**, tải hoặc clone repo rồi mở PowerShell tại thư mục gốc.

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m streamlit run app\streamlit_app.py
```

Mở địa chỉ **Local URL** mà Streamlit hiển thị trong terminal. Repo đã có dữ liệu mẫu và mô hình để chạy trải nghiệm ngay. Môi trường hiện tại chạy bằng CPU.

### Cấu trúc repo

```text
app/
  streamlit_app.py       Điểm khởi chạy ứng dụng
  views/                Bốn trang trải nghiệm
  shared_ui.py          Thành phần hiển thị dùng chung
  styles.css            Giao diện
src/
  observation_features.py  Hàm tạo đặc trưng từ T0 dùng chung khi huấn luyện và nhập tay
  mock_emr.py           Đọc workbook, tạo biến bổ sung và nạp mô hình
  manual_cases.py       Lưu ca nhập tay, dựng đặc trưng và chấm theo giờ
data/
  mock_ed_hospital_emr_v3_hourly.xlsx
artifacts/
  mock_emr_hourly_lr/    Mô hình, bộ tiền xử lý và metadata
scripts/
  train_mock_emr.py      Huấn luyện và tính lại chỉ số
requirements.txt        Thư viện để chạy ứng dụng
```

Khi sửa bản ghi, các kết quả bị ảnh hưởng được đánh dấu hết hiệu lực ngay khi lưu dữ liệu. Hệ thống chấm lại các mốc đó; mốc không còn đủ dữ liệu sẽ không hiển thị điểm hoặc cho ghi nhận xem xét. Bản tính và ghi nhận cũ vẫn được giữ trong lịch sử. Lỗi chấm điểm cũng không làm kết quả cũ trở lại hiệu lực.

Hồ sơ nhập tay và ghi nhận xem xét được lưu trong `data/manual_cases.sqlite3`. Mỗi lượt xem xét gắn với đúng mốc giờ và phiên bản kết quả. Khi chấm ra bản tính mới, bản đó có trạng thái xem xét riêng. Người ghi nhận và mã tài khoản được lấy từ phiên đăng nhập, gắn với đúng bản tính đang xem.

<details>
<summary>Dành cho người phát triển · tính lại chỉ số và huấn luyện</summary>

Tính lại ngưỡng và các chỉ số từ mô hình đã lưu bằng môi trường vừa cài.

```powershell
.\.venv\Scripts\python.exe scripts\train_mock_emr.py --refresh-metrics
```

Huấn luyện lại từ workbook hiện tại và cập nhật các artifact mô hình.

```powershell
.\.venv\Scripts\python.exe scripts\train_mock_emr.py
```

Dựng lại sheet đặc trưng từ các sự kiện gốc mà không thay nhãn hoặc tạo lại người bệnh:

```powershell
.\.venv\Scripts\python.exe scripts\rebuild_observation_snapshots.py
.\.venv\Scripts\python.exe scripts\train_mock_emr.py
```

Tên biến `*_since_t0` và metadata `observation_window.type = expanding` xác định cấu hình mới. Các kết quả đã lưu bằng mô hình cũ được giữ nguyên; ứng dụng ghi rõ phiên bản và không diễn giải chúng bằng cấu hình mới.

Khi thay workbook, cần huấn luyện và cập nhật artifact tương ứng để khớp kiểm tra checksum dữ liệu.

Kiểm thử tự động gồm dữ liệu sửa làm mất điều kiện chấm, khôi phục sau chỉnh sửa, lỗi mô hình, chỉnh dữ liệu đồng thời khi chấm, lưu xem xét, và đối chiếu các đặc trưng workbook–nhập tay trên 36 giờ của bốn nhóm kịch bản. Bộ kiểm thử độc lập còn dựng lại 12.960 mốc từ dữ liệu nguồn.

GitHub Actions chạy toàn bộ thư mục `tests` trên Python 3.11 cho push và pull request. Cài môi trường kiểm thử bằng `python -m pip install -r requirements-dev.txt`. Nhánh `main` dùng pull request và yêu cầu check **Python tests** thành công; không cho force-push hoặc xóa nhánh. Số phê duyệt bắt buộc là 0 để một người quản lý repo có thể tự hợp nhất sau khi CI đạt.

```powershell
.\.venv\Scripts\python.exe -m pip install pytest
.\.venv\Scripts\python.exe -m pytest -q tests/test_auth.py tests/test_manual_cases.py tests/test_mock_emr.py tests/test_streamlit_manual.py
```

</details>
