"use client";
import { useState } from "react";
import { useAppNavigation,useQuery } from "@/app/navigation";
import { Activity,LockKeyhole } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
function destination(value:string|null) {
  if(!value||!value.startsWith("/")||value.startsWith("//")||value.includes("\\"))return "/dashboard";
  const url=new URL(value,"https://local.invalid");
  return /^\/(dashboard|patients(?:\/[A-Za-z0-9_-]+)?|sample-cases|model-monitoring)$/.test(url.pathname)?url.pathname+url.search:"/dashboard";
}
export default function LoginPage() {
  const auth=useAuth(),router=useAppNavigation(),params=useQuery();
  const [username,setUsername]=useState(""),[password,setPassword]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  return <main className="login-screen">
    <section className="login-intro">
      <div className="login-brand"><Activity size={34}/><strong>SEPSIS SIGNAL</strong></div>
      <h1>Đăng nhập</h1><p>Theo dõi nguy cơ sepsis theo thời gian.</p>
      <p>Khoa Cấp cứu · Vinmec</p>
    </section>
    <section className="login-form-panel" aria-label="Đăng nhập Sepsis Signal">
      <h2>Không gian lâm sàng</h2><p>Đăng nhập để mở hồ sơ và ghi nhận đánh giá.</p>
      <form onSubmit={async event=>{
        event.preventDefault();setBusy(true);setError("");
        try {await auth.login(username,password);router.replace(destination(params.get("next")));}
        catch(e){setError(e instanceof Error?e.message:"Không đăng nhập được.");}
        finally{setBusy(false);}
      }}>
        <label>Tên đăng nhập<Input autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} required maxLength={80}/></label>
        <label>Mật khẩu<Input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required maxLength={200}/></label>
        {(error||auth.error)&&<p className="form-error" role="alert">{error||auth.error}</p>}
        <Button type="submit" disabled={busy||auth.loading}><LockKeyhole size={17}/>{busy?"Đang đăng nhập…":"Đăng nhập"}</Button>
      </form>
      {auth.demoAccounts.length>0&&<div className="login-demo"><h3>Tài khoản trải nghiệm</h3>
        {auth.demoAccounts.map(account=><button key={account.username} type="button" onClick={()=>{setUsername(account.username);setPassword(account.password);}}>
          <strong>{account.displayName}</strong><span>{account.username} · {account.password}</span>
        </button>)}
      </div>}
    </section>
  </main>;
}
