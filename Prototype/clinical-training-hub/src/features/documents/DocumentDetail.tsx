import { post } from "@/shared/api/client";
import { hasAnyRole } from "@/shared/auth/permissions";
import { useHub } from "@/shared/context/HubContext";
import { useLoad } from "@/shared/hooks/useLoad";
import { dateStr } from "@/shared/lib/dates";
import { statusNames } from "@/shared/lib/labels";
import { Badge } from "@/shared/ui/Badge";
import { Empty } from "@/shared/ui/Empty";
import {
  ConfirmationDialog,
  EnterprisePanel,
  SectionHeader,
} from "@/shared/ui/enterprise";
import { LoadState } from "@/shared/ui/LoadState";
import { Modal } from "@/shared/ui/Modal";
import {
  ArrowUpRight,
  CheckCircle2,
  FileText,
  Plus,
  Send,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

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
