import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchArrivalInfo,
  subscribeArrivalRefresh,
  type ArrivalInfo,
} from "@/services/arrivalService";
import { ArrivalReliabilityTracker, type ReliabilityState } from "@/lib/reliability";
import type { Route } from "@/types/route";

const REFRESH_INTERVAL_MS = 20_000;

const UNKNOWN_RELIABILITY: ReliabilityState = { source: "unknown", delayed: false };

export function useArrivalInfo(
  nodeId?: string,
  routeId?: string,
  routeNumber?: string,
  interval?: string,
  /** 있으면 정거장 수를 GPS 실측 위치로 검증/보정한다(arrivalService 참고). */
  route?: Route,
) {
  const [data, setData] = useState<ArrivalInfo | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [reliability, setReliability] = useState<ReliabilityState>(UNKNOWN_RELIABILITY);
  const hasDataRef = useRef(false);
  const trackerRef = useRef(new ArrivalReliabilityTracker());
  const intervalRef = useRef(interval);
  intervalRef.current = interval;
  // route는 호출부에서 매 렌더마다 새 객체로 넘어올 수 있어(allRoutes에서
  // find로 찾음) ref로 들고 다닌다 — 의존성 배열에 넣으면 폴링이 불필요하게
  // 매번 재시작된다.
  const routeRef = useRef(route);
  routeRef.current = route;
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

        const info = await fetchArrivalInfo(
          nodeId,
          routeId,
          routeNumber,
          { force: opts?.force },
          routeRef.current,
        );

        setReliability(trackerRef.current.update(info?.minutes ?? null, intervalRef.current));

        if (info) {
          setData(info);
          hasDataRef.current = true;
          setStatus("success");
        } else {
          // 예전 값을 그대로 남겨두지 않는다. GPS 검증이 "그 버스는 이미
          // 지나갔다"고 확정한 결과도 여기로 오는데, 화면에 20초 전의
          // "N정거장"을 계속 띄워두면 정확성보다 화면이 안 바뀌는 편안함을
          // 택하는 셈이 된다 — 이 앱에서는 그러면 안 된다.
          setData(null);
          hasDataRef.current = false;
          setStatus("error");
        }
      } catch {
        setData(null);
        hasDataRef.current = false;
        setStatus("error");
      } finally {
        if (opts?.force) setIsRefreshing(false);
      }
    },
    [nodeId, routeId, routeNumber]
  );

  // 최초 로드 + 20초 자동 갱신 (탭이 보일 때만)
  //
  // route는 의존성 배열에 route?.id로 들어간다. HomeScreen은 fetchAllRoutes()가
  // 끝나야 route를 넘길 수 있는데, 그게 이 훅의 첫 load()보다 늦게 끝나면
  // route 없이 한 번 조회돼 TAGO 값이 15초 캐시에 그대로 박힌다 — GPS 검증이
  // 한 번도 못 걸리고 그 캐시가 만료될 때까지 잘못된 "N정거장"이 남는다.
  // route가 나중에라도 채워지면 이 effect를 다시 돌려 캐시를 무시하고
  // 강제로 재조회한다.
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
    load({ force: true });

    const id = setInterval(() => {
      if (!visibleRef.current) return;
      load({ quiet: true });
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(id);
  }, [nodeId, routeId, route?.id, load]);

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
