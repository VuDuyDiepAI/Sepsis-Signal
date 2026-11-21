import { defineConfig } from "@playwright/test";
import path from "node:path";
import { existsSync } from "node:fs";
const root=path.resolve("..");
const localPython=path.join(root,".venv",process.platform==="win32"?"Scripts/python.exe":"bin/python");
const python=process.env.SEPSIS_PYTHON??(existsSync(localPython)?localPython:process.platform==="win32"?"python":"python3");
const mode = process.env.SEPSIS_E2E_DEV === "1" ? "development" : "production";
export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  failOnFlakyTests: !!process.env.CI,
  // A diagnostic rerun must never clean the failed production run's evidence.
  outputDir: `./test-results/${mode}`,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: `playwright-report/${mode}` }]]
    : "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    viewport: { width: 1440, height: 1000 },
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  webServer: {
    env: { SEPSIS_DEMO_ACCOUNTS:"1", SEPSIS_TESTING:"1",
      SEPSIS_DATABASE_URL: process.env.SEPSIS_E2E_DATABASE_URL??`sqlite:///${path.resolve("../data/frontend_e2e.sqlite3").replaceAll("\\","/")}` },
    command: `"${python}" "${path.join(root,"scripts/serve_api.py")}" --test --embedded-worker --port 3100`,
    url: "http://127.0.0.1:3100/login",
    reuseExistingServer: false,
    timeout: 90000,
  },
});
