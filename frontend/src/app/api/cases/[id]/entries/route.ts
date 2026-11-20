import { z } from "zod";
import { entrySchema,scoreRequestSchema } from "@/lib/manual-schema";
import { clinicalDb,ClinicalError } from "@/lib/server/clinical-db";
import { clinicalRequest,json,readBody } from "@/lib/server/clinical-http";
const bodySchema=z.object({revision:z.number().int().min(0),entry:entrySchema});
export async function PUT(request: Request,context:{params:Promise<{id:string}>}) {
  return clinicalRequest(request,async user=>{
    const {id}=await context.params,{revision,entry}=bodySchema.parse(await readBody(request));
    const c=clinicalDb().getCase(id);
    if(!c)throw new ClinicalError("Không tìm thấy hồ sơ.",404);
    scoreRequestSchema.parse({profile:c.profile,entries:[...c.entries.filter(e=>e.hour!==entry.hour),entry],hours:c.attemptedHours});
    const saved=clinicalDb().saveInput(id,revision,entry,user.id);
    return json(clinicalDb().snapshot(),saved.attemptedHours.length?202:200);
  });
}
