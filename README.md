# VinmecStudyAI

Repository làm việc chung của **VuDuyDiepAI** cho Healthcare Knowledge & Learning Platform.

## Source hiện tại

Ứng dụng được đặt trong [`Prototype/clinical-training-hub`](Prototype/clinical-training-hub). Thư mục này chứa frontend React/TypeScript, backend FastAPI, migration database, tài liệu mẫu và cấu hình Docker.

## Chạy trên Windows

Cần Git, Python 3.12+ và Node.js 22.12+.

```powershell
git clone https://github.com/VuDuyDiepAI/VinmecStudyAI.git
cd VinmecStudyAI\Prototype\clinical-training-hub
Copy-Item .env.example .env
.\start.ps1
```

Chỉ sao chép `.env.example` ở lần cài đầu; giữ cấu hình `.env` đã có. Nếu PowerShell chặn script, chạy `powershell -ExecutionPolicy Bypass -File .\start.ps1` cho lần chạy đó.

Mở [http://127.0.0.1:8000](http://127.0.0.1:8000). Lần đầu script cài thư viện, build frontend, tạo database và dữ liệu demo riêng trên máy của người chạy. Dữ liệu từ máy phát triển ban đầu không nằm trong repository.

Tài khoản demo: `admin@demo.local`, `reviewer@demo.local`, `staff@demo.local`; mật khẩu mặc định `Demo@2026!`. Các tài khoản này chỉ được tạo khi database mới chạy với `DEMO_MODE=true`. Đây là dữ liệu giả lập.

Xem [README ứng dụng](Prototype/clinical-training-hub/README.md) và [hướng dẫn sử dụng](Prototype/clinical-training-hub/docs/PILOT_GUIDE.md) để biết đầy đủ vai trò, cấu hình AI, Docker và giới hạn prototype.

## Cùng phát triển

Sau khi được mời vào repository private, mỗi người clone về máy riêng. Tạo nhánh cho từng công việc từ `main` mới nhất:

```powershell
git switch main
git pull --ff-only
git switch -c feature/ten-cong-viec
```

Sửa source trong `Prototype/clinical-training-hub`, kiểm tra chức năng bị ảnh hưởng và chạy `npm run build` trong thư mục ứng dụng. Sau đó commit và push nhánh:

```powershell
git add <cac-file-da-sua>
git diff --cached
git commit -m "Mo ta thay doi"
git push -u origin feature/ten-cong-viec
```

Tạo Pull Request vào `main` để đồng đội review. GitHub Actions kiểm tra build frontend, cú pháp Python, migration trên database mới, đăng nhập ba vai trò và một số giới hạn phân quyền. Thay đổi nghiệp vụ vẫn cần kiểm thử tương ứng.

Không commit `.env`, API key, database, upload thực tế, thư viện đã cài hoặc bản build. File `.env.example` chỉ chứa cấu hình mẫu. Không sử dụng dữ liệu người bệnh thật cho prototype.

Việc push repository chia sẻ mã nguồn; website chạy chung cần được triển khai lên một máy chủ riêng.
