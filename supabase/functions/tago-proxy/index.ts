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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.searchParams.get("path");
    const serviceKey = Deno.env.get("TAGO_API_KEY");

    if (!path || !path.startsWith("/")) {
      return new Response(JSON.stringify({ error: "path 파라미터가 필요합니다." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!serviceKey) {
      return new Response(JSON.stringify({ error: "TAGO_API_KEY가 Supabase에 설정되지 않았습니다." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const params = new URLSearchParams(url.search);
    params.delete("path");
    params.set("_type", "xml");

    const upstreamUrl = `${BASE_URL}${path}?serviceKey=${encodeURIComponent(serviceKey)}&${params.toString()}`;
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

    const upstream = await fetch(upstreamUrl);
    const body = await upstream.text();

    if (!upstream.ok) {
      return new Response(body, {
        status: upstream.status,
        headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" },
      });
    }

    cache.set(cacheKey, { body, expiresAt: Date.now() + ttlForPath(path) });

    return new Response(body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "X-BUS-Cache": "MISS",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "알 수 없는 오류" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
