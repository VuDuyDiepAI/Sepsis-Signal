import { api } from "@/shared/api/client";
import { useHub } from "@/shared/context/HubContext";
import { useLoad } from "@/shared/hooks/useLoad";
import { Modal } from "@/shared/ui/Modal";
import { FileText, Plus } from "lucide-react";
import { FormEvent, useState } from "react";

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
