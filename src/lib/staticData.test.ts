import { describe, expect, it } from "vitest";
import {
  buildMeta,
  buildRoutes,
  buildStopsPayload,
  isRoutesPayload,
  isStopsPayload,
  routeIdsForStop,
  searchStationsInPayload,
  stopsForRoute,
  type MasterRow,
  type RouteCacheRow,
  type StopSourceRow,
} from "@/lib/staticData";

const master: MasterRow[] = [
  { brt_stdid: "100", route_no: "103-1", category: "분선", start_node: "가", end_node: "나", start_time: "0600", end_time: "2200" },
  { brt_stdid: "200", route_no: "104", category: "본선", start_node: "다", end_node: "라", start_time: null, end_time: null },
];
const cache: RouteCacheRow[] = [
  {
    brt_id: "103",
    brt_stdid: "100",
    brt_class: "1",
    brt_no: "103",
    start_name: "캐시시작",
    end_name: "",
    raw: { brtMininterval: "10", brtMaxinterval: "20" },
  },
  { brt_id: "999", brt_stdid: "900", brt_class: "0", brt_no: null, start_name: "x", end_name: "y", raw: {} },
];

describe("buildRoutes", () => {
  const routes = buildRoutes(master, cache);

  it("master를 기준으로 cache를 덧붙인다", () => {
    expect(routes[0]).toMatchObject({
      brtStdid: "100",
      brtNo: "103-1",
      brtId: "103",
      brtClass: "1",
      brtStartNm: "캐시시작",
      // cache의 end_name이 비어 있으면 master 값으로 채운다
      brtEndNm: "나",
      brtMininterval: "10",
      category: "분선",
    });
  });

  it("cache가 없는 master 노선도 빠지지 않는다", () => {
    expect(routes[1]).toMatchObject({ brtStdid: "200", brtId: "", brtClass: "", brtFirsttime: "", category: "본선" });
  });

  it("master에 없는 cache 노선은 뒤에 붙고 brtNo가 없으면 brtId를 쓴다", () => {
    expect(routes[2]).toMatchObject({ brtStdid: "900", brtNo: "999", brtStartNm: "x" });
    expect(routes).toHaveLength(3);
  });
});

const stopRows: StopSourceRow[] = [
  { route_id: "100", sequence_no: 2, node_id: "N2", node_name: "나정류장", ars_id: "222" },
  { route_id: "100", sequence_no: 1, node_id: "N1", node_name: "가정류장", ars_id: "111" },
  { route_id: "200", sequence_no: 1, node_id: "N1", node_name: "가정류장", ars_id: null },
  { route_id: "200", sequence_no: 2, node_id: "N3", node_name: "", ars_id: "333" },
  { route_id: "200", sequence_no: 3, node_id: "", node_name: "무시", ars_id: "" },
];

describe("buildStopsPayload", () => {
  const payload = buildStopsPayload(stopRows);

  it("정류장 표는 같은 정류장을 한 번만 두고 이름순이다", () => {
    expect(payload.stations.map((s) => s[0])).toEqual(["N3", "N1", "N2"]);
    // 이름이 빈 정류장이 맨 앞(빈 문자열이 가장 앞선다)
    expect(payload.stations.find((s) => s[0] === "N1")).toEqual(["N1", "가정류장", "111"]);
  });

  it("node_id가 없는 줄은 버린다", () => {
    expect(payload.routes["200"]).toHaveLength(2);
  });

  it("노선마다 순서대로 정렬된다", () => {
    const names = stopsForRoute(payload, "100").map((s) => s.nodenm);
    expect(names).toEqual(["가정류장", "나정류장"]);
  });

  it("화면용 필드는 기존 Supabase 경로와 같은 모양이다", () => {
    expect(stopsForRoute(payload, "100")[0]).toMatchObject({
      brtStdid: "100",
      nodeid: "N1",
      nodenm: "가정류장",
      seq: "1",
      stopStandardid: "N1",
      stopId: "N1",
      stopKname: "가정류장",
      brnSeqno: "1",
    });
  });

  it("없는 노선은 빈 배열이다", () => {
    expect(stopsForRoute(payload, "nope")).toEqual([]);
  });

  it("정류장을 지나는 노선을 거꾸로 찾는다", () => {
    expect(routeIdsForStop(payload, "N1").sort()).toEqual(["100", "200"]);
    expect(routeIdsForStop(payload, "N2")).toEqual(["100"]);
    expect(routeIdsForStop(payload, "없음")).toEqual([]);
  });

  it("정류장 검색은 이름 부분 일치이고 번호(ARS)를 함께 준다", () => {
    expect(searchStationsInPayload(payload, "가정")).toEqual([{ nodeid: "N1", nodenm: "가정류장", nodeno: "111" }]);
    expect(searchStationsInPayload(payload, "").length).toBe(3);
    expect(searchStationsInPayload(payload, "없는이름")).toEqual([]);
  });

  it("검색 결과는 30개까지만 준다", () => {
    const many = buildStopsPayload(
      Array.from({ length: 50 }, (_, i) => ({
        route_id: "r",
        sequence_no: i,
        node_id: `N${i}`,
        node_name: `정류장${i}`,
        ars_id: "",
      })),
    );
    expect(searchStationsInPayload(many, "정류장")).toHaveLength(30);
  });
});

describe("검증과 메타", () => {
  it("모양이 틀린 데이터를 거른다", () => {
    expect(isRoutesPayload([{ brtStdid: "1" }])).toBe(true);
    expect(isRoutesPayload([{ no: 1 }])).toBe(false);
    expect(isRoutesPayload({})).toBe(false);
    expect(isStopsPayload({ stations: [], routes: {} })).toBe(true);
    expect(isStopsPayload({ stations: [], routes: [] })).toBe(false);
    expect(isStopsPayload(null)).toBe(false);
  });

  it("meta는 개수를 센다", () => {
    const payload = buildStopsPayload(stopRows);
    const meta = buildMeta(buildRoutes(master, cache), payload, new Date("2026-11-10T00:00:00Z"));
    expect(meta).toEqual({
      generatedAt: "2026-11-10T00:00:00.000Z",
      routeCount: 3,
      stationCount: 3,
      stopLinkCount: 4,
    });
  });
});
