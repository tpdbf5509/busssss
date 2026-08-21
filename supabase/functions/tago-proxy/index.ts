import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BASE_URL = "https://apis.data.go.kr/1613000";
const cache = new Map<string, { body: string; expiresAt: number }>();

function ttlForPath(path: string): number {
  if (path.includes("ArvlInfoInqireService")) return 5_000;
  if (path.includes("BusLcInfoInqireService")) return 5_000;
  if (path.includes("BusSttnInfoInqireService")) return 10 * 60_000;
  return 24 * 60 * 60_000;
}

/**
 * 공공데이터포털은 Encoding 키와 Decoding 키를 모두 제공할 수 있습니다.
 * Supabase Secret에 어느 형태가 들어와도 한 번만 디코딩한 뒤 다시 URL 인코딩하여
 * TAGO에 정확히 한 번만 인코딩된 serviceKey를 전달합니다.
 */
function normalizeServiceKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  try {
    return encodeURIComponent(decodeURIComponent(trimmed));
  } catch {
    return encodeURIComponent(trimmed);
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
      return new Response(cached.body, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/xml; charset=utf-8",
          "X-BUS-Cache": "HIT",
        },
      });
    }

    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Accept: "application/xml, text/xml, */*",
        "User-Agent": "BUS-STOP/1.0",
      },
    });
    const body = await upstream.text();

    if (!upstream.ok) {
      return new Response(body, {
        status: upstream.status,
        headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" },
      });
    }

    // OpenAPI_ServiceResponse(예: HTTP_ERROR)도 성공 HTTP 상태로 내려올 수 있으므로
    // 해당 오류 응답은 캐시하지 않습니다. 다음 요청에서 바로 재시도할 수 있어야 합니다.
    const isOpenApiError = body.includes("<OpenAPI_ServiceResponse>");
    if (!isOpenApiError) {
      cache.set(cacheKey, { body, expiresAt: Date.now() + ttlForPath(path) });
    }

    return new Response(body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "X-BUS-Cache": isOpenApiError ? "ERROR-NOCACHE" : "MISS",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "알 수 없는 오류" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
