import { getSttnNoList, getSttnAcctoArvlPrearngeInfoList } from "@/api/tago";
import { fetchRoutesForStop } from "@/services/routeService";
import { findNearestApproachingBus } from "@/services/busLocationService";
import { getRouteCategory, type RouteCategory } from "@/lib/routeCategory";
import type { Station } from "@/types/route";

function mapToStation(raw: Record<string, string>): Station {
  return {
    id: raw.nodeid ?? "",
    name: raw.nodenm ?? "",
    arsId: raw.nodeno ?? "",
    lat: raw.gpslati ? Number(raw.gpslati) : null,
    lng: raw.gpslong ? Number(raw.gpslong) : null,
  };
}

export async function searchStations(query: string): Promise<Station[]> {
  const raw = await getSttnNoList(query);
  return raw
    .filter((r) => r.nodeid && r.nodenm)
    .map(mapToStation);
}

export interface StationRoute {
  routeId: string;
  routeNo: string;
  /** TAGO 원문 노선유형("일반버스" 등). 표시용이며 본선/분선 판정에는 쓰지 않는다. */
  routeTp: string;
  /** 우리 DB 기준 본선/분선. 목록을 만드는 시점의 route.name에서 판정한다. */
  category: RouteCategory;
  arrtime?: number;
  arrprevstationcnt?: number;
}

/** TAGO nodeid/routeid("JUB305001094")에서 우리 앱의 brtStdid 숫자만 뽑아낸다. */
export function stripCityPrefix(id: string): string {
  return (id ?? "").replace(/^[A-Za-z]+/, "");
}

/**
 * 이 정류장을 경유하는 노선 목록을 반환합니다.
 *
 * 예전에는 TAGO 실시간 도착정보 응답에서 노선 목록을 역으로 추출했습니다.
 * 그 순간 다가오는 버스가 없는 노선(배차간격이 길거나 운행 시간이 아닌
 * 노선)은 응답 자체에 안 잡히므로 목록에서 통째로 빠지는 문제가 있었습니다.
 *
 * 노선-정류장 경유 관계는 정적 캐시(bus_route_stops_cache)에 이미 완전하게
 * 저장돼 있으므로, 목록 자체는 거기서 만들고, 실시간 도착정보는 있으면
 * 붙이는 "보강" 용도로만 사용합니다. 도착정보가 없는 노선도 목록에는 남고
 * 도착 문구만 "도착정보 없음"으로 표시됩니다.
 */
export async function fetchRoutesForStation(nodeId: string): Promise<StationRoute[]> {
  const jeonjuNodeId = stripCityPrefix(nodeId);

  const [staticRoutes, arrivalItems] = await Promise.all([
    fetchRoutesForStop(jeonjuNodeId),
    getSttnAcctoArvlPrearngeInfoList(nodeId).catch(() => []),
  ]);

  // TAGO의 routeid("JUB<brtStdid>")는 접두사만 다를 뿐 우리 앱의
  // route.id(brtStdid)와 같은 숫자를 쓰므로, 접두사를 떼면 정확한 방향의
  // 도착정보만 매칭된다(같은 번호라도 방향이 다르면 routeid도 다름).
  const arrivalByRouteId = new Map<
    string,
    { routeTp: string; arrtime?: number; arrprevstationcnt?: number }
  >();

  for (const item of arrivalItems) {
    const routeId = stripCityPrefix(item.routeid ?? "");
    if (!routeId) continue;

    const arrtime = Number(item.arrtime1 ?? item.arrtime);
    const prevStationCount = Number(item.arrprevstationcnt1 ?? item.arrprevstationcnt);
    const existing = arrivalByRouteId.get(routeId);

    if (!existing || (!isNaN(arrtime) && arrtime < (existing.arrtime ?? Infinity))) {
      arrivalByRouteId.set(routeId, {
        routeTp: item.routetp ?? "",
        arrtime: isNaN(arrtime) ? undefined : arrtime,
        arrprevstationcnt: isNaN(prevStationCount) ? undefined : prevStationCount,
      });
    }
  }

  // TAGO의 도착예측(arrprevstationcnt1)은 노선상세 화면의 버스 아이콘이 쓰는
  // GPS 위치와 다른 시스템이라 서로 어긋날 수 있다(정류장 목록엔 "2정거장
  // 전"이라 나온 노선이, 상세로 들어가면 이미 그 정류장을 지나 있던 사례).
  // 실시간 정보가 잡힌 노선만 GPS로 재검증해서, 두 화면이 다른 답을 주지
  // 않게 한다. 한 노선의 검증이 실패해도 다른 노선에는 영향이 없어야 하므로
  // allSettled로 묶는다.
  const liveRoutes = staticRoutes.filter((route) => arrivalByRouteId.has(route.id));
  const verifications = await Promise.allSettled(
    liveRoutes.map(async (route) => ({
      routeId: route.id,
      gps: await findNearestApproachingBus(route, jeonjuNodeId),
    })),
  );

  for (const result of verifications) {
    if (result.status !== "fulfilled") continue;
    const { routeId, gps } = result.value;
    if (!gps.hasLiveData) continue; // 검증할 GPS 데이터가 없으면 TAGO 값을 유지

    if (!gps.bus) {
      // GPS로 확인되는 모든 버스가 이미 이 정류장을 지났다 — TAGO 예측을
      // 믿을 근거가 없으므로 도착정보 자체를 없앤다(minutes까지 함께).
      arrivalByRouteId.delete(routeId);
      continue;
    }

    const existing = arrivalByRouteId.get(routeId);
    if (existing) {
      arrivalByRouteId.set(routeId, { ...existing, arrprevstationcnt: gps.bus.stopsAway });
    }
  }

  return staticRoutes.map((route) => {
    const live = arrivalByRouteId.get(route.id);
    return {
      routeId: `JUB${route.id}`,
      routeNo: route.number,
      routeTp: live?.routeTp ?? "",
      category: getRouteCategory(route.name),
      arrtime: live?.arrtime,
      arrprevstationcnt: live?.arrprevstationcnt,
    };
  });
}
