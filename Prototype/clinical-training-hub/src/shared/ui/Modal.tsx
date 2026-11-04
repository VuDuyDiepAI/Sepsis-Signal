import { lockBodyScroll } from "@/shared/lib/scroll-lock";
import { X } from "lucide-react";
import { ReactNode, useEffect, useRef, useState } from "react";

const modalStack: symbol[] = [];

export function Modal({
  title,
  onClose,
  children,
  wide = false,
  dirty,
  guardChanges = true,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  dirty?: boolean;
  guardChanges?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const [changed, setChanged] = useState(false),
    [confirmClose, setConfirmClose] = useState(false);
  const isDirty = guardChanges && (dirty ?? changed);
  const requestClose = () => {
    if (isDirty) setConfirmClose(true);
    else onClose();
  };
  const close = useRef(requestClose);
  close.current = requestClose;
  useEffect(() => {
    if (!isDirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);
  useEffect(() => {
    const id = Symbol("modal");
    modalStack.push(id);
    const unlockScroll = lockBodyScroll();
    const previous = document.activeElement as HTMLElement | null;
    ref.current
      ?.querySelector<HTMLElement>("button, input, select, textarea, a[href]")
      ?.focus();
    const f = (e: KeyboardEvent) => {
      if (modalStack.at(-1) !== id) return;
      if (e.key === "Escape") close.current();
      if (e.key === "Tab") {
        const items = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]",
          ) || [],
        ).filter((x) => x.offsetParent !== null);
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", f);
    return () => {
      document.removeEventListener("keydown", f);
      modalStack.splice(modalStack.indexOf(id), 1);
      unlockScroll();
      previous?.focus();
    };
  }, []);
  return (
    <div className="overlay" onClick={requestClose}>
      <section
        ref={ref}
        className={"modal " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onChangeCapture={() => setChanged(true)}
        onClickCapture={(e) => {
          if ((e.target as HTMLElement).closest("button[data-dirty]"))
            setChanged(true);
          const target = (e.target as HTMLElement).closest(
            "button[data-modal-dismiss]",
          );
          if (target && isDirty) {
            e.preventDefault();
            e.stopPropagation();
            setConfirmClose(true);
          }
        }}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon" aria-label="Đóng" onClick={requestClose}>
            <X size={20} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {confirmClose && (
          <Modal
            title="Thay đổi chưa được lưu"
            guardChanges={false}
            onClose={() => setConfirmClose(false)}
          >
            <p>
              Bạn có thay đổi chưa lưu. Đóng màn hình sẽ bỏ các thay đổi này.
            </p>
            <div className="modal-actions">
              <button
                className="secondary"
                onClick={() => setConfirmClose(false)}
              >
                Tiếp tục chỉnh sửa
              </button>
              <button className="danger" onClick={onClose}>
                Bỏ thay đổi và đóng
              </button>
            </div>
          </Modal>
        )}
      </section>
    </div>
  );
}
