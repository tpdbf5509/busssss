import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BASE_URL = "https://apis.data.go.kr/4641000/nosun";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callJeonju(path: string, params: Record<string, string>, key: string) {
  const qs = new URLSearchParams(params);
  const url = `${BASE_URL}${path}?serviceKey=${encodeURIComponent(key)}&${qs}`;
  for (let retry = 0; retry < 4; retry++) {
    const res = await fetch(url);
    const text = await res.text();
    if (res.ok) return text;
    if (res.status !== 403 && res.status !== 429) throw new Error(`전주시 API ${res.status}`);
    await sleep(1000 * (retry + 1));
  }
  throw new Error("전주시 API 요청 실패");
}

function parseXml(xml: string): Record<string, unknown> {
  // Edge Function에서는 정규식으로 필요한 routeList/list 필드를 추출해
  // 브라우저 번들에 XML 파서를 추가하지 않습니다.
  const items: Record<string, string>[] = [];
  const listMatches = xml.match(/<list>[\s\S]*?<\/list>/g) ?? [];
  for (const block of listMatches) {
    const item: Record<string, string> = {};
    const fields = block.match(/<([A-Za-z0-9_]+)>[\s\S]*?<\/\1>/g) ?? [];
    for (const field of fields) {
      const match = field.match(/^<([^>]+)>([\s\S]*?)<\/\1>$/);
      if (match) item[match[1]] = match[2].trim();
    }
    if (Object.keys(item).length) items.push(item);
  }
  return { items };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const key = Deno.env.get("JEONJU_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!key || !supabaseUrl || !serviceRole) throw new Error("Supabase/전주시 API Secret이 없습니다.");

    const db = createClient(supabaseUrl, serviceRole);
    const idXml = await callJeonju("/bus_location_all_common", {}, key);
    const idRows = (parseXml(idXml).items ?? []) as Record<string, string>[];

    const unique = Array.from(new Map(
      idRows.filter((r) => r.brtId).map((r) => [`${r.brtId}-${r.brtClass}`, r])
    ).values());

    let routeCount = 0;
    for (const pair of unique) {
      try {
        const detailXml = await callJeonju("/bus_location1_common", {
          brtId: pair.brtId,
          brtClass: pair.brtClass ?? "",
        }, key);
        const rows = (parseXml(detailXml).items ?? []) as Record<string, string>[];
        for (const row of rows) {
          const routeKey = `${row.brtId ?? pair.brtId}-${row.brtStdid ?? row.brtNo ?? routeCount}`;
          await db.from("bus_routes_cache").upsert({
            route_key: routeKey,
            brt_id: row.brtId ?? pair.brtId,
            brt_stdid: row.brtStdid ?? "",
            brt_class: row.brtClass ?? pair.brtClass ?? "",
            brt_no: row.brtNo ?? "",
            start_name: row.brtStartNm ?? row.startNm ?? "",
            end_name: row.brtEndNm ?? row.endNm ?? "",
            raw: row,
            updated_at: new Date().toISOString(),
          }, { onConflict: "route_key" });
          routeCount++;
        }
      } catch (e) {
        console.error("route sync failed", pair, e);
      }
      await sleep(250);
    }

    return new Response(JSON.stringify({ ok: true, routeCount, syncedAt: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
