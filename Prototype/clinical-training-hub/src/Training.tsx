import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Plus,
  ShieldCheck,
  Users,
} from "lucide-react";
import { CSSProperties, FormEvent, useEffect, useRef, useState } from "react";
import { api, post } from "./api";
import {
  EnterpriseDataTable,
  EnterprisePanel,
  FormField,
  SearchFilterPanel,
} from "./enterprise";
import { Citation } from "./Knowledge";
import { FormattedText } from "./TextEditor";
import {
  Badge,
  Empty,
  LoadState,
  Modal,
  dateStr,
  hasAnyRole,
  hasRole,
  useHub,
  useLoad,
} from "./ui";
const localISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

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

export { MyTraining } from "./MyTraining";

export function Learning({ parts }: { parts: string[] }) {
  const [, aid, cid, vid] = parts;
  const { act, busy, go, notify } = useHub();
  const [rev, setRev] = useState(0),
    [index, setIndex] = useState(0),
    [quiz, setQuiz] = useState(false),
    [answers, setAnswers] = useState<Record<string, number>>({}),
    [result, setResult] = useState<any>(null);
  const {
    data: c,
    loading,
    error,
  } = useLoad<any>(`/courses/${cid}?version_id=${vid}&learner=true`);
  const { data: assignments } = useLoad<any[]>("/training/my-courses", [rev]);
  const { data: attempts } = useLoad<any[]>(
    `/training/assignments/${aid}/attempts`,
    [rev],
  );
  useEffect(() => {
    post("/training/assignments/" + aid + "/start")
      .then(() => setRev((x) => x + 1))
      .catch(() => {});
  }, [aid]);
  const a = assignments?.find((x) => x.id === aid);
  const resumed = useRef("");
  const shouldResume =
    new URLSearchParams(location.hash.split("?")[1] || "").get("resume") ===
    "1";
  useEffect(() => {
    if (!shouldResume || !c || !a || resumed.current === aid) return;
    const next = c.lessons.findIndex(
      (lesson: any) => !a.completed_lessons.includes(lesson.id),
    );
    if (next >= 0) setIndex(next);
    else if (a.status !== "COMPLETED") setQuiz(true);
    resumed.current = aid;
  }, [shouldResume, c, a, aid]);
  const lesson = c?.lessons[index];
  const finish = () =>
    act(async () => {
      await post("/training/progress", {
        assignment_id: aid,
        lesson_id: lesson.id,
      });
      setRev((x) => x + 1);
      notify("Đã lưu tiến độ bài học.");
      if (index < c.lessons.length - 1) setIndex(index + 1);
    });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    act(async () => {
      const r = await post(`/training/quizzes/${c.quiz_id}/submit`, {
        assignment_id: aid,
        answers,
      });
      setResult(r);
      setRev((x) => x + 1);
      notify(
        r.passed
          ? "Bạn đã đạt bài kiểm tra. Kết quả được lưu."
          : "Chưa đạt ngưỡng hoàn thành. Xem giải thích và có thể làm lại.",
      );
    });
  };
  return (
    <>
      <button className="text-button" onClick={() => go("my-training")}>
        <ArrowLeft size={16} />
        Khóa học của tôi
      </button>
      <h2 className="context-heading">{c?.title || "Đang tải khóa học"}</h2>
      <LoadState loading={loading} error={error} />
      {c && a && (
        <div className="learning-layout">
          <aside className="panel lesson-nav">
            <h2>Nội dung khóa học</h2>
            <div className="progress-track">
              <div style={{ width: a.progress + "%" }} />
            </div>
            <p>
              {a.progress}% hoàn thành · {dateStr(a.due_date)}
            </p>
            {c.lessons.map((l: any, i: number) => (
              <button
                key={l.id}
                className={!quiz && index === i ? "active" : ""}
                onClick={() => {
                  setIndex(i);
                  setQuiz(false);
                }}
              >
                {a.completed_lessons.includes(l.id) ? (
                  <CheckCircle2 size={17} />
                ) : (
                  <BookOpen size={17} />
                )}
                <span>
                  {i + 1}. {l.title}
                </span>
              </button>
            ))}
            <button
              className={quiz ? "active" : ""}
              onClick={() => setQuiz(true)}
            >
              <ShieldCheck size={18} />
              Bài kiểm tra cuối khóa
            </button>
            <p>
              Điểm đạt: {c.pass_score}% · {a.attempt_count} lần làm bài
            </p>
            <button className="text-button" onClick={() => go("chat")}>
              Hỏi trợ lý về quy trình
              <ArrowUpRight size={15} />
            </button>
          </aside>
          <section className="panel lesson-reader">
            {!quiz ? (
              <>
                <div className="eyebrow">
                  BÀI {index + 1} / {c.lessons.length}
                </div>
                <h2>{lesson.title}</h2>
                <div className="lesson-objective">
                  Mục tiêu: {lesson.objective}
                </div>
                <FormattedText text={lesson.content} />
                <h3>Kiến thức trọng tâm</h3>
                <ul>
                  {lesson.key_points.map((x: string, i: number) => (
                    <li className="lesson-content" key={i}>
                      {x}
                    </li>
                  ))}
                </ul>
                <div className="citation-grid">
                  {lesson.citations.map((s: any) => (
                    <Citation c={s} key={s.id} />
                  ))}
                </div>
                <button
                  className="primary"
                  disabled={busy || a.completed_lessons.includes(lesson.id)}
                  onClick={finish}
                >
                  <CheckCircle2 size={17} />
                  {a.completed_lessons.includes(lesson.id)
                    ? "Đã hoàn thành bài này"
                    : "Đánh dấu hoàn thành bài"}
                </button>
                {a.completed_lessons.length === a.lesson_count && (
                  <button className="secondary" onClick={() => setQuiz(true)}>
                    Làm bài kiểm tra
                    <ChevronRight size={17} />
                  </button>
                )}
              </>
            ) : (
              <>
                <h2>Bài kiểm tra cuối khóa</h2>
                <div className="notice">
                  Hoàn thành tất cả bài học trước khi nộp bài. Chấm điểm tại máy
                  chủ. Kết quả học tập không tự công nhận CME hoặc gia hạn chứng
                  chỉ.
                </div>
                {a.completed_lessons.length < a.lesson_count && (
                  <div className="error">
                    Bạn còn {a.lesson_count - a.completed_lessons.length} bài
                    học chưa hoàn thành.
                  </div>
                )}
                <form onSubmit={submit}>
                  {c.questions.map((q: any, i: number) => (
                    <section className="editor-block" key={q.id}>
                      <h3>
                        {i + 1}. {q.question}
                      </h3>
                      {q.options.map((o: string, j: number) => (
                        <label className="check-row" key={j}>
                          <input
                            type="radio"
                            required
                            name={"q-" + q.id}
                            checked={answers[q.id] === j}
                            onChange={() =>
                              setAnswers({ ...answers, [q.id]: j })
                            }
                          />
                          <span>
                            <b>{"ABCD"[j]}.</b> {o}
                          </span>
                        </label>
                      ))}
                    </section>
                  ))}
                  <button
                    className="primary"
                    disabled={
                      busy ||
                      a.completed_lessons.length < a.lesson_count ||
                      Object.keys(answers).length !== c.questions.length
                    }
                  >
                    Nộp bài kiểm tra
                    <CheckCircle2 size={17} />
                  </button>
                </form>
                {(result || attempts?.[0]) && (
                  <div className="quiz-results">
                    <h2>Kết quả: {(result || attempts?.[0]).score}/100</h2>
                    <Badge
                      status={
                        (result || attempts?.[0]).passed
                          ? "COMPLETED"
                          : "REJECTED"
                      }
                    />
                    {(result || attempts?.[0]).answers.map(
                      (r: any, i: number) => (
                        <section className="editor-block" key={i}>
                          <h3>
                            {r.is_correct ? "✓" : "×"} {r.question}
                          </h3>
                          <p className="lesson-content">{r.explanation}</p>
                          <div className="notice">
                            Đáp án đúng: {"ABCD"[r.correct]} · Bạn chọn:{" "}
                            {"ABCD"[r.selected]}
                          </div>
                          <div className="citation-grid">
                            {r.citations.map((s: any) => (
                              <Citation c={s} key={s.id} />
                            ))}
                          </div>
                        </section>
                      ),
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}

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

export function Credentials() {
  const { user, act, busy, notify } = useHub();
  const [rev, setRev] = useState(0),
    [editing, setEditing] = useState<any>(null),
    [selected, setSelected] = useState<any>(null),
    [query, setQuery] = useState({ keyword: "", expiry: "" }),
    [filters, setFilters] = useState(query);
  const { data, loading, error } = useLoad<any[]>("/credentials", [rev]);
  const requested = new URLSearchParams(location.hash.split("?")[1] || "").get(
      "open",
    ),
    opened = useRef("");
  useEffect(() => {
    if (!requested || !data || opened.current === requested) return;
    const credential = data.find((c) => c.id === requested);
    if (credential) setSelected(credential);
    opened.current = requested;
  }, [requested, data]);
  const { data: users } = useLoad<any[]>(
    hasAnyRole(user, ["ADMIN"]) ? "/admin/users" : "/auth/me",
  );
  const manager = hasAnyRole(user, ["ADMIN"]);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    act(async () => {
      const b = {
        ...Object.fromEntries(f),
        verified: f.get("verified") === "on",
        reminder_days: String(f.get("reminder_days")).split(",").map(Number),
      };
      await api("/credentials" + (editing?.id ? "/" + editing.id : ""), {
        method: editing?.id ? "PUT" : "POST",
        body: JSON.stringify(b),
      });
      setEditing(null);
      setRev((x) => x + 1);
      notify("Đã lưu chứng chỉ và các mốc nhắc hạn.");
    });
  };
  return (
    <>
      <SearchFilterPanel
        compact
        onSearch={() => setFilters({ ...query })}
        onReset={() => {
          const reset = { keyword: "", expiry: "" };
          setQuery(reset);
          setFilters(reset);
        }}
      >
        <FormField label="Từ khóa">
          <input
            placeholder="Chứng chỉ, nhân viên, đơn vị cấp…"
            value={query.keyword}
            onChange={(e) => setQuery({ ...query, keyword: e.target.value })}
          />
        </FormField>
        <FormField label="Thời hạn">
          <select
            value={query.expiry}
            onChange={(e) => setQuery({ ...query, expiry: e.target.value })}
          >
            <option value="">Tất cả thời hạn</option>
            <option value="expired">Đã hết hạn</option>
            <option value="upcoming">Sắp hết hạn (60 ngày)</option>
            <option value="valid">Còn thời hạn</option>
          </select>
        </FormField>
      </SearchFilterPanel>
      <EnterprisePanel
        title="Danh sách chứng chỉ"
        heading={false}
        className="data-panel"
        actions={
          manager && (
            <button className="secondary" onClick={() => setEditing({})}>
              <Plus size={17} />
              Thêm chứng chỉ
            </button>
          )
        }
      >
        <EnterpriseDataTable
          rows={(data || []).filter(
            (c) =>
              (!filters.keyword ||
                (c.title + " " + c.name + " " + c.issuer)
                  .toLocaleLowerCase("vi")
                  .includes(filters.keyword.toLocaleLowerCase("vi"))) &&
              (!filters.expiry ||
                (filters.expiry === "expired"
                  ? c.days_left < 0
                  : filters.expiry === "upcoming"
                    ? c.days_left >= 0 && c.days_left <= 60
                    : c.days_left >= 0)),
          )}
          rowKey={(c) => c.id}
          loading={loading}
          error={error}
          empty="Chưa có chứng chỉ phù hợp"
          label="Danh sách chứng chỉ"
          columns={[
            {
              key: "title",
              title: "Chứng chỉ",
              value: (c) => c.title,
              render: (c) => (
                <span>
                  <b>{c.title}</b>
                  <small>{c.kind}</small>
                </span>
              ),
            },
            {
              key: "name",
              title: "Nhân viên",
              value: (c) => c.name,
              render: (c) => c.name,
            },
            {
              key: "issuer",
              title: "Đơn vị cấp",
              value: (c) => c.issuer,
              render: (c) => c.issuer,
            },
            {
              key: "issue",
              title: "Ngày cấp",
              value: (c) => c.issue_date,
              render: (c) => dateStr(c.issue_date),
            },
            {
              key: "expiry",
              title: "Ngày hết hạn",
              value: (c) => c.expiry_date,
              render: (c) => (
                <span>
                  {dateStr(c.expiry_date)}
                  <small className={c.days_left < 0 ? "expiry-danger" : ""}>
                    {c.days_left < 0
                      ? "Đã hết hạn " + -c.days_left + " ngày"
                      : "Còn " + c.days_left + " ngày"}
                  </small>
                </span>
              ),
            },
            {
              key: "status",
              title: "Xác minh",
              value: (c) => (c.verified ? 1 : 0),
              render: (c) => (
                <Badge status={c.verified ? "VERIFIED" : "UNVERIFIED"} />
              ),
            },
            {
              key: "action",
              title: "Thao tác",
              render: (c) => (
                <div className="row-actions">
                  <button
                    className="text-button"
                    onClick={() => setSelected(c)}
                  >
                    Chi tiết
                  </button>
                  {manager && (
                    <button className="secondary" onClick={() => setEditing(c)}>
                      Chỉnh sửa
                    </button>
                  )}
                </div>
              ),
            },
          ]}
        />
      </EnterprisePanel>
      {selected && (
        <Modal title="Chi tiết chứng chỉ" onClose={() => setSelected(null)}>
          <EnterprisePanel title={selected.title}>
            <div className="metadata-grid">
              <dl>
                <dt>Nhân viên</dt>
                <dd>{selected.name}</dd>
              </dl>
              <dl>
                <dt>Đơn vị cấp</dt>
                <dd>{selected.issuer}</dd>
              </dl>
              <dl>
                <dt>Loại chứng chỉ</dt>
                <dd>{selected.kind}</dd>
              </dl>
              <dl>
                <dt>Ngày cấp</dt>
                <dd>{dateStr(selected.issue_date)}</dd>
              </dl>
              <dl>
                <dt>Ngày hết hạn</dt>
                <dd>{dateStr(selected.expiry_date)}</dd>
              </dl>
              <dl>
                <dt>Xác minh</dt>
                <dd>
                  <Badge
                    status={selected.verified ? "VERIFIED" : "UNVERIFIED"}
                  />
                </dd>
              </dl>
            </div>
          </EnterprisePanel>
          <p>Mốc nhắc: {selected.reminder_days.join(", ")} ngày trước hạn.</p>
          <p className="fine">
            Hoàn thành khóa học không tự gia hạn chứng chỉ, công nhận CME hoặc
            xác nhận điều kiện pháp lý.
          </p>
          {selected.alert && (
            <div className="error">
              {selected.days_left < 0
                ? "Chứng chỉ đã hết hạn."
                : "Chứng chỉ sắp hết hạn."}{" "}
              Cần rà soát theo quy trình của đơn vị.
            </div>
          )}
          <div className="notice">
            Chưa có tệp chứng chỉ để xem hoặc tải xuống.
          </div>
        </Modal>
      )}
      {editing && (
        <Modal
          title={editing.id ? "Cập nhật chứng chỉ" : "Thêm chứng chỉ"}
          onClose={() => setEditing(null)}
        >
          <form onSubmit={submit}>
            <label>
              Nhân viên
              <select
                name="user_id"
                defaultValue={
                  editing.user_id || (Array.isArray(users) ? users[0]?.id : "")
                }
              >
                {Array.isArray(users) &&
                  users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Tên chứng chỉ
              <input
                name="title"
                required
                minLength={3}
                defaultValue={editing.title}
              />
            </label>
            <label>
              Loại chứng chỉ
              <input
                name="kind"
                defaultValue={editing.kind || "Đào tạo nội bộ"}
              />
            </label>
            <label>
              Đơn vị cấp
              <input name="issuer" required defaultValue={editing.issuer} />
            </label>
            <div className="form-grid">
              <label>
                Ngày cấp
                <input
                  type="date"
                  name="issue_date"
                  required
                  defaultValue={editing.issue_date}
                />
              </label>
              <label>
                Ngày hết hạn
                <input
                  type="date"
                  name="expiry_date"
                  required
                  defaultValue={editing.expiry_date}
                />
              </label>
            </div>
            <label>
              Nhắc trước hạn (số ngày, ngăn cách bằng dấu phẩy)
              <input
                name="reminder_days"
                required
                defaultValue={(editing.reminder_days || [30, 14, 7]).join(",")}
              />
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                name="verified"
                defaultChecked={editing.verified}
              />
              Đã kiểm tra và xác minh chứng chỉ
            </label>
            <div className="modal-actions">
              <button className="primary" disabled={busy}>
                Lưu chứng chỉ
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export { Reports } from "./Reports";
