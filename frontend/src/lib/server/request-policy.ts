export function allowedOrigins() {
  const configured=process.env.SEPSIS_PUBLIC_ORIGIN;
  if (configured) {
    const url=new URL(configured);
    if (url.protocol!=="https:" || url.origin!==configured) throw new Error("SEPSIS_PUBLIC_ORIGIN must be an exact HTTPS origin");
    return [url.origin];
  }
  return ["http://localhost:3000","http://127.0.0.1:3000","http://localhost:3100","http://127.0.0.1:3100"];
}
