import { useState, useEffect, useCallback, useRef } from "react";
import { fetchArrivalInfo, type ArrivalInfo } from "@/services/arrivalService";

const REFRESH_INTERVAL_MS = 20000;

export function useArrivalInfo(nodeId?: string, routeId?: string, routeNumber?: string) {
  const [data, setData] = useState<ArrivalInfo | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!nodeId || !routeId) return;
    try {
      setStatus("loading");
      const info = await fetchArrivalInfo(nodeId, routeId, routeNumber);
      setData(info);
      setStatus(info ? "success" : "error");
    } catch {
      setStatus("error");
    }
  }, [nodeId, routeId, routeNumber]);

  useEffect(() => {
    if (!nodeId || !routeId) {
      setStatus("idle");
      return;
    }
    setStatus("loading");
    load();
    intervalRef.current = setInterval(load, REFRESH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [nodeId, routeId, load]);

  return { data, status, refresh: load };
}
