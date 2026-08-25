import { createClient } from "npm:@supabase/supabase-js@2";
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
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json; charset=utf-8",
};

const REQUEST_INTERVAL_MS = 350;
const MAX_BACKOFF_MS = 30_000;
const MAX_RETRIES = 6;

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

// ─────────────────────────────────────────────
// 노선 시드 리스트 (2.1)
// bus_location_all_common 은 "현재 운행 중인" 버스의 노선만 반환하므로,
// 배차 간격이 길거나 요청 시점에 운행 중이 아닌 노선은 라이브 API만으로는
// 절대 캐시에 들어오지 못한다. bus_routes_master(정적 노선 확정 목록)의
// 노선번호 전체를 bus_location1_common 으로 개별 조회해서 캐시를 채운다.
// ─────────────────────────────────────────────

// bus_routes_master 조회가 실패하거나 아직 못 채운 노선이 있을 때를 대비한
// 수작업 백업 시드. 캐시 누락이 계속 발견되면 여기에 추가한다. (예: "4-3")
const SEED_FALLBACK_IDS = [
  "752", // 상관·관촌(임실군) 방면
  "970", // 구이(모악산) 방면
  "999", // 명품버스
  "1001",
  "1002",
  "2000",
  "3001",
  "3002",
  "4000",
  "5001",
  "5002",
  "6001",
  "6002",
  "3-1",
  "3-2",
  "6-1",
  "8-1",
  "8-2",
  "9-1",
];

async function buildRouteSeedPairs(
  db: ReturnType<typeof createClient>
): Promise<RoutePair[]> {
  const ids = new Set<string>(SEED_FALLBACK_IDS);

  const { data, error } = await db
    .from("bus_routes_master")
    .select("route_no");

  if (error) {
    console.error("bus_routes_master 조회 실패, 백업 시드만 사용", error);
  } else {
    for (const row of data ?? []) {
      if (row.route_no) ids.add(row.route_no as string);
    }
  }

  return Array.from(ids).map((brtId) => ({
    brtId,
    brtClass: "",
  }));
}

async function callJeonju(
  path: string,
  params: Record<string, string>,
  key: string
) {
  const qs = new URLSearchParams(params);
  const url =
    `${BASE_URL}${path}?serviceKey=${encodeURIComponent(key)}&${qs}`;

  for (let retry = 0; retry < MAX_RETRIES; retry++) {
    const res = await fetch(url);
    const text = await res.text();

    if (res.ok) {
      return text;
    }

    console.error("전주시 API 요청 실패", {
      status: res.status,
      statusText: res.statusText,
      path,
      params,
      response: text.slice(0, 2000),
    });

    // 403(요청 제한 초과)과 429(Too Many Requests) 모두 즉시 실패시키지
    // 않고, 지수 백오프로 재시도한다. 서비스 키 자체가 잘못된 경우에도
    // 403이 반복되므로, 재시도를 모두 소진하면 결국 에러로 빠진다.
    if (res.status === 403 || res.status === 429) {
      const retryAfter = res.headers.get("Retry-After");
      const retryAfterMs = retryAfter
        ? Number(retryAfter) * 1000
        : NaN;

      const backoff = Math.min(
        Number.isFinite(retryAfterMs)
          ? retryAfterMs
          : 2000 * 2 ** retry,
        MAX_BACKOFF_MS
      );

      console.warn(
        `전주시 API rate limit (HTTP ${res.status}), retry ${
          retry + 1
        }/${MAX_RETRIES} in ${backoff}ms`,
        path,
        params
      );

      await sleep(backoff);
      continue;
    }

    throw new Error(
      `전주시 API 오류: HTTP ${res.status} ${text.slice(0, 1000)}`
    );
  }

  throw new Error(
    `전주시 API 요청이 ${MAX_RETRIES}회 재시도 후에도 반복해서 실패했습니다. (${path})`
  );
}

function parseItems(xml: string): Record<string, string>[] {
  const parsed = parser.parse(xml) as {
    RFC30?: {
      code?: string;
      msg?: string;
      routeList?: {
        list?: Record<string, string> | Record<string, string>[];
      };
    };
  };

  const body = parsed.RFC30;

  if (!body) {
    throw new Error(
      "전주시 API 응답 형식을 확인할 수 없습니다."
    );
  }

  if (body.code && body.code !== "000") {
    throw new Error(
      body.msg || `전주시 API 오류 코드: ${body.code}`
    );
  }

  return asArray(body.routeList?.list);
}

