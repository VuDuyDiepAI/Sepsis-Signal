import { api } from "@/shared/api/client";
import { Hub } from "@/shared/context/HubContext";
import { useContext, useEffect, useState } from "react";

export function useLoad<T>(path: string | null, deps: unknown[] = []) {
  const hub = useContext(Hub);
  const accessKey = hub
    ? JSON.stringify([
        hub.user.id,
        hub.user.department_id,
        hub.user.roles,
        hub.user.role_grants,
      ])
    : "public";
  const [loadedAccess, setLoadedAccess] = useState(accessKey);
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    if (!path) {
      setData(null);
      setError("");
      setLoading(false);
      setLoadedAccess(accessKey);
      return;
    }
    setLoading(true);
    api(path)
      .then((x) => {
        if (active) {
          setData(x);
          setError("");
          setLoadedAccess(accessKey);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
        if (active) setData(null);
        if (active) setLoadedAccess(accessKey);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, accessKey, ...deps]);
  const accessChanged = loadedAccess !== accessKey;
  return {
    data: accessChanged ? null : data,
    error: accessChanged ? "" : error,
    loading: accessChanged || loading,
  };
}
