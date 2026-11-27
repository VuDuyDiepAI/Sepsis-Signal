import { describe, it, expect, afterEach, vi } from "vitest";
import {
  contributorsFor,
  createClinicalReader,
  dataset,
  reviewFor,
  summaryOf,
  timeAt,
} from "@/lib/clinical/data";
import { localTimestamp, predictionHour } from "@/lib/clinical/time";
import { scoreRequestSchema } from "@/lib/clinical/manual-schema";
import { decodeReviews } from "@/lib/client/review-store";
import { mergeManualCases, type ManualCase } from "@/lib/client/manual-store";
import { describeScoringOutcome } from "@/features/patients/manual-case-screen";
import {
  ALERT_ROUTING,
  ALERT_SOP_STEPS,
  assessClinicalValue,
  composeReviewNote,
  computeClinicalScores,
  estimateMap,
  formatScoreCue,
} from "@/lib/clinical/scores";
import type {
  LaboratoryResult,
  Review,
  VitalObservation,
} from "@/lib/contracts/clinical";
const profile = {
  id: "HS-ABCDEF12",
  t0: "2026-11-19T08:00",
  age: 55,
  sex: "F" as const,
  height: null,
  weight: null,
  comorbidities: {},
};
const entry = {
  hour: 0,
  measuredAt: profile.t0,
  availableAt: profile.t0,
  collectedAt: profile.t0,
  labAvailableAt: "2026-11-19T10:00",
  department: "ED" as const,
  vitals: {
    heart_rate_bpm: 90,
    respiratory_rate_per_min: 18,
    sbp_mmhg: 120,
    dbp_mmhg: 75,
    map_mmhg: null,
    spo2_pct: null,
    temperature_c: null,
    gcs: null,
  },
  labs: { CRP: 180 },
  symptoms: null,
};
describe("time contracts", () => {
  it("rejects impossible dates rather than normalizing them", () => {
    expect(Number.isNaN(localTimestamp("2026-02-31T08:00"))).toBe(true);
    expect(localTimestamp("2026-11-19T08:00")).toBe(
      Date.parse("2026-11-19T08:00:00+07:00"),
    );
  });
  it("allows delayed results, but not measurements after the selected hour", () => {
    expect(
      scoreRequestSchema.safeParse({ profile, entries: [entry], hours: [1] })
        .success,
    ).toBe(true);
    expect(
      scoreRequestSchema.safeParse({
        profile,
        entries: [
          {
            ...entry,
            measuredAt: "2026-11-19T09:00",
            availableAt: "2026-11-19T09:00",
          },
        ],
        hours: [1],
      }).success,
    ).toBe(false);
    expect(
      scoreRequestSchema.safeParse({
        profile,
        entries: [{ ...entry, labAvailableAt: "2026-11-19T07:00" }],
        hours: [1],
      }).success,
    ).toBe(false);
  });
  it.each([
    ["0", 0],
    ["36", 36],
    ["37", 7],
    ["-1", 7],
    ["1.5", 7],
    ["", 7],
    [undefined, 7],
  ])("parses URL hour %s correctly", (value, expected) =>
    expect(predictionHour(value as string | undefined, 7)).toBe(expected),
  );
  it("preserves the local midnight boundary", () =>
    expect(timeAt("2026-11-19T23:00:00+07:00", 1)).toBe(
      "2026-11-20T00:00:00+07:00",
    ));
});
describe("reader and source corrections", () => {
  const record: ManualCase = {
    profile,
    entries: [entry],
    predictions: [],
    attemptedHours: [],
    revision: 1,
    currentHour: 1,
    errors: {},
  };
  it("does not expose delayed lab values; distinguishes missing from zero", () => {
    const reader = createClinicalReader(mergeManualCases([record]));
    expect(reader.getAvailableLabs(profile.id, 1)).toHaveLength(0);
    expect(reader.getAvailableLabs(profile.id, 2)[0].value).toBe(180);
    expect(reader.getAvailableVitals(profile.id, 1)[0].values.map_mmhg).toBe(
      90,
    );
    expect(
      reader.getAvailableVitals(profile.id, 1)[0].values.spo2_pct,
    ).toBeNull();
    expect(reader.getPrediction(profile.id, 1)).toBeUndefined();
  });
  it("replaces a corrected identity BEFORE availability filtering", () => {
    const correction = {
      ...entry,
      hour: 1,
      availableAt: "2026-11-19T09:30",
      labAvailableAt: "2026-11-19T10:30",
      vitals: { ...entry.vitals, heart_rate_bpm: 120 },
      labs: { CRP: 200 },
    };
    const reader = createClinicalReader(
      mergeManualCases([{ ...record, entries: [entry, correction] }]),
    );
    expect(reader.getAvailableVitals(profile.id, 1)).toHaveLength(0);
    expect(
      reader.getAvailableVitals(profile.id, 2)[0].values.heart_rate_bpm,
    ).toBe(120);
    expect(reader.getAvailableLabs(profile.id, 2)).toHaveLength(0);
    expect(reader.getAvailableLabs(profile.id, 3)[0].value).toBe(200);
  });
  it("normalizes HH:MM and HH:MM:00 event keys while keeping distinct seconds separate", () => {
    const first = {
      ...entry,
      hour: 1,
      measuredAt: "2026-11-19T09:00",
      availableAt: "2026-11-19T09:00",
      collectedAt: "2026-11-19T09:00",
      labAvailableAt: "2026-11-19T09:00",
      department: "ED" as const,
      vitals: { ...entry.vitals, heart_rate_bpm: 95 },
      labs: { CRP: 50 },
    };
    const sameMinuteWithSeconds = {
      ...first,
      hour: 2,
      measuredAt: "2026-11-19T09:00:00",
      availableAt: "2026-11-19T09:00:00",
      collectedAt: "2026-11-19T09:00:00",
      labAvailableAt: "2026-11-19T09:00:00",
      department: "ICU" as const,
      vitals: { ...entry.vitals, heart_rate_bpm: 125 },
      labs: { CRP: 120 },
    };
    const distinctSecond = {
      ...first,
      hour: 2,
      measuredAt: "2026-11-19T09:00:30",
      availableAt: "2026-11-19T09:00:30",
      collectedAt: "2026-11-19T09:00:30",
      labAvailableAt: "2026-11-19T09:00:30",
      department: "ICU" as const,
      vitals: { ...entry.vitals, heart_rate_bpm: 130 },
      labs: { CRP: 140 },
    };
    const reader = createClinicalReader(
      mergeManualCases([
        {
          ...record,
          entries: [first, sameMinuteWithSeconds, distinctSecond],
        },
      ]),
    );
    expect(reader.getAvailableVitals(profile.id, 1)).toHaveLength(1);
    expect(
      reader.getAvailableVitals(profile.id, 1)[0].values.heart_rate_bpm,
    ).toBe(125);
    expect(reader.getAvailableLabs(profile.id, 1)).toHaveLength(1);
    expect(reader.getAvailableLabs(profile.id, 1)[0].value).toBe(120);
    expect(reader.getUpdates(profile.id, 1)).toEqual({ vitals: 1, labs: 1 });
    expect(
      reader.getDepartment(profile.id, timeAt("2026-11-19T08:00:00+07:00", 1)),
    ).toBe("ICU");
    expect(reader.getAvailableVitals(profile.id, 2)).toHaveLength(2);
    expect(reader.getAvailableLabs(profile.id, 2)).toHaveLength(2);
    expect(
      reader.getAvailableVitals(profile.id, 2)[1].values.heart_rate_bpm,
    ).toBe(130);
  });
  it("inherits the active department at the selected hour without leaking future transfers backwards", () => {
    const edAtT0 = { ...entry, hour: 0, department: "ED" as const };
    const icuAtH2 = {
      ...entry,
      hour: 2,
      measuredAt: "2026-11-19T10:00",
      availableAt: "2026-11-19T10:00",
      collectedAt: "2026-11-19T10:00",
      labAvailableAt: "2026-11-19T10:00",
      department: "ICU" as const,
    };
    const reader = createClinicalReader(
      mergeManualCases([{ ...record, entries: [edAtT0, icuAtH2] }]),
    );
    const t0Iso = "2026-11-19T08:00:00+07:00";
    expect(reader.getDepartment(profile.id, timeAt(t0Iso, 1))).toBe("ED");
    expect(reader.getDepartment(profile.id, timeAt(t0Iso, 2))).toBe("ICU");
    expect(reader.getDepartment(profile.id, timeAt(t0Iso, 3))).toBe("ICU");
  });
  it("exposes no future predictions or alert history beyond the current hour", () => {
    const reader = createClinicalReader();
    for (const e of reader.listEncounters()) {
      expect(
        reader.getPredictions(e.id).every((p) => p.hour <= e.currentHour),
      ).toBe(true);
      expect(
        reader.getAvailableVitals(e.id, 0).every((v) => v.availableAt <= e.t0),
      ).toBe(true);
    }
    expect(
      reader
        .getAlerts()
        .every(
          (a) =>
            a.prediction.hour <= a.encounter.currentHour &&
            a.prediction.score >= a.prediction.threshold,
        ),
    ).toBe(true);
    const rows = reader.getMonitoringRows();
    expect(summaryOf(rows).pending).toBe(
      rows.filter((r) => r.state === "above" && !r.review).length,
    );
    expect(reader.getModelMetadata().features).toHaveLength(36);
    expect(reader.getModelMetadata()).toEqual(dataset.models.sepsis);
  });
});
describe("persisted review safety", () => {
  const p = dataset.predictions[0],
    now = Date.now();
  const r: Review = {
    predictionId: p.id,
    revision: p.revision,
    reviewer: "Bác sĩ A",
    timestamp: new Date(now).toISOString(),
    note: "Đã đối chiếu",
    localOnly: true,
  };
  it("round-trips a valid review but does not apply it to a new revision", () => {
    const restored = decodeReviews(JSON.stringify({ [p.id]: r }), now);
    expect(reviewFor(p, restored)).toEqual(r);
    expect(
      reviewFor({ ...p, revision: p.revision + 1 }, restored),
    ).toBeUndefined();
  });
  it("keeps older history and ignores damaged, future or mismatched records", () => {
    expect(decodeReviews("broken", now)).toEqual({});
    expect(decodeReviews(JSON.stringify({ wrong: r }), now)).toEqual({});
    expect(
      decodeReviews(
        JSON.stringify({
          [p.id]: {
            ...r,
            timestamp: new Date(now - 8 * 3600000).toISOString(),
          },
        }),
        now,
      ),
    ).toHaveProperty(p.id);
    expect(
      decodeReviews(
        JSON.stringify({
          [p.id]: { ...r, timestamp: new Date(now + 1000).toISOString() },
        }),
        now,
      ),
    ).toEqual({});
  });
});

