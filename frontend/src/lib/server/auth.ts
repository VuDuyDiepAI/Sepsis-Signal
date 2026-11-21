import { createHash,randomBytes,randomUUID,scryptSync,timingSafeEqual } from "node:crypto";
import { clinicalDb,ClinicalDatabase,ClinicalError } from "@/lib/server/clinical-db";
import type { SessionUser } from "@/lib/contracts/auth";

export const sessionCookie = "sepsis_session";
const sessionSeconds = 8*3600;
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
const demoPassword = "SepsisDemo2026!";
export const demoAccounts = [
  {username:"bacsi.demo1",displayName:"Bác sĩ trải nghiệm 01",password:demoPassword},
  {username:"bacsi.demo2",displayName:"Bác sĩ trải nghiệm 02",password:demoPassword},
];
function hashPassword(password: string) {
  const salt=randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password,salt,64).toString("hex")}`;
}
function verifyPassword(password: string,encoded: string) {
  const [,salt,expected]=encoded.split("$");
  if (!salt || !expected) return false;
  const actual=scryptSync(password,salt,64), bytes=Buffer.from(expected,"hex");
  return bytes.length===actual.length && timingSafeEqual(actual,bytes);
}
export class WebAuth {
  private dummy = hashPassword(randomBytes(32).toString("hex"));
  constructor(private database: ClinicalDatabase, readonly allowDemo=false) {}
  provision(username: string,password: string,displayName: string,role: SessionUser["role"]="doctor",isDemo=false) {
    const name=username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,80}$/.test(name) || password.length<12 || password.length>200 || !displayName.trim()) throw new Error("Invalid account configuration");
    this.database.db.prepare("INSERT OR IGNORE INTO auth_users VALUES(?,?,?,?,?,?,0)")
      .run(randomUUID(),name,displayName.trim(),hashPassword(password),role,isDemo?1:0);
  }
  login(username: string,password: string,now=Date.now()) {
    const name=username.trim().toLowerCase();
    const attempt=this.database.db.prepare("SELECT * FROM auth_attempts WHERE username=?").get(name);
    if (attempt && Number(attempt.locked_until)>now) throw new ClinicalError("Tài khoản tạm khóa. Vui lòng thử lại sau 5 phút.",429);
    const row=this.database.db.prepare("SELECT * FROM auth_users WHERE username=? AND disabled=0").get(name);
    const valid=verifyPassword(password,row ? String(row.password_hash) : this.dummy);
    if (!row || !valid || (row.is_demo===1 && !this.allowDemo)) {
      const failures=(attempt && Number(attempt.locked_until)===0 ? Number(attempt.failures) : 0)+1;
      this.database.db.prepare("INSERT INTO auth_attempts VALUES(?,?,?) ON CONFLICT(username) DO UPDATE SET failures=excluded.failures,locked_until=excluded.locked_until")
        .run(name,failures,failures>=5?now+5*60000:0);
      throw new ClinicalError("Tên đăng nhập hoặc mật khẩu không đúng.",401);
    }
    this.database.db.prepare("DELETE FROM auth_attempts WHERE username=?").run(name);
    this.database.db.prepare("DELETE FROM auth_sessions WHERE expires_at<=?").run(now);
    const token=randomBytes(32).toString("base64url");
    this.database.db.prepare("INSERT INTO auth_sessions VALUES(?,?,?,?)").run(digest(token),String(row.id),now+sessionSeconds*1000,now);
    return {token,user:this.session(token,now)!};
  }
  session(token: string | undefined,now=Date.now()): SessionUser | null {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const row=this.database.db.prepare(`SELECT u.* FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id
      WHERE s.token_hash=? AND s.expires_at>? AND u.disabled=0`).get(digest(token),now);
    if (!row || (row.is_demo===1 && !this.allowDemo)) return null;
    return {id:String(row.id),username:String(row.username),displayName:String(row.display_name),role:row.role as SessionUser["role"],isDemo:row.is_demo===1};
  }
  logout(token: string | undefined) { if (token) this.database.db.prepare("DELETE FROM auth_sessions WHERE token_hash=?").run(digest(token)); }
}
const instances=new WeakMap<ClinicalDatabase,WebAuth>();
export function webAuth() {
  const db=clinicalDb();
  let auth=instances.get(db);
  if (!auth) {
    const allowDemo=process.env.SEPSIS_DEMO_ACCOUNTS==="1" && !process.env.SEPSIS_PUBLIC_ORIGIN;
    auth=new WebAuth(db,allowDemo);
    if (allowDemo) for (const account of demoAccounts) auth.provision(account.username,account.password,account.displayName,"doctor",true);
    const username=process.env.SEPSIS_BOOTSTRAP_USERNAME,password=process.env.SEPSIS_BOOTSTRAP_PASSWORD;
    if (username && password) auth.provision(username,password,process.env.SEPSIS_BOOTSTRAP_NAME??"Quản trị Sepsis Signal","admin");
    instances.set(db,auth);
  }
  return auth;
}
export function readSessionToken(request: Request) {
  return request.headers.get("cookie")?.split(";").map(s=>s.trim()).find(s=>s.startsWith(sessionCookie+"="))?.slice(sessionCookie.length+1);
}
export function requireUser(request: Request,authentication=webAuth()) {
  const user=authentication.session(readSessionToken(request));
  if (!user) throw new ClinicalError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",401);
  if (!["GET","HEAD"].includes(request.method) && user.role==="viewer") throw new ClinicalError("Tài khoản chỉ có quyền xem dữ liệu.",403);
  return user;
}
export function cookieHeader(request: Request,token: string,maxAge=sessionSeconds) {
  const secure=!!process.env.SEPSIS_PUBLIC_ORIGIN || new URL(request.url).protocol==="https:";
  return `${sessionCookie}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure?"; Secure":""}`;
}
