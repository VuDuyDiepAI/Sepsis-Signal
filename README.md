# Sepsis Signal

**Theo dõi nguy cơ nhiễm khuẩn huyết theo giờ, hỗ trợ bác sĩ Khoa Cấp cứu nhận diện người bệnh cần đánh giá sớm.**

Sepsis Signal là ứng dụng hỗ trợ theo dõi nguy cơ nhiễm khuẩn huyết, cho phép nhập sinh hiệu, kết quả xét nghiệm và triệu chứng của một ca bệnh qua nhiều thời điểm. Ở mỗi mốc giờ, hệ thống tổng hợp thông tin đã có, tính điểm nguy cơ sepsis trong **6 giờ tiếp theo** và hiển thị cảnh báo khi điểm vượt ngưỡng của mô hình.

Đầu mối dự án là **Vũ Duy Điệp · Khoa Cấp cứu**. Ứng dụng tổ chức dữ liệu và diễn biến nguy cơ theo từng ca, với các khu vực điều trị gồm Cấp cứu, Nội trú và Hồi sức tích cực.

## Hỗ trợ nhận diện nguy cơ qua diễn biến người bệnh

Thông tin của một người bệnh xuất hiện dần theo thời gian. Sinh hiệu được đo lại, xét nghiệm có kết quả sau khi lấy mẫu, triệu chứng và nơi điều trị tiếp tục thay đổi. Bác sĩ cần tổng hợp những thông tin này để nhận ra diễn biến đáng lo ngại giữa nhiều ca đang theo dõi.

Sepsis Signal tập hợp **điểm nguy cơ hiện tại, trạng thái cảnh báo, diễn biến theo giờ và dữ liệu tại từng mốc** trên cùng một màn hình. Bác sĩ xem lại dữ liệu và trực tiếp đánh giá người bệnh khi có cảnh báo.

Mục tiêu của ứng dụng là hỗ trợ bác sĩ nhận diện nguy cơ sớm, theo dõi sự thay đổi giữa các lần cập nhật và ưu tiên xem xét những ca có cảnh báo.

**Cửa sổ dự báo 6 giờ** trả lời câu hỏi “tại thời điểm này, người bệnh có nguy cơ khởi phát sepsis trong 6 giờ tới hay không?”. Điểm được cập nhật khi người dùng bổ sung thông tin và chấm lại tại mốc tiếp theo.

## Chức năng chính

| Trang | Người dùng làm gì? | Kết quả nhận được |
| --- | --- | --- |
| **Chạy ca mẫu** | Chọn hồ sơ có sẵn và chuyển qua từng giờ. | Điểm sepsis, trạng thái cảnh báo, biểu đồ, sinh hiệu gần nhất và xét nghiệm mới trả. |
| **Nhập ca theo giờ** | Tạo hồ sơ trải nghiệm, nhập chỉ số và cập nhật khi có dữ liệu mới. | Kết quả chấm tại từng mốc, thông tin còn thiếu và lịch sử điểm. |
| **Danh sách theo dõi** | Xem lại nhiều hồ sơ đã nhập, mở ca cần xem xét. | Mốc chấm gần nhất và tình trạng cảnh báo của từng ca. |
| **Đánh giá mô hình** | Xem cách chọn ngưỡng và kết quả kiểm tra mô hình. | Các chỉ số theo giờ, theo lượt khám và thời gian cảnh báo trước khởi phát tham chiếu. |

Quy trình sử dụng là **tạo ca → nhập chỉ số → lưu và chấm điểm → xem cảnh báo → cập nhật ở giờ tiếp theo**. Người dùng nhập trực tiếp trên biểu mẫu hoặc chọn hồ sơ mẫu có sẵn để xem diễn biến theo thời gian.

## Thử một ca trong vài phút

Sau khi chạy ứng dụng theo hướng dẫn bên dưới, mở **Chạy ca mẫu**.

1. Chọn hồ sơ **E0009** và mốc **T0+7h**.
2. Xem điểm sepsis, trạng thái cảnh báo và các chỉ số đang có.
3. Bấm **Sang mốc tiếp theo** để đến **T0+8h**. Với bộ dữ liệu và mô hình hiện tại, điểm tăng từ khoảng **2,72% lên 23,93%**, vượt ngưỡng **9,14%**.
4. Đối chiếu mục **Xét nghiệm mới trả** và **Sinh hiệu gần nhất** để hiểu thông tin nào đã có thêm tại mốc mới.
5. Bật **Hiện mốc khởi phát tham chiếu** để so thời điểm cảnh báo với diễn biến được thiết kế trong hồ sơ mẫu.

Muốn thử nhập trực tiếp, mở **Nhập ca theo giờ**, tạo hồ sơ và nhập sinh hiệu tại T0+1. Sau đó chuyển sang T0+2, bổ sung dữ liệu mới rồi chấm lại để xem diễn biến.

