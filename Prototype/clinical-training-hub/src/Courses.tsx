import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Eye,
  FileText,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api, post } from "./api";
import {
  CourseEditorFrame,
  CourseInfoForm,
  CourseStepper,
} from "./CourseWorkflow";
import {
  ConfirmationDialog,
  EnterpriseDataTable,
  EnterprisePanel,
  FormField,
  SearchFilterPanel,
} from "./enterprise";
import { Citation } from "./Knowledge";
import { FormattedText, TextEditor } from "./TextEditor";
import { AssignmentDialog } from "./Training";
import {
  Badge,
  LoadState,
  dateStr,
  hasAnyRole,
  statusNames,
  useHub,
  useLoad,
} from "./ui";

export function CourseCatalog({
  builder = false,
  review = false,
}: {
  builder?: boolean;
  review?: boolean;
}) {
  const { user, go } = useHub();
  const [rev, setRev] = useState(0),
    [selected, setSelected] = useState(
      new URLSearchParams(location.hash.split("?")[1] || "").get(
        review ? "course" : "open",
      ) || "",
    ),
    [assign, setAssign] = useState<any>(null),
    [query, setQuery] = useState({ keyword: "", status: "", specialty: "" }),
    [filters, setFilters] = useState(query);
  const { data, loading, error } = useLoad<any[]>(
    "/courses" + (review ? "?status=PENDING_REVIEW" : ""),
    [rev],
  );
  const { data: docs } = useLoad<any[]>("/documents?status=APPROVED");
  return (
    <>
      <SearchFilterPanel
        actions={
          builder &&
          hasAnyRole(user, ["ADMIN"]) && (
            <button
              type="button"
              className="primary"
              onClick={() => go("builder/new")}
            >
              <Sparkles size={17} />
              Tạo khóa học
            </button>
          )
        }
        onSearch={() => setFilters({ ...query })}
        onReset={() => {
          const reset = { keyword: "", status: "", specialty: "" };
          setQuery(reset);
          setFilters(reset);
        }}
      >
        <FormField label="Tên khóa học">
          <input
            value={query.keyword}
            placeholder="Nhập tên hoặc đối tượng học…"
            onChange={(e) => setQuery({ ...query, keyword: e.target.value })}
          />
        </FormField>
        <FormField label="Chuyên khoa tài liệu nguồn">
          <select
            value={query.specialty}
            onChange={(e) => setQuery({ ...query, specialty: e.target.value })}
          >
            <option value="">Tất cả chuyên khoa</option>
            {[...new Set((docs || []).map((d) => d.specialty))].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Trạng thái">
          <select
            disabled={review || !builder}
            value={
              review ? "PENDING_REVIEW" : !builder ? "PUBLISHED" : query.status
            }
            onChange={(e) => setQuery({ ...query, status: e.target.value })}
          >
            <option value="">Tất cả trạng thái</option>
            {[
              "DRAFT",
              "PENDING_REVIEW",
              "APPROVED",
              "PUBLISHED",
              "REJECTED",
            ].map((s) => (
              <option key={s} value={s}>
                {statusNames[s]}
              </option>
            ))}
          </select>
        </FormField>
      </SearchFilterPanel>
      <EnterprisePanel
        title={review ? "Học liệu chờ phê duyệt" : "Danh mục khóa học"}
        heading={review}
        className="data-panel"
      >
        <EnterpriseDataTable
          rows={(data || []).filter(
            (c) =>
              (!review || c.can_review) &&
              (builder || review || c.status === "PUBLISHED") &&
              (!filters.keyword ||
                (c.title + " " + c.audience)
                  .toLocaleLowerCase("vi")
                  .includes(filters.keyword.toLocaleLowerCase("vi"))) &&
              (!filters.status || c.status === filters.status) &&
              (!filters.specialty ||
                c.sources.some((s: any) =>
                  docs?.some(
                    (d) =>
                      d.id === s.document_id &&
                      d.specialty === filters.specialty,
                  ),
                )),
          )}
          rowKey={(c) => c.id}
          loading={loading}
          error={error}
          label="Danh sách khóa học"
          columns={[
            {
              key: "title",
              title: "Tên khóa học",
              value: (c) => c.title,
              render: (c) => (
                <button
                  className="document-cell"
                  onClick={() =>
                    builder
                      ? go("builder/" + c.id + "?edit=1")
                      : setSelected(c.id)
                  }
                >
                  <BookOpen size={20} />
                  <span>
                    <b>{c.title}</b>
                    <small>{c.audience || "Chưa thiết lập đối tượng"}</small>
                    {c.needs_review && (
                      <span className="badge rejected">Nguồn cần rà soát</span>
                    )}
                  </span>
                </button>
              ),
            },
            {
              key: "version",
              title: "Phiên bản",
              value: (c) => c.number,
              render: (c) => <span className="version-tag">v{c.number}.0</span>,
            },
            {
              key: "duration",
              title: "Thời lượng",
              value: (c) => c.duration,
              render: (c) => c.duration + " phút",
            },
            {
              key: "sources",
              title: "Nguồn tài liệu",
              value: (c) => c.sources.length,
              render: (c) => c.sources.length + " nguồn",
            },
            {
              key: "status",
              title: "Trạng thái",
              value: (c) => statusNames[c.status] || c.status,
              render: (c) => <Badge status={c.status} />,
            },
            {
              key: "date",
              title: "Cập nhật",
              value: (c) => c.created_at,
              render: (c) => dateStr(c.created_at),
            },
            {
              key: "actions",
              title: "Thao tác",
              render: (c) => (
                <div className="row-actions">
                  <button
                    className="text-button"
                    onClick={() =>
                      builder
                        ? go("builder/" + c.id + "?edit=1")
                        : setSelected(c.id)
                    }
                  >
                    {review ? "Kiểm duyệt" : "Mở học liệu"}
                    <ArrowUpRight size={15} />
                  </button>
                  {c.status === "PUBLISHED" && c.can_manage && (
                    <button
                      className="secondary"
                      disabled={c.needs_review}
                      onClick={() => setAssign(c)}
                    >
                      <Users size={15} />
                      Phân công
                    </button>
                  )}
                </div>
              ),
            },
          ]}
        />
        <details className="context-help">
          <summary>
            {review ? "Quy tắc kiểm duyệt" : "Quy trình học liệu"}
          </summary>
          <p>
            {review
              ? "Chỉ hiển thị học liệu chờ duyệt thuộc phạm vi chuyên môn. Người tạo hoặc chỉnh sửa không được tự duyệt."
              : builder
                ? "Hoàn thiện bản nháp và gửi chuyên gia độc lập phê duyệt trước khi xuất bản."
                : "Chỉ khóa học đã xuất bản mới được phân công. Khóa học có nguồn cần rà soát sẽ bị khóa phân công."}
          </p>
        </details>
      </EnterprisePanel>
      {assign && (
        <AssignmentDialog
          course={assign}
          onClose={() => setAssign(null)}
          onDone={() => {
            setAssign(null);
            setRev((x) => x + 1);
          }}
        />
      )}
      {selected && (
        <CourseEditor
          id={selected}
          onClose={() => setSelected("")}
          onUpdate={() => setRev((x) => x + 1)}
        />
      )}
    </>
  );
}

export function CourseEditor({
  id,
  onClose,
  onUpdate,
  page = false,
  initialEditing = false,
  initialStep = 0,
}: {
  id: string;
  onClose: () => void;
  onUpdate: () => void;
  page?: boolean;
  initialEditing?: boolean;
  initialStep?: number;
}) {
  const { act, busy, notify, source } = useHub();
  const [rev, setRev] = useState(0),
    [draft, setDraft] = useState<any>(null),
    [tab, setTab] = useState(initialStep === 2 ? "questions" : "lessons"),
    [editMode, setEditing] = useState(initialEditing),
    [step, setStep] = useState(
      Number.isInteger(initialStep) && initialStep >= 0 && initialStep <= 3
        ? initialStep
        : 0,
    ),
    [confirmAction, setConfirmAction] = useState(""),
    [discard, setDiscard] = useState(false),
    [validation, setValidation] = useState(""),
    [preview, setPreview] = useState(initialStep === 3),
    [comment, setComment] = useState("");
  const { data, loading, error } = useLoad<any>("/courses/" + id, [rev]);
  const { data: sourceDocs } = useLoad<any[]>(page ? "/documents" : null);
  const c = data ? draft || data : null;
  const specialties = [
    ...new Set(
      (sourceDocs || [])
        .filter((d) =>
          c?.sources.some((source: any) => source.document_id === d.id),
        )
        .map((d) => d.specialty)
        .filter(Boolean),
    ),
  ];
  useEffect(() => {
    if (validation) document.getElementById("course-validation")?.focus();
  }, [validation]);
  const editing =
    editMode &&
    data?.can_manage &&
    data?.status !== "PENDING_REVIEW" &&
    step !== 3;
  const dirty = Boolean(
    comment.trim() ||
    (draft && data && JSON.stringify(draft) !== JSON.stringify(data)),
  );
  const moveStep = (n: number) => {
    setStep(n);
    setPreview(n === 3);
    if (n === 2) setTab("questions");
    if (n === 1 && tab === "questions") setTab("lessons");
  };
  const canEdit = Boolean(c?.can_manage && c?.status !== "PENDING_REVIEW");
  const update = (key: string, value: any) =>
    setDraft({ ...structuredClone(c), [key]: value });
  const updateItem = (list: string, index: number, key: string, value: any) => {
    const items = structuredClone(c[list]);
    items[index][key] = value;
    update(list, items);
  };
  const swap = (list: string, index: number, delta: number) => {
    const items = [...c[list]];
    [items[index], items[index + delta]] = [items[index + delta], items[index]];
    update(list, items);
  };
  const reload = () => {
    setDraft(null);
    setEditing(false);
    setValidation("");
    setComment("");
    setRev((x) => x + 1);
    onUpdate();
  };
  const save = () =>
    act(async () => {
      const problems = [];
      if (c.title.trim().length < 3 || c.title.length > 240)
        problems.push("Tên khóa học cần có 3–240 ký tự.");
      if (!Number.isInteger(c.duration) || c.duration < 1 || c.duration > 600)
        problems.push("Thời lượng phải từ 1 đến 600 phút.");
      if (
        !c.objectives.some((x: string) => x.trim()) ||
        c.objectives.length > 20
      )
        problems.push("Cần có 1–20 mục tiêu học tập.");
      if (
        c.lessons.some(
          (l: any) =>
            !l.title.trim() ||
            !l.objective.trim() ||
            !l.content.trim() ||
            !l.citation_ids?.length,
        )
      )
        problems.push("Mỗi bài học cần tên, mục tiêu, nội dung và dẫn nguồn.");
      if (
        c.checklist.some(
          (l: any) =>
            !l.title.trim() || !l.description.trim() || !l.citation_ids?.length,
        )
      )
        problems.push("Mỗi bước bảng kiểm cần tên, mô tả và dẫn nguồn.");
      if (
        c.questions.some(
          (q: any) =>
            !q.question.trim() ||
            q.options.length !== 4 ||
            q.options.some((o: string) => !o.trim()) ||
            !q.explanation.trim() ||
            !q.citation_ids?.length,
        )
      )
        problems.push(
          "Mỗi câu hỏi cần đủ 4 phương án, giải thích và dẫn nguồn.",
        );
      if (problems.length) {
        setValidation(problems.join(" "));
        return;
      }
      setValidation("");
      await api("/courses/" + id, {
        method: "PUT",
        body: JSON.stringify({ ...c, expected_version_id: data.version_id }),
      });
      reload();
      notify("Đã lưu thành phiên bản bản nháp mới. Cần được kiểm duyệt lại.");
    });
  const change = (action: string) =>
    act(async () => {
      await post(`/courses/${id}/${action}`, {
        version_id: data.version_id,
        comment,
      });
      reload();
      notify("Đã cập nhật trạng thái học liệu.");
    });
  return (
    <CourseEditorFrame
      page={page}
      title={c?.title || "Đang tải học liệu"}
      onClose={onClose}
      dirty={dirty}
    >
      <LoadState loading={loading} error={error} />
      {c && (
        <>
          <div className="detail-top">
            <Badge status={c.status} />
            <span>
              Phiên bản {c.number} ·{" "}
              {c.mode === "demo-template"
                ? "Mẫu trích xuất demo"
                : "Bộ xử lý AI"}{" "}
              · {c.duration} phút
            </span>
          </div>
          {c.needs_review && (
            <div className="error">
              Tài liệu nguồn đã thay đổi. Cần tạo lại từ nguồn mới và kiểm
              duyệt.
            </div>
          )}
          <CourseStepper step={step} onChange={moveStep} />
          <div className="editor-statusbar">
            <span className="muted">
              {editMode
                ? dirty
                  ? "Có thay đổi chưa lưu"
                  : "Đang biên tập bản nháp"
                : "Chế độ xem nội dung"}
            </span>
            <div className="actions">
              {canEdit && !editMode && (
                <button
                  className="secondary"
                  onClick={() => {
                    setEditing(true);
                    moveStep(0);
                    setDraft(structuredClone(data));
                  }}
                >
                  <Save size={16} />
                  Chỉnh sửa học liệu
                </button>
              )}
              <button
                className="secondary"
                onClick={() => {
                  moveStep(step === 3 ? 1 : 3);
                }}
              >
                <Eye size={16} />
                {preview ? "Quay lại biên tập" : "Xem trước người học"}
              </button>
            </div>
          </div>
          {validation && (
            <div
              className="error"
              role="alert"
              id="course-validation"
              tabIndex={-1}
            >
              {validation}
            </div>
          )}
          <div
            className={
              "builder-layout " + (step === 0 ? "builder-info-layout" : "")
            }
          >
            <div className="builder-main">
              {step === 0 && (
                <EnterprisePanel title="1. Thông tin chung về khóa học">
                  <CourseInfoForm
                    value={c}
                    onChange={update}
                    disabled={!editing}
                    specialty={
                      <input
                        aria-label="Chuyên khoa"
                        readOnly
                        value={specialties.join(", ") || "Theo tài liệu nguồn"}
                      />
                    }
                  />
                </EnterprisePanel>
              )}
              {step !== 0 && (
                <div className="tabs">
                  {[
                    ["lessons", "Bài học"],
                    ["checklist", "Bảng kiểm"],
                    ["questions", "Bài kiểm tra"],
                    ["storyboard", "Kịch bản video"],
                  ]
                    .filter(
                      ([key]) =>
                        step === 3 ||
                        (step === 2
                          ? key === "questions"
                          : key !== "questions"),
                    )
                    .map(([key, label]) => (
                      <button
                        key={key}
                        className={tab === key ? "active" : ""}
                        onClick={() => setTab(key)}
                      >
                        {label}
                        <span>{c[key].length}</span>
                      </button>
                    ))}
                </div>
              )}
              {step !== 0 &&
                tab === "lessons" &&
                c.lessons.map((l: any, i: number) => (
                  <section
                    className="editor-block"
                    id={"lesson-edit-" + i}
                    key={i}
                  >
                    <div className="section-head">
                      <h3>
                        {i + 1}. {l.title}
                      </h3>
                      {editing && (
                        <div className="actions">
                          <button
                            className="icon"
                            aria-label={"Đưa bài " + (i + 1) + " lên"}
                            disabled={i === 0}
                            onClick={() => swap("lessons", i, -1)}
                          >
                            <ArrowUp size={16} />
                          </button>
                          <button
                            className="icon"
                            aria-label={"Đưa bài " + (i + 1) + " xuống"}
                            disabled={i === c.lessons.length - 1}
                            onClick={() => swap("lessons", i, 1)}
                          >
                            <ArrowDown size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                    {editing ? (
                      <>
                        <label>
                          Tên bài {i + 1}
                          <input
                            value={l.title}
                            onChange={(e) =>
                              updateItem("lessons", i, "title", e.target.value)
                            }
                          />
                        </label>
                        <label>
                          Mục tiêu bài {i + 1}
                          <textarea
                            value={l.objective}
                            onChange={(e) =>
                              updateItem(
                                "lessons",
                                i,
                                "objective",
                                e.target.value,
                              )
                            }
                          />
                        </label>
                        <label>
                          Nội dung bài {i + 1}
                          <TextEditor
                            label={"Nội dung bài " + (i + 1)}
                            value={l.content}
                            onChange={(value) =>
                              updateItem("lessons", i, "content", value)
                            }
                          />
                        </label>
                        <label>
                          Kiến thức trọng tâm bài {i + 1}
                          <textarea
                            value={l.key_points.join("\n")}
                            onChange={(e) =>
                              updateItem(
                                "lessons",
                                i,
                                "key_points",
                                e.target.value.split("\n"),
                              )
                            }
                          />
                        </label>
                      </>
                    ) : (
                      <>
                        <p className="lesson-objective">
                          Mục tiêu: {l.objective}
                        </p>
                        <FormattedText text={l.content} />
                        <ul>
                          {l.key_points.map((x: string, j: number) => (
                            <li key={j}>{x}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    <div className="citation-grid">
                      {l.citations?.map((x: any) => (
                        <Citation c={x} key={x.id} />
                      ))}
                    </div>
                  </section>
                ))}
              {step !== 0 &&
                tab === "checklist" &&
                c.checklist.map((x: any, i: number) => (
                  <section className="editor-block" key={i}>
                    {editing ? (
                      <>
                        <label>
                          Tên bước {i + 1}
                          <input
                            value={x.title}
                            onChange={(e) =>
                              updateItem(
                                "checklist",
                                i,
                                "title",
                                e.target.value,
                              )
                            }
                          />
                        </label>
                        <label>
                          Mô tả bước {i + 1}
                          <textarea
                            value={x.description}
                            onChange={(e) =>
                              updateItem(
                                "checklist",
                                i,
                                "description",
                                e.target.value,
                              )
                            }
                          />
                        </label>
                        <label className="check-row">
                          <input
                            type="checkbox"
                            checked={x.critical}
                            onChange={(e) =>
                              updateItem(
                                "checklist",
                                i,
                                "critical",
                                e.target.checked,
                              )
                            }
                          />
                          Bước quan trọng (chỉ đánh dấu khi có căn cứ nguồn)
                        </label>
                      </>
                    ) : (
                      <>
                        <h3>
                          □ {i + 1}. {x.title}
                          {x.critical ? " • Quan trọng" : ""}
                        </h3>
                        <p className="lesson-content">{x.description}</p>
                      </>
                    )}
                    <div className="citation-grid">
                      {x.citations?.map((s: any) => (
                        <Citation c={s} key={s.id} />
                      ))}
                    </div>
                  </section>
                ))}
              {step !== 0 &&
                tab === "questions" &&
                c.questions.map((q: any, i: number) => (
                  <section className="editor-block" key={i}>
                    {editing ? (
                      <label>
                        Câu hỏi {i + 1}
                        <textarea
                          aria-label={"Câu hỏi " + (i + 1)}
                          value={q.question}
                          onChange={(e) =>
                            updateItem(
                              "questions",
                              i,
                              "question",
                              e.target.value,
                            )
                          }
                        />
                      </label>
                    ) : (
                      <h3>{q.question}</h3>
                    )}
                    {q.options.map((o: string, j: number) => (
                      <div
                        className={
                          "option-row " +
                          (!preview && q.correct === j ? "correct" : "")
                        }
                        key={j}
                      >
                        {editing ? (
                          <>
                            <input
                              type="radio"
                              aria-label={`Đáp án đúng câu ${i + 1} phương án ${j + 1}`}
                              name={"correct-" + i}
                              checked={q.correct === j}
                              onChange={() =>
                                updateItem("questions", i, "correct", j)
                              }
                            />
                            <input
                              aria-label={`Câu ${i + 1} phương án ${j + 1}`}
                              value={o}
                              onChange={(e) => {
                                const opts = [...q.options];
                                opts[j] = e.target.value;
                                updateItem("questions", i, "options", opts);
                              }}
                            />
                          </>
                        ) : (
                          <>
                            <span>{"ABCD"[j]}.</span>
                            <span>{o}</span>
                            {!preview && q.correct === j && (
                              <CheckCircle2 size={15} />
                            )}
                          </>
                        )}
                      </div>
                    ))}
                    {!preview &&
                      (editing ? (
                        <label>
                          Giải thích câu {i + 1}
                          <textarea
                            value={q.explanation}
                            onChange={(e) =>
                              updateItem(
                                "questions",
                                i,
                                "explanation",
                                e.target.value,
                              )
                            }
                          />
                        </label>
                      ) : (
                        <div className="notice">{q.explanation}</div>
                      ))}
                    <div className="citation-grid">
                      {q.citations?.map((s: any) => (
                        <Citation c={s} key={s.id} />
                      ))}
                    </div>
                  </section>
                ))}
              {step !== 0 &&
                tab === "storyboard" &&
                c.storyboard.map((s: any, i: number) => (
                  <section className="editor-block" key={i}>
                    <h3>
                      Cảnh {i + 1}: {s.title} · {s.duration_seconds}s
                    </h3>
                    {editing ? (
                      <label>
                        Lời thuyết minh cảnh {i + 1}
                        <textarea
                          rows={4}
                          value={s.narration}
                          onChange={(e) =>
                            updateItem(
                              "storyboard",
                              i,
                              "narration",
                              e.target.value,
                            )
                          }
                        />
                      </label>
                    ) : (
                      <p className="lesson-content">{s.narration}</p>
                    )}
                    <small>Gợi ý hình ảnh: {s.visual}</small>
                    <p className="fine">
                      Chỉ tạo kịch bản, chưa tạo video kỹ thuật y khoa.
                    </p>
                  </section>
                ))}
              {c.approvals?.length > 0 && (
                <div className="review-history">
                  <h3>Lịch sử kiểm duyệt phiên bản</h3>
                  {c.approvals.map((a: any, i: number) => (
                    <p key={i}>
                      {a.reviewer_id} · {dateStr(a.created_at)} ·{" "}
                      {a.decision === "APPROVED" ? "Phê duyệt" : "Trả lại"}:{" "}
                      {a.comment || "Đã kiểm tra"}
                    </p>
                  ))}
                </div>
              )}
              {!editing &&
                c.can_review &&
                c.status === "PENDING_REVIEW" &&
                !c.can_approve && (
                  <div className="notice">
                    Bạn đã tạo, chỉnh sửa hoặc gửi duyệt phiên bản này. Cần một
                    chuyên gia khác có phạm vi chuyên môn phù hợp phê duyệt.
                  </div>
                )}
              {!editing && c.can_review && c.status === "PENDING_REVIEW" && (
                <label>
                  Nhận xét học liệu
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </label>
              )}
              <div className="builder-footer">
                {step > 0 && (
                  <button
                    className="secondary"
                    onClick={() => moveStep(step - 1)}
                  >
                    Quay lại
                  </button>
                )}
                <span className="builder-footer-spacer" />
                {editMode && canEdit ? (
                  <>
                    <button
                      className="secondary"
                      onClick={() => {
                        if (dirty) setDiscard(true);
                        else {
                          setEditing(false);
                          setDraft(null);
                        }
                      }}
                    >
                      Hủy chỉnh sửa
                    </button>
                    <button className="primary" disabled={busy} onClick={save}>
                      <Save size={16} />
                      Lưu bản nháp
                    </button>
                  </>
                ) : (
                  <>
                    {c.can_manage &&
                      ["DRAFT", "REJECTED"].includes(c.status) &&
                      step === 3 && (
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() => change("submit-review")}
                        >
                          <Send size={16} />
                          Gửi phê duyệt học liệu
                        </button>
                      )}
                    {c.can_review && c.status === "PENDING_REVIEW" && (
                      <>
                        <button
                          className="danger"
                          disabled={busy || !comment.trim() || !c.can_approve}
                          onClick={() => setConfirmAction("reject")}
                        >
                          Yêu cầu chỉnh sửa
                        </button>
                        <button
                          className="primary"
                          disabled={busy || !c.can_approve}
                          onClick={() => setConfirmAction("approve")}
                          title={
                            c.can_approve
                              ? undefined
                              : "Cần chuyên gia khác phê duyệt; bạn đã tạo hoặc gửi nội dung này."
                          }
                        >
                          <ShieldCheck size={16} />
                          Phê duyệt học liệu
                        </button>
                      </>
                    )}
                    {c.can_manage && c.status === "APPROVED" && step === 3 && (
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() => setConfirmAction("publish")}
                      >
                        <CheckCircle2 size={16} />
                        Xuất bản khóa học
                      </button>
                    )}
                  </>
                )}
                {step < 3 && (
                  <button
                    className="primary"
                    onClick={() => moveStep(step + 1)}
                  >
                    Tiếp theo
                    <ChevronRight size={16} />
                  </button>
                )}
              </div>
            </div>
            <aside className="builder-sources">
              <EnterprisePanel title="Tài liệu nguồn">
                {c.sources.map((s: any) => (
                  <button
                    key={s.version_id}
                    onClick={() => source(s.version_id)}
                  >
                    <FileText size={17} />
                    <span>
                      {s.title}
                      <small>Phiên bản {s.number} · Mở tài liệu gốc</small>
                    </span>
                  </button>
                ))}
              </EnterprisePanel>
              <EnterprisePanel title="Danh sách bài học">
                <ol className="builder-outline">
                  {c.lessons.map((l: any, i: number) => (
                    <li key={i}>
                      <button
                        onClick={() => {
                          moveStep(1);
                          setTab("lessons");
                          requestAnimationFrame(() =>
                            document
                              .getElementById("lesson-edit-" + i)
                              ?.scrollIntoView({
                                block: "start",
                                behavior: "smooth",
                              }),
                          );
                        }}
                      >
                        {i + 1}. {l.title}
                      </button>
                    </li>
                  ))}
                </ol>
              </EnterprisePanel>
            </aside>
          </div>
          {discard && (
            <ConfirmationDialog
              title="Hủy các thay đổi chưa lưu?"
              danger
              confirm="Bỏ thay đổi"
              onClose={() => setDiscard(false)}
              onConfirm={() => {
                setDraft(null);
                setEditing(false);
                setDiscard(false);
                setValidation("");
              }}
            >
              <p>Nội dung đang biên tập sẽ trở về phiên bản đã lưu.</p>
            </ConfirmationDialog>
          )}
          {confirmAction && (
            <ConfirmationDialog
              title={
                confirmAction === "publish"
                  ? "Xác nhận xuất bản khóa học"
                  : confirmAction === "approve"
                    ? "Xác nhận phê duyệt học liệu"
                    : "Xác nhận yêu cầu chỉnh sửa"
              }
              busy={busy}
              danger={confirmAction === "reject"}
              confirm={
                confirmAction === "publish"
                  ? "Xuất bản"
                  : confirmAction === "approve"
                    ? "Phê duyệt"
                    : "Yêu cầu chỉnh sửa"
              }
              onClose={() => setConfirmAction("")}
              onConfirm={async () => {
                await change(confirmAction);
                setConfirmAction("");
              }}
            >
              <p>
                {confirmAction === "publish"
                  ? "Khóa học đã được duyệt sẽ sẵn sàng để phân công đào tạo. Bạn muốn tiếp tục?"
                  : confirmAction === "approve"
                    ? "Bạn xác nhận đã đối soát nội dung, câu hỏi và các tài liệu nguồn của phiên bản này?"
                    : "Quyết định và nhận xét sẽ được ghi nhận vào lịch sử kiểm duyệt."}
              </p>
              {comment && <blockquote>{comment}</blockquote>}
            </ConfirmationDialog>
          )}
        </>
      )}
    </CourseEditorFrame>
  );
}
