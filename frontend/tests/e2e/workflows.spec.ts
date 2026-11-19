import { test, expect } from "@playwright/test";
test("dashboard is a work queue; registry supports search, filter, sort and keyboard navigation", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Cần xem xét trước", exact: true }),
  ).toBeVisible();
  await expect(page.locator("table")).toHaveCount(0);
  await expect(page.locator(".priority-case")).toHaveCount(3);
  await page.getByRole("link", { name: "Hồ sơ theo dõi", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Danh sách hồ sơ", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Tìm mã hồ sơ", { exact: true }).fill("absent");
  await expect(
    page.getByText("Không tìm thấy hồ sơ", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Xóa bộ lọc", exact: true }).click();
  await page
    .getByLabel("Trạng thái cảnh báo", { exact: true })
    .selectOption("above");
  await expect(page).toHaveURL(/state=above/);
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await page
    .getByLabel("Trạng thái cảnh báo", { exact: true })
    .selectOption("all");
  await page
    .getByRole("button", { name: "Sắp xếp Điểm sepsis", exact: true })
    .click();
  await expect(page.locator("th[aria-sort=descending]")).toHaveCount(1);
  await page.getByLabel("Tìm mã hồ sơ", { exact: true }).fill("E0009");
  const link = page.getByRole("link", { name: "E0009", exact: true });
  await link.focus();
  await link.press("Enter");
  await expect(page).toHaveURL(/patients\/E0009/);
});
test("fixture URL hour and review remain correct across reload and navigation", async ({
  page,
}) => {
  await page.goto("/patients/E0009?hour=7");
  await expect(page.getByTestId("risk-score")).toHaveText("5.20%");
  await page
    .getByLabel("Người xem xét", { exact: true })
    .fill("Bác sĩ kiểm thử");
  await page
    .getByRole("button", { name: "Ghi nhận đã xem xét", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByText("Đã xem xét trong phiên trải nghiệm", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Mốc giờ đang xem").selectOption("8");
  await expect(page).toHaveURL(/hour=8/);
  await expect(page.getByTestId("risk-score")).toHaveText("33.88%");
  await expect(
    page.getByRole("button", { name: "Ghi nhận đã xem xét", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Mốc giờ đang xem").selectOption("7");
  await expect(
    page.getByText("Đã xem xét trong phiên trải nghiệm", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Tổng quan lâm sàng", exact: true })
    .click();
  await expect(page.getByRole("region", { name: "Vừa xem xét" })).toContainText(
    "Bác sĩ kiểm thử",
  );
});
test("manual late results, URL updates, review reload and invalidation use real Python", async ({
  page,
}) => {
  test.setTimeout(150000);
  await page.goto("/patients/new");
  await page
    .getByLabel("Thời điểm T0", { exact: true })
    .fill("2026-11-19T08:00");
  await page
    .getByRole("button", { name: "Tạo hồ sơ và nhập dữ liệu T0", exact: true })
    .click();
  await page.getByLabel("Nhịp tim (lần/phút)", { exact: true }).fill("90");
  await page.getByLabel("Nhịp thở (lần/phút)", { exact: true }).fill("18");
  await page.getByLabel("HA tâm thu (mmHg)", { exact: true }).fill("120");
  await page.getByLabel("CRP (mg/L)", { exact: true }).fill("180");
  await page
    .getByLabel("Giờ xét nghiệm có trên EMR", { exact: true })
    .fill("2026-11-19T10:00");
  await page
    .getByRole("button", { name: "Lưu dữ liệu T0", exact: true })
    .click();
  await expect(
    page.getByText("Xét nghiệm trả sau mốc này:", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Mốc giờ đang xem").selectOption("1");
  await expect(page).toHaveURL(/hour=1/);
  await page
    .getByLabel("Có sinh hiệu mới tại mốc này", { exact: true })
    .uncheck();
  await page
    .getByRole("button", { name: "Lưu dữ liệu và chấm điểm", exact: true })
    .click();
  await expect(page.getByTestId("risk-score")).not.toHaveText("—", {
    timeout: 60000,
  });
  await expect(
    page.getByRole("region", { name: "Kết quả xét nghiệm" }),
  ).not.toContainText("180.00");
  await page
    .getByLabel("Người xem xét", { exact: true })
    .fill("Người xem ca nhập tay");
  await page
    .getByRole("button", { name: "Ghi nhận đã xem xét", exact: true })
    .click();
  await page.reload();
  await expect(page.getByLabel("Mốc giờ đang xem")).toHaveValue("1");
  await expect(
    page.getByText("Đã xem xét trong phiên trải nghiệm", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Mốc giờ đang xem").selectOption("2");
  await expect(
    page.getByRole("region", { name: "Kết quả xét nghiệm" }),
  ).toContainText("180.00");
  await page
    .getByLabel("Có sinh hiệu mới tại mốc này", { exact: true })
    .uncheck();
  await page
    .getByRole("button", { name: "Lưu dữ liệu và chấm điểm", exact: true })
    .click();
  await expect(page.getByTestId("risk-score")).not.toHaveText("—", {
    timeout: 60000,
  });
  await page.getByLabel("Mốc giờ đang xem").selectOption("0");
  await expect(page.getByLabel("Mốc giờ đang xem")).toHaveValue("0");
  await page
    .getByLabel("Giờ sinh hiệu có trên EMR", { exact: true })
    .fill("2026-11-19T09:30");
  await page
    .getByRole("button", { name: "Lưu dữ liệu T0", exact: true })
    .click();
  await expect(
    page.getByText("Đã lưu dữ liệu T0.", { exact: false }),
  ).toBeVisible({ timeout: 60000 });
  await page.getByLabel("Mốc giờ đang xem").selectOption("1");
  await expect(page.getByLabel("Mốc giờ đang xem")).toHaveValue("1");
  await expect(page.getByTestId("risk-score")).toHaveText("—");
  await expect(
    page.getByRole("region", { name: "Sinh hiệu gần nhất" }),
  ).not.toContainText("90");
  await expect(
    page.getByText("Đã xem xét trong phiên trải nghiệm", { exact: true }),
  ).toHaveCount(0);
});
test("API refuses a foreign origin and malformed observations before spawning Python", async ({
  request,
}) => {
  expect(
    (
      await request.post("/api/manual-score", {
        headers: { origin: "https://foreign.example" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect((await request.post("/api/manual-score", { data: {} })).status()).toBe(
    400,
  );
});
for (const width of [1440, 1280, 1024, 768, 390])
  test(`responsive ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const route of [
      "/dashboard",
      "/patients",
      "/patients/E0009?hour=7",
      "/alerts",
      "/sample-cases",
      "/patients/new",
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
    }
    expect(errors).toEqual([]);
  });
