import { describe, expect, it } from "vitest";
import type { BusStop, Station } from "@/types/route";
import {
  countStopsBetween,
  findDirectCandidates,
  groupLabel,
  groupStationsByName,
  isSameGroup,
  splitStationsOneByOne,
  type RouteStopPass,
} from "./directRoutes";

const pass = (routeId: string, nodeId: string, order: number): RouteStopPass => ({
  routeId,
  nodeId,
  order,
});

describe("findDirectCandidates", () => {
  it("출발이 도착보다 앞서는 노선만 남긴다(방향이 맞는 노선)", () => {
    const passes = [
      // R1: A → B 방향
      pass("R1", "A", 3),
      pass("R1", "B", 9),
      // R2: 반대 방향(B가 A보다 앞)
      pass("R2", "B", 2),
      pass("R2", "A", 8),
    ];
    const result = findDirectCandidates(passes, ["A"], ["B"]);
    expect(result.map((c) => c.routeId)).toEqual(["R1"]);
    expect(result[0]).toMatchObject({
      boardNodeId: "A",
      alightNodeId: "B",
      boardOrder: 3,
      alightOrder: 9,
    });
  });

  it("출발이나 도착 중 한쪽만 지나는 노선은 뺀다", () => {
    const passes = [pass("R1", "A", 1), pass("R2", "B", 5), pass("R3", "C", 2)];
    expect(findDirectCandidates(passes, ["A"], ["B"])).toEqual([]);
  });

  it("같은 이름 정류장이 여러 개면 가장 짧은 짝 하나만 남긴다", () => {
    const passes = [
      pass("R1", "A1", 2),
      pass("R1", "A2", 10),
      pass("R1", "B1", 12),
    ];
    const result = findDirectCandidates(passes, ["A1", "A2"], ["B1"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ boardNodeId: "A2", alightNodeId: "B1" });
  });

  it("순환 노선처럼 같은 정류장을 두 번 지나도 앞선 짝이 아니라 짧은 짝을 쓴다", () => {
    const passes = [
      pass("R1", "A", 1),
      pass("R1", "B", 4),
      pass("R1", "A", 20),
      pass("R1", "B", 23),
    ];
    const result = findDirectCandidates(passes, ["A"], ["B"]);
    expect(result).toHaveLength(1);
    expect(result[0].alightOrder - result[0].boardOrder).toBe(3);
  });

  it("순번 차이가 작은 순으로 정렬하고, 같으면 노선 ID 순이다", () => {
    const passes = [
      pass("R3", "A", 1),
      pass("R3", "B", 9),
      pass("R2", "A", 1),
      pass("R2", "B", 3),
      pass("R1", "A", 5),
      pass("R1", "B", 7),
    ];
    const result = findDirectCandidates(passes, ["A"], ["B"]);
    expect(result.map((c) => c.routeId)).toEqual(["R1", "R2", "R3"]);
  });

  it("출발과 도착이 같은 정류장 ID면 짝으로 보지 않는다", () => {
    const passes = [pass("R1", "A", 1), pass("R1", "A", 5)];
    expect(findDirectCandidates(passes, ["A"], ["A"])).toEqual([]);
  });

  it("후보 정류장이 비어 있으면 빈 목록이다", () => {
    expect(findDirectCandidates([pass("R1", "A", 1)], [], ["A"])).toEqual([]);
  });
});

describe("countStopsBetween", () => {
  // 순번에 구멍이 있는 노선(stopPosition.test.ts의 10번 노선과 같은 모양)
  const stops: BusStop[] = [1, 3, 4, 6, 8, 10].map((order) => ({
    id: `n${order}`,
    name: `정류장${order}`,
    order,
  }));

  it("순번 차이가 아니라 목록 위치 차이로 센다", () => {
    // 순번 3 → 10은 차이 7이지만 실제로는 4번째 정거장이다.
    expect(countStopsBetween(stops, 3, 10)).toBe(4);
  });

  it("바로 다음 정류장은 1정거장이다", () => {
    expect(countStopsBetween(stops, 1, 3)).toBe(1);
  });

  it("승차가 하차보다 뒤거나 목록에 없으면 null이다", () => {
    expect(countStopsBetween(stops, 10, 3)).toBeNull();
    expect(countStopsBetween(stops, 4, 4)).toBeNull();
    expect(countStopsBetween(stops, 2, 10)).toBeNull();
    expect(countStopsBetween(stops, 3, 99)).toBeNull();
  });
});

