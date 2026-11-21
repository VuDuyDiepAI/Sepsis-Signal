import { webAuth,readSessionToken,cookieHeader } from "@/lib/server/auth";
import { authRequest } from "@/lib/server/auth-http";
import { json } from "@/lib/server/clinical-http";
export async function POST(request: Request) {
  return authRequest(request,()=>{
    webAuth().logout(readSessionToken(request));
    const response=json({ok:true});
    response.headers.set("Set-Cookie",cookieHeader(request,"",0));
    return response;
  });
}
