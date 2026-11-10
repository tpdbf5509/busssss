import { parseXml } from "./xml";
import { buildProxyRequest, readBackendEnv, usesCloudflare } from "@/api/backend";
import { loadStaticRoutes, loadStaticStops } from "@/api/staticData";
import {
  buildRoutes,
  routeIdsForStop,
  searchStationsInPayload,
  stopRowToRaw,
  stopsForRoute,
  type MasterRow,
  type RawRouteField,
  type RouteCacheRow,
  type StopRow,
} from "@/lib/staticData";

export type { RawRouteField };

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

async function supabaseFetch<T>(table: string, query = ""): Promise<T[]> {
  if (!SUPABASE_URL) throw new Error("VITE_SUPABASE_URL이 설정되지 않았습니다.");
  const url = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY ?? "",
      Authorization: `Bearer ${SUPABASE_ANON_KEY ?? ""}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Supabase 데이터 조회 실패 (HTTP ${res.status})`);
  return res.json() as Promise<T[]>;
}

function collectObjects(value: unknown, out: RawRouteField[] = []): RawRouteField[] {
  if (!value || typeof value !== "object") return out;

  if (Array.isArray(value)) {
    for (const item of value) collectObjects(item, out);
    return out;
  }

  const obj = value as Record<string, unknown>;
  const primitive: RawRouteField = {};

  for (const [key, item] of Object.entries(obj)) {
    if (key === "?xml") continue;
    if (item !== null && item !== undefined && typeof item !== "object") {
      primitive[key] = String(item).trim();
    }
  }

  const keys = Object.keys(primitive);
  const keyText = keys.join(" ").toLowerCase();
  // "car"는 뺐습니다 — 부분 문자열 매칭이라 나중에 API에 "carrierCode" 같은
  // 무관한 필드가 추가되면 버스 위치가 아닌 레코드를 잘못 집어올 위험이 있고,
  // 실제 응답 필드(busNo/BNo/vehicleNo/vehicleid 등)는 vehicle/bus로 이미 잡힙니다.
  const locationHint = [
    "gps", "lat", "lng", "lon", "long", "latitude", "longitude",
    "vehicle", "veh", "bus", "node", "stop", "station",
    "route", "brt", "x", "y"
  ].some((hint) => keyText.includes(hint));

  if (keys.length > 0 && locationHint) out.push(primitive);

  for (const child of Object.values(obj)) collectObjects(child, out);
  return out;
}

/** 전주시 GW: 특정 노선의 현재 운행 버스 위치 */
export async function getBusLocationsByRoute(brtStdid: string): Promise<RawRouteField[]> {
  if (!brtStdid) return [];
  const request = buildProxyRequest(readBackendEnv(), "jeonju", {
    path: "/realtime/bus_location_bus_position_common",
    brtStdid,
  });
  const res = await fetch(request.url, { headers: request.headers });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(text || `전주시 실시간 위치 요청 실패 (HTTP ${res.status})`);

  const parsed = parseXml<unknown>(text);
  const records = collectObjects(parsed);
  const liveBuses = records.filter((item) => {
    const vehicleNo = String(
      item.busNo ?? item.BNo ?? item.vehicleNo ?? item.vehicleid ?? "",
    ).trim();
    return vehicleNo.length > 0;
  });

  console.info("[BUS STOP] Jeonju realtime response", {
    brtStdid,
    stopCount: records.length,
    busCount: liveBuses.length,
    samples: liveBuses.slice(0, 5),
  });

  return liveBuses;
}

/**
 * 정적 노선 목록.
 *
 * Cloudflare 주소(VITE_API_BASE_URL)가 있으면 Worker가 내려주는 routes.json을
 * 하루에 한 번 받아 기기에 저장해 쓰고, 없으면 예전처럼 Supabase에서 읽는다.
 * 합치는 규칙(master 기준, cache 덧붙이기)은 두 경로가 buildRoutes 하나를 쓴다.
 * 노선 목록을 만들기 위해 실시간 노선 탐색 API는 부르지 않는다.
 */
