import { Suspense } from "react";
import { MonitoringScreen } from "@/components/clinical/monitoring-screen";
import Loading from "@/app/loading";
export default function Dashboard() {
  return (
    <Suspense fallback={<Loading />}>
      <MonitoringScreen />
    </Suspense>
  );
}
