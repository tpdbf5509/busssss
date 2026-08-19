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

async function callApi(path: string, params: Record<string, string> = {}): Promise<RawRouteField[]> {
  if (!SUPABASE_URL) throw new Error("VITE_SUPABASE_URL이 설정되지 않았습니다.");

  const search = new URLSearchParams({ path, ...params });
  const url = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/jeonju-proxy?${search.toString()}`;

  const res = await fetch(url, {
    headers: SUPABASE_ANON_KEY
      ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY }
      : undefined,
  });

  if (!res.ok) {
    const message = await res.text().catch(() => "");
    throw new Error(message || `전주시 API 요청 실패 (HTTP ${res.status})`);
  }

  const json = parseXml<ApiEnvelope>(await res.text());
  const body = json.RFC30;
  if (!body) throw new Error("응답 형식 오류");
  if (body.code && body.code !== "000") throw new Error(body.msg || `오류 코드: ${body.code}`);
  return body.routeList?.list ?? [];
}

export async function getRoutes(): Promise<RawRouteField[]> {
  // 서버 캐시가 담당하므로 브라우저에서 노선을 하나씩 2.5초 간격으로 요청하지 않습니다.
  // 서버 프록시가 필요한 상세정보를 호출하고 결과를 캐시합니다.
  const idList = await callApi("/bus_location_all_common");
  const uniquePairs = Array.from(
    new Map(idList.filter((r) => r.brtId).map((r) => [`${r.brtId}-${r.brtClass}`, r])).values()
  );

  const results = await Promise.all(
    uniquePairs.map(async (pair) => {
      try {
        return await callApi("/bus_location1_common", {
          brtId: pair.brtId,
          brtClass: pair.brtClass,
        });
      } catch {
        return [] as RawRouteField[];
      }
    })
  );

  return results.flat();
}

export async function getRouteStops(routeId: string): Promise<RawRouteField[]> {
  return callApi("/bus_location_busstop_list_common", { brtStdid: routeId });
}
