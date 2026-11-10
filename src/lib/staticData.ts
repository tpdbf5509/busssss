// 정적 노선·정류장 데이터를 만들고 읽는 순수 함수 모음.
//
// 이 파일은 세 곳에서 같이 씁니다. 그래서 import가 하나도 없어야 합니다.
//  1) Cloudflare Worker가 Supabase에서 받은 원본 행을 JSON 두 개로 만들 때
//  2) 앱이 Cloudflare에서 받은 JSON을 화면용 모양으로 풀 때
//  3) Cloudflare 주소가 없을 때 쓰는 Supabase 예비 경로(src/api/jeonju.ts)
// 노선 합치기 규칙이 한 곳에만 있으면 세 경로의 결과가 어긋나지 않습니다.

export type RawRouteField = Record<string, string>;

/** bus_routes_master 한 줄 (앱이 쓰는 열만) */
export interface MasterRow {
  brt_stdid: string;
  route_no: string;
  category: string | null;
  start_node: string | null;
  end_node: string | null;
  start_time: string | null;
  end_time: string | null;
}

/** bus_routes_cache 한 줄 (앱이 쓰는 열만) */
export interface RouteCacheRow {
  brt_id: string | null;
  brt_stdid: string | null;
  brt_class: string | null;
  brt_no: string | null;
  start_name: string | null;
  end_name: string | null;
  raw: RawRouteField;
}

/** bus_route_stops_cache 한 줄 (앱이 쓰는 열만) */
export interface StopRow {
  route_id: string;
  sequence_no: number | null;
  node_id: string | null;
  node_name: string | null;
  raw: RawRouteField;
}

/** Worker가 Supabase에서 받아 가공할 원본 묶음 */
export interface StaticSource {
  master: MasterRow[];
  cache: RouteCacheRow[];
  /** 정류장 줄은 용량을 줄이려고 raw 대신 ARS 번호(raw.stopId)만 받는다 */
  stops: StopSourceRow[];
}

export interface StopSourceRow {
  route_id: string;
  sequence_no: number | null;
  node_id: string | null;
  node_name: string | null;
  /** 정류장 번호(ARS). 없으면 빈 문자열 */
  ars_id: string | null;
}

/**
 * 정류장 파일 모양.
 * 같은 정류장이 여러 노선에 나오므로 정류장 표를 한 번만 두고,
 * 노선마다 "정류장 표 번호 + 순서"만 적어 용량을 줄인다(1/4 수준).
 */
export interface StopsPayload {
  /** [node_id, 이름, ARS 번호] */
  stations: Array<[string, string, string]>;
  /** 노선 brtStdid → [[정류장 표 번호, 순서], ...] (순서 오름차순) */
  routes: Record<string, Array<[number, number]>>;
}

export interface StaticMeta {
  generatedAt: string;
  routeCount: number;
  stationCount: number;
  stopLinkCount: number;
}

/**
 * 노선 목록을 만든다.
 *
 * bus_routes_master가 "이 노선이 존재한다"는 확정 목록이고, bus_routes_cache는
 * 배차간격·노선길이 같은 보강 데이터다. master에는 있지만 cache가 아직 못 채운
 * 노선도 화면에서 빠지면 안 되므로 master를 기준으로 cache를 덧붙인다.
 */
