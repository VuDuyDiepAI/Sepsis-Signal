import { useHub } from "@/shared/context/HubContext";
import { ArrowUpRight, FileText } from "lucide-react";

export function Citation({ c, index }: { c: any; index?: number }) {
  const { source } = useHub();
  return (
    <button className="citation" onClick={() => source(c.version_id, c.id)}>
      <FileText size={18} />
      <span>
        <b>
          {index !== undefined ? `[${index + 1}] ` : ""}
          {c.title}
        </b>
        <small>{c.page ? "Trang " + c.page : c.section} · Xem nguồn gốc</small>
      </span>
      <ArrowUpRight size={15} />
    </button>
  );
}
