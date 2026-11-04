import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUp,
  ArrowLeft,
  ClipboardCopy,
  ClipboardList,
  FileDown,
  Flag,
  ListFilter,
  Files,
  X,
  BookOpen,
  ChevronDown,
  Copy,
  ExternalLink,
  List,
  Search,
  Share2,
} from "lucide-react";
import PaperDetail from "./PaperDetail";
import type { Paper } from "./types";
import "./search.css";
import MockResearchReport from "./MockResearchReport";
import { mockQuestion, mockStudies } from "./mockResearch";

type SearchEvent = {
  type?: string;
  message?: string;
  step?: string;
  state?: string;
  source?: string;
  time?: string;
  level?: string;
  run_id?: string;
};

export default function ResearchSearch({
  embedded = true,
  apiBase = "/api/research",
}: {
  embedded?: boolean;
  apiBase?: string;
}) {
  const [question, setQuestion] = useState(mockQuestion);
  const [mockMode, setMockMode] = useState(true);
  const [mockComplete, setMockComplete] = useState(false);
  const reportElement = useRef<HTMLDivElement>(null);
  const [submitted, setSubmitted] = useState("");
  const [compact, setCompact] = useState(false);
  const [rightPanel, setRightPanel] = useState<"references" | "filter" | null>(
    null,
  );
  const sidePanel = useRef<HTMLElement>(null);
  const referencesButton = useRef<HTMLButtonElement>(null);
  const chatThread = useRef<HTMLDivElement>(null);
  const chatScroll = useRef(0);

  function openPanel(panel: "references" | "filter") {
    if (!rightPanel) chatScroll.current = chatThread.current?.scrollTop || 0;
    setRightPanel(panel);
  }

  function returnToChat() {
    setRightPanel(null);
    setSelected(null);
    requestAnimationFrame(() => {
      referencesButton.current?.focus({ preventScroll: true });
      chatThread.current?.scrollTo({
        top: chatScroll.current,
        behavior: "instant",
      });
    });
  }

  useEffect(() => {
    if (rightPanel && window.matchMedia("(max-width: 760px)").matches) {
      sidePanel.current?.focus({ preventScroll: true });
    }
  }, [rightPanel]);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyPosition, setCopyPosition] = useState({ top: 0, left: 0 });
  const reportDialog = useRef<HTMLDialogElement>(null);
  const [reportText, setReportText] = useState("");
  const [notice, setNotice] = useState("");
  const [papers, setPapers] = useState<Paper[]>(mockStudies);
  const [selected, setSelected] = useState<Paper | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [events, setEvents] = useState<SearchEvent[]>([]);
  const [runId, setRunId] = useState("");
  const [live, setLive] = useState(false);
  const filtered = papers;
  const visible = filtered;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!question.trim() || loading) return;
    setMockComplete(false);
    setSubmitted(question.trim());
    setQuestion("");
    setPapers([]);
    setLoading(true);
    setLive(true);
    setSelected(null);
    setError("");
    setEvents([]);
    setRunId("");
    if (mockMode) {
      setEvents([
        {
          step: "mock",
          state: "started",
          message: "Mock · Đọc câu hỏi và khung báo cáo",
        },
      ]);
      await new Promise((resolve) => setTimeout(resolve, 450));
      setPapers(mockStudies);
      setEvents([
        {
          step: "mock",
          state: "completed",
          message: "Mock · Chuẩn bị 5 nguồn minh họa",
        },
        {
          step: "mock",
          state: "completed",
          message:
            "Mock · Dựng báo cáo 4 phần, ma trận khoảng trống và biểu đồ",
        },
      ]);
      setMockComplete(true);
      setLoading(false);
      return;
    }
    try {
      const response = await fetch(`${apiBase}/search/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim(), demo: false }),
      });
      if (!response.ok) {
        let message = "Không thể tìm kiếm lúc này.";
        try {
          message = (await response.json()).detail || message;
        } catch {
          /* keep default */
        }
        throw new Error(message);
      }
      if (!response.body) throw new Error("Kết nối không trả về dữ liệu.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let result: { papers?: Paper[] } | undefined;
      const consume = (line: string) => {
        if (!line.trim()) return;
        const item = JSON.parse(line) as SearchEvent & {
          data?: { papers?: Paper[] };
        };
        if (item.type === "heartbeat") return;
        if (item.run_id) setRunId(item.run_id);
        if (item.type === "error")
          throw new Error(item.message || "Tìm kiếm gặp lỗi.");
        if (item.type === "result") {
          result = item.data;
          return;
        }
        if (item.type === "log" || item.step)
          setEvents((previous) => [...previous, item]);
      };
      try {
        while (true) {
          const { value, done } = await reader.read();
          buffer += done
            ? decoder.decode()
            : decoder.decode(value, { stream: true });
          let newline = buffer.indexOf("\n");
          while (newline >= 0) {
            consume(buffer.slice(0, newline));
            buffer = buffer.slice(newline + 1);
            newline = buffer.indexOf("\n");
          }
          if (done) {
            consume(buffer);
            break;
          }
        }
      } finally {
        reader.releaseLock();
      }
      if (!result) throw new Error("Kết nối đóng trước khi có kết quả.");
      setPapers(result.papers || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Tìm kiếm gặp lỗi.");
      setPapers([]);
    } finally {
      setLoading(false);
    }
  }

  async function share() {
    try {
      await navigator.clipboard.writeText(
        submitted || "Tra cứu tài liệu nghiên cứu lâm sàng",
      );
      setNotice("Đã sao chép câu hỏi.");
    } catch {
      setNotice("Không thể sao chép.");
    }
  }
  const resultText = [
    submitted || "Tra cứu nghiên cứu lâm sàng",
    `${papers.length} tài liệu`,
    ...papers.map((p, i) => `${i + 1}. ${p.title}\n${p.key_takeaway || ""}`),
  ].join("\n\n");
  const citedText =
    resultText +
    "\n\nTài liệu tham khảo\n" +
    papers
      .map(
        (p, i) =>
          `[${i + 1}] ${p.authors?.join(", ") || "Chưa có tác giả"}. ${p.title}. ${p.journal || ""}. ${p.published_date || ""}. ${p.doi ? `https://doi.org/${p.doi}` : p.url || ""}`,
      )
      .join("\n");
  async function copyResults(withCitations: boolean) {
    setCopyOpen(false);
    try {
      const text = reportElement.current?.innerText || resultText;
      await navigator.clipboard.writeText(
        withCitations ? text + "\n\n" + citedText : text,
      );
      setNotice("Đã sao chép kết quả.");
    } catch {
      setNotice("Không thể sao chép.");
    }
  }
  function saveReport(event: FormEvent) {
    event.preventDefault();
    try {
      const raw = JSON.parse(
        localStorage.getItem("research-search-reports") || "[]",
      );
      const reports = Array.isArray(raw) ? raw : [];
      reports.push({
        question: submitted,
        runId,
        message: reportText.trim(),
        time: new Date().toISOString(),
      });
      localStorage.setItem("research-search-reports", JSON.stringify(reports));
      reportDialog.current?.close();
      setReportText("");
      setNotice("Đã lưu phản hồi trên máy này.");
    } catch {
      setNotice("Không thể lưu phản hồi.");
    }
  }
  return (
    <div className={`rs-root${embedded ? " rs-embedded" : ""}`}>
      {!embedded && (
        <header className="rs-header">
          <strong>
            {submitted ? submitted.slice(0, 65) : "Tra cứu nghiên cứu lâm sàng"}
          </strong>
          <div className="rs-header-actions">
            <button className="rs-share" onClick={share}>
              <Share2 size={16} /> Chia sẻ
            </button>
          </div>
        </header>
      )}
      <main
        className={`rs-workspace${rightPanel ? " rs-panel-open" : " rs-panel-closed"}`}
      >
        <section className="rs-conversation" aria-label="Không gian nghiên cứu">
          <div ref={chatThread} className="rs-thread">
            {submitted ? (
              <div className="rs-question-bubble">{submitted}</div>
            ) : (
              <div className="rs-welcome">
                <BookOpen size={28} />
                <h1>Bắt đầu từ một câu hỏi nghiên cứu</h1>
                <p>
                  Tra cứu tài liệu, đọc bằng chứng và xem thông tin của từng
                  paper.
                </p>
              </div>
            )}
            <details className="rs-steps" open={loading || undefined}>
              <summary>
                <Search size={16} />
                {loading ? "Đang nghiên cứu" : "Tiến trình tìm kiếm"} ·{" "}
                {events.length} bước <ChevronDown size={14} />
              </summary>
              <div className="rs-step-list">
                {events.length ? (
                  events.map((e, i) => (
                    <p key={i}>
                      <Search size={13} />
                      <span>
                        {e.message ||
                          `${e.step}${e.source ? ` · ${e.source}` : ""}: ${e.state || ""}`}
                      </span>
                    </p>
                  ))
                ) : (
                  <p>
                    Nhập câu hỏi để bắt đầu tìm kiếm trên các nguồn nghiên cứu.
                  </p>
                )}
              </div>
              {runId && (
                <a
                  href={`${apiBase}/runs/${encodeURIComponent(runId)}/log`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Tải nhật ký JSONL
                </a>
              )}
            </details>
            {mockComplete && (
              <div ref={reportElement}>
                <MockResearchReport
                  onSource={(p) => {
                    setSelected(p);
                    openPanel("references");
                  }}
                />
              </div>
            )}
            {loading && (
              <p role="status" className="rr-loading">
                Đang chuẩn bị kết quả{mockMode ? " minh họa" : ""}…
              </p>
            )}
            <div className="rs-response-actions" aria-label="Thao tác kết quả">
              <button
                ref={referencesButton}
                type="button"
                aria-expanded={rightPanel === "references"}
                aria-controls="rs-side-panel"
                onClick={() =>
                  rightPanel === "references"
                    ? returnToChat()
                    : openPanel("references")
                }
              >
                <Files size={18} />
                References
              </button>
              <button
                type="button"
                className="rs-action-filter"
                aria-expanded={rightPanel === "filter"}
                aria-controls="rs-side-panel"
                onClick={() =>
                  rightPanel === "filter" ? returnToChat() : openPanel("filter")
                }
              >
                <ListFilter size={18} />
                Filter
              </button>
              <div className="rs-copy-control">
                <button
                  type="button"
                  aria-label="Copy"
                  aria-expanded={copyOpen}
                  aria-controls="rs-copy-menu"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setCopyPosition({
                      left: Math.max(
                        8,
                        Math.min(rect.left, window.innerWidth - 248),
                      ),
                      top:
                        rect.top > 160
                          ? rect.top - 150
                          : Math.min(rect.bottom + 6, window.innerHeight - 158),
                    });
                    setCopyOpen(!copyOpen);
                  }}
                >
                  <ClipboardCopy size={18} />
                  <ChevronDown size={13} />
                </button>
                {copyOpen &&
                  createPortal(
                    <div
                      className="rs-floating-copy"
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setCopyOpen(false);
                      }}
                    >
                      <button
                        className="rs-copy-backdrop"
                        aria-label="Đóng menu sao chép"
                        onClick={() => setCopyOpen(false)}
                      />
                      <div
                        className="rs-copy-menu"
                        id="rs-copy-menu"
                        style={copyPosition}
                        tabIndex={-1}
                        ref={(el) => el?.focus()}
                      >
                        <button onClick={() => copyResults(false)}>
                          <ClipboardCopy size={17} />
                          Copy text
                        </button>
                        <button onClick={() => copyResults(true)}>
                          <ClipboardList size={17} />
                          Copy with citations
                        </button>
                        <button
                          onClick={() => {
                            setCopyOpen(false);
                            window.print();
                          }}
                        >
                          <FileDown size={17} />
                          Export as PDF
                        </button>
                      </div>
                    </div>,
                    document.body,
                  )}
              </div>
              <button
                type="button"
                aria-label="Report"
                onClick={() => reportDialog.current?.showModal()}
              >
                <Flag size={18} />
              </button>
            </div>
          </div>
          <div className="rs-composer-area">
            {error && (
              <div className="rs-error" role="alert">
                {error}
              </div>
            )}
            {notice && (
              <div className="rs-notice" role="status">
                {notice}
                <button
                  aria-label="Đóng thông báo"
                  onClick={() => setNotice("")}
                >
                  ×
                </button>
              </div>
            )}
            <form className="rs-form" onSubmit={submit}>
              <textarea
                id="rs-question"
                aria-label="Câu hỏi nghiên cứu"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Đặt câu hỏi nghiên cứu của bạn…"
                required
                minLength={3}
                maxLength={1000}
              />
              <div className="rs-composer-tools">
                <span>
                  <Search size={15} /> Nghiên cứu tài liệu
                </span>
                <label className="rr-mock-toggle">
                  <input
                    type="checkbox"
                    checked={mockMode}
                    disabled={loading}
                    onChange={(e) => setMockMode(e.target.checked)}
                  />
                  Xem thử (mock)
                </label>
                <button
                  className="rs-send"
                  type="submit"
                  disabled={loading || question.trim().length < 3}
                  aria-label="Tra cứu"
                >
                  <ArrowUp size={20} />
                </button>
              </div>
            </form>
          </div>
        </section>
        {rightPanel && (
          <aside
            ref={sidePanel}
            tabIndex={-1}
            id="rs-side-panel"
            className="rs-reference"
            onKeyDown={(event) => {
              if (
                event.key === "Escape" &&
                window.matchMedia("(max-width: 760px)").matches
              ) {
                event.preventDefault();
                returnToChat();
              }
            }}
            aria-label={
              rightPanel === "filter" ? "Bộ lọc" : "Tài liệu tham khảo"
            }
          >
            {rightPanel === "filter" ? (
              <>
                <div className="rs-reference-header">
                  <button
                    className="rs-mobile-back"
                    type="button"
                    aria-label="Quay lại chat"
                    onClick={returnToChat}
                  >
                    <ArrowLeft size={21} />
                  </button>
                  <strong>Filter</strong>
                  <button
                    className="rs-panel-dismiss"
                    aria-label="Đóng bộ lọc"
                    onClick={returnToChat}
                  >
                    <X size={18} />
                  </button>
                </div>
                <p className="rs-filter-placeholder">
                  Các tùy chọn lọc sẽ được bổ sung ở bước tiếp theo.
                </p>
              </>
            ) : (
              <>
                {!selected && (
                  <div className="rs-reference-header">
                    <button
                      className="rs-mobile-back"
                      type="button"
                      aria-label="Quay lại chat"
                      onClick={returnToChat}
                    >
                      <ArrowLeft size={21} />
                    </button>
                    <strong>Tài liệu tham khảo</strong>
                    <span>/</span>
                    <span>{submitted || "Kết quả nghiên cứu"}</span>
                  </div>
                )}
                {selected ? (
                  <div className="rs-detail">
                    <PaperDetail
                      key={selected.paper_id}
                      paper={selected}
                      onClose={() => setSelected(null)}
                    />
                  </div>
                ) : (
                  <>
                    <div className="rs-results-head">
                      <strong>
                        Kết quả <span>{filtered.length}</span>
                      </strong>
                      <div>
                        <button
                          aria-label="Danh sách đầy đủ"
                          aria-pressed={!compact}
                          onClick={() => setCompact(false)}
                        >
                          <BookOpen size={17} />
                        </button>
                        <button
                          aria-label="Danh sách gọn"
                          aria-pressed={compact}
                          onClick={() => setCompact(true)}
                        >
                          <List size={18} />
                        </button>
                      </div>
                    </div>
                    <div
                      className={`rs-list${compact ? " rs-compact" : " rs-cards"}`}
                    >
                      {compact && visible.length > 0 ? (
                        <table
                          className="rs-paper-table"
                          aria-label="Danh sách paper dạng bảng"
                        >
                          <thead>
                            <tr>
                              <th>Nghiên cứu</th>
                              <th>Năm</th>
                              <th>Trích dẫn</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visible.map((p, i) => (
                              <tr key={p.paper_id}>
                                <td>
                                  <div className="rs-table-title">
                                    <span className="rs-paper-index">
                                      {i + 1}
                                    </span>
                                    <div>
                                      <button
                                        className="rs-paper-open"
                                        onClick={() => setSelected(p)}
                                      >
                                        {p.title}
                                      </button>
                                      <p>
                                        {p.journal || "Chưa có tạp chí"}
                                        {p.demo && (
                                          <span className="rs-table-demo">
                                            {" "}
                                            · Minh họa
                                          </span>
                                        )}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                                <td>{p.published_date?.slice(0, 4) || "—"}</td>
                                <td>{p.citations ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        visible.map((p, i) => (
                          <article className="rs-paper" key={p.paper_id}>
                            <div className="rs-paper-heading">
                              <span className="rs-paper-index">{i + 1}</span>
                              <button
                                className="rs-paper-open"
                                onClick={() => setSelected(p)}
                              >
                                {p.title}
                              </button>
                            </div>
                            {!compact && (
                              <p className="rs-takeaway">
                                <strong>KẾT LUẬN CHÍNH · </strong>
                                {p.key_takeaway ||
                                  "Chưa có tóm tắt ngắn từ nguồn."}
                              </p>
                            )}
                            <div className="rs-badges">
                              <button onClick={() => setSelected(p)}>
                                <Copy size={12} />
                                {p.evidence?.length || 0} trích đoạn
                              </button>
                              <span>{p.study_type || "Chưa xác định"}</span>
                              {p.demo && <span>Minh họa</span>}
                            </div>
                            <div className="rs-paper-meta">
                              <span>
                                {p.published_date || "Chưa rõ năm"} ·{" "}
                                {p.citations ?? "—"} trích dẫn ·{" "}
                                {p.authors?.join(", ") || "Chưa có tác giả"}
                              </span>
                            </div>
                            <div className="rs-paper-footer">
                              <span>
                                <BookOpen size={13} />
                                <i>{p.journal || "Chưa có tạp chí"}</i>
                              </span>
                              {/^https?:\/\//i.test(p.pdf_url) && (
                                <a
                                  href={p.pdf_url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  PDF <ExternalLink size={13} />
                                </a>
                              )}
                            </div>
                          </article>
                        ))
                      )}
                      {!visible.length && (
                        <p className="rs-empty">
                          {loading
                            ? "Đang tìm kiếm tài liệu…"
                            : "Chưa có kết quả."}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </aside>
        )}
      </main>
      <dialog ref={reportDialog} className="rs-report-dialog">
        <form onSubmit={saveReport}>
          <h2>Report</h2>
          <label htmlFor="rs-report-text">Mô tả vấn đề</label>
          <textarea
            id="rs-report-text"
            value={reportText}
            onChange={(e) => setReportText(e.target.value)}
            required
            minLength={3}
            maxLength={2000}
          />
          <p>Phản hồi được lưu trên máy này.</p>
          <div>
            <button type="button" onClick={() => reportDialog.current?.close()}>
              Hủy
            </button>
            <button type="submit" disabled={reportText.trim().length < 3}>
              Lưu phản hồi
            </button>
          </div>
        </form>
      </dialog>
      <div className="rs-print-only">
        <h1>Kết quả nghiên cứu</h1>
        {mockComplete && <MockResearchReport onSource={() => {}} />}
        <pre>{citedText}</pre>
      </div>
    </div>
  );
}
