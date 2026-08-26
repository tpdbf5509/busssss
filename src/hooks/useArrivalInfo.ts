import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchArrivalInfo,
  subscribeArrivalRefresh,
  type ArrivalInfo,
} from "@/services/arrivalService";
import { ArrivalReliabilityTracker, type ReliabilityState } from "@/lib/reliability";

const REFRESH_INTERVAL_MS = 20_000;

const UNKNOWN_RELIABILITY: ReliabilityState = { source: "unknown", delayed: false };

export function useArrivalInfo(
  nodeId?: string,
  routeId?: string,
  routeNumber?: string,
  interval?: string,
) {
  const [data, setData] = useState<ArrivalInfo | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [reliability, setReliability] = useState<ReliabilityState>(UNKNOWN_RELIABILITY);
  const hasDataRef = useRef(false);
  const trackerRef = useRef(new ArrivalReliabilityTracker());
  const intervalRef = useRef(interval);
  intervalRef.current = interval;
  const visibleRef = useRef(
    typeof document === "undefined" ? true : document.visibilityState !== "hidden"
  );

  const load = useCallback(
    async (opts?: { quiet?: boolean; force?: boolean }) => {
      if (!nodeId || !routeId) return;
      const quiet = opts?.quiet === true || hasDataRef.current;
      try {
        if (!quiet) setStatus("loading");
        if (opts?.force) setIsRefreshing(true);

        const info = await fetchArrivalInfo(nodeId, routeId, routeNumber, {
          force: opts?.force,
        });

        setReliability(trackerRef.current.update(info?.minutes ?? null, intervalRef.current));

        if (info) {
          setData(info);
          hasDataRef.current = true;
          setStatus("success");
        } else if (!hasDataRef.current) {
          setStatus("error");
        }
      } catch {
        if (!hasDataRef.current) setStatus("error");
      } finally {
        if (opts?.force) setIsRefreshing(false);
      }
    },
    [nodeId, routeId, routeNumber]
  );

  // 최초 로드 + 20초 자동 갱신 (탭이 보일 때만)
  useEffect(() => {
    if (!nodeId || !routeId) {
      setStatus("idle");
      setData(null);
      hasDataRef.current = false;
      trackerRef.current.reset();
      setReliability(UNKNOWN_RELIABILITY);
      return;
    }

    hasDataRef.current = false;
    trackerRef.current.reset();
    setReliability(UNKNOWN_RELIABILITY);
    setData(null);
    setStatus("loading");
    load();

    const id = setInterval(() => {
      if (!visibleRef.current) return;
      load({ quiet: true });
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(id);
  }, [nodeId, routeId, load]);

  // 수동 새로고침 구독 (홈 새로고침 버튼 → remount 없이 갱신)
  useEffect(() => {
    if (!nodeId || !routeId) return;
    return subscribeArrivalRefresh(() => load({ quiet: true, force: true }));
  }, [nodeId, routeId, load]);

  // 백그라운드에서는 자동 갱신 중단, 다시 보이면 즉시 1회 갱신
  useEffect(() => {
    if (typeof document === "undefined") return;

    const onVisibility = () => {
      const visible = document.visibilityState !== "hidden";
      visibleRef.current = visible;
      if (visible && nodeId && routeId) {
        load({ quiet: true });
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [nodeId, routeId, load]);

  return {
    data,
    status,
    isRefreshing,
    reliability,
    refresh: () => load({ quiet: hasDataRef.current, force: true }),
  };
}
