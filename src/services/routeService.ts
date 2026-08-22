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

function firstValue(item: Record<string, string>, keys: string[]): string {
  const entries = Object.entries(item);
  for (const key of keys) {
    const exact = item[key];
    if (exact !== undefined && exact !== null && String(exact).trim() !== "") {
      return String(exact).trim();
    }

    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    const matched = entries.find(([actualKey, value]) => {
      const actual = actualKey.toLowerCase().replace(/[^a-z0-9]/g, "");
      return (
        actual === normalizedKey &&
        value !== undefined &&
        value !== null &&
        String(value).trim() !== ""
      );
    });
    if (matched) return String(matched[1]).trim();
  }
  return "";
}

function formatRouteNumber(raw: RawRouteField): string {
  const id = firstValue(raw, ["brtId", "brt_id", "brtNo", "brt_no"]) || "";
  const candidates = [
    firstValue(raw, ["brtClass", "brt_class"]),
    firstValue(raw, ["brtSubid", "brt_subid", "brtSubId"]),
  ];
  const branch = candidates.find((v) => v && v !== "0" && /^\d+$/.test(v));

  if (branch) return `${id}-${branch}`;
  return id;
}

function mapToRoute(raw: RawRouteField): Route {
  const displayNumber = formatRouteNumber(raw);

  return {
    id: firstValue(raw, ["brtStdid", "brt_stdid", "brtStdId"]) || "",
    number: displayNumber,
    rawNumber: firstValue(raw, ["brtId", "brt_id", "brtNo", "brt_no"]) || "",
    class: firstValue(raw, ["brtClass", "brt_class"]) || "",
    subId: firstValue(raw, ["brtSubid", "brt_subid", "brtSubId"]) || "",
    name: `본선${displayNumber}`,
    start:
      firstValue(raw, [
        "brtSname",
        "brtStartNm",
        "brt_start_nm",
        "start_name",
        "startName",
        "start",
      ]) || "",
    end:
      firstValue(raw, [
        "brtEname",
        "brtEndNm",
        "brt_end_nm",
        "end_name",
        "endName",
        "end",
      ]) || "",
    firstBus: formatTime(firstValue(raw, ["brtFirsttime", "brt_firsttime", "firstTime"])),
    lastBus: formatTime(firstValue(raw, ["brtLasttime", "brt_lasttime", "lastTime"])),
    interval: (() => {
      const min = firstValue(raw, ["brtMininterval", "brt_mininterval", "minInterval"]);
      const max = firstValue(raw, ["brtMaxinterval", "brt_maxinterval", "maxInterval"]);
      return min && max ? `${min}~${max}분` : "정보 없음";
    })(),
    distance: (() => {
      const len = firstValue(raw, ["brtLength", "brt_length", "length"]);
      return len ? `${(Number(len) / 1000).toFixed(1)}km` : "-";
    })(),
  };
}

function mapToBusStop(raw: RawRouteField, index: number): BusStop {
  const id =
    firstValue(raw, [
      "stopStandardid",
      "stopstandardid",
      "stopId",
      "stopid",
      "nodeid",
      "nodeId",
      "bnodeId",
      "bnodeid",
      "node_id",
    ]) || String(index);

  const name =
    firstValue(raw, [
      "stopKname",
      "stopkname",
      "nodenm",
      "nodeNm",
      "nodeName",
      "node_name",
      "stopName",
      "stopname",
      "stationName",
    ]) || "";

  const orderRaw = firstValue(raw, [
    "brnSeqno",
    "brnseqno",
    "brsSeqno",
    "brsseqno",
    "seq",
    "ord",
    "sequence_no",
    "sequenceNo",
    "nodeord",
    "nodeOrder",
  ]);
  const order = Number(orderRaw) || index + 1;

  return { id, name, order };
}

// 전주시 GW의 brtStdid를 실시간 위치 조회에 사용하므로 기존 캐시는 폐기합니다.
const CACHE_KEY = "jeonju_routes_v5";
const CACHE_TTL = 1000 * 60 * 60 * 24;

let routesCache: Route[] | null = null;
let routesPromise: Promise<Route[]> | null = null;
const stopsCache = new Map<string, BusStop[]>();

export async function fetchAllRoutes(): Promise<Route[]> {
  if (routesCache) return routesCache;

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

  if (!routesPromise) {
    routesPromise = fetchRoutesRaw()
      .then((raw) => {
        const routes = raw
          .filter((r) => firstValue(r, ["brtStdid", "brt_stdid", "brtStdId"]))
          .map(mapToRoute);
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
    .map((s, index) => mapToBusStop(s, index))
    .filter((s) => s.name || s.id) // 이름이나 ID가 있는 정류장만
    .sort((a, b) => a.order - b.order);

  // 빈 결과가 나와도 캐시하지 않아 다음에 다시 시도할 수 있게 합니다.
  if (stops.length > 0) {
    stopsCache.set(routeId, stops);
  }
  return stops;
}

export function clearRouteCache() {
  routesCache = null;
  routesPromise = null;
  stopsCache.clear();
  try {
    localStorage.removeItem(CACHE_KEY);
    // 이전 버전 캐시도 정리
    localStorage.removeItem("jeonju_routes_v4");
    localStorage.removeItem("jeonju_routes_v3");
  } catch {}
  console.log("[Cache] 캐시 삭제됨");
}
