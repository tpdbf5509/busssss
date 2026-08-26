import {
  getRoutes as fetchRoutesRaw,
  getRouteStops as fetchStopsRaw,
  getRouteIdsForStop,
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
  // 중요: 표시용 노선번호는 brt_id가 아니라 DB에 저장된 brt_no를 우선 사용합니다.
  // brt_id는 전주시 내부 노선 식별자이므로 화면에 그대로 표시하면 안 됩니다.
  const routeNumber = firstValue(raw, ["brtNo", "brt_no"]);
  const id = firstValue(raw, ["brtId", "brt_id"]) || routeNumber || "";

  const candidates = [
    firstValue(raw, ["brtClass", "brt_class"]),
    firstValue(raw, ["brtSubid", "brt_subid", "brtSubId"]),
  ];
  const branch = candidates.find((v) => v && v !== "0" && /^\d+$/.test(v));

  if (routeNumber) {
    // bus_routes_master의 route_no("103-1"처럼 분기 번호가 이미 포함된 값)를
    // 쓸 때는 brtClass를 또 붙이면 "103-1-1"처럼 중복된다. routeNumber에
    // 이미 "-숫자" 형태의 분기 표기가 있으면 다시 붙이지 않는다.
    const hasBranchSuffix = /-\d+$/.test(routeNumber);
    return !hasBranchSuffix && branch ? `${routeNumber}-${branch}` : routeNumber;
  }

  if (branch) return `${id}-${branch}`;
  return id;
}

function mapToRoute(raw: RawRouteField): Route {
  const displayNumber = formatRouteNumber(raw);

  return {
    id: firstValue(raw, ["brtStdid", "brt_stdid", "brtStdId"]) || "",
    number: displayNumber,
    rawNumber: firstValue(raw, ["brtNo", "brt_no", "brtId", "brt_id"]) || "",
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

// Supabase를 정적 노선 데이터의 단일 소스로 사용합니다.
// 브라우저 localStorage에 별도의 노선 목록을 저장하지 않아 DB 변경이 즉시 반영됩니다.
let routesCache: Route[] | null = null;
let routesPromise: Promise<Route[]> | null = null;
const stopsCache = new Map<string, BusStop[]>();

export async function fetchAllRoutes(): Promise<Route[]> {
  if (routesCache) return routesCache;

  if (!routesPromise) {
    routesPromise = fetchRoutesRaw()
      .then((raw) => {
        const routes = raw
          .filter((r) => firstValue(r, ["brtStdid", "brt_stdid", "brtStdId"]))
          .map(mapToRoute);
        routesCache = routes;
        console.log(`[DB] Supabase에서 노선 ${routes.length}개 로드`);
        return routes;
      })
      .catch((err) => {
        routesPromise = null;
        console.error("[DB] 노선 조회 실패:", err.message);
        throw err;
      });
  }

  return routesPromise;
}

/**
 * 이 정류장을 지나는 모든 노선을 정적 캐시에서 조회합니다(실시간 API 미사용).
 * nodeId는 전주시 표준 노드ID(bus_route_stops_cache.node_id)와 같은 숫자
 * 스킴이어야 합니다. TAGO의 nodeid("JUB..." 접두사)를 넘길 경우 호출부에서
 * 접두사를 제거해서 넘겨야 합니다.
 */
export async function fetchRoutesForStop(nodeId: string): Promise<Route[]> {
  if (!nodeId) return [];

  const [routeIds, allRoutes] = await Promise.all([
    getRouteIdsForStop(nodeId),
    fetchAllRoutes(),
  ]);

  const idSet = new Set(routeIds);
  return allRoutes
    .filter((route) => idSet.has(route.id))
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
}

/**
 * 전주시 GW가 내려주는 brtStdid가 실제 방향과 어긋나는 일부 노선 보정.
 * 실시간 위치 조회뿐 아니라 정류장(실제 노선) 조회에도 동일하게 적용합니다.
 * 키: "노선번호|기점|종점"
 */
const BRT_STDID_OVERRIDES: Record<string, string> = {
  "104|송천동종점|평화동종점": "305001095",
};

function normalizeName(value: string): string {
  return (value ?? "").replace(/\s+/g, "").trim();
}

/** 방향에 맞는 전주시 brtStdid를 반환합니다. */
export function resolveJeonjuBrtStdid(route: Pick<Route, "id" | "number" | "start" | "end">): string {
  const key = `${route.number}|${normalizeName(route.start)}|${normalizeName(route.end)}`;
  return BRT_STDID_OVERRIDES[key] ?? route.id;
}

/**
 * 노선 경유 정류장 목록을 조회합니다.
 * Route 객체를 넘기면 방향별 brtStdid 보정이 적용됩니다.
 */
export async function fetchStopsForRoute(
  routeOrId: string | Pick<Route, "id" | "number" | "start" | "end">,
): Promise<BusStop[]> {
  let routeId: string;
  if (typeof routeOrId === "string") {
    const fromCache = routesCache?.find((r) => r.id === routeOrId);
    routeId = fromCache ? resolveJeonjuBrtStdid(fromCache) : routeOrId;
  } else {
    routeId = resolveJeonjuBrtStdid(routeOrId);
  }

  const cacheKey =
    typeof routeOrId === "string"
      ? `${routeOrId}|${routeId}`
      : `${routeOrId.number}|${normalizeName(routeOrId.start)}|${normalizeName(routeOrId.end)}|${routeId}`;

  const cached = stopsCache.get(cacheKey);
  if (cached) return cached;

  const raw = await fetchStopsRaw(routeId);
  const stops = raw
    .map((s, index) => mapToBusStop(s, index))
    .filter((s) => s.name || s.id)
    .sort((a, b) => a.order - b.order);

  if (stops.length > 0) {
    stopsCache.set(cacheKey, stops);
  }
  return stops;
}

export function clearRouteCache() {
  routesCache = null;
  routesPromise = null;
  stopsCache.clear();
  console.log("[DB] 메모리 노선 캐시 삭제됨");
}