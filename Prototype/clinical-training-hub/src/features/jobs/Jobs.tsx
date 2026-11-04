import { post } from "@/shared/api/client";
import { useHub } from "@/shared/context/HubContext";
import { useLoad } from "@/shared/hooks/useLoad";
import { dateStr } from "@/shared/lib/dates";
import { Badge } from "@/shared/ui/Badge";
import { Empty } from "@/shared/ui/Empty";
import { LoadState } from "@/shared/ui/LoadState";
import { FileText, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

export default function Jobs() {
  const { act, busy, notify } = useHub();
  const [rev, setRev] = useState(0);
  const { data, loading, error } = useLoad<any[]>("/ai/jobs", [rev]);
  const requested = new URLSearchParams(location.hash.split("?")[1] || "").get(
      "open",
    ),
    [showAll, setShowAll] = useState(false);
  const rows =
    requested && !showAll ? data?.filter((j) => j.id === requested) : data;
  useEffect(() => {
    const timer = setInterval(() => setRev((x) => x + 1), 5000);
    return () => clearInterval(timer);
  }, []);
  return (
    <>
      <section className="panel">
        {requested && !showAll && (
          <button className="text-button" onClick={() => setShowAll(true)}>
            Xem tất cả tác vụ
          </button>
        )}
        <LoadState loading={loading && !data} error={error} />
        {rows?.map((j) => (
          <div className="list-row" key={j.id}>
            <span className="icon-box">
              <FileText size={18} />
            </span>
            <div className="grow">
              <b>
                {j.kind === "INGEST"
                  ? "Trích xuất và đánh chỉ mục tài liệu"
                  : "Tạo học liệu từ nguồn"}
              </b>
              <small>
                {dateStr(j.created_at)} · Đã chạy {j.attempts} lần
              </small>
              {j.error && <p className="error">{j.error}</p>}
            </div>
            <Badge status={j.status} />
            {j.status === "FAILED" && (
              <button
                className="secondary"
                disabled={busy || j.attempts >= 5}
                onClick={() =>
                  act(async () => {
                    await post(`/ai/jobs/${j.id}/retry`);
                    setRev((x) => x + 1);
                    notify("Đã đưa tác vụ vào hàng đợi để thử lại.");
                  })
                }
              >
                <RefreshCw size={16} />
                Thử lại
              </button>
            )}
          </div>
        ))}
        {!loading && !rows?.length && <Empty text="Chưa có tác vụ xử lý" />}
      </section>
    </>
  );
}
