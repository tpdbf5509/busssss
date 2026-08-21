import { getBusLocationsByRoute } from "@/api/jeonju";
import type { Route, BusLocation } from "@/types/route";

function firstValue(item: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = item[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
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

/** 전주시 실시간 운행정보 GW에서 노선별 현재 버스 GPS 위치를 조회합니다. */
export async function fetchBusLocations(route: Route): Promise<BusLocation[]> {
  if (!route.id) {
    throw new Error("전주시 노선 ID(brtStdid)를 찾을 수 없습니다.");
  }

  console.info("[BUS STOP] Jeonju BusLocation request", {
    routeNumber: route.number,
    brtStdid: route.id,
    direction: `${route.start} → ${route.end}`,
  });

  const items = await getBusLocationsByRoute(route.id);
  const locations = items
    .map((item) => toBusLocation(item, route))
    .filter((item): item is BusLocation => item !== null);

  console.info("[BUS STOP] Jeonju BusLocation result", {
    routeNumber: route.number,
    brtStdid: route.id,
    count: locations.length,
  });

  return locations;
}
