import type { BusStop, Station } from "@/types/route";
import { normalizeStopName } from "@/lib/stopPosition";

/**
 * 길찾기(직행) 계산용 순수 함수 모음.
 *
 * 원칙은 두 가지다.
 * 1) 우리 DB(bus_route_stops_cache)에 있는 "어느 노선이 어느 정류장을 몇 번째로
 *    지나는가"만 쓴다. 좌표가 없어 걷는 거리·시간, 버스 이동 시간은 계산하지
 *    않는다(지어낸 시간은 보여 주지 않는다. CLAUDE.md 4장).
 * 2) 노선 ID(route_id)는 방향마다 따로 있다. 같은 번호라도 반대 방향 노선은
 *    다른 route_id라서, route_id 단위로 "출발이 도착보다 앞서는가"만 보면
 *    방향이 맞는 노선만 남는다.
 */

/** 노선이 정류장을 지나는 기록 한 줄. bus_route_stops_cache의 한 행이다. */
export interface RouteStopPass {
  routeId: string;
  nodeId: string;
  /** sequence_no. 위치 인덱스가 아니라 구멍이 있는 순번이다(stopPosition 참고). */
  order: number;
}

/** 직행으로 갈 수 있는 노선 한 후보. 정거장 수는 아직 어림값(순번 차이)이다. */
export interface DirectCandidate {
  routeId: string;
  boardNodeId: string;
  alightNodeId: string;
  boardOrder: number;
  alightOrder: number;
}

/**
 * 출발 정류장들과 도착 정류장들을 모두 지나면서 출발이 도착보다 앞서는 노선을
 * 찾는다. 같은 이름의 정류장은 길 양쪽에 따로 있어서 출발·도착 모두 정류장
 * 여러 개를 받는다.
 *
 * - 한 노선이 후보 정류장을 여러 번 지나면(순환 노선, 같은 이름 정류장) 순번
 *   차이가 가장 작은 짝 하나만 남긴다.
 * - 순번 차이는 정거장 수가 아니다(순번에 구멍이 있다). 어느 노선을 먼저 자세히
 *   볼지 고르는 어림값으로만 쓰고, 화면에 보이는 정거장 수는 countStopsBetween
 *   으로 다시 센다.
 */
export function findDirectCandidates(
  passes: RouteStopPass[],
  fromNodeIds: string[],
  toNodeIds: string[],
): DirectCandidate[] {
  const fromSet = new Set(fromNodeIds);
  const toSet = new Set(toNodeIds);

  const byRoute = new Map<string, { from: RouteStopPass[]; to: RouteStopPass[] }>();
  for (const pass of passes) {
    if (!pass.routeId) continue;
    const isFrom = fromSet.has(pass.nodeId);
    const isTo = toSet.has(pass.nodeId);
    if (!isFrom && !isTo) continue;
    let entry = byRoute.get(pass.routeId);
    if (!entry) {
      entry = { from: [], to: [] };
      byRoute.set(pass.routeId, entry);
    }
    if (isFrom) entry.from.push(pass);
    if (isTo) entry.to.push(pass);
  }

  const candidates: DirectCandidate[] = [];
  for (const [routeId, { from, to }] of byRoute) {
    let best: DirectCandidate | null = null;
    for (const f of from) {
      for (const t of to) {
        if (f.nodeId === t.nodeId) continue;
        if (!(f.order < t.order)) continue;
        if (!best || t.order - f.order < best.alightOrder - best.boardOrder) {
          best = {
            routeId,
            boardNodeId: f.nodeId,
            alightNodeId: t.nodeId,
            boardOrder: f.order,
            alightOrder: t.order,
          };
        }
      }
    }
    if (best) candidates.push(best);
  }

  return candidates.sort(
    (a, b) =>
      a.alightOrder - a.boardOrder - (b.alightOrder - b.boardOrder) ||
      a.routeId.localeCompare(b.routeId),
  );
}

