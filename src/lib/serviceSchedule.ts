/**
 * 운행 시간 판단 (DESIGN.md 10장 6단계, 12장 "6단계").
 *
 * 이미 있는 시간표 데이터만 쓴다.
 *   - 노선 목록의 첫차·막차(Route.firstBus, lastBus: "05:30" 꼴, 없으면 "-")
 *   - 전주 ITS 공식 배차시간표(BisTimeInfo: times, satSkip, holidaySkip)
 *
 * 지켜야 할 것: 이 시각들은 모두 "노선 기점에서 출발하는 시각"이다. 내 정류장에
 * 도착하는 시각이 아니다. 여기서는 도착 시각을 계산하지 않는다 — 기점에서 내
 * 정류장까지 걸리는 시간을 알 수 없고, 지어낸 시간은 사용자가 버스를 놓치게
 * 만든다. 화면 문구가 "기점 출발"이라고 밝히는 일은 호출하는 쪽의 몫이다.
 */

const DAY = 24 * 60;

/** "05:30" 같은 시각을 분으로. 형식이 아니면 NaN. */
export function toMinutes(time: string | undefined | null): number {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(time ?? "");
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h > 47 || min > 59 ? NaN : h * 60 + min;
}

/** 분 → "05:30". 24시간을 넘으면 다음 날 시각으로 접는다. */
export function toClock(minutes: number): string {
  const m = ((Math.round(minutes) % DAY) + DAY) % DAY;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export type ServiceStatus =
  /** 첫차·막차를 알 수 없어(값 없음, 같은 시각 등) 판단하지 않는다. */
  | { kind: "unknown" }
  /** 아직 첫차 전. 오늘 첫차가 first다. */
  | { kind: "before"; first: string }
  /** 운행 중. */
  | { kind: "running" }
  /** 막차가 끝났다. 내일 첫차가 first다. */
  | { kind: "ended"; first: string };

/**
 * 지금이 운행 시간인지.
 *
 * 막차가 "00:20"처럼 자정을 넘겨 기록된 노선(막차 ≤ 첫차)은 어제 시작한 운행의
 * 끝자락이 오늘 00:20까지 이어진다. 그 노선에서 막차~첫차 사이는 아직 첫차 전
 * ("before")로 본다 — "운행 종료"는 막차가 같은 날 안에서 끝난 노선에만 쓴다.
 */
export function serviceStatus(now: Date, firstBus: string, lastBus: string): ServiceStatus {
  const first = toMinutes(firstBus);
  const last = toMinutes(lastBus);
  if (Number.isNaN(first) || Number.isNaN(last) || first === last) return { kind: "unknown" };

  const nowMin = now.getHours() * 60 + now.getMinutes();

  if (last > first) {
    if (nowMin < first) return { kind: "before", first: toClock(first) };
    if (nowMin > last) return { kind: "ended", first: toClock(first) };
    return { kind: "running" };
  }

  // 자정을 넘기는 노선: [첫차, 24:00) 과 [00:00, 막차] 가 운행 시간이다.
  if (nowMin >= first || nowMin <= last) return { kind: "running" };
  return { kind: "before", first: toClock(first) };
}

/** 쉼표·공백·줄바꿈 등으로 이어진 문자열에서 HH:MM 시각을 모두 뽑는다("5:50"은 "05:50"으로 맞춘다). */
export function parseClockList(raw: string | undefined | null): string[] {
  const out: string[] = [];
  for (const m of (raw ?? "").matchAll(/(\d{1,2}):(\d{2})/g)) {
    const min = toMinutes(`${m[1]}:${m[2]}`);
    if (!Number.isNaN(min)) out.push(toClock(min));
  }
  return out;
}

/** ITS 시간표에서 필요한 것만 (api/jeonjuBis의 BisTimeInfo와 같은 모양). */
export interface TimetableLike {
  times: string[];
  satSkip: string;
  holidaySkip: string;
}

/**
 * 오늘 운행하는 출발 시각 목록.
 *
 * 토요일은 satSkip(토요일 미운행), 일요일은 holidaySkip(일요일·공휴일 미운행)에
 * 적힌 시각을 뺀다. 법정 공휴일 달력이 없어서 평일 공휴일은 알 수 없다 — 그날은
 * 평일 시간표로 보인다(12장 "6단계"에 한계로 적어 둔다).
 */
export function departuresToday(timetable: TimetableLike, now: Date): string[] {
  const day = now.getDay(); // 0 일요일, 6 토요일
  const skip = new Set(
    day === 6 ? parseClockList(timetable.satSkip) : day === 0 ? parseClockList(timetable.holidaySkip) : [],
  );
  return timetable.times.filter((t) => !Number.isNaN(toMinutes(t)) && !skip.has(toClock(toMinutes(t))));
}

/**
 * 지금 이후 가장 가까운 기점 출발 시각. 오늘 남은 것이 없으면 null.
 *
 * 목록은 첫차부터 순서대로다. 자정을 넘기는 노선은 시각이 12시간 이상 뒤로
 * 뛰는 지점부터 다음 날로 보고 24시간을 더해 한 줄로 편다(BusScreen의
 * markSchedule과 같은 방식). 지금 시각도 같은 줄 위에 올린다.
 */
export function nextDeparture(times: string[], now: Date): string | null {
  let offset = 0;
  let prev = -1;
  const axis: number[] = [];
  for (const t of times) {
    const m = toMinutes(t);
    if (Number.isNaN(m)) continue;
    if (prev !== -1 && prev - m > 12 * 60) offset += DAY;
    prev = m;
    axis.push(m + offset);
  }
  if (axis.length === 0) return null;

  const nowMin = now.getHours() * 60 + now.getMinutes();
  // 자정을 넘긴 목록이고 지금이 첫 시각보다 이르면, 지금은 어제 시작한 운행의
  // 연장선(+24시간)에 있다.
  const nowOnAxis = offset > 0 && nowMin < axis[0] ? nowMin + DAY : nowMin;
  const next = axis.find((m) => m >= nowOnAxis);
  return next === undefined ? null : toClock(next);
}
