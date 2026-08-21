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
  // 이 API는 현재 버스의 GPS 좌표를 주지 않고, 버스가 위치한 정류장 정보를 줍니다.
  // 따라서 lat/lng가 없어도 정류장 기준 실시간 위치를 정상적으로 만들 수 있습니다.
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

  const vehicleNo = firstValue(item, [
    "busNo", "busno", "vehicleNo", "vehicleno", "vehicle_no", "vehicleId", "vehicleid",
    "carNo", "carno", "BNo", "bNo", "bno",
  ]);

  // busNo가 없는 데이터는 이미 getBusLocationsByRoute에서 제거되지만,
  // 서비스 계층에서도 한 번 더 방어합니다.
  if (!vehicleNo) return null;

  const nodeName = firstValue(item, [
    "stopKname", "stopkname", "nodenm", "nodeName", "node_name", "stopName", "stopname",
    "stationName", "bnodeNm", "bnodename", "nodeNm",
  ]);

  const nodeOrder = Number(firstValue(item, [
    "brnSeqno", "brnseqno", "brsSeqno", "brsseqno",
    "nodeord", "nodeOrder", "node_order", "seq", "sequence",
    "routeSeq", "routeseq",
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

// 전주시 GW가 내려주는 brtStdid가 실제 방향과 어긋나는 일부 노선에 대한
// 보정 테이블입니다. 노선번호 하나에 if문을 하나씩 추가하는 대신
// "번호|기점|종점" 키로 관리해 새로운 예외가 생겨도 이 테이블에만
// 항목을 추가하면 되도록 했습니다.
// TODO: 전주시 API에서 방향별 brtStdid가 정상적으로 내려오는 것이 확인되면
// 이 보정 테이블은 제거해도 됩니다.
const BRT_STDID_OVERRIDES: Record<string, string> = {
  "104|송천동종점|평화동종점": "305001271",
};

function resolveJeonjuBrtStdid(route: Route): string {
  const key = `${route.number}|${normalize(route.start)}|${normalize(route.end)}`;
  return BRT_STDID_OVERRIDES[key] ?? route.id;
}

const directionCache = new Map<string, { directions: RouteDirection[]; expiresAt: number }>();
const locationCache = new Map<string, { locations: BusLocation[]; expiresAt: number }>();
const locationInFlight = new Map<string, Promise<BusLocation[]>>();
const LOCATION_CACHE_TTL_MS = 3_000;
const DIRECTION_CACHE_TTL_MS = 60_000;

export async function resolveDirections(route: Route): Promise<RouteDirection[]> {
  const cacheKey = `${route.number}|${normalize(route.start)}|${normalize(route.end)}`;
  const cached = directionCache.get(cacheKey);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.directions;
  }

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
  const result = exact.length > 0 ? exact : directions;

  directionCache.set(cacheKey, {
    directions: result,
    expiresAt: now + DIRECTION_CACHE_TTL_MS,
  });

  return result;
}

/** 전주시 실시간 운행정보 GW에서 노선별 현재 버스 위치를 조회합니다. */
export async function fetchBusLocations(route: Route): Promise<BusLocation[]> {
  if (!route.id) {
    throw new Error("전주시 노선 ID(brtStdid)를 찾을 수 없습니다.");
  }

  const brtStdid = resolveJeonjuBrtStdid(route);
  const cacheKey = `${brtStdid}|${normalize(route.start)}|${normalize(route.end)}`;
  const now = Date.now();

  const cached = locationCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.locations;
  }

  // 화면의 여러 컴포넌트가 같은 노선을 동시에 조회해도 HTTP 요청은 하나만 보냅니다.
  const running = locationInFlight.get(cacheKey);
  if (running) {
    return running;
  }

  console.info("[BUS STOP] Jeonju BusLocation request", {
    routeNumber: route.number,
    brtStdid,
    originalBrtStdid: route.id,
    direction: `${route.start} → ${route.end}`,
  });

  const request = (async (): Promise<BusLocation[]> => {
    const items = await getBusLocationsByRoute(brtStdid);

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
      receivedLiveBuses: items.length,
      locations: locations.length,
      buses: locations.map((bus) => ({
        vehicleNo: bus.vehicleNo,
        nodeName: bus.nodeName,
        nodeOrder: bus.nodeOrder,
      })),
    });

    // 정상 응답을 잠깐 보관하여 같은 화면의 중복 렌더링이 API를 다시 호출하지 않게 합니다.
    locationCache.set(cacheKey, {
      locations,
      expiresAt: Date.now() + LOCATION_CACHE_TTL_MS,
    });

    return locations;
  })();

  locationInFlight.set(cacheKey, request);

  try {
    return await request;
  } finally {
    locationInFlight.delete(cacheKey);
  }
}
