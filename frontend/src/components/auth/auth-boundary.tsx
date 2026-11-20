"use client";
import { useEffect,type ReactNode } from "react";
import { usePathname,useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { AppShell } from "@/components/layout/app-shell";
export function AuthBoundary({children}:{children:ReactNode}) {
  const {user,loading,error}=useAuth(),path=usePathname(),router=useRouter();
  useEffect(()=>{
    if(!loading&&!user&&path!=="/login")router.replace("/login?next="+encodeURIComponent(window.location.pathname+window.location.search));
  },[loading,user,path,router]);
  if(path==="/login")return children;
  if(loading||!user)return <main className="login-loading" role="status">{error||"Đang kiểm tra phiên đăng nhập…"}</main>;
  return <AppShell>{children}</AppShell>;
}
