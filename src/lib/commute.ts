/**
 * 시간대별 "내 정류장" 고르기 (DESIGN.md 10장 6단계, 12장 "6단계").
 *
 * 출근·퇴근 시간대에 맞는 즐겨찾기를 홈 히어로에 올리는 데 필요한 계산만 모았다.
 * 시각은 밖에서 받는다(Date를 직접 만들지 않는다). 그래야 가짜 시계로 시험하고,
 * 화면 코드는 "지금 어느 시간대인가"만 들고 있으면 된다.
 */

/** 출근 또는 퇴근. 즐겨찾기(stop_route)에 붙이는 지정 값이다. */
export type CommuteSlot = "morning" | "evening";

/**
 * 시간대 하나. start시 정각부터 end시 정각 직전까지다(예: 5~11이면 05:00~10:59).
 * 둘 다 0~23의 정수. end가 start보다 작으면 자정을 넘기는 시간대로 본다
 * (예: 22~3). 같으면 빈 시간대다 — 하루 종일이 아니라 "쓰지 않음"으로 읽는다.
 */
export interface HourWindow {
  start: number;
  end: number;
}

export interface CommuteConfig {
  morning: HourWindow;
  evening: HourWindow;
}

/** 사용자 결정 기본값(12장 "6단계"): 출근 05~11시, 퇴근 15~21시. */
export const DEFAULT_MORNING: HourWindow = { start: 5, end: 11 };
export const DEFAULT_EVENING: HourWindow = { start: 15, end: 21 };

function inWindow(hour: number, w: HourWindow): boolean {
  if (w.start === w.end) return false;
  return w.start < w.end ? hour >= w.start && hour < w.end : hour >= w.start || hour < w.end;
}

/**
 * 지금이 속한 시간대. 어디에도 속하지 않으면 null.
 * 두 시간대가 겹치면 출근이 먼저다(설정 서랍에서 겹치게 둘 수 있어서 규칙을 정해 둔다).
 */
export function currentCommuteSlot(now: Date, cfg: CommuteConfig): CommuteSlot | null {
  const hour = now.getHours();
  if (inWindow(hour, cfg.morning)) return "morning";
  if (inWindow(hour, cfg.evening)) return "evening";
  return null;
}

const SECONDS_PER_DAY = 24 * 60 * 60;

/** 시간대가 바뀔 수 있는 가장 가까운 정각까지 남은 시간(ms). 빈 시간대뿐이면 null. */
export function msUntilSlotChange(now: Date, cfg: CommuteConfig): number | null {
  const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  let best: number | null = null;
  for (const w of [cfg.morning, cfg.evening]) {
    if (w.start === w.end) continue;
    for (const hour of [w.start, w.end]) {
      let delta = hour * 3600 - nowSec;
      if (delta <= 0) delta += SECONDS_PER_DAY;
      if (best === null || delta < best) best = delta;
    }
  }
  if (best === null) return null;
  // 정각을 막 넘긴 뒤에 다시 계산하도록 1초 더 기다린다. 타이머가 조금 일찍
  // 깨어나면 같은 시간대로 다시 계산해 한 번 더 헛돈다.
  return (best + 1) * 1000;
}

/** 저장값에서 읽은 시간대를 쓸 수 있는 값으로 고친다. 이상하면 기본값. */
export function sanitizeWindow(raw: unknown, fallback: HourWindow): HourWindow {
  if (!raw || typeof raw !== "object") return { ...fallback };
  const { start, end } = raw as Partial<HourWindow>;
  const ok = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 23;
  return ok(start) && ok(end) ? { start, end } : { ...fallback };
}
