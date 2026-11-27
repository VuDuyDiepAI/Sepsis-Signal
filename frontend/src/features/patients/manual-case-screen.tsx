"use client";
import { Link } from "react-router";
import { useRef, useState, useTransition } from "react";
import { useAppNavigation } from "@/app/navigation";
import { useHydrated } from "@/hooks/use-hydrated";
import { Copy, Plus, Save, LoaderCircle } from "lucide-react";
import { PageHeader, Panel } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PatientWorkspace } from "@/features/patients/patient-workspace";
import { patientHref } from "@/lib/clinical/navigation";
import {
  conditions,
  symptomFields,
  labBounds,
  profileSchema,
  scoreRequestSchema,
  type ManualEntry,
} from "@/lib/clinical/manual-schema";
import {
  createManualCase,
  updateManualCase,
  rescoreManualCase,
  useManualCases,
  useClinicalReader,
  type ManualCase,
} from "@/lib/client/manual-store";
import { useAuth } from "@/components/providers/auth-provider";
import { useStorageStatus } from "@/lib/client/clinical-storage";
import {
  vitalFields,
  labFields,
  departments,
  timeAt,
  hourLabel,
} from "@/lib/clinical/data";
import { estimateMap } from "@/lib/clinical/scores";
import type { Department } from "@/lib/contracts/clinical";
export function describeScoringOutcome(
  saved: ManualCase,
  hour: number,
  mode: "save" | "rescore",
): { kind: "success" | "pending" | "error" | "notice"; text: string } {
  if (saved.scoringStatus === "error") {
    return {
      kind: "error",
      text:
        saved.scoringError ||
        (mode === "save"
          ? "Đã lưu dữ liệu nhưng chưa chấm được. Vui lòng chấm lại."
          : "Chưa chấm lại được dữ liệu đã lưu."),
    };
  }
  if (
    saved.scoringStatus === "pending" ||
    saved.scoringStatus === "running"
  ) {
    return {
      kind: "pending",
      text:
        mode === "save"
          ? hour === 0
            ? "Đã lưu dữ liệu T0. Hệ thống vẫn đang cập nhật điểm cho các mốc đã chấm."
            : "Đã lưu dữ liệu, hệ thống vẫn đang chấm điểm. Vui lòng đợi hoặc chấm lại sau."
          : "Đã gửi yêu cầu chấm lại, hệ thống vẫn đang xử lý. Vui lòng đợi hoặc thử lại sau.",
    };
  }
  if (mode === "save" && hour === 0) {
    return {
      kind: "success",
      text: "Đã lưu dữ liệu T0. Chọn T0+1h để chấm lần đầu.",
    };
  }
  if (saved.errors[String(hour)]) {
    return { kind: "notice", text: saved.errors[String(hour)] };
  }
  return {
    kind: "success",
    text:
      mode === "save"
        ? "Đã lưu dữ liệu và cập nhật kết quả."
        : "Đã chấm lại dữ liệu đã lưu.",
  };
}
const numeric = (form: FormData, key: string) => {
  const s = String(form.get(key) ?? "").trim();
  return s === "" ? null : Number(s);
};
function localNow() {
  return new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 16);
}
export function NewCaseScreen() {
  const hydrated = useHydrated();
  const router = useAppNavigation();
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const result = profileSchema.safeParse({
      id:
        "HS-" +
        crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase(),
      t0: f.get("t0"),
      age: numeric(f, "age"),
      sex: f.get("sex"),
      height: numeric(f, "height"),
      weight: numeric(f, "weight"),
      comorbidities: Object.fromEntries(
        conditions.map(([key]) => [key, f.get(key) === "on"]),
      ),
    });
    if (!result.success) {
      setError("Kiểm tra thời gian T0, tuổi 18–120, chiều cao và cân nặng.");
      return;
    }
    try {
      setCreating(true);
      await createManualCase(result.data);
      router.push("/patients/" + result.data.id + "?hour=0");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Không tạo được hồ sơ trên máy chủ. Vui lòng thử lại.",
      );
    } finally { setCreating(false); }
  }
  return (
    <div className="viewport-screen form-screen">
      <PageHeader
        title="Tạo ca mới"
        description="Tạo hồ sơ để nhập chỉ số ban đầu tại T0 và theo dõi các giờ tiếp theo."
        section="Hồ sơ người bệnh"
      />
      <Panel
        title="Thông tin ban đầu"
        description="T0 là thời điểm hoàn tất phân loại."
      >
        <form onSubmit={create} className="panel-body manual-form">
          <div className="manual-grid">
            <label className="filter-label">
              Thời điểm T0
              <Input
                name="t0"
                type="datetime-local"
                defaultValue={hydrated ? localNow() : ""}
                required
              />
            </label>
            <label className="filter-label">
              Tuổi
              <Input
                name="age"
                type="number"
                min={18}
                max={120}
                step={1}
                defaultValue={55}
                required
              />
            </label>
            <label className="filter-label">
              Giới
              <select name="sex">
                <option value="F">Nữ</option>
                <option value="M">Nam</option>
              </select>
            </label>
            <label className="filter-label">
              Chiều cao (cm)
              <Input
                name="height"
                type="number"
                min={80}
                max={250}
                step="any"
                placeholder="Không bắt buộc"
              />
            </label>
            <label className="filter-label">
              Cân nặng (kg)
              <Input
                name="weight"
                type="number"
                min={20}
                max={400}
                step="any"
                placeholder="Không bắt buộc"
              />
            </label>
          </div>
          <fieldset>
            <legend>Bệnh nền đã biết tại T0</legend>
            <div className="manual-checkboxes">
              {conditions.map(([key, label]) => (
                <label key={key}>
                  <input name={key} type="checkbox" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="flex gap-3 flex-wrap">
            <Button type="submit" disabled={!hydrated || creating}>
              <Plus size={17} />
              {creating ? "Đang tạo hồ sơ…" : "Tạo hồ sơ và nhập dữ liệu T0"}
            </Button>
            <Link to="/patients" className="link-button">
              Quay lại danh sách
            </Link>
          </div>
          <p className="secondary-text">
            Mã hồ sơ được tạo tự động. Hồ sơ được lưu trên máy chủ;
            không nhập tên hoặc thông tin định danh người bệnh thật.
          </p>
        </form>
      </Panel>
    </div>
  );
}
const bounds: Record<string, [number, number]> = {
  heart_rate_bpm: [20, 250],
  respiratory_rate_per_min: [4, 70],
  sbp_mmhg: [40, 300],
  dbp_mmhg: [20, 200],
  map_mmhg: [20, 250],
  spo2_pct: [40, 100],
  temperature_c: [25, 45],
  gcs: [3, 15],
};
const vitalInputs = [
  ...vitalFields.slice(0, 3),
  { key: "dbp_mmhg", label: "HA tâm trương", unit: "mmHg" },
  ...vitalFields.slice(3),
];
function ManualEntryForm({
  record,
  hour,
  inheritedDepartment,
  onScored,
}: {
  record: ManualCase;
  hour: number;
  inheritedDepartment: Department;
  onScored: (message: string) => void;
}) {
  const [category, setCategory] = useState("vitals");
  const [timingOpen, setTimingOpen] = useState(false);
  const {user}=useAuth();
  // Polling must not silently give an old form permission to overwrite newer data.
  const [editRevision,setEditRevision] = useState(record.revision);
  const [selectedDepartment, setSelectedDepartment] =
    useState<Department>(inheritedDepartment);
  const [departmentTouched, setDepartmentTouched] = useState(false);
  const departmentValue = departmentTouched
    ? selectedDepartment
    : inheritedDepartment;
  const old = record.entries.find((e) => e.hour === hour);
  const previousEntry = [...record.entries]
    .filter((e) => e.hour < hour && e.vitals)
    .sort((a, b) => b.hour - a.hour)[0];
  const formRef = useRef<HTMLFormElement>(null);
  const at = timeAt(record.profile.t0 + "+07:00", hour).slice(0, 16);
  const [withVitals, setWithVitals] = useState(old ? !!old.vitals : true),
    [withSymptoms, setWithSymptoms] = useState(!!old?.symptoms),
    [sbpDraft, setSbpDraft] = useState(
      old?.vitals?.sbp_mmhg != null ? String(old.vitals.sbp_mmhg) : "",
    ),
    [dbpDraft, setDbpDraft] = useState(
      old?.vitals?.dbp_mmhg != null ? String(old.vitals.dbp_mmhg) : "",
    ),
    [filledLabs, setFilledLabs] = useState(
      Object.keys(old?.labs ?? {}).length,
    ),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const sbpNum = sbpDraft.trim() === "" ? null : Number(sbpDraft);
  const dbpNum = dbpDraft.trim() === "" ? null : Number(dbpDraft);
  const bpOrderInvalid =
    sbpNum !== null &&
    dbpNum !== null &&
    Number.isFinite(sbpNum) &&
    Number.isFinite(dbpNum) &&
    dbpNum >= sbpNum;
  const previewMap = estimateMap(sbpNum, dbpNum);

  function copyPreviousVitals() {
    if (!previousEntry?.vitals || !formRef.current) return;
    setWithVitals(true);
    const prev = previousEntry.vitals;
    for (const v of vitalInputs) {
      const input = formRef.current.elements.namedItem(
        v.key,
      ) as HTMLInputElement | null;
      const val = prev[v.key as keyof typeof prev];
      if (input) input.value = val == null ? "" : String(val);
    }
    setSbpDraft(prev.sbp_mmhg != null ? String(prev.sbp_mmhg) : "");
    setDbpDraft(prev.dbp_mmhg != null ? String(prev.dbp_mmhg) : "");
    setMessage(
      `Đã sao chép sinh hiệu từ ${hourLabel(previousEntry.hour)}. Chỉnh các chỉ số vừa thay đổi rồi bấm lưu.`,
    );
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const f = new FormData(event.currentTarget);
    const entry = {
      hour,
      measuredAt: String(f.get("measuredAt")),
      availableAt: String(f.get("availableAt")),
      collectedAt: String(f.get("collectedAt")),
      labAvailableAt: String(f.get("labAvailableAt")),
      department: String(f.get("department")),
      vitals: withVitals
        ? Object.fromEntries(vitalInputs.map((v) => [v.key, numeric(f, v.key)]))
        : null,
      labs: Object.fromEntries(
        labFields
          .map(([k]) => [k, numeric(f, k)])
          .filter(([, v]) => v !== null),
      ),
      symptoms: withSymptoms
        ? Object.fromEntries(symptomFields.map(([k]) => [k, f.get(k) === "on"]))
        : null,
    };
    // Validate the single manual event being submitted. EMR history can contain
    // several observations per hour; the server owns the complete scoring input.
    const parsed = scoreRequestSchema.safeParse({
      profile: record.profile,
      entries: [entry],
      hours: [hour],
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      if (issue?.message.startsWith("Giờ")) setTimingOpen(true);
      if (issue?.path.includes("vitals")) setCategory("vitals");
      else if (issue?.path.includes("labs")) setCategory("labs");
      const specific =
        issue?.message &&
        (issue.message.startsWith("Giờ") ||
          issue.message.startsWith("HA tâm trương") ||
          issue.message.startsWith("Giá trị "));
      setError(
        specific
          ? issue.message
          : "Kiểm tra chỉ số. Sinh hiệu mới cần đủ nhịp tim, nhịp thở, HA tâm thu và nằm trong khoảng nhập hợp lệ.",
      );
      return;
    }
    setBusy(true);
    try {
      const saved = await updateManualCase(
        record.profile.id,
        editRevision,
        parsed.data.entries.find((e) => e.hour === hour)! as ManualEntry,
      );
      setEditRevision(saved.revision);
      const atMs = Date.parse(at + "+07:00");
      const delayed =
        Object.keys(entry.labs).length > 0 &&
        Date.parse(entry.labAvailableAt + "+07:00") > atMs;
      const outcome = describeScoringOutcome(saved, hour, "save");
      const notice =
        outcome.text +
        (delayed
          ? " Xét nghiệm trả sau mốc này: đã lưu, chưa dùng để chấm tại giờ đang xem."
          : "");
      if (outcome.kind === "error") {
        setError(notice);
      } else {
        setMessage(notice);
        if (
          outcome.kind === "success" &&
          hour > 0 &&
          saved.predictions.some((p) => p.hour === hour)
        )
          onScored(notice);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được dữ liệu.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel manual-entry" aria-label="Nhập chỉ số">
      <h2 className="sr-only">
        Nhập chỉ số và cập nhật kết quả · {hourLabel(hour)}
      </h2>
      <form
        ref={formRef}
        className="manual-form tabbed-entry"
        onSubmit={save}
        noValidate
      >
        <div
          className="entry-categories"
          role="group"
          aria-label="Nhóm dữ liệu nhập"
        >
          {[
            ["vitals", withVitals ? "Sinh hiệu •" : "Sinh hiệu"],
            [
              "labs",
              filledLabs > 0 ? `Xét nghiệm (${filledLabs})` : "Xét nghiệm",
            ],
            [
              "context",
              withSymptoms ? "Triệu chứng và khoa •" : "Triệu chứng và khoa",
            ],
          ].map(([value, label]) => (
            <Button
              key={value}
              type="button"
              variant="ghost"
              aria-pressed={category === value}
              onClick={() => setCategory(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="entry-fields">
          <div hidden={category !== "vitals"}>
            <div className="vitals-toolbar">
              <label className="manual-switch">
                <input
                  type="checkbox"
                  checked={withVitals}
                  onChange={(e) => setWithVitals(e.target.checked)}
                />
                Có sinh hiệu mới tại mốc này
              </label>
              {previousEntry?.vitals && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={copyPreviousVitals}
                  disabled={busy || user?.role === "viewer"}
                >
                  <Copy size={15} />
                  Lấy sinh hiệu từ {hourLabel(previousEntry.hour)}
                </Button>
              )}
            </div>
            {withVitals && (
              <>
                <div className="manual-grid">
                  {vitalInputs.map((v) => (
                    <label className="filter-label" key={v.key}>
                      {v.label} ({v.unit})
                      <Input
                        name={v.key}
                        type="number"
                        min={bounds[v.key][0]}
                        max={bounds[v.key][1]}
                        step="any"
                        defaultValue={
                          old?.vitals?.[
                            v.key as keyof NonNullable<ManualEntry["vitals"]>
                          ] ?? ""
                        }
                        onChange={
                          v.key === "sbp_mmhg"
                            ? (e) => setSbpDraft(e.target.value)
                            : v.key === "dbp_mmhg"
                              ? (e) => setDbpDraft(e.target.value)
                              : undefined
                        }
                        required={[
                          "heart_rate_bpm",
                          "respiratory_rate_per_min",
                          "sbp_mmhg",
                        ].includes(v.key)}
                      />
                    </label>
                  ))}
                </div>
                <p
                  className={
                    bpOrderInvalid
                      ? "form-error map-preview"
                      : "secondary-text map-preview"
                  }
                >
                  {bpOrderInvalid
                    ? "HA tâm trương (DBP) phải nhỏ hơn HA tâm thu (SBP)."
                    : previewMap !== null
                      ? `MAP ước tính: ${previewMap} mmHg (tự tính nếu để trống ô MAP).`
                      : "Để trống MAP để tính từ HA tâm thu và tâm trương khi đủ dữ liệu."}
                </p>
              </>
            )}
            <details
              className="entry-timing"
              open={timingOpen}
              onToggle={(event) => setTimingOpen(event.currentTarget.open)}
            >
              <summary>Chỉnh giờ đo và giờ có trên EMR</summary>
              <div className="manual-grid">
                <label className="filter-label">
                  Giờ đo sinh hiệu / ghi nhận
                  <Input
                    name="measuredAt"
                    type="datetime-local"
                    defaultValue={old?.measuredAt ?? at}
                    min={record.profile.t0}
                    required
                  />
                </label>
                <label className="filter-label">
                  Giờ sinh hiệu có trên EMR
                  <Input
                    name="availableAt"
                    type="datetime-local"
                    defaultValue={old?.availableAt ?? at}
                    min={record.profile.t0}
                    required
                  />
                </label>
              </div>
            </details>
          </div>
          <div hidden={category !== "labs"}>
            <fieldset>
              <legend>Xét nghiệm đã có kết quả</legend>
              <div className="manual-grid">
                {labFields.map(([code, label]) => (
                  <label key={code} className="filter-label">
                    {label} (
                    {code === "WBC" || code === "platelets"
                      ? "10⁹/L"
                      : code === "CRP"
                        ? "mg/L"
                        : code === "procalcitonin"
                          ? "ng/mL"
                          : "mg/dL"}
                    )
                    <Input
                      name={code}
                      type="number"
                      min={labBounds[code as keyof typeof labBounds][0]}
                      max={labBounds[code as keyof typeof labBounds][1]}
                      step="any"
                      defaultValue={
                        old?.labs[code as keyof typeof old.labs] ?? ""
                      }
                      onChange={() => {
                        if (!formRef.current) return;
                        const count = labFields.filter(([k]) => {
                          const el = formRef.current?.elements.namedItem(
                            k,
                          ) as HTMLInputElement | null;
                          return el && el.value.trim() !== "";
                        }).length;
                        setFilledLabs(count);
                      }}
                      placeholder="Chưa có kết quả"
                    />
                  </label>
                ))}
              </div>
              <div className="manual-grid">
                <label className="filter-label">
                  Giờ lấy mẫu
                  <Input
                    type="datetime-local"
                    name="collectedAt"
                    defaultValue={old?.collectedAt ?? at}
                    min={record.profile.t0}
                    required
                  />
                </label>
                <label className="filter-label">
                  Giờ xét nghiệm có trên EMR
                  <Input
                    type="datetime-local"
                    name="labAvailableAt"
                    defaultValue={old?.labAvailableAt ?? at}
                    min={record.profile.t0}
                    required
                  />
                </label>
              </div>
            </fieldset>
          </div>
          <div hidden={category !== "context"}>
            <label className="filter-label">
              Khoa tại thời điểm ghi nhận
              <select
                name="department"
                value={departmentValue}
                onChange={(e) => {
                  setSelectedDepartment(e.target.value as Department);
                  setDepartmentTouched(true);
                }}
              >
                {Object.entries(departments).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="manual-switch">
              <input
                type="checkbox"
                checked={withSymptoms}
                onChange={(e) => setWithSymptoms(e.target.checked)}
              />
              Cập nhật triệu chứng nghi nhiễm trùng
            </label>
            {withSymptoms && (
              <div className="manual-checkboxes">
                {symptomFields.map(([k, label]) => (
                  <label key={k}>
                    <input
                      name={k}
                      type="checkbox"
                      defaultChecked={old?.symptoms?.[k] ?? false}
                    />
                    {label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="entry-actions">
          {record.scoringStatus && ["pending","error","running"].includes(record.scoringStatus) && <div className="clinical-note" role="status">
            {record.scoringError || "Dữ liệu đã lưu trên máy chủ; kết quả đang chờ cập nhật."}
            <Button type="button" variant="outline" disabled={busy||user?.role==="viewer"} onClick={async()=>{
              setBusy(true);setError("");setMessage("");
              try {
                const saved=await rescoreManualCase(record.profile.id,editRevision);
                setEditRevision(saved.revision);
                const outcome=describeScoringOutcome(saved,hour,"rescore");
                if(outcome.kind==="error")setError(outcome.text);
                else {
                  setMessage(outcome.text);
                  if(outcome.kind==="success"&&hour>0&&saved.predictions.some(p=>p.hour===hour))onScored(outcome.text);
                }
              }
              catch(e){setError(e instanceof Error?e.message:"Chưa chấm lại được.");}
              finally{setBusy(false);}
            }}>Chấm lại dữ liệu đã lưu</Button>
          </div>}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="review-success" role="status">
              {message}
            </p>
          )}
          <Button type="submit" disabled={busy||user?.role==="viewer"}>
            {busy ? <LoaderCircle size={17} /> : <Save size={17} />}{" "}
            {busy
              ? "Đang chấm bằng mô hình Python…"
              : hour === 0
                ? "Lưu dữ liệu T0"
                : "Lưu dữ liệu và chấm điểm"}
          </Button>
          <p className="secondary-text">
            Chỉ dùng dữ liệu đã có trên EMR đến giờ đang xem. Sửa mốc cũ sẽ tính
            lại các giờ đã chấm; kết quả không đủ dữ liệu sẽ được loại bỏ.
          </p>
        </div>
      </form>
    </section>
  );
}
export function ManualCaseScreen({
  id,
  initialHour,
  returnTo,
}: {
  id: string;
  initialHour?: number;
  returnTo: string;
}) {
  const router = useAppNavigation();
  const [navigationPending, startNavigation] = useTransition();
  const cases = useManualCases(),
    reader = useClinicalReader();
  const record = cases.find((c) => c.profile.id === id);
  const storage = useStorageStatus();
  const hour = initialHour ?? record?.currentHour ?? 0;
  const setHour = (next: number) =>
    startNavigation(() =>
      router.replace(patientHref(id, next, returnTo), { scroll: false }),
    );
  if (!record)
    return (
      <div className="empty-state panel">
        <h1>{storage.loading ? "Đang tải hồ sơ…" : storage.error ? "Chưa tải được hồ sơ" : "Không tìm thấy hồ sơ"}</h1>
        <p>{storage.error || "Hồ sơ nhập tay được lưu trên máy chủ, có thể mở lại từ danh sách hồ sơ."}</p>
        <Link to="/patients/new" className="link-button primary">
          Tạo ca mới
        </Link>
      </div>
    );
  const encounter = reader.getEncounter(id)!;
  return (
    <>
      <PatientWorkspace
        encounter={encounter}
        hour={hour}
        onHourChange={setHour}
        navigationPending={navigationPending}
        returnTo={returnTo}
        statusMessage={
          record.errors[String(hour)] ||
          (record.predictions.some((p) => p.hour === hour) &&
          !reader.getPrediction(id, hour)
            ? "Chính sách cảnh báo đã cập nhật. Lưu dữ liệu và chấm lại mốc này để xem kết quả mới."
            : undefined)
        }
        action={
          <Link to="/patients/new" className="link-button">
            <Plus size={16} />
            Tạo ca mới
          </Link>
        }
        entryForm={(onScored) => (
          <ManualEntryForm
            key={`${id}:${hour}`}
            record={record}
            hour={hour}
            inheritedDepartment={reader.getDepartment(
              id,
              timeAt(encounter.t0, hour),
            )}
            onScored={onScored}
          />
        )}
      />
    </>
  );
}