export async function getRoutes(): Promise<RawRouteField[]> {
  if (usesCloudflare(readBackendEnv())) {
    const routes = await loadStaticRoutes();
    if (routes.length === 0) throw new Error("저장된 전주 버스 노선 데이터가 없습니다.");
    return routes;
  }

  const [masterRows, cacheRows] = await Promise.all([
    supabaseFetch<MasterRow>(
      "bus_routes_master",
      "select=brt_stdid,route_no,category,start_node,end_node,start_time,end_time&order=route_no.asc"
    ),
    supabaseFetch<RouteCacheRow>(
      "bus_routes_cache",
      "select=brt_id,brt_stdid,brt_class,brt_no,start_name,end_name,raw"
    ),
  ]);

  if (masterRows.length === 0 && cacheRows.length === 0) {
    throw new Error("Supabase에 저장된 전주 버스 노선 데이터가 없습니다.");
  }

  return buildRoutes(masterRows, cacheRows);
}

/**
 * 노선의 정류장 순서. Cloudflare 주소가 있으면 stops.json(하루 한 번 저장),
 * 없으면 Supabase 캐시를 쓴다. 정류장 데이터가 없어도 실시간 API로 대신
 * 채우지 않는다. 누락은 동기화 작업(sync)으로 채운다.
 */
export async function getRouteStops(routeId: string): Promise<RawRouteField[]> {
  if (!routeId) return [];

  if (usesCloudflare(readBackendEnv())) {
    return stopsForRoute(await loadStaticStops(), routeId);
  }

  const rows = await supabaseFetch<StopRow>(
    "bus_route_stops_cache",
    `select=route_id,sequence_no,node_id,node_name,raw&route_id=eq.${encodeURIComponent(routeId)}&order=sequence_no.asc`
  );

  return rows.map(stopRowToRaw);
}

/**
 * 이 정류장(node_id)을 지나는 모든 노선의 route_id를 정적 캐시에서 조회합니다.
 * TAGO 실시간 도착정보로 "경유노선 목록"을 만들면, 그 순간 다가오는 버스가
 * 없는 노선은 목록에서 통째로 빠집니다. 노선-정류장 관계는 자주 안 바뀌는
 * 정적 데이터이므로, 이 관계를 실시간 API가 아니라 캐시에서 직접 구합니다.
 */
export async function getRouteIdsForStop(nodeId: string): Promise<string[]> {
  if (!nodeId) return [];

  if (usesCloudflare(readBackendEnv())) {
    return routeIdsForStop(await loadStaticStops(), nodeId);
  }

  const rows = await supabaseFetch<{ route_id: string }>(
    "bus_route_stops_cache",
    `select=route_id&node_id=eq.${encodeURIComponent(nodeId)}`
  );

  return Array.from(new Set(rows.map((row) => row.route_id).filter(Boolean)));
}

/**
 * 정류장 이름으로 검색합니다. 예전에는 TAGO 실시간 검색 API를 입력마다
 * 호출했지만, 정류장번호(ARS ID)까지 포함한 이 데이터는 이미
 * bus_stations_cache 뷰(sync-bus-data가 3시간마다 채우는 bus_route_stops_cache를
 * node_id 기준으로 중복 제거한 것)로 우리 DB에 들어있다. 좌표(lat/lng)는
 * 이 정적 데이터에 없지만, 앱 어디서도 정류장 좌표를 실제로 쓰지 않으므로
 * (내 주변 정류장 같은 기능이 없음) 문제가 되지 않는다.
 *
 * query가 비어 있으면 전체 정류장(2,600여 개)을 이름순으로 반환한다 —
 * DB 조회라 TAGO 실시간 검색과 달리 전체 목록을 한 번에 불러와도 비용이
 * 크지 않다.
 */
export async function searchStationsCache(query: string): Promise<RawRouteField[]> {
  if (usesCloudflare(readBackendEnv())) {
    return searchStationsInPayload(await loadStaticStops(), query);
  }

  const q = query.trim();
  const params = q
    ? `select=node_id,node_name,ars_id&node_name=ilike.*${encodeURIComponent(q)}*&order=node_name.asc&limit=30`
    : `select=node_id,node_name,ars_id&order=node_name.asc&limit=3000`;

  const rows = await supabaseFetch<{ node_id: string; node_name: string; ars_id: string | null }>(
    "bus_stations_cache",
    params
  );

  return rows.map((row) => ({
    nodeid: row.node_id,
    nodenm: row.node_name,
    nodeno: row.ars_id ?? "",
  }));
}
