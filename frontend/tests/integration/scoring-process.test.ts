import { afterEach, expect, it, vi } from "vitest";
import golden from "../../../tests/fixtures/sepsis_scoring_golden.json";
import { scoreRequestSchema } from "@/lib/clinical/manual-schema";
import { scoreCase } from "@/lib/server/score-case";

afterEach(() => vi.unstubAllEnvs());

it("reports a Python process that exits without JSON as an unavailable scorer", async () => {
  // An existing but wrong interpreter exits before the bridge can emit JSON.
  // This also covers missing Python dependencies without uninstalling anything.
  vi.stubEnv("SEPSIS_PYTHON", process.execPath);
  await expect(scoreCase(scoreRequestSchema.parse(golden.cases[0].input))).rejects.toMatchObject({
    status: 503,
    message: expect.stringContaining("liên hệ quản trị hệ thống"),
  });
}, 15000);
