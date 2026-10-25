import { describe, expect, it } from "vitest";
import {
  departuresToday,
  nextDeparture,
  parseClockList,
  serviceStatus,
  toClock,
  toMinutes,
} from "@/lib/serviceSchedule";

/** 2026-10-19 은 월요일, 10-17 은 토요일, 10-18 은 일요일. */
const at = (h: number, m = 0, day = 19) => new Date(2026, 9, day, h, m);

describe("toMinutes / toClock", () => {
  it("시각 문자열을 분으로, 분을 시각 문자열로", () => {
    expect(toMinutes("05:30")).toBe(330);
    expect(toMinutes("5:30")).toBe(330);
    expect(toMinutes(" 23:59 ")).toBe(1439);
    expect(toClock(330)).toBe("05:30");
    expect(toClock(24 * 60 + 5)).toBe("00:05");
  });

  it("시각이 아닌 값(첫차 정보 없음 '-')은 NaN", () => {
    for (const bad of ["-", "", "abc", "12", "12:5", "99:99", undefined, null]) {
      expect(Number.isNaN(toMinutes(bad as string))).toBe(true);
    }
  });
});

describe("serviceStatus", () => {
  it("같은 날 안에서 끝나는 노선: 첫차 전 / 운행 중 / 운행 종료", () => {
    expect(serviceStatus(at(5, 29), "05:30", "22:40")).toEqual({ kind: "before", first: "05:30" });
    expect(serviceStatus(at(5, 30), "05:30", "22:40")).toEqual({ kind: "running" });
    expect(serviceStatus(at(22, 40), "05:30", "22:40")).toEqual({ kind: "running" });
    expect(serviceStatus(at(22, 41), "05:30", "22:40")).toEqual({ kind: "ended", first: "05:30" });
    expect(serviceStatus(at(0, 10), "05:30", "22:40")).toEqual({ kind: "before", first: "05:30" });
  });

  it("막차가 자정을 넘기는 노선: 막차 뒤에서 첫차 전까지는 '첫차 전'이다(운행 종료라 하지 않는다)", () => {
    expect(serviceStatus(at(23, 50), "05:30", "00:20")).toEqual({ kind: "running" });
    expect(serviceStatus(at(0, 10), "05:30", "00:20")).toEqual({ kind: "running" });
    expect(serviceStatus(at(0, 21), "05:30", "00:20")).toEqual({ kind: "before", first: "05:30" });
    expect(serviceStatus(at(3, 0), "05:30", "00:20")).toEqual({ kind: "before", first: "05:30" });
    expect(serviceStatus(at(5, 30), "05:30", "00:20")).toEqual({ kind: "running" });
  });

  it("첫차·막차를 모르면 판단하지 않는다", () => {
    expect(serviceStatus(at(12), "-", "22:40")).toEqual({ kind: "unknown" });
    expect(serviceStatus(at(12), "05:30", "-")).toEqual({ kind: "unknown" });
    expect(serviceStatus(at(12), "", "")).toEqual({ kind: "unknown" });
    expect(serviceStatus(at(12), "06:00", "06:00")).toEqual({ kind: "unknown" });
  });
});

describe("parseClockList", () => {
  it("쉼표·공백·줄바꿈으로 이어진 시각을 뽑는다", () => {
    expect(parseClockList("06:10, 07:20\n8:05 / 09:00")).toEqual(["06:10", "07:20", "08:05", "09:00"]);
  });
  it("없거나 시각이 없으면 빈 목록", () => {
    expect(parseClockList("")).toEqual([]);
    expect(parseClockList(undefined)).toEqual([]);
    expect(parseClockList("없음")).toEqual([]);
  });
});

describe("departuresToday", () => {
  const timetable = {
    times: ["06:00", "06:20", "06:40", "07:00"],
    satSkip: "06:20",
    holidaySkip: "06:20, 06:40",
  };

  it("평일은 모두 운행", () => {
    expect(departuresToday(timetable, at(8))).toEqual(["06:00", "06:20", "06:40", "07:00"]);
  });
  it("토요일은 satSkip 시각을 뺀다", () => {
    expect(departuresToday(timetable, at(5, 0, 17))).toEqual(["06:00", "06:40", "07:00"]);
  });
  it("일요일은 holidaySkip 시각을 뺀다", () => {
    expect(departuresToday(timetable, at(5, 0, 18))).toEqual(["06:00", "07:00"]);
  });
  it("skip 문자열이 비어도 그대로", () => {
    expect(departuresToday({ times: ["06:00"], satSkip: "", holidaySkip: "" }, at(5, 0, 17))).toEqual(["06:00"]);
  });
});

describe("nextDeparture", () => {
  const times = ["05:50", "06:10", "14:00", "14:20", "22:30"];

  it("지금 이후 가장 가까운 시각", () => {
    expect(nextDeparture(times, at(14, 5))).toBe("14:20");
    expect(nextDeparture(times, at(5, 0))).toBe("05:50");
  });
  it("같은 시각이면 그 시각(아직 출발 전)", () => {
    expect(nextDeparture(times, at(14, 20))).toBe("14:20");
    expect(nextDeparture(times, at(14, 21))).toBe("22:30");
  });
  it("오늘 남은 시각이 없으면 null (내일 시각을 지어내지 않는다)", () => {
    expect(nextDeparture(times, at(22, 31))).toBeNull();
  });
  it("빈 목록·깨진 시각은 null", () => {
    expect(nextDeparture([], at(12))).toBeNull();
    expect(nextDeparture(["-", "abc"], at(12))).toBeNull();
  });
  it("자정을 넘기는 목록: 자정 뒤 시각을 다음 날로 펴서 비교한다", () => {
    const night = ["22:00", "23:30", "00:10", "00:40"];
    expect(nextDeparture(night, at(23, 40))).toBe("00:10");
    // 자정을 넘긴 새벽 00:20 — 어제 시작한 운행의 연장선이다
    expect(nextDeparture(night, at(0, 20))).toBe("00:40");
  });
});
