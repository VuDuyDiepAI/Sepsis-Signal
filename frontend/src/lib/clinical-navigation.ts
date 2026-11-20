export function safeReturnTo(raw?: string): string {
  if (typeof raw !== "string" || raw.length > 1500 || !raw.startsWith("/"))
    return "/patients";
  try {
    const url = new URL(raw, "https://sepsis.invalid");
    if (
      url.origin === "https://sepsis.invalid" &&
      ["/dashboard", "/patients"].includes(url.pathname)
    )
      return url.pathname + url.search;
  } catch {}
  return "/patients";
}
export function patientHref(id: string, hour: number, returnTo?: string) {
  return (
    `/patients/${encodeURIComponent(id)}?hour=${hour}` +
    (returnTo ? `&returnTo=${encodeURIComponent(safeReturnTo(returnTo))}` : "")
  );
}
