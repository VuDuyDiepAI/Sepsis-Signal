import { profileSchema } from "@/lib/clinical/manual-schema";
import { clinicalDb } from "@/lib/server/clinical-db";
import { clinicalRequest,json,readBody } from "@/lib/server/clinical-http";
export async function POST(request: Request) {
  return clinicalRequest(request,async () => {
    clinicalDb().create(profileSchema.parse(await readBody(request)));
    return json(clinicalDb().snapshot(),201);
  });
}
