# Dữ liệu, đặc trưng và đánh giá mô hình

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
- **[Tải workbook EMR mẫu](../data/mock_ed_hospital_emr_v3_hourly.xlsx)** gồm **360 lượt khám và 12.960 mốc theo giờ**. Trong Excel, mở sheet **`Guide`** để đọc hướng dẫn và **`DataDictionary`** để xem schema, kiểu dữ liệu, đơn vị và vai trò của các trường.
- Các sheet tách hồ sơ, sự kiện, đặc trưng và nhãn để kiểm tra đường đi từ dữ liệu đến kết quả dự báo.

Bộ hồ sơ đi kèm và dữ liệu huấn luyện mô hình là **EMR mô phỏng**, được tạo theo kịch bản với tình huống thiếu dữ liệu và thời điểm trả kết quả. Điểm hiển thị phản ánh mô hình học trên bộ dữ liệu này. Khi trải nghiệm nhập tay, sử dụng mã ca và thông tin mô phỏng.

## Mô hình tính điểm như thế nào?

Phiên bản đang phục vụ sử dụng **hồi quy logistic có điều chuẩn L2**. Mô hình đã được huấn luyện và đóng gói cùng bộ tiền xử lý, ngưỡng cảnh báo và metadata trong repo.

1. **Lấy dữ liệu tại mốc cần chấm.** Chỉ dùng bản ghi đã có trên EMR tại mốc đó. Kết quả xét nghiệm trả ở T0+2 được sử dụng từ T0+2.
2. **Tạo đặc trưng.** Tổng hợp giá trị gần nhất, thay đổi đầu–cuối, mạch trung bình và số lần đo trên toàn bộ khoảng **[T0, mốc dự báo]** thành 36 trường đầu vào. Cửa sổ quan sát tăng dần, không loại sinh hiệu chỉ vì đã quá 6 giờ hoặc xét nghiệm đã quá 24 giờ. Chỉ dùng bản ghi đã có trên EMR tại mốc đó; giá trị gần nhất được chọn theo giờ đo hoặc lấy mẫu để kết quả cũ trả muộn không ghi đè bản đo mới hơn.
3. **Tiền xử lý.** Tạo các biến bổ sung, xử lý giá trị thiếu, chuẩn hóa và mã hóa theo bộ biến đổi đã học trong quá trình huấn luyện.
4. **Tính điểm và so ngưỡng.** Mô hình trả điểm sepsis. Điểm bằng hoặc cao hơn ngưỡng tạo trạng thái cảnh báo.
5. **Hiển thị và lưu lịch sử.** Người dùng xem điểm cùng sinh hiệu, xét nghiệm và biểu đồ để đối chiếu qua các giờ.

Khi huấn luyện, các mốc của cùng lượt khám được giữ trong cùng nhóm. Tham số được chọn qua xác thực chéo theo nhóm trên tập huấn luyện, ngưỡng được chọn trên tập xác thực riêng và kết quả cuối được báo trên tập giữ lại theo thời gian mô phỏng. Ngưỡng cao nhất đạt độ nhạy người bệnh ≥80% được chọn theo đợt cảnh báo gộp trong 6 giờ. Không bắt buộc Recall theo giờ ≥80%. PPV theo đợt và cảnh báo giả được đánh giá riêng, có khoảng tin cậy bootstrap theo người bệnh. Xác suất chưa tái hiệu chỉnh; cách chọn ngưỡng hiện dùng validation độc lập, chưa thay thế đầy đủ quy trình nested CV và hiệu chỉnh ngoài mẫu trong đề cương. Metadata lưu cấu hình, phiên bản và checksum workbook để đối chiếu. [Xem metadata sepsis](../artifacts/mock_emr_hourly_lr/sepsis_metadata.json).

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

## Đánh giá theo đề cương

Ngưỡng sepsis được chọn cao nhất trên validation vẫn đạt độ nhạy cấp người bệnh ≥80% khi áp dụng đợt cảnh báo 6 giờ. Không đặt trần ngưỡng tùy ý hoặc ràng buộc Recall theo giờ. Đợt bắt đầu ở lần vượt ngưỡng đầu tiên; các lần vượt tiếp theo đến hết 6 giờ được gộp vào đợt đó và không kéo dài khóa. Chỉ khi sepsis khởi phát trong `(đầu đợt, đầu đợt + 6h]`, đợt mới được tính đúng. Cảnh báo quá sớm trên một ca sau đó có sepsis vẫn tính là giả.

Trang Đánh giá mô hình ưu tiên độ nhạy người bệnh, PPV theo đợt, đợt giả/100 người bệnh, đợt giả/đợt đúng, thời gian báo trước và tỷ lệ lần vượt được gộp. Chỉ số theo mốc giờ nằm ở nhóm bổ sung riêng. Nhóm Phân biệt & hiệu chỉnh có AUROC, AUPRC cùng tỷ lệ biến cố, Brier, intercept, slope và biểu đồ hiệu chỉnh. KTC 95% dùng bootstrap 1.000 lần theo người bệnh, giữ nguyên mô hình và ngưỡng; tỷ lệ không có mẫu số được hiển thị là chưa ước lượng, không thay bằng 0.

Đây là đánh giá trên bộ dữ liệu mô phỏng. Chọn ngưỡng hiện dùng validation độc lập, chưa phải dự báo ngoài mẫu sau nested CV và hiệu chỉnh xác suất. Các đường/hệ số hiệu chỉnh là chẩn đoán, không tự thay đổi xác suất. Chưa có số liệu vận hành EMR thực để báo cáo độ trễ, lỗi hoặc uptime. Thay đổi này giữ nguyên workbook và trọng số logistic, cập nhật metadata và phiên bản chính sách; ca nhập tay cũ giữ dữ liệu nhưng cần chấm lại, không kế thừa review của kết quả/chính sách cũ.
