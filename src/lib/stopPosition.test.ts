import { describe, it, expect } from "vitest";
import type { BusStop } from "@/types/route";
import {
  indexOfStopByOrder,
  resolveBusStopIndex,
  maxStopsBefore,
} from "./stopPosition";

/**
 * 실제 Supabase 데이터에서 가져온 픽스처.
 * 10번 노선(route_id 305001790): 정류장 26개, 순번은 1..49 사이에 구멍이 있음.
 * 이 노선을 쓰는 이유는 "순번 = 위치"라는 가정이 깨지는 실제 사례이기 때문.
 */
const ROUTE_10_SEQS = [
  1, 3, 4, 6, 8, 10, 12, 13, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28, 30,
  34, 37, 39, 47, 49,
];

const route10: BusStop[] = ROUTE_10_SEQS.map((order, i) => ({
  id: `node-${order}`,
  name: `정류장${i + 1}`,
  order,
}));

/** 순번이 1부터 시작하지 않는 노선 (실제로 7개 존재) */
const nonOneBased: BusStop[] = [3, 5, 9, 14].map((order, i) => ({
  id: `n-${order}`,
  name: `정류장${i + 1}`,
  order,
}));

describe("indexOfStopByOrder", () => {
  it("순번으로 목록 내 위치를 찾는다", () => {
    expect(indexOfStopByOrder(route10, 1)).toBe(0);
    expect(indexOfStopByOrder(route10, 49)).toBe(25);
    expect(indexOfStopByOrder(route10, 37)).toBe(22);
  });

  it("존재하지 않는 순번은 -1을 반환한다", () => {
    // 46은 이 노선에 없는 순번이다 (39 다음이 47).
    expect(indexOfStopByOrder(route10, 46)).toBe(-1);
  });
});

describe("N정거장 전 계산 (핵심 회귀 테스트)", () => {
  it("순번에 구멍이 있어도 정확히 N개 앞 정류장을 가리킨다", () => {
    const targetIndex = indexOfStopByOrder(route10, 49); // 종점 = 26번째 정류장
    const triggerIndex = targetIndex - 3;

    expect(triggerIndex).toBe(22);
    // 실제로 3정거장 앞선 정류장의 순번은 37이다.
    expect(route10[triggerIndex].order).toBe(37);
  });

  it("기존 순번 뺄셈 방식이 왜 틀렸는지 보여준다", () => {
    // 옛 코드: triggerOrder = targetStopOrder - stopsBefore = 49 - 3 = 46
    const oldTriggerOrder = 49 - 3;

    // 옛 코드는 nodeOrder >= 46인 첫 버스에서 알림을 울렸다.
    // 46 이상인 첫 정류장은 47이고, 그건 목록의 24번째(0-based)다.
    const firstStopAtOrAfter = route10.findIndex((s) => s.order >= oldTriggerOrder);
    expect(route10[firstStopAtOrAfter].order).toBe(47);

    // 종점(index 25)까지 남은 실제 정류장 수는 1개뿐 — 3개가 아니다.
    const actualStopsOfWarning = 25 - firstStopAtOrAfter;
    expect(actualStopsOfWarning).toBe(1);
  });
});

describe("resolveBusStopIndex", () => {
  it("정류장 ID가 맞으면 ID로 환산한다", () => {
    expect(resolveBusStopIndex(route10, "node-37", 999)).toEqual({
      index: 22,
      resolvedBy: "nodeId",
    });
  });

  it("ID가 없으면 nodeOrder를 순번으로 보고 환산한다", () => {
    expect(resolveBusStopIndex(route10, "", 47)).toEqual({
      index: 24,
      resolvedBy: "order",
    });
  });

  it("목록에 없는 순번은 그 값을 넘지 않는 마지막 정류장으로 환산한다", () => {
    // 46은 없는 순번. 46을 넘지 않는 마지막 정류장은 39(index 23).
    expect(resolveBusStopIndex(route10, "", 46)).toEqual({
      index: 23,
      resolvedBy: "order",
    });
  });

  it("ID가 목록에 없으면 nodeOrder로 폴백한다", () => {
    expect(resolveBusStopIndex(route10, "모르는ID", 8)).toEqual({
      index: 4,
      resolvedBy: "order",
    });
  });

  it("환산할 근거가 없으면 실패를 명시한다", () => {
    expect(resolveBusStopIndex(route10, "", 0)).toEqual({
      index: -1,
      resolvedBy: "none",
    });
    // 첫 정류장(순번 1)보다 앞선 위치는 환산 불가.
    expect(resolveBusStopIndex(nonOneBased, "", 1)).toEqual({
      index: -1,
      resolvedBy: "none",
    });
  });

  it("1번에서 시작하지 않는 노선도 처리한다", () => {
    expect(resolveBusStopIndex(nonOneBased, "", 3)).toEqual({
      index: 0,
      resolvedBy: "order",
    });
    expect(resolveBusStopIndex(nonOneBased, "", 14)).toEqual({
      index: 3,
      resolvedBy: "order",
    });
  });
});

describe("maxStopsBefore", () => {
  it("앞선 정류장 수를 넘지 않게 제한한다", () => {
    // 목록의 3번째(index 2) 정류장이면 최대 2정거장 전까지만 가능.
    expect(maxStopsBefore(2)).toBe(2);
  });

  it("기본 상한 10을 넘지 않는다", () => {
    expect(maxStopsBefore(25)).toBe(10);
  });

  it("첫 정류장이면 0 (알림 설정 자체가 불가능)", () => {
    expect(maxStopsBefore(0)).toBe(0);
  });

  it("환산 실패(-1)도 0으로 처리한다", () => {
    expect(maxStopsBefore(-1)).toBe(0);
  });
});
