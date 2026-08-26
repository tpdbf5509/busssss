/** 노선 배차간격 문자열("10~20분", "15분") 파싱 유틸 — BusScreen과 도착정보 신뢰도 로직이 함께 씁니다. */

export function parseInterval(interval: string): { min: number; max: number } | null {
  const match = interval.match(/(\d+)~(\d+)분/);
  if (match) return { min: parseInt(match[1], 10), max: parseInt(match[2], 10) };
  const single = interval.match(/(\d+)분/);
  if (single) {
    const val = parseInt(single[1], 10);
    return { min: val, max: val };
  }
  return null;
}

export function parseTimeToMinutes(time: string): number {
  const parts = time.split(":");
  if (parts.length !== 2) return NaN;
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

/** 배차간격 문자열의 평균값(분)을 반환합니다. 파싱 실패 시 null. */
export function getAverageHeadwayMinutes(interval: string | undefined | null): number | null {
  if (!interval) return null;
  const parsed = parseInterval(interval);
  if (!parsed) return null;
  return (parsed.min + parsed.max) / 2;
}
