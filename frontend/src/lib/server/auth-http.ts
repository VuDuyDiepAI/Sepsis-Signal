import { ManualScoreGate } from "../manual-score-gate";
import { ClinicalError } from "./clinical-db";
import { json } from "./clinical-http";
import { ZodError } from "zod";
const loginGate=new ManualScoreGate({maxConcurrent:4,maxPerMinute:30});
const sessionGate=new ManualScoreGate({maxConcurrent:8,maxPerMinute:600});
export async function authRequest(request: Request,execute:()=>Promise<Response>|Response) {
  const claim=(new URL(request.url).pathname.endsWith("/login")?loginGate:sessionGate).claim(request);
  if (!claim.ok) return json({error:claim.message},claim.status);
  try { return await execute(); }
  catch(error) {
    if (error instanceof ClinicalError) return json({error:error.message},error.status);
    if (error instanceof ZodError || error instanceof SyntaxError) return json({error:"Thông tin đăng nhập không hợp lệ."},400);
    return json({error:"Chưa kết nối được dịch vụ đăng nhập."},503);
  } finally {claim.release();}
}
