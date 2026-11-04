import { BookOpen } from "lucide-react";
import { ReactNode } from "react";

export function Empty({
  text = "Chưa có dữ liệu",
  children,
}: {
  text?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <BookOpen size={30} />
      <h3>{text}</h3>
      {children}
    </div>
  );
}
