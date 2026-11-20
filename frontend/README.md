# Sepsis Signal — Web

Web Next.js/React/TypeScript cho luồng theo dõi và cảnh báo sepsis. Xem [giới thiệu dự án](../README.md) để hiểu bài toán và mục tiêu lâm sàng.

## Chạy cục bộ

Yêu cầu Node.js ≥22.13. Chấm ca nhập tay cần Python đã cài `requirements.txt` tại thư mục gốc repository.

```powershell
npm ci
npm run dev
```

Mở [http://127.0.0.1:3000](http://127.0.0.1:3000), chọn tài khoản trải nghiệm bên dưới form đăng nhập. Chạy bản build: `npm run build`, sau đó `npm run start`.

## Tổ chức mã nguồn

```text
src/
  app/                    Trang và API theo Next.js App Router
  components/
    auth/                 Ranh giới đăng nhập
    providers/            Session và trạng thái xem xét
    clinical/             Hồ sơ, cảnh báo, biểu đồ, nhập liệu
    dashboard/            Bảng danh sách hồ sơ
    layout/               Khung ứng dụng và điều hướng
    shared/               Trạng thái rỗng, thông báo lưu trữ
    ui/                   UI primitives đang sử dụng
  hooks/                  Hooks giao diện dùng chung
  lib/
    contracts/            Kiểu dữ liệu trao đổi
    clinical/             Đọc dữ liệu, thời gian, schema, hàng đợi
    client/               Đồng bộ dữ liệu và chuyển dữ liệu tab cũ
    server/               Auth, SQLite, migrations, chấm điểm, giới hạn API
    utils.ts              Điểm nhập cn cho shadcn
  data/                   Ca mẫu và kết cục tham chiếu tách biệt
tests/
  unit/                   Hàm thuần và hành vi client với mock
  integration/            SQLite, xác thực, revision, lưu/chấm
  e2e/                    Luồng trình duyệt và responsive
scripts/                  Launcher web và cấp tài khoản
```

## Kiểm tra

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Playwright khởi chạy server riêng ở cổng 3100 và dùng cơ sở dữ liệu kiểm thử riêng. Không dùng DB web đang chạy để kiểm thử.

## Tài liệu liên quan

- [Kiến trúc và đường đi dữ liệu](../docs/architecture.md).
- [Quy tắc mốc giờ, đầu vào và mô hình](../docs/data-and-model.md).
- [Phát triển và kiểm thử](../docs/development.md).
- [Vận hành, tài khoản, SQLite và sao lưu](../docs/operations.md).
