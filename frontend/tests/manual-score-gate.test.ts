import { it, expect } from "vitest";
import { ManualScoreGate } from "../src/lib/manual-score-gate";
const local = () =>
  new Request("http://localhost:3100/api/manual-score", {
    method: "POST",
    headers: { origin: "http://localhost:3100" },
  });
it("limits concurrent workers and releases slots idempotently", () => {
  const gate = new ManualScoreGate();
  const a = gate.claim(local(), 0),
    b = gate.claim(local(), 0);
  expect(a.ok && b.ok).toBe(true);
  expect(gate.claim(local(), 0)).toMatchObject({ ok: false, status: 429 });
  if (a.ok) {
    a.release();
    a.release();
  }
  const c = gate.claim(local(), 0);
  expect(c.ok).toBe(true);
  expect(gate.claim(local(), 0).ok).toBe(false);
  if (b.ok) b.release();
  if (c.ok) c.release();
});
it("rate-limits completed requests and resets at the time boundary", () => {
  const gate = new ManualScoreGate({ maxPerMinute: 2 });
  for (let i = 0; i < 2; i++) {
    const c = gate.claim(local(), 0);
    if (c.ok) c.release();
  }
  expect(gate.claim(local(), 59999)).toMatchObject({
    ok: false,
    status: 429,
    retryAfter: 1,
  });
  expect(gate.claim(local(), 60000).ok).toBe(true);
});
it("rejects foreign and malformed origins", () => {
  for (const origin of ["https://foreign.example", "null"]) {
    expect(
      new ManualScoreGate().claim(
        new Request("http://localhost:3100", { headers: { origin } }),
      ),
    ).toMatchObject({ ok: false, status: 403 });
  }
});
it("requires configured origins; the separate session guard checks identity",()=>{
  expect(new ManualScoreGate().claim(new Request("https://public.example/api/clinical-state"))).toMatchObject({ok:false,status:403});
  const gate=new ManualScoreGate({origins:["https://clinical.example"]});
  expect(gate.claim(new Request("https://clinical.example/api/clinical-state")).ok).toBe(true);
  // Authorization is enforced separately by requireUser, even for an allowed origin.
});
