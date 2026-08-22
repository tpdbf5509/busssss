/**
 * 도착 예정 시간 + 남은 정류장 수를 한국어 문구로 합칩니다.
 * stopsAway가 없거나 유효하지 않으면 시간만 표시합니다.
 */
export function formatArrivalText(
  minutes: number | null | undefined,
  stopsAway?: number | null,
): string {
  if (minutes == null || Number.isNaN(minutes)) return "정보 없음";

  const safeMinutes = Math.max(0, Math.round(minutes));
  const timeLabel = safeMinutes <= 0 ? "곧 도착" : `${safeMinutes}분 후`;

  if (stopsAway == null || Number.isNaN(stopsAway)) return timeLabel;

  const stops = Math.max(0, Math.round(stopsAway));
  // 곧 도착이고 0정거장이면 시간만 표시 (리포트 권장)
  if (safeMinutes <= 0 && stops <= 0) return "곧 도착";

  return `${timeLabel} · ${stops}정거장`;
}
