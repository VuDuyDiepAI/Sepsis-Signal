import { post } from "@/shared/api/client";
import { hasRole } from "@/shared/auth/permissions";
import { useHub } from "@/shared/context/HubContext";
import { useLoad } from "@/shared/hooks/useLoad";
import { localISO } from "@/shared/lib/dates";
import { Modal } from "@/shared/ui/Modal";
import { BookOpen, Users } from "lucide-react";
import { FormEvent, useState } from "react";

export function AssignmentDialog({
  course,
  onClose,
  onDone,
}: {
  course: any;
  onClose: () => void;
  onDone: () => void;
}) {
  const { act, busy, notify } = useHub();
  const [target, setTarget] = useState("group");
  const { data: org } = useLoad<any>("/organization");
  const { data: users } = useLoad<any[]>("/admin/users");
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    act(async () => {
      const b: any = { course_id: course.id, due_date: f.get("due_date") };
      if (target === "group") b.group_id = f.get("group_id");
      else if (target === "department")
        b.department_id = f.get("department_id");
      else b.user_ids = [f.get("user_id")];
      const r = await post("/training/assignments", b);
      notify(`Đã phân công khóa học cho ${r.length} nhân viên.`);
      onDone();
    });
  };
  return (
    <Modal title="Phân công đào tạo" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="notice">
          <BookOpen size={20} />
          <span>
            <b>{course.title}</b>
            <br />
            Giao đúng phiên bản đã xuất bản, giữ nguyên tiến độ nếu đã phân công
            trước đó.
          </span>
        </div>
        <label>
          Đối tượng phân công
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="group">Nhóm đào tạo</option>
            <option value="department">Khoa/phòng</option>
            <option value="individual">Một nhân viên</option>
          </select>
        </label>
        {target === "group" ? (
          <label>
            Nhóm nhân viên
            <select name="group_id">
              {org?.groups
                .filter((g: any) => g.can_manage)
                .map((g: any) => (
                  <option value={g.id} key={g.id}>
                    {g.name}
                  </option>
                ))}
            </select>
          </label>
        ) : target === "department" ? (
          <label>
            Khoa/phòng
            <select name="department_id">
              {org?.departments
                .filter((d: any) => d.can_manage)
                .map((d: any) => (
                  <option value={d.id} key={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </label>
        ) : (
          <label>
            Nhân viên
            <select name="user_id">
              {users
                ?.filter((u) => hasRole(u, "STAFF"))
                .map((u) => (
                  <option value={u.id} key={u.id}>
                    {u.name} · {u.staff_code}
                  </option>
                ))}
            </select>
          </label>
        )}
        <label>
          Hạn hoàn thành
          <input
            name="due_date"
            type="date"
            required
            min={localISO(new Date())}
            defaultValue={localISO(new Date(Date.now() + 7 * 86400000))}
          />
        </label>
        <div className="notice">
          Nhắc hạn được lưu và hiển thị trong ứng dụng. Chưa gửi email hoặc
          thông báo ra ngoài.
        </div>
        <div className="modal-actions">
          <button
            className="secondary"
            type="button"
            data-modal-dismiss
            onClick={onClose}
          >
            Hủy
          </button>
          <button className="primary" disabled={busy}>
            <Users size={17} />
            Xác nhận phân công
          </button>
        </div>
      </form>
    </Modal>
  );
}
