"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useHydrated } from "@/lib/use-hydrated";
import { Plus, Save, LoaderCircle } from "lucide-react";
import { PageHeader, Panel } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PatientWorkspace } from "./patient-workspace";
import { patientHref } from "@/lib/clinical-navigation";
import {
  conditions,
  symptomFields,
  profileSchema,
  scoreRequestSchema,
  type ManualEntry,
} from "@/lib/manual-schema";
import {
  createManualCase,
  updateManualCase,
  useManualCases,
  useClinicalReader,
  type ManualCase,
  type ScoreResponse,
} from "@/lib/manual-store";
import {
  vitalFields,
  labFields,
  departments,
  timeAt,
  hourLabel,
} from "@/lib/clinical-data";
const numeric = (form: FormData, key: string) => {
  const s = String(form.get(key) ?? "").trim();
  return s === "" ? null : Number(s);
};
function localNow() {
  return new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 16);
}
export function NewCaseScreen() {
  const hydrated = useHydrated();
  const router = useRouter();
  const [error, setError] = useState("");
  function create(event: React.FormEvent<HTMLFormElement>) {
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
      createManualCase(result.data);
      router.push("/patients/" + result.data.id + "?hour=0");
    } catch {
      setError(
        "Trình duyệt chưa cho phép lưu trong phiên tab. Bật lưu trữ trình duyệt rồi thử lại.",
      );
    }
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
            <Button type="submit" disabled={!hydrated}>
              <Plus size={17} />
              Tạo hồ sơ và nhập dữ liệu T0
            </Button>
            <Link href="/patients" className="link-button">
              Quay lại danh sách
            </Link>
          </div>
          <p className="secondary-text">
            Mã hồ sơ được tạo tự động. Ca nhập tay chỉ lưu trong phiên tab này;
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
  onScored,
}: {
  record: ManualCase;
  hour: number;
  onScored: (message: string) => void;
}) {
  const [category, setCategory] = useState("vitals");
  const [timingOpen, setTimingOpen] = useState(false);
  const old = record.entries.find((e) => e.hour === hour);
  const at = timeAt(record.profile.t0 + "+07:00", hour).slice(0, 16);
  const [withVitals, setWithVitals] = useState(old ? !!old.vitals : true),
    [withSymptoms, setWithSymptoms] = useState(!!old?.symptoms),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
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
    const entries = [...record.entries.filter((e) => e.hour !== hour), entry];
    const hours = [
      ...new Set([...record.attemptedHours, ...(hour > 0 ? [hour] : [])]),
    ];
    const parsed = scoreRequestSchema.safeParse({
      profile: record.profile,
      entries,
      hours,
    });
    if (!parsed.success) {
      if (parsed.error.issues[0]?.message.startsWith("Giờ"))
        setTimingOpen(true);
      if (parsed.error.issues[0]?.path.includes("vitals"))
        setCategory("vitals");
      setError(
        parsed.error.issues[0]?.message?.startsWith("Giờ")
          ? parsed.error.issues[0].message
          : "Kiểm tra chỉ số. Sinh hiệu mới cần đủ nhịp tim, nhịp thở, HA tâm thu và nằm trong khoảng nhập hợp lệ.",
      );
      return;
    }
    setBusy(true);
    try {
      let response: ScoreResponse | undefined;
      if (hours.length) {
        const result = await fetch("/api/manual-score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        });
        const payload = await result.json();
        if (!result.ok)
          throw new Error(payload.error ?? "Không thể chấm điểm.");
        response = payload;
      }
      updateManualCase(
        record.profile.id,
        record.revision,
        parsed.data.entries.find((e) => e.hour === hour)! as ManualEntry,
        response,
      );
      const atMs = Date.parse(at + "+07:00");
      const delayed =
        Object.keys(entry.labs).length > 0 &&
        Date.parse(entry.labAvailableAt + "+07:00") > atMs;
      const savedMessage =
        hour === 0
          ? "Đã lưu dữ liệu T0. Chọn T0+1h để chấm lần đầu."
          : (response?.errors[String(hour)] ??
            "Đã lưu dữ liệu và cập nhật kết quả.");
      const notice =
        savedMessage +
        (delayed
          ? " Xét nghiệm trả sau mốc này: đã lưu, chưa dùng để chấm tại giờ đang xem."
          : "");
      setMessage(notice);
      if (hour > 0 && response?.predictions.some((p) => p.hour === hour))
        onScored(notice);
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
      <form className="manual-form tabbed-entry" onSubmit={save} noValidate>
        <div
          className="entry-categories"
          role="group"
          aria-label="Nhóm dữ liệu nhập"
        >
          {[
            ["vitals", "Sinh hiệu"],
            ["labs", "Xét nghiệm"],
            ["context", "Triệu chứng và khoa"],
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
            <label className="manual-switch">
              <input
                type="checkbox"
                checked={withVitals}
                onChange={(e) => setWithVitals(e.target.checked)}
              />
              Có sinh hiệu mới tại mốc này
            </label>
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
                        required={[
                          "heart_rate_bpm",
                          "respiratory_rate_per_min",
                          "sbp_mmhg",
                        ].includes(v.key)}
                      />
                    </label>
                  ))}
                </div>
                <p className="secondary-text">
                  Để trống MAP để tính từ HA tâm thu và tâm trương khi đủ dữ
                  liệu.
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
                      min={0}
                      max={100000}
                      step="any"
                      defaultValue={
                        old?.labs[code as keyof typeof old.labs] ?? ""
                      }
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
              <select name="department" defaultValue={old?.department ?? "ED"}>
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
          <Button type="submit" disabled={busy}>
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
  const router = useRouter();
  const [navigationPending, startNavigation] = useTransition();
  const cases = useManualCases(),
    reader = useClinicalReader();
  const record = cases.find((c) => c.profile.id === id);
  const hour = initialHour ?? record?.currentHour ?? 0;
  const setHour = (next: number) =>
    startNavigation(() =>
      router.replace(patientHref(id, next, returnTo), { scroll: false }),
    );
  if (!record)
    return (
      <div className="empty-state panel">
        <h1>Hồ sơ không có trong phiên tab này</h1>
        <p>Ca nhập tay được lưu riêng trong tab đã tạo hồ sơ.</p>
        <Link href="/patients/new" className="link-button primary">
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
        statusMessage={record.errors[String(hour)]}
        action={
          <Link href="/patients/new" className="link-button">
            <Plus size={16} />
            Tạo ca mới
          </Link>
        }
        entryForm={(onScored) => (
          <ManualEntryForm
            key={`${id}:${hour}`}
            record={record}
            hour={hour}
            onScored={onScored}
          />
        )}
      />
    </>
  );
}
