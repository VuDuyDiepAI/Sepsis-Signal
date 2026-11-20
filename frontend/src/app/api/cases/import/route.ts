import { z } from "zod";
import { scoreRequestSchema } from "@/lib/manual-schema";
import { clinicalDb } from "@/lib/server/clinical-db";
import { clinicalRequest,json,readBody } from "@/lib/server/clinical-http";
import { scoreCase } from "@/lib/server/score-case";
import { manualScoreGate } from "@/lib/manual-score-gate";
const schema = z.object({
  input:scoreRequestSchema,
  predictions:z.array(z.object({id:z.string().max(200),hour:z.number().int().min(1).max(36),revision:z.number().int().min(1),score:z.number().min(0).max(1),threshold:z.number().min(0).max(1),featureHash:z.string().max(200),modelVersion:z.string().max(200)})).max(36),
  reviews:z.array(z.object({predictionId:z.string().max(200),revision:z.number().int().min(1),reviewer:z.string().trim().min(2).max(80),note:z.string().max(1000),timestamp:z.string().datetime()})).max(500),
});
export async function POST(request: Request) {
  return clinicalRequest(request,async () => {
    const claim = manualScoreGate.claim(request);
    if (!claim.ok) return json({error:claim.message},claim.status);
    try {
      const v = schema.parse(await readBody(request));
      const response = v.input.hours.length ? await scoreCase(v.input) : {predictions:[],errors:{}};
      const c = clinicalDb().importCase(v.input.profile,v.input.entries,v.input.hours,response,v);
      for (const r of v.reviews) {
        const old = v.predictions.find(p => p.id === r.predictionId && p.revision === r.revision);
        const fresh = c.predictions.find(p => p.revision === Math.max(1,v.input.entries.length) && p.hour === old?.hour && p.featureHash === old.featureHash && p.score === old.score && p.threshold === old.threshold && p.modelVersion === old.modelVersion);
        if (fresh) clinicalDb().recordReview(fresh.id,fresh.revision,r.reviewer,`Chuyển từ phiên cũ (${r.timestamp}). ${r.note}`.slice(0,1000));
      }
      return json(clinicalDb().snapshot());
    } finally { claim.release(); }
  });
}
