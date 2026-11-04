import { Citation } from "@/features/documents/Citation";
import { post } from "@/shared/api/client";
import { useHub } from "@/shared/context/HubContext";
import { useLoad } from "@/shared/hooks/useLoad";
import { dateStr } from "@/shared/lib/dates";
import { Badge } from "@/shared/ui/Badge";
import { LoadState } from "@/shared/ui/LoadState";
import { FormattedText } from "@/shared/ui/TextEditor";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

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
