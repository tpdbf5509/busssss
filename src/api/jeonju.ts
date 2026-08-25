import { parseXml } from "./xml";

export type RawRouteField = Record<string, string>;

interface ApiEnvelope {
  RFC30?: {
    code?: string;
    msg?: string;
    routeList?: { list?: RawRouteField[] };
  };
}

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
  const locationHint = [
    "gps", "lat", "lng", "lon", "long", "latitude", "longitude",
    "vehicle", "veh", "bus", "car", "node", "stop", "station",
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
 */
export async function getRoutes(): Promise<RawRouteField[]> {
  const rows = await supabaseFetch<{
    brt_id: string | null;
    brt_stdid: string | null;
    brt_class: string | null;
    brt_no: string | null;
    start_name: string | null;
    end_name: string | null;
    raw: RawRouteField;
  }>(
    "bus_routes_cache",
    "select=brt_id,brt_stdid,brt_class,brt_no,start_name,end_name,raw&order=brt_no.asc"
  );

  if (rows.length === 0) {
    throw new Error("Supabase에 저장된 전주 버스 노선 데이터가 없습니다.");
  }

  return rows.map((row) => ({
    ...row.raw,
    brtId: row.brt_id ?? "",
    brtStdid: row.brt_stdid ?? "",
    brtClass: row.brt_class ?? "",
    brtNo: row.brt_no ?? row.brt_id ?? "",
    brtStartNm: row.start_name ?? row.raw?.brtStartNm ?? "",
    brtEndNm: row.end_name ?? row.raw?.brtEndNm ?? "",
  }));
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
