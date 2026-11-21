# Kiến trúc Sepsis Signal

## Thành phần và trách nhiệm

| Thành phần | Trách nhiệm |
| --- | --- |
| `frontend/src/app/` | Trang lâm sàng, trang nghiên cứu và API có kiểm tra session. |
| `frontend/src/components/` | Giao diện, biểu đồ, nhập dữ liệu và ghi nhận xem xét. |
| `frontend/src/hooks/` | Hooks hiển thị và tính số dòng vừa khung. |
| `frontend/src/lib/contracts/` | Kiểu dữ liệu chung, không phụ thuộc hạ tầng máy chủ. |
| `frontend/src/lib/clinical/` | Quy tắc đọc dữ liệu tại thời điểm, schema nhập liệu, hàng đợi cảnh báo và điều hướng. |
| `frontend/src/lib/client/` | Đồng bộ state từ API, chuyển dữ liệu trình duyệt cũ và nhận diện tài khoản phiên. |
| `frontend/src/lib/server/` | Session, quyền truy cập, SQLite, migrations, giới hạn tài nguyên và cầu nối Python. |
| `src/observation_features.py` | Tạo đặc trưng từ T0 dùng chung cho huấn luyện và suy luận. |
| `src/mock_emr.py` | Đọc workbook, tiền xử lý, nạp mô hình và giải thích log-odds. |
| `src/manual_cases.py` | Dựng đầu vào từ dữ liệu nhập tay và chấm lại các giờ bị ảnh hưởng. |
| `src/alert_evaluation.py` | Đánh giá cảnh báo theo đợt và người bệnh. |
| `app/` | Giao diện Streamlit riêng; không nằm trên đường phục vụ web. |

## Luồng xử lý web

```text
Trình duyệt
  → Session + kiểm tra quyền + kiểm tra nguồn yêu cầu
  → API lưu chỉ số vào SQLite, tăng revision, vô hiệu hóa kết quả cũ
  → API chấm dữ liệu đã lưu
  → scripts/score_frontend_case.py
  → Lõi Python + mô hình trong artifacts/
  → Kiểm tra revision và lease của lần chấm
  → Lưu dự báo → trả dữ liệu → cập nhật giao diện
```

SQLite phía máy chủ là nguồn dữ liệu bền vững cho ca nhập tay và xem xét. State React phục vụ hiển thị; dữ liệu tab cũ chỉ được chuyển vào server qua API kiểm tra hợp lệ. Lưu chỉ số thành công không phụ thuộc Python thành công. Khi dữ liệu thay đổi, kết quả cũ không còn được coi là hiện hành; lịch sử vẫn giữ nguyên.

`createClinicalReader` hợp nhất dữ liệu mẫu và ca nhập tay trước khi áp dụng cùng quy tắc đọc tại thời điểm. `ClinicalDataProvider` là hợp đồng đọc bất đồng bộ để tích hợp nguồn dữ liệu khác về sau; chưa có kết nối EMR bệnh viện.

## Màn hình và điều hướng

| Đường dẫn | Vai trò |
| --- | --- |
| `/login` | Đăng nhập, không có đăng ký. |
| `/dashboard` | Theo dõi & Cảnh báo: ưu tiên bản hiện tại chưa xem xét; có lịch sử riêng. |
| `/patients` | Hồ sơ theo dõi: tìm kiếm, lọc và tạo ca. |
| `/patients/new` | Tạo hồ sơ, nhập dữ liệu ban đầu tại T0. |
| `/patients/[id]?hour=N` | Điểm nguy cơ, diễn biến, dữ liệu lâm sàng và ghi nhận xem xét. |
| `/sample-cases` | Xem diễn tiến hồ sơ mẫu qua các giờ. |
| `/model-monitoring` | Chỉ số, chính sách chọn ngưỡng và nguồn dữ liệu. |
| `/alerts` | Đường dẫn tương thích, chuyển về dashboard. |

Hai màn hình lâm sàng chính có trách nhiệm riêng: dashboard để ưu tiên đánh giá, registry để quản lý và nhập hồ sơ. Chi tiết hồ sơ giữ điểm nguy cơ, biểu đồ, sinh hiệu và xét nghiệm cùng một vùng tổng hợp. Thông tin thuật toán nằm ở trang đánh giá mô hình.

Trên desktop từ 1024 px, khung ứng dụng dùng chiều cao cửa sổ; vùng nội dung dài cuộn bên trong. Bảng điều chỉnh số dòng theo vùng hiển thị. Mobile dùng cuộn tự nhiên để giữ chữ dễ đọc. Mốc giờ nằm trong URL; `returnTo` chỉ chấp nhận đường dẫn danh sách nội bộ hợp lệ.

## Dữ liệu và công cụ

| Thư mục / script | Nội dung |
| --- | --- |
| `data/` | Workbook mẫu và các DB cục bộ bị loại khỏi Git. |
| `artifacts/mock_emr_hourly_lr/` | Mô hình, tiền xử lý, ngưỡng và metadata. |
| `frontend/src/data/` | Fixture lâm sàng và kết cục tham chiếu tách biệt. |
| `scripts/export_frontend_demo.py` | Xuất fixture bằng mô hình đã lưu, không huấn luyện lại. |
| `scripts/score_frontend_case.py` | Chấm dữ liệu từ web bằng Python. |
| `scripts/backup_web_db.py` | Sao lưu SQLite nhất quán cả WAL. |
| `scripts/rebuild_observation_snapshots.py` | Dựng lại đặc trưng từ sự kiện nguồn. |
| `scripts/train_mock_emr.py` | Huấn luyện hoặc cập nhật chỉ số/metadata. |

Giữ các đường dẫn gốc `src/`, `scripts/`, `data/`, `artifacts/` ổn định vì chúng được dùng chung bởi web, Python, mô hình đã đóng gói và Streamlit.

## Quy tắc tổ chức

- Trang/API đặt trong `app`; xử lý nghiệp vụ dùng lại đặt trong `lib`.
- Mã máy chủ nằm trong `lib/server`; giao diện không nhập trực tiếp SQLite, auth server hay tiến trình Python.
- Dùng alias `@/` cho import trong frontend để việc đổi vị trí component không làm sai đường dẫn tương đối.
- Kiểm thử đặt trong `tests` riêng; không trộn kết quả test, cache hoặc DB kiểm thử với mã nguồn.
- Không đưa `node_modules`, `.next`, cache Python, báo cáo test, SQLite hoặc biến môi trường lên Git.

Xem [phát triển và kiểm thử](development.md), [vận hành](operations.md), [dữ liệu và mô hình](data-and-model.md).
