"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Clock3,
  LoaderCircle,
  Plus,
  Save,
  X,
} from "lucide-react";
import { useHydrated } from "@/lib/use-hydrated";
import { Panel } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PatientWorkspace } from "./patient-workspace";
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
  useClinicalDataset,
  type ManualCase,
  type ScoreResponse,
} from "@/lib/manual-store";
import {
  vitalFields,
  labFields,
  departments,
  formatTime,
  timeAt,
  hourLabel,
} from "@/lib/clinical-data";

type VitalInputKey = keyof NonNullable<ManualEntry["vitals"]>;

const numeric = (form: FormData, key: string) => {
  const s = String(form.get(key) ?? "").trim();
  return s === "" ? null : Number(s);
};

function parseNum(raw: string): number | null {
  const s = raw.trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function localNow() {
  return new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 16);
}

function bmiCategory(bmi: number): string {
  if (bmi < 18.5) return "Thiếu cân";
  if (bmi < 23) return "Bình thường";
  if (bmi < 25) return "Thừa cân";
  return "Béo phì";
}

export function NewCaseScreen() {
  const hydrated = useHydrated();
  const router = useRouter();
  const [error, setError] = useState("");
  const [heightStr, setHeightStr] = useState("");
  const [weightStr, setWeightStr] = useState("");

  const liveBmi = useMemo(() => {
    const h = parseNum(heightStr);
    const w = parseNum(weightStr);
    if (h === null || w === null || h < 80 || h > 250 || w < 20 || w > 400) {
      return null;
    }
    return Math.round((w / (h / 100) ** 2) * 10) / 10;
  }, [heightStr, weightStr]);

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
    <>
      <h1 className="sr-only">Tiếp nhận ca cấp cứu mới</h1>
      <Panel
        title="Tiếp nhận ca cấp cứu mới"
        description="T0 là thời điểm hoàn tất phân loại Triage. Dữ liệu nhân trắc và bệnh nền được giữ đồng bộ trong toàn bộ quá trình theo dõi."
        meta="Mục tiêu nhập < 1 phút"
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
                value={heightStr}
                onChange={(e) => setHeightStr(e.target.value)}
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
                value={weightStr}
                onChange={(e) => setWeightStr(e.target.value)}
              />
            </label>
            <div className="vital-input-card" aria-live="polite">
              <span className="secondary-text" style={{ fontWeight: 600 }}>
                Chỉ số BMI (tự tính)
              </span>
              <div
                className="num"
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  marginTop: 4,
                  color: "var(--ink-primary)",
                }}
              >
                {liveBmi !== null ? `${liveBmi.toFixed(1)} kg/m²` : "—"}
              </div>
              <div className="prev-ref-hint">
                {liveBmi !== null
                  ? bmiCategory(liveBmi)
                  : "Nhập chiều cao và cân nặng để tính BMI"}
              </div>
            </div>
          </div>

          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="section-kicker">Bệnh nền đã biết tại T0</legend>
            <div className="manual-chip-grid">
              {conditions.map(([key, label]) => (
                <label key={key} className="manual-chip">
                  <input name={key} type="checkbox" />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <Button type="submit" disabled={!hydrated}>
              <Plus size={17} />
              Tạo hồ sơ và nhập dữ liệu T0
            </Button>
            <Link href="/patients" className="link-button">
              Quay lại danh sách
            </Link>
          </div>

          <p className="secondary-text">
            Mã hồ sơ được tạo tự động (HS-...). Ca nhập tay chỉ lưu trong phiên
            tab này; không nhập họ tên hoặc thông tin định danh người bệnh thật.
          </p>
        </form>
      </Panel>
    </>
  );
}

const bounds: Record<VitalInputKey, [number, number]> = {
  heart_rate_bpm: [20, 250],
  respiratory_rate_per_min: [4, 70],
  sbp_mmhg: [40, 300],
  dbp_mmhg: [20, 200],
  map_mmhg: [20, 250],
  spo2_pct: [40, 100],
  temperature_c: [25, 45],
  gcs: [3, 15],
};

const vitalInputs: { key: VitalInputKey; label: string; unit: string }[] = [
  ...vitalFields
    .slice(0, 3)
    .map((v) => ({ key: v.key as VitalInputKey, label: v.label, unit: v.unit })),
  { key: "dbp_mmhg", label: "HA tâm trương", unit: "mmHg" },
  ...vitalFields
    .slice(3)
    .map((v) => ({ key: v.key as VitalInputKey, label: v.label, unit: v.unit })),
];

const labUnit = (code: string) =>
  code === "WBC" || code === "platelets"
    ? "10⁹/L"
    : code === "CRP"
      ? "mg/L"
      : code === "procalcitonin"
        ? "ng/mL"
        : "mg/dL";

function sanityWarningForVital(
  key: VitalInputKey,
  val: number | null,
  prevVal: number | null,
): string | null {
  if (val === null) return null;
  if (key === "temperature_c" && (val < 34 || val > 42)) {
    return "Nhiệt độ ngoài vùng thường gặp (34–42°C), kiểm tra dấu thập phân.";
  }
  if (key === "spo2_pct" && val < 70) {
    return "SpO₂ < 70%, xác nhận lại số đo trên monitor.";
  }
  if (key === "heart_rate_bpm" && (val < 35 || val > 200)) {
    return "Nhịp tim cực đoan (< 35 hoặc > 200), kiểm tra lỗi gõ phím.";
  }
  if (key === "respiratory_rate_per_min" && (val < 8 || val > 45)) {
    return "Nhịp thở cực đoan (< 8 hoặc > 45), xác nhận lại số đo.";
  }
  if (key === "sbp_mmhg" && (val < 60 || val > 240)) {
    return "HA tâm thu cực đoan (< 60 hoặc > 240), kiểm tra lại.";
  }
  if (prevVal !== null) {
    if (key === "temperature_c" && Math.abs(val - prevVal) >= 3) {
      return "Chênh lệch ≥ 3°C so với lần đo trước — kiểm tra dấu thập phân.";
    }
    if (key === "sbp_mmhg" && Math.abs(val - prevVal) >= 60) {
      return "Chênh lệch ≥ 60 mmHg so với lần đo trước — xác nhận lại.";
    }
    if (key === "heart_rate_bpm" && Math.abs(val - prevVal) >= 50) {
      return "Chênh lệch ≥ 50 l/p so với lần đo trước — xác nhận lại.";
    }
  }
  return null;
}

function BedsideEntryForm({
  record,
  hour,
  onClose,
  onAdvanceHour,
  onKeepOpen,
}: {
  record: ManualCase;
  hour: number;
  onClose: () => void;
  onAdvanceHour: (nextHour: number) => void;
  onKeepOpen: () => void;
}) {
  const old = record.entries.find((e) => e.hour === hour);
  const at = timeAt(record.profile.t0 + "+07:00", hour).slice(0, 16);

  const hasCustomOldTimes = Boolean(
    old &&
      (old.measuredAt !== at ||
        old.availableAt !== at ||
        old.collectedAt !== at ||
        old.labAvailableAt !== at),
  );

  const [withVitals, setWithVitals] = useState(old ? !!old.vitals : true);
  const [withSymptoms, setWithSymptoms] = useState(!!old?.symptoms);
  const [customTimes, setCustomTimes] = useState(hasCustomOldTimes);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [vitalValues, setVitalValues] = useState<Record<VitalInputKey, string>>(
    () =>
      Object.fromEntries(
        vitalInputs.map((v) => [
          v.key,
          old?.vitals?.[v.key] !== null && old?.vitals?.[v.key] !== undefined
            ? String(old.vitals[v.key])
            : "",
        ]),
      ) as Record<VitalInputKey, string>,
  );

  const previousVitals = useMemo(() => {
    const prior = record.entries
      .filter((e) => e.hour < hour && e.vitals !== null)
      .sort((a, b) => a.hour - b.hour);
    const map: Partial<Record<VitalInputKey, { hour: number; value: number }>> =
      {};
    for (const v of vitalInputs) {
      for (let i = prior.length - 1; i >= 0; i--) {
        const val = prior[i].vitals?.[v.key];
        if (val !== null && val !== undefined) {
          map[v.key] = { hour: prior[i].hour, value: val };
          break;
        }
      }
    }
    return map;
  }, [record.entries, hour]);

  const previousLabs = useMemo(() => {
    const prior = record.entries
      .filter((e) => e.hour < hour)
      .sort((a, b) => a.hour - b.hour);
    const map: Record<string, { hour: number; value: number }> = {};
    for (const [code] of labFields) {
      for (let i = prior.length - 1; i >= 0; i--) {
        const val = prior[i].labs[code as keyof ManualEntry["labs"]];
        if (val !== null && val !== undefined) {
          map[code] = { hour: prior[i].hour, value: val };
          break;
        }
      }
    }
    return map;
  }, [record.entries, hour]);

  const sbpNum = parseNum(vitalValues.sbp_mmhg);
  const dbpNum = parseNum(vitalValues.dbp_mmhg);
  const bpOrderInvalid = sbpNum !== null && dbpNum !== null && dbpNum >= sbpNum;
  const computedMap =
    sbpNum !== null && dbpNum !== null && !bpOrderInvalid
      ? Math.round(((sbpNum + 2 * dbpNum) / 3) * 10) / 10
      : null;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    onKeepOpen();

    const f = new FormData(event.currentTarget);
    const entry = {
      hour,
      measuredAt: String(f.get("measuredAt") || at),
      availableAt: String(f.get("availableAt") || at),
      collectedAt: String(f.get("collectedAt") || at),
      labAvailableAt: String(f.get("labAvailableAt") || at),
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
      setError(
        "Kiểm tra chỉ số và thời gian. Sinh hiệu cần đủ nhịp tim, nhịp thở, HA tâm thu; giờ có dữ liệu phải sau giờ đo/lấy mẫu và từ T0.",
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
        if (!result.ok) {
          throw new Error(payload.error ?? "Không thể chấm điểm.");
        }
        response = payload;
      }
      updateManualCase(
        record.profile.id,
        record.revision,
        parsed.data.entries.find((e) => e.hour === hour)! as ManualEntry,
        response,
      );
      setMessage(
        hour === 0
          ? "Đã lưu dữ liệu T0. Chọn T0+1h để chấm lần đầu."
          : (response?.errors[String(hour)] ??
              "Đã lưu dữ liệu và cập nhật kết quả."),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được dữ liệu.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="drawer-panel">
      <div className="drawer-header">
        <div>
          <h2 style={{ fontSize: 15.5, fontWeight: 700 }}>
            Cập nhật sinh hiệu &amp; xét nghiệm · {hourLabel(hour)}
          </h2>
          <p className="secondary-text">
            {record.profile.id} · Mốc {formatTime(at + "+07:00", true)}
          </p>
        </div>
        <button
          type="button"
          className="btn-clinical"
          aria-label="Đóng bảng nhập liệu"
          onClick={onClose}
          style={{ padding: "0 10px" }}
        >
          <X size={16} />
          Đóng
        </button>
      </div>

      <div className="drawer-body">
        <form className="manual-form" onSubmit={save}>
          <label className="manual-chip" style={{ alignSelf: "flex-start" }}>
            <input
              type="checkbox"
              checked={withVitals}
              onChange={(e) => setWithVitals(e.target.checked)}
            />
            <span>Có sinh hiệu mới tại mốc này</span>
          </label>

          {withVitals && (
            <>
              <div className="manual-grid">
                {vitalInputs.map((v) => {
                  const prev = previousVitals[v.key];
                  const parsedVal = parseNum(vitalValues[v.key]);
                  const warn = sanityWarningForVital(
                    v.key,
                    parsedVal,
                    prev?.value ?? null,
                  );
                  const isRequired =
                    v.key === "heart_rate_bpm" ||
                    v.key === "respiratory_rate_per_min" ||
                    v.key === "sbp_mmhg";
                  return (
                    <div className="vital-input-card" key={v.key}>
                      <label className="filter-label">
                        {v.label} ({v.unit})
                        <Input
                          name={v.key}
                          type="number"
                          min={bounds[v.key][0]}
                          max={bounds[v.key][1]}
                          step="any"
                          value={vitalValues[v.key]}
                          onChange={(e) =>
                            setVitalValues((cur) => ({
                              ...cur,
                              [v.key]: e.target.value,
                            }))
                          }
                          required={isRequired}
                        />
                      </label>
                      <div className="prev-ref-hint">
                        {prev
                          ? `Lần trước (${hourLabel(prev.hour)}): ${prev.value} ${v.unit}`
                          : "Chưa có mốc trước"}
                      </div>
                      {warn && (
                        <div className="field-warn" role="status">
                          {warn}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {bpOrderInvalid ? (
                <p className="field-warn" role="status">
                  <AlertTriangle
                    size={13}
                    style={{ display: "inline", marginRight: 5 }}
                  />
                  Cảnh báo nhập liệu: HA tâm trương ({dbpNum} mmHg) lớn hơn hoặc
                  bằng HA tâm thu ({sbpNum} mmHg). Vui lòng kiểm tra lại.
                </p>
              ) : computedMap !== null ? (
                <p
                  className={
                    computedMap < 65 ? "field-warn" : "secondary-text"
                  }
                  role="status"
                >
                  HATB (MAP) tự tính từ HATT/HATTr:{" "}
                  <strong className="num">{computedMap} mmHg</strong>
                  {computedMap < 65
                    ? " (< 65 mmHg · cảnh báo hạ tưới máu)."
                    : "."}{" "}
                  Để trống ô MAP để hệ thống tự áp dụng.
                </p>
              ) : (
                <p className="secondary-text">
                  Để trống MAP để hệ thống tự tính từ HA tâm thu và tâm trương
                  khi đủ dữ liệu.
                </p>
              )}
            </>
          )}

          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="section-kicker">
              Xét nghiệm Labtc đã có kết quả
            </legend>
            <div className="manual-grid">
              {labFields.map(([code, label]) => {
                const unit = labUnit(code);
                const prev = previousLabs[code];
                return (
                  <div className="vital-input-card" key={code}>
                    <label className="filter-label">
                      {label} ({unit})
                      <Input
                        name={code}
                        type="number"
                        min={0}
                        max={100000}
                        step="any"
                        defaultValue={
                          old?.labs[code as keyof ManualEntry["labs"]] ?? ""
                        }
                        placeholder="Chưa có KQ"
                      />
                    </label>
                    <div className="prev-ref-hint">
                      {prev
                        ? `Lần trước (${hourLabel(prev.hour)}): ${prev.value} ${unit}`
                        : "Chưa có KQ trước đó"}
                    </div>
                  </div>
                );
              })}
            </div>
          </fieldset>

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

          <div className="section-stack" style={{ gap: 8 }}>
            <label className="manual-chip" style={{ alignSelf: "flex-start" }}>
              <input
                type="checkbox"
                checked={customTimes}
                onChange={(e) => setCustomTimes(e.target.checked)}
              />
              <Clock3 size={14} />
              <span>Tùy chỉnh giờ đo / giờ trả KQ Labtc riêng</span>
            </label>

            {customTimes ? (
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
                <label className="filter-label">
                  Giờ lấy mẫu xét nghiệm
                  <Input
                    name="collectedAt"
                    type="datetime-local"
                    defaultValue={old?.collectedAt ?? at}
                    min={record.profile.t0}
                    required
                  />
                </label>
                <label className="filter-label">
                  Giờ KQ xét nghiệm trả về EMR
                  <Input
                    name="labAvailableAt"
                    type="datetime-local"
                    defaultValue={old?.labAvailableAt ?? at}
                    min={record.profile.t0}
                    required
                  />
                </label>
              </div>
            ) : (
              <>
                <input type="hidden" name="measuredAt" value={at} />
                <input type="hidden" name="availableAt" value={at} />
                <input type="hidden" name="collectedAt" value={at} />
                <input type="hidden" name="labAvailableAt" value={at} />
                <p className="secondary-text">
                  Thời gian mặc định đồng bộ theo mốc{" "}
                  <strong className="num">{hourLabel(hour)}</strong> (
                  {formatTime(at + "+07:00", true)}). Bật tùy chọn trên nếu cần
                  nhập lệch giờ lấy mẫu và giờ trả kết quả Labtc.
                </p>
              </>
            )}
          </div>

          <div className="section-stack" style={{ gap: 8 }}>
            <label className="manual-chip" style={{ alignSelf: "flex-start" }}>
              <input
                type="checkbox"
                checked={withSymptoms}
                onChange={(e) => setWithSymptoms(e.target.checked)}
              />
              <span>Cập nhật triệu chứng nghi nhiễm trùng</span>
            </label>

            {withSymptoms && (
              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="section-kicker">
                  Triệu chứng / ổ nghi nhiễm
                </legend>
                <div className="manual-chip-grid">
                  {symptomFields.map(([k, label]) => (
                    <label key={k} className="manual-chip">
                      <input
                        name={k}
                        type="checkbox"
                        defaultChecked={old?.symptoms?.[k] ?? false}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
          </div>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          {message && (
            <div className="review-success" role="status">
              <span>{message}</span>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                {hour === 0 ? (
                  <button
                    type="button"
                    className="btn-clinical primary"
                    onClick={() => onAdvanceHour(1)}
                  >
                    Chuyển sang T0+1h
                    <ArrowRight size={14} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-clinical"
                    onClick={onClose}
                  >
                    Xem kết quả trên hồ sơ
                  </button>
                )}
              </div>
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <Button type="submit" disabled={busy}>
              {busy ? <LoaderCircle size={17} /> : <Save size={17} />}{" "}
              {busy
                ? "Đang chấm bằng mô hình Python…"
                : hour === 0
                  ? "Lưu dữ liệu T0"
                  : "Lưu dữ liệu và chấm điểm"}
            </Button>
            <button type="button" className="btn-clinical" onClick={onClose}>
              Hủy
            </button>
          </div>

          <p className="secondary-text">
            Chỉ dùng dữ liệu đã có trên EMR đến mốc giờ đang xem. Sửa mốc cũ sẽ
            tự động tính lại các giờ đã chấm; kết quả không đủ dữ liệu sẽ được
            loại bỏ.
          </p>
        </form>
      </div>
    </div>
  );
}

export function ManualCaseScreen({
  id,
  initialHour,
}: {
  id: string;
  initialHour?: number;
}) {
  const cases = useManualCases();
  const source = useClinicalDataset();
  const record = cases.find((c) => c.profile.id === id);

  const [hourOverride, setHourOverride] = useState<number | undefined>(
    initialHour,
  );
  const [drawerOverride, setDrawerOverride] = useState<boolean | null>(null);

  const hour = hourOverride ?? record?.currentHour ?? 0;
  const isDrawerOpen =
    drawerOverride ?? (hour === 0 && !!record && record.entries.length === 0);

  useEffect(() => {
    if (!isDrawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOverride(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isDrawerOpen]);

  const manualContext = useMemo(() => {
    if (!record) return undefined;
    const latestSymptomsEntry = [...record.entries]
      .filter((e) => e.hour <= hour && e.symptoms !== null)
      .sort((a, b) => a.hour - b.hour)
      .at(-1);
    return {
      comorbidities: record.profile.comorbidities,
      symptoms: latestSymptomsEntry?.symptoms ?? null,
      height: record.profile.height,
      weight: record.profile.weight,
    };
  }, [record, hour]);

  if (!record) {
    return (
      <div className="empty-state panel">
        <h1>Hồ sơ không có trong phiên tab này</h1>
        <p>Ca nhập tay được lưu riêng trong tab đã tạo hồ sơ.</p>
        <Link href="/patients/new" className="link-button primary">
          Tạo ca mới
        </Link>
      </div>
    );
  }

  const encounter = source.encounters.find((e) => e.id === id)!;

  return (
    <>
      <PatientWorkspace
        encounter={encounter}
        hour={hour}
        onHourChange={(nextHour) => setHourOverride(nextHour)}
        manualContext={manualContext}
        headerAction={
          <button
            type="button"
            className="btn-clinical primary"
            onClick={() => setDrawerOverride(true)}
          >
            <Plus size={16} />
            Cập nhật sinh hiệu / XN · {hourLabel(hour)}
          </button>
        }
      />

      {record.errors[String(hour)] && (
        <p role="status" className="research-notice" style={{ marginTop: 14 }}>
          {record.errors[String(hour)]}
        </p>
      )}

      {isDrawerOpen && (
        <div
          className="drawer-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`Nhập dữ liệu lâm sàng ${record.profile.id} mốc ${hourLabel(hour)}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setDrawerOverride(false);
          }}
        >
          <BedsideEntryForm
            key={`${id}:${hour}`}
            record={record}
            hour={hour}
            onClose={() => setDrawerOverride(false)}
            onKeepOpen={() => setDrawerOverride(true)}
            onAdvanceHour={(nextHour) => {
              setHourOverride(nextHour);
              setDrawerOverride(true);
            }}
          />
        </div>
      )}
    </>
  );
}