/**
 * 노선의 정류장 목록(순번 오름차순)에서 승차 정류장부터 하차 정류장까지의
 * 정거장 수를 센다. 노선 상세 화면이 보여 주는 목록과 같은 목록으로 세므로
 * 두 화면의 숫자가 같다. 승차 정류장이 하차보다 뒤이거나 목록에 없으면 null.
 */
export function countStopsBetween(
  stops: BusStop[],
  boardOrder: number,
  alightOrder: number,
): number | null {
  const board = stops.findIndex((s) => s.order === boardOrder);
  const alight = stops.findIndex((s) => s.order === alightOrder);
  if (board < 0 || alight < 0 || alight <= board) return null;
  return alight - board;
}

/** 같은 이름의 정류장 묶음. 길 양쪽·방향별 정류장이 한 묶음에 든다. */
export interface StationGroup {
  name: string;
  stations: Station[];
  /**
   * "현재 위치"에서 만든 묶음일 때 그때의 위치. 정류장까지 직선거리를 보여 주는
   * 데 쓴다. 이름으로 찾은 묶음에는 없다.
   */
  origin?: { lat: number; lng: number; accuracy?: number };
  /**
   * 정류장 하나만 담은 묶음(검색 목록에서 번호까지 보고 고른 경우). 같은 이름의
   * 두 정류장이 한 줄로 묶여 같은 정류장처럼 보이던 것을 나눈다.
   */
  single?: boolean;
}

/**
 * 정류장 검색 결과를 이름으로 묶는다. 목적지가 "전주역"이면 어느 쪽 길의
 * 정류장에서 내려도 되므로 이름이 같은 정류장을 한 후보로 본다. 어느
 * 정류장에서 타고 내리는지는 결과 화면에 정류장 번호와 함께 밝힌다.
 * 이름 비교는 공백·괄호 안 글자를 무시한다(normalizeStopName). 입력 순서를
 * 지킨다.
 */
export function groupStationsByName(stations: Station[]): StationGroup[] {
  const groups = new Map<string, StationGroup>();
  for (const station of stations) {
    const key = normalizeStopName(station.name) || station.name;
    if (!key) continue;
    const group = groups.get(key);
    if (group) {
      if (!group.stations.some((s) => s.id === station.id)) group.stations.push(station);
    } else {
      groups.set(key, { name: station.name, stations: [station] });
    }
  }
  return [...groups.values()];
}

/**
 * 정류장 검색 결과를 정류장 하나씩 나눠 후보로 만든다. 입력 순서를 지키고 같은
 * 정류장 ID는 한 번만 넣는다. 같은 이름이라도 번호(arsId)가 다르면 다른
 * 후보라서, 사용자가 어느 정류장인지 보고 고른다.
 */
export function splitStationsOneByOne(stations: Station[]): StationGroup[] {
  const seen = new Set<string>();
  const groups: StationGroup[] = [];
  for (const station of stations) {
    if (!station.name || seen.has(station.id)) continue;
    seen.add(station.id);
    groups.push({ name: station.name, stations: [station], single: true });
  }
  return groups;
}

/**
 * 칸에 보여 줄 글. 정류장 하나를 골랐으면 번호를 붙여 같은 이름의 다른
 * 정류장과 구분한다. 번호가 없으면 이름만 쓴다.
 */
export function groupLabel(group: StationGroup): string {
  const ars = group.single ? group.stations[0]?.arsId : "";
  return ars ? `${group.name} (${ars})` : group.name;
}

/**
 * 두 묶음이 같은 정류장 이름인지. "현재 위치" 묶음은 이름이 아니라 위치로 만든
 * 것이라 어떤 정류장 이름과도 같다고 보지 않는다.
 */
export function isSameGroup(a: StationGroup, b: StationGroup): boolean {
  if (a.origin || b.origin) return false;
  // 정류장 하나로 고른 쪽이 있으면 이름이 아니라 정류장 ID가 겹치는지로 본다.
  // 이름이 같아도 번호가 다른 정류장(길 건너편 등)은 다른 곳이다.
  if (a.single || b.single) {
    return a.stations.some((x) => b.stations.some((y) => y.id === x.id));
  }
  return (normalizeStopName(a.name) || a.name) === (normalizeStopName(b.name) || b.name);
}
