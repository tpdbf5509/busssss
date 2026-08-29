import { getAverageHeadwayMinutes } from "@/lib/interval";

/**
 * A1. 도착정보 신뢰도 배지 로직.
 *
 * 절대 시간(예: "+3분")을 지연 기준으로 쓰면 배차간격 5분 노선은 과민 반응하고
 * 20분 노선은 둔감해집니다. 그래서 지연 판정 기준을 배차간격의 비율로 둡니다.
 *
 * - 지연 임계값 = clamp(평균 배차간격 * DELAY_RATIO, MIN_DELAY_MIN, MAX_DELAY_MIN)
 * - 배차간격 정보가 없으면 기본값(DEFAULT_DELAY_MIN)을 씁니다.
 */
const DELAY_RATIO = 0.5;
const MIN_DELAY_MIN = 3;
const MAX_DELAY_MIN = 10;
const DEFAULT_DELAY_MIN = 5;

export function getDelayThresholdMinutes(interval: string | undefined | null): number {
  const headway = getAverageHeadwayMinutes(interval);
  if (headway == null) return DEFAULT_DELAY_MIN;
  return Math.min(MAX_DELAY_MIN, Math.max(MIN_DELAY_MIN, headway * DELAY_RATIO));
}

export type ReliabilitySource = "realtime" | "estimated" | "unknown";

export interface ReliabilityState {
  source: ReliabilitySource;
  /** 실시간으로 잡히던 버스가 예정 도착 시각을 지연 임계값 이상 넘겼거나,
   *  실시간 신호 자체가 지연 임계값 이상 끊긴 경우 true */
  delayed: boolean;
}

/**
 * 실시간 도착정보 추적 상태를 세션 동안 들고 있다가, 매 폴링 결과를 넣으면
 * 신뢰도(source)와 지연 여부(delayed)를 계산해 주는 트래커.
 * 노선/정류장 조합(useArrivalInfo 인스턴스)마다 하나씩 만들어 씁니다.
 */
export class ArrivalReliabilityTracker {
  private predictedArrivalAt: number | null = null;
  private lastRealtimeAt: number | null = null;
  private lastMinutes: number | null = null;

  /**
   * @param minutes 이번 폴링에서 받은 실시간 도착 분(null이면 실시간 매칭 실패)
   * @param intervalStr 노선 배차간격 문자열
   * @param now 현재 시각(ms), 테스트 편의를 위해 주입 가능
   */
  update(minutes: number | null, intervalStr: string | undefined, now: number = Date.now()): ReliabilityState {
    const thresholdMs = getDelayThresholdMinutes(intervalStr) * 60_000;

    if (minutes != null) {
      const predicted = now + minutes * 60_000;
      // 직전 관측이 곧 도착(<=1분)이었다면, 지금 큰 값이 온 건 "그 버스가
      // 도착해서 다음 버스 추적을 새로 시작"한 정상적인 새 사이클이다.
      const previousWasArriving = this.lastMinutes == null || this.lastMinutes <= 1;

      // 이전 예측보다 도착 시각이 앞당겨졌다면(버스가 정상적으로 접근 중) 기준을 갱신.
      // 이전 예측이 없거나, 직전이 곧 도착 상태였는데 새 예측이 크게 늦어졌다면
      // (다음 버스로 넘어간 것) 기준을 새로 잡는다. 반대로 곧 도착 상태가 아니었는데
      // 갑자기 크게 늦어졌다면 같은 버스가 급하게 지연된 것이므로, 기준을 그대로
      // 두어 지연으로 잡히게 한다(급격한 지연을 "새 버스"로 오인하지 않도록).
      if (
        this.predictedArrivalAt == null ||
        predicted <= this.predictedArrivalAt + 1 ||
        (previousWasArriving && predicted > this.predictedArrivalAt + thresholdMs)
      ) {
        this.predictedArrivalAt = predicted;
      }

      this.lastRealtimeAt = now;
      this.lastMinutes = minutes;

      const delayed = now > this.predictedArrivalAt + thresholdMs;
      return { source: "realtime", delayed };
    }

    // 실시간 매칭 실패: 직전까지 실시간으로 잡히던 버스가 있었다면
    // 신호가 끊긴 지 지연 임계값 이상 지났는지로 지연/결행 의심을 판단합니다.
    if (this.lastRealtimeAt != null) {
      const delayed = now - this.lastRealtimeAt > thresholdMs;
      return { source: "estimated", delayed };
    }

    return { source: "unknown", delayed: false };
  }

  reset() {
    this.predictedArrivalAt = null;
    this.lastRealtimeAt = null;
    this.lastMinutes = null;
  }
}
