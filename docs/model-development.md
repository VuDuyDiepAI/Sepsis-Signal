# Huấn luyện và cập nhật dữ liệu


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

GitHub Actions chạy toàn bộ thư mục `tests` trên Python 3.11 cho push và pull request. Cài môi trường kiểm thử bằng `python -m pip install -r requirements-dev.txt`. Kiểm tra chính sách bảo vệ nhánh trực tiếp trên GitHub trước khi hợp nhất.

```powershell
.\.venv\Scripts\python.exe -m pip install pytest
.\.venv\Scripts\python.exe -m pytest -q tests
```
