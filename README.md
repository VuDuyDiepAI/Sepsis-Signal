# VinmecStudyAI

Nền tảng tri thức và đào tạo lâm sàng nội bộ bằng tiếng Việt, phục vụ quản lý tài liệu chuyên môn, xây dựng học liệu và theo dõi đào tạo nhân viên.

## Phạm vi

- Quản lý tài liệu, phiên bản và kiểm duyệt chuyên môn.
- Tra cứu bằng trợ lý AI với nguồn tham chiếu.
- Biên soạn, phê duyệt, xuất bản và phân công khóa học.
- Học tập, quiz, lịch đào tạo, chứng chỉ, báo cáo và góp ý.

## Công nghệ và cấu trúc

Frontend sử dụng React, TypeScript và Vite. Backend sử dụng FastAPI, SQLAlchemy và Alembic; database là SQLite khi chạy local hoặc PostgreSQL/pgvector trong Docker.

Source ứng dụng nằm trong [`Prototype/clinical-training-hub`](Prototype/clinical-training-hub). Frontend chia thành `app`, `features`, `shared`; backend chia theo phân hệ và thành phần dùng chung.

Xem [tổng quan ứng dụng và hướng dẫn chạy](Prototype/clinical-training-hub/README.md) để cài đặt, sử dụng tài khoản demo và phát triển cùng nhóm.
