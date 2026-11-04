import { post } from "@/shared/api/client";
import { hasAnyRole } from "@/shared/auth/permissions";
import { useHub } from "@/shared/context/HubContext";
import { useLoad } from "@/shared/hooks/useLoad";
import { dateStr, localISO } from "@/shared/lib/dates";
import { Badge } from "@/shared/ui/Badge";
import { Empty } from "@/shared/ui/Empty";
import { EnterprisePanel } from "@/shared/ui/enterprise";
import { LoadState } from "@/shared/ui/LoadState";
import { Modal } from "@/shared/ui/Modal";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { CSSProperties, FormEvent, useState } from "react";

export function TrainingCalendar() {
  const { user, act, busy, notify } = useHub();
  const [date, setDate] = useState(() => {
      const requested = new URLSearchParams(
        location.hash.split("?")[1] || "",
      ).get("date");
      const parsed =
        requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)
          ? new Date(requested + "T12:00:00")
          : new Date();
      return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    }),
    [mode, setMode] = useState("month"),
    [adding, setAdding] = useState(false),
    [selected, setSelected] = useState<any>(null),
    [selectedDay, setSelectedDay] = useState<Date | null>(null),
    [rev, setRev] = useState(0);
  const { data, loading, error } = useLoad<any[]>("/training/calendar", [rev]);
  const {
    data: reminders,
    loading: remindersLoading,
    error: remindersError,
  } = useLoad<any[]>("/reminders", [rev]);
  const { data: org } = useLoad<any>("/organization");
  const reminderEvents = (reminders || []).map((reminder) => ({
    ...reminder,
    type: "reminder",
    title: `Nhắc hạn: ${reminder.title}`,
    location: "Mốc bắt đầu nhắc hạn trong ứng dụng",
  }));
  const eventsByDay = new Map<string, any[]>();
  for (const event of [...(data || []), ...reminderEvents]) {
    const key = localISO(
      new Date(
        event.date.length === 10 ? event.date + "T12:00:00" : event.date,
      ),
    );
    eventsByDay.set(key, [...(eventsByDay.get(key) || []), event]);
  }
  const first =
    mode === "month"
      ? new Date(date.getFullYear(), date.getMonth(), 1)
      : new Date(date);
  first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const dayCount =
    mode === "week"
      ? 7
      : Math.ceil(
          (((new Date(date.getFullYear(), date.getMonth(), 1).getDay() + 6) %
            7) +
            new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()) /
            7,
        ) * 7;
  const days = Array.from({ length: dayCount }, (_, i) => {
    const d = new Date(first);
    d.setDate(first.getDate() + i);
    return d;
  });
  const jump = (d: number) => {
    const x = new Date(date);
    if (mode === "month") x.setMonth(x.getMonth() + d, 1);
    else if (mode === "year") x.setFullYear(x.getFullYear() + d, 0, 1);
    else x.setDate(x.getDate() + d * 7);
    setDate(x);
  };
  const periodLabel =
    mode === "year"
      ? `Năm ${date.getFullYear()}`
      : mode === "week"
        ? `${dateStr(localISO(days[0]))} – ${dateStr(localISO(days[6]))}`
        : `Tháng ${date.getMonth() + 1}, ${date.getFullYear()}`;
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    act(async () => {
      await post("/training/events", {
        ...Object.fromEntries(f),
        starts_at: new Date(String(f.get("starts_at"))).toISOString(),
        group_id: f.get("group_id") || null,
      });
      setRev((x) => x + 1);
      setAdding(false);
      notify("Đã tạo buổi đào tạo.");
    });
  };
  return (
    <>
      <EnterprisePanel
        title="Lịch đào tạo & hạn hoàn thành"
        className="training-calendar"
        heading={false}
      >
        <div className="calendar-toolbar">
          <div className="calendar-period">
            <button
              className="icon"
              aria-label="Kỳ trước"
              onClick={() => jump(-1)}
            >
              <ChevronLeft size={18} />
            </button>
            <h2 aria-live="polite">{periodLabel}</h2>
            <button
              className="icon"
              aria-label="Kỳ sau"
              onClick={() => jump(1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="calendar-controls">
            {hasAnyRole(user, ["ADMIN"]) && (
              <button className="primary" onClick={() => setAdding(true)}>
                <Plus size={15} />
                Tạo buổi đào tạo
              </button>
            )}
            <button className="secondary" onClick={() => setDate(new Date())}>
              Hôm nay
            </button>
            <select
              aria-label="Chế độ lịch"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="month">Theo tháng</option>
              <option value="week">Theo tuần</option>
              <option value="year">Theo năm</option>
            </select>
          </div>
        </div>
        <LoadState loading={false} error={error || remindersError} />
        {(loading || remindersLoading) && (
          <span className="calendar-loading" role="status">
            Đang tải lịch…
          </span>
        )}
        {mode === "year" ? (
          <div
            className="calendar-year"
            aria-label={`Lịch năm ${date.getFullYear()}`}
          >
            {Array.from({ length: 12 }, (_, month) => {
              const start =
                (new Date(date.getFullYear(), month, 1).getDay() + 6) % 7;
              const count = new Date(
                date.getFullYear(),
                month + 1,
                0,
              ).getDate();
              return (
                <section className="calendar-mini-month" key={month}>
                  <button
                    className="calendar-month-link"
                    onClick={() => {
                      setDate(new Date(date.getFullYear(), month, 1));
                      setMode("month");
                    }}
                    aria-label={`Xem tháng ${month + 1}, ${date.getFullYear()}`}
                  >
                    Tháng {month + 1}
                  </button>
                  <div className="calendar-mini-grid">
                    {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((day) => (
                      <span className="mini-weekday" key={day}>
                        {day}
                      </span>
                    ))}
                    {Array.from({ length: start }, (_, i) => (
                      <span key={`blank-${i}`} />
                    ))}
                    {Array.from({ length: count }, (_, i) => {
                      const day = new Date(date.getFullYear(), month, i + 1),
                        events = eventsByDay.get(localISO(day)) || [];
                      return (
                        <button
                          key={i}
                          className={
                            (localISO(day) === localISO(new Date())
                              ? "today "
                              : "") + (events.length ? "has-events" : "")
                          }
                          aria-label={`${dateStr(localISO(day))}${events.length ? `, ${events.length} lịch` : ""}`}
                          title={events.map((e) => e.title).join("\n")}
                          onClick={() => setSelectedDay(day)}
                        >
                          {i + 1}
                          {events.length > 0 && <i />}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="calendar-grid-wrap">
            <div
              className={`calendar-grid calendar-${mode}`}
              style={{ "--calendar-weeks": dayCount / 7 } as CSSProperties}
              aria-label={periodLabel}
            >
              {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((d) => (
                <div className="calendar-header" key={d}>
                  {d}
                </div>
              ))}
              {days.map((d) => {
                const events = eventsByDay.get(localISO(d)) || [];
                return (
                  <div
                    className={
                      "calendar-day " +
                      (localISO(d) === localISO(new Date()) ? "today " : "") +
                      (mode === "month" && d.getMonth() !== date.getMonth()
                        ? "outside"
                        : "")
                    }
                    key={localISO(d)}
                  >
                    <button
                      className="calendar-date"
                      aria-label={`Xem ngày ${dateStr(localISO(d))}`}
                      onClick={() => setSelectedDay(d)}
                    >
                      {d.getDate()}
                    </button>
                    <div className="calendar-day-events">
                      {events.map((e) => (
                        <button
                          key={e.type + e.id}
                          className={"calendar-event " + e.type}
                          title={e.title}
                          onClick={() => setSelected(e)}
                        >
                          {e.title}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="calendar-legend">
          <span>
            <i className="event" />
            Buổi đào tạo
          </span>
          <span>
            <i className="assignment" />
            Hạn khóa học
          </span>
          <span>
            <i className="credential" />
            Hết hạn chứng chỉ
          </span>
          <span>
            <i className="reminder" />
            Nhắc hạn
          </span>
        </div>
      </EnterprisePanel>
      {selectedDay && (
        <Modal
          title={`Lịch ngày ${dateStr(localISO(selectedDay))}`}
          onClose={() => setSelectedDay(null)}
        >
          <LoadState
            loading={loading || remindersLoading}
            error={error || remindersError}
          />
          {(eventsByDay.get(localISO(selectedDay)) || []).map((event) => (
            <button
              className={`calendar-event ${event.type} calendar-detail-event`}
              key={event.type + event.id}
              onClick={() => {
                setSelectedDay(null);
                setSelected(event);
              }}
            >
              {event.title}
            </button>
          ))}
          {!loading &&
            !error &&
            !remindersLoading &&
            !remindersError &&
            !eventsByDay.get(localISO(selectedDay))?.length && (
              <Empty text="Không có lịch trong ngày này" />
            )}
        </Modal>
      )}
      {selected && (
        <Modal title="Thông tin lịch đào tạo" onClose={() => setSelected(null)}>
          <h2>{selected.title}</h2>
          <p>
            {selected.date.length === 10
              ? dateStr(selected.date)
              : new Date(selected.date).toLocaleString("vi-VN")}
          </p>
          <p>{selected.location || "Hạn được ghi nhận trong hệ thống"}</p>
          {selected.status && <Badge status={selected.status} />}
          {selected.type === "reminder" && (
            <button
              className="secondary"
              onClick={() => {
                setDate(new Date(selected.date + "T12:00:00"));
                setMode("month");
                setSelected(null);
              }}
            >
              Xem mốc nhắc trên lịch
            </button>
          )}
          {selected.type === "event" && (
            <div className="notice">
              Lịch hiển thị theo phạm vi khoa/phòng và nhóm được cấp quyền. Đăng
              ký tham gia và điểm danh trực tuyến hiện chưa khả dụng.
            </div>
          )}
        </Modal>
      )}
      {adding && (
        <Modal title="Tạo buổi đào tạo" onClose={() => setAdding(false)}>
          <form onSubmit={submit}>
            <label>
              Tên buổi học
              <input name="title" required minLength={3} />
            </label>
            <label>
              Thời gian
              <input type="datetime-local" name="starts_at" required />
            </label>
            <label>
              Địa điểm
              <input
                name="location"
                placeholder="Phòng đào tạo / Đường dẫn buổi học"
              />
            </label>
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
              Nhóm tham gia
              <select name="group_id">
                <option value="">Toàn bộ khoa/phòng</option>
                {org?.groups
                  .filter((g: any) => g.can_manage)
                  .map((g: any) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className="modal-actions">
              <button className="primary" disabled={busy}>
                Lưu buổi đào tạo
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