describe("groupStationsByName", () => {
  const st = (id: string, name: string, arsId = ""): Station => ({
    id,
    name,
    arsId,
    lat: null,
    lng: null,
  });

  it("이름이 같은 정류장을 한 묶음으로 만들고 순서를 지킨다", () => {
    const groups = groupStationsByName([
      st("1", "전주역", "11111"),
      st("2", "시청", "22222"),
      st("3", "전주역", "33333"),
    ]);
    expect(groups.map((g) => g.name)).toEqual(["전주역", "시청"]);
    expect(groups[0].stations.map((s) => s.id)).toEqual(["1", "3"]);
  });

  it("공백과 괄호 안 글자는 무시하고 같은 이름으로 본다", () => {
    const groups = groupStationsByName([st("1", "전주 역"), st("2", "전주역(건너편)")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].stations).toHaveLength(2);
  });

  it("같은 정류장 ID는 두 번 넣지 않는다", () => {
    const groups = groupStationsByName([st("1", "전주역"), st("1", "전주역")]);
    expect(groups[0].stations).toHaveLength(1);
  });

  it("isSameGroup은 정규화한 이름으로 비교한다", () => {
    const [a] = groupStationsByName([st("1", "전주역")]);
    const [b] = groupStationsByName([st("2", "전주 역")]);
    const [c] = groupStationsByName([st("3", "시청")]);
    expect(isSameGroup(a, b)).toBe(true);
    expect(isSameGroup(a, c)).toBe(false);
  });
});

describe("현재 위치 묶음", () => {
  const stn = (id: string, name: string): Station => ({ id, name, arsId: "", lat: null, lng: null });

  it("origin이 있는 묶음은 어떤 이름과도 같다고 보지 않는다", () => {
    const here = { name: "현재 위치", stations: [stn("1", "전주역")], origin: { lat: 35.8, lng: 127.1 } };
    const named = { name: "전주역", stations: [stn("1", "전주역")] };
    expect(isSameGroup(here, named)).toBe(false);
    expect(isSameGroup(named, here)).toBe(false);
  });
});

describe("정류장 하나씩 나누기", () => {
  const st = (id: string, name: string, arsId = ""): Station => ({
    id,
    name,
    arsId,
    lat: null,
    lng: null,
  });

  it("같은 이름이어도 정류장마다 후보를 따로 만들고 순서를 지킨다", () => {
    const groups = splitStationsOneByOne([
      st("1", "영생고 전주대사대부고", "30609"),
      st("2", "시청", "22222"),
      st("3", "영생고 전주대사대부고", "30630"),
    ]);
    expect(groups.map((g) => g.stations[0].id)).toEqual(["1", "2", "3"]);
    expect(groups.every((g) => g.single && g.stations.length === 1)).toBe(true);
  });

  it("같은 정류장 ID는 한 번만 넣는다", () => {
    expect(splitStationsOneByOne([st("1", "전주역"), st("1", "전주역")])).toHaveLength(1);
  });

  it("칸 글에는 번호를 붙이고 번호가 없으면 이름만 쓴다", () => {
    const [a, b] = splitStationsOneByOne([st("1", "전주역", "30609"), st("2", "시청")]);
    expect(groupLabel(a)).toBe("전주역 (30609)");
    expect(groupLabel(b)).toBe("시청");
    expect(groupLabel({ name: "근처 정류장", stations: [st("1", "전주역", "30609")] })).toBe("근처 정류장");
  });

  it("이름이 같아도 번호가 다른 두 정류장은 같은 곳이 아니다", () => {
    const [a, b, a2] = splitStationsOneByOne([
      st("1", "전주역", "30609"),
      st("2", "전주역", "30630"),
      st("1", "전주역", "30609"),
    ]);
    expect(a2).toBeUndefined();
    expect(isSameGroup(a, b)).toBe(false);
    expect(isSameGroup(a, a)).toBe(true);
  });

  it("이름 묶음(인기 목적지 알약)과 비교해도 정류장 ID가 겹칠 때만 같다", () => {
    const [one] = splitStationsOneByOne([st("1", "전주역", "30609")]);
    const byName = { name: "전주역", stations: [st("1", "전주역"), st("2", "전주역")] };
    const other = { name: "전주역", stations: [st("9", "전주역")] };
    expect(isSameGroup(one, byName)).toBe(true);
    expect(isSameGroup(one, other)).toBe(false);
  });
});