type RoutePair = {
  brtId: string;
  brtClass: string;
};

function pairKey(pair: RoutePair) {
  return `${pair.brtId}-${pair.brtClass ?? ""}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    const key = Deno.env.get("JEONJU_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY"
    );

    if (!key || !supabaseUrl || !serviceRole) {
      throw new Error(
        "JEONJU_API_KEY 또는 Supabase Secret이 설정되지 않았습니다."
      );
    }

    const db = createClient(
      supabaseUrl,
      serviceRole
    );

    const idXml = await callJeonju(
      "/bus_location_all_common",
      {},
      key
    );

    const idRows = parseItems(idXml);

    const livePairs: RoutePair[] = idRows
      .filter((row) => row.brtId)
      .map((row) => ({
        brtId: row.brtId,
        brtClass: row.brtClass ?? "",
      }));

    const { data: cachedRows, error: cachedError } =
      await db
        .from("bus_routes_cache")
        .select("brt_id, brt_class");

    if (cachedError) {
      throw cachedError;
    }

    const cachedPairs: RoutePair[] = (cachedRows ?? [])
      .filter((row) => row.brt_id)
      .map((row) => ({
        brtId: row.brt_id as string,
        brtClass:
          (row.brt_class as string) ?? "",
      }));

    // 이미 라이브/캐시에서 brtClass까지 알고 있는 노선은 그대로 두고,
    // 시드는 brtId 기준으로 "아직 한 번도 확인되지 않은" 노선만 보충한다.
    // (시드 노선은 정확한 brtClass를 모르므로 빈 문자열로 조회한다.)
    const knownBrtIds = new Set(
      [...livePairs, ...cachedPairs].map((pair) => pair.brtId)
    );

    const seedPairs = (await buildRouteSeedPairs(db)).filter(
      (pair) => !knownBrtIds.has(pair.brtId)
    );

    const uniquePairs = Array.from(
      new Map(
        [...livePairs, ...cachedPairs, ...seedPairs].map(
          (pair) => [pairKey(pair), pair]
        )
      ).values()
    );

    // ─────────────────────────────────────────────
    // 배치 처리 (2.2)
    // 노선 수가 늘어나면서 한 번의 호출로 uniquePairs 전체를 순회하면
    // Edge Function의 컴퓨트 한도(WORKER_RESOURCE_LIMIT)에 걸린다.
    // bus_sync_state.last_route_id에 커서를 저장해두고, 매 호출마다
    // batchSize만큼만 처리한 뒤 이어서 다음 구간을 처리하도록 한다.
    // cron은 3시간마다 파라미터 없이 호출하므로 기본값으로도 안전해야 한다.
    // ─────────────────────────────────────────────
    const sortedPairs = [...uniquePairs].sort((a, b) =>
      pairKey(a).localeCompare(pairKey(b))
    );

    const url = new URL(req.url);
    let batchSize = 30;
    const batchSizeParam = url.searchParams.get("batchSize");
    if (batchSizeParam && Number(batchSizeParam) > 0) {
      batchSize = Math.floor(Number(batchSizeParam));
    } else {
      try {
        const bodyText = await req.clone().text();
        const body = bodyText ? JSON.parse(bodyText) : null;
        if (body?.batchSize && Number(body.batchSize) > 0) {
          batchSize = Math.floor(Number(body.batchSize));
        }
      } catch {
        // 본문이 없거나 JSON이 아니면 기본값을 사용한다.
      }
    }
    batchSize = Math.min(batchSize, 200);

    const { data: stateRow } = await db
      .from("bus_sync_state")
      .select("last_route_id")
      .eq("id", 1)
      .maybeSingle();

    const cursor = stateRow?.last_route_id ?? null;

    let startIndex = 0;
    if (cursor && sortedPairs.length > 0) {
      const idx = sortedPairs.findIndex(
        (pair) => pairKey(pair) > cursor
      );
      startIndex = idx === -1 ? 0 : idx;
    }

    const batch = sortedPairs.slice(startIndex, startIndex + batchSize);
    if (batch.length < batchSize && startIndex > 0) {
      // 끝까지 처리했으니 다음 사이클을 처음부터 이어서 채운다.
      batch.push(
        ...sortedPairs.slice(0, batchSize - batch.length)
      );
    }

    let routeCount = 0;
    let stopCount = 0;
    let failedRoutes = 0;
    let skippedEmpty = 0;

    for (const pair of batch) {
      try {
        const detailXml = await callJeonju(
          "/bus_location1_common",
          {
            brtId: pair.brtId,
            brtClass: pair.brtClass ?? "",
          },
          key
        );

        const rows = parseItems(detailXml);

        if (rows.length === 0) {
          skippedEmpty++;
        }

        for (const row of rows) {
          const brtId =
            row.brtId ?? pair.brtId ?? "";

          const brtStdid =
            row.brtStdid ?? "";

          const brtNo =
            row.brtNo ?? "";

          const routeKey =
            `${brtId}-${brtStdid || brtNo}`;

          const { error } = await db
            .from("bus_routes_cache")
            .upsert(
              {
                route_key: routeKey,
                brt_id: brtId,
                brt_stdid: brtStdid,
                brt_class:
                  row.brtClass ??
                  pair.brtClass ??
                  "",
                brt_no: brtNo,
                start_name:
                  row.brtStartNm ??
                  row.brtSname ??
                  row.startNm ??
                  "",
                end_name:
                  row.brtEndNm ??
                  row.brtEname ??
                  row.endNm ??
                  "",
                raw: row,
                updated_at:
                  new Date().toISOString(),
              },
              {
                onConflict: "route_key",
              }
            );

          if (error) {
            throw error;
          }

          routeCount++;

          if (!brtStdid) {
            continue;
          }

          try {
            const stopXml = await callJeonju(
              "/bus_location_busstop_list_common",
              {
                brtStdid,
              },
              key
            );

            const stops = parseItems(stopXml);

            if (stops.length > 0) {
              const stopMap = new Map<
                string,
                {
                  route_id: string;
                  stop_key: string;
                  sequence_no: number;
                  node_id: string;
                  node_name: string;
                  raw: Record<string, string>;
                  updated_at: string;
                }
              >();

              stops.forEach((stop, index) => {
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

                const sequence =
                  Number(
                    stop.seq ??
                    stop.ord ??
                    stop.brnSeqno ??
                    stop.brsSeqno ??
                    index + 1
                  ) || index + 1;

                const stopKey =
                  nodeId ||
                  `${sequence}-${nodeName}`;

                const stopRow = {
                  route_id: brtStdid,
                  stop_key: stopKey,
                  sequence_no: sequence,
                  node_id: nodeId,
                  node_name: nodeName,
                  raw: stop,
                  updated_at:
                    new Date().toISOString(),
                };

                // node_id가 실제 정류장 식별자이므로 이걸 기준으로 묶는다.
                // stop_key는 과거 버전에서 형식이 바뀐 적이 있어 더 이상
                // 유일성 기준으로 쓰지 않는다(같은 정류장이 두 번 쌓이는
                // 원인이었음).
                stopMap.set(
                  `${brtStdid}-${nodeId || stopKey}`,
                  stopRow
                );
              });

              const stopRows = Array.from(
                stopMap.values()
              );

              const {
                error: stopError,
              } = await db
                .from("bus_route_stops_cache")
                .upsert(
                  stopRows,
                  {
                    onConflict:
                      "route_id,node_id",
                  }
                );

              if (stopError) {
                throw stopError;
              }

              stopCount += stopRows.length;
            }
          } catch (error) {
            console.error(
              "stop sync failed",
              brtStdid,
              error
            );
          }
        }
      } catch (error) {
        failedRoutes++;

        console.error(
          "route sync failed",
          pair,
          error
        );
      }

      await sleep(REQUEST_INTERVAL_MS);
    }

    const nextCursor =
      batch.length > 0 ? pairKey(batch[batch.length - 1]) : cursor;

    if (nextCursor) {
      await db.from("bus_sync_state").upsert({
        id: 1,
        last_route_id: nextCursor,
        updated_at: new Date().toISOString(),
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        pairCount: uniquePairs.length,
        livePairCount: livePairs.length,
        cachedPairCount: cachedPairs.length,
        seedPairCount: seedPairs.length,
        batchSize,
        batchCount: batch.length,
        startIndex,
        cursor: nextCursor,
        routeCount,
        stopCount,
        failedRoutes,
        skippedEmpty,
        syncedAt:
          new Date().toISOString(),
      }),
      {
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (error) {
    console.error(
      "sync-bus-data fatal",
      error
    );

    return new Response(
      JSON.stringify({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "알 수 없는 오류",
      }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
});
