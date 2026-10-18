import type { HeroState } from "@/lib/heroArrival";
import {
  departuresToday,
  nextDeparture,
  serviceStatus,
  type TimetableLike,
} from "@/lib/serviceSchedule";

/**
 * 도착 정보가 없을 때 시간표로 채우는 히어로 문구 (DESIGN.md 7-3, 10장 6단계).
 *
 * 쓰는 때: 정보 없음(error)과 기점 대기(atOrigin)뿐이다. 실시간 값이 있는 상태
 * (보통, 곧 도착, 시간 불확실)는 시간표로 덮지 않는다 — 실시간이 늘 먼저다.
 *
 * 모든 시각은 "노선 기점에서 출발하는 시각"이다. 내 정류장 도착 시각처럼 읽히지
 * 않게, 기점 이름과 "출발"을 문구에 밝힌다. 도착 시각은 계산해 보여 주지 않는다.
 */

/** 노선에서 필요한 것만(types/route의 Route와 호환). */
export interface ScheduleRoute {
  firstBus: string;
  lastBus: string;
}

export interface HeroScheduleNote {
  /** 3줄(큰 글씨)을 바꾸는 문구. null이면 원래 문구("도착 정보 없음" 등)를 그대로 둔다. */
  big: string | null;
  /**
   * 4줄 문구. lead는 길면 말줄임으로 잘리고, text는 항상 다 보인다(시각이 잘리면 안 된다).
   */
  sub: { lead?: string; text: string };
  /** 5줄(작은 글씨) 문구. 정보 없음에서만 쓰고, 미니 노선도가 있는 상태에서는 null. */
  note: string | null;
}

/**
 * @param state      heroArrivalView의 상태
 * @param route      히어로 노선(첫차·막차). 아직 못 받았으면 undefined → 바꾸지 않는다
 * @param origin     노선 기점 이름("평화동종점"). 없으면 "기점"
 * @param timetable  ITS 시간표(하루 저장). 아직 없거나 못 받았으면 null
 */
export function heroScheduleNote(
  state: HeroState,
  route: ScheduleRoute | undefined,
  origin: string | undefined,
  now: Date,
  timetable: TimetableLike | null,
): HeroScheduleNote | null {
  if ((state !== "error" && state !== "atOrigin") || !route) return null;

  const status = serviceStatus(now, route.firstBus, route.lastBus);
  const where = origin || "기점";

  if (state === "error") {
    if (status.kind === "before") {
      return {
        big: "운행 전",
        sub: { text: `첫차 ${status.first}` },
        note: `${where} 출발 시각이에요`,
      };
    }
    if (status.kind === "ended") {
      return {
        big: "운행 종료",
        sub: { text: `내일 첫차 ${status.first}` },
        note: `${where} 출발 시각이에요`,
      };
    }
    if (status.kind === "running" && timetable) {
      const next = nextDeparture(departuresToday(timetable, now), now);
      if (next) {
        return {
          big: null,
          sub: { text: `다음 출발 ${next}` },
          note: `${where} 출발 · 내 정류장 도착 시각은 아니에요`,
        };
      }
    }
    return null;
  }

  // 기점 대기: 버스가 기점에 서 있다. 운행 중일 때만 다음 출발 시각을 붙인다.
  if (status.kind === "running" && timetable) {
    const next = nextDeparture(departuresToday(timetable, now), now);
    if (next) return { big: null, sub: { lead: where, text: `${next} 출발` }, note: null };
  }
  return null;
}

/**
 * 다른 즐겨찾기 행(7-5)의 오른쪽 칸 문구. 정보 없음일 때만 쓴다.
 *
 * 행은 시간표(ITS)를 부르지 않는다. 노선 목록에 이미 있는 첫차·막차만 쓴다 —
 * 행마다 시간표를 부르면 호출이 즐겨찾기 수만큼 늘기 때문이다.
 * 운행 중이거나 알 수 없으면 null(원래 "정보 없음").
 */
export function rowScheduleLabel(
  route: ScheduleRoute | undefined,
  now: Date,
): { top: string; bottom: string } | null {
  if (!route) return null;
  const status = serviceStatus(now, route.firstBus, route.lastBus);
  if (status.kind === "before") return { top: "운행 전", bottom: `첫차 ${status.first}` };
  if (status.kind === "ended") return { top: "운행 종료", bottom: `첫차 ${status.first}` };
  return null;
}
