import {afterEach,it,expect,vi} from "vitest";
afterEach(() => {vi.unstubAllGlobals();vi.resetModules();});
it("does not mark review as saved if the server write fails",async () => {
  vi.resetModules();
  const store=await import("@/lib/client/clinical-storage");
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({error:"Không lưu được"}),{status:503})));
  await expect(store.persistClinical("/api/reviews","POST",{})).rejects.toThrow("Không lưu được");
  expect(store.getClinicalSnapshot().reviews).toEqual({});
});
it("ignores a slow old GET arriving after a successful write",async () => {
  vi.resetModules();
  const store=await import("@/lib/client/clinical-storage");
  let resolveOld!: (response:Response)=>void;
  const fresh={cases:[],reviews:{saved:{predictionId:"saved",revision:1,reviewer:"Bác sĩ A",timestamp:new Date().toISOString(),note:"",localOnly:false}}};
  vi.stubGlobal("fetch",vi.fn().mockImplementationOnce(()=>new Promise<Response>(resolve=>{resolveOld=resolve;})).mockResolvedValue(new Response(JSON.stringify(fresh))));
  const old=store.refreshClinical();
  await store.persistClinical("/api/reviews","POST",{});
  resolveOld(new Response(JSON.stringify({cases:[],reviews:{}})));
  await old;
  expect(store.getClinicalSnapshot().reviews).toHaveProperty("saved");
});
