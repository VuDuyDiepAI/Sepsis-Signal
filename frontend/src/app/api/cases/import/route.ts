import { z } from "zod";
import { scoreRequestSchema } from "@/lib/clinical/manual-schema";
import { clinicalDb } from "@/lib/server/clinical-db";
import { clinicalRequest,json,readBody } from "@/lib/server/clinical-http";
import { scoreSavedCase } from "@/lib/server/score-saved-case";
import { manualScoreGate } from "@/lib/server/rate-limit";
const schema = z.object({
  input:scoreRequestSchema,
  predictions:z.array(z.object({id:z.string().max(200),hour:z.number().int().min(1).max(36),revision:z.number().int().min(1),score:z.number().min(0).max(1),threshold:z.number().min(0).max(1),featureHash:z.string().max(200),modelVersion:z.string().max(200)})).max(36),
  reviews:z.array(z.object({predictionId:z.string().max(200),revision:z.number().int().min(1),reviewer:z.string().trim().min(2).max(80),note:z.string().max(1000),timestamp:z.string().datetime()})).max(500),
});
export async function POST(request: Request) {
  return clinicalRequest(request,async () => {
    const v = schema.parse(await readBody(request));
    const c = clinicalDb().importCase(v.input.profile,v.input.entries,v.input.hours,v);
    clinicalDb().archiveLegacyReviews(v.reviews.map(r=>({...r,localOnly:true})));
    const claim = manualScoreGate.claim(request);
    if (!claim.ok) {
      clinicalDb().failScoring(c.profile.id,c.revision,"Đã chuyển dữ liệu lên máy chủ. Vui lòng chấm lại dữ liệu đã lưu.");
      return json(clinicalDb().snapshot(),202);
    }
    try { await scoreSavedCase(clinicalDb(),c); return json(clinicalDb().snapshot()); }
    finally {claim.release();}
  });
}
