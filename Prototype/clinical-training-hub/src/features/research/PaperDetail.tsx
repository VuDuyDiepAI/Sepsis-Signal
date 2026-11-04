import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Bookmark,
} from "lucide-react";
import type { Paper } from "./types";
import "./detail.css";

type Props = { paper: Paper; onClose: () => void };

const safeHttpUrl = (value?: string) => {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : "";
  } catch {
    return "";
  }
};

const SAVED_KEY = "research-search-saved";
const readSavedIds = (): string[] => {
  if (typeof window === "undefined") return [];
  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(SAVED_KEY) || "[]",
    );
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
};

export default function PaperDetail({ paper, onClose }: Props) {
  const [tab, setTab] = useState(0);
  const [expanded, setExpanded] = useState<number[]>([]);
  const [savedState, setSavedState] = useState(() => ({
    paperId: paper.paper_id,
    saved: readSavedIds().includes(paper.paper_id),
  }));
  // Derive from the currently selected paper so a reused panel never shows the previous paper's saved state.
  const saved =
    savedState.paperId === paper.paper_id
      ? savedState.saved
      : readSavedIds().includes(paper.paper_id);
  const [copied, setCopied] = useState("");
  const pdf = safeHttpUrl(paper.pdf_url);
  const link = safeHttpUrl(paper.url);
  const doiUrl = paper.doi
    ? safeHttpUrl(
        `https://doi.org/${paper.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")}`,
      )
    : "";
  const tabs = [
    "Tổng quan",
    "Tóm tắt nhanh",
    "Tệp đính kèm",
    `Bằng chứng (${paper.evidence?.length || 0})`,
    "Thông tin tài liệu",
  ];
  const citation = `${paper.authors?.join(", ") || "Unknown author"}. ${paper.title}. ${paper.journal || ""}${paper.published_date ? `, ${paper.published_date}` : ""}.${paper.doi ? ` https://doi.org/${paper.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")}` : ""}`;

  async function copy(value: string, kind: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      /* Clipboard unavailable */
    }
  }
  function toggleSave() {
    try {
      const ids = readSavedIds();
      const next = saved
        ? ids.filter((id) => id !== paper.paper_id)
        : [...new Set([...ids, paper.paper_id])];
      window.localStorage.setItem(SAVED_KEY, JSON.stringify(next));
      setSavedState({ paperId: paper.paper_id, saved: !saved });
    } catch {
      setSavedState({ paperId: paper.paper_id, saved });
    }
  }
  function toggleEvidence(index: number) {
    setExpanded((current) =>
      current.includes(index)
        ? current.filter((i) => i !== index)
        : [...current, index],
    );
  }

  return (
    <section className="pd-panel" aria-label="Chi tiết tài liệu">
      <header className="pd-header">
        <div className="pd-topbar">
          <button
            className="pd-back"
            type="button"
            aria-label="Trở về danh sách paper"
            onClick={onClose}
          >
            <ArrowLeft size={18} />
            <strong>Paper</strong>
          </button>
        </div>
        <nav className="pd-tabs" aria-label="Các mục chi tiết" role="tablist">
          {tabs.map((label, index) => (
            <button
              key={label}
              type="button"
              role="tab"
              id={`pd-tab-${index}`}
              aria-selected={tab === index}
              aria-controls="pd-tab-content"
              className={`pd-tab${tab === index ? " is-active" : ""}`}
              onClick={() => setTab(index)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>
      <main className="pd-scroll">
        <div
          className="pd-content"
          id="pd-tab-content"
          role="tabpanel"
          aria-labelledby={`pd-tab-${tab}`}
        >
          {tab === 0 && (
            <>
              {paper.demo && <div className="pd-demo">Dữ liệu minh họa</div>}
              <h1 className="pd-title">{paper.title}</h1>
              <div className="pd-byline">
                {paper.published_date && <span>{paper.published_date}</span>}
                {paper.authors?.length > 0 && (
                  <>
                    <span className="pd-dot">·</span>
                    <span>{paper.authors.join(", ")}</span>
                  </>
                )}
              </div>
              <div className="pd-journal">
                <BookOpen size={17} />
                <span>{paper.journal || "Chưa có thông tin tạp chí"}</span>
                <span className="pd-citations">
                  {paper.citations ?? "—"} trích dẫn
                </span>
              </div>
              {paper.doi && (
                <div className="pd-doi">
                  DOI:{" "}
                  {doiUrl ? (
                    <a href={doiUrl} target="_blank" rel="noreferrer">
                      {paper.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")}
                      <ExternalLink size={13} />
                    </a>
                  ) : (
                    <span>{paper.doi}</span>
                  )}
                  {doiUrl && (
                    <button
                      type="button"
                      aria-label="Sao chép DOI"
                      onClick={() => copy(doiUrl, "doi")}
                    >
                      {copied === "doi" ? (
                        <Check size={14} />
                      ) : (
                        <Copy size={14} />
                      )}
                    </button>
                  )}
                </div>
              )}
              <div className="pd-actions">
                <button
                  type="button"
                  className={`pd-action${saved ? " is-saved" : ""}`}
                  onClick={toggleSave}
                >
                  <Bookmark size={16} fill={saved ? "currentColor" : "none"} />
                  {saved ? "Đã lưu" : "Lưu tài liệu"}
                </button>
                <button
                  type="button"
                  className="pd-action"
                  onClick={() => copy(citation, "citation")}
                >
                  {copied === "citation" ? (
                    <Check size={16} />
                  ) : (
                    <Copy size={16} />
                  )}
                  Sao chép trích dẫn
                </button>
                {link && (
                  <button
                    type="button"
                    className="pd-action"
                    onClick={() => copy(link, "link")}
                  >
                    {copied === "link" ? (
                      <Check size={16} />
                    ) : (
                      <ArrowUpRight size={16} />
                    )}
                    Sao chép liên kết
                  </button>
                )}
                {pdf && (
                  <a
                    className="pd-action pd-pdf"
                    href={pdf}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download size={16} />
                    Mở PDF
                  </a>
                )}
              </div>
            </>
          )}
          {tab === 0 && (
            <section className="pd-section">
              <h2>Tóm tắt</h2>
              <p className="pd-abstract">
                {paper.abstract || "Chưa có tóm tắt cho tài liệu này."}
              </p>
            </section>
          )}
          {tab === 1 && (
            <section className="pd-section">
              <h2>Tóm tắt nhanh</h2>
              <p className="pd-abstract">
                {paper.key_takeaway ||
                  "Chưa có tóm tắt nhanh cho tài liệu này."}
              </p>
              {paper.abstract && (
                <>
                  <h3>Tóm tắt đầy đủ</h3>
                  <p className="pd-abstract">{paper.abstract}</p>
                </>
              )}
            </section>
          )}
          {tab === 2 && (
            <section className="pd-section">
              <h2>Tệp đính kèm</h2>
              {pdf ? (
                <a
                  className="pd-file"
                  href={pdf}
                  target="_blank"
                  rel="noreferrer"
                >
                  <FileText size={22} />
                  <span>
                    <strong>Tệp PDF</strong>
                    <small>Mở tài liệu ở tab mới</small>
                  </span>
                  <ExternalLink size={16} />
                </a>
              ) : (
                <p className="pd-muted">Chưa có tệp đính kèm.</p>
              )}
            </section>
          )}
          {tab === 3 && (
            <section className="pd-section">
              <h2>Bằng chứng từ tài liệu</h2>
              {paper.evidence?.length ? (
                <div className="pd-evidence-list">
                  {paper.evidence.map((item, i) => (
                    <article className="pd-evidence" key={`${i}-${item.quote}`}>
                      <button
                        type="button"
                        className="pd-evidence-toggle"
                        aria-expanded={expanded.includes(i)}
                        onClick={() => toggleEvidence(i)}
                      >
                        <span>
                          <strong>
                            {item.section || `Trích dẫn ${i + 1}`}
                          </strong>
                          <small>
                            {item.start != null
                              ? `Vị trí ${item.start}${item.end != null ? `–${item.end}` : ""}`
                              : "Nhấn để xem trích dẫn"}
                          </small>
                        </span>
                        <span className="pd-chevron">
                          {expanded.includes(i) ? "−" : "+"}
                        </span>
                      </button>
                      {expanded.includes(i) && (
                        <div className="pd-quote">
                          <p>“{item.quote}”</p>
                          {safeHttpUrl(item.source_url) && (
                            <a
                              href={safeHttpUrl(item.source_url)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Nguồn <ExternalLink size={13} />
                            </a>
                          )}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="pd-muted">Chưa có bằng chứng trích xuất.</p>
              )}
            </section>
          )}
          {tab === 4 && (
            <section className="pd-section">
              <h2>Thông tin tài liệu</h2>
              <dl className="pd-metadata">
                <dt>Tác giả</dt>
                <dd>{paper.authors?.join(", ") || "Chưa có thông tin"}</dd>
                <dt>Tạp chí</dt>
                <dd>{paper.journal || "Chưa có thông tin"}</dd>
                <dt>Ngày xuất bản</dt>
                <dd>{paper.published_date || "Chưa có thông tin"}</dd>
                <dt>Loại nghiên cứu</dt>
                <dd>{paper.study_type || "Chưa có thông tin"}</dd>
                <dt>Số trích dẫn</dt>
                <dd>{paper.citations ?? "Chưa có thông tin"}</dd>
                <dt>DOI</dt>
                <dd>{paper.doi || "Chưa có thông tin"}</dd>
                <dt>Nguồn</dt>
                <dd>{paper.source || "Chưa có thông tin"}</dd>
                {link && (
                  <>
                    <dt>Liên kết</dt>
                    <dd>
                      <a href={link} target="_blank" rel="noreferrer">
                        Mở trang tài liệu <ExternalLink size={13} />
                      </a>
                    </dd>
                  </>
                )}
              </dl>
            </section>
          )}
        </div>
      </main>
    </section>
  );
}
