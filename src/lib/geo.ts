import type { Station } from "@/types/route";

/**
 * 길찾기의 "현재 위치에서 출발"에 쓰는 거리 계산.
 *
 * 여기서 구하는 것은 **직선거리**다. 실제 걷는 길을 모르므로(길 데이터 없음)
 * 걷는 시간으로 바꿔 보여 주지 않는다. 직선 230m가 돌아가는 길로는 600m일 수
 * 있어서, 시간을 말하면 사용자가 버스를 놓칠 수 있다(CLAUDE.md 4장 원칙).
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** 두 지점 사이 직선거리(미터). 하버사인 공식. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * 중심에서 반지름(미터) 안을 포함하는 사각형. 서버 조회를 사각형으로 좁힌 뒤
 * 정확한 원 안인지는 distanceMeters로 다시 거른다.
 */
export function boundingBox(center: LatLng, radiusMeters: number): BoundingBox {
  const dLat = (radiusMeters / EARTH_RADIUS_M) * (180 / Math.PI);
  // 위도가 높을수록 경도 1도가 짧아진다.
  const dLng = dLat / Math.max(0.01, Math.cos(toRad(center.lat)));
  return {
    minLat: center.lat - dLat,
    maxLat: center.lat + dLat,
    minLng: center.lng - dLng,
    maxLng: center.lng + dLng,
  };
}

export interface NearbyStation {
  station: Station;
  distance: number;
}

/**
 * 좌표가 있는 정류장 중 반지름 안의 것을 가까운 순으로 고른다.
 * 좌표가 없는 정류장은 거리를 모르므로 제외한다.
 */
export function nearestStations(
  origin: LatLng,
  stations: Station[],
  radiusMeters: number,
  limit: number,
): NearbyStation[] {
  const found: NearbyStation[] = [];
  for (const station of stations) {
    if (station.lat == null || station.lng == null) continue;
    const distance = distanceMeters(origin, { lat: station.lat, lng: station.lng });
    if (distance <= radiusMeters) found.push({ station, distance });
  }
  return found
    .sort((a, b) => a.distance - b.distance || a.station.id.localeCompare(b.station.id))
    .slice(0, limit);
}

/** 화면용 거리 글자. 10m 단위로 내림하고 1km부터는 소수 한 자리 km로 쓴다. */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return "";
  if (meters < 1000) return `${Math.max(10, Math.floor(meters / 10) * 10)}m`;
  return `${(Math.floor(meters / 100) / 10).toFixed(1)}km`;
}
