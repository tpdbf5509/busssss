import { getSttnNoList, getSttnAcctoArvlPrearngeInfoList } from "@/api/tago";
import { resolveDirections } from "@/services/busLocationService";
import type { Route } from "@/types/route";

export interface ArrivalInfo {
  minutes: number;   // 도착까지 남은 분
  stopsAway: number;  // 남은 정류장 수
}

function normalize(s: string): string {
  return (s ?? "").replace(/\s+/g, "").replace(/\(.*?\)/g, "").trim();
}

const nodeIdCache = new Map<string, string>();

/** 정류장 이름으로 TAGO 정류소ID(nodeId)를 찾습니다. */
export async function resolveNodeId(stopName: string): Promise<string | null> {
  const key = normalize(stopName);
  if (!key) return null;

  const cached = nodeIdCache.get(key);
  if (cached) return cached;

  const results = await getSttnNoList(stopName);
  const matched = results.find((r) => normalize(r.nodenm ?? "") === key) ?? results[0];
  if (!matched?.nodeid) return null;

  nodeIdCache.set(key, matched.nodeid);
  return matched.nodeid;
}

/** 우리 앱 Route를 TAGO 노선ID로 변환합니다. (실시간 위치 조회와 동일한 캐시 재사용) */
export async function resolveRouteId(route: Route): Promise<string | null> {
  const directions = await resolveDirections(route);
  return directions[0]?.routeId ?? null;
}

/** 특정 정류장 + 특정 노선의 실시간 도착예정정보를 조회합니다. */
export async function fetchArrivalInfo(
  nodeId: string,
  routeId: string
): Promise<ArrivalInfo | null> {
  try {
    const items = await getSttnAcctoArvlPrearngeInfoList(nodeId, routeId);
    const item = items.find((i) => i.routeid === routeId) ?? items[0];
    if (!item) return null;

    const arrtime = Number(item.arrtime1 ?? item.arrtime);
    const stopsAway = Number(item.arrprevstationcnt1 ?? item.arrprevstationcnt);
    if (!arrtime || isNaN(arrtime)) return null;

    return {
      minutes: Math.max(0, Math.round(arrtime / 60)),
      stopsAway: isNaN(stopsAway) ? 0 : stopsAway,
    };
  } catch {
    return null;
  }
}