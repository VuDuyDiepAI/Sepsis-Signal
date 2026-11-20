import { webAuth,readSessionToken,demoAccounts } from "@/lib/server/auth";
import { authRequest } from "@/lib/server/auth-http";
import { json } from "@/lib/server/clinical-http";
export async function GET(request: Request) {
  return authRequest(request,()=>{
    const auth=webAuth();
    return json({user:auth.session(readSessionToken(request)),demoAccounts:auth.allowDemo?demoAccounts:[]});
  });
}
