import { describe, expect, it, vi } from "vitest";
import type { BusStop, Route, Station } from "@/types/route";
import {
  MAX_DIRECT_RESULTS,
  findDirectRoutes,
  type DirectRouteDeps,
} from "@/services/directRouteService";

const station = (id: string, name: string): Station => ({
  id,
  name,
  arsId: "",
  lat: null,
  lng: null,
});

const route = (id: string, number: string): Route => ({
  id,
  number,
  rawNumber: number,
  class: "1",
  subId: "",
  name: `본선${number}`,
  start: "기점",
  end: "종점",
  firstBus: "05:00",
  lastBus: "22:00",
  interval: "10",
  distance: "",
});

const stops = (orders: number[]): BusStop[] =>
  orders.map((order) => ({ id: `n${order}`, name: `정류장${order}`, order }));

function makeDeps(overrides: Partial<DirectRouteDeps> = {}): DirectRouteDeps {
  return {
    getPasses: vi.fn().mockResolvedValue([]),
    getRoutes: vi.fn().mockResolvedValue([]),
    getStops: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe("findDirectRoutes", () => {
  const from = [station("A", "출발")];
  const to = [station("B", "도착")];

  it("정류장이 비면 아무것도 부르지 않는다", async () => {
    const deps = makeDeps();
    expect(await findDirectRoutes([], to, deps)).toEqual([]);
    expect(deps.getPasses).not.toHaveBeenCalled();
  });

  it("노선-정류장 조회는 출발·도착을 묶어 한 번만 부른다", async () => {
    const deps = makeDeps();
    await findDirectRoutes(from, to, deps);
    expect(deps.getPasses).toHaveBeenCalledTimes(1);
    expect(deps.getPasses).toHaveBeenCalledWith(["A", "B"]);
  });

  it("직행이 없으면 빈 목록이고 노선 목록도 부르지 않는다", async () => {
    const deps = makeDeps({
      getPasses: vi.fn().mockResolvedValue([{ routeId: "R1", nodeId: "A", order: 1 }]),
    });
    expect(await findDirectRoutes(from, to, deps)).toEqual([]);
    expect(deps.getRoutes).not.toHaveBeenCalled();
  });

  it("정거장 수는 순번 차이가 아니라 정류장 목록 위치로 센다", async () => {
    const deps = makeDeps({
      getPasses: vi.fn().mockResolvedValue([
        { routeId: "R1", nodeId: "A", order: 3 },
        { routeId: "R1", nodeId: "B", order: 10 },
      ]),
      getRoutes: vi.fn().mockResolvedValue([route("R1", "101")]),
      getStops: vi.fn().mockResolvedValue(stops([1, 3, 4, 6, 8, 10])),
    });
    const result = await findDirectRoutes(from, to, deps);
    expect(result).toHaveLength(1);
    expect(result[0].stopCount).toBe(4);
    expect(result[0].route.number).toBe("101");
    expect(result[0].boardStation.id).toBe("A");
    expect(result[0].alightStation.id).toBe("B");
  });

  it("정거장 수가 적은 순으로 정렬한다", async () => {
    const deps = makeDeps({
      getPasses: vi.fn().mockResolvedValue([
        { routeId: "R1", nodeId: "A", order: 1 },
        { routeId: "R1", nodeId: "B", order: 6 },
        { routeId: "R2", nodeId: "A", order: 1 },
        { routeId: "R2", nodeId: "B", order: 3 },
      ]),
      getRoutes: vi.fn().mockResolvedValue([route("R1", "101"), route("R2", "202")]),
      getStops: vi.fn().mockImplementation(async (r: Route) =>
        r.id === "R1" ? stops([1, 2, 3, 4, 5, 6]) : stops([1, 2, 3]),
      ),
    });
    const result = await findDirectRoutes(from, to, deps);
    expect(result.map((r) => r.route.number)).toEqual(["202", "101"]);
    expect(result.map((r) => r.stopCount)).toEqual([2, 5]);
  });

  it("정류장 목록에서 두 정류장을 못 찾는 노선은 어림값 대신 뺀다", async () => {
    const deps = makeDeps({
      getPasses: vi.fn().mockResolvedValue([
        { routeId: "R1", nodeId: "A", order: 1 },
        { routeId: "R1", nodeId: "B", order: 6 },
      ]),
      getRoutes: vi.fn().mockResolvedValue([route("R1", "101")]),
      getStops: vi.fn().mockResolvedValue(stops([1, 2, 3])), // 순번 6이 없다
    });
    expect(await findDirectRoutes(from, to, deps)).toEqual([]);
  });

  it(`정류장 목록은 상위 ${MAX_DIRECT_RESULTS}개 노선만 받는다`, async () => {
    const passes = Array.from({ length: 10 }, (_, i) => [
      { routeId: `R${i}`, nodeId: "A", order: 1 },
      { routeId: `R${i}`, nodeId: "B", order: 2 + i },
    ]).flat();
    const deps = makeDeps({
      getPasses: vi.fn().mockResolvedValue(passes),
      getRoutes: vi
        .fn()
        .mockResolvedValue(Array.from({ length: 10 }, (_, i) => route(`R${i}`, `${i}`))),
      getStops: vi.fn().mockResolvedValue(stops(Array.from({ length: 12 }, (_, i) => i + 1))),
    });
    await findDirectRoutes(from, to, deps);
    expect(deps.getStops).toHaveBeenCalledTimes(MAX_DIRECT_RESULTS);
  });

  it("조회가 실패하면 오류를 그대로 올린다(결과를 지어내지 않는다)", async () => {
    const deps = makeDeps({
      getPasses: vi.fn().mockRejectedValue(new Error("HTTP 500")),
    });
    await expect(findDirectRoutes(from, to, deps)).rejects.toThrow("HTTP 500");
  });
});
