import { afterEach,describe,it,expect,vi } from "vitest";
import { ClinicalDatabase } from "@/lib/server/clinical-db";
import { WebAuth,requireUser,cookieHeader } from "@/lib/server/auth";
import {execFileSync} from "node:child_process";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
let db:ClinicalDatabase|undefined;
afterEach(()=>{db?.close();db=undefined;vi.unstubAllEnvs();});
function setup(allowDemo=false) { db=new ClinicalDatabase(":memory:");return new WebAuth(db,allowDemo); }
describe("server authentication",()=>{
  it("stores hashed passwords/tokens, restores a session, expires it and revokes it",()=>{
    const auth=setup();auth.provision("doctor.a","Strong-test-2026!","Bác sĩ A");
    const {token,user}=auth.login("doctor.a","Strong-test-2026!",1000);
    expect(db!.db.prepare("SELECT password_hash FROM auth_users").get()?.password_hash).not.toContain("Strong-test");
    expect(db!.db.prepare("SELECT token_hash FROM auth_sessions").get()?.token_hash).not.toBe(token);
    expect(new WebAuth(db!).session(token,1001)?.id).toBe(user.id);
    expect(auth.session(token,1000+8*3600000)).toBeNull();
    auth.logout(token);expect(auth.session(token,1001)).toBeNull();
  });
  it("rejects forged cookies regardless of a localhost Host header and enforces read-only roles",()=>{
    const auth=setup();auth.provision("reader.a","Strong-test-2026!","Nghiên cứu","viewer");
    const forged=new Request("http://localhost:3100/api/clinical-state",{headers:{host:"localhost",cookie:"sepsis_session="+"A".repeat(43)}});
    expect(()=>requireUser(forged,auth)).toThrow(/đăng nhập/);
    const {token}=auth.login("reader.a","Strong-test-2026!");
    const headers={cookie:`sepsis_session=${token}`};
    expect(requireUser(new Request("http://localhost:3100/api/clinical-state",{headers}),auth).role).toBe("viewer");
    expect(()=>requireUser(new Request("http://localhost:3100/api/cases",{method:"POST",headers}),auth)).toThrow(/quyền xem/);
  });
  it("disables public demo accounts and their already-issued sessions",()=>{
    const demo=setup(true);demo.provision("bacsi.demo1","SepsisDemo2026!","Bác sĩ demo","doctor",true);
    const {token}=demo.login("bacsi.demo1","SepsisDemo2026!");
    const locked=new WebAuth(db!,false);
    expect(locked.session(token)).toBeNull();
    expect(()=>locked.login("bacsi.demo1","SepsisDemo2026!")).toThrow(/không đúng/);
  });
  it("locks repeated bad passwords then permits login after the cooldown",()=>{
    const auth=setup();auth.provision("doctor.a","Strong-test-2026!","Bác sĩ A");
    for(let i=0;i<5;i++)expect(()=>auth.login("doctor.a","bad",1000)).toThrow(/không đúng/);
    expect(()=>auth.login("doctor.a","Strong-test-2026!",2000)).toThrow(/tạm khóa/);
    expect(auth.login("doctor.a","Strong-test-2026!",301001).user.username).toBe("doctor.a");
  });
  it("uses HttpOnly SameSite cookies and Secure for a configured HTTPS deployment",()=>{
    const request=new Request("http://localhost:3100");
    expect(cookieHeader(request,"test")).toContain("HttpOnly; SameSite=Strict");
    vi.stubEnv("SEPSIS_PUBLIC_ORIGIN","https://clinical.example");
    expect(cookieHeader(request,"test")).toContain("; Secure");
  });
  it("provisions a private account with the server tool and revokes sessions when disabled",()=>{
    const base=path.resolve(tmpdir()),dir=mkdtempSync(path.join(base,"sepsis-users-")),file=path.join(dir,"web.sqlite3");
    try {
      db=new ClinicalDatabase(file);
      const env={...process.env,SEPSIS_WEB_DB:file,SEPSIS_USER_PASSWORD:"Private-test-password-2026!"};
      const script=path.resolve("scripts/manage-user.mjs");
      execFileSync(process.execPath,[script,"--username","reader.test","--name","Research reader","--role","viewer"],{env,stdio:"pipe"});
      const auth=new WebAuth(db),{token,user}=auth.login("reader.test",env.SEPSIS_USER_PASSWORD);
      expect(user.role).toBe("viewer");
      execFileSync(process.execPath,[script,"--username","reader.test","--disable"],{env,stdio:"pipe"});
      expect(auth.session(token)).toBeNull();
    } finally {
      db?.close();db=undefined;
      if(!path.resolve(dir).startsWith(base+path.sep))throw new Error("Unexpected temporary directory");
      rmSync(dir,{recursive:true,force:true});
    }
  });
});
