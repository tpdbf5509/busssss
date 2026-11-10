// BUS STOP 백엔드 Worker.
//
//   GET  /api/tago?path=...      TAGO 도착·위치 (예전 tago-proxy)
//   GET  /api/jeonju?path=...    전주시 노선 API (예전 jeonju-proxy)
//   GET  /api/bis?routeId=...    전주 ITS 시간표 (예전 bis-proxy)
//   GET  /static/{routes,stops,meta}.json   정적 노선·정류장 (KV에서)
//   POST /admin/import           Supabase 원본 행을 받아 정적 JSON으로 저장 (비밀번호 필요)
//   GET  /health                 살아 있는지와 데이터 생성 시각

import {
  buildMeta,
  buildRoutes,
  buildStopsPayload,
  type StaticSource,
} from "../../src/lib/staticData";
import {
  SAFE_PATH,
  SAFE_ROUTE_ID,
  callBis,
  callXmlApi,
  type UpstreamResult,
} from "./upstream";

export interface KVLike {
  get(key: string, options?: { type?: "text"; cacheTtl?: number }): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export interface Env {
  STATIC: KVLike;
  TAGO_API_KEY?: string;
  ADMIN_TOKEN?: string;
  ALLOWED_ORIGINS?: string;
}

const STATIC_FILES = new Set(["routes", "stops", "meta"]);
const MAX_ADMIN_BODY_BYTES = 20 * 1024 * 1024;

function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

/** 허용 목록이 비어 있으면 모두 허용한다. Origin이 없는 요청(서버, curl)은 막지 않는다. */
export function isOriginAllowed(env: Env, origin: string | null): boolean {
  const list = allowedOrigins(env);
  if (list.length === 0 || list.includes("*") || !origin) return true;
  return list.includes(origin);
}

function corsHeaders(env: Env, origin: string | null): Record<string, string> {
  const list = allowedOrigins(env);
  const allow = list.length === 0 || list.includes("*") ? "*" : origin && list.includes(origin) ? origin : list[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
}

function json(data: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

function fromUpstream(result: UpstreamResult, headers: Record<string, string>): Response {
  return new Response(result.body, {
    status: result.status,
    headers: { "Content-Type": result.contentType, "X-BUS-Cache": result.cache, ...headers },
  });
}

/** 비밀번호 비교. 길이와 내용이 달라도 걸리는 시간이 같도록 해시 값을 비교한다. */
async function tokenMatches(given: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function isStaticSource(value: unknown): value is StaticSource {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<StaticSource>;
  return Array.isArray(v.master) && Array.isArray(v.cache) && Array.isArray(v.stops);
}

async function handleImport(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  if (!env.ADMIN_TOKEN) return json({ error: "ADMIN_TOKEN이 설정되지 않아 가져오기가 꺼져 있습니다." }, 503, cors);

  const auth = request.headers.get("Authorization") ?? "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!given || !(await tokenMatches(given, env.ADMIN_TOKEN))) return json({ error: "unauthorized" }, 401, cors);

  const text = await request.text();
  if (text.length > MAX_ADMIN_BODY_BYTES) return json({ error: "본문이 너무 큽니다." }, 413, cors);

  let source: unknown;
  try {
    source = JSON.parse(text);
  } catch {
    return json({ error: "JSON 형식이 아닙니다." }, 400, cors);
  }
  if (!isStaticSource(source)) return json({ error: "master, cache, stops 배열이 필요합니다." }, 400, cors);

  const routes = buildRoutes(source.master, source.cache);
  const stops = buildStopsPayload(source.stops);

  // 빈 데이터로 기존 파일을 덮어쓰면 앱이 노선을 못 불러오므로 막는다.
  if (routes.length === 0 || stops.stations.length === 0) {
    return json({ error: "노선 또는 정류장이 비어 있어 저장하지 않았습니다." }, 422, cors);
  }

  const meta = buildMeta(routes, stops);
  // meta를 마지막에 쓴다. meta가 새 값이면 나머지 두 파일도 이미 저장된 것이다.
  await env.STATIC.put("routes", JSON.stringify(routes));
  await env.STATIC.put("stops", JSON.stringify(stops));
  await env.STATIC.put("meta", JSON.stringify(meta));
  return json({ ok: true, ...meta }, 200, cors);
}

async function handleStatic(name: string, env: Env, cors: Record<string, string>): Promise<Response> {
  if (!STATIC_FILES.has(name)) return json({ error: "not found" }, 404, cors);
  const body = await env.STATIC.get(name, { type: "text", cacheTtl: 300 });
  if (!body) return json({ error: "아직 정적 데이터가 올라가지 않았습니다." }, 404, cors);
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // 앱이 하루 한 번만 받으므로 브라우저·CDN에는 길게 두지 않는다.
      "Cache-Control": "public, max-age=300",
      ...cors,
    },
  });
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  const cors = corsHeaders(env, origin);

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const { pathname } = url;

  if (pathname === "/health") {
    const meta = await env.STATIC.get("meta", { type: "text" });
    return json({ ok: true, data: meta ? JSON.parse(meta) : null }, 200, cors);
  }

  if (request.method === "POST" && pathname === "/admin/import") return handleImport(request, env, cors);

  if (request.method !== "GET") return json({ error: "method not allowed" }, 405, cors);

  const staticMatch = pathname.match(/^\/static\/([a-z]+)\.json$/);
  if (staticMatch) return handleStatic(staticMatch[1], env, cors);

  if (pathname.startsWith("/api/")) {
    // 프록시는 우리 서비스키를 쓰므로 허용한 주소의 브라우저 요청만 받는다.
    if (!isOriginAllowed(env, origin)) return json({ error: "origin not allowed" }, 403, cors);

    if (pathname === "/api/bis") {
      const routeId = url.searchParams.get("routeId");
      if (!routeId || !SAFE_ROUTE_ID.test(routeId)) return json({ error: "routeId 파라미터가 필요합니다." }, 400, cors);
      return fromUpstream(await callBis(routeId), cors);
    }

    if (pathname === "/api/tago" || pathname === "/api/jeonju") {
      const path = url.searchParams.get("path");
      if (!path || !SAFE_PATH.test(path)) return json({ error: "path 파라미터가 올바르지 않습니다." }, 400, cors);
      if (!env.TAGO_API_KEY?.trim()) return json({ error: "TAGO_API_KEY가 설정되지 않았습니다." }, 500, cors);

      const params = new URLSearchParams(url.search);
      params.delete("path");
      const result = await callXmlApi({
        base: pathname === "/api/tago" ? "tago" : "jeonju",
        path,
        params,
        serviceKey: env.TAGO_API_KEY,
      });
      return fromUpstream(result, cors);
    }
  }

  return json({ error: "not found" }, 404, cors);
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env).catch((error) =>
      json({ error: error instanceof Error ? error.message : "알 수 없는 오류" }, 500, {}),
    );
  },
};
