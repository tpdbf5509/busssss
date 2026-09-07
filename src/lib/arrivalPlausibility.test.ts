import { describe, it, expect } from "vitest";
import { isArrivalTimePlausible, maxPlausibleMinutes } from "./arrivalPlausibility";

describe("isArrivalTimePlausible", () => {
  it("제보된 사례를 걸러낸다 — 한 정거장 남았는데 14분/7분", () => {
    // 104번에서 실제로 나온 조합. 실측 도착은 2분 이내였다.
    expect(isArrivalTimePlausible(14, 1)).toBe(false);
    expect(isArrivalTimePlausible(7, 1)).toBe(false);
  });

  it("정거장 수에 걸맞은 시간은 그대로 통과시킨다", () => {
    expect(isArrivalTimePlausible(2, 1)).toBe(true);
    expect(isArrivalTimePlausible(5, 1)).toBe(true); // 상한선
    expect(isArrivalTimePlausible(8, 2)).toBe(true);
    expect(isArrivalTimePlausible(14, 5)).toBe(true);
    expect(isArrivalTimePlausible(30, 10)).toBe(true);
  });

  it("정류장에 이미 와 있는 버스는 긴 예측을 인정하지 않는다", () => {
    expect(isArrivalTimePlausible(2, 0)).toBe(true);
    expect(isArrivalTimePlausible(9, 0)).toBe(false);
  });

  it("시간이 실제보다 짧은 쪽은 걸러내지 않는다 (피해가 작은 방향)", () => {
    expect(isArrivalTimePlausible(1, 10)).toBe(true);
  });

  it("대조할 값이 없으면 판단하지 않고 그대로 믿는다", () => {
    expect(isArrivalTimePlausible(14, null)).toBe(true);
    expect(isArrivalTimePlausible(null, 1)).toBe(true);
    expect(isArrivalTimePlausible(undefined, undefined)).toBe(true);
  });
});

describe("maxPlausibleMinutes", () => {
  it("정거장 수에 비례해 상한이 늘어난다", () => {
    expect(maxPlausibleMinutes(0)).toBe(2);
    expect(maxPlausibleMinutes(1)).toBe(5);
    expect(maxPlausibleMinutes(3)).toBe(11);
  });

  it("음수는 0으로 본다", () => {
    expect(maxPlausibleMinutes(-2)).toBe(2);
  });
});
