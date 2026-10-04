import { describe, it, expect } from "vitest";
import { standaloneBottomGap } from "@/lib/standaloneGap";

/** iPhone 13(390×844, 상태바 47) 홈 화면 앱, 세로 */
const IPHONE13 = {
  iosStandalone: true,
  portrait: true,
  screenWidth: 390,
  screenHeight: 844,
  safeAreaTop: 47,
};

describe("홈 화면 앱 아래 빈 띠 (standaloneBottomGap)", () => {
  it("세로 길이가 상태바만큼 짧게 잡히면 그만큼 늘린다 (실측 캡처: 47pt 띠)", () => {
    expect(standaloneBottomGap({ ...IPHONE13, viewportHeight: 797 })).toBe(47);
  });

  it("Dynamic Island 기기(상태바 59)도 같은 모양이면 59만큼 늘린다", () => {
    expect(
      standaloneBottomGap({ ...IPHONE13, screenWidth: 393, screenHeight: 852, safeAreaTop: 59, viewportHeight: 793 }),
    ).toBe(59);
  });

  it("문제가 없는 기기(화면 전체를 받음)에서는 늘리지 않는다", () => {
    expect(standaloneBottomGap({ ...IPHONE13, viewportHeight: 844 })).toBe(0);
  });

  it("Safari 탭에서는 늘리지 않는다 (아래 도구막대 때문에 원래 짧다)", () => {
    expect(standaloneBottomGap({ ...IPHONE13, iosStandalone: false, viewportHeight: 664 })).toBe(0);
  });

  it("모자란 높이가 상태바 높이와 다르면 이 문제로 보지 않는다", () => {
    // 예: iPad 화면 나누기처럼 창이 원래 화면보다 작은 경우
    expect(standaloneBottomGap({ ...IPHONE13, viewportHeight: 700 })).toBe(0);
  });

  it("상태바 높이를 모르면(0) 늘리지 않는다", () => {
    expect(standaloneBottomGap({ ...IPHONE13, safeAreaTop: 0, viewportHeight: 797 })).toBe(0);
  });

  it("가로로 눕혔을 때는 짧은 변을 세로 길이로 본다", () => {
    expect(
      standaloneBottomGap({ ...IPHONE13, portrait: false, safeAreaTop: 20, viewportHeight: 370 }),
    ).toBe(20);
    expect(standaloneBottomGap({ ...IPHONE13, portrait: false, safeAreaTop: 20, viewportHeight: 390 })).toBe(0);
  });

  it("1~2px 오차는 같은 것으로 본다", () => {
    expect(standaloneBottomGap({ ...IPHONE13, viewportHeight: 798.5 })).toBe(46);
  });
});
