import { getSttnNoList, getSttnAcctoArvlPrearngeInfoList } from "@/api/tago";
import { resolveDirections } from "@/services/busLocationService";
import type { Route } from "@/types/route";

export interface ArrivalInfo {
  minutes: number;   // 도착까지 남은 분
  stopsAway: number;  // 남은 정류장 수
}

function normalize(s: string): string {
  return (s ?? "").replace(/\s+/g, "").replace(/\(.*?\)/g, "").trim();
}

const nodeIdCache = new Map<string, string>();

// 같은 정류장/노선 요청을 짧은 시간 동안 합쳐서 TAGO/Supabase 프록시의
// 중복 요청과 504 Gateway Timeout을 줄입니다.
const ARRIVAL_CACHE_TTL_MS = 5_000;
const arrivalCache = new Map<string, { value: ArrivalInfo | null; expiresAt: number }>();
const arrivalInFlight = new Map<string, Promise<ArrivalInfo | null>>();
const routeDirectionsCache = new Map<string, RouteDirectionCache>();

type RouteDirectionCache = {
  directions: Awaited<ReturnType<typeof resolveDirections>>;
  expiresAt: number;
};

/** 정류장 이름으로 TAGO 정류소ID(nodeId)를 찾습니다. */
export async function resolveNodeId(stopName: string): Promise<string | null> {
  const key = normalize(stopName);
  if (!key) return null;

  const cached = nodeIdCache.get(key);
  if (cached) return cached;

  const results = await getSttnNoList(stopName);
  const matched = results.find((r) => normalize(r.nodenm ?? "") === key) ?? results[0];
  if (!matched?.nodeid) return null;

  nodeIdCache.set(key, matched.nodeid);
  return matched.nodeid;
}

/** 우리 앱 Route를 TAGO 노선ID로 변환합니다. */
export async function resolveRouteId(route: Route): Promise<string | null> {
  const key = `${route.number}|${normalize(route.start)}|${normalize(route.end)}`;
  const now = Date.now();
  const cached = routeDirectionsCache.get(key);

  if (cached && cached.expiresAt > now) {
    return cached.directions[0]?.routeId ?? null;
  }

  const directions = await resolveDirections(route);
  routeDirectionsCache.set(key, {
    directions,
    expiresAt: now + 60_000,
  });

  return directions[0]?.routeId ?? null;
}

/** 특정 정류장 + 특정 노선의 실시간 도착예정정보를 조회합니다. */
export async function fetchArrivalInfo(
  nodeId: string,
  routeId: string
): Promise<ArrivalInfo | null> {
  const key = `${nodeId}|${routeId}`;
  const now = Date.now();

  const cached = arrivalCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  // 같은 요청이 이미 진행 중이면 새 HTTP 요청을 만들지 않고 기존 요청을 공유합니다.
  const running = arrivalInFlight.get(key);
  if (running) return running;

  const request = (async (): Promise<ArrivalInfo | null> => {
    try {
      const items = await getSttnAcctoArvlPrearngeInfoList(nodeId, routeId);
      const item = items.find((i) => i.routeid === routeId) ?? items[0];
      if (!item) return null;

      const arrtime = Number(item.arrtime1 ?? item.arrtime);
      const stopsAway = Number(item.arrprevstationcnt1 ?? item.arrprevstationcnt);
      if (!arrtime || isNaN(arrtime)) return null;

      return {
        minutes: Math.max(0, Math.round(arrtime / 60)),
        stopsAway: isNaN(stopsAway) ? 0 : stopsAway,
      };
    } catch (error) {
      console.warn("[BUS STOP] Arrival request failed; keeping previous value", {
        nodeId,
        routeId,
        error,
      });
      return null;
    }
  })();

  arrivalInFlight.set(key, request);

  try {
    const value = await request;
    // 성공뿐 아니라 null도 짧게 캐시하여 504 직후 즉시 같은 요청을 반복하지 않습니다.
    arrivalCache.set(key, {
      value,
      expiresAt: Date.now() + ARRIVAL_CACHE_TTL_MS,
    });
    return value;
  } finally {
    arrivalInFlight.delete(key);
  }
}
