import { fetchBisTimeInfo, type BisTimeInfo } from "@/api/jeonjuBis";

/**
 * 배차시간표(ITS) 하루 저장 (DESIGN.md 10장 6단계, 12장 "6단계").
 *
 * 홈 히어로가 "다음 출발"을 보여 줄 때만 부른다. 새 외부 API는 없다 — 배차시간
 * 창이 쓰는 fetchBisTimeInfo(bis-proxy)를 그대로 쓰고, 여기서 하는 일은 호출을
 * 줄이는 것뿐이다.
 *   - 노선마다 하루에 한 번: 받으면 localStorage에 오늘 날짜로 저장한다. 앱을 다시
 *     열어도 같은 날이면 다시 부르지 않는다.
 *   - 같은 노선을 동시에 두 번 부르지 않는다(진행 중인 요청을 같이 쓴다).
 *   - 실패하면 10분 동안 다시 부르지 않는다. 요청 제한(403/429)을 만나 실패한 곳을
 *     화면이 다시 그려질 때마다 두드리지 않기 위해서다.
 * 20초 도착 정보 갱신에는 들어가지 않는다. 시간표는 하루 한 번이면 충분하다.
 */

export const TIMETABLE_STORAGE_KEY = "busssss_bis_times_v1";
export const FAILURE_RETRY_MS = 10 * 60 * 1000;

interface StoredTimetables {
  /** 저장한 날(로컬 날짜, "2026-10-19"). 오늘이 아니면 통째로 버린다. */
  date: string;
  routes: Record<string, BisTimeInfo>;
}

const inFlight = new Map<string, Promise<BisTimeInfo | null>>();
const failedAt = new Map<string, number>();

/** 시험에서 모듈 상태를 비우는 용도. */
export function resetTimetableMemo(): void {
  inFlight.clear();
  failedAt.clear();
}

export function localDateKey(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

function readStored(today: string): StoredTimetables {
  try {
    const raw = localStorage.getItem(TIMETABLE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredTimetables>;
      if (parsed && parsed.date === today && parsed.routes && typeof parsed.routes === "object") {
        return { date: today, routes: parsed.routes };
      }
    }
  } catch {
    // 깨진 저장값은 없는 것으로 본다. 다시 받으면 된다.
  }
  return { date: today, routes: {} };
}

function writeStored(data: StoredTimetables): void {
  try {
    localStorage.setItem(TIMETABLE_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // 저장이 막혀도(비공개 모드 등) 이번 화면에서는 받은 값을 그대로 쓴다.
  }
}

/** 저장된 오늘 시간표만 읽는다(네트워크 없음). */
export function readTodayTimetable(routeId: string, now: Date = new Date()): BisTimeInfo | null {
  return readStored(localDateKey(now)).routes[routeId] ?? null;
}

/**
 * 오늘 시간표. 저장돼 있으면 그것, 없으면 한 번 받아 저장한다.
 * 못 받으면 null — 화면은 시간표 없이 원래 문구로 남는다.
 */
export function getTodayTimetable(
  routeId: string,
  now: Date = new Date(),
  fetcher: (routeId: string) => Promise<BisTimeInfo | null> = fetchBisTimeInfo,
): Promise<BisTimeInfo | null> {
  if (!routeId) return Promise.resolve(null);

  const today = localDateKey(now);
  const stored = readStored(today);
  const cached = stored.routes[routeId];
  if (cached) return Promise.resolve(cached);

  const pending = inFlight.get(routeId);
  if (pending) return pending;

  const failed = failedAt.get(routeId);
  if (failed !== undefined && now.getTime() - failed < FAILURE_RETRY_MS) {
    return Promise.resolve(null);
  }

  const request = fetcher(routeId)
    .then((info) => {
      if (info) {
        // 기다리는 사이 다른 노선이 저장됐을 수 있어 다시 읽어서 합친다.
        const latest = readStored(today);
        latest.routes[routeId] = info;
        writeStored(latest);
        failedAt.delete(routeId);
      } else {
        failedAt.set(routeId, now.getTime());
      }
      return info;
    })
    .catch(() => {
      failedAt.set(routeId, now.getTime());
      return null;
    })
    .finally(() => {
      inFlight.delete(routeId);
    });

  inFlight.set(routeId, request);
  return request;
}
