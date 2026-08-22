import { useState, useEffect, useCallback, useRef } from "react";
import { fetchBusLocations } from "@/services/busLocationService";
import type { Route, BusLocation } from "@/types/route";

type Status = "idle" | "loading" | "success" | "error";

const REFRESH_INTERVAL_MS = 15000; // TAGO 데이터 갱신주기(10~20초)에 맞춤
// 일시적으로 빈 응답이 와도 이전 위치를 잠시 유지해 화면이 깜빡이지 않게 합니다.
const EMPTY_GRACE_MS = 45000;

export function useBusLocations(route: Route | null) {
  const [data, setData] = useState<BusLocation[] | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastNonEmptyRef = useRef<{ locations: BusLocation[]; at: number } | null>(null);

  const load = useCallback(
    async (isBackground: boolean) => {
      if (!route) return;
      if (!isBackground) setStatus("loading");

      try {
        const locations = await fetchBusLocations(route);

        if (locations.length > 0) {
          lastNonEmptyRef.current = { locations, at: Date.now() };
          setData(locations);
        } else {
          // 빈 응답: 최근 유효 데이터가 있으면 유예 시간 동안 유지
          const prev = lastNonEmptyRef.current;
          if (prev && Date.now() - prev.at < EMPTY_GRACE_MS) {
            setData(prev.locations);
          } else {
            setData(locations);
            lastNonEmptyRef.current = null;
          }
        }

        setStatus("success");
        setError(null);
        setLastUpdated(new Date());
      } catch (err) {
        setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
        // 백그라운드 실패 시에는 기존 데이터/상태를 유지해 깜빡임을 줄입니다.
        if (!isBackground) setStatus("error");
      }
    },
    [route]
  );

  useEffect(() => {
    setData(null);
    setLastUpdated(null);
    lastNonEmptyRef.current = null;

    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!route) {
      setStatus("idle");
      return;
    }

    load(false);
    intervalRef.current = setInterval(() => load(true), REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [route, load]);

  return { data, status, error, lastUpdated, retry: () => load(false) };
}
