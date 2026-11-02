import { getStationCoordsInBox } from "@/api/jeonju";
import { boundingBox, nearestStations, type LatLng } from "@/lib/geo";
import type { StationGroup } from "@/lib/directRoutes";
import type { Station } from "@/types/route";

/** 현재 위치에서 이 거리 안의 정류장만 출발 후보로 본다(직선거리). */
export const NEARBY_RADIUS_M = 500;
/** 가까운 순으로 이만큼만 후보로 둔다. 후보가 많을수록 노선 조회가 늘어난다. */
export const NEARBY_LIMIT = 5;

export const CURRENT_LOCATION_NAME = "현재 위치";

export type NearbyFetcher = typeof getStationCoordsInBox;

/**
 * 현재 위치 근처 정류장을 "현재 위치" 묶음 하나로 돌려준다. 길찾기가 이 묶음의
 * 정류장 전체를 출발 후보로 쓴다. 근처에 정류장이 없으면 null이다(좌표 표가
 * 아직 비어 있는 경우도 같다 — 호출부가 안내 문구를 정한다).
 */
export async function findNearbyGroup(
  origin: LatLng,
  fetchBox: NearbyFetcher = getStationCoordsInBox,
): Promise<StationGroup | null> {
  const rows = await fetchBox(boundingBox(origin, NEARBY_RADIUS_M));
  const stations: Station[] = rows.map((r) => ({
    id: r.nodeId,
    name: r.name,
    arsId: r.arsId,
    lat: r.lat,
    lng: r.lng,
  }));

  const nearby = nearestStations(origin, stations, NEARBY_RADIUS_M, NEARBY_LIMIT);
  if (nearby.length === 0) return null;

  return {
    name: CURRENT_LOCATION_NAME,
    stations: nearby.map((n) => n.station),
    origin,
  };
}
