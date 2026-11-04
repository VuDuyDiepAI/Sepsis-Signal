import {
  ArrowUpRight,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  MessagesSquare,
  Plus,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { api, post } from "./api";
import {
  ConfirmationDialog,
  EnterpriseDataTable,
  EnterprisePanel,
  FormField,
  SearchFilterPanel,
  SectionHeader,
} from "./enterprise";
import {
  Badge,
  Empty,
  LoadState,
  Modal,
  dateStr,
  hasAnyRole,
  statusNames,
  useHub,
  useLoad,
} from "./ui";

export { Documents } from "./DocumentLibrary";

export function UploadDialog({
  existing,
  onClose,
  onDone,
}: {
  existing: any;
  onClose: () => void;
  onDone: () => void;
}) {
  const { act, busy, notify } = useHub();
  const { data: org } = useLoad<any>("/organization");
  const [err, setErr] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (existing) f.set("document_id", existing.id);
    await act(async () => {
      try {
        setErr("");
        const r = await api("/documents/upload", { method: "POST", body: f });
        let job = await api("/ai/jobs/" + r.job_id);
        for (
          let n = 0;
          n < 60 && ["QUEUED", "RUNNING"].includes(job.status);
          n++
        ) {
          await new Promise((r) => setTimeout(r, 600));
          job = await api("/ai/jobs/" + r.job_id);
        }
        if (job.status === "FAILED") {
          setErr(job.error);
          return;
        }
        notify(
          "Đã lưu tài liệu. Hãy kiểm tra nội dung rồi gửi chuyên gia phê duyệt.",
        );
        onDone();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }
  return (
    <Modal
      title={existing ? "Tải phiên bản tài liệu mới" : "Tải tài liệu lên"}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="notice">
          <FileText size={20} />
          <span>
            PDF có văn bản, DOCX, TXT, Markdown · Tối đa 15 MB. Chỉ dùng tài
            liệu giả lập hoặc đã được cho phép.
          </span>
        </div>
        <label>
          Tên tài liệu
          <input
            name="title"
            defaultValue={existing?.title}
            required
            minLength={3}
            maxLength={240}
          />
        </label>
        <label>
          Mô tả
          <textarea name="description" rows={2} />
        </label>
        <div className="form-grid">
          <label>
            Khoa/phòng
            <select name="department_id">
              {org?.departments
                .filter((d: any) => d.can_manage)
                .map((d: any) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Phạm vi truy cập
            <select name="scope">
              <option value="DEPARTMENT">Trong khoa/phòng</option>
              <option value="ALL">Toàn bộ nhân viên</option>
              <option value="RESTRICTED">Người tạo và kiểm duyệt</option>
            </select>
          </label>
          <label>
            Ngày hiệu lực
            <input type="date" name="effective_date" />
          </label>
          <label>
            Ngày cần rà soát
            <input type="date" name="review_date" />
          </label>
        </div>
        <label className="upload-zone">
          <span className="icon-box">
            <Plus />
          </span>
          <b>Chọn tài liệu từ thiết bị</b>
          <small>File gốc được lưu riêng, không ghi đè phiên bản cũ.</small>
          <input
            type="file"
            name="file"
            required
            accept=".pdf,.docx,.txt,.md"
          />
        </label>
        {err && (
          <div className="error" role="alert">
            {err}
          </div>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="secondary"
            data-modal-dismiss
            onClick={onClose}
          >
            Hủy
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Đang xử lý…" : "Tải lên và xử lý"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function DocumentDetail({
  id,
  onClose,
  onVersion,
  onUpdate,
}: {
  id: string;
  onClose: () => void;
  onVersion: () => void;
  onUpdate: () => void;
}) {
  const { user, act, busy, source, notify } = useHub();
  const [rev, setRev] = useState(0),
    [comment, setComment] = useState(""),
    [summary, setSummary] = useState<any>(null),
    [confirmAction, setConfirmAction] = useState(""),
    [compare, setCompare] = useState(false),
    [confirmArchive, setConfirmArchive] = useState(false);
  const { data, loading, error } = useLoad<any>("/documents/" + id, [rev]);
  const v = data?.versions[0];
  const change = async (action: string) =>
    act(async () => {
      await post(`/documents/${id}/${action}`, { version_id: v.id, comment });
      setComment("");
      setRev((x) => x + 1);
      onUpdate();
      notify("Đã cập nhật trạng thái tài liệu.");
    });
  return (
    <Modal
      title={data?.title || "Chi tiết tài liệu"}
      onClose={onClose}
      dirty={Boolean(comment.trim())}
      wide
    >
      <LoadState loading={loading} error={error} />
      {v && (
        <>
          <div className="detail-top">
            <Badge status={v.status} />
            <span>
              Phiên bản {v.number} · {v.filename}
            </span>
          </div>
          <p>{data.description || "Tài liệu đào tạo nội bộ"}</p>
          <EnterprisePanel title="Thông tin tài liệu">
            <div className="metadata-grid">
              <dl>
                <dt>Mã tài liệu</dt>
                <dd>
                  <code>{id}</code>
                </dd>
              </dl>
              <dl>
                <dt>Ngày hiệu lực</dt>
                <dd>{dateStr(v.effective_date)}</dd>
              </dl>
              <dl>
                <dt>Ngày rà soát</dt>
                <dd>{dateStr(v.review_date)}</dd>
              </dl>
              <dl>
                <dt>Cập nhật phiên bản</dt>
                <dd>{dateStr(v.created_at)}</dd>
              </dl>
              <dl>
                <dt>Người phê duyệt</dt>
                <dd>API hiện chưa cung cấp thông tin này</dd>
              </dl>
              <dl>
                <dt>Xử lý nội dung</dt>
                <dd>{statusNames[v.processing] || v.processing}</dd>
              </dl>
            </div>
          </EnterprisePanel>
          {v.error && <div className="error">{v.error}</div>}
          <div className="actions">
            <button className="secondary" onClick={() => source(v.id)}>
              <FileText size={16} />
              Đọc và kiểm tra nguồn
            </button>
            {v.status === "APPROVED" &&
              hasAnyRole(user, ["ADMIN", "STAFF"]) && (
                <>
                  <button
                    className="secondary"
                    onClick={() =>
                      act(async () =>
                        setSummary(await post(`/documents/${id}/summarize`)),
                      )
                    }
                  >
                    <Sparkles size={16} />
                    Tóm tắt tài liệu
                  </button>
                  <button
                    className="secondary"
                    onClick={() =>
                      act(async () =>
                        setSummary(await post(`/documents/${id}/translate`)),
                      )
                    }
                  >
                    Dịch Anh–Việt
                  </button>
                </>
              )}
            {data.can_manage && (
              <button className="secondary" onClick={onVersion}>
                <Plus size={16} />
                Phiên bản mới
              </button>
            )}
            {data.can_manage && v.status === "APPROVED" && (
              <button
                className="danger"
                onClick={() => setConfirmArchive(true)}
              >
                Lưu trữ phiên bản
              </button>
            )}
          </div>
          {confirmArchive && (
            <Modal
              title="Xác nhận lưu trữ tài liệu"
              onClose={() => setConfirmArchive(false)}
            >
              <p>
                Phiên bản này sẽ ngừng được dùng để tra cứu. Những khóa học liên
                quan được đánh dấu cần rà soát.
              </p>
              <div className="modal-actions">
                <button
                  className="secondary"
                  onClick={() => setConfirmArchive(false)}
                >
                  Hủy lưu trữ
                </button>
                <button
                  className="danger"
                  disabled={busy}
                  onClick={async () => {
                    await change("archive");
                    setConfirmArchive(false);
                  }}
                >
                  Xác nhận lưu trữ
                </button>
              </div>
            </Modal>
          )}
          {summary && (
            <div className="notice summary">
              {summary.status
                ? "Bản dịch AI chưa kiểm duyệt"
                : "Tóm tắt trích xuất · Demo"}
              <pre>{summary.summary || summary.translation}</pre>
            </div>
          )}
          <EnterprisePanel title="Xem trước tài liệu">
            <DocumentPreview id={v.id} />
          </EnterprisePanel>
          <RelatedDocuments id={id} />
          <SectionHeader title="Lịch sử phiên bản">
            {data.versions.length > 1 && (
              <button className="secondary" onClick={() => setCompare(true)}>
                Đối chiếu hai phiên bản
              </button>
            )}
          </SectionHeader>
          {compare && (
            <Modal
              title="Đối chiếu nội dung phiên bản"
              onClose={() => setCompare(false)}
              wide
            >
              <div className="compare-grid">
                <div>
                  <h3>Phiên bản {data.versions[1].number}</h3>
                  <DocumentPreview id={data.versions[1].id} />
                </div>
                <div>
                  <h3>Phiên bản {v.number} (mới nhất)</h3>
                  <DocumentPreview id={v.id} />
                </div>
              </div>
              <p className="fine">
                Đối chiếu nguyên văn nội dung được trích xuất. Hệ thống chưa
                cung cấp phân tích chênh lệch tự động.
              </p>
            </Modal>
          )}
          {data.versions.map((x: any) => (
            <div key={x.id} className="list-row">
              <span className="version-tag">v{x.number}.0</span>
              <div className="grow">
                <b>{x.filename}</b>
                <small>
                  {dateStr(x.created_at)} ·{" "}
                  {x.processing === "COMPLETED"
                    ? "Đã trích xuất nội dung"
                    : statusNames[x.processing]}
                </small>
              </div>
              <Badge status={x.status} />
              <button
                className="icon"
                title="Xem phiên bản"
                onClick={() => source(x.id)}
              >
                <ArrowUpRight size={18} />
              </button>
            </div>
          ))}
          {data.can_manage && ["DRAFT", "REJECTED"].includes(v.status) && (
            <div className="modal-actions">
              <button
                className="primary"
                disabled={busy || v.processing !== "COMPLETED"}
                onClick={() => change("submit-review")}
              >
                <Send size={16} />
                Gửi phê duyệt tài liệu
              </button>
            </div>
          )}
          {data.can_review &&
            v.status === "PENDING_REVIEW" &&
            !data.can_approve && (
              <div className="notice">
                Bạn đã tạo hoặc gửi duyệt tài liệu này. Cần một chuyên gia khác
                được phân công kiểm duyệt để phê duyệt.
              </div>
            )}
          {data.can_review && v.status === "PENDING_REVIEW" && (
            <>
              <label>
                Nhận xét chuyên môn
                <textarea
                  aria-label="Nhận xét chuyên môn"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </label>
              <div className="modal-actions">
                <button
                  className="danger"
                  disabled={busy || !comment.trim() || !data.can_approve}
                  onClick={() => setConfirmAction("reject")}
                >
                  Từ chối, yêu cầu sửa
                </button>
                <button
                  className="primary"
                  disabled={busy || !data.can_approve}
                  onClick={() => setConfirmAction("approve")}
                >
                  <CheckCircle2 size={17} />
                  Phê duyệt tài liệu
                </button>
              </div>
            </>
          )}
        </>
      )}
      {confirmAction && (
        <ConfirmationDialog
          title={
            confirmAction === "approve"
              ? "Xác nhận phê duyệt tài liệu"
              : "Xác nhận yêu cầu chỉnh sửa"
          }
          confirm={
            confirmAction === "approve" ? "Phê duyệt" : "Gửi yêu cầu chỉnh sửa"
          }
          danger={confirmAction === "reject"}
          busy={busy}
          onClose={() => setConfirmAction("")}
          onConfirm={async () => {
            await change(confirmAction);
            setConfirmAction("");
          }}
        >
          <p>
            {confirmAction === "approve"
              ? "Bạn xác nhận đã kiểm tra nội dung và nguồn của phiên bản này?"
              : "Nhận xét của bạn sẽ được lưu cùng quyết định trả lại phiên bản này."}
          </p>
          {comment && <blockquote>{comment}</blockquote>}
        </ConfirmationDialog>
      )}
    </Modal>
  );
}

function DocumentPreview({ id }: { id: string }) {
  const { data, loading, error } = useLoad<any>("/sources/" + id);
  const [file, setFile] = useState(false);
  return (
    <>
      <LoadState loading={loading} error={error} />
      {data && (
        <>
          <div className="preview-controls">
            <small>Nội dung gốc · Phiên bản {data.version.number}</small>
            {data.version.filename.toLowerCase().endsWith(".pdf") && (
              <button className="secondary" onClick={() => setFile(!file)}>
                {file ? "Xem nội dung trích xuất" : "Xem PDF"}
              </button>
            )}
          </div>
          {file ? (
            <>
              <iframe
                className="document-preview"
                title={"Xem trước " + data.title}
                src={"/api/sources/" + id + "/file"}
              />
              <a
                className="text-button"
                href={"/api/sources/" + id + "/file"}
                target="_blank"
                rel="noreferrer"
              >
                Mở file gốc trong tab mới
              </a>
            </>
          ) : (
            <div className="preview-excerpts">
              {data.chunks.map((c: any) => (
                <article className="source-chunk" key={c.id}>
                  <small>{c.page ? "Trang " + c.page : c.section}</small>
                  <p>{c.text}</p>
                </article>
              ))}
              {!data.chunks.length && (
                <Empty text="Chưa có nội dung trích xuất" />
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

function RelatedDocuments({ id }: { id: string }) {
  const { data } = useLoad<any[]>("/documents");
  const { source } = useHub();
  const current = data?.find((d) => d.id === id);
  const related =
    data
      ?.filter(
        (d) =>
          d.id !== id &&
          current?.specialty &&
          d.specialty === current.specialty,
      )
      .slice(0, 3) || [];
  return related.length ? (
    <EnterprisePanel title="Tài liệu cùng chuyên khoa">
      {related.map((d) => (
        <button
          key={d.id}
          className="task-row"
          onClick={() => source(d.version.id)}
        >
          <FileText size={18} />
          <span className="grow">
            <b>{d.title}</b>
            <small>
              {d.specialty} · Phiên bản {d.version.number}
            </small>
          </span>
          <Badge status={d.version.status} />
        </button>
      ))}
    </EnterprisePanel>
  ) : null;
}

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

export function DocumentReviews() {
  const [rev, setRev] = useState(0),
    [selected, setSelected] = useState(
      new URLSearchParams(location.hash.split("?")[1] || "").get("document") ||
        "",
    ),
    [upload, setUpload] = useState<any>(null),
    [query, setQuery] = useState({ keyword: "", status: "PENDING_REVIEW" }),
    [filters, setFilters] = useState(query);
  const { data, loading, error } = useLoad<any[]>(
    "/documents?status=" + filters.status,
    [rev],
  );
  return (
    <>
      <SearchFilterPanel
        onSearch={() => setFilters({ ...query })}
        onReset={() => {
          const reset = { keyword: "", status: "PENDING_REVIEW" };
          setQuery(reset);
          setFilters(reset);
        }}
      >
        <FormField label="Tìm tài liệu kiểm duyệt">
          <input
            placeholder="Nhập tên tài liệu…"
            value={query.keyword}
            onChange={(e) => setQuery({ ...query, keyword: e.target.value })}
          />
        </FormField>
        <FormField label="Trạng thái tài liệu">
          <select
            value={query.status}
            onChange={(e) => setQuery({ ...query, status: e.target.value })}
          >
            <option value="">Tất cả trạng thái</option>
            {["PENDING_REVIEW", "APPROVED", "REJECTED", "DRAFT"].map((s) => (
              <option key={s} value={s}>
                {statusNames[s]}
              </option>
            ))}
          </select>
        </FormField>
      </SearchFilterPanel>
      <EnterprisePanel
        title="Tài liệu trong phạm vi kiểm duyệt"
        className="data-panel"
      >
        <EnterpriseDataTable
          rows={(data || []).filter(
            (d) =>
              d.can_review &&
              d.title
                .toLocaleLowerCase("vi")
                .includes(filters.keyword.toLocaleLowerCase("vi")),
          )}
          rowKey={(d) => d.id}
          loading={loading}
          error={error}
          label="Tài liệu kiểm duyệt"
          columns={[
            {
              key: "title",
              title: "Tên tài liệu",
              value: (d) => d.title,
              render: (d) => (
                <span>
                  <b>{d.title}</b>
                  <small>{d.specialty}</small>
                </span>
              ),
            },
            {
              key: "version",
              title: "Phiên bản",
              value: (d) => d.version.number,
              render: (d) => "v" + d.version.number + ".0",
            },
            {
              key: "date",
              title: "Cập nhật",
              value: (d) => d.version.created_at,
              render: (d) => dateStr(d.version.created_at),
            },
            {
              key: "status",
              title: "Trạng thái",
              value: (d) => d.version.status,
              render: (d) => <Badge status={d.version.status} />,
            },
            {
              key: "action",
              title: "Thao tác",
              render: (d) => (
                <button className="secondary" onClick={() => setSelected(d.id)}>
                  Kiểm tra tài liệu
                  <ArrowUpRight size={16} />
                </button>
              ),
            },
          ]}
        />
      </EnterprisePanel>
      {selected && (
        <DocumentDetail
          id={selected}
          onClose={() => setSelected("")}
          onVersion={() => {
            setUpload(data?.find((d) => d.id === selected) || { id: selected });
            setSelected("");
          }}
          onUpdate={() => setRev((x) => x + 1)}
        />
      )}
      {upload && (
        <UploadDialog
          existing={upload}
          onClose={() => setUpload(null)}
          onDone={() => {
            setUpload(null);
            setRev((r) => r + 1);
          }}
        />
      )}
    </>
  );
}