describe("client synchronization", () => {
  afterEach(() => {vi.unstubAllGlobals();vi.resetModules();});
  it("does not mark review as saved if the server write fails",async () => {
    vi.resetModules();
    const store=await import("@/lib/client/clinical-storage");
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({error:"Không lưu được"}),{status:503})));
    await expect(store.persistClinical("/api/reviews","POST",{})).rejects.toThrow("Không lưu được");
    expect(store.getClinicalSnapshot().reviews).toEqual({});
  });
  it("ignores a slow old GET arriving after a successful write and avoids redundant GET after write",async () => {
    vi.resetModules();
    const store=await import("@/lib/client/clinical-storage");
    let resolveOld!: (response:Response)=>void;
    const fresh={cases:[],reviews:{saved:{predictionId:"saved",revision:1,reviewer:"Bác sĩ A",timestamp:new Date().toISOString(),note:"",localOnly:false}}};
    const fetchMock=vi.fn().mockImplementationOnce(()=>new Promise<Response>(resolve=>{resolveOld=resolve;})).mockResolvedValue(new Response(JSON.stringify(fresh)));
    vi.stubGlobal("fetch",fetchMock);
    const old=store.refreshClinical();
    await store.persistClinical("/api/reviews","POST",{});
    resolveOld(new Response(JSON.stringify({cases:[],reviews:{}})));
    await old;
    expect(store.getClinicalSnapshot().reviews).toHaveProperty("saved");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("polls GET /api/jobs/{jobId} after PUT without calling POST /rescore, handles superseded and timeout", async () => {
    vi.resetModules();
    const manualStore = await import("@/lib/client/manual-store");
    const pendingCase: ManualCase = {
      profile,
      entries: [{ ...entry, hour: 1 }],
      predictions: [],
      attemptedHours: [1],
      revision: 1,
      currentHour: 1,
      errors: { "1": "Đã lưu dữ liệu, đang chờ chấm lại." },
      scoringStatus: "pending",
    };
    const readyCase: ManualCase = {
      ...pendingCase,
      errors: {},
      scoringStatus: "ready",
      predictions: [
        {
          id: `${profile.id}:1:1`,
          encounterId: profile.id,
          hour: 1,
          timestamp: "2026-11-19T09:00:00+07:00",
          score: 0.25,
          threshold: dataset.models.sepsis.threshold,
          revision: 1,
          modelVersion: dataset.models.sepsis.model_version,
          department: "ED",
          availableFeatures: 24,
          featureHash: "abc",
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ cases: [pendingCase], reviews: {}, jobId: "job-1" }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "job-1",
            encounter_id: profile.id,
            revision: 1,
            status: "running",
            attempts: 1,
            error: null,
            created_at: "2026-11-19T09:00:00Z",
            finished_at: null,
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "job-1",
            encounter_id: profile.id,
            revision: 1,
            status: "succeeded",
            attempts: 1,
            error: null,
            created_at: "2026-11-19T09:00:00Z",
            finished_at: "2026-11-19T09:00:01Z",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ cases: [readyCase], reviews: {} })),
      );
    vi.stubGlobal("fetch", fetchMock);

    const updated = await manualStore.updateManualCase(
      profile.id,
      0,
      { ...entry, hour: 1 },
      { timeoutMs: 2000, pollIntervalMs: 1 },
    );
    expect(updated.scoringStatus).toBe("ready");
    expect(fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${url}`)).toEqual([
      `PUT /api/cases/${profile.id}/entries`,
      "GET /api/jobs/job-1",
      "GET /api/jobs/job-1",
      "GET /api/clinical-state",
    ]);

    // Superseded due to policy change (same revision, server marks case error)
    const policyErrorCase: ManualCase = {
      ...pendingCase,
      scoringStatus: "error",
      scoringError: "Phiên bản mô hình đã thay đổi. Vui lòng chấm lại dữ liệu đã lưu.",
    };
    const supersededMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ cases: [pendingCase], reviews: {}, jobId: "job-2" }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "job-2",
            encounter_id: profile.id,
            revision: 1,
            status: "superseded",
            attempts: 0,
            error: null,
            created_at: "2026-11-19T09:00:00Z",
            finished_at: "2026-11-19T09:00:01Z",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ cases: [policyErrorCase], reviews: {} })),
      );
    vi.stubGlobal("fetch", supersededMock);
    const superseded = await manualStore.rescoreManualCase(profile.id, 1, {
      timeoutMs: 2000,
      pollIntervalMs: 1,
    });
    expect(superseded.scoringStatus).toBe("error");
    expect(superseded.scoringError).toContain("Phiên bản mô hình đã thay đổi");

    // Superseded due to concurrent edit in another tab (revision changed)
    const newerRevisionCase: ManualCase = { ...readyCase, revision: 2 };
    const concurrentMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ cases: [pendingCase], reviews: {}, jobId: "job-3" }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "job-3",
            encounter_id: profile.id,
            revision: 1,
            status: "superseded",
            attempts: 0,
            error: null,
            created_at: "2026-11-19T09:00:00Z",
            finished_at: "2026-11-19T09:00:01Z",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ cases: [newerRevisionCase], reviews: {} }),
        ),
      );
    vi.stubGlobal("fetch", concurrentMock);
    await expect(
      manualStore.rescoreManualCase(profile.id, 1, {
        timeoutMs: 2000,
        pollIntervalMs: 1,
      }),
    ).rejects.toThrow("Hồ sơ đã thay đổi trong khi chấm");

    // Timeout while still pending: returns pending state and describeScoringOutcome must not claim completion
    const timeoutMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ cases: [pendingCase], reviews: {}, jobId: "job-4" }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ cases: [pendingCase], reviews: {} })),
      );
    vi.stubGlobal("fetch", timeoutMock);
    const timedOut = await manualStore.rescoreManualCase(profile.id, 1, {
      timeoutMs: 0,
      pollIntervalMs: 1,
    });
    expect(timedOut.scoringStatus).toBe("pending");
    const outcome = describeScoringOutcome(timedOut, 1, "rescore");
    expect(outcome.kind).toBe("pending");
    expect(outcome.text).not.toContain("Đã chấm lại dữ liệu đã lưu");
    expect(describeScoringOutcome(policyErrorCase, 1, "rescore").kind).toBe("error");
    expect(describeScoringOutcome(readyCase, 1, "rescore")).toEqual({
      kind: "success",
      text: "Đã chấm lại dữ liệu đã lưu.",
    });
  });

  it("rejects DBP >= SBP and out-of-unit lab values in manual validation", () => {
    const badBp = scoreRequestSchema.safeParse({
      profile,
      entries: [
        {
          ...entry,
          vitals: { ...entry.vitals, sbp_mmhg: 85, dbp_mmhg: 95 },
        },
      ],
      hours: [0],
    });
    expect(badBp.success).toBe(false);
    if (!badBp.success) {
      expect(badBp.error.issues[0].message).toContain("DBP");
    }

    const badCreatinine = scoreRequestSchema.safeParse({
      profile,
      entries: [{ ...entry, labs: { creatinine: 180 } }],
      hours: [0],
    });
    expect(badCreatinine.success).toBe(false);
    if (!badCreatinine.success) {
      expect(badCreatinine.error.issues[0].message).toContain("creatinine");
    }
  });

  it("computes Sepsis-3 qSOFA, SIRS, MEWS and composes structured review notes", () => {
    const vitals: VitalObservation[] = [
      {
        encounterId: profile.id,
        measuredAt: "2026-11-19T09:00:00+07:00",
        availableAt: "2026-11-19T09:00:00+07:00",
        values: {
          heart_rate_bpm: 118,
          respiratory_rate_per_min: 22,
          sbp_mmhg: 96,
          map_mmhg: 68,
          spo2_pct: 95,
          temperature_c: 38.6,
          gcs: 14,
        },
      },
    ];
    const labs: LaboratoryResult[] = [
      {
        encounterId: profile.id,
        code: "WBC",
        value: 15.2,
        unit: "10^9/L",
        collectedAt: "2026-11-19T08:15:00+07:00",
        availableAt: "2026-11-19T09:00:00+07:00",
      },
    ];
    const scores = computeClinicalScores(vitals, labs);
    // qSOFA: RR >= 22 (+1), SBP <= 100 (+1), GCS < 15 (+1) => 3/3
    expect(scores.qsofa).toMatchObject({ score: 3, known: 3, elevated: true });
    // SIRS: Temp >38 (+1), HR >90 (+1), RR >20 (+1), WBC >12 (+1) => 4/4
    expect(scores.sirs).toMatchObject({ score: 4, known: 4, elevated: true });
    // MEWS: SBP 96 (+1), HR 118 (+2), RR 22 (+2), Temp 38.6 (+2), GCS 14 (+1) => 8
    expect(scores.mews).toMatchObject({ score: 8, known: 5, elevated: true });

    // Boundary check: RR = 21 must NOT trigger Sepsis-3 qSOFA (>= 22), but triggers SIRS (> 20)
    const boundary = computeClinicalScores(
      [
        {
          ...vitals[0],
          values: {
            ...vitals[0].values,
            heart_rate_bpm: 88,
            respiratory_rate_per_min: 21,
            sbp_mmhg: 112,
            temperature_c: 37.2,
            gcs: null,
          },
        },
      ],
      [],
    );
    expect(boundary.qsofa).toMatchObject({
      score: 0,
      known: 2,
      elevated: false,
      missing: ["GCS"],
    });
    expect(boundary.sirs).toMatchObject({
      score: 1,
      known: 3,
      elevated: false,
      missing: ["WBC"],
    });

    expect(composeReviewNote("Phát hiện sớm hữu ích", "Đã cho cấy máu")).toBe(
      "[Phát hiện sớm hữu ích] Đã cho cấy máu",
    );
    expect(composeReviewNote("Phát hiện sớm hữu ích", "   ")).toBe(
      "[Phát hiện sớm hữu ích]",
    );
    expect(composeReviewNote("", "Chỉ ghi chú tự do")).toBe("Chỉ ghi chú tự do");
  });

  it("flags abnormal vitals/labs, estimates MAP, formats score cues, and resolves AI drivers", () => {
    expect(assessClinicalValue("vital", "heart_rate_bpm", 125)).toMatchObject({
      status: "high",
      badge: "↑ Cao",
    });
    expect(assessClinicalValue("vital", "sbp_mmhg", 84)).toMatchObject({
      status: "low",
      badge: "↓ Thấp",
    });
    expect(assessClinicalValue("vital", "sbp_mmhg", 118)).toMatchObject({
      status: "normal",
      badge: null,
    });
    expect(assessClinicalValue("lab", "CRP", 85)).toMatchObject({
      status: "high",
      badge: "↑ Cao",
    });
    expect(assessClinicalValue("lab", "platelets", 95)).toMatchObject({
      status: "low",
      badge: "↓ Thấp",
    });
    expect(assessClinicalValue("lab", "WBC", null)).toMatchObject({
      status: "missing",
      badge: null,
    });

    expect(estimateMap(110, 70)).toBe(83);
    expect(estimateMap(85, 95)).toBeNull();
    expect(estimateMap(110, null)).toBeNull();

    expect(
      formatScoreCue("qSOFA", {
        score: 0,
        max: 3,
        known: 2,
        total: 3,
        elevated: false,
        missing: ["GCS"],
      }),
    ).toEqual({
      valueText: "0/3 tiêu chí",
      statusText: "Chưa báo",
      missingText: "thiếu GCS",
    });
    expect(
      formatScoreCue("qSOFA", {
        score: 2,
        max: 3,
        known: 3,
        total: 3,
        elevated: true,
        missing: [],
      }),
    ).toEqual({
      valueText: "2/3 tiêu chí",
      statusText: "Cảnh báo",
      missingText: "",
    });

    const samplePred = dataset.predictions.find(
      (p) => p.encounterId === "E0007" && p.hour === 1,
    );
    const demoDrivers = contributorsFor(samplePred);
    expect(demoDrivers.length).toBeGreaterThan(0);
    expect(demoDrivers[0].contribution).toBeGreaterThan(0);

    const liveDrivers = contributorsFor({
      ...samplePred!,
      contributors: [
        { feature: "CRP_last_mg_L", labelVi: "CRP gần nhất", contribution: 2.1 },
      ],
    });
    expect(liveDrivers).toHaveLength(1);
    expect(liveDrivers[0].feature).toBe("CRP_last_mg_L");

    expect(ALERT_ROUTING.ED.team).toContain("Cấp cứu");
    expect(ALERT_ROUTING.WARD.team).toContain("Nội trú");
    expect(ALERT_ROUTING.ICU.team).toContain("ICU");
    expect(ALERT_SOP_STEPS).toHaveLength(4);
    expect(ALERT_SOP_STEPS[0].detail).toContain("không còi ồn");
  });
});
