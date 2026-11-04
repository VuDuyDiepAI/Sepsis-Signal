import { useLoad } from "@/shared/hooks/useLoad";
import { LoadState } from "@/shared/ui/LoadState";
import { Modal } from "@/shared/ui/Modal";
import { Download } from "lucide-react";
import { useEffect } from "react";

export function SourceViewer({
  id,
  chunk,
  onClose,
}: {
  id: string;
  chunk?: string;
  onClose: () => void;
}) {
  const { data, loading, error } = useLoad<any>("/sources/" + id);
  useEffect(() => {
    if (data && chunk)
      setTimeout(
        () =>
          document
            .getElementById("chunk-" + chunk)
            ?.scrollIntoView({ block: "center", behavior: "smooth" }),
        100,
      );
  }, [data, chunk]);
  return (
    <Modal title="Đối soát nguồn tài liệu" onClose={onClose} wide>
      <LoadState loading={loading} error={error} />
      {data && (
        <>
          <div className="source-heading">
            <div>
              <h3>{data.title}</h3>
              <p>
                Phiên bản {data.version.number} · {data.version.filename}
              </p>
            </div>
            <a
              className="button secondary"
              href={`/api/sources/${id}/file${data.version.filename.endsWith(".pdf") && chunk ? "#page=" + (data.chunks.find((c: any) => c.id === chunk)?.page || 1) : ""}`}
              target="_blank"
              rel="noreferrer"
            >
              <Download size={17} />
              Mở file gốc
            </a>
          </div>
          <div className="notice">
            PDF hiển thị số trang trích xuất. DOCX/TXT hiển thị mục hoặc đoạn;
            không suy đoán số trang.
          </div>
          {data.chunks.map((c: any) => (
            <article
              id={"chunk-" + c.id}
              key={c.id}
              className={"source-chunk " + (chunk === c.id ? "highlight" : "")}
            >
              <small>{c.page ? "Trang " + c.page : c.section}</small>
              <p>{c.text}</p>
            </article>
          ))}
        </>
      )}
    </Modal>
  );
}
