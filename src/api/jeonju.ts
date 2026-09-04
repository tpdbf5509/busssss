import { parseXml } from "./xml";

export type RawRouteField = Record<string, string>;

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
  if (!SUPABASE_URL) throw new Error("VITE_SUPABASE_URL이 설정되지 않았습니다.");

  const search = new URLSearchParams({
    path: "/realtime/bus_location_bus_position_common",
    brtStdid,
  });
  const url = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/jeonju-proxy?${search.toString()}`;
  const res = await fetch(url, {
    headers: SUPABASE_ANON_KEY
      ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY }
      : undefined,
  });
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
 * 정적 노선 마스터는 Supabase를 단일 소스로 사용합니다.
 * 노선 목록을 만들기 위해 실시간 노선 탐색 API를 호출하지 않습니다.
 *
 * bus_routes_master가 "이 노선이 존재한다"는 확정 목록(454개)이고,
 * bus_routes_cache는 실시간 상세 조회로 채워지는 보강 데이터(brtClass,
 * 배차간격, 노선길이 등)입니다. master에는 있지만 아직 cache가 못 채운
 * 노선도 화면에서 빠지면 안 되므로 master를 기준으로 cache를 덧붙입니다.
 */
export async function getRoutes(): Promise<RawRouteField[]> {
  const [masterRows, cacheRows] = await Promise.all([
    supabaseFetch<{
      brt_stdid: string;
      route_no: string;
      category: string | null;
      start_node: string | null;
      end_node: string | null;
      start_time: string | null;
      end_time: string | null;
    }>(
      "bus_routes_master",
      "select=brt_stdid,route_no,category,start_node,end_node,start_time,end_time&order=route_no.asc"
    ),
    supabaseFetch<{
      brt_id: string | null;
      brt_stdid: string | null;
      brt_class: string | null;
      brt_no: string | null;
      start_name: string | null;
      end_name: string | null;
      raw: RawRouteField;
    }>(
      "bus_routes_cache",
      "select=brt_id,brt_stdid,brt_class,brt_no,start_name,end_name,raw"
    ),
  ]);

  if (masterRows.length === 0 && cacheRows.length === 0) {
    throw new Error("Supabase에 저장된 전주 버스 노선 데이터가 없습니다.");
  }

  const cacheByStdid = new Map(
    cacheRows.filter((row) => row.brt_stdid).map((row) => [row.brt_stdid as string, row])
  );

  const fromMaster = masterRows.map((row) => {
    const cached = cacheByStdid.get(row.brt_stdid);
    return {
      ...(cached?.raw ?? {}),
      brtId: cached?.brt_id ?? "",
      brtStdid: row.brt_stdid,
      brtClass: cached?.brt_class ?? "",
      brtNo: row.route_no,
      brtStartNm: cached?.start_name || row.start_node || "",
      brtEndNm: cached?.end_name || row.end_node || "",
      brtFirsttime: row.start_time ?? "",
      brtLasttime: row.end_time ?? "",
      // master가 본선/분선의 정답(category)을 갖고 있다 — 프론트에서
      // 하드코딩된 배열로 다시 추측하지 않도록 그대로 내려준다.
      category: row.category ?? "",
    };
  });

  const masterStdids = new Set(masterRows.map((row) => row.brt_stdid));
  const cacheOnly = cacheRows
    .filter((row) => row.brt_stdid && !masterStdids.has(row.brt_stdid))
    .map((row) => ({
      ...row.raw,
      brtId: row.brt_id ?? "",
      brtStdid: row.brt_stdid ?? "",
      brtClass: row.brt_class ?? "",
      brtNo: row.brt_no ?? row.brt_id ?? "",
      brtStartNm: row.start_name ?? row.raw?.brtStartNm ?? "",
      brtEndNm: row.end_name ?? row.raw?.brtEndNm ?? "",
    }));

  return [...fromMaster, ...cacheOnly];
}

/**
 * 정류장 순서도 Supabase 캐시를 단일 소스로 사용합니다.
 * 정류장 데이터가 없는 경우 앱에서 실시간 API를 대신 호출하지 않습니다.
 * 누락된 정류장 데이터는 sync-bus-data 유지보수 작업으로 채웁니다.
 */
export async function getRouteStops(routeId: string): Promise<RawRouteField[]> {
  if (!routeId) return [];

  const rows = await supabaseFetch<{
    route_id: string;
    sequence_no: number | null;
    node_id: string | null;
    node_name: string | null;
    raw: RawRouteField;
  }>(
    "bus_route_stops_cache",
    `select=route_id,sequence_no,node_id,node_name,raw&route_id=eq.${encodeURIComponent(routeId)}&order=sequence_no.asc`
  );

  return rows.map((row) => {
    const nodeId = row.node_id ?? row.raw?.nodeid ?? row.raw?.stopStandardid ?? row.raw?.stopId ?? "";
    const nodeName = row.node_name ?? row.raw?.nodenm ?? row.raw?.stopKname ?? "";
    const seq = String(row.sequence_no ?? row.raw?.seq ?? row.raw?.brnSeqno ?? "");

    return {
      ...row.raw,
      brtStdid: row.route_id,
      nodeid: nodeId,
      nodenm: nodeName,
      seq,
      stopStandardid: nodeId || row.raw?.stopStandardid || "",
      stopId: nodeId || row.raw?.stopId || "",
      stopKname: nodeName || row.raw?.stopKname || "",
      brnSeqno: seq || row.raw?.brnSeqno || "",
    };
  });
}

/**
 * 이 정류장(node_id)을 지나는 모든 노선의 route_id를 정적 캐시에서 조회합니다.
 * TAGO 실시간 도착정보로 "경유노선 목록"을 만들면, 그 순간 다가오는 버스가
 * 없는 노선은 목록에서 통째로 빠집니다. 노선-정류장 관계는 자주 안 바뀌는
 * 정적 데이터이므로, 이 관계를 실시간 API가 아니라 캐시에서 직접 구합니다.
 */
export async function getRouteIdsForStop(nodeId: string): Promise<string[]> {
  if (!nodeId) return [];

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
 */
export async function searchStationsCache(query: string): Promise<RawRouteField[]> {
  const q = query.trim();
  if (!q) return [];

  const rows = await supabaseFetch<{ node_id: string; node_name: string; ars_id: string | null }>(
    "bus_stations_cache",
    `select=node_id,node_name,ars_id&node_name=ilike.*${encodeURIComponent(q)}*&order=node_name.asc&limit=30`
  );

  return rows.map((row) => ({
    nodeid: row.node_id,
    nodenm: row.node_name,
    nodeno: row.ars_id ?? "",
  }));
}
