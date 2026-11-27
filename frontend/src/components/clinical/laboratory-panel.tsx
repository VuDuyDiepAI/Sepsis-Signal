"use client";
import { useClinicalReader } from "@/lib/client/manual-store";
import { Panel } from "@/components/layout/page-container";
import { labFields, formatTime } from "@/lib/clinical/data";
import { assessClinicalValue } from "@/lib/clinical/scores";
export function LaboratoryPanel({ id, hour }: { id: string; hour: number }) {
  const reader = useClinicalReader();
  const labs = reader.getAvailableLabs(id, hour),
    before = hour > 0 ? reader.getAvailableLabs(id, hour - 1) : [];
  const newly = labs.filter((l) => !before.includes(l)).length;
  return (
    <Panel
      className="labs-panel"
      title="Kết quả xét nghiệm"
      description="Sắp theo thời điểm lấy mẫu, chỉ dùng kết quả đã trả."
      meta={`${newly} kết quả mới trong giờ`}
    >
      <table className="labs-table">
        <caption className="sr-only">Xét nghiệm tại mốc đang xem</caption>
        <tbody>
          {labFields.map(([code, label]) => {
            const rows = labs.filter((l) => l.code === code),
              l = rows.at(-1),
              prev = rows.at(-2);
            const assessment = assessClinicalValue("lab", code, l?.value ?? null);
            const abnormal =
              assessment.status === "high" || assessment.status === "low";
            return (
              <tr
                key={code}
                className={abnormal ? `lab-row is-abnormal is-${assessment.status}` : "lab-row"}
              >
                <td>
                  <span className="lab-name-line">
                    {label}
                    <span className="ref-inline">BT {assessment.rangeLabel}</span>
                    {assessment.badge && (
                      <span className={`value-flag is-${assessment.status}`}>
                        {assessment.badge}
                      </span>
                    )}
                  </span>
                  {l && (
                    <span className="lab-time">
                      Có sẵn {formatTime(l.availableAt, true)}
                      {prev && l.value !== null && prev.value !== null
                        ? ` · ${l.value - prev.value > 0 ? "+" : ""}${(l.value - prev.value).toFixed(2)} so lần trước`
                        : ""}
                    </span>
                  )}
                </td>
                <td>
                  {l?.value != null ? (
                    <>
                      <span className={`lab-value ${abnormal ? "is-abnormal" : ""}`}>
                        {l.value.toFixed(code === "platelets" ? 0 : 2)}{" "}
                        <small>{l.unit}</small>
                      </span>
                    </>
                  ) : (
                    <span className="missing-text">Chưa có kết quả</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}
