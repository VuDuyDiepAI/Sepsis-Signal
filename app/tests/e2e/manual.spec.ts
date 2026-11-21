import { test, expect } from "@playwright/test";
test("manual creation form fits desktop, tablet and mobile", async ({
  page,
}) => {
  for (const width of [1440, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/patients/new");
    await expect(
      page.getByRole("heading", { name: "Tạo ca mới", exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
  }
});
test("create manual case, T0 entry, real Python scoring and stale-result removal", async ({
  page,
}) => {
  test.setTimeout(150000);
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Tạo ca mới", exact: true }).click();
  await page
    .getByLabel("Thời điểm T0", { exact: true })
    .fill("2026-11-19T08:00");
  await page.getByLabel("Chiều cao (cm)", { exact: true }).fill("170");
  await page.getByLabel("Cân nặng (kg)", { exact: true }).fill("70");
  await page
    .getByRole("button", { name: "Tạo hồ sơ và nhập dữ liệu T0", exact: true })
    .click();
  await expect(page).toHaveURL(/patients\/HS-/);
  const id = page.url().split("/patients/")[1].split("?")[0];
  await page.getByLabel("Nhịp tim (lần/phút)", { exact: true }).fill("90");
  await page.getByLabel("Nhịp thở (lần/phút)", { exact: true }).fill("18");
  await page.getByLabel("HA tâm thu (mmHg)", { exact: true }).fill("120");
  await page
    .getByRole("button", { name: "Lưu dữ liệu T0", exact: true })
    .click();
  await expect(
    page.getByText("Đã lưu dữ liệu T0.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByTestId("risk-score")).toHaveText("—");
  await page.getByLabel("Mốc giờ đang xem").selectOption("1");
  await page
    .getByLabel("Có sinh hiệu mới tại mốc này", { exact: true })
    .uncheck();
  await page
    .getByRole("button", { name: "Lưu dữ liệu và chấm điểm", exact: true })
    .click();
  await expect(
    page.getByText("Đã lưu dữ liệu và cập nhật kết quả.", { exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId("risk-score")).toHaveText(/\d+\.\d+%/);
  await page.getByLabel("Mốc giờ đang xem").selectOption("2");
  await page.getByLabel("Nhịp tim (lần/phút)", { exact: true }).fill("130");
  await page.getByLabel("Nhịp thở (lần/phút)", { exact: true }).fill("30");
  await page.getByLabel("HA tâm thu (mmHg)", { exact: true }).fill("88");
  await page.getByLabel("Nhiệt độ (°C)", { exact: true }).fill("39");
  await page.getByLabel("CRP (mg/L)", { exact: true }).fill("180");
  await page
    .getByRole("button", { name: "Lưu dữ liệu và chấm điểm", exact: true })
    .click();
  await expect(
    page.getByText("Đã lưu dữ liệu và cập nhật kết quả.", { exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await page.reload();
  await page.getByLabel("Mốc giờ đang xem").selectOption("2");
  await expect(page.getByTestId("risk-score")).not.toHaveText("—");
  await page
    .getByRole("link", { name: "Tổng quan lâm sàng", exact: true })
    .click();
  await page.getByLabel("Tìm mã hồ sơ", { exact: true }).fill(id);
  await expect(page.getByRole("link", { name: id, exact: true })).toBeVisible();
  await page.getByRole("link", { name: id, exact: true }).click();
  await page.getByLabel("Mốc giờ đang xem").selectOption("0");
  await page
    .getByLabel("Có sinh hiệu mới tại mốc này", { exact: true })
    .uncheck();
  await page
    .getByRole("button", { name: "Lưu dữ liệu T0", exact: true })
    .click();
  await expect(
    page.getByText("Đã lưu dữ liệu T0.", { exact: false }),
  ).toBeVisible({ timeout: 60000 });
  await page.getByLabel("Mốc giờ đang xem").selectOption("1");
  await expect(page.getByTestId("risk-score")).toHaveText("—");
  await expect(
    page.getByText("Chưa có sinh hiệu hợp lệ từ T0", { exact: false }),
  ).toBeVisible();
});
