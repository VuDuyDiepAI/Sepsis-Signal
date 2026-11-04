import { Citation } from "@/features/documents/Citation";
import { api, post } from "@/shared/api/client";
import { useHub } from "@/shared/context/HubContext";
import { useLoad } from "@/shared/hooks/useLoad";
import { Empty } from "@/shared/ui/Empty";
import { LoadState } from "@/shared/ui/LoadState";
import {
  ArrowUpRight,
  Copy,
  FileText,
  MessagesSquare,
  Plus,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

export function Chat() {
  const { data: health } = useLoad<any>("/health");
  const { act, busy, notify } = useHub();
  const [q, setQ] = useState(""),
    [selected, setSelected] = useState(
      new URLSearchParams(location.hash.split("?")[1] || "").get("document") ||
        "",
    ),
    [cid, setCid] = useState(""),
    [messages, setMessages] = useState<any[]>([]),
    [showHistory, setShowHistory] = useState(false),
    [showReferences, setShowReferences] = useState(false),
    [rev, setRev] = useState(0);
  const {
    data: docs,
    loading: docsLoading,
    error: docsError,
  } = useLoad<any[]>("/documents?status=APPROVED");
  const {
    data: history,
    loading: historyLoading,
    error: historyError,
  } = useLoad<any[]>("/chat/conversations", [rev]);
  const references = Array.from(
    new Map(
      messages
        .filter((m) => m.role === "assistant")
        .flatMap((m) => m.citations || [])
        .map((c: any) => [c.id, c]),
    ).values(),
  ) as any[];
  useEffect(() => {
    const area = document.querySelector(".chat-messages");
    if (area) area.scrollTop = area.scrollHeight;
  }, [messages, busy]);
  async function ask(e?: FormEvent, text?: string) {
    e?.preventDefault();
    const question = text || q;
    if (!question.trim()) return;
    setQ("");
    setMessages((m) => [...m, { role: "user", content: question }]);
    await act(async () => {
      try {
        const r = await post("/chat/query", {
          question,
          conversation_id: cid || null,
          document_id: selected || null,
        });
        setCid(r.conversation_id);
        setMessages((m) => [
          ...m,
          {
            id: r.id,
            role: "assistant",
            content: r.answer,
            citations: r.citations,
          },
        ]);
        setRev((x) => x + 1);
      } catch (e) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: (e as Error).message,
            citations: [],
            isError: true,
          },
        ]);
      }
    });
  }
  return (
    <section className="panel chat-hub" aria-label="Trợ lý AI tra cứu lâm sàng">
      <div className="chat-top">
        <div className="chat-heading">
          <h2 className="sr-only">Trợ lý AI tra cứu lâm sàng</h2>
          <small
            title={
              health?.ai_provider === "demo"
                ? "Trích xuất từ khóa và template, không suy luận LLM"
                : "Tổng hợp từ nguồn được phép, cần đối soát trích dẫn"
            }
          >
            {!health
              ? "Đang tải thông tin trợ lý…"
              : health.ai_provider === "demo"
                ? "Chế độ demo"
                : "Tra cứu tài liệu đã duyệt"}
          </small>
        </div>
        <div className="chat-tools">
          <button
            className="secondary chat-history-toggle"
            onClick={() => {
              setShowHistory(!showHistory);
              setShowReferences(false);
            }}
            aria-expanded={showHistory}
            aria-controls="chat-history"
          >
            <MessagesSquare size={16} />
            Lịch sử
          </button>
          <button
            className="secondary chat-references-toggle"
            onClick={() => {
              setShowReferences(!showReferences);
              setShowHistory(false);
            }}
            aria-expanded={showReferences}
            aria-controls="chat-references"
          >
            <FileText size={16} />
            Nguồn ({references.length})
          </button>
          <select
            aria-label="Lọc nguồn tài liệu"
            disabled={docsLoading}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Tất cả tài liệu đã duyệt</option>
            {docs?.map((d) => (
              <option value={d.id} key={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      {docsError && (
        <div className="error" role="alert">
          {docsError}
        </div>
      )}
      <div className="chat-layout">
        <aside
          id="chat-history"
          aria-label="Lịch sử hội thoại"
          className={"chat-history " + (showHistory ? "visible" : "")}
        >
          <button
            className="secondary"
            onClick={() => {
              if (busy) return;
              setCid("");
              setMessages([]);
              setQ("");
              setShowHistory(false);
            }}
            disabled={busy}
          >
            <Plus size={17} />
            Hội thoại mới
          </button>
          <h3 className="nav-label">LỊCH SỬ HỘI THOẠI</h3>
          <LoadState loading={historyLoading} error={historyError} />
          {history?.map((c) => (
            <button
              className={cid === c.id ? "selected" : ""}
              key={c.id}
              title={c.title}
              disabled={busy}
              onClick={() =>
                act(async () => {
                  const r = await api("/chat/conversations/" + c.id);
                  setCid(c.id);
                  setMessages(r.messages);
                  setShowHistory(false);
                })
              }
            >
              <MessagesSquare size={15} />
              <span>{c.title}</span>
            </button>
          ))}
          {!historyLoading && !historyError && !history?.length && (
            <p className="fine">Chưa có hội thoại được lưu.</p>
          )}
        </aside>
        <section className="chat-panel" aria-label="Nội dung hội thoại">
          <div className="chat-messages">
            {!messages.length && (
              <div className="chat-welcome">
                <span className="ai-orb">
                  <Sparkles size={30} />
                </span>
                <h2>Hôm nay bạn muốn tìm hiểu điều gì?</h2>
                <p>
                  Tìm câu trả lời trong tài liệu đào tạo đã được kiểm duyệt.
                </p>
                <div className="suggestions">
                  {[
                    "Chuẩn bị phiếu bàn giao như thế nào?",
                    "Ai xác nhận thông tin bàn giao?",
                    "Phiếu bàn giao được lưu ở đâu?",
                  ].map((x) => (
                    <button
                      className="secondary"
                      key={x}
                      disabled={busy}
                      onClick={() => ask(undefined, x)}
                    >
                      {x}
                      <ArrowUpRight size={15} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={"message " + m.role}>
                <div className="message-label">
                  {m.role === "user"
                    ? "Bạn"
                    : "AI tổng hợp / trích xuất · Cần đối soát nguồn"}
                </div>
                <div className={m.isError ? "error" : "message-content"}>
                  {m.content}
                </div>
                {m.citations?.length > 0 && (
                  <div className="citation-grid">
                    {m.citations.map((c: any, j: number) => (
                      <Citation key={c.id} c={c} index={j} />
                    ))}
                  </div>
                )}
                {m.role === "assistant" && m.id && (
                  <div className="message-actions">
                    <button
                      className="icon"
                      title="Sao chép câu trả lời"
                      onClick={() =>
                        act(async () => {
                          await navigator.clipboard.writeText(m.content);
                          notify("Đã sao chép.");
                        })
                      }
                    >
                      <Copy size={15} />
                    </button>
                    {[true, false].map((helpful) => (
                      <button
                        key={String(helpful)}
                        className="icon"
                        title={
                          helpful
                            ? "Câu trả lời hữu ích"
                            : "Câu trả lời chưa hữu ích"
                        }
                        onClick={() =>
                          act(async () => {
                            await post(`/chat/messages/${m.id}/rating`, {
                              helpful,
                            });
                            notify("Đã lưu đánh giá.");
                          })
                        }
                      >
                        {helpful ? (
                          <ThumbsUp size={15} />
                        ) : (
                          <ThumbsDown size={15} />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="typing">Đang tìm bằng chứng phù hợp…</div>}
          </div>
          <form className="chat-compose" onSubmit={ask}>
            <input
              aria-label="Câu hỏi cho trợ lý"
              placeholder="Đặt câu hỏi về tài liệu nội bộ…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              maxLength={2000}
            />
            <button
              className="primary"
              aria-label="Gửi câu hỏi"
              disabled={busy || !q.trim()}
            >
              <Send size={19} />
            </button>
          </form>
          <p className="fine chat-disclaimer">
            Công cụ tra cứu phục vụ đào tạo, không đưa ra quyết định chẩn đoán
            hoặc điều trị.
          </p>
        </section>
        <aside
          id="chat-references"
          aria-label="Nguồn tham chiếu"
          className={"chat-references " + (showReferences ? "visible" : "")}
        >
          <h3>
            <FileText size={16} />
            Nguồn tham chiếu ({references.length})
          </h3>
          {references.map((c, i) => (
            <Citation c={c} index={i} key={c.id} />
          ))}
          {!references.length && <Empty text="Chưa có nguồn tham chiếu" />}
        </aside>
      </div>
    </section>
  );
}
