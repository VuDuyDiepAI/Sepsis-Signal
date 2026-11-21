import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RiskSummary } from "../src/components/clinical/risk-summary";
import { VitalSignsPanel } from "../src/components/clinical/vital-signs-panel";
import { LaboratoryPanel } from "../src/components/clinical/laboratory-panel";
import { dataset, predictionAt, percent } from "../src/lib/clinical-data";
describe("clinical components", () => {
  const encounter = dataset.encounters.find((e) => e.id === "E0009")!;
  it("renders exact source scores and threshold", () => {
    const p = predictionAt(encounter.id, 8)!;
    const html = renderToStaticMarkup(
      <RiskSummary encounter={encounter} hour={8} />,
    );
    expect(html).toContain(percent(p.score));
    expect(html).toContain(percent(p.threshold));
    expect(html).toContain("Vượt ngưỡng");
  });
  it("renders T0 as absent, without a zero score", () => {
    const html = renderToStaticMarkup(
      <RiskSummary encounter={encounter} hour={0} />,
    );
    expect(html).toContain("Chưa có kết quả");
    expect(html).toContain("Lần dự báo đầu tiên từ T0+1h");
    expect(html).not.toContain("0.00%");
  });
  it("does not expose delayed measurements or labs at T0", () => {
    expect(
      renderToStaticMarkup(<LaboratoryPanel id={encounter.id} hour={0} />),
    ).toContain("Chưa có kết quả");
    expect(
      renderToStaticMarkup(<VitalSignsPanel id={encounter.id} hour={0} />),
    ).toContain("Chưa có dữ liệu");
  });
});
