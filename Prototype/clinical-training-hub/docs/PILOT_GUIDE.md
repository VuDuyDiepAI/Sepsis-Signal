# Hướng dẫn thử nghiệm — tiếng Việt

Các tài liệu đều là tình huống bàn giao giả lập. Không nhập thông tin người bệnh. Tài khoản và mật khẩu môi trường phát triển ở README, không dùng lại cho triển khai thực tế.

RBAC: mỗi tài khoản có đúng một vai trò. **Admin** quản trị, xử lý feedback, upload/tạo học liệu, gửi duyệt, xuất bản, phân công và xem báo cáo; không có quyền Staff và không được duyệt chuyên môn. **Reviewer** xem nguồn và duyệt/trả lại tài liệu, học liệu theo chuyên môn; không sửa bản nháp hoặc xuất bản. **Staff** sử dụng chức năng cá nhân, học khóa được giao và làm quiz. Email `manager@demo.local` hiện là tài khoản Admin, không phải vai trò thứ tư. Menu phân công có tên **Phân công đào tạo**.


## A. Nhập tri thức

1. Đăng nhập Admin. Chọn **Quản lý tài liệu → Tải lên tài liệu**.
2. Chọn `demo/ban-giao-gia-lap.pdf` hoặc DOCX. Điền tên mới và phạm vi **Trong khoa/phòng**; chờ xử lý.
3. Mở tài liệu, chọn **Đọc và kiểm tra nguồn**. Đối chiếu ba trang PDF hoặc mục/đoạn DOCX. Chọn **Gửi phê duyệt tài liệu**.
4. Đăng xuất; đăng nhập chuyên gia, mở **Kiểm duyệt chuyên môn**. Đọc nguồn rồi phê duyệt; từ chối phải ghi lý do.

Nếu tác vụ lỗi, người tải lên hoặc admin mở **Tác vụ xử lý** để xem lỗi và thử lại tối đa 5 lần. File scan chưa có OCR sẽ không được âm thầm coi là đã đọc.

## B. Tra cứu có căn cứ

1. Đăng nhập nhân viên y tế, mở **Trợ lý tri thức AI**. Lọc theo tài liệu vừa duyệt.
2. Hỏi “Điều dưỡng chuẩn bị phiếu bàn giao như thế nào?” hoặc “Ai xác nhận thông tin bàn giao?”.
3. Nhấp thẻ nguồn, xem phần được tô nổi và mở file gốc; PDF dùng đúng trang, DOCX dùng mục/đoạn.
4. Hỏi “Liều vancomycin khi suy thận?” để kiểm tra từ chối vì không có bằng chứng trong nguồn demo.
5. Có thể đánh giá hữu ích hoặc sao chép câu trả lời. Hội thoại chỉ người tạo được xem; thu hồi quyền tài liệu sẽ ẩn đoạn nguồn đã lưu.

## C. Tạo và duyệt học liệu

1. Admin mở **Xây dựng học liệu → Tạo khóa học**, nhập thông tin và chọn nguồn vừa duyệt.
2. Mở bài học, checklist, quiz, storyboard. Chế độ demo dùng template, không tuyên bố đã suy luận bằng LLM.
3. Chọn **Chỉnh sửa học liệu**, sửa một câu hỏi/đáp án, lưu. Mỗi lần lưu tạo phiên bản nháp mới.
4. **Gửi phê duyệt học liệu**; chuyên gia kiểm tra nguồn và phê duyệt hoặc trả lại.
5. Quản lý mở lại khóa học và **Xuất bản khóa học**. Không thể xuất bản nháp hoặc học liệu bị trả lại.

Reviewer ghi nhận yêu cầu chỉnh sửa; Admin sửa học liệu rồi gửi duyệt lại. Admin có thể đổi vai trò một nhân viên thành Reviewer, không cộng thêm quyền Staff. Người từng tạo, sửa hoặc gửi duyệt vẫn không được tự phê duyệt nội dung của mình sau khi đổi vai trò. Nội dung xuất bản cũ được giữ nguyên; thay nguồn sẽ gắn cờ rà soát và chặn phân công mới.

## D. Phân công

1. Quản lý mở **Phân công đào tạo**, chọn **Phân công đào tạo** trên khóa đã xuất bản.
2. Chọn **Nhóm đào tạo → Điều dưỡng mới**, đặt hạn hoàn thành, xác nhận.
3. Có thể giao theo cá nhân hoặc khoa/phòng. Hệ thống kiểm tra từng người có quyền xem nguồn.
4. Staff xem lịch cá nhân ở **Lịch đào tạo**. Nhắc hạn hiện trong ứng dụng, chưa gửi email/SMS.

## E. Học và kiểm tra

1. Nhân viên mở **Khóa học của tôi → Vào học**.
2. Đọc từng bài, mở nguồn, chọn **Đánh dấu hoàn thành bài**.
3. Sau khi hoàn thành bài học, mở kiểm tra cuối khóa, trả lời đủ câu rồi nộp.
4. Xem điểm, giải thích và trích dẫn. Mặc định đạt từ 80%. Có thể làm lại; điểm tốt nhất dùng cho báo cáo.
5. Tải lại trình duyệt hoặc đăng nhập lại để xác nhận kết quả được lưu. Tiến độ bài học chiếm 90%; đạt quiz để hoàn tất 100%.

## F. Theo dõi và chứng chỉ

Admin mở **Báo cáo đào tạo**, lọc khoa/phòng, nhóm và khóa học. Có thể tìm nhân viên/khóa học, lọc trạng thái hoặc các phân công sắp đến hạn trong 7 ngày. Ba chỉ số đếm theo nhân viên trong kết quả đang lọc: mỗi người chỉ được tính hoàn thành khi mọi phân công trong kết quả đều đã hoàn thành. Hai người, một người hoàn tất toàn bộ phân công thì tỷ lệ là 50%; không có nhân viên trong kết quả thì chưa có tỷ lệ. Bảng giữ nguyên tiến độ, trạng thái và điểm cao nhất do hệ thống cung cấp; điểm 0 khác với chưa làm bài. Nút chi tiết hiển thị thông tin phân công, nút **Xuất CSV** xuất toàn bộ kết quả đang lọc, không chỉ trang hiện tại. Chứng chỉ phía dưới theo phạm vi khoa/phòng và nhóm, độc lập với bộ lọc khóa học.

**Lịch đào tạo** có tháng/tuần/năm, hạn học, sự kiện và ngày hết hạn chứng chỉ. Staff xem chứng chỉ cá nhân tại **Chứng chỉ**; Admin xem các chứng chỉ cần lưu ý trong báo cáo. Các mốc nhắc 30/14/7 ngày là cấu hình thử nghiệm, không phải quy định bệnh viện. Chứng chỉ không được tự gia hạn hay xác minh từ kết quả khóa học.

## G. Góp ý

Bất kỳ người dùng nào cũng có thể chọn **Gửi góp ý** từ mọi màn hình, đánh giá 1–5 sao và ghi điểm tốt, vấn đề, đề xuất. Admin mở **Trung tâm góp ý** để xem điểm theo tính năng và chuyển trạng thái Mới → Đang xử lý → Đã giải quyết.
