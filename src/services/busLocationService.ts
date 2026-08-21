import { getBusLocationsByRoute } from "@/api/jeonju";
import { getRouteNoList } from "@/api/tago";
import type { Route, BusLocation, RouteDirection } from "@/types/route";

function firstValue(item: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = item[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

function normalize(value: string): string {
  return (value ?? "").replace(/\s+/g, "").trim();
}

function toNumber(value: string): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toBusLocation(item: Record<string, string>, route: Route): BusLocation | null {
  const lat = toNumber(firstValue(item, ["gpslati", "gpsLat", "latitude", "lat", "y"]));
  const lng = toNumber(firstValue(item, ["gpslong", "gpsLong", "longitude", "lng", "x"]));

  if (lat === null || lng === null) return null;

  const vehicleNo = firstValue(item, ["vehicleno", "vehicleNo", "vehicle_no", "busNo", "busno", "carNo", "carno"]);
  const nodeName = firstValue(item, ["nodenm", "nodeName", "node_name", "stopName", "stopname", "stationName"]);
  const nodeOrder = Number(firstValue(item, ["nodeord", "nodeOrder", "node_order", "seq", "sequence"]));

  return {
    vehicleNo,
    lat,
    lng,
    nodeName,
    nodeOrder: Number.isFinite(nodeOrder) ? nodeOrder : 0,
    routeId: route.id,
    direction: `${route.start} → ${route.end}`,
  };
}

/**
 * 전주시 GW의 최신 brtStdid와 기존 캐시의 brtStdid가 다른 노선에 대한 임시 매핑입니다.
 * 104번 송천동종점 → 평화동종점은 전주시 실시간 GW에서 305001271을 사용합니다.
 */
function resolveJeonjuBrtStdid(route: Route): string {
  const direction = `${route.start} → ${route.end}`;
  if (route.number === "104" && direction === "송천동종점 → 평화동종점") {
    return "305001271";
  }
  return route.id;
}

/**
 * 기존 도착정보 서비스가 사용하는 TAGO 방향 조회 호환 함수입니다.
 * 실시간 위치 조회 자체는 전주시 GW를 사용하며, 도착정보에서 필요한 TAGO routeId만 별도로 조회합니다.
 */
export async function resolveDirections(route: Route): Promise<RouteDirection[]> {
  const items = await getRouteNoList(route.number);

  const directions = items
    .map((item) => ({
      routeId: firstValue(item, ["routeid", "routeId", "route_id"]),
      start: firstValue(item, ["startnodenm", "startNodeNm", "start", "startNode"]),
      end: firstValue(item, ["endnodenm", "endNodeNm", "end", "endNode"]),
    }))
    .filter((item) => item.routeId);

  const start = normalize(route.start);
  const end = normalize(route.end);

  const exact = directions.filter(
    (item) => normalize(item.start) === start && normalize(item.end) === end,
  );

  return exact.length > 0 ? exact : directions;
}

/** 전주시 실시간 운행정보 GW에서 노선별 현재 버스 GPS 위치를 조회합니다. */
export async function fetchBusLocations(route: Route): Promise<BusLocation[]> {
  if (!route.id) {
    throw new Error("전주시 노선 ID(brtStdid)를 찾을 수 없습니다.");
  }

  const brtStdid = resolveJeonjuBrtStdid(route);

  console.info("[BUS STOP] Jeonju BusLocation request", {
    routeNumber: route.number,
    brtStdid,
    originalBrtStdid: route.id,
    direction: `${route.start} → ${route.end}`,
  });

  const items = await getBusLocationsByRoute(brtStdid);
  const locations = items
    .map((item) => toBusLocation(item, route))
    .filter((item): item is BusLocation => item !== null);

  console.info("[BUS STOP] Jeonju BusLocation result", {
    routeNumber: route.number,
    brtStdid,
    count: locations.length,
  });

  return locations;
}
