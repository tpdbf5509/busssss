/**
 * 도착까지 남은 초를 화면에 쓸 "분"으로 바꿉니다.
 *
 * 반올림이 아니라 내림이다. 두 방향의 피해가 다르기 때문이다 — 450초를
 * "8분"으로 올려 말하면 그 시간을 믿고 나온 사용자가 7분 30초에 온 버스를
 * 놓치지만, "7분"으로 내려 말하면 30초 더 기다릴 뿐이다. 네이버지도 등
 * 다른 앱도 같은 상황에서 7분으로 표시한다(실측 비교: 104번 영생고, 우리
 * 8분 / 네이버 7분, 남은 정거장은 둘 다 7).
 */
export function arrivalMinutesFromSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return 0;
  return Math.max(0, Math.floor(seconds / 60));
}

/**
 * 도착 예정 시간 + 남은 정류장 수를 한국어 문구로 합칩니다.
 * stopsAway가 없거나 유효하지 않으면 시간만 표시합니다.
 */
export function formatArrivalText(
  minutes: number | null | undefined,
  stopsAway?: number | null,
): string {
  if (minutes == null || Number.isNaN(minutes)) {
    // 시간을 못 믿어 버린 경우에도(arrivalPlausibility 참고) 정거장 수는
    // GPS 실측이라 그대로 알린다. "정보 없음"으로 뭉뚱그리면 사용자는 버스가
    // 코앞에 온 것도 모르게 된다.
    if (stopsAway == null || Number.isNaN(stopsAway)) return "정보 없음";
    const onlyStops = Math.max(0, Math.round(stopsAway));
    return onlyStops <= 0 ? "곧 도착" : `${onlyStops}정거장`;
  }

  const safeMinutes = Math.max(0, Math.round(minutes));
  const timeLabel = safeMinutes <= 0 ? "곧 도착" : `${safeMinutes}분 후`;

  if (stopsAway == null || Number.isNaN(stopsAway)) return timeLabel;

  const stops = Math.max(0, Math.round(stopsAway));
  // 곧 도착이고 0정거장이면 시간만 표시 (리포트 권장)
  if (safeMinutes <= 0 && stops <= 0) return "곧 도착";

  return `${timeLabel} · ${stops}정거장`;
}
