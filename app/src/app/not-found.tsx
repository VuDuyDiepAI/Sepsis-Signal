import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty-state panel">
      <h1>Không tìm thấy hồ sơ</h1>
      <p>Mã hồ sơ hoặc đường dẫn không có trong bộ dữ liệu trải nghiệm.</p>
      <Link href="/dashboard" className="link-button primary">
        Về tổng quan
      </Link>
    </div>
  );
}
