# Ứng dụng Streamlit

Bản web chính nằm trong `frontend/`. Thư mục `app/` giữ giao diện Streamlit chạy độc lập và dùng chung lõi Python `src/`; không cần chạy Streamlit để sử dụng web React/FastAPI.

Ứng dụng này được giữ để tham khảo. Bộ kiểm thử mặc định và CI tập trung vào web React/FastAPI; các test giao diện và đăng nhập Streamlit cũ đã được gỡ.

## Cài đặt và chạy trên Windows

Dùng **Python 3.11**, tải hoặc clone repo rồi mở PowerShell tại thư mục gốc.

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-streamlit.txt
.\.venv\Scripts\python.exe -m streamlit run app\streamlit_app.py
```

Mở địa chỉ **Local URL** mà Streamlit hiển thị trong terminal. Repo đã có dữ liệu mẫu và mô hình để chạy trải nghiệm ngay. Môi trường hiện tại chạy bằng CPU.



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
