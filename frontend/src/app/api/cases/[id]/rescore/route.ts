import { z } from "zod";
import { clinicalDb,ClinicalError } from "@/lib/server/clinical-db";
import { clinicalRequest,json,readBody } from "@/lib/server/clinical-http";
import { scoreSavedCase } from "@/lib/server/score-saved-case";
import { manualScoreGate } from "@/lib/manual-score-gate";
const schema=z.object({revision:z.number().int().min(0)});
export async function POST(request: Request,context:{params:Promise<{id:string}>}) {
  return clinicalRequest(request,async()=>{
    const {id}=await context.params,v=schema.parse(await readBody(request)),record=clinicalDb().getCase(id);
    if (!record) throw new ClinicalError("Không tìm thấy hồ sơ.",404);
    if (record.revision!==v.revision) throw new ClinicalError("Dữ liệu đã thay đổi. Tải lại hồ sơ trước khi chấm.");
    const claim=manualScoreGate.claim(request);
    if (!claim.ok) return json({error:claim.message},claim.status);
    try {await scoreSavedCase(clinicalDb(),record); return json(clinicalDb().snapshot());}
    finally {claim.release();}
  });
}
