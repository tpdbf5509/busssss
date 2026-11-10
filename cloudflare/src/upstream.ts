// 공공 API(TAGO, 전주시 GW, 전주 ITS)로 나가는 요청. 예전 Supabase 엣지 함수
// tago-proxy / jeonju-proxy / bis-proxy를 그대로 옮겼다.
//
// 바뀐 점 두 가지:
//  - 캐시는 Worker 인스턴스 메모리(Map)다. workers.dev 주소에서는 Cache API가
//    저장되지 않아서 쓰지 않는다. 인스턴스가 바뀌면 캐시가 비는 것은 예전과 같다.
//  - 상류가 실패했을 때 묵은 응답을 대신 주지 않는다. 도착 정보는 오래된 값보다
//    "정보 없음"이 낫기 때문이다(CLAUDE.md 4장).

const TAGO_BASE = "https://apis.data.go.kr/1613000";
const JEONJU_BASE = "https://apis.data.go.kr/4641000";
const BIS_URL = "https://its.jeonju.go.kr/bis/selectBisRouteTimeInfo.do";
const UPSTREAM_TIMEOUT_MS = 8_000;
const MAX_CACHE_ENTRIES = 500;

interface CacheEntry {
  body: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<UpstreamResult>>();

export interface UpstreamResult {
  status: number;
  body: string;
  contentType: string;
  cache: "HIT" | "MISS" | "SHARED" | "NOCACHE";
}

/** 요청 경로에 허용하는 글자. 쿼리·상위 경로를 끼워 넣는 것을 막는다. */
export const SAFE_PATH = /^\/[A-Za-z0-9_]+(\/[A-Za-z0-9_]+)*$/;
export const SAFE_ROUTE_ID = /^[A-Za-z0-9_-]{1,32}$/;

export function tagoTtlMs(path: string): number {
  if (path.includes("ArvlInfoInqireService")) return 5_000;
  if (path.includes("BusLcInfoInqireService")) return 5_000;
  if (path.includes("BusSttnInfoInqireService")) return 10 * 60_000;
  return 24 * 60 * 60_000;
}

export function jeonjuTtlMs(path: string): number {
  if (path.includes("bus_location_busstop_list_common")) return 24 * 60 * 60_000;
  if (path.includes("bus_location_bus_position_common")) return 5_000;
  return 30 * 60_000;
}

/** 서비스키가 인코딩된 채로 들어오든 아니든 한 번만 인코딩되게 맞춘다. */
export function normalizeServiceKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  try {
    return encodeURIComponent(decodeURIComponent(trimmed));
  } catch {
    return encodeURIComponent(trimmed);
  }
}

/** 기관의 XML 오류 응답은 HTTP 200일 수 있어 따로 알아본다. */
export function isOpenApiError(body: string): boolean {
  return body.includes("<OpenAPI_ServiceResponse>");
}

function prune(now: number) {
  if (cache.size < MAX_CACHE_ENTRIES) return;
  for (const [key, entry] of cache) if (entry.expiresAt <= now) cache.delete(key);
  // 그래도 많으면 먼저 들어온 것부터 지운다(Map은 넣은 순서를 지킨다).
  for (const key of cache.keys()) {
    if (cache.size < MAX_CACHE_ENTRIES) break;
    cache.delete(key);
  }
}

