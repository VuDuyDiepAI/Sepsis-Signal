import { expect, type Page, type TestInfo } from "@playwright/test";

/** Observable lifecycle markers, not an inference about React's internal state. */
export function browserDiagnostics(page: Page, info: TestInfo) {
  const started = Date.now();
  let requestedRoute = "initial";
  let phase = "initial";
  const events: Record<string, unknown>[] = [];
  const errors: Record<string, unknown>[] = [];
  const record = (kind: string, details: Record<string, unknown> = {}) => {
    const event = {
      elapsedMs: Date.now() - started,
      requestedRoute,
      url: page.url(),
      viewport: page.viewportSize(),
      phase,
      kind,
      ...details,
    };
    events.push(event);
    return event;
  };
  page.on("pageerror", (error) => {
    errors.push(record("pageerror", { message: error.message, stack: error.stack ?? "" }));
  });
  page.on("console", (message) => {
    if (message.type() === "error" && /hydration|hydrating|server rendered|Minified React error #418/i.test(message.text())) {
      errors.push(record("console-hydration", { message: message.text(), location: message.location() }));
    }
  });
  page.on("domcontentloaded", () => record("domcontentloaded"));
  page.on("load", () => record("load"));
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.startsWith("/api/")) {
      record("api-response", { endpoint: new URL(response.url()).pathname, status: response.status() });
    }
  });
  return {
    async goto(route: string) {
      requestedRoute = route;
      phase = "navigation";
      record("navigation-start");
      // Install before navigation so a fast clinical-state response is not missed.
      const stateReady = page.waitForResponse((response) =>
        new URL(response.url()).pathname === "/api/clinical-state" && response.ok(),
      );
      // A navigation error still propagates; avoid an unhandled pending waiter.
      void stateReady.catch(() => {});
      await page.goto(route);
      phase = "initial-render";
      record("navigation-complete");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      phase = "waiting-for-clinical-state";
      const response = await stateReady;
      await response.finished();
      phase = "after-clinical-state";
      record("clinical-state-body-complete");
      await page.evaluate(() => new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ));
      record("render-checkpoint");
    },
    assertClean() {
      expect(errors, `Browser errors on ${requestedRoute}: ${JSON.stringify(errors)}`).toEqual([]);
    },
    async attach() {
      // Attach even when another assertion failed before the error assertion.
      await info.attach("browser-lifecycle", {
        body: JSON.stringify({ events, errors }, null, 2),
        contentType: "application/json",
      });
      if (errors.length && !page.isClosed()) {
        await info.attach("browser-error-page", {
          body: await page.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
      }
    },
  };
}
