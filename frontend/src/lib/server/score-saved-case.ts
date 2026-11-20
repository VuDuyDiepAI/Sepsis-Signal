import { scoreRequestSchema } from "../manual-schema";
import type { ManualCase,ScoreResponse } from "../manual-types";
import { ClinicalDatabase } from "./clinical-db";
import { scoreCase } from "./score-case";
type Runner=(input: Parameters<typeof scoreCase>[0])=>Promise<ScoreResponse>;
/** Inputs have already committed. Python failure cannot roll them back or revive stale scores. */
export async function scoreSavedCase(db: ClinicalDatabase,record: ManualCase,runner: Runner=scoreCase) {
  const attempt=db.startScoring(record.profile.id,record.revision);
  if (!attempt) return;
  try {
    const input=scoreRequestSchema.parse({profile:record.profile,entries:record.entries,hours:record.attemptedHours});
    const result=input.hours.length?await runner(input):{predictions:[],errors:{}};
    db.finishScoring(record.profile.id,record.revision,result,attempt);
  } catch {
    db.failScoring(record.profile.id,record.revision,"Đã lưu dữ liệu nhưng chưa chấm được. Vui lòng chấm lại dữ liệu đã lưu.",attempt);
  }
}
