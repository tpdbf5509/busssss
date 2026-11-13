import { getRoutePassesForNodes } from "@/api/jeonju";
import { fetchAllRoutes, fetchStopsForRoute } from "@/services/routeService";
import { fetchArrivalInfo, type ArrivalInfo } from "@/services/arrivalService";
import {
  countStopsBetween,
  findDirectCandidates,
  type RouteStopPass,
} from "@/lib/directRoutes";
import type { BusStop, Route, Station } from "@/types/route";

/** 길찾기 결과 한 줄: 노선 하나로 갈아타지 않고 갈 수 있는 경로. */
export interface DirectRouteResult {
  route: Route;
  boardStation: Station;
  alightStation: Station;
  /** 승차 정류장에서 하차 정류장까지 정거장 수. 노선 상세의 정류장 목록으로 센다. */
  stopCount: number;
}

/**
 * 순번 차이가 작은 순으로 이만큼만 정거장 수를 자세히 센다. 노선마다 정류장
 * 목록을 따로 받아 오므로(5분 저장) 후보가 많아도 요청이 이 수를 넘지 않게
 * 한다. 요청 제한(403/429) 때문에 한꺼번에 부르지 않고 순서대로 받는다.
 */
export const MAX_DIRECT_RESULTS = 6;

/** 승차 정류장 도착 정보를 붙일 상위 결과 수. 마찬가지로 순서대로 부른다. */
export const MAX_LIVE_ARRIVALS = 3;

export interface DirectRouteDeps {
  getPasses: (nodeIds: string[]) => Promise<RouteStopPass[]>;
  getRoutes: () => Promise<Route[]>;
  getStops: (route: Route) => Promise<BusStop[]>;
}

const defaultDeps: DirectRouteDeps = {
  getPasses: getRoutePassesForNodes,
  getRoutes: fetchAllRoutes,
  getStops: fetchStopsForRoute,
};

/**
 * 출발 정류장 묶음에서 도착 정류장 묶음까지 직행으로 가는 노선을 찾는다.
 *
 * 요청 수(검색 한 번): 노선-정류장 조회 1회(출발·도착을 `in`으로 묶음) +
 * 노선 목록(앱 안에서 한 번만 받아 저장) + 상위 MAX_DIRECT_RESULTS개 노선의
 * 정류장 목록(노선당 1회, 5분 저장). 새 외부 API는 부르지 않는다.
 * 하나라도 실패하면 결과를 지어내지 않고 오류를 그대로 올린다.
 */
export async function findDirectRoutes(
  from: Station[],
  to: Station[],
  deps: DirectRouteDeps = defaultDeps,
): Promise<DirectRouteResult[]> {
  const fromIds = from.map((s) => s.id);
  const toIds = to.map((s) => s.id);
  if (fromIds.length === 0 || toIds.length === 0) return [];

  const passes = await deps.getPasses([...fromIds, ...toIds]);
  const candidates = findDirectCandidates(passes, fromIds, toIds).slice(0, MAX_DIRECT_RESULTS);
  if (candidates.length === 0) return [];

  const routes = await deps.getRoutes();
  const routeById = new Map(routes.map((r) => [r.id, r]));
  const stationById = new Map([...from, ...to].map((s) => [s.id, s]));

  const results: DirectRouteResult[] = [];
  for (const candidate of candidates) {
    const route = routeById.get(candidate.routeId);
    const boardStation = stationById.get(candidate.boardNodeId);
    const alightStation = stationById.get(candidate.alightNodeId);
    if (!route || !boardStation || !alightStation) continue;

    const stops = await deps.getStops(route);
    const stopCount = countStopsBetween(stops, candidate.boardOrder, candidate.alightOrder);
    // 정류장 목록에서 두 정류장을 못 찾으면 노선 상세와 숫자가 어긋난다.
    // 어림값으로 대신하지 않고 이 결과를 뺀다.
    if (stopCount == null) continue;

    results.push({ route, boardStation, alightStation, stopCount });
  }

  return results.sort(
    (a, b) =>
      a.stopCount - b.stopCount ||
      a.route.number.localeCompare(b.route.number, undefined, { numeric: true }),
  );
}

/**
 * 결과의 승차 정류장에 지금 어떤 버스가 오는지 붙인다. 상위 MAX_LIVE_ARRIVALS개만
 * 순서대로 부르고(한꺼번에 보내지 않음), 한 줄이 실패해도 나머지는 계속한다.
 * 실패한 줄은 map에 넣지 않아 화면이 "정보 없음"으로 보여 준다(옛 값을 남기지
 * 않는다. CLAUDE.md 4장).
 */
export async function fetchLiveArrivals(
  results: DirectRouteResult[],
  isCancelled: () => boolean,
  onArrival: (key: string, info: ArrivalInfo | null) => void,
): Promise<void> {
  for (const result of results.slice(0, MAX_LIVE_ARRIVALS)) {
    if (isCancelled()) return;
    const key = directRouteKey(result);
    try {
      const info = await fetchArrivalInfo(
        result.boardStation.id,
        `JUB${result.route.id}`,
        result.route.number,
        undefined,
        result.route,
      );
      if (isCancelled()) return;
      onArrival(key, info);
    } catch {
      if (isCancelled()) return;
      onArrival(key, null);
    }
  }
}

export function directRouteKey(result: DirectRouteResult): string {
  return `${result.route.id}|${result.boardStation.id}|${result.alightStation.id}`;
}
