import { z } from "zod";
import { clinicalDb } from "@/lib/server/clinical-db";
import { clinicalRequest,json,readBody } from "@/lib/server/clinical-http";
const schema = z.array(z.object({
  predictionId:z.string().regex(/^[A-Za-z0-9:_-]{1,200}$/),revision:z.number().int().min(1),
  reviewer:z.string().trim().min(2).max(80),note:z.string().max(1000),timestamp:z.string().datetime().refine(s=>Date.parse(s)<=Date.now()),localOnly:z.boolean(),
})).max(500);
export async function POST(request: Request) {
  return clinicalRequest(request,async () => {
    clinicalDb().archiveLegacyReviews(schema.parse(await readBody(request)));
    return json(clinicalDb().snapshot());
  });
}
