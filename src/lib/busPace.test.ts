import { describe, it, expect, beforeEach } from "vitest";
import {
  recordBusPosition,
  getSecondsPerStop,
  estimateMinutesAway,
  resetBusPace,
} from "./busPace";

const MIN = 60_000;

beforeEach(() => {
  resetBusPace();
});

describe("busPace — 실측 속도 학습", () => {
  it("같은 차량을 한 번만 보면 아직 속도를 알 수 없다", () => {
    recordBusPosition("R1", "전주70자1234", 5, 0);
    expect(getSecondsPerStop("R1", 0)).toBeNull();
    expect(estimateMinutesAway("R1", 3, 0)).toBeNull();
  });

  it("정류장 하나를 지나면 그 소요 시간을 속도로 잡는다", () => {
    recordBusPosition("R1", "전주70자1234", 5, 0);
    recordBusPosition("R1", "전주70자1234", 6, 90_000); // 90초에 1정거장
    expect(getSecondsPerStop("R1", 90_000)).toBe(90);
    // 3정거장 남았으면 90 * 3 = 270초 = 4.5분 → 4분.
    // 올려 말하면 그 시간을 믿은 사용자가 버스를 놓치므로 내림이다
    // (formatArrival의 arrivalMinutesFromSeconds 참고).
    expect(estimateMinutesAway("R1", 3, 90_000)).toBe(4);
  });

  it("여러 정거장을 한 번에 지났으면 정거장 수로 나눈다", () => {
    recordBusPosition("R1", "전주70자1234", 2, 0);
    recordBusPosition("R1", "전주70자1234", 5, 180_000); // 180초에 3정거장
    expect(getSecondsPerStop("R1", 180_000)).toBe(60);
  });

  it("같은 정류장에 머무는 동안은 기준 시각을 갱신하지 않는다", () => {
    recordBusPosition("R1", "전주70자1234", 5, 0);
    recordBusPosition("R1", "전주70자1234", 5, 30_000); // 아직 같은 정류장
    recordBusPosition("R1", "전주70자1234", 6, 60_000);
    // 처음 본 0초부터 60초 — 30초로 잘리면 정류장에 머문 시간이 빠져 버린다.
    expect(getSecondsPerStop("R1", 60_000)).toBe(60);
  });

  it("위치가 뒤로 가면(다음 운행 시작) 그 구간은 속도로 치지 않는다", () => {
    recordBusPosition("R1", "전주70자1234", 20, 0);
    recordBusPosition("R1", "전주70자1234", 2, 30 * MIN); // 새 운행
    expect(getSecondsPerStop("R1", 30 * MIN)).toBeNull();

    // 새 기준에서 다시 재면 정상적으로 잡힌다.
    recordBusPosition("R1", "전주70자1234", 3, 30 * MIN + 60_000);
    expect(getSecondsPerStop("R1", 30 * MIN + 60_000)).toBe(60);
  });

  it("말이 안 되는 속도는 버린다", () => {
    // 정거장 하나를 5초에 — 관측 오류로 본다.
    recordBusPosition("R1", "빠른차", 1, 0);
    recordBusPosition("R1", "빠른차", 2, 5_000);
    expect(getSecondsPerStop("R1", 5_000)).toBeNull();

    // 한동안 못 보던 차량이 다시 잡혀 공백이 통째로 들어간 경우.
    recordBusPosition("R2", "느린차", 1, 0);
    recordBusPosition("R2", "느린차", 2, 40 * MIN);
    expect(getSecondsPerStop("R2", 40 * MIN)).toBeNull();
  });

  it("노선 단위로 모으므로 다른 차량의 관측도 함께 반영된다", () => {
    recordBusPosition("R1", "1호차", 1, 0);
    recordBusPosition("R1", "1호차", 2, 60_000); // 60초
    expect(getSecondsPerStop("R1", 60_000)).toBe(60);

    // 2호차가 120초를 기록하면 지수이동평균(0.4)으로 섞인다.
    recordBusPosition("R1", "2호차", 10, 60_000);
    recordBusPosition("R1", "2호차", 11, 180_000); // 120초
    expect(getSecondsPerStop("R1", 180_000)).toBeCloseTo(60 * 0.6 + 120 * 0.4, 5);
  });

  it("노선이 다르면 서로 섞이지 않는다", () => {
    recordBusPosition("R1", "차", 1, 0);
    recordBusPosition("R1", "차", 2, 60_000);
    expect(getSecondsPerStop("R2", 60_000)).toBeNull();
  });

  it("오래된 속도는 쓰지 않는다", () => {
    recordBusPosition("R1", "차", 1, 0);
    recordBusPosition("R1", "차", 2, 60_000);
    expect(getSecondsPerStop("R1", 60_000 + 29 * MIN)).not.toBeNull();
    expect(getSecondsPerStop("R1", 60_000 + 31 * MIN)).toBeNull();
  });

  it("정류장에 이미 와 있으면 0분", () => {
    recordBusPosition("R1", "차", 1, 0);
    recordBusPosition("R1", "차", 2, 60_000);
    expect(estimateMinutesAway("R1", 0, 60_000)).toBe(0);
  });
});
