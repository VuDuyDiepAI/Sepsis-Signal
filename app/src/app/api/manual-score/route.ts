import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { scoreRequestSchema } from "@/lib/manual-schema";
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host"))
    return Response.json(
      { error: "Nguồn yêu cầu không hợp lệ." },
      { status: 403 },
    );
  if (Number(request.headers.get("content-length") ?? 0) > 100000)
    return Response.json({ error: "Dữ liệu vượt giới hạn." }, { status: 413 });
  let raw: string;
  try {
    raw = await request.text();
    if (raw.length > 100000)
      return Response.json(
        { error: "Dữ liệu vượt giới hạn." },
        { status: 413 },
      );
  } catch {
    return Response.json({ error: "Không đọc được dữ liệu." }, { status: 400 });
  }
  let input;
  try {
    input = scoreRequestSchema.parse(JSON.parse(raw));
  } catch {
    return Response.json(
      {
        error:
          "Kiểm tra tuổi, chỉ số và thời gian nhập. Giờ có kết quả phải sau giờ đo/lấy mẫu, từ T0 trở đi.",
      },
      { status: 400 },
    );
  }
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
  try {
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
    return Response.json(data, {
      status: result.code === 0 ? 200 : 422,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      {
        error:
          "Chưa chạy được bộ chấm Python. Kiểm tra môi trường requirements.txt hoặc biến SEPSIS_PYTHON; dữ liệu trên biểu mẫu vẫn được giữ.",
      },
      { status: 503 },
    );
  }
}
