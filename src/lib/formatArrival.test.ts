import { describe, it, expect } from "vitest";
import { arrivalMinutesFromSeconds, formatArrivalText } from "./formatArrival";

describe("arrivalMinutesFromSeconds", () => {
  it("올림하지 않고 내림한다 (제보 사례)", () => {
    // 104번 영생고에서 우리는 8분, 네이버지도는 7분으로 표시됐다.
    // 남은 정거장은 둘 다 7이었으니 차이는 분 환산 방식뿐이다.
    expect(arrivalMinutesFromSeconds(450)).toBe(7); // 7분 30초
    expect(arrivalMinutesFromSeconds(479)).toBe(7);
    expect(arrivalMinutesFromSeconds(480)).toBe(8);
  });

  it("1분이 안 되면 0분 — 곧 도착으로 표시된다", () => {
    expect(arrivalMinutesFromSeconds(59)).toBe(0);
    expect(formatArrivalText(arrivalMinutesFromSeconds(59), null)).toBe("곧 도착");
  });

  it("음수나 비정상 값은 0으로 막는다", () => {
    expect(arrivalMinutesFromSeconds(-10)).toBe(0);
    expect(arrivalMinutesFromSeconds(Number.NaN)).toBe(0);
  });
});

describe("formatArrivalText", () => {
  it("시간과 정거장 수를 함께 보여준다", () => {
    expect(formatArrivalText(3, 3)).toBe("3분 후 · 3정거장");
  });

  it("시간을 못 믿을 때는 정거장 수만 보여준다", () => {
    expect(formatArrivalText(null, 5)).toBe("5정거장");
  });

  it("근거가 아무것도 없을 때만 정보 없음", () => {
    expect(formatArrivalText(null, null)).toBe("정보 없음");
  });
});
