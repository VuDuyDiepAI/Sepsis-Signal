"use client";
import { createContext,useContext,useEffect,useState,useRef,useCallback,type ReactNode } from "react";
import type { SessionUser,DemoAccount } from "@/lib/contracts/auth";
import { setCurrentActor } from "@/lib/client/identity";
import { clearClinical } from "@/lib/client/clinical-storage";
const Context=createContext<{
  user:SessionUser|null; loading:boolean; error:string; demoAccounts:DemoAccount[];
  login:(username:string,password:string)=>Promise<void>; logout:()=>Promise<void>;
}|null>(null);
export function AuthProvider({children}:{children:ReactNode}) {
  const [user,setUser]=useState<SessionUser|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const [demoAccounts,setDemoAccounts]=useState<DemoAccount[]>([]);
  const identity=useRef<SessionUser|null>(null);
  const authEpoch=useRef(0),authMutation=useRef(false);
  const applyUser=useCallback((next:SessionUser|null) => {
    const previous=identity.current;
    if(previous?.id===next?.id&&previous?.role===next?.role&&previous?.displayName===next?.displayName)return;
    identity.current=next;setCurrentActor(next?.id??"");clearClinical();setUser(next);
  },[]);
  function broadcast() {try {const channel=new BroadcastChannel("sepsis-auth");channel.postMessage("changed");channel.close();}catch{}}
  useEffect(()=>{
    let cancelled=false;
    async function refreshSession() {
      if(authMutation.current)return;
      const epoch=authEpoch.current;
      try {
        const response=await fetch("/api/auth/session",{cache:"no-store"}),data=await response.json();
        if(!response.ok)throw new Error(data.error??"Không kết nối được dịch vụ đăng nhập.");
        if(!cancelled&&epoch===authEpoch.current&&!authMutation.current){applyUser(data.user);setDemoAccounts(data.demoAccounts);setError("");}
      } catch(e){if(!cancelled)setError(e instanceof Error?e.message:"Không kiểm tra được phiên đăng nhập.");}
      finally{if(!cancelled)setLoading(false);}
    }
    void refreshSession();
    const expired=()=>{authEpoch.current++;applyUser(null);};
    const focus=()=>{void refreshSession();};
    let channel:BroadcastChannel|undefined;
    try{channel=new BroadcastChannel("sepsis-auth");channel.onmessage=focus;}catch{}
    const timer=setInterval(()=>{if(!document.hidden)void refreshSession();},60000);
    window.addEventListener("focus",focus);
    window.addEventListener("sepsis-auth-expired",expired);
    return()=>{cancelled=true;clearInterval(timer);channel?.close();window.removeEventListener("focus",focus);window.removeEventListener("sepsis-auth-expired",expired);};
  },[applyUser]);
  async function login(username:string,password:string) {
    authEpoch.current++;authMutation.current=true;
    try {
      const response=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error??"Không đăng nhập được.");
      applyUser(data.user);setError("");broadcast();
    } finally {authMutation.current=false;}
  }
  async function logout() {
    authEpoch.current++;authMutation.current=true;
    try {
      const response=await fetch("/api/auth/logout",{method:"POST"});
      if(!response.ok)throw new Error("Chưa đăng xuất được. Vui lòng thử lại.");
      applyUser(null);broadcast();
    } finally {authMutation.current=false;}
  }
  return <Context.Provider value={{user,loading,error,demoAccounts,login,logout}}>{children}</Context.Provider>;
}
export function useAuth() {const value=useContext(Context);if(!value)throw new Error("AuthProvider required");return value;}
