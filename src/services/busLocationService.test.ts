import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Route, BusStop } from "@/types/route";

const getBusLocationsByRoute = vi.fn();
const fetchStopsForRoute = vi.fn();

vi.mock("@/api/jeonju", () => ({
  getBusLocationsByRoute: (...args: unknown[]) => getBusLocationsByRoute(...args),
}));

vi.mock("@/api/tago", () => ({
  getRouteNoList: vi.fn(),
}));

vi.mock("@/services/routeService", () => ({
  resolveJeonjuBrtStdid: (route: Route) => route.id,
  fetchStopsForRoute: (...args: unknown[]) => fetchStopsForRoute(...args),
}));

const { findNearestApproachingBus } = await import("@/services/busLocationService");

/* 버스 위치 조회는 노선마다 3초 동안 저장해 둔다. 테스트끼리 저장값을
   나눠 쓰지 않게 테스트마다 다른 노선 ID를 쓴다. */
let routeSeq = 0;
function makeRoute(): Route {
  routeSeq += 1;
  return { id: `R${routeSeq}`, number: "101", start: "평화동종점", end: "전북대종점" } as Route;
}

function stop(order: number, id: string, name: string): BusStop {
  return { order, id, name } as BusStop;
}

/** 기점(평화동종점) → … → 내 정류장(평화그린1차아파트, 4번째) */
const STOPS = [
  stop(1, "S1", "평화동종점"),
  stop(2, "S2", "평화동주민센터"),
  stop(3, "S3", "평화동사거리"),
  stop(4, "S4", "평화그린1차아파트"),
];
const TARGET = "S4";

beforeEach(() => {
  // 조회 결과를 남기는 console.info가 테스트 출력을 덮지 않게 끈다.
  vi.spyOn(console, "info").mockImplementation(() => {});
  getBusLocationsByRoute.mockReset();
  fetchStopsForRoute.mockReset();
  fetchStopsForRoute.mockResolvedValue(STOPS);
});

describe("기점 대기 판정 (atOrigin)", () => {
  it("정류장 ID로 기점에 있다고 확인되면 기점 대기다", async () => {
    getBusLocationsByRoute.mockResolvedValue([
      { busNo: "전주1309", stopStandardid: "S1", brnSeqno: "1", stopKname: "평화동종점" },
    ]);
    const result = await findNearestApproachingBus(makeRoute(), TARGET);
    expect(result.bus).toEqual({ stopsAway: 3, vehicleNo: "전주1309", atOrigin: true });
  });

  it("정류장 ID 없이 이름으로 기점이 확인돼도 기점 대기다", async () => {
    getBusLocationsByRoute.mockResolvedValue([
      { busNo: "전주1309", brnSeqno: "1", stopKname: "평화동종점" },
    ]);
    const result = await findNearestApproachingBus(makeRoute(), TARGET);
    expect(result.bus?.atOrigin).toBe(true);
  });

  it("같은 이름 정류장 중 순번으로 기점을 골랐어도(name+order) 기점 대기다", async () => {
    // 순환 노선처럼 기점과 같은 이름의 정류장이 노선 안에 한 번 더 있는 경우
    fetchStopsForRoute.mockResolvedValue([...STOPS, stop(5, "S5", "평화동종점")]);
    getBusLocationsByRoute.mockResolvedValue([
      { busNo: "전주1309", brnSeqno: "1", stopKname: "평화동종점" },
    ]);
    const result = await findNearestApproachingBus(makeRoute(), TARGET);
    expect(result.bus).toEqual({ stopsAway: 3, vehicleNo: "전주1309", atOrigin: true });
  });

  it("순번으로만 어림잡아 첫 정류장이 됐으면 기점 대기로 보지 않는다", async () => {
    // 우리 DB 순번에 구멍이 있다(1 다음이 3). GW는 막 출발한 버스를 순번 2로
    // 보냈고, 정류장 ID도 이름도 맞는 게 없다. 순번 폴백은 "2를 넘지 않는
    // 마지막 정류장"인 첫 정류장으로 내려 잡는다 — 출발 전이 아니다.
    fetchStopsForRoute.mockResolvedValue([
      stop(1, "S1", "평화동종점"),
      stop(3, "S3", "평화동사거리"),
      stop(4, "S4", "평화그린1차아파트"),
    ]);
    getBusLocationsByRoute.mockResolvedValue([
      { busNo: "전주1309", brnSeqno: "2", stopKname: "평화동주민센터" },
    ]);
    const result = await findNearestApproachingBus(makeRoute(), TARGET);
    // 정거장 수는 예전과 같이 계산하고, 기점 표시만 하지 않는다.
    expect(result.bus).toEqual({ stopsAway: 2, vehicleNo: "전주1309", atOrigin: false });
  });

  it("첫 정류장이 아니면 기점 대기가 아니다", async () => {
    getBusLocationsByRoute.mockResolvedValue([
      { busNo: "전주1309", stopStandardid: "S2", brnSeqno: "2", stopKname: "평화동주민센터" },
    ]);
    const result = await findNearestApproachingBus(makeRoute(), TARGET);
    expect(result.bus).toEqual({ stopsAway: 2, vehicleNo: "전주1309", atOrigin: false });
  });

  it("가장 가까운 버스 기준이다 — 기점에 한 대, 더 가까이 한 대면 기점 대기가 아니다", async () => {
    getBusLocationsByRoute.mockResolvedValue([
      { busNo: "전주1309", stopStandardid: "S1", brnSeqno: "1", stopKname: "평화동종점" },
      { busNo: "전주1310", stopStandardid: "S3", brnSeqno: "3", stopKname: "평화동사거리" },
    ]);
    const result = await findNearestApproachingBus(makeRoute(), TARGET);
    expect(result.bus).toEqual({ stopsAway: 1, vehicleNo: "전주1310", atOrigin: false });
  });
});
