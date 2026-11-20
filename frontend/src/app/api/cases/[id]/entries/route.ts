import { z } from "zod";
import { entrySchema,scoreRequestSchema } from "@/lib/manual-schema";
import { clinicalDb,ClinicalError } from "@/lib/server/clinical-db";
import { clinicalRequest,json,readBody } from "@/lib/server/clinical-http";
import { scoreCase } from "@/lib/server/score-case";
import { manualScoreGate } from "@/lib/manual-score-gate";
const bodySchema = z.object({revision:z.number().int().min(0),entry:entrySchema});
export async function PUT(request: Request, context: {params:Promise<{id:string}>}) {
  return clinicalRequest(request,async () => {
    const claim = manualScoreGate.claim(request);
    if (!claim.ok) return json({error:claim.message},claim.status);
    try {
      const { id } = await context.params;
      const { revision,entry } = bodySchema.parse(await readBody(request));
      const c = clinicalDb().getCase(id);
      if (!c) throw new ClinicalError("Không tìm thấy hồ sơ.",404);
      if (revision !== c.revision) throw new ClinicalError("Hồ sơ đã thay đổi ở tab khác. Tải lại trước khi lưu.");
      const input = scoreRequestSchema.parse({profile:c.profile,entries:[...c.entries.filter(e => e.hour !== entry.hour),entry],hours:[...new Set([...c.attemptedHours,...(entry.hour > 0 ? [entry.hour] : [])])]});
      const result = input.hours.length ? await scoreCase(input) : {predictions:[],errors:{}};
      clinicalDb().saveEntry(id,revision,entry,result);
      return json(clinicalDb().snapshot());
    } finally { claim.release(); }
  });
}
