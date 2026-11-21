import { z } from "zod";
import { webAuth,readSessionToken,cookieHeader } from "@/lib/server/auth";
import { authRequest } from "@/lib/server/auth-http";
import { readBody,json } from "@/lib/server/clinical-http";
const schema=z.object({username:z.string().trim().min(3).max(80),password:z.string().min(1).max(200)});
export async function POST(request: Request) {
  return authRequest(request,async()=>{
    const v=schema.parse(await readBody(request));
    const auth=webAuth(),result=auth.login(v.username,v.password);
    auth.logout(readSessionToken(request));
    const response=json({user:result.user});
    response.headers.set("Set-Cookie",cookieHeader(request,result.token));
    return response;
  });
}
