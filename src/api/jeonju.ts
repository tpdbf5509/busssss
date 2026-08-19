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

async function callApi(path: string, params: Record<string, string> = {}): Promise<RawRouteField[]> {
  if (!SUPABASE_URL) throw new Error("VITE_SUPABASE_URL이 설정되지 않았습니다.");
  const search = new URLSearchParams({ path, ...params });
  const url = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/jeonju-proxy?${search.toString()}`;
  const res = await fetch(url, {
    headers: SUPABASE_ANON_KEY
      ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY }
      : undefined,
  });
  if (!res.ok) throw new Error((await res.text().catch(() => "")) || `전주시 API 요청 실패 (HTTP ${res.status})`);
  const json = parseXml<ApiEnvelope>(await res.text());
  const body = json.RFC30;
  if (!body) throw new Error("응답 형식 오류");
  if (body.code && body.code !== "000") throw new Error(body.msg || `오류 코드: ${body.code}`);
  return body.routeList?.list ?? [];
}

export async function getRoutes(): Promise<RawRouteField[]> {
  // 정상 상태에서는 Supabase에 미리 저장된 노선을 즉시 사용합니다.
  try {
    const rows = await supabaseFetch<{
      brt_id: string | null;
      brt_stdid: string | null;
      brt_class: string | null;
      brt_no: string | null;
      start_name: string | null;
      end_name: string | null;
      raw: RawRouteField;
    }>("bus_routes_cache", "select=brt_id,brt_stdid,brt_class,brt_no,start_name,end_name,raw&order=brt_no.asc");

    if (rows.length > 0) {
      return rows.map((row) => ({
        ...row.raw,
        brtId: row.brt_id ?? "",
        brtStdid: row.brt_stdid ?? "",
        brtClass: row.brt_class ?? "",
        brtNo: row.brt_no ?? "",
        brtStartNm: row.start_name ?? row.raw?.brtStartNm ?? "",
        brtEndNm: row.end_name ?? row.raw?.brtEndNm ?? "",
      }));
    }
  } catch (error) {
    console.warn("[BUS] Supabase 노선 캐시 조회 실패, 서버 프록시로 전환", error);
  }

  // DB가 아직 비어 있는 최초 실행에서는 기존 프록시를 사용합니다.
  const idList = await callApi("/bus_location_all_common");
  const uniquePairs = Array.from(
    new Map(idList.filter((r) => r.brtId).map((r) => [`${r.brtId}-${r.brtClass}`, r])).values()
  );
  const results = await Promise.all(
    uniquePairs.map(async (pair) => {
      try {
        return await callApi("/bus_location1_common", { brtId: pair.brtId, brtClass: pair.brtClass });
      } catch {
        return [] as RawRouteField[];
      }
    })
  );
  return results.flat();
}

export async function getRouteStops(routeId: string): Promise<RawRouteField[]> {
  try {
    const rows = await supabaseFetch<{
      route_id: string;
      sequence_no: number | null;
      node_id: string | null;
      node_name: string | null;
      raw: RawRouteField;
    }>("bus_route_stops_cache", `select=route_id,sequence_no,node_id,node_name,raw&route_id=eq.${encodeURIComponent(routeId)}&order=sequence_no.asc`);

    if (rows.length > 0) {
      return rows.map((row) => ({
        ...row.raw,
        brtStdid: row.route_id,
        nodeid: row.node_id ?? row.raw?.nodeid ?? "",
        nodenm: row.node_name ?? row.raw?.nodenm ?? "",
        seq: String(row.sequence_no ?? row.raw?.seq ?? ""),
      }));
    }
  } catch (error) {
    console.warn("[BUS] Supabase 정류장 캐시 조회 실패, 서버 프록시로 전환", error);
  }

  return callApi("/bus_location_busstop_list_common", { brtStdid: routeId });
}
