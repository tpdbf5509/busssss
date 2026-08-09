import { parseXml } from "./xml";

const BASE_URL = "https://apis.data.go.kr/4641000/nosun";
const SERVICE_KEY = import.meta.env.VITE_JEONJU_API_KEY as string | undefined;

export type RawRouteField = Record<string, string>;

interface ApiEnvelope {
  RFC30?: {
    code?: string;
    msg?: string;
    routeList?: { list?: RawRouteField[] };
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callApi(
  path: string,
  params: Record<string, string> = {},
  retry = 0
): Promise<RawRouteField[]> {
  if (!SERVICE_KEY) {
    throw new Error("VITE_JEONJU_API_KEY가 설정되지 않았습니다.");
  }

  const search = new URLSearchParams(params);
  const url = `${BASE_URL}${path}?serviceKey=${encodeURIComponent(SERVICE_KEY)}${
    search.toString() ? `&${search.toString()}` : ""
  }`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("노선 정보 서버에 연결하지 못했습니다.");
  }

  // 403 또는 429 처리
  if (res.status === 429 || res.status === 403) {
    if (retry < 4) {
      const delay = 4000 + retry * 3000; // 4초 → 7초 → 10초 → 13초
      console.log(`[API] ${res.status} 발생 — ${delay}ms 후 재시도 (${retry + 1}/4)`);
      await sleep(delay);
      return callApi(path, params, retry + 1);
    }
    throw new Error(`API 요청이 거부되었습니다. (${res.status}) 잠시 후 다시 시도해주세요.`);
  }

  if (!res.ok) {
    throw new Error(`노선 정보를 불러오지 못했습니다. (HTTP ${res.status})`);
  }

  const xmlText = await res.text();
  const json = parseXml<ApiEnvelope>(xmlText);
  const body = json.RFC30;

  if (!body) throw new Error("응답 형식 오류");
  if (body.code && body.code !== "000") {
    throw new Error(body.msg || `오류 코드: ${body.code}`);
  }

  return body.routeList?.list ?? [];
}

async function getRouteIdList(): Promise<RawRouteField[]> {
  return callApi("/bus_location_all_common");
}

async function getRouteDetail(brtId: string, brtClass: string): Promise<RawRouteField[]> {
  return callApi("/bus_location1_common", { brtId, brtClass });
}

async function mapSequentially<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  delayMs = 2500
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i++) {
    results.push(await fn(items[i]));
    if (i < items.length - 1) await sleep(delayMs);
  }
  return results;
}

export async function getRoutes(): Promise<RawRouteField[]> {
  const idList = await getRouteIdList();
  console.log("ID LIST SAMPLE:", idList[0]);

  const uniquePairs = Array.from(
    new Map(
      idList.filter((r) => r.brtId).map((r) => [`${r.brtId}-${r.brtClass}`, r])
    ).values()
  );

  console.log(`[API] 노선 ${uniquePairs.length}개 상세 조회 시작 (순차, 100ms 간격)`);

  const branchLists = await mapSequentially(
    uniquePairs,
    (pair) => getRouteDetail(pair.brtId, pair.brtClass).catch(() => [] as RawRouteField[]),
    2500
  );

  return branchLists.flat();
}

export async function getRouteStops(routeId: string): Promise<RawRouteField[]> {
  return callApi("/bus_location_busstop_list_common", { brtStdid: routeId });
}