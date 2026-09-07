/**
 * 도착 예정 시간이 "GPS로 확인한 그 버스"의 것인지 검사한다.
 *
 * 이 앱의 도착 표시는 서로 다른 두 시스템에서 온 값을 합친 것이다.
 * - 남은 정거장 수: 전주시 GPS 위치 + 우리 DB 정류장 순서(실측)
 * - 도착 예정 시간: TAGO 자체 예측(arrtime)
 *
 * 그런데 두 값이 같은 버스를 가리킨다는 보장이 없다. TAGO 목록에 지금 코앞에
 * 온 버스가 빠져 있으면(도착 직전이라 예정 목록에서 빠지는 경우가 있다) 그
 * 다음 버스의 예측이 가장 이른 값으로 잡히고, 거기에 GPS가 본 앞 버스의
 * 정거장 수가 붙는다. 실제로 104번에서 버스가 한 정거장 앞에 있는데 "14분 후",
 * "7분 후"로 표시되는 제보가 있었고, 실측으로는 2분 안에 도착했다.
 *
 * 두 값의 출처가 다르니 어느 쪽이 그 버스의 것인지는 알 수 없지만, 적어도
 * "한 정거장 남았는데 14분"처럼 물리적으로 앞뒤가 안 맞는 조합은 걸러낼 수
 * 있다. 걸러낸 뒤에는 실측 기반인 정거장 수만 남기고 시간은 표시하지 않는다.
 *
 * 상한만 두고 하한은 두지 않는다. 두 방향의 피해가 다르기 때문이다 —
 * 시간을 실제보다 길게 알려주면 사용자가 버스를 놓치지만, 짧게 알려주면
 * 정류장에서 조금 더 기다릴 뿐이다.
 */

/** 버스가 지금 정류장에서 출발하고 신호를 한 번 받는 정도의 여유(분) */
const BASE_MINUTES = 2;

/**
 * 정거장 하나를 지나는 데 걸리는 최대 시간(분).
 *
 * 전주 시내버스는 정류장 간격이 대략 400m라 보통 1~1.5분이면 지난다.
 * 정체·신호를 넉넉히 감안해도 3분을 넘기기 어려우므로, 이보다 오래 걸린다는
 * 예측은 그 정거장 수에 해당하는 버스의 것이 아니라고 본다.
 */
const MAX_MINUTES_PER_STOP = 3;

/** 남은 정거장 수가 `stopsAway`일 때 납득 가능한 최대 도착 시간(분). */
export function maxPlausibleMinutes(stopsAway: number): number {
  return BASE_MINUTES + MAX_MINUTES_PER_STOP * Math.max(0, stopsAway);
}

/**
 * 도착 예정 시간과 남은 정거장 수가 같은 버스의 값으로 볼 수 있는지.
 *
 * 대조할 정거장 수가 없으면(GPS 검증을 못 한 경우) 판단할 근거가 없으므로
 * 그대로 믿는다 — 검증 안 된 값을 지우면 멀쩡한 도착정보까지 사라진다.
 */
export function isArrivalTimePlausible(
  minutes: number | null | undefined,
  stopsAway: number | null | undefined,
): boolean {
  if (minutes == null || Number.isNaN(minutes)) return true;
  if (stopsAway == null || Number.isNaN(stopsAway)) return true;
  return minutes <= maxPlausibleMinutes(stopsAway);
}
