import { getBusLocationsByRoute } from "@/api/jeonju";
import { getRouteNoList } from "@/api/tago";
import type { Route, BusLocation, RouteDirection } from "@/types/route";

function firstValue(item: Record<string, string>, keys: string[]): string {
  const entries = Object.entries(item);
  for (const key of keys) {
    const exact = item[key];
    if (exact !== undefined && exact !== null && String(exact).trim() !== "") return String(exact).trim();

    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    const matched = entries.find(([actualKey, value]) => {
      const actual = actualKey.toLowerCase().replace(/[^a-z0-9]/g, "");
      return actual === normalizedKey && value !== undefined && value !== null && String(value).trim() !== "";
    });
    if (matched) return String(matched[1]).trim();
  }
  return "";
}

function normalize(value: string): string {
  return (value ?? "").replace(/\s+/g, "").trim();
}

function toNumber(value: string): number | null {
  if (!value) return null;
  const cleaned = String(value).replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toBusLocation(item: Record<string, string>, route: Route): BusLocation | null {
  // 전주시 GW 응답에서 사용하는 좌표명 후보를 넓게 지원합니다.
  const lat = toNumber(firstValue(item, [
    "gpslati", "gpsLat", "gpsLatitude", "latitude", "lat",
    "y", "mapY", "mapy", "gpsY", "gpsy", "busY", "busy",
    "yPos", "ypos", "posY", "posy", "BLat", "blat",
  ]));
  const lng = toNumber(firstValue(item, [
    "gpslong", "gpsLong", "gpsLongitude", "longitude", "lon", "lng",
    "x", "mapX", "mapx", "gpsX", "gpsx", "busX", "busx",
    "xPos", "xpos", "posX", "posx", "BLng", "blng",
  ]));

  if (lat === null || lng === null) return null;

  const vehicleNo = firstValue(item, [
    "vehicleno", "vehicleNo", "vehicle_no", "vehicleId", "vehicleid",
    "busNo", "busno", "carNo", "carno", "BNo", "bNo", "bno",
  ]);
  const nodeName = firstValue(item, [
    "nodenm", "nodeName", "node_name", "stopName", "stopname",
    "stationName", "bnodeNm", "bnodename", "nodeNm",
  ]);
  const nodeOrder = Number(firstValue(item, [
    "nodeord", "nodeOrder", "node_order", "seq", "sequence",
    "brnSeqno", "brnseqno", "routeSeq", "routeseq",
  ]));

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

function resolveJeonjuBrtStdid(route: Route): string {
  const direction = `${route.start} → ${route.end}`;
  if (route.number === "104" && direction === "송천동종점 → 평화동종점") {
    return "305001271";
  }
  return route.id;
}

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

  // 실제 응답 필드 확인용. 좌표가 아직 없는 경우에도 원본 키를 확인할 수 있습니다.
  if (items.length > 0) {
    console.info("[BUS STOP] Jeonju realtime fields", {
      keys: Object.keys(items[0]),
      firstItem: items[0],
    });
  }

  const locations = items
    .map((item) => toBusLocation(item, route))
    .filter((item): item is BusLocation => item !== null);

  console.info("[BUS STOP] Jeonju BusLocation result", {
    routeNumber: route.number,
    brtStdid,
    received: items.length,
    locations: locations.length,
  });

  return locations;
}
