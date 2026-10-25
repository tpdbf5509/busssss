import { describe, expect, it } from "vitest";
import { heroScheduleNote, rowScheduleLabel } from "@/lib/heroSchedule";

const at = (h: number, m = 0, day = 19) => new Date(2026, 9, day, h, m);
const ROUTE = { firstBus: "05:30", lastBus: "22:40" };
const TIMES = { times: ["13:40", "14:00", "14:20", "14:40"], satSkip: "", holidaySkip: "" };

describe("heroScheduleNote — 정보 없음(error)", () => {
  it("막차 뒤: '운행 종료' + 내일 첫차, 기점 출발 시각임을 밝힌다", () => {
    const n = heroScheduleNote("error", ROUTE, "평화동종점", at(23, 10), null);
    expect(n).toEqual({
      big: "운행 종료",
      sub: { text: "내일 첫차 05:30" },
      note: "평화동종점 출발 시각이에요",
    });
  });

  it("첫차 전: '운행 전' + 첫차", () => {
    const n = heroScheduleNote("error", ROUTE, "평화동종점", at(4, 0), null);
    expect(n?.big).toBe("운행 전");
    expect(n?.sub.text).toBe("첫차 05:30");
  });

  it("운행 중 + 시간표 있음: 큰 문구는 그대로 두고 '다음 출발'만 붙인다. 도착 시각이 아님을 밝힌다", () => {
    const n = heroScheduleNote("error", ROUTE, "평화동종점", at(14, 5), TIMES);
    expect(n?.big).toBeNull();
    expect(n?.sub).toEqual({ text: "다음 출발 14:20" });
    expect(n?.note).toContain("평화동종점 출발");
    expect(n?.note).toContain("도착 시각은 아니에요");
  });

  it("운행 중인데 시간표가 없거나 오늘 남은 출발이 없으면 원래 문구(null)", () => {
    expect(heroScheduleNote("error", ROUTE, "평화동종점", at(14, 5), null)).toBeNull();
    expect(heroScheduleNote("error", ROUTE, "평화동종점", at(14, 50), TIMES)).toBeNull();
  });

  it("기점 이름을 모르면 '기점'이라고 쓴다", () => {
    expect(heroScheduleNote("error", ROUTE, undefined, at(23, 10), null)?.note).toBe("기점 출발 시각이에요");
  });

  it("노선을 아직 못 받았거나 첫차·막차를 모르면 null", () => {
    expect(heroScheduleNote("error", undefined, "x", at(23), null)).toBeNull();
    expect(heroScheduleNote("error", { firstBus: "-", lastBus: "-" }, "x", at(23), null)).toBeNull();
  });
});

describe("heroScheduleNote — 기점 대기(atOrigin)", () => {
  it("운행 중 + 시간표 있음: 기점 이름과 '14:20 출발'", () => {
    const n = heroScheduleNote("atOrigin", ROUTE, "평화동종점", at(14, 5), TIMES);
    expect(n).toEqual({ big: null, sub: { lead: "평화동종점", text: "14:20 출발" }, note: null });
  });
  it("시간표가 없으면 원래 문구, 운행 종료·운행 전에는 시간표로 덮지 않는다", () => {
    expect(heroScheduleNote("atOrigin", ROUTE, "평화동종점", at(14, 5), null)).toBeNull();
    expect(heroScheduleNote("atOrigin", ROUTE, "평화동종점", at(23, 30), TIMES)).toBeNull();
  });
});

describe("heroScheduleNote — 실시간 값이 있는 상태는 건드리지 않는다", () => {
  it.each(["loading", "normal", "arriving", "stopsOnly"] as const)("%s", (state) => {
    expect(heroScheduleNote(state, ROUTE, "평화동종점", at(23, 30), TIMES)).toBeNull();
  });
});

describe("rowScheduleLabel (다른 즐겨찾기 행, 시간표 호출 없음)", () => {
  it("운행 종료·운행 전만 문구를 바꾼다", () => {
    expect(rowScheduleLabel(ROUTE, at(23, 30))).toEqual({ top: "운행 종료", bottom: "첫차 05:30" });
    expect(rowScheduleLabel(ROUTE, at(4, 0))).toEqual({ top: "운행 전", bottom: "첫차 05:30" });
  });
  it("운행 중이거나 노선을 모르면 null(원래 '정보 없음')", () => {
    expect(rowScheduleLabel(ROUTE, at(12))).toBeNull();
    expect(rowScheduleLabel(undefined, at(23))).toBeNull();
    expect(rowScheduleLabel({ firstBus: "-", lastBus: "-" }, at(23))).toBeNull();
  });
});
