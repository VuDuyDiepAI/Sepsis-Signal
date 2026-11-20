import { z } from "zod";
import { clinicalDb } from "@/lib/server/clinical-db";
import { clinicalRequest,json,readBody } from "@/lib/server/clinical-http";
const schema = z.object({predictionId:z.string().min(1).max(200),revision:z.number().int().min(1),reviewer:z.string().trim().min(2).max(80),note:z.string().trim().max(1000)});
export async function POST(request: Request) {
  return clinicalRequest(request,async () => {
    const v = schema.parse(await readBody(request));
    clinicalDb().recordReview(v.predictionId,v.revision,v.reviewer,v.note);
    return json(clinicalDb().snapshot());
  });
}
