import { FileSearch, Info } from "lucide-react";
import type { ReactNode } from "react";
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state" role="status">
      <FileSearch size={30} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function ClinicalNote({ children }: { children?: ReactNode }) {
  return (
    <div className="clinical-note">
      <Info size={17} />
      <p>
        {children ??
          "Điểm mô hình hỗ trợ ưu tiên xem xét, không xác định chẩn đoán. Dưới ngưỡng không loại trừ sepsis. Hồ sơ trong không gian này là dữ liệu mô phỏng."}
      </p>
    </div>
  );
}
