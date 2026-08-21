import { getRouteNoList, getRouteAcctoBusLcList, type RawTagoField } from "@/api/tago";
import type { Route, RouteDirection, BusLocation } from "@/types/route";

const directionsCache = new Map<string, RouteDirection[]>();
const directionsPromiseCache = new Map<string, Promise<RouteDirection[]>>();

function toDirections(items: RawTagoField[]): RouteDirection[] {
  return items
    .filter((item) => item.routeid)
    .map((item) => ({
      routeId: item.routeid,
      start: item.startnodenm ?? "",
      end: item.endnodenm ?? "",
    }));
}

function normalize(s: string): string {
  return (s ?? "").replace(/\s+/g, "").trim();
}

/** 기점과 종점이 모두 주어진 경우 둘 다 일치하는 방향만 사용합니다. */
function filterMatchingDirections(route: Route, directions: RouteDirection[]): RouteDirection[] {
  const rs = normalize(route.start);
  const re = normalize(route.end);

  if (!rs && !re) return directions.slice(0, 2);

  const matched = directions.filter((d) => {
    const ds = normalize(d.start);
    const de = normalize(d.end);
    const startMatches = !rs || ds.includes(rs) || rs.includes(ds);
    const endMatches = !re || de.includes(re) || re.includes(de);
    return startMatches && endMatches;
  });

  // 기점/종점이 모두 맞는 결과가 없으면, 양쪽 중 하나만 맞는 결과를 사용하지 않고
  // 원본 방향 목록에서 최대 2개만 시도합니다. 잘못된 routeId를 위치 API에 보내는 것을 줄입니다.
  return matched.length > 0 ? matched : directions.slice(0, 2);
}

export async function resolveDirections(route: Route): Promise<RouteDirection[]> {
  const cacheKey = route.id || `${route.number}-${route.start}-${route.end}`;

  const cached = directionsCache.get(cacheKey);
  if (cached) return cached;

  const pending = directionsPromiseCache.get(cacheKey);
  if (pending) return pending;

  const promise = (async () => {
    try {
      let items = await getRouteNoList(route.number);

      if (items.length === 0 && route.rawNumber && route.rawNumber !== route.number) {
        items = await getRouteNoList(route.rawNumber);
      }

      const allDirections = toDirections(items);
      const directions = filterMatchingDirections(route, allDirections);

      directionsCache.set(cacheKey, directions);
      return directions;
    } finally {
      directionsPromiseCache.delete(cacheKey);
    }
  })();

  directionsPromiseCache.set(cacheKey, promise);
  return promise;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 노선에 현재 운행 중인 모든 버스의 실시간 GPS 위치를 조회합니다. */
export async function fetchBusLocations(route: Route): Promise<BusLocation[]> {
  const directions = await resolveDirections(route);

  if (directions.length === 0) {
    throw new Error("TAGO에 등록된 노선 정보를 찾을 수 없어요.");
  }

  const locations: BusLocation[] = [];
  const errors: unknown[] = [];

  // TAGO 위치정보 API는 방향별로 순차 호출합니다.
  for (let i = 0; i < directions.length; i++) {
    const dir = directions[i];
    try {
      console.info("[BUS STOP] BusLcInfo request", {
        routeNumber: route.number,
        routeId: dir.routeId,
        direction: `${dir.start} → ${dir.end}`,
      });

      const items = await getRouteAcctoBusLcList(dir.routeId);
      for (const item of items) {
        locations.push({
          vehicleNo: item.vehicleno ?? "",
          lat: item.gpslati ? Number(item.gpslati) : null,
          lng: item.gpslong ? Number(item.gpslong) : null,
          nodeName: item.nodenm ?? "",
          nodeOrder: Number(item.nodeord) || 0,
          routeId: dir.routeId,
          direction: `${dir.start} → ${dir.end}`,
        });
      }
    } catch (err) {
      console.error("[BUS STOP] BusLcInfo failed", {
        routeNumber: route.number,
        routeId: dir.routeId,
        direction: `${dir.start} → ${dir.end}`,
        error: err,
      });
      errors.push(err);
    }

    if (i < directions.length - 1) {
      await delay(1000);
    }
  }

  if (errors.length === directions.length) {
    const first = errors[0];
    throw first instanceof Error ? first : new Error("실시간 위치를 불러오지 못했어요.");
  }

  return locations;
}
