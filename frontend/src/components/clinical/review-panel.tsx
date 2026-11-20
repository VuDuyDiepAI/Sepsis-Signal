"use client";
import Link from "next/link";
import { useRef,useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCheck,ClipboardCheck } from "lucide-react";
import { Panel } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { useReviews } from "@/components/review-context";
import { useAuth } from "@/components/auth-provider";
import { formatTime,reviewFor } from "@/lib/clinical-data";
import type { Prediction } from "@/lib/clinical-types";
const schema=z.object({note:z.string().trim().max(1000,"Ghi chú tối đa 1.000 ký tự.")});
export function ReviewPanel({prediction,returnTo,compact=false,encounterId,hour}:{prediction?:Prediction;returnTo?:string;compact?:boolean;encounterId?:string;hour?:number}) {
  const {reviews,reviewHistory,recordReview}=useReviews(),{user}=useAuth();
  const review=reviewFor(prediction,reviews);
  const [storageError,setStorageError]=useState(""),[adding,setAdding]=useState(false);
  const attempt=useRef<{id:string;note:string}|null>(null);
  const current=reviewHistory.filter(r=>r.predictionId===prediction?.id);
  const prior=reviewHistory.filter(r=>r.encounterId===(encounterId??prediction?.encounterId)&&r.hour===(hour??prediction?.hour)&&r.predictionId!==prediction?.id);
  const {register,handleSubmit,reset,formState:{errors,isSubmitting}}=useForm<z.infer<typeof schema>>({resolver:zodResolver(schema),defaultValues:{note:""}});
  return <Panel title="Ghi nhận xem xét" meta={prediction?`Bản tính #${prediction.revision} · ${review?"Đã xem xét":"Chưa xem xét"}`:"Chưa có dự báo"} className={`review-panel ${compact?"review-compact":""}`}>
    <div className="panel-body">
      {!prediction&&<p className="muted">Chưa có bản dự báo để ghi nhận xem xét.</p>}
      {review&&<div className="review-success" role="status">
        <strong className="flex gap-2 items-center"><CheckCheck size={18}/>Đã ghi nhận xem xét</strong>
        <span>{review.reviewer} · {formatTime(review.timestamp,true)}</span>
        {review.provenance==="legacy-v1"&&<span className="secondary-text">Ghi nhận trước nâng cấp · tên nhập thủ công</span>}
        {review.note&&<p>{review.note}</p>}
        {user?.role!=="viewer"&&!adding&&<Button type="button" variant="outline" onClick={()=>setAdding(true)}>Bổ sung đánh giá</Button>}
        {returnTo&&<Link className="link-button" href={returnTo}>Quay về danh sách</Link>}
      </div>}
      {prediction&&(!review||adding)&&user?.role!=="viewer"&&<form className="review-form" onSubmit={event=>{void handleSubmit(async v=>{
        if(!attempt.current||attempt.current.note!==v.note)attempt.current={id:crypto.randomUUID(),note:v.note};
        try {await recordReview(prediction,v.note,attempt.current.id);setStorageError("");setAdding(false);attempt.current=null;reset();}
        catch(e){setStorageError(e instanceof Error?e.message:"Chưa lưu được ghi nhận. Vui lòng thử lại.");}
      })(event);}} noValidate>
        <div className="review-identity"><span className="value-label">Người xem xét</span><strong>{user?.displayName}</strong></div>
        <label>Ghi chú (không bắt buộc)<textarea {...register("note")} placeholder="Nhận xét tại mốc này…" aria-invalid={!!errors.note}/></label>
        {errors.note&&<p className="form-error" role="alert">{errors.note.message}</p>}
        <Button type="submit" disabled={isSubmitting}><ClipboardCheck size={17}/>{isSubmitting?"Đang lưu…":review?"Lưu đánh giá bổ sung":"Ghi nhận đã xem xét"}</Button>
        {adding&&<Button type="button" variant="ghost" onClick={()=>setAdding(false)}>Hủy</Button>}
      </form>}
      {storageError&&<p role="alert" className="form-error">{storageError}</p>}
      {user?.role==="viewer"&&<p className="secondary-text">Tài khoản chỉ có quyền xem.</p>}
      <p className="clinical-note">Lưu theo tài khoản và phiên bản kết quả. Đã xem xét không có nghĩa đã hoàn tất xử trí.</p>
      {current.length>1&&<details className="clinical-note"><summary>Các lượt đánh giá ({current.length})</summary>{current.map(r=><p key={r.id??r.predictionId}>{r.reviewer} · {formatTime(r.timestamp,true)}{r.note?` — ${r.note}`:""}</p>)}</details>}
      {prior.length>0&&<details className="clinical-note"><summary>Lịch sử xem xét các phiên bản trước</summary>{prior.map((r,i)=><p key={r.id??`${r.predictionId}:${i}`}>Bản tính #{r.revision} · {r.reviewer} · {formatTime(r.timestamp,true)}{r.note?` — ${r.note}`:""}</p>)}</details>}
    </div>
  </Panel>;
}
