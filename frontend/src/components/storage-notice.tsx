"use client";
import { useStorageStatus,refreshClinical } from "@/lib/clinical-storage";
import { persistClinical } from "@/lib/clinical-storage";
import { useState } from "react";
import { useHydrated } from "@/lib/use-hydrated";
import { decodeReviews } from "@/lib/review-store";
import type { ManualCase } from "@/lib/manual-types";
export function StorageNotice() {
  const {error} = useStorageStatus();
  const hydrated = useHydrated();
  const [done,setDone] = useState(false),[busy,setBusy] = useState(false),[message,setMessage] = useState("");
  let legacy = false;
  if (hydrated && !done) {
    try { legacy = !!sessionStorage.getItem("sepsis-manual-cases-v1") || !!sessionStorage.getItem("sepsis-reviews-v1"); }
    catch { /* Server persistence works even if browser storage is disabled. */ }
  }
  async function migrate() {
    setBusy(true); setMessage("");
    try {
      const cases: ManualCase[] = JSON.parse(sessionStorage.getItem("sepsis-manual-cases-v1") ?? "[]");
      const reviews = decodeReviews(sessionStorage.getItem("sepsis-reviews-v1"));
      for (const c of cases) await persistClinical("/api/cases/import","POST",{
        input:{profile:c.profile,entries:c.entries,hours:c.attemptedHours},predictions:c.predictions,
        reviews:Object.values(reviews).filter(r => c.predictions.some(p=>p.id===r.predictionId)),
      });
      await persistClinical("/api/reviews/import","POST",Object.values(reviews));
      // Keep a recoverable browser backup; server also archives each original manual payload.
      sessionStorage.setItem("sepsis-legacy-backup",JSON.stringify({cases,reviews}));
      sessionStorage.removeItem("sepsis-manual-cases-v1"); sessionStorage.removeItem("sepsis-reviews-v1");
      setDone(true); setMessage("Đã chuyển hồ sơ lên máy chủ và chấm lại. Ghi nhận chỉ áp dụng khi kết quả khớp; bản gốc giữ trong bản sao lưu.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Chưa chuyển được dữ liệu; dữ liệu cũ vẫn được giữ."); }
    finally { setBusy(false); }
  }
  if (!error && !legacy && !message) return null;
  return <div className="storage-notice" role={error ? "alert" : "status"}>
    {error && <span>{error} <button type="button" className="link-button" onClick={() => void refreshClinical()}>Thử tải lại</button></span>}
    {legacy && <span>Tab này còn dữ liệu từ phiên cũ. <button className="link-button" type="button" disabled={busy} onClick={() => void migrate()}>{busy ? "Đang chuyển…" : "Chuyển dữ liệu lên máy chủ"}</button></span>}
    {message && <span>{message} <button type="button" className="link-button" onClick={() => setMessage("")}>Đóng</button></span>}
  </div>;
}
