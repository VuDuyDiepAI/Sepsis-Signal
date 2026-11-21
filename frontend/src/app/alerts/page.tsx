import { redirect } from "next/navigation";
import { Suspense } from "react";
import Loading from "@/app/loading";
type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
export default function Alerts(props: Props) {
  return (
    <Suspense fallback={<Loading />}>
      <LegacyAlerts {...props} />
    </Suspense>
  );
}
async function LegacyAlerts({ searchParams }: Props) {
  const source = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["scope", "review", "search", "department"]) {
    const value = source[key];
    if (typeof value === "string") query.set(key, value);
  }
  return redirect("/dashboard" + (query.size ? "?" + query.toString() : ""));
}
