import { test, expect } from "@playwright/test";
import data from "../../src/data/clinical-demo.json" with { type: "json" };

test("dashboard watchboard search, filters, sorting, pagination and navigation", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Bảng theo dõi ca trực Cấp cứu",
  );
  await page.getByLabel("Tìm mã hồ sơ", { exact: true }).fill("zzzz");
  await expect(page.getByText("Không tìm thấy hồ sơ")).toBeVisible();
  await page.getByRole("button", { name: "Xóa bộ lọc" }).click();
  await page.getByLabel("Khoa điều trị").selectOption("ED");
  await expect(page.locator("tbody tr")).not.toHaveCount(0);
  await page.getByLabel("Khoa điều trị").selectOption("all");
  await page.getByRole("button", { name: /Cần đánh giá/ }).click();
  await expect(page.locator("tbody tr")).toHaveCount(
    data.encounters.filter((e) =>
      data.predictions.some(
        (p) =>
          p.encounterId === e.id &&
          p.hour === e.currentHour &&
          p.score >= p.threshold,
      ),
    ).length,
  );
  await page.getByRole("button", { name: /Tất cả/ }).click();
  await page.getByRole("button", { name: "Trang sau", exact: true }).click();
  await expect(page.getByText("2 / 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Trang trước", exact: true }).click();
  await page
    .getByRole("button", { name: "Sắp xếp Nguy cơ 6h", exact: true })
    .click();
  await expect(page.locator("th[aria-sort=descending]")).toHaveCount(1);
  const maximum = Math.max(
    ...data.encounters.map(
      (e) =>
        data.predictions.find(
          (p) => p.encounterId === e.id && p.hour === e.currentHour,
        )?.score ?? -1,
    ),
  );
  await expect(
    page.locator("tbody tr").first().locator(".score-value"),
  ).toHaveText(`${(maximum * 100).toFixed(2)}%`);
  await page
    .getByRole("button", { name: "Sắp xếp Nguy cơ 6h", exact: true })
    .click();
  await expect(page.locator("th[aria-sort=ascending]")).toHaveCount(1);
  await page.getByLabel("Tìm mã hồ sơ", { exact: true }).fill("E0009");
  await page.getByRole("link", { name: "E0009", exact: true }).click();
  await expect(page).toHaveURL(/patients\/E0009/);
});

test("exact scores, T0 missing state and as-of replay", async ({ page }) => {
  await page.goto("/sample-cases");
  const select = page.getByLabel("Mốc giờ đang xem");
  for (const hour of [0, 1, 7, 8]) {
    await select.selectOption(String(hour));
    const p = data.predictions.find(
      (p) => p.encounterId === "E0009" && p.hour === hour,
    );
    await expect(page.getByTestId("risk-score")).toHaveText(
      p ? `${(p.score * 100).toFixed(2)}%` : "—",
    );
    await expect(page.getByTestId("risk-threshold")).toHaveText(
      `${(data.models.sepsis.threshold * 100).toFixed(2)}%`,
    );
    if (hour === 0)
      await expect(
        page.getByText("Lần dự báo đầu tiên từ T0+1h.", { exact: false }),
      ).toBeVisible();
  }
  await page
    .getByRole("button", { name: "Mốc tiếp theo", exact: true })
    .click();
  await expect(select).toHaveValue("9");
  await page.getByRole("button", { name: "Mốc trước", exact: true }).click();
  await expect(select).toHaveValue("8");
  await expect(
    page.getByText("Khởi phát tham chiếu:", { exact: false }),
  ).toHaveCount(0);
  await page.getByLabel("Hiện khởi phát tham chiếu", { exact: true }).check();
  await expect(
    page.getByText("Khởi phát tham chiếu:", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Hiện khởi phát tham chiếu", { exact: true }).uncheck();
  await expect(
    page.getByText("Khởi phát tham chiếu:", { exact: false }),
  ).toHaveCount(0);
});

test("review is local and scoped to a prediction revision", async ({
  page,
}) => {
  const e = data.encounters.find((e) => e.id === "E0009")!;
  await page.goto(`/patients/E0009?hour=${e.currentHour}`);
  await page
    .getByRole("button", { name: "Ghi nhận đã xem xét", exact: true })
    .click();
  await expect(page.locator("#reviewer-error")).toHaveText(
    "Nhập tên người xem xét (ít nhất 2 ký tự).",
  );
  await page
    .getByLabel("Người xem xét", { exact: true })
    .fill("Bác sĩ kiểm thử");
  await page
    .getByLabel("Ghi chú (không bắt buộc)", { exact: true })
    .fill("Đối chiếu sinh hiệu tại mốc này.");
  await page
    .getByRole("button", { name: "Ghi nhận đã xem xét", exact: true })
    .click();
  await expect(
    page.getByText("Đã xem xét trong phiên trải nghiệm", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Bảng ca trực", exact: true }).click();
  await expect(
    page
      .getByRole("row")
      .filter({ has: page.getByRole("link", { name: "E0009", exact: true }) }),
  ).toContainText("Đã kích hoạt đánh giá");
  await page.reload();
  await expect(
    page
      .getByRole("row")
      .filter({ has: page.getByRole("link", { name: "E0009", exact: true }) }),
  ).toContainText("Chưa xem xét");
});

test("alert episodes, metrics, expansion and unknown patient", async ({
  page,
}) => {
  await page.goto("/alerts");
  await page.getByRole("button", { name: /Đã xử trí/ }).click();
  await expect(page.getByText("Không có đợt cảnh báo phù hợp")).toBeVisible();
  await page.getByRole("button", { name: /Tất cả/ }).click();
  await expect(page.locator(".alert-card")).not.toHaveCount(0);
  await page.goto("/model-monitoring");
  await expect(
    page.getByText(
      data.models.sepsis.validation_synthetic_metrics.auroc.toFixed(4),
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByText("Mô hình shock · Mở rộng nghiên cứu riêng", { exact: true })
    .click();
  await expect(
    page.getByText(data.models.shock.model_version, { exact: true }),
  ).toBeVisible();
  await page.goto("/patients/unknown");
  await expect(
    page.getByRole("heading", { name: "Không tìm thấy hồ sơ" }),
  ).toBeVisible();
});

for (const width of [1440, 1280, 1024, 768, 390])
  test(`responsive ${width}px: all main screens have no page overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const route of [
      "/dashboard",
      "/patients/E0009?hour=8",
      "/alerts",
      "/sample-cases",
      "/model-monitoring",
    ]) {
      await page.goto(route);
      await expect(page.locator("h1")).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      if (width <= 1150 && route.startsWith("/patients/")) {
        const labs = await page.locator(".labs-panel").boundingBox();
        const review = await page.locator(".review-panel").boundingBox();
        expect(labs!.y).toBeLessThan(review!.y);
      }
    }
    if (width < 900) {
      await page
        .getByRole("button", { name: "Mở điều hướng", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("link", { name: "Bảng ca trực", exact: true })
        .click();
      await expect(page).toHaveURL(/dashboard/);
    }
    expect(errors).toEqual([]);
  });