export function clearUpstreamCache() {
  cache.clear();
  inFlight.clear();
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** 같은 요청이 동시에 오면 상류에는 하나만 보낸다. */
function coalesce(key: string, run: () => Promise<UpstreamResult>): Promise<UpstreamResult> {
  const running = inFlight.get(key);
  if (running) return running.then((r) => ({ ...r, cache: "SHARED" as const }));
  const promise = run().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

export interface XmlProxyOptions {
  base: "tago" | "jeonju";
  path: string;
  params: URLSearchParams;
  serviceKey: string;
  now?: number;
}

export async function callXmlApi(options: XmlProxyOptions): Promise<UpstreamResult> {
  const { base, path, params, serviceKey } = options;
  const now = options.now ?? Date.now();

  // 호출한 쪽이 serviceKey를 끼워 보내도 우리 키만 쓴다.
  const clean = new URLSearchParams(params);
  clean.delete("serviceKey");

  let upstreamUrl: string;
  let ttl: number;
  if (base === "tago") {
    clean.set("_type", "xml");
    ttl = tagoTtlMs(path);
    upstreamUrl = `${TAGO_BASE}${path}?serviceKey=${normalizeServiceKey(serviceKey)}&${clean}`;
  } else {
    ttl = jeonjuTtlMs(path);
    // 전주시 GW는 /realtime/ 아래와 /nosun 아래 두 갈래가 있다.
    const upstreamPath = path.startsWith("/realtime/") ? path.slice("/realtime".length) : path;
    const prefix = path.startsWith("/realtime/") ? "/realtime" : "/nosun";
    upstreamUrl = `${JEONJU_BASE}${prefix}${upstreamPath}?serviceKey=${normalizeServiceKey(serviceKey)}&${clean}`;
  }

  const hit = cache.get(upstreamUrl);
  if (hit && hit.expiresAt > now) {
    return { status: 200, body: hit.body, contentType: "application/xml; charset=utf-8", cache: "HIT" };
  }

  return coalesce(upstreamUrl, async () => {
    // 전주시 GW는 한꺼번에 많이 부르면 403/429를 주므로 물러나며 다시 시도한다.
    const attempts = base === "jeonju" ? 3 : 1;
    for (let retry = 0; retry < attempts; retry++) {
      let res: Response;
      try {
        res = await fetchWithTimeout(upstreamUrl, {
          headers: { Accept: "application/xml, text/xml, */*", "User-Agent": "BUS-STOP/1.0" },
        });
      } catch (error) {
        const timedOut = error instanceof DOMException && error.name === "AbortError";
        return {
          status: 504,
          body: JSON.stringify({ error: timedOut ? "upstream timeout" : "upstream request failed" }),
          contentType: "application/json",
          cache: "NOCACHE",
        };
      }
      const body = await res.text();

      if (res.ok) {
        // 오류 응답은 캐시하지 않는다.
        if (isOpenApiError(body)) {
          return { status: 200, body, contentType: "application/xml; charset=utf-8", cache: "NOCACHE" };
        }
        prune(now);
        cache.set(upstreamUrl, { body, expiresAt: now + ttl });
        return { status: 200, body, contentType: "application/xml; charset=utf-8", cache: "MISS" };
      }

      const retryable = base === "jeonju" && (res.status === 403 || res.status === 429);
      if (!retryable || retry === attempts - 1) {
        return {
          status: res.status >= 500 ? 502 : res.status,
          body: base === "jeonju" ? JSON.stringify({ error: `전주시 API 오류 (${res.status})` }) : body,
          contentType: base === "jeonju" ? "application/json" : "application/xml; charset=utf-8",
          cache: "NOCACHE",
        };
      }
      await sleep(1000 * (retry + 1));
    }
    return { status: 502, body: JSON.stringify({ error: "upstream failed" }), contentType: "application/json", cache: "NOCACHE" };
  });
}

interface BisResponse {
  timeList?: string[];
  result?: { BRT_TEXT?: string; SAT_NLIST?: string; HOLI_NLIST?: string };
}

/** 전주 ITS 배차시간표. 하루 단위로 바뀌는 값이라 1시간 캐시한다. */
export async function callBis(routeId: string, now = Date.now()): Promise<UpstreamResult> {
  const key = `bis:${routeId}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return { status: 200, body: hit.body, contentType: "application/json", cache: "HIT" };
  }

  return coalesce(key, async () => {
    try {
      const res = await fetchWithTimeout(BIS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: `locale=ko-kr&routeId=${encodeURIComponent(routeId)}`,
      });
      if (!res.ok) {
        return {
          status: 502,
          body: JSON.stringify({ error: `BIS API 오류 (HTTP ${res.status})` }),
          contentType: "application/json",
          cache: "NOCACHE",
        };
      }
      const json = (await res.json()) as BisResponse;
      const d = json.result ?? {};
      const body = JSON.stringify({
        times: (json.timeList ?? []).map((t) => t.trim()).filter(Boolean),
        note: d.BRT_TEXT || "",
        satSkip: d.SAT_NLIST || "",
        holidaySkip: d.HOLI_NLIST || "",
      });
      prune(now);
      cache.set(key, { body, expiresAt: now + 60 * 60_000 });
      return { status: 200, body, contentType: "application/json", cache: "MISS" };
    } catch (error) {
      return {
        status: 500,
        body: JSON.stringify({ error: error instanceof Error ? error.message : "알 수 없는 오류" }),
        contentType: "application/json",
        cache: "NOCACHE",
      };
    }
  });
}
