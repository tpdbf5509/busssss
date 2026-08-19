import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { XMLParser } from "https://esm.sh/fast-xml-parser@4.5.0";

const BASE_URL = "https://apis.data.go.kr/4641000/nosun";
const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (tagName) => tagName === "list",
});

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

function extractRows(xml: string): Record<string, string>[] {
  const json = parser.parse(xml) as any;
  const root = json?.RFC30 ?? json;
  const candidates = [
    root?.routeList?.list,
    root?.busList?.list,
    root?.list,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === "object") return [candidate];
  }
  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const key = Deno.env.get("JEONJU_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!key || !supabaseUrl || !serviceRole) {
      throw new Error("Supabase/전주시 API Secret이 없습니다.");
    }

    const db = createClient(supabaseUrl, serviceRole);

    // 1. 전체 노선 ID 목록
    const idXml = await callJeonju("/bus_location_all_common", {}, key);
    const idRows = extractRows(idXml);
    const uniquePairs = Array.from(
      new Map(
        idRows
          .filter((r) => r.brtId)
          .map((r) => [`${r.brtId}-${r.brtClass ?? ""}`, r])
      ).values()
    );

    let routeCount = 0;
    let stopCount = 0;
    let failedRoutes = 0;

    // 2. 노선 기본정보 저장
    for (const pair of uniquePairs) {
      let rows: Record<string, string>[] = [];
      try {
        const detailXml = await callJeonju("/bus_location1_common", {
          brtId: pair.brtId,
          brtClass: pair.brtClass ?? "",
        }, key);
        rows = extractRows(detailXml);
      } catch (e) {
        failedRoutes++;
        console.error("route detail failed", pair, e);
      }

      for (const row of rows) {
        const routeId = row.brtStdid || row.brtId || pair.brtId;
        const routeKey = `${row.brtId ?? pair.brtId}-${routeId}`;

        const { error } = await db.from("bus_routes_cache").upsert({
          route_key: routeKey,
          brt_id: row.brtId ?? pair.brtId,
          brt_stdid: row.brtStdid ?? "",
          brt_class: row.brtClass ?? pair.brtClass ?? "",
          brt_no: row.brtNo ?? "",
          start_name: row.brtStartNm ?? row.startNm ?? row.brtStart ?? "",
          end_name: row.brtEndNm ?? row.endNm ?? row.brtEnd ?? "",
          raw: row,
          updated_at: new Date().toISOString(),
        }, { onConflict: "route_key" });

        if (!error) routeCount++;
        else console.error("route db upsert failed", error);
      }

      await sleep(250);
    }

    // 3. 저장된 노선을 기준으로 경유 정류장 수집
    const { data: routes, error: routeReadError } = await db
      .from("bus_routes_cache")
      .select("brt_stdid, brt_id, brt_no")
      .not("brt_stdid", "is", null);

    if (routeReadError) throw routeReadError;

    for (const route of routes ?? []) {
      if (!route.brt_stdid) continue;

      try {
        const stopXml = await callJeonju("/bus_location_busstop_list_common", {
          brtStdid: route.brt_stdid,
        }, key);
        const stops = extractRows(stopXml);

        for (let index = 0; index < stops.length; index++) {
          const stop = stops[index];
          const sequence = Number(stop.seq ?? stop.nodeSeq ?? stop.stationSeq ?? index + 1);
          const nodeId = stop.nodeid ?? stop.nodeId ?? stop.nodeNo ?? "";
          const nodeName = stop.nodenm ?? stop.nodeNm ?? stop.stationName ?? "";
          const stopKey = `${nodeId || nodeName || "stop"}-${sequence}`;

          const { error } = await db.from("bus_route_stops_cache").upsert({
            route_id: route.brt_stdid,
            stop_key: stopKey,
            sequence_no: Number.isFinite(sequence) ? sequence : index + 1,
            node_id: nodeId,
            node_name: nodeName,
            raw: stop,
            updated_at: new Date().toISOString(),
          }, { onConflict: "route_id,stop_key" });

          if (!error) stopCount++;
          else console.error("stop db upsert failed", error);
        }
      } catch (e) {
        console.error("stop sync failed", route, e);
      }

      // 공공 API에 과도한 요청을 보내지 않도록 짧게 쉬어갑니다.
      await sleep(250);
    }

    return new Response(JSON.stringify({
      ok: true,
      routeCount,
      stopCount,
      failedRoutes,
      syncedAt: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : "unknown",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
