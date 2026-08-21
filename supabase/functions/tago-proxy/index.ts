import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BASE_URL = "https://apis.data.go.kr/1613000";
const cache = new Map<string, { body: string; expiresAt: number }>();
const inFlight = new Map<string, Promise<Response>>();
const UPSTREAM_TIMEOUT_MS = 8_000;

function ttlForPath(path: string): number {
  if (path.includes("ArvlInfoInqireService")) return 5_000;
  if (path.includes("BusLcInfoInqireService")) return 5_000;
  if (path.includes("BusSttnInfoInqireService")) return 10 * 60_000;
  return 24 * 60 * 60_000;
}

function normalizeServiceKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  try {
    return encodeURIComponent(decodeURIComponent(trimmed));
  } catch {
    return encodeURIComponent(trimmed);
  }
}

function xmlResponse(body: string, status = 200, cacheStatus?: string) {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/xml; charset=utf-8",
      ...(cacheStatus ? { "X-BUS-Cache": cacheStatus } : {}),
    },
  });
}

async function fetchUpstream(upstreamUrl: string, path: string, cacheKey: string) {
  const previous = cache.get(cacheKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Accept: "application/xml, text/xml, */*",
        "User-Agent": "BUS-STOP/1.0",
      },
      signal: controller.signal,
    });

    const body = await upstream.text();

    if (!upstream.ok) {
      if (previous?.body) return xmlResponse(previous.body, 200, "STALE-HTTP-ERROR");
      return xmlResponse(body, upstream.status, "UPSTREAM-ERROR");
    }

    const isOpenApiError = body.includes("<OpenAPI_ServiceResponse>");
    if (!isOpenApiError) {
      cache.set(cacheKey, { body, expiresAt: Date.now() + ttlForPath(path) });
      return xmlResponse(body, 200, "MISS");
    }

    if (previous?.body) return xmlResponse(previous.body, 200, "STALE-OPENAPI-ERROR");
    return xmlResponse(body, 200, "ERROR-NOCACHE");
  } catch (error) {
    if (previous?.body) return xmlResponse(previous.body, 200, "STALE-TIMEOUT");

    const message = error instanceof DOMException && error.name === "AbortError"
      ? "TAGO upstream timeout"
      : error instanceof Error
        ? error.message
        : "TAGO upstream request failed";

    return new Response(JSON.stringify({ error: message }), {
      status: 504,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    clearTimeout(timeout);
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.searchParams.get("path");
    const rawServiceKey = Deno.env.get("TAGO_API_KEY");

    if (!path || !path.startsWith("/")) {
      return new Response(JSON.stringify({ error: "path 파라미터가 필요합니다." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!rawServiceKey?.trim()) {
      return new Response(JSON.stringify({ error: "TAGO_API_KEY가 Supabase에 설정되지 않았습니다." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const params = new URLSearchParams(url.search);
    params.delete("path");
    params.set("_type", "xml");

    const serviceKey = normalizeServiceKey(rawServiceKey);
    const upstreamUrl = `${BASE_URL}${path}?serviceKey=${serviceKey}&${params.toString()}`;
    const cacheKey = upstreamUrl;
    const cached = cache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return xmlResponse(cached.body, 200, "HIT");
    }

    // 같은 요청이 여러 컴포넌트에서 동시에 발생해도 TAGO에는 하나만 보냅니다.
    const running = inFlight.get(cacheKey);
    if (running) return running.then((response) => response.clone());

    const request = fetchUpstream(upstreamUrl, path, cacheKey);
    inFlight.set(cacheKey, request);

    try {
      return await request;
    } finally {
      inFlight.delete(cacheKey);
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "알 수 없는 오류" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
