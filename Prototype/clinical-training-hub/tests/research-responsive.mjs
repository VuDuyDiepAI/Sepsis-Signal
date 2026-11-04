import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.HUB_TEST_URL || "http://127.0.0.1:8001";
const browser = await chromium.launch({ channel: "msedge", headless: true });
await mkdir("data/ui-previews", { recursive: true });
try {
  for (const width of [320, 390, 430, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/#research`);
    await page
      .locator('input[name="email"]')
      .fill(process.env.HUB_TEST_EMAIL || "staff@demo.local");
    await page
      .locator('input[name="password"]')
      .fill(process.env.HUB_TEST_PASSWORD || "Demo@2026!");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page.locator(".app-sidebar").waitFor({ state: "attached" });
    await page.evaluate(() => {
      location.hash = "research";
    });
    await page.locator(".rs-form").waitFor();
    await page.getByRole("button", { name: "Tra cứu", exact: true }).click();
    await page.locator(".rs-thread .rr-report").waitFor();
    await page
      .locator("#rs-question")
      .fill("Bản nháp vẫn được giữ khi quay lại");
    const references = page.getByRole("button", {
      name: "References",
      exact: true,
    });
    await references.scrollIntoViewIfNeeded();
    // Disable smooth scrolling only in the check to measure the stored position.
    await page.locator(".rs-thread").evaluate((el) => {
      el.style.scrollBehavior = "auto";
    });
    const scrollBefore = await page
      .locator(".rs-thread")
      .evaluate((el) => el.scrollTop);
    await references.click();
    const panel = page.locator(".rs-reference");
    await panel.waitFor();
    if (width <= 760) {
      const box = await panel.boundingBox();
      assert.ok(Math.abs(box.x) < 1 && Math.abs(box.y) < 1);
      assert.ok(
        Math.abs(box.width - width) < 1 && Math.abs(box.height - 844) < 1,
      );
      assert.equal(await page.locator(".rs-form").isVisible(), false);
      assert.ok(
        await page
          .getByRole("button", { name: "Quay lại chat", exact: true })
          .isVisible(),
      );
      await page.screenshot({
        path: `data/ui-previews/references-${width}.png`,
      });
      await page.locator(".rs-paper-open").last().click();
      await page.locator(".pd-title").waitFor();
      assert.ok(await page.locator(".pd-back").isVisible());
      await page.locator(".pd-back").click();
      assert.equal(await page.locator(".rs-paper").count(), 5);
      await page
        .getByRole("button", { name: "Quay lại chat", exact: true })
        .click();
      assert.equal(await panel.count(), 0);
      assert.equal(
        await page.locator("#rs-question").inputValue(),
        "Bản nháp vẫn được giữ khi quay lại",
      );
      const scrollAfter = await page
        .locator(".rs-thread")
        .evaluate((el) => el.scrollTop);
      assert.ok(
        Math.abs(scrollBefore - scrollAfter) < 2,
        "Chat scroll position changed",
      );
      await references.click();
      await page.keyboard.press("Escape");
      assert.equal(await panel.count(), 0);
      assert.ok((await page.locator(".rs-form").boundingBox()).y < 844);
    } else {
      const left = await page.locator(".rs-conversation").boundingBox();
      const right = await panel.boundingBox();
      assert.ok(left.x + left.width <= right.x + 1);
      assert.ok(await page.locator(".rs-form").isVisible());
      assert.equal(
        await page
          .getByRole("button", { name: "Quay lại chat", exact: true })
          .isVisible(),
        false,
      );
      await references.click();
    }
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${width}px: panel navigation, draft/scroll preservation, no overflow or runtime errors`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
