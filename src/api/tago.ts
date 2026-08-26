import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (tagName) => tagName === "item",
});

export const JEONJU_CITY_CODE = "35010";
export type RawTagoField = Record<string, string>;

interface TagoEnvelope {
  response?: { header?: { resultCode?: string; resultMsg?: string }; body?: { items?: { item?: RawTagoField[] } } };
  OpenAPI_ServiceResponse?: { cmmMsgHeader?: { errMsg?: string; returnAuthMsg?: string; returnReasonCode?: string } };
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

async function callTagoApi(path: string, params: Record<string, string>): Promise<RawTagoField[]> {
  if (!SUPABASE_URL) throw new Error("VITE_SUPABASE_URL이 설정되지 않았습니다.");

  const url = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/tago-proxy?${new URLSearchParams({ path, ...params })}`;
  let res: Response;

  try {
    res = await fetch(url, {
      headers: SUPABASE_ANON_KEY
        ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY }
        : undefined,
    });
  } catch {
    throw new Error("BUS STOP 서버에 연결하지 못했습니다.");
  }

  const text = await res.text().catch(() => "");

  if (!res.ok) {
    throw new Error(text || `TAGO 프록시 요청 실패 (HTTP ${res.status})`);
  }

  const json = parser.parse(text) as TagoEnvelope;

  if (json.OpenAPI_ServiceResponse) {
    const e = json.OpenAPI_ServiceResponse.cmmMsgHeader;
    const reason = e?.returnReasonCode ? ` [코드 ${e.returnReasonCode}]` : "";
    throw new Error(`${e?.returnAuthMsg || e?.errMsg || "TAGO 인증 오류"}${reason}`);
  }

  const h = json.response?.header;
  if (h && h.resultCode !== "00") {
    throw new Error(h.resultMsg || `TAGO 오류 (${h.resultCode})`);
  }

  return json.response?.body?.items?.item ?? [];
}

export async function getRouteNoList(routeNo: string, cityCode: string = JEONJU_CITY_CODE) {
  return callTagoApi("/BusRouteInfoInqireService/getRouteNoList", {
    cityCode,
    routeNo,
    numOfRows: "20",
    pageNo: "1",
  });
}

export async function getRouteAcctoBusLcList(routeId: string, cityCode: string = JEONJU_CITY_CODE) {
  return callTagoApi("/BusLcInfoInqireService/getRouteAcctoBusLcList", {
    cityCode,
    routeId,
    numOfRows: "50",
    pageNo: "1",
  });
}

export async function getRouteAcctoThrghSttnList(routeId: string, cityCode: string = JEONJU_CITY_CODE) {
  return callTagoApi("/BusRouteInfoInqireService/getRouteAcctoThrghSttnList", {
    cityCode,
    routeId,
    numOfRows: "100",
    pageNo: "1",
  });
}

export async function getSttnNoList(nodeNm: string, cityCode: string = JEONJU_CITY_CODE) {
  if (!nodeNm.trim()) return [];
  return callTagoApi("/BusSttnInfoInqireService/getSttnNoList", {
    cityCode,
    nodeNm: nodeNm.trim(),
    numOfRows: "30",
    pageNo: "1",
  });
}

export async function getSttnAcctoArvlPrearngeInfoList(
  nodeId: string,
  routeId?: string,
  cityCode: string = JEONJU_CITY_CODE,
) {
  // TAGO의 정류장별 도착예정 API는 routeId까지 붙이면 특정 노선에서
  // 504/HTTP_ERROR가 발생하는 경우가 있습니다. 정류장 전체 도착정보를
  // 받은 뒤 arrivalService에서 routeId를 기준으로 골라 쓰면 동일한 결과를
  // 얻을 수 있으므로 routeId는 서버 요청에서 제외합니다.
  // 특히 전주 104번처럼 방향별 routeId가 서로 다른 노선에서 안정성이 높습니다.
  void routeId;

  return callTagoApi("/ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList", {
    cityCode,
    nodeId,
    numOfRows: "10",
    pageNo: "1",
  });
}
