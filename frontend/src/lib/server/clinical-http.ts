import { z } from "zod";
import { ManualScoreGate } from "../manual-score-gate";
import { requireUser } from "./auth";
import type { SessionUser } from "../auth-types";
import { ClinicalError } from "./clinical-db";
const scope = globalThis as typeof globalThis & { sepsisStorageGate?: ManualScoreGate };
const gate = scope.sepsisStorageGate ??= new ManualScoreGate({ maxConcurrent:8,maxPerMinute:600 });
export const json = (value: unknown, status = 200) => Response.json(value,{status,headers:{"Cache-Control":"no-store"}});
export async function clinicalRequest(request: Request, execute: (user: SessionUser) => Promise<Response> | Response) {
  const claim = gate.claim(request);
  if (!claim.ok) return json({error:claim.message},claim.status);
  try {
    const user=requireUser(request),displayedActor=request.headers.get("x-sepsis-user");
    if(displayedActor&&displayedActor!==user.id)throw new ClinicalError("Tài khoản đã thay đổi ở tab khác. Tải lại trước khi ghi dữ liệu.");
    return await execute(user);
  }
  catch (error) {
    if (error instanceof ClinicalError) return json({error:error.message},error.status);
    if (error instanceof z.ZodError || error instanceof SyntaxError) return json({error:"Dữ liệu gửi lên không hợp lệ."},400);
    console.error("Clinical storage request failed",error instanceof Error ? error.name : "unknown");
    return json({error:"Không lưu/đọc được dữ liệu trên máy chủ. Vui lòng thử lại; biểu mẫu chưa bị xóa."},503);
  } finally { claim.release(); }
}
export async function readBody(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 200000)
    throw new ClinicalError("Dữ liệu vượt giới hạn.",413);
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  if (reader) while (true) {
    const {done,value} = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 200000) { await reader.cancel(); throw new ClinicalError("Dữ liệu vượt giới hạn.",413); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
