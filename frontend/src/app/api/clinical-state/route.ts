import { clinicalDb } from "@/lib/server/clinical-db";
import { clinicalRequest,json } from "@/lib/server/clinical-http";
export async function GET(request: Request) {
  return clinicalRequest(request,() => json(clinicalDb().snapshot()));
}
