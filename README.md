# Sepsis Signal — prototype nghiên cứu

Prototype Streamlit cho phép nhập hồ sơ EMR **giả lập** theo từng mốc giờ và xem mô hình hồi quy Logistic ước tính nguy cơ sepsis trong 6 giờ tiếp theo. Bản demo hiện có thêm một mô hình sốc nhiễm khuẩn thử nghiệm riêng.

## Chạy ứng dụng

Yêu cầu Python 3.11 trên Windows:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m streamlit run app\streamlit_app.py
```

Mở địa chỉ local do Streamlit hiển thị. Các hồ sơ nhập tay được lưu cục bộ trong `data/manual_cases.sqlite3`; tệp này bị loại khỏi Git.

## Dữ liệu và mô hình

- `data/mock_ed_hospital_emr_v3_hourly.xlsx`: 360 lượt khám giả lập, 12.960 mốc theo giờ, kèm bảng từ điển dữ liệu.
- `artifacts/mock_emr_hourly_lr/`: model và metadata tương ứng; mã kiểm tra dữ liệu trong metadata dùng để xác nhận workbook khớp model.
- `scripts/train_mock_emr.py`: huấn luyện lại hai model demo từ workbook. Chạy lệnh này sau khi cài các gói trong `requirements.txt`.

Toàn bộ bệnh án và nhãn trong workbook là dữ liệu sinh tổng hợp, không phải dữ liệu MIMIC, PhysioNet hay bệnh nhân thật. Điểm nguy cơ và kết quả đánh giá trên dữ liệu này chỉ minh họa luồng kỹ thuật; không dùng để chẩn đoán, điều trị hoặc ra quyết định lâm sàng.
