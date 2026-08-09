import {
  getRoutes as fetchRoutesRaw,
  getRouteStops as fetchStopsRaw,
  type RawRouteField,
} from "@/api/jeonju";
import type { Route, BusStop } from "@/types/route";

function formatTime(raw?: string): string {
  if (!raw) return "-";
  const padded = raw.padStart(4, "0");
  return `${padded.slice(0, 2)}:${padded.slice(2, 4)}`;
}

function formatRouteNumber(raw: RawRouteField): string {
  const id = raw.brtId ?? "";
  // 숫자로 된 분선만 붙임 (A, B, C 같은 영어는 무시)
  const candidates = [raw.brtClass, raw.brtSubid];
  const branch = candidates.find(
    (v) => v && v !== "0" && /^\d+$/.test(v)
  );

  if (branch) {
    return `${id}-${branch}`;
  }
  return id;
}

function mapToRoute(raw: RawRouteField): Route {
  console.log("RAW ROUTE FIELDS:", raw);
  const displayNumber = formatRouteNumber(raw);

  return {
    id: raw.brtStdid ?? "",
    number: displayNumber,           // 예: "3-1", "62", "5-5"
    rawNumber: raw.brtId ?? "",      // 예: "3"
    class: raw.brtClass ?? "",
    subId: raw.brtSubid ?? "",
    name: `본선${displayNumber}`,    // 예: "본선3-1"
    start: raw.brtSname ?? "",
    end: raw.brtEname ?? "",
    firstBus: formatTime(raw.brtFirsttime),
    lastBus: formatTime(raw.brtLasttime),
    interval:
      raw.brtMininterval && raw.brtMaxinterval
        ? `${raw.brtMininterval}~${raw.brtMaxinterval}분`
        : "정보 없음",
    distance: raw.brtLength
      ? `${(Number(raw.brtLength) / 1000).toFixed(1)}km`
      : "-",
  };
}

function mapToBusStop(raw: RawRouteField, index: number): BusStop {
  return {
    id: raw.stopStandardid || raw.stopId || String(index),
    name: raw.stopKname ?? "",
    order: Number(raw.brnSeqno) || index + 1,
  };
}

const CACHE_KEY = "jeonju_routes_v3";
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24시간

let routesCache: Route[] | null = null;
let routesPromise: Promise<Route[]> | null = null;
const stopsCache = new Map<string, BusStop[]>();

export async function fetchAllRoutes(): Promise<Route[]> {
  // 1. 메모리 캐시
  if (routesCache) return routesCache;

  // 2. localStorage 캐시 (최우선)
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_TTL && Array.isArray(data) && data.length > 0) {
        console.log(`[Cache] localStorage에서 노선 ${data.length}개 로드`);
        routesCache = data;
        return data;
      }
    }
  } catch {}

  // 3. API 호출 (캐시가 없을 때만)
  if (!routesPromise) {
    routesPromise = fetchRoutesRaw()
      .then((raw) => {
        const routes = raw.filter((r) => r.brtStdid).map(mapToRoute);
        routesCache = routes;

        try {
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ data: routes, timestamp: Date.now() })
          );
          console.log(`[Cache] 노선 ${routes.length}개 저장 완료`);
        } catch {}

        return routes;
      })
      .catch((err) => {
        routesPromise = null;
        console.error("[API] 노선 조회 실패:", err.message);
        throw err;
      });
  }

  return routesPromise;
}

export async function fetchStopsForRoute(routeId: string): Promise<BusStop[]> {
  const cached = stopsCache.get(routeId);
  if (cached) return cached;

  const raw = await fetchStopsRaw(routeId);
  const stops = raw
    .filter((s) => s.stopStandardid || s.stopId)
    .map(mapToBusStop)
    .sort((a, b) => a.order - b.order);

  stopsCache.set(routeId, stops);
  return stops;
}

export function clearRouteCache() {
  routesCache = null;
  routesPromise = null;
  stopsCache.clear();
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {}
  console.log("[Cache] 캐시 삭제됨");
}