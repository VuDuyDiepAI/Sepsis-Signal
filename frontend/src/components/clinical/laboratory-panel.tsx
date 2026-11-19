import { Panel } from "@/components/layout/page-container";
import { availableLabs, labFields, formatTime } from "@/lib/clinical-data";
export function LaboratoryPanel({ id, hour }: { id: string; hour: number }) {
  const labs = availableLabs(id, hour),
    before = hour > 0 ? availableLabs(id, hour - 1) : [];
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
            return (
              <tr key={code}>
                <td>
                  {label}
                  {l && (
                    <>
                      <span className="lab-time">
                        Có sẵn {formatTime(l.availableAt, true)}
                      </span>
                      {prev && l.value !== null && prev.value !== null && (
                        <span className="lab-time">
                          {l.value - prev.value > 0 ? "+" : ""}
                          {(l.value - prev.value).toFixed(2)} so lần trước
                        </span>
                      )}
                    </>
                  )}
                </td>
                <td>
                  {l?.value != null ? (
                    <>
                      <span className="lab-value">
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