export function buildRoutes(masterRows: MasterRow[], cacheRows: RouteCacheRow[]): RawRouteField[] {
  const cacheByStdid = new Map(
    cacheRows.filter((row) => row.brt_stdid).map((row) => [row.brt_stdid as string, row]),
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
      // master가 본선/분선의 정답(category)을 갖고 있다. 프론트에서
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

/** 원본 정류장 줄을 정류장 파일 모양으로 묶는다. */
export function buildStopsPayload(rows: StopSourceRow[]): StopsPayload {
  // 1) 정류장 표: node_id마다 이름과 ARS 번호를 하나씩 정한다(먼저 나온 비어 있지 않은 값).
  const byNode = new Map<string, { name: string; ars: string }>();
  for (const row of rows) {
    const nodeId = (row.node_id ?? "").trim();
    if (!row.route_id || !nodeId) continue;
    const entry = byNode.get(nodeId) ?? { name: "", ars: "" };
    if (!entry.name && row.node_name) entry.name = row.node_name;
    if (!entry.ars && row.ars_id) entry.ars = row.ars_id;
    byNode.set(nodeId, entry);
  }

  // 이름순(같은 이름은 node_id순)으로 줄을 세워야 정류장 검색이 따로 정렬하지 않아도 된다.
  const stations: StopsPayload["stations"] = Array.from(byNode, ([nodeId, v]) => [nodeId, v.name, v.ars] as [string, string, string])
    .sort((a, b) => a[1].localeCompare(b[1], "ko") || a[0].localeCompare(b[0]));
  const indexByNode = new Map(stations.map((s, i) => [s[0], i]));

  // 2) 노선별 정류장 순서
  const routes: StopsPayload["routes"] = {};
  for (const row of rows) {
    const nodeId = (row.node_id ?? "").trim();
    const idx = indexByNode.get(nodeId);
    if (!row.route_id || idx === undefined) continue;
    (routes[row.route_id] ??= []).push([idx, row.sequence_no ?? 0]);
  }
  for (const list of Object.values(routes)) list.sort((a, b) => a[1] - b[1]);

  return { stations, routes };
}

export function buildMeta(routes: RawRouteField[], stops: StopsPayload, now = new Date()): StaticMeta {
  return {
    generatedAt: now.toISOString(),
    routeCount: routes.length,
    stationCount: stops.stations.length,
    stopLinkCount: Object.values(stops.routes).reduce((sum, list) => sum + list.length, 0),
  };
}

/** 받은 JSON이 정류장 파일 모양인지 가볍게 확인한다. 깨진 파일을 저장하지 않으려는 용도. */
export function isStopsPayload(value: unknown): value is StopsPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<StopsPayload>;
  return Array.isArray(v.stations) && !!v.routes && typeof v.routes === "object" && !Array.isArray(v.routes);
}

export function isRoutesPayload(value: unknown): value is RawRouteField[] {
  return (
    Array.isArray(value) &&
    value.every((item) => item && typeof item === "object" && typeof (item as RawRouteField).brtStdid === "string")
  );
}

/** 한 노선의 정류장을 순서대로 화면용 필드로 푼다. 기존 Supabase 경로와 같은 모양이다. */
export function stopsForRoute(payload: StopsPayload, routeId: string): RawRouteField[] {
  const list = payload.routes[routeId];
  if (!list) return [];
  return list.map(([stationIdx, seq]) => {
    const [nodeId, nodeName] = payload.stations[stationIdx] ?? ["", "", ""];
    return stopRowToRaw({
      route_id: routeId,
      sequence_no: seq,
      node_id: nodeId,
      node_name: nodeName,
      raw: {},
    });
  });
}

/** 정류장 한 줄을 화면용 필드로 바꾼다. Supabase 예비 경로와 새 경로가 같이 쓴다. */
export function stopRowToRaw(row: StopRow): RawRouteField {
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
}

// 노선 → 정류장 표의 거꾸로 색인은 한 번만 만들면 되므로 파일 객체별로 기억해 둔다.
const reverseIndexCache = new WeakMap<StopsPayload, Map<string, string[]>>();

/** 이 정류장(node_id)을 지나는 노선 brtStdid 목록 */
export function routeIdsForStop(payload: StopsPayload, nodeId: string): string[] {
  let index = reverseIndexCache.get(payload);
  if (!index) {
    const stationIdxToNode = payload.stations.map((s) => s[0]);
    index = new Map();
    for (const [routeId, list] of Object.entries(payload.routes)) {
      for (const [stationIdx] of list) {
        const node = stationIdxToNode[stationIdx];
        if (!node) continue;
        const ids = index.get(node);
        if (!ids) index.set(node, [routeId]);
        else if (ids[ids.length - 1] !== routeId) ids.push(routeId);
      }
    }
    reverseIndexCache.set(payload, index);
  }
  return index.get(nodeId) ?? [];
}

/**
 * 정류장 이름 검색. 예전 Supabase 검색(ilike '*질의*', 이름순, 30개)과 같게 맞춘다.
 * 질의가 비어 있으면 전체를 이름순으로 돌려준다(최대 3000개).
 */
export function searchStationsInPayload(payload: StopsPayload, query: string): RawRouteField[] {
  const q = query.trim().toLowerCase();
  const matched = q
    ? payload.stations.filter((s) => s[1].toLowerCase().includes(q))
    : payload.stations;
  const limit = q ? 30 : 3000;
  return matched.slice(0, limit).map(([nodeId, name, ars]) => ({
    nodeid: nodeId,
    nodenm: name,
    nodeno: ars,
  }));
}
