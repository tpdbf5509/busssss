import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BASE_URL = "https://apis.data.go.kr/4641000/nosun";
const cache = new Map<string, { body: string; expiresAt: number }>();

function ttlForPath(path: string) {
  if (path.includes("bus_location_busstop_list_common")) return 24 * 60 * 60_000;
  return 30 * 60_000;
}

async function request(path: string, params: URLSearchParams, key: string) {
  const upstreamUrl = `${BASE_URL}${path}?serviceKey=${encodeURIComponent(key)}&${params.toString()}`;
  const cached = cache.get(upstreamUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.body;

  for (let retry = 0; retry < 4; retry++) {
    const res = await fetch(upstreamUrl);
    const body = await res.text();
    if (res.ok) {
      cache.set(upstreamUrl, { body, expiresAt: Date.now() + ttlForPath(path) });
      return body;
    }
    if (res.status !== 403 && res.status !== 429) throw new Error(`전주시 API 오류 (${res.status})`);
    await new Promise((r) => setTimeout(r, 1000 * (retry + 1)));
  }
  throw new Error("전주시 API 요청이 반복해서 거부되었습니다.");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const path = url.searchParams.get("path");
    const key = Deno.env.get("JEONJU_API_KEY");
    if (!path || !path.startsWith("/")) throw new Error("path가 필요합니다.");
    if (!key) throw new Error("JEONJU_API_KEY가 설정되지 않았습니다.");

    const params = new URLSearchParams(url.search);
    params.delete("path");
    const body = await request(path, params, key);

    return new Response(body, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "알 수 없는 오류" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
