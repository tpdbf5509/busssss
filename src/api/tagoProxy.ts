import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true, isArray: (tagName) => tagName === "item" });
export const JEONJU_CITY_CODE = "35010";
export type RawTagoField = Record<string, string>;
interface TagoEnvelope { response?: { header?: { resultCode?: string; resultMsg?: string }; body?: { items?: { item?: RawTagoField[] } } }; OpenAPI_ServiceResponse?: { cmmMsgHeader?: { errMsg?: string; returnAuthMsg?: string } } }
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
async function callTagoApi(path: string, params: Record<string, string>): Promise<RawTagoField[]> {
  if (!SUPABASE_URL) throw new Error("VITE_SUPABASE_URL이 설정되지 않았습니다.");
  const url = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/tago-proxy?${new URLSearchParams({ path, ...params })}`;
  const res = await fetch(url, { headers: SUPABASE_ANON_KEY ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY } : undefined });
  if (!res.ok) throw new Error((await res.text().catch(() => "")) || `TAGO 프록시 요청 실패 (HTTP ${res.status})`);
  const json = parser.parse(await res.text()) as TagoEnvelope;
  if (json.OpenAPI_ServiceResponse) { const e = json.OpenAPI_ServiceResponse.cmmMsgHeader; throw new Error(e?.returnAuthMsg || e?.errMsg || "TAGO 인증 오류"); }
  const h = json.response?.header;
  if (h && h.resultCode !== "00") throw new Error(h.resultMsg || `TAGO 오류 (${h.resultCode})`);
  return json.response?.body?.items?.item ?? [];
}
export async function getRouteNoList(routeNo: string, cityCode: string = JEONJU_CITY_CODE) { return callTagoApi("/BusRouteInfoInqireService/getRouteNoList", { cityCode, routeNo, numOfRows: "20", pageNo: "1" }); }
export async function getRouteAcctoBusLcList(routeId: string, cityCode: string = JEONJU_CITY_CODE) { return callTagoApi("/BusLcInfoInqireService/getRouteAcctoBusLcList", { cityCode, routeId, numOfRows: "50", pageNo: "1" }); }
export async function getSttnNoList(nodeNm: string, cityCode: string = JEONJU_CITY_CODE) { if (!nodeNm.trim()) return []; return callTagoApi("/BusSttnInfoInqireService/getSttnNoList", { cityCode, nodeNm: nodeNm.trim(), numOfRows: "30", pageNo: "1" }); }
export async function getSttnAcctoArvlPrearngeInfoList(nodeId: string, routeId?: string, cityCode: string = JEONJU_CITY_CODE) { const p: Record<string,string> = { cityCode, nodeId, numOfRows: "10", pageNo: "1" }; if (routeId) p.routeId = routeId; return callTagoApi("/ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList", p); }
