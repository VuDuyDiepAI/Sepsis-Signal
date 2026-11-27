import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from "react-router";
import { AuthProvider } from "@/components/providers/auth-provider";
import { ReviewProvider } from "@/components/providers/review-provider";
import { AuthBoundary } from "@/components/auth/auth-boundary";
import Login from "@/features/auth/login-page";
import Registry from "@/features/patients/registry-page";
import NewCase from "@/features/patients/new-case-page";
import Evaluation from "@/features/evaluation/evaluation-page";
import Replay from "@/features/replay/replay-page";
import { MonitoringScreen } from "@/features/monitoring/monitoring-screen";
import { ManualCaseScreen } from "@/features/patients/manual-case-screen";
import { PatientScreen } from "@/features/patients/patient-screen";
import NotFound from "@/components/shared/not-found";
import { dataset } from "@/lib/clinical/data";
import { predictionHour } from "@/lib/clinical/time";
import { safeReturnTo } from "@/lib/clinical/navigation";

function PatientRoute() {
  const { id = "" } = useParams();
  const { search } = useLocation();
  const query = new URLSearchParams(search);
  const returnTo = safeReturnTo(query.get("returnTo") ?? undefined);
  if (id.startsWith("HS-")) {
    const hour = predictionHour(query.get("hour"), -1);
    return <ManualCaseScreen key={`${id}:${hour}`} id={id} initialHour={hour >= 0 ? hour : undefined} returnTo={returnTo}/>;
  }
  const encounter = dataset.encounters.find((value) => value.id === id);
  if (!encounter) return <NotFound/>;
  const hour = predictionHour(query.get("hour"), encounter.currentHour);
  return <PatientScreen key={`${id}:${hour}`} encounter={encounter} initialHour={hour} returnTo={returnTo}/>;
}

function LegacyAlerts() {
  const query = new URLSearchParams(useLocation().search), next = new URLSearchParams();
  for (const key of ["scope", "review", "search", "department"]) {
    const value = query.get(key);
    if (value !== null) next.set(key, value);
  }
  return <Navigate replace to={`/dashboard${next.size ? "?" + next : ""}`}/>;
}

export function App() {
  return <BrowserRouter><AuthProvider><ReviewProvider><AuthBoundary>
    <Routes>
      <Route path="/" element={<Navigate replace to="/dashboard"/>}/>
      <Route path="/login" element={<Login/>}/>
      <Route path="/dashboard" element={<MonitoringScreen/>}/>
      <Route path="/patients" element={<Registry/>}/>
      <Route path="/patients/new" element={<NewCase/>}/>
      <Route path="/patients/:id" element={<PatientRoute/>}/>
      <Route path="/sample-cases" element={<Replay/>}/>
      <Route path="/model-monitoring" element={<Evaluation/>}/>
      <Route path="/alerts" element={<LegacyAlerts/>}/>
      <Route path="*" element={<NotFound/>}/>
    </Routes>
  </AuthBoundary></ReviewProvider></AuthProvider></BrowserRouter>;
}
