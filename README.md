# Sepsis Signal

**Theo dõi nguy cơ nhiễm khuẩn huyết theo giờ, hỗ trợ bác sĩ Khoa Cấp cứu nhận diện người bệnh cần đánh giá sớm.**

Sepsis Signal là prototype cho phép nhập sinh hiệu, kết quả xét nghiệm và triệu chứng của một ca bệnh qua nhiều thời điểm. Ở mỗi mốc giờ, hệ thống tổng hợp thông tin đã có, tính điểm nguy cơ sepsis trong **6 giờ tiếp theo** và hiển thị cảnh báo khi điểm vượt ngưỡng của mô hình.

Đầu mối dự án là **Vũ Duy Điệp · Khoa Cấp cứu**. Dự án hướng tới quy trình theo dõi từ Cấp cứu đến Nội trú và Hồi sức tích cực. Phiên bản hiện tại phục vụ trải nghiệm và kiểm thử quy trình bằng hồ sơ EMR mô phỏng. Hiệu quả trên bệnh nhân thực tế cần được đánh giá trong các bước nghiên cứu tiếp theo.

## Vấn đề dự án muốn giải quyết

Thông tin của một người bệnh xuất hiện dần theo thời gian. Sinh hiệu được đo lại, xét nghiệm có kết quả sau khi lấy mẫu, triệu chứng và nơi điều trị tiếp tục thay đổi. Bác sĩ cần tổng hợp những thông tin này để nhận ra diễn biến đáng lo ngại giữa nhiều ca đang theo dõi.

Sepsis Signal hướng tới hỗ trợ công việc đó bằng một màn hình thể hiện **điểm nguy cơ hiện tại, trạng thái cảnh báo, diễn biến theo giờ và dữ liệu tại từng mốc**. Bác sĩ xem lại dữ liệu và trực tiếp đánh giá người bệnh khi có cảnh báo.

Mục tiêu nghiên cứu là rút ngắn thời gian từ dấu hiệu cảnh báo đầu tiên có trên EMR đến khi bác sĩ ghi nhận nghi ngờ sepsis. Mốc mục tiêu **≤4 giờ** sẽ cần được đối chiếu với số liệu trước triển khai tại khoa. Mức cải thiện sẽ được đo khi có dữ liệu thực tế.

**Cửa sổ dự báo 6 giờ** trả lời câu hỏi “tại thời điểm này, người bệnh có nguy cơ khởi phát sepsis trong 6 giờ tới hay không?”. Thời gian bác sĩ nhận diện bệnh là một chỉ số riêng, cần đo trong quy trình thực tế.

## Trải nghiệm được những gì?

| Trang | Người dùng làm gì? | Kết quả nhận được |
| --- | --- | --- |
| **Chạy ca mẫu** | Chọn hồ sơ có sẵn và chuyển qua từng giờ. | Điểm sepsis, trạng thái cảnh báo, biểu đồ, sinh hiệu gần nhất và xét nghiệm mới trả. |
| **Nhập ca theo giờ** | Tạo hồ sơ trải nghiệm, nhập chỉ số và cập nhật khi có dữ liệu mới. | Kết quả chấm tại từng mốc, thông tin còn thiếu và lịch sử điểm. |
| **Danh sách theo dõi** | Xem lại nhiều hồ sơ đã nhập, mở ca cần xem xét. | Mốc chấm gần nhất và tình trạng cảnh báo của từng ca. |
| **Đánh giá mô hình** | Xem cách chọn ngưỡng và kết quả kiểm tra mô hình. | Các chỉ số theo giờ, theo lượt khám và thời gian cảnh báo trước khởi phát tham chiếu. |

Luồng trải nghiệm chính là **tạo ca → nhập chỉ số → lưu và chấm điểm → xem cảnh báo → cập nhật ở giờ tiếp theo**. Người dùng có thể nhập trực tiếp trên biểu mẫu. Hồ sơ mẫu có sẵn giúp trải nghiệm nhanh ngay khi mở ứng dụng.

## Thử một ca trong vài phút

Sau khi chạy ứng dụng theo hướng dẫn bên dưới, mở **Chạy ca mẫu**.

1. Chọn hồ sơ **E0009** và mốc **T0+7h**.
2. Xem điểm sepsis, trạng thái cảnh báo và các chỉ số đang có.
3. Bấm **Sang mốc tiếp theo** để đến **T0+8h**. Với bộ dữ liệu và mô hình hiện tại, điểm tăng từ khoảng **2,72% lên 23,93%**, vượt ngưỡng **9,14%**.
4. Đối chiếu mục **Xét nghiệm mới trả** và **Sinh hiệu gần nhất** để hiểu thông tin nào đã có thêm tại mốc mới.
5. Bật **Hiện mốc khởi phát tham chiếu** để so thời điểm cảnh báo với diễn biến được thiết kế trong hồ sơ mẫu.

