"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  getDatasetBySource,
  type DataSourceId,
} from "@/lib/workspace-data";

export interface DemoAlertEvent {
  id: string;
  encounterId: string;
  hour: number;
  score: number;
}

export interface DemoContextValue {
  sourceId: DataSourceId;
  setSourceId: (id: DataSourceId) => void;
  demoActive: boolean;
  demoRunning: boolean;
  demoHour: number;
  demoMaxHour: number;
  demoSpeed: 1 | 2;
  liveToast: DemoAlertEvent | null;
  startDemo: () => void;
  togglePause: () => void;
  restartDemo: () => void;
  stopDemo: () => void;
  setDemoHour: (h: number) => void;
  setDemoSpeed: (speed: 1 | 2) => void;
  dismissToast: () => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [sourceId, setSourceIdRaw] = useState<DataSourceId>("vinmec_mock");
  const [demoActive, setDemoActive] = useState(false);
  const [demoRunning, setDemoRunning] = useState(false);
  const [demoHour, setDemoHourRaw] = useState(0);
  const [demoSpeed, setDemoSpeed] = useState<1 | 2>(1);
  const [liveToast, setLiveToast] = useState<DemoAlertEvent | null>(null);
  const demoMaxHour = 12;

  function setSourceId(next: DataSourceId) {
    setSourceIdRaw(next);
    setLiveToast(null);
    if (demoActive) {
      setDemoHourRaw(0);
    }
  }

  function startDemo() {
    setDemoHourRaw(0);
    setLiveToast(null);
    setDemoActive(true);
    setDemoRunning(true);
  }

  function restartDemo() {
    setDemoHourRaw(0);
    setLiveToast(null);
    setDemoActive(true);
    setDemoRunning(true);
  }

  function togglePause() {
    if (!demoActive) {
      startDemo();
      return;
    }
    if (!demoRunning && demoHour >= demoMaxHour) {
      setDemoHourRaw(0);
      setLiveToast(null);
    }
    setDemoRunning((v) => !v);
  }

  function stopDemo() {
    setDemoActive(false);
    setDemoRunning(false);
    setLiveToast(null);
  }

  function setDemoHour(h: number) {
    setDemoRunning(false);
    setDemoHourRaw(Math.max(0, Math.min(demoMaxHour, h)));
  }

  useEffect(() => {
    if (!demoActive || !demoRunning) return;
    const ms = demoSpeed === 2 ? 900 : 1800;
    const ds = getDatasetBySource(sourceId);

    const timer = window.setInterval(() => {
      setDemoHourRaw((prev) => {
        if (prev >= demoMaxHour) {
          setDemoRunning(false);
          return prev;
        }
        const next = prev + 1;
        // Detect any encounter crossing threshold for the FIRST time at `next`
        const newlyCrossed = ds.predictions.filter((p) => {
          if (p.hour !== next || p.score < p.threshold) return false;
          const hadEarlier = ds.predictions.some(
            (q) =>
              q.encounterId === p.encounterId &&
              q.hour < next &&
              q.score >= q.threshold,
          );
          return !hadEarlier;
        });
        if (newlyCrossed.length > 0) {
          const top = newlyCrossed.sort((a, b) => b.score - a.score)[0];
          setLiveToast({
            id: `${top.encounterId}:${next}`,
            encounterId: top.encounterId,
            hour: next,
            score: top.score,
          });
        }
        if (next >= demoMaxHour) {
          setDemoRunning(false);
        }
        return next;
      });
    }, ms);

    return () => window.clearInterval(timer);
  }, [demoActive, demoRunning, demoSpeed, sourceId, demoMaxHour]);

  return (
    <DemoContext.Provider
      value={{
        sourceId,
        setSourceId,
        demoActive,
        demoRunning,
        demoHour,
        demoMaxHour,
        demoSpeed,
        liveToast,
        startDemo,
        togglePause,
        restartDemo,
        stopDemo,
        setDemoHour,
        setDemoSpeed,
        dismissToast: () => setLiveToast(null),
      }}
    >
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo() {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("DemoProvider required");
  return ctx;
}

export function useDemoOptional() {
  return useContext(DemoContext);
}
