import { z } from "zod";
import { localTimestamp } from "@/lib/clinical/time";
export const conditions = [
  ["diabetes", "Đái tháo đường"],
  ["cardiovascular_disease", "Tim mạch"],
  ["chronic_kidney_disease", "Thận mạn"],
  ["chronic_liver_disease", "Gan mạn"],
  ["chronic_lung_disease", "Phổi mạn"],
  ["cancer", "Ung thư"],
  ["immunosuppression", "Suy giảm miễn dịch"],
] as const;
export const symptomFields = [
  ["respiratory", "Hô hấp"],
  ["urinary", "Tiết niệu"],
  ["abdominal", "Ổ bụng"],
  ["skin", "Da, mô mềm"],
  ["cns", "Thần kinh trung ương"],
] as const;
const localTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/)
  .refine((s) => Number.isFinite(localTimestamp(s)), "Thời gian không hợp lệ");
const optionalNumber = (min: number, max: number) =>
  z.number().finite().min(min).max(max).nullable();
export const profileSchema = z.object({
  id: z.string().regex(/^HS-[A-F0-9]{8}$/),
  t0: localTime,
  age: z.number().int().min(18).max(120),
  sex: z.enum(["F", "M"]),
  height: optionalNumber(80, 250),
  weight: optionalNumber(20, 400),
  comorbidities: z.record(z.string(), z.boolean()),
});
const vitalsSchema = z.object({
  heart_rate_bpm: z.number().min(20).max(250),
  respiratory_rate_per_min: z.number().min(4).max(70),
  sbp_mmhg: z.number().min(40).max(300),
  dbp_mmhg: optionalNumber(20, 200),
  map_mmhg: optionalNumber(20, 250),
  spo2_pct: optionalNumber(40, 100),
  temperature_c: optionalNumber(25, 45),
  gcs: optionalNumber(3, 15),
});
export const entrySchema = z.object({
  hour: z.number().int().min(0).max(36),
  measuredAt: localTime,
  availableAt: localTime,
  collectedAt: localTime,
  labAvailableAt: localTime,
  department: z.enum(["ED", "WARD", "ICU"]),
  vitals: vitalsSchema.nullable(),
  labs: z.partialRecord(
    z.enum([
      "WBC",
      "platelets",
      "creatinine",
      "bilirubin_total",
      "CRP",
      "procalcitonin",
    ]),
    z.number().finite().min(0).max(100000),
  ),
  symptoms: z.record(z.string(), z.boolean()).nullable(),
});
export const scoreRequestSchema = z
  .object({
    profile: profileSchema,
    entries: z.array(entrySchema).max(37),
    hours: z.array(z.number().int().min(0).max(36)).max(37),
  })
  .superRefine((v, ctx) => {
    for (const e of v.entries) {
      const t0 = localTimestamp(v.profile.t0),
        at = t0 + e.hour * 3600000;
      if (
        localTimestamp(e.measuredAt) < t0 ||
        localTimestamp(e.measuredAt) > at ||
        localTimestamp(e.collectedAt) < t0 ||
        localTimestamp(e.collectedAt) > at ||
        localTimestamp(e.availableAt) < localTimestamp(e.measuredAt) ||
        localTimestamp(e.labAvailableAt) < localTimestamp(e.collectedAt)
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Giờ đo/lấy mẫu phải từ T0 đến mốc đang nhập; giờ có dữ liệu không được trước giờ đo/lấy mẫu.",
        });
    }
    if (new Set(v.entries.map((e) => e.hour)).size !== v.entries.length)
      ctx.addIssue({ code: "custom", message: "Trùng mốc giờ nhập." });
  });
export type ManualProfile = z.infer<typeof profileSchema>;
export type ManualEntry = z.infer<typeof entrySchema>;
