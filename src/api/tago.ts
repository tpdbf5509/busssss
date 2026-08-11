import { XMLParser } from "fast-xml-parser";

// TAGO(국토교통부) API는 <response><body><items><item>...</item></items></body></response>
// 구조라, 전주시 자체 API(RFC30 구조)와는 다른 파서 설정이 필요합니다.
// item이 1개일 때도 배열로 나오도록 강제합니다.
const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (tagName) => tagName === "item",
});

const BASE_URL = "https://apis.data.go.kr/1613000";

// data.go.kr은 계정당 하나의 "일반 인증키"를 발급하고, 승인받은 모든 API에
// 동일한 키를 사용합니다. 별도로 VITE_TAGO_API_KEY를 지정하지 않았다면
// 기존 전주시 API 키(VITE_JEONJU_API_KEY)를 재사용합니다.
const SERVICE_KEY = (import.meta.env.VITE_TAGO_API_KEY ||
  import.meta.env.VITE_JEONJU_API_KEY) as string | undefined;

export const JEONJU_CITY_CODE = "35010";

export type RawTagoField = Record<string, string>;

interface TagoEnvelope {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: { items?: { item?: RawTagoField[] }; totalCount?: string };
  };
  OpenAPI_ServiceResponse?: {
    cmmMsgHeader?: { errMsg?: string; returnAuthMsg?: string; returnReasonCode?: string };
  };
}

async function callTagoApi(
  path: string,
  params: Record<string, string>
): Promise<RawTagoField[]> {
  if (!SERVICE_KEY) {
    throw new Error("TAGO API 인증키가 설정되지 않았습니다. (VITE_TAGO_API_KEY)");
  }

  const search = new URLSearchParams({ ...params, _type: "xml" });
  const url = `${BASE_URL}${path}?serviceKey=${encodeURIComponent(SERVICE_KEY)}&${search.toString()}`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("TAGO 서버에 연결하지 못했습니다.");
  }

  if (!res.ok) {
    throw new Error(`TAGO 요청 실패 (HTTP ${res.status})`);
  }

  const xmlText = await res.text();
  const json = parser.parse(xmlText) as TagoEnvelope;

  // 인증키 미등록/만료 등은 별도의 최상위 에러 포맷으로 내려옵니다.
  if (json.OpenAPI_ServiceResponse) {
    const err = json.OpenAPI_ServiceResponse.cmmMsgHeader;
    throw new Error(err?.returnAuthMsg || err?.errMsg || "TAGO 인증 오류");
  }

  const header = json.response?.header;
  if (header && header.resultCode !== "00") {
    throw new Error(header.resultMsg || `TAGO 오류 (${header.resultCode})`);
  }

  return json.response?.body?.items?.item ?? [];
}

/** 노선번호(예: "385")로 TAGO 노선ID(방향별)를 조회합니다. */
export async function getRouteNoList(
  routeNo: string,
  cityCode: string = JEONJU_CITY_CODE
): Promise<RawTagoField[]> {
  return callTagoApi("/BusRouteInfoInqireService/getRouteNoList", {
    cityCode,
    routeNo,
    numOfRows: "20",
    pageNo: "1",
  });
}

/** 노선ID 기준으로 현재 운행중인 버스들의 실시간 GPS 위치 목록을 조회합니다. */
export async function getRouteAcctoBusLcList(
  routeId: string,
  cityCode: string = JEONJU_CITY_CODE
): Promise<RawTagoField[]> {
  return callTagoApi("/BusLcInfoInqireService/getRouteAcctoBusLcList", {
    cityCode,
    routeId,
    numOfRows: "50",
    pageNo: "1",
  });
}

/** 정류소명으로 전주 정류장 검색 (cityCode 35010) */
export async function getSttnNoList(
  nodeNm: string,
  cityCode: string = JEONJU_CITY_CODE
): Promise<RawTagoField[]> {
  if (!nodeNm.trim()) return [];
  return callTagoApi("/BusSttnInfoInqireService/getSttnNoList", {
    cityCode,
    nodeNm: nodeNm.trim(),
    numOfRows: "30",
    pageNo: "1",
  });
}