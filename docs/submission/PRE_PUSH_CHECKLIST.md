# TC-08 / SEPSIS SIGNAL — Checklist trước khi tải nội dung lên GitHub

> **Bản dự thảo tùy chỉnh cho dự án**, dùng để tự rà soát. Không thay thế checklist gốc và quy định của Owner trong repository đích. Trước khi push, tải file, mở issue, bình luận hoặc PR, phải có phê duyệt nội dung theo quy trình áp dụng.

## 1. Nguồn và quyền chia sẻ

- [ ] Chỉ tải nội dung **đã được cho phép**; phần chưa rõ phải giữ lại để hỏi qua kênh nội bộ.
- [ ] Không có tên cá nhân/đơn vị, logo, email công việc, thông tin định danh, ảnh chụp, đường dẫn hoặc thông tin hệ thống nội bộ **chưa được phép công bố**.
- [ ] Đã rà soát README, docs, code/comment, tên biến, cấu hình, commit message, issue/PR và ảnh minh họa; không chỉ tìm từ khóa.
- [ ] Đã mở kiểm tra trực tiếp dữ liệu mẫu, PDF, workbook, hình, notebook, model/metadata và các file nhị phân.

## 2. Dữ liệu và bảo mật

- [ ] Chỉ có dữ liệu EMR mô phỏng được phép chia sẻ; không có thông tin người bệnh thật hoặc thông tin nghiệp vụ nội bộ.
- [ ] Không có mật khẩu đang hoạt động, token, API key, cookie, secret, `.env`, thông tin kết nối hay URL/host nội bộ trong code, tài liệu, test và log.
- [ ] Không đưa file SQLite (`*.sqlite*`, `*.db*`, WAL/SHM), backup, logs, Playwright traces/screenshots, cache, `node_modules/`, `.next/`, `.venv/` lên Git.
- [ ] Nếu sử dụng model/workbook đã tạo, nguồn gốc và quyền chia sẻ đã được xác nhận; metadata và nội dung đã được kiểm tra.
- [ ] Không cho rằng `.gitignore` xóa được dữ liệu nhạy cảm từng có trong lịch sử Git.

## 3. Độ đúng của mô tả SEPSIS SIGNAL

- [ ] Mô tả đúng **Logistic Regression L2**, **36 đặc trưng**, khoảng dự báo **6 giờ** và giới hạn **dữ liệu mô phỏng**.
- [ ] Không tuyên bố hệ thống đã được triển khai trên EMR thật, được phê duyệt sử dụng lâm sàng hoặc đã giảm tử vong/biến chứng.
- [ ] “Đã xem xét” là trạng thái review cảnh báo, **không phải đã xử trí**.
- [ ] Bằng chứng số liệu được ghi đúng tập kiểm thử, mẫu số, loại chỉ số và phạm vi áp dụng.

## 4. Git, đích push và lịch sử

- [ ] Đã chạy `git remote -v`, xác nhận đúng repo và branch đích do Owner chỉ định, không nhầm repository phát triển với repository nộp.
- [ ] Đã kiểm tra `git status`, `git diff`, `git diff --cached`, toàn bộ file mới/sửa/xóa và mọi commit/tag sẽ được push.
- [ ] Không `push --mirror`, không force-push, không bê nguyên thư mục `.git` hoặc lịch sử chưa được phép.
- [ ] Bản nộp giữ nguyên các file template bắt buộc. Không tự đổi tên, chuyển repo sang Public hoặc sửa quyền truy cập.
- [ ] **Người phụ trách đã xem và phê duyệt nội dung trước khi upload/push**; review PR sau push không thay thế phê duyệt này.

## 5. Kiểm thử trước khi bàn giao

- [ ] Python tests, frontend typecheck/lint/unit/integration, production build và Playwright E2E đạt trên đúng SHA bàn giao.
- [ ] Không còn React hydration #418 và không có test chỉ đạt vì retry.
- [ ] Dữ liệu dùng tại mốc dự báo là dữ liệu đã sẵn có; sửa chỉ số làm mất hiệu lực đúng các dự báo bị ảnh hưởng.
- [ ] Python lỗi không làm mất dữ liệu nhập; scoring job cũ không ghi đè revision hoặc job mới; sự kiện xem xét gắn đúng ID/phiên bản.
- [ ] CI chạy với DB kiểm thử riêng và không đưa dữ liệu người bệnh hay DB thực tế vào workflow.

## 6. Lệnh kiểm tra gợi ý

```bash
git remote -v
git status --short
git diff --stat
git diff --cached
git log --oneline -5
```

Nếu phát hiện đã tải nhầm nội dung nhạy cảm: **dừng tải thêm và báo người quản trị qua kênh nội bộ**; không dán dữ liệu đó vào issue/PR. Xóa file trong commit mới không xóa mọi bản sao hay lịch sử cũ.

**Chỉ đánh dấu checklist sau khi đã kiểm tra thực tế.**
