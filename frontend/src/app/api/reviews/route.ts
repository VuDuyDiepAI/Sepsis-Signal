import { z } from "zod";
import { clinicalDb } from "@/lib/server/clinical-db";
import { clinicalRequest,json,readBody } from "@/lib/server/clinical-http";
const schema = z.object({predictionId:z.string().min(1).max(200),revision:z.number().int().min(1),requestId:z.string().uuid(),note:z.string().trim().max(1000)}).strict();
export async function POST(request: Request) {
  return clinicalRequest(request,async (user) => {
    const v = schema.parse(await readBody(request));
    clinicalDb().recordReview(v.predictionId,v.revision,user.displayName,v.note,v.requestId,user.id);
    return json(clinicalDb().snapshot());
  });
}
