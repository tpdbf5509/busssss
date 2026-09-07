/**
 * 실제로 관측된 버스 이동 속도(정거장당 소요 시간)를 세션 동안 학습한다.
 *
 * 왜 필요한가 — TAGO 예측을 그대로 믿을 수 없다.
 * 도착 시간은 TAGO 자체 예측(arrtime)에서 오는데, 이 값이 실제와 크게
 * 어긋나는 제보가 반복됐다(버스가 한 정거장 앞인데 "14분 후", 실측 2분).
 * 전주시 GW는 버스의 GPS 좌표를 주지 않고 "지금 어느 정류장인지"만 주므로
 * (busLocationService의 toBusLocation 주석) 좌표·속도로 직접 계산할 수도 없다.
 *
 * 대신 우리가 이미 하고 있는 일에서 근거를 얻는다. 도착정보를 폴링하는 동안
 * 같은 차량이 정류장을 하나씩 지나가는 게 관측되므로, "이 차량이 정류장
 * 하나를 지나는 데 실제로 몇 초 걸렸는지"를 재서 남은 정거장 수에 곱하면
 * 지금 이 노선의 실제 흐름을 반영한 도착 시간이 나온다.
 *
 * 한계는 분명하다. 첫 관측 한 번만으로는 속도를 알 수 없어(같은 차량을 두 번
 * 봐야 한다) 화면을 막 연 순간에는 값이 없고, 이 기록은 메모리에만 있어
 * 앱을 닫으면 사라진다. 그때는 호출부가 기존 TAGO 예측으로 폴백한다.
 */

/** 정거장당 소요 시간으로 인정할 범위(초). 벗어나면 관측 자체를 버린다. */
const MIN_SECONDS_PER_STOP = 20;
/**
 * 상한을 300초로 둔다. 정체가 심해도 정류장 하나에 5분을 넘기기는 어렵고,
 * 이보다 크게 나오는 건 대개 한동안 못 보던 차량이 다시 잡히면서 그 공백이
 * 통째로 계산에 들어간 경우다.
 */
const MAX_SECONDS_PER_STOP = 300;

/** 학습한 속도의 유효 기간(ms). 지나면 교통 상황이 달라진 것으로 본다. */
const PACE_TTL_MS = 30 * 60 * 1000;

/** 새 관측을 얼마나 반영할지(지수이동평균). 클수록 최근 값에 민감하다. */
const EMA_ALPHA = 0.4;

/** lastSighting이 무한히 커지지 않게 정리하는 기준 */
const MAX_TRACKED_VEHICLES = 500;

type Sighting = { stopIndex: number; firstSeenAt: number };

/** key: `${routeId}|${vehicleNo}` — 그 차량을 이 정류장에서 처음 본 시각 */
const lastSighting = new Map<string, Sighting>();
/** key: routeId — 노선 단위로 모은 실측 속도 */
const pace = new Map<string, { secondsPerStop: number; updatedAt: number }>();

function prune(now: number) {
  if (lastSighting.size <= MAX_TRACKED_VEHICLES) return;
  for (const [key, sighting] of lastSighting) {
    if (now - sighting.firstSeenAt > PACE_TTL_MS) lastSighting.delete(key);
  }
}

/**
 * 관측된 버스 위치를 기록하고, 직전 관측과 비교해 속도를 갱신합니다.
 *
 * 같은 차량을 두 번 이상 봐야 속도가 나온다. 차량별로 재지만 학습은 노선
 * 단위로 모은다 — 정체는 차량이 아니라 그 노선·시간대의 성질이고, 표본이
 * 모일수록 값이 빨리 안정된다.
 */
export function recordBusPosition(
  routeId: string,
  vehicleNo: string,
  stopIndex: number,
  now: number = Date.now(),
): void {
  if (!routeId || !vehicleNo || stopIndex < 0) return;

  const key = `${routeId}|${vehicleNo}`;
  const previous = lastSighting.get(key);

  // 아직 같은 정류장에 있으면 처음 본 시각을 유지한다. 여기서 시각을 갱신하면
  // 정류장에 머문 시간이 통째로 빠져 속도가 실제보다 빠르게 잡힌다.
  if (previous && stopIndex === previous.stopIndex) return;

  lastSighting.set(key, { stopIndex, firstSeenAt: now });
  prune(now);

  if (!previous) return;

  // 위치가 뒤로 갔으면 이 차량이 다음 운행을 시작한 것이다. 이전 운행과의
  // 시간 차이는 이동 시간이 아니므로 버리고 기준만 새로 잡는다.
  if (stopIndex < previous.stopIndex) return;

  const stopsCovered = stopIndex - previous.stopIndex;
  const elapsedSeconds = (now - previous.firstSeenAt) / 1000;
  const secondsPerStop = elapsedSeconds / stopsCovered;

  if (secondsPerStop < MIN_SECONDS_PER_STOP) return;
  if (secondsPerStop > MAX_SECONDS_PER_STOP) return;

  const current = pace.get(routeId);
  const usable = current && now - current.updatedAt <= PACE_TTL_MS;
  pace.set(routeId, {
    secondsPerStop: usable
      ? current.secondsPerStop * (1 - EMA_ALPHA) + secondsPerStop * EMA_ALPHA
      : secondsPerStop,
    updatedAt: now,
  });
}

/** 이 노선에서 실측된 정거장당 소요 시간(초). 근거가 없거나 오래됐으면 null. */
export function getSecondsPerStop(routeId: string, now: number = Date.now()): number | null {
  const current = pace.get(routeId);
  if (!current) return null;
  if (now - current.updatedAt > PACE_TTL_MS) return null;
  return current.secondsPerStop;
}

/**
 * 남은 정거장 수를 실측 속도로 환산한 도착 예정 시간(분).
 * 아직 속도를 못 쟀으면 null — 호출부는 기존 TAGO 예측으로 폴백한다.
 */
export function estimateMinutesAway(
  routeId: string,
  stopsAway: number,
  now: number = Date.now(),
): number | null {
  const secondsPerStop = getSecondsPerStop(routeId, now);
  if (secondsPerStop == null) return null;
  if (!Number.isFinite(stopsAway) || stopsAway < 0) return null;
  return Math.max(0, Math.round((secondsPerStop * stopsAway) / 60));
}

/** 테스트용 초기화. */
export function resetBusPace(): void {
  lastSighting.clear();
  pace.clear();
}