Muốn thử nhập trực tiếp, mở **Nhập ca theo giờ**, tạo hồ sơ và nhập sinh hiệu tại T0+1. Sau đó chuyển sang T0+2, bổ sung dữ liệu mới rồi chấm lại để xem diễn biến.

**T0 là thời điểm hoàn tất phân loại ban đầu.** Prototype hỗ trợ chấm từ **T0+1 đến T0+36 giờ**. Điểm phần trăm hiển thị là đầu ra mô hình được huấn luyện trên dữ liệu mô phỏng, cần kiểm định và hiệu chỉnh trên dữ liệu thực tế trước khi diễn giải thành xác suất lâm sàng.

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

- **[Mở thư mục dữ liệu trên GitHub](https://github.com/VuDuyDiepAI/Sepsis-Signal/tree/main/data)** để xem hoặc chia sẻ với giám khảo.
- **[Tải workbook EMR mẫu](data/mock_ed_hospital_emr_v3_hourly.xlsx)** gồm **360 lượt khám và 12.960 mốc theo giờ**. Trong Excel, mở sheet **`Guide`** để đọc hướng dẫn và **`DataDictionary`** để xem schema, kiểu dữ liệu, đơn vị và vai trò của các trường.
- Các sheet tách hồ sơ, sự kiện, đặc trưng và nhãn để kiểm tra đường đi từ dữ liệu đến kết quả dự báo.

Dữ liệu trong workbook được tạo theo kịch bản, có mô phỏng thiếu dữ liệu và thời điểm trả kết quả. Nguồn dữ liệu của phiên bản trải nghiệm là **EMR tổng hợp**, chưa có kết nối lấy dữ liệu từ hệ thống bệnh án bệnh viện. Khi thử nhập tay, hãy sử dụng mã ca và thông tin mô phỏng.

## Mô hình tính điểm như thế nào?

Phiên bản đang phục vụ sử dụng **hồi quy logistic có điều chuẩn L2**. Mô hình đã được huấn luyện và đóng gói cùng bộ tiền xử lý, ngưỡng cảnh báo và metadata trong repo.

1. **Lấy dữ liệu tại mốc cần chấm.** Chỉ dùng bản ghi đã có trên EMR tại mốc đó. Kết quả xét nghiệm trả ở T0+2 được sử dụng từ T0+2.
2. **Tạo đặc trưng.** Tổng hợp giá trị gần nhất và diễn biến trong cửa sổ quy định thành 36 trường đầu vào.
3. **Tiền xử lý.** Tạo các biến bổ sung, xử lý giá trị thiếu, chuẩn hóa và mã hóa theo bộ biến đổi đã học trong quá trình huấn luyện.
4. **Tính điểm và so ngưỡng.** Mô hình trả điểm sepsis. Điểm bằng hoặc cao hơn ngưỡng tạo trạng thái cảnh báo.
5. **Hiển thị và lưu lịch sử.** Người dùng xem điểm cùng sinh hiệu, xét nghiệm và biểu đồ để đối chiếu qua các giờ.

Khi huấn luyện, các mốc của cùng lượt khám được giữ trong cùng nhóm. Tham số được chọn qua xác thực chéo theo nhóm trên tập huấn luyện, ngưỡng được chọn trên tập xác thực riêng và kết quả cuối được báo trên tập giữ lại theo thời gian mô phỏng. Metadata lưu cấu hình, phiên bản và checksum workbook để đối chiếu. [Xem metadata sepsis](artifacts/mock_emr_hourly_lr/sepsis_metadata.json).

## Mức độ hoàn thiện hiện tại

**Đã có** luồng nhập và chấm điểm theo giờ, phát lại ca mẫu, danh sách theo dõi, biểu đồ diễn biến, mô hình logistic đã huấn luyện và trang đánh giá kỹ thuật. Hồ sơ nhập tay được lưu cục bộ bằng SQLite. Ứng dụng hiện chạy độc lập bằng Streamlit.

**Cần làm tiếp** để tiến tới thử nghiệm tại khoa gồm ánh xạ dữ liệu EMR thực tế, rà soát nhãn với bác sĩ, xử lý đầy đủ các tình huống nhập muộn, đánh giá hồi cứu và thử nghiệm tiền cứu im lặng. Giai đoạn im lặng ghi nhận dự báo để đánh giá trước khi đưa cảnh báo vào quy trình chăm sóc.

Các kết quả trên dữ liệu mô phỏng hiện dùng để kiểm tra hoạt động của prototype. Đánh giá thực tế sẽ cần đo độ nhạy, ca bỏ sót, số cảnh báo giả, độ hiệu chỉnh của điểm và thời gian bác sĩ nhận diện bệnh. Khả năng giảm thời gian nhận diện xuống ≤4 giờ hiện là **mục tiêu nghiên cứu**.

Phạm vi chính hiện tại tập trung vào **sepsis**. Trang đánh giá có mục mở rộng về sốc nhiễm khuẩn với số ca mô phỏng còn ít, phục vụ minh họa kỹ thuật.

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
