import { scoreCase } from "@/lib/server/score-case";
import { ClinicalError } from "@/lib/server/clinical-db";
import { scoreRequestSchema } from "@/lib/manual-schema";
import { manualScoreGate } from "@/lib/manual-score-gate";
export async function POST(request: Request) {
  const claim = manualScoreGate.claim(request);
  if (!claim.ok)
    return Response.json(
      { error: claim.message },
      {
        status: claim.status,
        headers: claim.retryAfter
          ? { "Retry-After": String(claim.retryAfter) }
          : undefined,
      },
    );
  try {
    return await execute(request);
  } finally {
    claim.release();
  }
}
async function execute(request: Request) {
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
  try {
    return Response.json(await scoreCase(input), {headers:{"Cache-Control":"no-store"}});
  } catch (error) {
    if (error instanceof ClinicalError) return Response.json({error:error.message},{status:error.status});
    return Response.json({error:"Chưa chạy được bộ chấm Python. Kiểm tra SEPSIS_PYTHON; dữ liệu trên biểu mẫu vẫn được giữ."},{status:503});
  }
}
