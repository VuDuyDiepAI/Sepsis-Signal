import { test, expect } from "@playwright/test";
test("one monitoring queue and a separate searchable patient registry", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Theo dõi & Cảnh báo", exact: true }),
  ).toBeVisible();
  const queue = page.getByRole("region", {
    name: "Bảng theo dõi và cảnh báo",
    exact: true,
  });
  await expect(queue.locator("tbody tr")).toHaveCount(4);
  await expect(
    page
      .getByRole("navigation", { name: "Điều hướng chính" })
      .getByRole("link"),
  ).toHaveCount(4);
  await expect(
    page.getByRole("link", { name: "Trung tâm cảnh báo", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Vừa xem xét", exact: true }),
  ).toHaveCount(0);
  await expect(
    queue.getByRole("columnheader", {
      name: "Dữ liệu vừa thay đổi",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Hồ sơ theo dõi", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Danh sách hồ sơ", exact: true }),
  ).toBeVisible();
  const registry = page.getByRole("region", {
    name: "Bảng hồ sơ có thể cuộn ngang",
    exact: true,
  });
  await page.getByLabel("Tìm mã hồ sơ", { exact: true }).fill("absent");
  await expect(
    page.getByText("Không tìm thấy hồ sơ", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Xóa bộ lọc", exact: true }).click();
  await page
    .getByLabel("Trạng thái cảnh báo", { exact: true })
    .selectOption("above");
  await expect(page).toHaveURL(/state=above/);
  await expect(registry.locator("tbody tr")).toHaveCount(4);
  await page
    .getByLabel("Trạng thái cảnh báo", { exact: true })
    .selectOption("all");
  await page
    .getByRole("button", { name: "Sắp xếp Điểm sepsis", exact: true })
    .click();
  await expect(registry.locator("th[aria-sort=descending]")).toHaveCount(1);
  await page.getByLabel("Tìm mã hồ sơ", { exact: true }).fill("E0009");
  const link = registry.getByRole("link", { name: "E0009", exact: true });
  await link.focus();
  await link.press("Enter");
  await expect(page).toHaveURL(/patients\/E0009/);
});
test("review returns to the same queue filters; changing hour does not inherit review", async ({
  page,
}) => {
  const initial = "/dashboard?search=E0009&department=WARD";
  await page.goto(initial);
  const queue = page.getByRole("region", {
    name: "Bảng theo dõi và cảnh báo",
    exact: true,
  });
  await expect(queue.locator("tbody tr")).toHaveCount(1);
  await queue.getByRole("link", { name: "E0009", exact: true }).click();
  await expect(page.getByTestId("risk-score")).toHaveText("5.20%");
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe(initial);
  await page
    .getByLabel("Người xem xét", { exact: true })
    .fill("Bác sĩ kiểm thử");
  await page
    .getByRole("button", { name: "Ghi nhận đã xem xét", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Quay về danh sách", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp("dashboard\\?search=E0009&department=WARD$"),
  );
  await expect(
    page.getByText("Không có cảnh báo phù hợp", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Trạng thái xem xét", exact: true })
    .selectOption("reviewed");
  await expect(queue.locator("tbody tr")).toHaveCount(1);
  await expect(queue).toContainText("Bác sĩ kiểm thử");
  await queue.getByRole("link", { name: "E0009", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Mốc giờ đang xem", exact: true })
    .selectOption("8");
  await expect(page.getByTestId("risk-score")).toHaveText("33.88%");
  await expect(
    page.getByRole("button", { name: "Ghi nhận đã xem xét", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Mốc giờ đang xem", exact: true })
    .selectOption("7");
  await expect(
    page.getByRole("combobox", { name: "Mốc giờ đang xem", exact: true }),
  ).toHaveValue("7");
  await page.reload();
  await expect(
    page.getByText("Đã xem xét trong phiên trải nghiệm", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByText("Đã xem xét không có nghĩa đã hoàn tất xử trí.", {
        exact: false,
      })
      .first(),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Về theo dõi & cảnh báo", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Trạng thái xem xét", exact: true }),
  ).toHaveValue("reviewed");
  await expect(
    page.getByLabel("Tìm mã hồ sơ cảnh báo", { exact: true }),
  ).toHaveValue("E0009");
  await page.getByRole("button", { name: "Lịch sử", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Trạng thái xem xét", exact: true }),
  ).toHaveValue("reviewed");
  await expect(
    page.getByText("Không có cảnh báo phù hợp", { exact: true }),
  ).toBeVisible();
});
test("current/history and review status remain independent, including the legacy URL", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await page.evaluate(() => {
    const id = "HS-DEAD0001",
      t0 = "2026-11-20T08:00",
      modelVersion = "test";
    const predictions = [1, 2, 3].map((hour) => ({
      id: `${id}:${hour}:1`,
      encounterId: id,
      hour,
      timestamp: `2026-11-20T${String(8 + hour).padStart(2, "0")}:00:00+07:00`,
      score: 0.8,
      threshold: 0.1,
      revision: 1,
      modelVersion,
      department: "ED",
      availableFeatures: 20,
      featureHash: `hash-${hour}`,
    }));
    sessionStorage.setItem(
      "sepsis-manual-cases-v1",
      JSON.stringify([
        {
          profile: {
            id,
            t0,
            age: 55,
            sex: "F",
            height: null,
            weight: null,
            comorbidities: {},
          },
          entries: [],
          predictions,
          attemptedHours: [1, 2],
          revision: 1,
          currentHour: 2,
          errors: {},
        },
      ]),
    );
    sessionStorage.setItem(
      "sepsis-reviews-v1",
      JSON.stringify({
        [predictions[0].id]: {
          predictionId: predictions[0].id,
          revision: 1,
          reviewer: "History reviewer",
          timestamp: new Date().toISOString(),
          note: "",
          localOnly: true,
        },
      }),
    );
  });
  await page.goto("/alerts?search=HS-DEAD0001&review=all");
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/dashboard" &&
      url.searchParams.get("search") === "HS-DEAD0001" &&
      url.searchParams.get("review") === "all",
  );
  const queue = page.getByRole("region", {
    name: "Bảng theo dõi và cảnh báo",
    exact: true,
  });
  await expect(queue.locator("tbody tr")).toHaveCount(1);
  await expect(queue).toContainText("T0+2h");
  await expect(queue).not.toContainText("T0+3h");
  await page.getByRole("button", { name: "Lịch sử", exact: true }).click();
  await expect(queue.locator("tbody tr")).toHaveCount(1);
  await expect(queue).toContainText("T0+1h");
  await page
    .getByRole("combobox", { name: "Trạng thái xem xét", exact: true })
    .selectOption("pending");
  await expect(
    page.getByText("Không có cảnh báo phù hợp", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Trạng thái xem xét", exact: true })
    .selectOption("reviewed");
  await expect(queue).toContainText("History reviewer");
  await page.getByRole("button", { name: "Hiện tại", exact: true }).click();
  await expect(
    page.getByText("Không có cảnh báo phù hợp", { exact: true }),
  ).toBeVisible();
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
  await page
    .getByRole("combobox", { name: "Mốc giờ đang xem", exact: true })
    .selectOption("1");
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
  await expect(
    page.getByRole("combobox", { name: "Mốc giờ đang xem", exact: true }),
  ).toHaveValue("1");
  await expect(
    page.getByText("Đã xem xét trong phiên trải nghiệm", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Mốc giờ đang xem", exact: true })
    .selectOption("2");
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
  await page
    .getByRole("combobox", { name: "Mốc giờ đang xem", exact: true })
    .selectOption("0");
  await expect(
    page.getByRole("combobox", { name: "Mốc giờ đang xem", exact: true }),
  ).toHaveValue("0");
  await page
    .getByLabel("Giờ sinh hiệu có trên EMR", { exact: true })
    .fill("2026-11-19T09:30");
  await page
    .getByRole("button", { name: "Lưu dữ liệu T0", exact: true })
    .click();
  await expect(
    page.getByText("Đã lưu dữ liệu T0.", { exact: false }),
  ).toBeVisible({ timeout: 60000 });
  await page
    .getByRole("combobox", { name: "Mốc giờ đang xem", exact: true })
    .selectOption("1");
  await expect(
    page.getByRole("combobox", { name: "Mốc giờ đang xem", exact: true }),
  ).toHaveValue("1");
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
      "/dashboard?scope=history&review=all",
      "/sample-cases",
      "/patients/new",
    ]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      if (route.startsWith("/patients/E0009")) {
        await expect(
          page.getByRole("heading", {
            name: "Mô hình đang sử dụng",
            exact: true,
          }),
        ).toHaveCount(0);
      }
      if (route.startsWith("/dashboard")) {
        await expect(page.locator(".stats-grid")).toHaveCount(0);
      }
      if (width === 1440) {
        const mainData =
          route === "/dashboard"
            ? "table"
            : route === "/patients" || route === "/alerts"
              ? "table"
              : route.startsWith("/patients/E0009")
                ? ".risk-panel"
                : null;
        if (mainData)
          expect(
            (await page.locator(mainData).first().boundingBox())!.y,
          ).toBeLessThan(400);
      }
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
