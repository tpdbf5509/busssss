import type { BusStop } from "@/types/route";

/**
 * 정류장 순번(sequence_no)은 위치 인덱스가 아니다.
 *
 * Supabase `bus_route_stops_cache.sequence_no`는 1..N으로 이어지는 번호가
 * 아니다. 실제 데이터 기준 454개 노선 중 85개(19%)에 순번 구멍이 있고,
 * 7개 노선은 1번에서 시작하지도 않는다. 예를 들어 10번 노선은 정류장이
 * 26개인데 순번은 `1,3,4,6,8,...,47,49`이다.
 *
 * 따라서 "N정거장 전"을 순번 뺄셈으로 계산하면 안 된다. 10번 노선 종점
 * (순번 49)에 "3정거장 전" 알림을 걸면 `49-3=46`이 되고, 46 이상인 첫
 * 정류장은 47이라 실제로는 **1정거장 전**에 울린다. 사용자는 3정거장 분의
 * 여유를 기대했는데 하차 준비를 못 하게 된다.
 *
 * 이 모듈은 순번 공간(sequence_no)과 위치 공간(정렬된 목록에서의 index)을
 * 오가는 변환을 담당한다. 알림 계산은 전부 위치 공간에서 이뤄져야 한다.
 *
 * 여기 있는 함수들은 `fetchStopsForRoute()`가 반환하는, **order 오름차순으로
 * 정렬된** 정류장 목록을 전제로 한다.
 */

/**
 * 순번이 `order`인 정류장의 목록 내 위치를 찾습니다.
 * 찾지 못하면 -1 (노선 데이터가 갱신돼 그 순번이 사라진 경우 등).
 */
export function indexOfStopByOrder(stops: BusStop[], order: number): number {
  return stops.findIndex((stop) => stop.order === order);
}

/** 실시간 버스 위치를 목록 내 위치로 환산한 결과. */
export interface BusPositionResolution {
  /** 정류장 목록에서의 위치. -1이면 환산 실패. */
  index: number;
  /** 무엇을 근거로 환산했는지 (신뢰도 판단·로깅용). */
  resolvedBy: "nodeId" | "order" | "none";
}

/**
 * 실시간 버스의 현재 위치를 정류장 목록에서의 index로 환산합니다.
 *
 * 1순위 — 정류장 ID 일치. 정적 캐시와 실시간 GW가 같은 정류장을 가리키는지
 *   ID로 직접 확인하므로 순번 체계가 서로 달라도 안전하다.
 * 2순위 — GW의 `nodeOrder`를 sequence_no로 보고, 그 값을 넘지 않는 마지막
 *   정류장으로 환산한다. 순번에 구멍이 있어도 "버스가 이미 지난 마지막
 *   정류장"으로 해석되므로 알림이 너무 늦게 울리는 쪽으로는 치우치지 않는다.
 *
 * 2순위로 내려간 경우 `resolvedBy: "order"`가 되며, 이는 두 데이터 소스의
 * 순번 체계가 같다는 검증되지 않은 가정에 의존한 결과다. 호출부에서 로그를
 * 남겨 실제 운영 데이터로 이 가정을 확인할 수 있게 한다.
 */
export function resolveBusStopIndex(
  stops: BusStop[],
  nodeId: string,
  nodeOrder: number,
): BusPositionResolution {
  if (nodeId) {
    const byId = stops.findIndex((stop) => stop.id === nodeId);
    if (byId !== -1) return { index: byId, resolvedBy: "nodeId" };
  }

  if (Number.isFinite(nodeOrder) && nodeOrder > 0) {
    // stops는 order 오름차순이라, order가 nodeOrder를 넘는 순간 멈춰도 된다.
    let candidate = -1;
    for (let i = 0; i < stops.length; i += 1) {
      if (stops[i].order <= nodeOrder) candidate = i;
      else break;
    }
    if (candidate !== -1) return { index: candidate, resolvedBy: "order" };
  }

  return { index: -1, resolvedBy: "none" };
}

/**
 * 하차 정류장이 목록에서 `targetIndex`번째일 때, 설정 가능한 최대
 * "N정거장 전" 값입니다.
 *
 * 0을 반환하면 그 정류장은 노선의 첫 정류장이라 "N정거장 전" 알림 자체가
 * 성립하지 않는다는 뜻입니다.
 */
export function maxStopsBefore(targetIndex: number, cap = 10): number {
  if (targetIndex <= 0) return 0;
  return Math.min(cap, targetIndex);
}