**T0 là thời điểm hoàn tất phân loại ban đầu.** Hệ thống hỗ trợ chấm từ **T0+1 đến T0+36 giờ**. Điểm hiển thị được đối chiếu với ngưỡng cảnh báo và diễn biến của các mốc trước để hỗ trợ bác sĩ xem xét ca bệnh.

## Dữ liệu đầu vào gồm những gì?

Bộ dữ liệu mô phỏng cấu trúc EMR và thời điểm thông tin có sẵn trong hành trình điều trị.

| Nhóm thông tin | Dữ liệu được dùng để tạo đầu vào mô hình sepsis hiện tại |
| --- | --- |
| Hồ sơ và bối cảnh | Tuổi, giới, BMI, khu vực điều trị. |
| Bệnh nền | Đái tháo đường, tim mạch, thận mạn, gan mạn, hô hấp mạn, ung thư, suy giảm miễn dịch. |
| Sinh hiệu | Nhịp tim, nhịp thở, huyết áp tâm thu, MAP, SpO₂, nhiệt độ, GCS. |
| Xét nghiệm | Bạch cầu, tiểu cầu, creatinine, bilirubin toàn phần, CRP, procalcitonin. |
| Triệu chứng | Các nhóm hô hấp, tiết niệu, tiêu hóa và ổ bụng, da và mô mềm, thần kinh trung ương. |
| Diễn biến và mức độ đầy đủ | Thay đổi nhịp tim và huyết áp, nhịp tim trung bình, số lần đo trong cửa sổ 6 giờ, cờ có xét nghiệm và thời gian từ kết quả creatinine gần nhất. |

Biểu mẫu còn nhận huyết áp tâm trương để tính MAP khi cần. Workbook chứa thêm các trường phục vụ mô tả hồ sơ và xây dựng nhãn. Danh sách **36 đặc trưng đầu vào** được lưu trong metadata mô hình.

### Link dữ liệu mẫu và schema

- **[Mở thư mục dữ liệu trên GitHub](https://github.com/VuDuyDiepAI/Sepsis-Signal/tree/main/data)** để xem và tải dữ liệu đi kèm ứng dụng.
- **[Tải workbook EMR mẫu](data/mock_ed_hospital_emr_v3_hourly.xlsx)** gồm **360 lượt khám và 12.960 mốc theo giờ**. Trong Excel, mở sheet **`Guide`** để đọc hướng dẫn và **`DataDictionary`** để xem schema, kiểu dữ liệu, đơn vị và vai trò của các trường.
- Các sheet tách hồ sơ, sự kiện, đặc trưng và nhãn để kiểm tra đường đi từ dữ liệu đến kết quả dự báo.

Bộ hồ sơ đi kèm và dữ liệu huấn luyện mô hình là **EMR mô phỏng**, được tạo theo kịch bản với tình huống thiếu dữ liệu và thời điểm trả kết quả. Điểm hiển thị phản ánh mô hình học trên bộ dữ liệu này. Khi trải nghiệm nhập tay, sử dụng mã ca và thông tin mô phỏng.

## Mô hình tính điểm như thế nào?

Phiên bản đang phục vụ sử dụng **hồi quy logistic có điều chuẩn L2**. Mô hình đã được huấn luyện và đóng gói cùng bộ tiền xử lý, ngưỡng cảnh báo và metadata trong repo.

1. **Lấy dữ liệu tại mốc cần chấm.** Chỉ dùng bản ghi đã có trên EMR tại mốc đó. Kết quả xét nghiệm trả ở T0+2 được sử dụng từ T0+2.
2. **Tạo đặc trưng.** Tổng hợp giá trị gần nhất và diễn biến trong cửa sổ quy định thành 36 trường đầu vào.
3. **Tiền xử lý.** Tạo các biến bổ sung, xử lý giá trị thiếu, chuẩn hóa và mã hóa theo bộ biến đổi đã học trong quá trình huấn luyện.
4. **Tính điểm và so ngưỡng.** Mô hình trả điểm sepsis. Điểm bằng hoặc cao hơn ngưỡng tạo trạng thái cảnh báo.
5. **Hiển thị và lưu lịch sử.** Người dùng xem điểm cùng sinh hiệu, xét nghiệm và biểu đồ để đối chiếu qua các giờ.

Khi huấn luyện, các mốc của cùng lượt khám được giữ trong cùng nhóm. Tham số được chọn qua xác thực chéo theo nhóm trên tập huấn luyện, ngưỡng được chọn trên tập xác thực riêng và kết quả cuối được báo trên tập giữ lại theo thời gian mô phỏng. Metadata lưu cấu hình, phiên bản và checksum workbook để đối chiếu. [Xem metadata sepsis](artifacts/mock_emr_hourly_lr/sepsis_metadata.json).

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

Hồ sơ nhập tay được tạo trong `data/manual_cases.sqlite3` khi sử dụng ứng dụng.

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

Khi thay workbook, cần huấn luyện và cập nhật artifact tương ứng để khớp kiểm tra checksum dữ liệu.

</details>
