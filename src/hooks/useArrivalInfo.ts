import { useState, useEffect, useCallback, useRef } from "react";
import { fetchArrivalInfo, type ArrivalInfo } from "@/services/arrivalService";

const REFRESH_INTERVAL_MS = 20000;

export function useArrivalInfo(nodeId?: string, routeId?: string, routeNumber?: string) {
  const [data, setData] = useState<ArrivalInfo | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const hasDataRef = useRef(false);

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!nodeId || !routeId) return;
    try {
      // 이미 표시 중인 값이 있으면 "조회 중"으로 깜빡이지 않습니다.
      if (!opts?.quiet && !hasDataRef.current) {
        setStatus("loading");
      }
      const info = await fetchArrivalInfo(nodeId, routeId, routeNumber);
      if (info) {
        setData(info);
        hasDataRef.current = true;
        setStatus("success");
      } else if (!hasDataRef.current) {
        setStatus("error");
      }
      // 이전 값이 있으면 실패해도 그대로 유지
    } catch {
      if (!hasDataRef.current) setStatus("error");
    }
  }, [nodeId, routeId, routeNumber]);

  useEffect(() => {
    if (!nodeId || !routeId) {
      setStatus("idle");
      setData(null);
      hasDataRef.current = false;
      return;
    }

    hasDataRef.current = false;
    setData(null);
    setStatus("loading");
    load();

    const id = setInterval(() => load({ quiet: true }), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [nodeId, routeId, load]);

  return { data, status, refresh: () => load({ quiet: hasDataRef.current }) };
}
