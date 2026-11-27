"use client";
import { useSyncExternalStore } from "react";
import type {
  ClinicalSnapshot,
  ClinicalWriteResponse,
  ScoringJobStatus,
} from "@/lib/contracts/manual";
import { currentActor } from "@/lib/client/identity";
const empty: ClinicalSnapshot = { cases:[],reviews:{},reviewHistory:[],fixturePredictions:[] };
let snapshot = empty;
let status = { loading:true,error:"" };
const listeners = new Set<() => void>();
let generation = 0, writes = 0, sessionEpoch = 0;
let mutationQueue: Promise<unknown> = Promise.resolve();
const notify = () => listeners.forEach(fn => fn());
export const getClinicalSnapshot = () => snapshot;
export const getServerClinicalSnapshot = () => empty;
export function subscribeClinical(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
async function parse<T>(response: Response): Promise<T> {
  const value = await response.json();
  if (response.status===401 && typeof window!=="undefined") window.dispatchEvent(new Event("sepsis-auth-expired"));
  if (!response.ok) throw new Error(value.error ?? "Không kết nối được nơi lưu trữ trên máy chủ.");
  return value as T;
}
export async function fetchScoringJob(jobId: string): Promise<ScoringJobStatus | null> {
  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" });
  if (response.status === 404) return null;
  return parse<ScoringJobStatus>(response);
}
export async function refreshClinical() {
  if (writes) return;
  const version = ++generation;
  try {
    const value = await parse<ClinicalSnapshot>(await fetch("/api/clinical-state",{cache:"no-store"}));
    if (version !== generation || writes) return;
    snapshot = value; status = {loading:false,error:""}; notify();
  } catch (error) {
    if (version !== generation) return;
    status = {loading:false,error:error instanceof Error ? error.message : "Không tải được dữ liệu máy chủ."}; notify();
  }
}
export function clearClinical() {
  sessionEpoch++; generation++; snapshot=empty; status={loading:true,error:""}; notify();
}
export function persistClinical(url: string, method: string, body: unknown): Promise<ClinicalWriteResponse> {
  const epoch=sessionEpoch;
  const operation=mutationQueue.then(async()=>{
  if(epoch!==sessionEpoch)throw new Error("Phiên đăng nhập đã thay đổi. Vui lòng tải lại hồ sơ.");
  generation++; writes++;
  let failed = false;
  try {
    const value = await parse<ClinicalWriteResponse>(await fetch(url,{method,headers:{"Content-Type":"application/json","X-Sepsis-User":currentActor()},body:JSON.stringify(body)}));
    if(epoch!==sessionEpoch)throw new Error("Phiên đăng nhập đã thay đổi. Vui lòng tải lại hồ sơ.");
    const { jobId, ...nextSnapshot } = value;
    snapshot = nextSnapshot; status = {loading:false,error:""}; notify();
    return { ...nextSnapshot, jobId };
  } catch (error) {
    failed = true;
    throw error;
  } finally { writes--; if (failed && !writes && epoch===sessionEpoch) void refreshClinical(); }
  });
  mutationQueue=operation.catch(()=>{});
  return operation;
}
export function startClinicalSync() {
  void refreshClinical();
  const timer = setInterval(() => { if (!document.hidden) void refreshClinical(); },10000);
  const focus = () => { void refreshClinical(); };
  window.addEventListener("focus",focus);
  return () => { clearInterval(timer); window.removeEventListener("focus",focus); };
}
const serverStatus = {loading:true,error:""};
export function useStorageStatus() { return useSyncExternalStore(subscribeClinical,() => status,() => serverStatus); }
