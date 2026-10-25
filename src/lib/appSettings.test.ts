import { describe, expect, it } from "vitest";
import { applySettings, commuteConfigOf, defaultSettings, parseSettings } from "@/lib/appSettings";

function fakeRoot() {
  const set = new Set<string>();
  return {
    set,
    classList: {
      toggle(token: string, force?: boolean) {
        if (force) set.add(token);
        else set.delete(token);
        return Boolean(force);
      },
    },
  };
}

describe("parseSettings", () => {
  it("저장값이 없으면 기본값", () => {
    expect(parseSettings(null)).toEqual(defaultSettings);
    expect(parseSettings("")).toEqual(defaultSettings);
  });

  it("저장한 큰 글씨·색약 모드를 그대로 읽는다", () => {
    const s = parseSettings(JSON.stringify({ largeText: true, colorBlind: true }));
    expect(s.largeText).toBe(true);
    expect(s.colorBlind).toBe(true);
    expect(s.voiceGuide).toBe(false);
  });

  it("6단계 이전에 저장된 설정(시간대 필드 없음)은 꺼짐·기본 시간대로 읽는다", () => {
    const old = JSON.stringify({ darkMode: false, largeText: true, colorBlind: false, voiceGuide: false });
    const s = parseSettings(old);
    expect(s.largeText).toBe(true);
    expect(s.commuteSwitch).toBe(false);
    expect(s.commuteMorning).toEqual({ start: 5, end: 11 });
    expect(s.commuteEvening).toEqual({ start: 15, end: 21 });
    expect(commuteConfigOf(s)).toBeNull();
  });

  it("저장한 시간대 설정을 그대로 읽고, 켰을 때만 설정을 돌려준다", () => {
    const s = parseSettings(
      JSON.stringify({
        commuteSwitch: true,
        commuteMorning: { start: 6, end: 9 },
        commuteEvening: { start: 17, end: 20 },
      }),
    );
    expect(commuteConfigOf(s)).toEqual({
      morning: { start: 6, end: 9 },
      evening: { start: 17, end: 20 },
    });
  });

  it("시간대 필드가 이상한 값이면 기본값으로 바로잡는다(앱이 깨지지 않는다)", () => {
    const s = parseSettings(
      JSON.stringify({ commuteSwitch: "yes", commuteMorning: { start: 99, end: 1 }, commuteEvening: 7 }),
    );
    expect(s.commuteSwitch).toBe(false);
    expect(s.commuteMorning).toEqual({ start: 5, end: 11 });
    expect(s.commuteEvening).toEqual({ start: 15, end: 21 });
  });

  it("다크 모드는 저장값이 켜져 있어도 끈다(토글을 숨긴 동안)", () => {
    expect(parseSettings(JSON.stringify({ darkMode: true })).darkMode).toBe(false);
  });

  it("객체가 아닌 저장값은 기본값", () => {
    expect(parseSettings("null")).toEqual(defaultSettings);
    expect(parseSettings("3")).toEqual(defaultSettings);
  });

  it("깨진 저장값은 오류를 던져 loadSettings가 기본값으로 처리하게 한다", () => {
    expect(() => parseSettings("{broken")).toThrow();
  });
});

describe("applySettings", () => {
  it("켠 설정만 클래스를 붙이고, 끈 설정은 뗀다", () => {
    const root = fakeRoot();
    applySettings(root, { ...defaultSettings, largeText: true, colorBlind: true });
    expect([...root.set].sort()).toEqual(["color-blind", "large-text"]);

    applySettings(root, { ...defaultSettings, colorBlind: true });
    expect([...root.set]).toEqual(["color-blind"]);
  });
});
