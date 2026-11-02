import { createClient } from "npm:@supabase/supabase-js@2";
import { XMLParser } from "https://esm.sh/fast-xml-parser@4.5.0";

/**
 * 전주시 정류장 좌표를 TAGO 정류소 목록(getSttnNoList)에서 받아
 * bus_station_coords에 저장한다. 길찾기의 "현재 위치에서 출발"용이다.
 *
 * - 기존 sync-bus-data와 따로 둔다. 그 함수는 노선·정류장 순서를 채우는 긴
 *   작업이라 이 일 때문에 건드리지 않는다.
 * - 정류장 목록은 한 번에 numOfRows개씩 페이지로 받는다(요청 수 = 정류장 수 /
 *   PAGE_SIZE, 전주는 몇 번 안 된다). 요청 사이에 간격을 두고 403/429는 백오프로
 *   재시도한다(CLAUDE.md 4장 요청 제한).
 * - TAGO nodeid는 "JUB305100650"처럼 접두사가 붙고, 우리 DB node_id는 접두사 없는
 *   숫자다(stationService.toTagoNodeId 참고). 접두사를 떼어 저장한다.
 * - 좌표가 비었거나 전주 근처 범위 밖인 줄은 저장하지 않는다. 잘못된 좌표로
 *   "가까운 정류장"을 보여 주는 것보다 없는 편이 낫다.
 * - 같은 값을 다시 넣어도 안전하다(node_id 기준 upsert).
 */

const BASE_URL = "https://apis.data.go.kr/1613000";
const CITY_CODE = "35010";
const PAGE_SIZE = 500;
const MAX_PAGES = 30; // 안전장치. 전주 정류장 수천 개면 10쪽 안쪽이다.
const REQUEST_INTERVAL_MS = 350;
const MAX_BACKOFF_MS = 30_000;
const MAX_RETRIES = 6;
const UPSERT_CHUNK = 500;

// 전주시와 주변 군 지역을 넉넉히 포함하는 범위. 이 밖의 좌표는 오류로 본다.
const LAT_RANGE: [number, number] = [35.4, 36.1];
const LNG_RANGE: [number, number] = [126.8, 127.5];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json; charset=utf-8",
};

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => name === "item",
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeServiceKey(value: string): string {
  const trimmed = value.trim();
  try {
    return encodeURIComponent(decodeURIComponent(trimmed));
  } catch {
    return encodeURIComponent(trimmed);
  }
}

async function fetchPage(serviceKey: string, pageNo: number): Promise<string> {
  const url =
    `${BASE_URL}/BusSttnInfoInqireService/getSttnNoList?serviceKey=${serviceKey}` +
    `&cityCode=${CITY_CODE}&numOfRows=${PAGE_SIZE}&pageNo=${pageNo}&_type=xml`;

  for (let retry = 0; retry < MAX_RETRIES; retry++) {
    const res = await fetch(url, { headers: { Accept: "application/xml" } });
    const text = await res.text();
    if (res.ok) return text;

    if (res.status === 403 || res.status === 429) {
      const backoff = Math.min(2000 * 2 ** retry, MAX_BACKOFF_MS);
      console.warn(`TAGO rate limit (HTTP ${res.status}), retry ${retry + 1}/${MAX_RETRIES} in ${backoff}ms`);
      await sleep(backoff);
      continue;
    }
    throw new Error(`TAGO 오류: HTTP ${res.status} ${text.slice(0, 500)}`);
  }
  throw new Error(`TAGO 요청이 ${MAX_RETRIES}회 재시도 후에도 실패했습니다. (pageNo=${pageNo})`);
}

type StationRow = {
  node_id: string;
  node_name: string;
  ars_id: string | null;
  lat: number;
  lng: number;
  updated_at: string;
};

function parsePage(xml: string): { items: Record<string, string>[]; totalCount: number } {
  const parsed = parser.parse(xml) as {
    response?: {
      header?: { resultCode?: string; resultMsg?: string };
      body?: { totalCount?: string; items?: { item?: Record<string, string>[] } | "" };
    };
    OpenAPI_ServiceResponse?: { cmmMsgHeader?: { errMsg?: string; returnAuthMsg?: string } };
  };

  if (parsed.OpenAPI_ServiceResponse) {
    const h = parsed.OpenAPI_ServiceResponse.cmmMsgHeader;
    throw new Error(h?.returnAuthMsg || h?.errMsg || "TAGO 인증 오류");
  }
  const header = parsed.response?.header;
  if (!header) throw new Error("TAGO 응답 형식을 확인할 수 없습니다.");
  if (header.resultCode !== "00") {
    throw new Error(header.resultMsg || `TAGO 오류 코드 ${header.resultCode}`);
  }

  const body = parsed.response?.body;
  const items = body && typeof body.items === "object" ? body.items.item ?? [] : [];
  return { items, totalCount: Number(body?.totalCount ?? 0) || 0 };
}

function toRow(item: Record<string, string>, now: string): StationRow | null {
  const nodeId = (item.nodeid ?? "").replace(/^[A-Za-z]+/, "");
  const name = item.nodenm ?? "";
  const lat = Number(item.gpslati);
  const lng = Number(item.gpslong);
  if (!nodeId || !name) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < LAT_RANGE[0] || lat > LAT_RANGE[1]) return null;
  if (lng < LNG_RANGE[0] || lng > LNG_RANGE[1]) return null;
  return {
    node_id: nodeId,
    node_name: name,
    ars_id: item.nodeno ? item.nodeno : null,
    lat,
    lng,
    updated_at: now,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const tagoKey = Deno.env.get("TAGO_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!tagoKey?.trim() || !supabaseUrl || !serviceRole) {
      throw new Error("TAGO_API_KEY 또는 Supabase Secret이 설정되지 않았습니다.");
    }

    // dryRun=1이면 TAGO만 읽고 DB에는 쓰지 않는다(응답 모양과 개수 확인용).
    const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";

    const db = createClient(supabaseUrl, serviceRole);
    const serviceKey = normalizeServiceKey(tagoKey);
    const now = new Date().toISOString();

    const byNode = new Map<string, StationRow>();
    let totalCount = 0;
    let fetched = 0;
    let skipped = 0;
    let pages = 0;

    for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
      const { items, totalCount: total } = parsePage(await fetchPage(serviceKey, pageNo));
      pages++;
      totalCount = total || totalCount;
      if (items.length === 0) break;

      for (const item of items) {
        fetched++;
        const row = toRow(item, now);
        if (row) byNode.set(row.node_id, row);
        else skipped++;
      }

      if (totalCount > 0 && pageNo * PAGE_SIZE >= totalCount) break;
      await sleep(REQUEST_INTERVAL_MS);
    }

    const rows = Array.from(byNode.values());

    if (!dryRun) {
      for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
        const { error } = await db
          .from("bus_station_coords")
          .upsert(rows.slice(i, i + UPSERT_CHUNK), { onConflict: "node_id" });
        if (error) throw error;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        dryRun,
        pages,
        totalCount,
        fetched,
        skipped,
        saved: dryRun ? 0 : rows.length,
        sample: rows.slice(0, 3),
        syncedAt: now,
      }),
      { status: 200, headers: corsHeaders },
    );
  } catch (error) {
    console.error("sync-station-coords fatal", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "알 수 없는 오류",
      }),
      { status: 500, headers: corsHeaders },
    );
  }
});
