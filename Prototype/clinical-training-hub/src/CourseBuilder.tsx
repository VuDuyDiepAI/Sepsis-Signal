import { ChevronRight, FileText, Save } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, post } from "./api";
import { CourseEditor } from "./Courses";
import {
  CourseEditorFrame,
  CourseInfoForm,
  CourseStepper,
} from "./CourseWorkflow";
import { EnterprisePanel } from "./enterprise";
import { Empty, LoadState, useHub, useLoad } from "./ui";
export function CourseBuilderPage({ id }: { id: string }) {
  const { go } = useHub();
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  return id === "new" ? (
    <NewCourse />
  ) : (
    <CourseEditor
      id={id}
      page
      initialEditing={params.get("edit") === "1"}
      initialStep={Number(params.get("step") || 0)}
      onClose={() => go("builder")}
      onUpdate={() => {}}
    />
  );
}
function NewCourse() {
  const { go, act, busy, notify } = useHub(),
    docs = useLoad<any[]>("/documents?status=APPROVED");
  const [info, setInfo] = useState({
      title: "",
      description: "",
      audience: "Bác sĩ, Điều dưỡng",
      duration: 60,
    }),
    [specialty, setSpecialty] = useState(""),
    [pick, setPick] = useState<string[]>([]),
    [error, setError] = useState(""),
    [progress, setProgress] = useState(""),
    [destination, setDestination] = useState("");
  const created = useRef("");
  const available = (docs.data || []).filter(
      (d) => d.can_manage && d.version.processing === "COMPLETED",
    ),
    specialties = [
      ...new Set(available.map((d) => d.specialty).filter(Boolean)),
    ];
  useEffect(() => {
    if (!specialty && specialties.length === 1) setSpecialty(specialties[0]);
  }, [docs.data, specialty]);
  useEffect(() => {
    if (destination) go(destination);
  }, [destination]);
  const dirty =
    !destination &&
    (!!info.title.trim() ||
      !!info.description.trim() ||
      pick.length > 0 ||
      info.duration !== 60 ||
      info.audience !== "Bác sĩ, Điều dưỡng");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!pick.length) {
      setError("Chọn ít nhất một tài liệu nguồn đã phê duyệt.");
      return;
    }
    const next =
      (e.nativeEvent as SubmitEvent).submitter?.getAttribute("data-next") ===
      "1";
    await act(async () => {
      try {
        if (!created.current) {
          setProgress("Đang tạo bài học và bài kiểm tra từ tài liệu nguồn…");
          const started = await post("/ai/generate-course", {
            version_ids: pick,
          });
          let job = await api("/ai/jobs/" + started.job_id);
          for (
            let attempt = 0;
            attempt < 100 && ["QUEUED", "RUNNING"].includes(job.status);
            attempt++
          ) {
            await new Promise((r) => setTimeout(r, 600));
            job = await api("/ai/jobs/" + started.job_id);
          }
          if (job.status !== "COMPLETED")
            throw new Error(
              job.error ||
                "Học liệu vẫn đang xử lý. Xem trạng thái trong Tác vụ xử lý.",
            );
          created.current = job.result.course_id;
        }
        setProgress("Đang lưu thông tin khóa học…");
        const generated = await api("/courses/" + created.current);
        await api("/courses/" + created.current, {
          method: "PUT",
          body: JSON.stringify({
            ...generated,
            ...info,
            title: info.title.trim(),
            expected_version_id: generated.version_id,
          }),
        });
        notify(
          "Đã lưu bản nháp khóa học. Tiếp tục kiểm tra bài học và câu hỏi.",
        );
        setDestination(
          "builder/" + created.current + "?edit=1&step=" + (next ? 1 : 0),
        );
      } catch (ex) {
        setError((ex as Error).message);
      } finally {
        setProgress("");
      }
    });
  }
  return (
    <CourseEditorFrame
      page
      title="Tạo khóa học"
      dirty={dirty}
      onClose={() => go("builder")}
    >
      <CourseStepper step={0} onChange={() => {}} locked />
      <form onSubmit={submit}>
        <EnterprisePanel title="1. Thông tin chung về khóa học">
          <CourseInfoForm
            value={info}
            onChange={(key, value) => setInfo({ ...info, [key]: value })}
            disabled={busy}
            objectives={false}
            specialty={
              <select
                aria-label="Chuyên khoa"
                required
                value={specialty}
                onChange={(e) => {
                  setSpecialty(e.target.value);
                  setPick([]);
                  created.current = "";
                }}
              >
                <option value="">Chọn chuyên khoa</option>
                {specialties.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            }
          />
        </EnterprisePanel>
        <EnterprisePanel
          title="Tài liệu nguồn đã phê duyệt"
          icon={<FileText size={17} />}
        >
          <p className="source-pick-hint">
            Chọn 1–5 tài liệu cùng chuyên khoa để tạo nội dung có dẫn nguồn.
          </p>
          <LoadState loading={docs.loading} error={docs.error} />
          <div className="source-pick-list">
            {available
              .filter((d) => !specialty || d.specialty === specialty)
              .map((d) => (
                <label className="check-row" key={d.id}>
                  <input
                    type="checkbox"
                    aria-label={"Chọn " + d.title}
                    disabled={
                      busy ||
                      !!created.current ||
                      (!pick.includes(d.version.id) && pick.length >= 5)
                    }
                    checked={pick.includes(d.version.id)}
                    onChange={(e) => {
                      setPick(
                        e.target.checked
                          ? [...pick, d.version.id]
                          : pick.filter((id) => id !== d.version.id),
                      );
                      if (!specialty) setSpecialty(d.specialty);
                    }}
                  />
                  <FileText size={19} />
                  <span>
                    <b>{d.title}</b>
                    <small>
                      {d.specialty} · Phiên bản {d.version.number} · Đã phê
                      duyệt
                    </small>
                  </span>
                </label>
              ))}
          </div>
          {!docs.loading && !docs.error && !available.length && (
            <Empty text="Chưa có tài liệu nguồn phù hợp">
              <p>Tải lên và phê duyệt tài liệu trước khi tạo khóa học.</p>
            </Empty>
          )}
        </EnterprisePanel>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {progress && (
          <div className="notice" role="status">
            {progress}
          </div>
        )}
        <div className="builder-footer">
          <span className="fine">
            Bản nháp cần được chuyên gia độc lập phê duyệt trước khi xuất bản.
          </span>
          <div className="actions">
            <button
              className="secondary"
              type="submit"
              data-next="0"
              disabled={busy || !available.length}
            >
              <Save size={16} />
              {busy ? "Đang xử lý…" : "Lưu nháp"}
            </button>
            <button
              className="primary"
              type="submit"
              data-next="1"
              disabled={busy || !available.length}
            >
              {busy ? "Đang xử lý…" : "Tiếp theo"}
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </form>
    </CourseEditorFrame>
  );
}
