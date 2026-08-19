import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { XMLParser } from "https://esm.sh/fast-xml-parser@4.5.0";

const BASE_URL = "https://apis.data.go.kr/4641000/nosun";
const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => name === "list",
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json; charset=utf-8",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

async function callJeonju(path: string, params: Record<string, string>, key: string) {
  const qs = new URLSearchParams(params);
  const url = `${BASE_URL}${path}?serviceKey=${encodeURIComponent(key)}&${qs}`;

  for (let retry = 0; retry < 5; retry++) {
    const res = await fetch(url);
    const text = await res.text();
    if (res.ok) return text;

    if (res.status !== 403 && res.status !== 429) {
      throw new Error(`전주시 API 오류: HTTP ${res.status}`);
    }
    await sleep(1000 * (retry + 1));
  }

  throw new Error("전주시 API 요청이 반복해서 실패했습니다.");
}

function parseItems(xml: string): Record<string, string>[] {
  const parsed = parser.parse(xml) as {
    RFC30?: {
      code?: string;
      msg?: string;
      routeList?: { list?: Record<string, string> | Record<string, string>[] };
    };
  };

  const body = parsed.RFC30;
  if (!body) throw new Error("전주시 API 응답 형식을 확인할 수 없습니다.");
  if (body.code && body.code !== "000") {
    throw new Error(body.msg || `전주시 API 오류 코드: ${body.code}`);
  }

  return asArray(body.routeList?.list);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const key = Deno.env.get("JEONJU_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!key || !supabaseUrl || !serviceRole) {
      throw new Error("JEONJU_API_KEY 또는 Supabase Secret이 설정되지 않았습니다.");
    }

    const db = createClient(supabaseUrl, serviceRole);

    const idXml = await callJeonju("/bus_location_all_common", {}, key);
    const idRows = parseItems(idXml);
    const uniquePairs = Array.from(
      new Map(
        idRows
          .filter((row) => row.brtId)
          .map((row) => [`${row.brtId}-${row.brtClass ?? ""}`, row])
      ).values()
    );

    let routeCount = 0;
    let stopCount = 0;
    let failedRoutes = 0;

    for (const pair of uniquePairs) {
      try {
        const detailXml = await callJeonju("/bus_location1_common", {
          brtId: pair.brtId,
          brtClass: pair.brtClass ?? "",
        }, key);
        const rows = parseItems(detailXml);

        for (const row of rows) {
          const brtId = row.brtId ?? pair.brtId ?? "";
          const brtStdid = row.brtStdid ?? "";
          const brtNo = row.brtNo ?? "";
          const routeKey = `${brtId}-${brtStdid || brtNo}`;

          const { error } = await db.from("bus_routes_cache").upsert({
            route_key: routeKey,
            brt_id: brtId,
            brt_stdid: brtStdid,
            brt_class: row.brtClass ?? pair.brtClass ?? "",
            brt_no: brtNo,
            start_name: row.brtStartNm ?? row.brtSname ?? row.startNm ?? "",
            end_name: row.brtEndNm ?? row.brtEname ?? row.endNm ?? "",
            raw: row,
            updated_at: new Date().toISOString(),
          }, { onConflict: "route_key" });

          if (error) throw error;
          routeCount++;

          if (!brtStdid) continue;

          try {
            const stopXml = await callJeonju("/bus_location_busstop_list_common", {
              brtStdid,
            }, key);
            const stops = parseItems(stopXml);

            if (stops.length > 0) {
              const stopRows = stops.map((stop, index) => {
                // 실제 전주시 응답은 stopStandardid / bnodeId / stopKname / brnSeqno를 사용합니다.
                const nodeId =
                  stop.nodeid ??
                  stop.nodeId ??
                  stop.stopStandardid ??
                  stop.bnodeId ??
                  stop.stopId ??
                  "";
                const nodeName =
                  stop.nodenm ??
                  stop.nodeNm ??
                  stop.stopKname ??
                  "";
                const sequence = Number(
                  stop.seq ?? stop.ord ?? stop.brnSeqno ?? stop.brsSeqno ?? index + 1
                ) || index + 1;

                return {
                  route_id: brtStdid,
                  stop_key: nodeId || `${sequence}-${nodeName}`,
                  sequence_no: sequence,
                  node_id: nodeId,
                  node_name: nodeName,
                  raw: stop,
                  updated_at: new Date().toISOString(),
                };
              });

              const { error: stopError } = await db
                .from("bus_route_stops_cache")
                .upsert(stopRows, { onConflict: "route_id,stop_key" });

              if (stopError) throw stopError;
              stopCount += stopRows.length;
            }
          } catch (error) {
            console.error("stop sync failed", brtStdid, error);
          }
        }
      } catch (error) {
        failedRoutes++;
        console.error("route sync failed", pair, error);
      }

      await sleep(250);
    }

    return new Response(JSON.stringify({
      ok: true,
      routeCount,
      stopCount,
      failedRoutes,
      syncedAt: new Date().toISOString(),
    }), { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error("sync-bus-data fatal", error);
    return new Response(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : "알 수 없는 오류",
    }), { status: 500, headers: corsHeaders });
  }
});
