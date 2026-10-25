import { describe, expect, it } from "vitest";
import {
  THEME_COLOR,
  applySettings,
  applyThemeColor,
  commuteConfigOf,
  defaultSettings,
  parseSettings,
  resolveDark,
  sanitizeThemeMode,
} from "@/lib/appSettings";

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

  it("화면 모드: 저장한 값(끄기·켜기·기기 설정)을 그대로 읽고 darkMode는 켜기일 때만 true", () => {
    expect(parseSettings(JSON.stringify({ themeMode: "light" }))).toMatchObject({ themeMode: "light", darkMode: false });
    expect(parseSettings(JSON.stringify({ themeMode: "dark" }))).toMatchObject({ themeMode: "dark", darkMode: true });
    expect(parseSettings(JSON.stringify({ themeMode: "system" }))).toMatchObject({ themeMode: "system", darkMode: false });
  });

  it("7단계 이전 저장값(themeMode 없음)은 끄기다 — 옛 darkMode: true는 읽지 않는다", () => {
    const old = parseSettings(JSON.stringify({ darkMode: true, largeText: true }));
    expect(old.themeMode).toBe("light");
    expect(old.darkMode).toBe(false);
    expect(old.largeText).toBe(true);
    expect(parseSettings(JSON.stringify({ darkMode: false, largeText: false, colorBlind: false, voiceGuide: false })).themeMode).toBe("light");
  });

  it("화면 모드가 이상한 값이면 끄기로 바로잡는다", () => {
    for (const bad of [null, 1, "", "auto", "DARK", {}, true]) {
      expect(parseSettings(JSON.stringify({ themeMode: bad })).themeMode).toBe("light");
    }
    expect(sanitizeThemeMode(undefined)).toBe("light");
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

describe("resolveDark / 화면 모드 적용", () => {
  it("끄기는 늘 라이트, 켜기는 늘 다크, 기기 설정은 기기를 따른다", () => {
    expect(resolveDark("light", true)).toBe(false);
    expect(resolveDark("light", false)).toBe(false);
    expect(resolveDark("dark", false)).toBe(true);
    expect(resolveDark("dark", true)).toBe(true);
    expect(resolveDark("system", true)).toBe(true);
    expect(resolveDark("system", false)).toBe(false);
  });

  it("applySettings가 dark 클래스를 모드와 기기 설정에 맞게 붙이고 뗀다", () => {
    const root = fakeRoot();
    applySettings(root, { ...defaultSettings, themeMode: "dark" });
    expect(root.set.has("dark")).toBe(true);
    applySettings(root, { ...defaultSettings, themeMode: "light" }, true);
    expect(root.set.has("dark")).toBe(false);
    applySettings(root, { ...defaultSettings, themeMode: "system" }, true);
    expect(root.set.has("dark")).toBe(true);
    applySettings(root, { ...defaultSettings, themeMode: "system" }, false);
    expect(root.set.has("dark")).toBe(false);
  });

  it("다크와 색약·큰 글씨는 서로 독립이다", () => {
    const root = fakeRoot();
    applySettings(root, { ...defaultSettings, themeMode: "dark", colorBlind: true, largeText: true });
    expect([...root.set].sort()).toEqual(["color-blind", "dark", "large-text"]);
  });
});

describe("applyThemeColor", () => {
  const fakeDoc = (n: number) => {
    const metas = Array.from({ length: n }, () => ({ content: "", setAttribute(_k: string, v: string) { this.content = v; } }));
    return { metas, querySelectorAll: () => metas };
  };

  it("theme-color 메타를 모두 같은 값으로 맞춘다(기기 모드용 media 메타 포함)", () => {
    const doc = fakeDoc(2);
    applyThemeColor(doc, true);
    expect(doc.metas.map((m) => m.content)).toEqual([THEME_COLOR.dark, THEME_COLOR.dark]);
    applyThemeColor(doc, false);
    expect(doc.metas.map((m) => m.content)).toEqual([THEME_COLOR.light, THEME_COLOR.light]);
  });

  it("라이트 값은 예전 theme-color(canvas)와 같다", () => {
    expect(THEME_COLOR.light).toBe("#F7F8FA");
  });
});
