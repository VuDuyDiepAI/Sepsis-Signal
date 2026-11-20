import { test, expect, type Page } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { existsSync } from "node:fs";
const testDb = path.resolve("../data/frontend_e2e.sqlite3");
test.beforeEach(async ({request}) => {
  expect((await request.get("/api/clinical-state")).ok()).toBe(true);
  if (!existsSync(testDb)) return;
  const db = new DatabaseSync(testDb);
  try {
    db.exec(`PRAGMA busy_timeout=5000; BEGIN IMMEDIATE;
      DELETE FROM reviews; DELETE FROM legacy_reviews; DELETE FROM manual_entries; DELETE FROM entry_history;
      DELETE FROM legacy_imports; DELETE FROM predictions WHERE source='manual'; DELETE FROM manual_cases; COMMIT;`);
  } finally {db.close();}
});
import data from "../../src/data/clinical-demo.json" with { type: "json" };
async function openAssessment(page: Page) {
  const summary = page.getByRole("tab", { name: "Tổng hợp", exact: true });
  if (await summary.count()) await summary.click();
}
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
  await page
    .getByLabel("Tìm mã hồ sơ", { exact: true })
    .filter({ visible: true })
    .fill("absent");
  await expect(
    page.getByText("Không tìm thấy hồ sơ", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Xóa bộ lọc", exact: true }).click();
  await page
    .getByLabel("Trạng thái cảnh báo", { exact: true })
    .filter({ visible: true })
    .selectOption("above");
  await expect(page).toHaveURL(/state=above/);
  await expect(registry.locator("tbody tr")).toHaveCount(4);
  await page
    .getByLabel("Trạng thái cảnh báo", { exact: true })
    .filter({ visible: true })
    .selectOption("all");
  await page
    .getByRole("button", { name: "Sắp xếp Điểm sepsis", exact: true })
    .click();
  await expect(registry.locator("th[aria-sort=descending]")).toHaveCount(1);
  await page
    .getByLabel("Tìm mã hồ sơ", { exact: true })
    .filter({ visible: true })
    .fill("E0009");
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
  await expect(page.getByTestId("risk-score")).toHaveText("73.07%");
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe(initial);
  await openAssessment(page);
  await page
    .getByLabel("Người xem xét", { exact: true })
    .filter({ visible: true })
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
    .selectOption("12");
  await expect(page.getByTestId("risk-score")).toHaveText("76.02%");
  await openAssessment(page);
  await expect(
    page.getByRole("button", { name: "Ghi nhận đã xem xét", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Mốc giờ đang xem", exact: true })
    .selectOption("11");
  await expect(
    page.getByRole("combobox", { name: "Mốc giờ đang xem", exact: true }),
  ).toHaveValue("11");
  await page.reload();
  await openAssessment(page);
  await expect(
    page.getByText("Đã ghi nhận xem xét", { exact: true }),
  ).toBeVisible();
  const secondTab = await page.context().newPage();
  await secondTab.goto(page.url());
  await openAssessment(secondTab);
  await expect(secondTab.getByText("Đã ghi nhận xem xét",{exact:true})).toBeVisible();
  await secondTab.close();
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
    page
      .getByLabel("Tìm mã hồ sơ cảnh báo", { exact: true })
      .filter({ visible: true }),
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
  const id="HS-DEAD0001", t0="2026-11-20T08:00";
  const predictions=[1,2,3].map(hour=>({
    id:`${id}:${hour}:1`,encounterId:id,hour,timestamp:`2026-11-20T${String(8+hour).padStart(2,"0")}:00:00+07:00`,
    score:0.8,threshold:data.models.sepsis.threshold,revision:1,modelVersion:data.models.sepsis.model_version,
    department:"ED",availableFeatures:20,featureHash:`hash-${hour}`,
  }));
  await page.route("**/api/clinical-state",route=>route.fulfill({json:{
    cases:[{profile:{id,t0,age:55,sex:"F",height:null,weight:null,comorbidities:{}},entries:[],predictions,attemptedHours:[1,2],revision:1,currentHour:2,errors:{}}],
    reviews:{[predictions[0].id]:{predictionId:predictions[0].id,revision:1,reviewer:"History reviewer",timestamp:new Date().toISOString(),note:"",localOnly:false}},
  }}));
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
    .filter({ visible: true })
    .fill("2026-11-19T08:00");
  await page
    .getByRole("button", { name: "Tạo hồ sơ và nhập dữ liệu T0", exact: true })
    .click();
  await page
    .getByLabel("Nhịp tim (lần/phút)", { exact: true })
    .filter({ visible: true })
    .fill("90");
  await page
    .getByLabel("Nhịp thở (lần/phút)", { exact: true })
    .filter({ visible: true })
    .fill("18");
  await page
    .getByLabel("HA tâm thu (mmHg)", { exact: true })
    .filter({ visible: true })
    .fill("120");
  await page.getByRole("button", { name: "Xét nghiệm", exact: true }).click();
  await page
    .getByLabel("CRP (mg/L)", { exact: true })
    .filter({ visible: true })
    .fill("180");
  await page
    .getByLabel("Giờ xét nghiệm có trên EMR", { exact: true })
    .filter({ visible: true })
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
    .filter({ visible: true })
    .uncheck();
  await page
    .getByRole("button", { name: "Lưu dữ liệu và chấm điểm", exact: true })
    .click();
  await expect(page.getByTestId("risk-score")).not.toHaveText("—", {
    timeout: 60000,
  });
  await openAssessment(page);
  await expect(
    page.getByRole("region", { name: "Kết quả xét nghiệm" }),
  ).not.toContainText("180.00");
  await openAssessment(page);
  await page
    .getByLabel("Người xem xét", { exact: true })
    .filter({ visible: true })
    .fill("Người xem ca nhập tay");
  await page
    .getByRole("button", { name: "Ghi nhận đã xem xét", exact: true })
    .click();
  await page.reload();
  await openAssessment(page);
  await expect(
    page.getByRole("combobox", { name: "Mốc giờ đang xem", exact: true }),
  ).toHaveValue("1");
  await expect(
    page.getByText("Đã ghi nhận xem xét", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Mốc giờ đang xem", exact: true })
    .selectOption("2");
  await openAssessment(page);
  await expect(
    page.getByRole("region", { name: "Kết quả xét nghiệm" }),
  ).toContainText("180.00");
  await page.getByRole("tab", { name: "Nhập chỉ số", exact: true }).click();
  await page
    .getByLabel("Có sinh hiệu mới tại mốc này", { exact: true })
    .filter({ visible: true })
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
    .getByText("Chỉnh giờ đo và giờ có trên EMR", { exact: true })
    .click();
  await page
    .getByLabel("Giờ sinh hiệu có trên EMR", { exact: true })
    .filter({ visible: true })
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
  await page.getByRole("tab", { name: "Tổng hợp", exact: true }).click();
  await expect(page.getByTestId("risk-score")).toHaveText("—");
  await expect(
    page.getByRole("region", { name: "Sinh hiệu gần nhất" }),
  ).not.toContainText("90");
  await expect(
    page.getByText("Đã ghi nhận xem xét", { exact: true }),
  ).toHaveCount(0);
  await page.getByText("Lịch sử xem xét các phiên bản trước",{exact:true}).click();
  await expect(page.getByRole("region",{name:"Ghi nhận xem xét",exact:true})).toContainText("Người xem ca nhập tay");
});

test("a failed review save shows an error and does not claim success",async ({page}) => {
  await page.goto("/patients/E0009?hour=11");
  await openAssessment(page);
  await page.getByLabel("Người xem xét",{exact:true}).filter({visible:true}).fill("Bác sĩ thử lỗi");
  await page.route("**/api/reviews",route=>route.fulfill({status:503,json:{error:"Máy chủ chưa lưu được"}}));
  await page.getByRole("button",{name:"Ghi nhận đã xem xét",exact:true}).click();
  await expect(page.getByRole("alert").filter({hasText:"Máy chủ chưa lưu được"})).toBeVisible();
  await expect(page.getByText("Đã ghi nhận xem xét",{exact:true})).toHaveCount(0);
});

test("old tab cases migrate to SQLite and reopen in a new browser context",async ({page,browser}) => {
  await page.goto("/dashboard");
  await page.evaluate(() => sessionStorage.setItem("sepsis-manual-cases-v1",JSON.stringify([{
    profile:{id:"HS-AABB0011",t0:"2026-11-20T08:00",age:60,sex:"M",height:null,weight:null,comorbidities:{}},
    entries:[],predictions:[],attemptedHours:[],revision:0,currentHour:0,errors:{},
  }])));
  await page.reload();
  await page.getByRole("button",{name:"Chuyển dữ liệu lên máy chủ",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("Đã chuyển hồ sơ lên máy chủ");
  expect(await page.evaluate(()=>sessionStorage.getItem("sepsis-manual-cases-v1"))).toBeNull();
  const context=await browser.newContext();
  try {
    const other=await context.newPage();
    await other.goto("http://127.0.0.1:3100/patients/HS-AABB0011?hour=0");
    await expect(other.getByRole("heading",{name:"HS-AABB0011",exact:true})).toBeVisible();
  } finally {await context.close();}
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
  for (const endpoint of ["/api/cases","/api/reviews","/api/cases/import","/api/reviews/import"])
    expect((await request.post(endpoint,{headers:{origin:"https://foreign.example"},data:{}})).status()).toBe(403);
  expect((await request.get("/api/clinical-state",{headers:{origin:"https://foreign.example"}})).status()).toBe(403);
  expect((await request.post("/api/reviews",{data:{predictionId:"invented",revision:1,reviewer:"Bác sĩ A",note:""}})).status()).toBe(409);
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
      "/model-monitoring",
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
        if (mainData) {
          const content = page
            .locator(mainData)
            .filter({ visible: true })
            .first();
          await expect(content).toBeVisible();
          expect((await content.boundingBox())!.y).toBeLessThan(400);
        }
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

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1705, height: 934 },
])
  test(`desktop viewport ${viewport.width}x${viewport.height} keeps tools visible and every section reachable`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    for (const route of [
      "/dashboard",
      "/patients",
      "/patients/E0009?hour=7",
      "/sample-cases",
      "/model-monitoring",
      "/patients/new",
    ]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(() => ({
            documentFits:
              document.documentElement.scrollHeight <= innerHeight + 1,
            mainFits:
              document.querySelector("main")!.scrollHeight <=
              document.querySelector("main")!.clientHeight + 1,
          })),
        )
        .toEqual({ documentFits: true, mainFits: true });
      if (route === "/patients/E0009?hour=7") {
        for (const name of [
          "Trạng thái nguy cơ",
          "Diễn biến nguy cơ",
          "Sinh hiệu gần nhất",
          "Kết quả xét nghiệm",
          "Ghi nhận xem xét",
        ]) {
          const panel = page.getByRole("region", { name, exact: true });
          await expect(panel).toBeVisible();
          const box = await panel.boundingBox();
          expect(box!.y).toBeGreaterThanOrEqual(0);
          expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
          expect(
            await panel.evaluate(
              (el) => el.scrollHeight <= el.clientHeight + 1,
            ),
          ).toBe(true);
        }
        await expect(
          page.getByRole("tab", { name: "Xét nghiệm", exact: true }),
        ).toHaveCount(0);
        await expect(
          page.getByRole("region", { name: "Sinh hiệu gần nhất", exact: true }),
        ).toBeVisible();
      }
      if (route === "/model-monitoring") {
        await page
          .getByRole("tab", { name: "Thông tin & nguồn", exact: true })
          .click();
        await expect(
          page.getByRole("region", {
            name: "Nguồn dữ liệu và hợp đồng đặc trưng",
            exact: true,
          }),
        ).toBeVisible();
        await page
          .getByRole("tab", { name: "Hiệu năng sepsis", exact: true })
          .click();
        await page
          .getByRole("combobox", { name: "Nhóm chỉ số đánh giá" })
          .selectOption("hours");
        await expect(
          page.getByRole("cell", {
            name: "Precision theo mốc giờ",
            exact: true,
          }),
        ).toBeVisible();
      }
    }
    await page.goto("/patients");
    const registry = page.getByRole("region", {
      name: "Bảng hồ sơ có thể cuộn ngang",
      exact: true,
    });
    await expect(
      page.getByRole("button", { name: "Trang sau", exact: true }),
    ).toBeEnabled();
    const first = await registry
      .locator("tbody .encounter-id")
      .allTextContents();
    await page.getByRole("button", { name: "Trang sau", exact: true }).click();
    await expect(
      registry.locator("tbody .encounter-id").first(),
    ).not.toHaveText(first[0].trim());
    const second = await registry
      .locator("tbody .encounter-id")
      .allTextContents();
    expect(new Set([...first, ...second].map((s) => s.trim())).size).toBe(9);
    await page.goto("/dashboard");
    const next = page.getByRole("button", {
      name: "Trang cảnh báo sau",
      exact: true,
    });
    if (await next.isEnabled()) {
      const queue = page.getByRole("region", {
        name: "Bảng theo dõi và cảnh báo",
        exact: true,
      });
      const old = await queue
        .locator("tbody .encounter-id")
        .first()
        .innerText();
      await next.click();
      await expect(queue.locator("tbody .encounter-id").first()).not.toHaveText(
        old,
      );
      await expect(page).toHaveURL(/page=2/);
    }
  });

test("evaluation separates patient/episode decisions from hourly metrics and shows calibration", async ({
  page,
}) => {
  await page.goto("/model-monitoring");
  const panel = page.getByRole("region", {
    name: "Mô hình sepsis",
    exact: true,
  });
  await expect(
    panel.getByRole("cell", { name: "PPV theo đợt cảnh báo", exact: true }),
  ).toBeVisible();
  await expect(panel).toContainText("71.43%");
  await expect(panel).toContainText("76.92%");
  await expect(panel).toContainText("10/12 người bệnh sepsis");
  await expect(panel).toContainText("KTC 95%");
  await expect(
    panel.getByRole("cell", { name: "Precision theo mốc giờ", exact: true }),
  ).toHaveCount(0);
  await panel
    .getByRole("combobox", { name: "Nhóm chỉ số đánh giá" })
    .selectOption("hours");
  await expect(
    panel.getByRole("cell", { name: "Precision theo mốc giờ", exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("cell", { name: "Độ đặc hiệu theo mốc giờ", exact: true }),
  ).toBeVisible();
  await panel
    .getByRole("combobox", { name: "Nhóm chỉ số đánh giá" })
    .selectOption("discrimination");
  await expect(
    panel.getByRole("img", { name: /Biểu đồ hiệu chỉnh/ }),
  ).toBeVisible();
  await expect(
    panel.getByRole("cell", {
      name: "Calibration slope (lý tưởng 1)",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Mở rộng shock", exact: true }).click();
  const shock = page.getByRole("region", {
    name: "Mô hình shock · Nghiên cứu mở rộng",
    exact: true,
  });
  const ppvRow = shock.getByRole("row").filter({
    has: page.getByRole("cell", {
      name: "PPV theo đợt cảnh báo",
      exact: true,
    }),
  });
  await expect(ppvRow.getByRole("cell").last()).toContainText("Chưa ước lượng");
});
