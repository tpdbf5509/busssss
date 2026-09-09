import { describe, it, expect } from "vitest";
import {
  recordArrivalDisagreement,
  readArrivalDisagreements,
  clearArrivalDisagreements,
} from "./arrivalDiagnostics";

const entry = {
  at: "2026-09-08T13:11:00.000Z",
  routeId: "305001095",
  routeNumber: "104",
  nodeId: "305100883",
  tagoMinutes: 3,
  tagoStops: 3,
  miss: "empty" as const,
};

describe("arrivalDiagnostics", () => {
  /**
   * 이 기록은 도착정보를 만드는 경로 안에서 돈다. 여기서 예외가 새면 진단
   * 때문에 정작 도착정보가 통째로 깨진다 — localStorage를 못 쓰는 환경
   * (사파리 프라이빗 모드, 저장 공간 초과)에서도 조용히 넘어가야 한다.
   */
  it("저장소를 못 써도 예외를 던지지 않는다", () => {
    expect(() => recordArrivalDisagreement(entry)).not.toThrow();
    expect(() => readArrivalDisagreements()).not.toThrow();
    expect(() => clearArrivalDisagreements()).not.toThrow();
  });

  it("읽기는 항상 배열을 돌려준다", () => {
    expect(Array.isArray(readArrivalDisagreements())).toBe(true);
  });
});
