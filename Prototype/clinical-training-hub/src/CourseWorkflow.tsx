import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ConfirmationDialog } from "./enterprise";
import { Modal, useHub } from "./ui";

export function CourseStepper({
  step,
  onChange,
  locked = false,
}: {
  step: number;
  onChange: (step: number) => void;
  locked?: boolean;
}) {
  return (
    <nav className="builder-stepper" aria-label="Các bước xây dựng khóa học">
      {[
        "Thông tin chung",
        "Nội dung bài học",
        "Bài kiểm tra",
        "Xem trước & xuất bản",
      ].map((label, i) => (
        <button
          key={label}
          className={step === i ? "active" : ""}
          aria-current={step === i ? "step" : undefined}
          disabled={locked && i !== step}
          onClick={() => onChange(i)}
        >
          <span>{i + 1}</span>
          {label}
        </button>
      ))}
    </nav>
  );
}
export function CourseInfoForm({
  value,
  onChange,
  disabled = false,
  specialty,
  objectives = true,
}: {
  value: any;
  onChange: (key: string, value: any) => void;
  disabled?: boolean;
  specialty: ReactNode;
  objectives?: boolean;
}) {
  return (
    <fieldset
      disabled={disabled}
      className="course-info-fields course-info-rows"
    >
      <label>
        <span>
          Tên khóa học <em>*</em>
        </span>
        <input
          aria-label="Tên khóa học"
          value={value.title}
          onChange={(e) => onChange("title", e.target.value)}
          required
          minLength={3}
          maxLength={240}
          placeholder="Nhập tên khóa học"
        />
      </label>
      <label>
        <span>
          Chuyên khoa <em>*</em>
        </span>
        {specialty}
      </label>
      <label>
        <span>Hình thức đào tạo</span>
        <input value="Trực tuyến" readOnly aria-label="Hình thức đào tạo" />
      </label>
      <label>
        <span>
          Đối tượng học <em>*</em>
        </span>
        <input
          aria-label="Đối tượng học"
          value={value.audience}
          onChange={(e) => onChange("audience", e.target.value)}
          required
          maxLength={240}
          placeholder="Bác sĩ, Điều dưỡng…"
        />
      </label>
      <label>
        <span>
          Thời lượng (phút) <em>*</em>
        </span>
        <input
          className="duration-field"
          aria-label="Thời lượng (phút)"
          type="number"
          min={1}
          max={600}
          step={1}
          value={value.duration}
          onChange={(e) => onChange("duration", Number(e.target.value))}
          required
        />
      </label>
      <label>
        <span>Mô tả khóa học</span>
        <textarea
          aria-label="Mô tả khóa học"
          rows={2}
          value={value.description}
          maxLength={4000}
          onChange={(e) => onChange("description", e.target.value)}
          placeholder="Nội dung và mục đích khóa học"
        />
      </label>
      {objectives && (
        <label>
          <span>
            Mục tiêu học tập<small>Mỗi dòng một mục tiêu</small>
          </span>
          <textarea
            aria-label="Mục tiêu học tập"
            rows={3}
            value={(value.objectives || []).join("\n")}
            onChange={(e) => onChange("objectives", e.target.value.split("\n"))}
          />
        </label>
      )}
    </fieldset>
  );
}
export function CourseEditorFrame({
  page = false,
  title,
  children,
  onClose,
  dirty = false,
}: {
  page?: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  dirty?: boolean;
}) {
  if (!page)
    return (
      <Modal title={title} onClose={onClose} dirty={dirty} wide>
        {children}
      </Modal>
    );
  return (
    <PageFrame title={title} onClose={onClose} dirty={dirty}>
      {children}
    </PageFrame>
  );
}
function PageFrame({
  title,
  children,
  onClose,
  dirty,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  dirty: boolean;
}) {
  const { go } = useHub(),
    [pending, setPending] = useState<(() => void) | null>(null),
    allow = useRef(false),
    dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    const leave = (event: Event) => {
      if (!dirtyRef.current || allow.current) return;
      event.preventDefault();
      const e = event as CustomEvent<{ path?: string; run?: () => void }>;
      setPending(() => e.detail.run || (() => go(e.detail.path!)));
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("hub-before-navigate", leave);
    window.addEventListener("hub-before-logout", leave);
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("hub-before-navigate", leave);
      window.removeEventListener("hub-before-logout", leave);
      window.removeEventListener("beforeunload", unload);
    };
  }, [go]);
  return (
    <div className="course-workflow-page">
      <div className="course-page-back">
        <button className="text-button" onClick={onClose}>
          <ArrowLeft size={16} />
          Danh sách học liệu
        </button>
      </div>
      <h2 className="context-heading">{title}</h2>
      <div className="course-page-surface">{children}</div>
      {pending && (
        <ConfirmationDialog
          title="Thay đổi chưa được lưu"
          confirm="Bỏ thay đổi và rời trang"
          danger
          onClose={() => setPending(null)}
          onConfirm={() => {
            allow.current = true;
            const run = pending;
            setPending(null);
            run();
          }}
        >
          <p>
            Nội dung đang nhập chưa được lưu. Bạn muốn bỏ thay đổi và rời trang?
          </p>
        </ConfirmationDialog>
      )}
    </div>
  );
}
