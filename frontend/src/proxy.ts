import { NextResponse,type NextRequest } from "next/server";
// Optimistic page redirect only. Every data API independently validates the stored session and role.
export function proxy(request:NextRequest) {
  if(!request.cookies.has("sepsis_session")) {
    const url=new URL("/login",request.url);
    url.searchParams.set("next",request.nextUrl.pathname+request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
export const config={matcher:["/dashboard/:path*","/patients/:path*","/alerts/:path*","/sample-cases/:path*","/model-monitoring/:path*"]};
