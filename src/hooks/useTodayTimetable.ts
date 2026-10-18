import { useEffect, useState } from "react";
import type { BisTimeInfo } from "@/api/jeonjuBis";
import { getTodayTimetable, readTodayTimetable } from "@/services/timetableService";

/**
 * 오늘 배차시간표(ITS). enabled일 때만 가져오고, 가져오는 것도 노선당 하루 한 번이다
 * (services/timetableService). 20초 도착 갱신(useArrivalInfo)과는 따로 돌고, 반복하지
 * 않는다 — 폴링도 타이머도 없다.
 */
export function useTodayTimetable(routeId: string | undefined, enabled: boolean): BisTimeInfo | null {
  // 어느 노선의 값인지 함께 들고 있어, 노선이 바뀌면 이전 노선의 시간표를 쓰지 않는다.
  const [held, setHeld] = useState<{ routeId: string; info: BisTimeInfo | null } | null>(() =>
    routeId && enabled ? { routeId, info: readTodayTimetable(routeId) } : null,
  );

  useEffect(() => {
    if (!routeId || !enabled) return;
    let cancelled = false;
    getTodayTimetable(routeId).then((info) => {
      if (!cancelled) setHeld({ routeId, info });
    });
    return () => {
      cancelled = true;
    };
  }, [routeId, enabled]);

  return enabled && held && held.routeId === routeId ? held.info : null;
}
