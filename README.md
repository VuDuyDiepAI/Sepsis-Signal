# Sepsis Signal

Ứng dụng Streamlit để trải nghiệm theo dõi nguy cơ sepsis trong 6 giờ tiếp theo bằng hồ sơ EMR mẫu.

- **Chạy ca mẫu**: mở E0009, chuyển từ T0+7h sang T0+8h để xem điểm, biểu đồ và kết quả xét nghiệm mới.
- **Nhập ca theo giờ**: tạo hồ sơ, cập nhật dữ liệu và chấm điểm từng mốc.
- **Danh sách theo dõi**: mở lại các hồ sơ đã nhập tại mốc chấm gần nhất.
- **Đánh giá mô hình**: xem kết quả theo ca và theo giờ, quy tắc chọn ngưỡng và phần mở rộng minh họa về sốc nhiễm khuẩn.

## Chạy trên Windows

Dùng Python 3.11. Mở terminal ở thư mục gốc của repo:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m streamlit run app\streamlit_app.py
```

Mở địa chỉ Streamlit hiển thị trong terminal. Repo đã gồm bộ hồ sơ mẫu và các model tương ứng. Hồ sơ nhập tay được lưu cục bộ trong SQLite.

## Hồ sơ mẫu và mô hình

- [Workbook EMR mẫu](data/mock_ed_hospital_emr_v3_hourly.xlsx) gồm **360 lượt khám và 12.960 mốc theo giờ**. Mở sheet `Guide` để xem cách đọc và sheet `DataDictionary` để xem schema.
- [Metadata mô hình](artifacts/mock_emr_hourly_lr) chứa phiên bản, checksum workbook, ngưỡng và các chỉ số đánh giá.
- Để tính lại ngưỡng và chỉ số từ model đã lưu, chạy `python scripts/train_mock_emr.py --refresh-metrics` trong môi trường ở trên. Bỏ tùy chọn này để huấn luyện lại.

Dùng hồ sơ mẫu trong chế độ trải nghiệm. Các chỉ số được tính trên dữ liệu mô phỏng và chưa được kiểm định trên hồ sơ bệnh nhân thật.
