import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface BisResponse {
  timeList?: string[];
  result?: {
    BRT_TEXT?: string;
    SAT_NLIST?: string;
    HOLI_NLIST?: string;
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const routeId = url.searchParams.get("routeId");

    if (!routeId) {
      return new Response(
        JSON.stringify({ error: "routeId 파라미터가 필요합니다." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiRes = await fetch(
      "https://its.jeonju.go.kr/bis/selectBisRouteTimeInfo.do",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: `locale=ko-kr&routeId=${encodeURIComponent(routeId)}`,
      }
    );

    if (!apiRes.ok) {
      return new Response(
        JSON.stringify({ error: `BIS API 오류 (HTTP ${apiRes.status})` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const json: BisResponse = await apiRes.json();
    const times: string[] = (json.timeList || [])
      .map((t: string) => t.trim())
      .filter(Boolean);

    const d = json.result || {};

    return new Response(
      JSON.stringify({
        times,
        note: d.BRT_TEXT || "",
        satSkip: d.SAT_NLIST || "",
        holidaySkip: d.HOLI_NLIST || "",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "알 수 없는 오류" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
