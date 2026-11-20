import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { z } from "zod";
import { scoreRequestSchema } from "@/lib/clinical/manual-schema";
import type { ScoreResponse } from "@/lib/contracts/manual";
import { ClinicalError } from "@/lib/server/clinical-db";
export async function scoreCase(input: z.infer<typeof scoreRequestSchema>): Promise<ScoreResponse> {
  const root = path.resolve(process.cwd(), "..");
  const candidates = [
    process.env.SEPSIS_PYTHON,
    path.join(
      root,
      ".venv",
      process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
    ),
    path.join(
      root,
      "..",
      "sepsis-prototype",
      ".venv",
      process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
    ),
  ].filter((v): v is string => !!v);
  const python =
    candidates.find((p) => existsSync(p)) ??
    (process.platform === "win32" ? "python" : "python3");
  const result = await new Promise<{ code: number | null; output: string }>(
      (resolve, reject) => {
        const child = spawn(
          /*turbopackIgnore: true*/ python,
          [path.join(root, "scripts/score_frontend_case.py")],
          {
            cwd: root,
            windowsHide: true,
            env: { ...process.env, PYTHONIOENCODING: "utf-8" },
            stdio: ["pipe", "pipe", "pipe"],
          },
        );
        let output = "";
        let settled = false;
        const timer = setTimeout(() => {
          child.kill();
          if (!settled) {
            settled = true;
            reject(new Error("timeout"));
          }
        }, 45000);
        child.stdout.on("data", (chunk) => {
          output += chunk.toString();
          if (output.length > 100000) {
            child.kill();
          }
        });
        child.stderr.resume();
        child.on("error", (error) => {
          clearTimeout(timer);
          if (!settled) {
            settled = true;
            reject(error);
          }
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          if (!settled) {
            settled = true;
            resolve({ code, output });
          }
        });
        child.stdin.on("error", () => {});
        child.stdin.end(JSON.stringify(input));
      },
    );
  const data = JSON.parse(result.output);
  if (result.code !== 0) throw new ClinicalError(data.error ?? "Không chấm được dữ liệu. Kiểm tra bộ chấm Python.",422);
  return data;
}
