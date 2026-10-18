import { describe, expect, it } from "vitest";
import {
  DEFAULT_EVENING,
  DEFAULT_MORNING,
  currentCommuteSlot,
  msUntilSlotChange,
  sanitizeWindow,
  type CommuteConfig,
} from "@/lib/commute";

const CFG: CommuteConfig = { morning: DEFAULT_MORNING, evening: DEFAULT_EVENING };

/** 로컬 시각 기준 Date. 시간대(TZ)와 상관없이 getHours()가 h가 된다. */
const at = (h: number, m = 0, s = 0) => new Date(2026, 9, 19, h, m, s);

describe("currentCommuteSlot", () => {
  it("기본 시간대: 출근 05~11시, 퇴근 15~21시", () => {
    expect(currentCommuteSlot(at(4, 59), CFG)).toBeNull();
    expect(currentCommuteSlot(at(5, 0), CFG)).toBe("morning");
    expect(currentCommuteSlot(at(10, 59), CFG)).toBe("morning");
    expect(currentCommuteSlot(at(11, 0), CFG)).toBeNull();
    expect(currentCommuteSlot(at(14, 59), CFG)).toBeNull();
    expect(currentCommuteSlot(at(15, 0), CFG)).toBe("evening");
    expect(currentCommuteSlot(at(20, 59), CFG)).toBe("evening");
    expect(currentCommuteSlot(at(21, 0), CFG)).toBeNull();
    expect(currentCommuteSlot(at(0, 0), CFG)).toBeNull();
  });

  it("사용자가 바꾼 시간대를 따른다", () => {
    const cfg: CommuteConfig = { morning: { start: 7, end: 9 }, evening: { start: 18, end: 20 } };
    expect(currentCommuteSlot(at(6, 59), cfg)).toBeNull();
    expect(currentCommuteSlot(at(7), cfg)).toBe("morning");
    expect(currentCommuteSlot(at(9), cfg)).toBeNull();
    expect(currentCommuteSlot(at(19), cfg)).toBe("evening");
  });

  it("자정을 넘기는 시간대(end < start)", () => {
    const cfg: CommuteConfig = { morning: { start: 5, end: 11 }, evening: { start: 22, end: 3 } };
    expect(currentCommuteSlot(at(23), cfg)).toBe("evening");
    expect(currentCommuteSlot(at(1), cfg)).toBe("evening");
    expect(currentCommuteSlot(at(3), cfg)).toBeNull();
    expect(currentCommuteSlot(at(21, 59), cfg)).toBeNull();
  });

  it("start === end 는 빈 시간대다(하루 종일이 아니다)", () => {
    const cfg: CommuteConfig = { morning: { start: 8, end: 8 }, evening: { start: 18, end: 18 } };
    for (let h = 0; h < 24; h++) expect(currentCommuteSlot(at(h), cfg)).toBeNull();
  });

  it("두 시간대가 겹치면 출근이 먼저", () => {
    const cfg: CommuteConfig = { morning: { start: 8, end: 14 }, evening: { start: 12, end: 20 } };
    expect(currentCommuteSlot(at(13), cfg)).toBe("morning");
    expect(currentCommuteSlot(at(15), cfg)).toBe("evening");
  });
});

describe("msUntilSlotChange", () => {
  it("다음 정각까지 남은 시간 + 1초(분마다 다시 계산하지 않는다)", () => {
    // 04:30 → 05:00 까지 30분
    expect(msUntilSlotChange(at(4, 30), CFG)).toBe((30 * 60 + 1) * 1000);
    // 10:59:30 → 11:00 까지 30초
    expect(msUntilSlotChange(at(10, 59, 30), CFG)).toBe(31 * 1000);
  });

  it("정각 정확히에서는 다음 경계(1시간 뒤 또는 그 다음 경계)를 본다", () => {
    // 05:00:00 → 다음 경계는 11:00
    expect(msUntilSlotChange(at(5, 0, 0), CFG)).toBe((6 * 3600 + 1) * 1000);
  });

  it("마지막 경계 뒤에는 다음 날 첫 경계(05시)를 본다", () => {
    // 22:00 → 다음 날 05:00 까지 7시간
    expect(msUntilSlotChange(at(22), CFG)).toBe((7 * 3600 + 1) * 1000);
  });

  it("쓸 시간대가 없으면 null(타이머를 걸지 않는다)", () => {
    const cfg: CommuteConfig = { morning: { start: 8, end: 8 }, evening: { start: 9, end: 9 } };
    expect(msUntilSlotChange(at(12), cfg)).toBeNull();
  });
});

describe("sanitizeWindow", () => {
  it("올바른 값은 그대로", () => {
    expect(sanitizeWindow({ start: 6, end: 10 }, DEFAULT_MORNING)).toEqual({ start: 6, end: 10 });
    expect(sanitizeWindow({ start: 0, end: 23 }, DEFAULT_MORNING)).toEqual({ start: 0, end: 23 });
  });

  it("없거나 이상하면 기본값(복사본)", () => {
    for (const bad of [undefined, null, 3, "x", {}, { start: 5 }, { start: -1, end: 4 }, { start: 5, end: 24 }, { start: 5.5, end: 8 }, { start: "5", end: 8 }]) {
      const w = sanitizeWindow(bad, DEFAULT_MORNING);
      expect(w).toEqual(DEFAULT_MORNING);
      expect(w).not.toBe(DEFAULT_MORNING);
    }
  });
});
