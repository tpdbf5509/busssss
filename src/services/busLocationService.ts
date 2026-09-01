import { getBusLocationsByRoute } from "@/api/jeonju";
import { getRouteNoList } from "@/api/tago";
import type { Route, BusLocation, RouteDirection } from "@/types/route";
import { resolveJeonjuBrtStdid, fetchStopsForRoute } from "@/services/routeService";
import { resolveBusStopIndex } from "@/lib/stopPosition";

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

  // 정류장 ID는 정적 캐시와 실시간 위치를 순번이 아니라 ID로 대조하기 위해
  // 뽑는다(stopPosition.resolveBusStopIndex 참고). GW가 안 내려주면 빈 값이
  // 되고, 그때는 nodeOrder 기반 환산으로 폴백한다.
  const nodeId = firstValue(item, [
    "stopStandardid", "stopstandardid", "stopId", "stopid",
    "nodeid", "nodeId", "node_id", "bnodeId", "bnodeid",
    "BStopId", "bstopid",
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
    nodeId,
    nodeOrder: Number.isFinite(nodeOrder) ? nodeOrder : 0,
    routeId: route.id,
    direction: `${route.start} → ${route.end}`,
  };
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

export interface NearestBusResult {
  /** 이 노선에 실시간 GPS 위치 데이터가 하나라도 있었는지.
   *  false면 검증할 근거가 없으므로 호출부는 기존(TAGO) 값을 그대로 믿어야 한다. */
  hasLiveData: boolean;
  /** 목표 정류장에 아직 도착하지 않은 버스 중 가장 가까운 것. 실시간 데이터는
   *  있는데 이 값이 null이면, 보고된 모든 버스가 이미 그 정류장을 지났다는 뜻. */
  bus: { stopsAway: number; vehicleNo: string } | null;
}

/**
 * 정류장 카드의 "N정거장"이 노선상세 화면의 버스 위치 아이콘과 다른 값을
 * 보여주던 문제의 근본 원인은, 서로 다른 두 실시간 소스를 썼기 때문이다.
 *
 * - 홈 즐겨찾기 / 정류장 노선목록의 "N정거장"은 TAGO 자체 도착예측
 *   (`arrprevstationcnt1`)이었다.
 * - 노선상세의 버스 아이콘 위치는 전주시 GPS 위치 + 우리 DB 정류장 순서
 *   (resolveBusStopIndex)였다.
 *
 * 두 소스는 독립적인 시스템이라 근본적으로 어긋날 수 있고, 실제로 사용자가
 * 같은 버스를 두 화면에서 다른 값으로 봤다(정류장 도착 예정이라던 즐겨찾기가,
 * 열어보면 이미 그 정류장을 지나쳐 있었음). 정확성이 최우선인 버스 앱에서는
 * 화면마다 다른 답을 주면 안 되므로, 노선상세와 같은 GPS 기반 계산 하나로
 * 통일한다. TAGO 자체 예측(arrprevstationcnt1)은 더 이상 신뢰하지 않는다.
 */
export async function findNearestApproachingBus(
  route: Route,
  targetNodeId: string,
): Promise<NearestBusResult> {
  const NO_DATA: NearestBusResult = { hasLiveData: false, bus: null };
  if (!targetNodeId) return NO_DATA;

  try {
    const [stops, locations] = await Promise.all([
      fetchStopsForRoute(route),
      fetchBusLocations(route),
    ]);

    const targetIndex = stops.findIndex((stop) => stop.id === targetNodeId);
    if (targetIndex === -1 || locations.length === 0) return NO_DATA;

    let best: { stopsAway: number; vehicleNo: string } | null = null;
    for (const location of locations) {
      const { index } = resolveBusStopIndex(stops, location.nodeId, location.nodeOrder);
      // index === -1: 위치를 환산하지 못함. index > targetIndex: 이미 지나감.
      // 둘 다 "이 버스는 접근 중인 후보가 아니다"로 취급한다.
      if (index === -1 || index > targetIndex) continue;

      const stopsAway = targetIndex - index;
      if (!best || stopsAway < best.stopsAway) {
        best = { stopsAway, vehicleNo: location.vehicleNo };
      }
    }

    return { hasLiveData: true, bus: best };
  } catch (err) {
    console.debug("[busLocationService] GPS 기반 정거장 검증 실패:", err);
    return NO_DATA;
  }
}
