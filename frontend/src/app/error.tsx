"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty-state panel">
      <h1>Không thể tải nội dung</h1>
      <p>Vui lòng thử lại. Không có dữ liệu lâm sàng nào được ghi.</p>
      <Button onClick={reset}>Thử lại</Button>
    </div>
  );
}
