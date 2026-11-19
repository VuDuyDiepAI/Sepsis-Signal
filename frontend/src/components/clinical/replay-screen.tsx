"use client";
import { useState } from "react";
import { PageHeader } from "@/components/layout/page-container";
import { PatientWorkspace } from "./patient-workspace";
import { dataset, percent, formatTime } from "@/lib/clinical-data";
export function ReplayScreen() {
  const [id, setId] = useState("E0009"),
    [hour, setHour] = useState(7),
    [reveal, setReveal] = useState(false),
    [reference, setReference] = useState<{
      id: string;
      onset: string | null;
    } | null>(null),
    [loading, setLoading] = useState(false),
    [referenceError, setReferenceError] = useState(false);
  const encounter = dataset.encounters.find((e) => e.id === id)!;
  async function toggleReference(checked: boolean) {
    setReveal(checked);
    if (checked) {
      setLoading(true);
      setReferenceError(false);
      try {
        const data = await import("@/data/reference-onsets.json");
        const references = data.default as Record<
          string,
          { sepsisOnset: string | null }
        >;
        setReference({ id, onset: references[id]?.sepsisOnset ?? null });
      } catch {
        setReferenceError(true);
      } finally {
        setLoading(false);
      }
    }
  }
  const onset = reveal && reference?.id === id ? reference.onset : undefined;
  return (
    <>
      <PageHeader
        title="Diễn tiến ca mẫu"
        description="Đi qua từng mốc giờ để xem dữ kiện xuất hiện và điểm nguy cơ thay đổi."
        section="Dữ liệu & mô hình"
      />
      <section className="replay-toolbar">
        <label className="filter-label">
          Hồ sơ mô phỏng
          <select
            value={id}
            onChange={(e) => {
              setId(e.target.value);
              setHour(
                dataset.encounters.find((r) => r.id === e.target.value)!
                  .currentHour,
              );
              setReveal(false);
              setReference(null);
            }}
          >
            {dataset.encounters.map((e) => (
              <option key={e.id} value={e.id}>
                {e.id} · {e.age} tuổi · {e.sex === "F" ? "Nữ" : "Nam"}
              </option>
            ))}
          </select>
        </label>
        <div>
          <div className="value-label">Ngưỡng từ mô hình đang lưu</div>
          <strong>{percent(dataset.models.sepsis.threshold)}</strong>
        </div>
        <div>
          <label className="reference-toggle">
            <input
              type="checkbox"
              checked={reveal}
              onChange={(e) => void toggleReference(e.target.checked)}
            />
            Hiện khởi phát tham chiếu
          </label>
          {reveal && (
            <p className="secondary-text" role="status">
              {loading
                ? "Đang tải tham chiếu…"
                : referenceError
                  ? "Không tải được tham chiếu. Bỏ chọn rồi bật lại để thử lại."
                  : onset
                    ? `Khởi phát tham chiếu: ${formatTime(onset, true)}`
                    : "Không có mốc khởi phát trong hồ sơ này."}
            </p>
          )}
        </div>
      </section>
      <PatientWorkspace
        encounter={encounter}
        hour={hour}
        onHourChange={setHour}
        onset={onset}
      />
    </>
  );
}
