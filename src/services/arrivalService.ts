import { getSttnNoList, getSttnAcctoArvlPrearngeInfoList, getRouteAcctoThrghSttnList } from "@/api/tago";
import { resolveDirections } from "@/services/busLocationService";
import type { Route } from "@/types/route";

export interface ArrivalInfo {
  minutes: number;
  /** API가 제공하지 않으면 null — UI에서 정거장 문구를 숨김 */
  stopsAway: number | null;
}

function normalize(s: string): string {
  return (s ?? "").replace(/\s+/g, "").replace(/\(.*?\)/g, "").trim();
}

const nodeIdCache = new Map<string, string>();
const ARRIVAL_CACHE_TTL_MS = 15_000;
const arrivalCache = new Map<string, { value: ArrivalInfo | null; expiresAt: number }>();
const arrivalInFlight = new Map<string, Promise<ArrivalInfo | null>>();
/** 정류장(nodeId) 단위 원본 응답 캐시 — 같은 정류장의 여러 노선이 API를 1번만 호출 */
const stationItemsCache = new Map<string, { items: Awaited<ReturnType<typeof getSttnAcctoArvlPrearngeInfoList>>; expiresAt: number }>();
const stationItemsInFlight = new Map<string, Promise<Awaited<ReturnType<typeof getSttnAcctoArvlPrearngeInfoList>>>>();
const routeDirectionsCache = new Map<string, RouteDirectionCache>();

type RouteDirectionCache = {
  directions: Awaited<ReturnType<typeof resolveDirections>>;
  expiresAt: number;
};

type ArrivalTask = {
  run: () => Promise<ArrivalInfo | null>;
  resolve: (value: ArrivalInfo | null) => void;
};

const arrivalQueue: ArrivalTask[] = [];
let activeArrivalRequests = 0;
let lastArrivalRequestAt = 0;
let queueTimer: ReturnType<typeof setTimeout> | null = null;
const MAX_CONCURRENT_ARRIVAL_REQUESTS = 6;
const MIN_ARRIVAL_REQUEST_GAP_MS = 80;

function scheduleArrivalQueue() {
  if (queueTimer !== null) return;

  const runNext = () => {
    queueTimer = null;
    if (arrivalQueue.length === 0) return;
    if (activeArrivalRequests >= MAX_CONCURRENT_ARRIVAL_REQUESTS) return;

    const wait = Math.max(
      0,
      MIN_ARRIVAL_REQUEST_GAP_MS - (Date.now() - lastArrivalRequestAt)
    );
    if (wait > 0) {
      queueTimer = setTimeout(runNext, wait);
      return;
    }

    const task = arrivalQueue.shift();
    if (!task) return;

    activeArrivalRequests += 1;
    lastArrivalRequestAt = Date.now();

    task.run()
      .then(task.resolve)
      .catch(() => task.resolve(null))
      .finally(() => {
        activeArrivalRequests -= 1;
        scheduleArrivalQueue();
      });

    if (activeArrivalRequests < MAX_CONCURRENT_ARRIVAL_REQUESTS && arrivalQueue.length > 0) {
      queueTimer = setTimeout(runNext, MIN_ARRIVAL_REQUEST_GAP_MS);
    }
  };

  queueTimer = setTimeout(runNext, 0);
}

function enqueueArrivalRequest(run: () => Promise<ArrivalInfo | null>) {
  return new Promise<ArrivalInfo | null>((resolve) => {
    arrivalQueue.push({ run, resolve });
    scheduleArrivalQueue();
  });
}

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

const routeStopsCache = new Map<string, { items: Awaited<ReturnType<typeof getRouteAcctoThrghSttnList>>; expiresAt: number }>();
const routeStopsInFlight = new Map<string, Promise<Awaited<ReturnType<typeof getRouteAcctoThrghSttnList>>>>();
const ROUTE_STOPS_CACHE_TTL_MS = 5 * 60_000;

/**
 * 같은 이름의 정류장이 방향별로 다른 물리적 위치(= 다른 nodeId)에 있는
 * 경우가 있다(예: 104번 평화동↔송천동 양방향). 정류장명만으로 전체
 * 도시 기준 nodeId를 검색하면(resolveNodeId) 반대 방향 정류장을 잘못
 * 골라 실제로는 버스가 오고 있어도 도착정보가 "정보 없음"으로 나오는
 * 버그가 있었다. 노선(routeId)이 실제로 경유하는 정류장 목록에서 이름을
 * 찾으면 이 노선·방향에 해당하는 nodeId를 정확히 얻을 수 있다.
 *
 * 같은 노선의 즐겨찾기 정류장 여러 개가 동시에 이 함수를 호출할 수 있으므로
 * (예: 앱 기동 시 즐겨찾기 일괄 보정), 캐시가 아직 없을 때도 같은 routeId에
 * 대한 요청은 하나만 실제로 나가도록 in-flight 요청을 공유한다.
 */
export async function resolveNodeIdForRoute(stopName: string, routeId: string): Promise<string | null> {
  const key = normalize(stopName);
  if (!key || !routeId) return null;

  const now = Date.now();
  const cached = routeStopsCache.get(routeId);

  let items: Awaited<ReturnType<typeof getRouteAcctoThrghSttnList>>;
  if (cached && cached.expiresAt > now) {
    items = cached.items;
  } else {
    const running = routeStopsInFlight.get(routeId);
    if (running) {
      items = await running;
    } else {
      const request = getRouteAcctoThrghSttnList(routeId).finally(() => {
        routeStopsInFlight.delete(routeId);
      });
      routeStopsInFlight.set(routeId, request);
      items = await request;
      routeStopsCache.set(routeId, { items, expiresAt: Date.now() + ROUTE_STOPS_CACHE_TTL_MS });
    }
  }

  const matched = items.find((s) => normalize(s.nodenm ?? "") === key);
  return matched?.nodeid ?? null;
}

export async function resolveRouteId(route: Route): Promise<string | null> {
  const key = `${route.id}|${route.number}|${normalize(route.start)}|${normalize(route.end)}`;
  const now = Date.now();
  const cached = routeDirectionsCache.get(key);

  if (cached && cached.expiresAt > now) {
    return cached.directions.find(
      (direction) =>
        normalize(direction.start) === normalize(route.start) &&
        normalize(direction.end) === normalize(route.end)
    )?.routeId ?? null;
  }

  const directions = await resolveDirections(route);
  routeDirectionsCache.set(key, {
    directions,
    expiresAt: now + 60_000,
  });

  const exact = directions.find(
    (direction) =>
      normalize(direction.start) === normalize(route.start) &&
      normalize(direction.end) === normalize(route.end)
  );

  return exact?.routeId ?? null;
}

/** 정류장 도착정보 원본을 한 번만 조회하고 공유합니다. */
async function fetchStationArrivalItems(nodeId: string, force = false) {
  const now = Date.now();
  if (!force) {
    const cached = stationItemsCache.get(nodeId);
    if (cached && cached.expiresAt > now) {
      console.debug("[CACHE] station HIT", nodeId);
      return cached.items;
    }
  } else {
    stationItemsCache.delete(nodeId);
  }

  const running = stationItemsInFlight.get(nodeId);
  if (running) {
    console.debug("[CACHE] station IN-FLIGHT", nodeId);
    return running;
  }

  console.debug("[CACHE] station MISS", nodeId);
  const startedAt = Date.now();
  const promise = getSttnAcctoArvlPrearngeInfoList(nodeId)
    .then((items) => {
      console.debug("[API] TAGO station response", {
        nodeId,
        ms: Date.now() - startedAt,
        count: items.length,
      });
      stationItemsCache.set(nodeId, {
        items,
        expiresAt: Date.now() + ARRIVAL_CACHE_TTL_MS,
      });
      return items;
    })
    .finally(() => {
      stationItemsInFlight.delete(nodeId);
    });

  stationItemsInFlight.set(nodeId, promise);
  return promise;
}

/** 후보 중 가장 가까운 버스의 도착정보를 고릅니다. */
function pickNearestArrival(
  items: Awaited<ReturnType<typeof getSttnAcctoArvlPrearngeInfoList>>,
  routeId: string,
): ArrivalInfo | null {
  // routeno(노선번호)만으로 후보를 고르면 안 된다. 같은 정류장에 A→B/B→A
  // 양방향이 같은 번호로 같이 걸리는 경우, routeId(방향별 고유 ID)가
  // 일치하지 않을 때 routeno로만 폴백하면 반대 방향 버스의 도착정보를
  // 잘못 보여주게 된다(즐겨찾기한 노선과 실제 표시가 어긋나는 버그였음).
  // TAGO 응답에는 방향을 구분할 다른 필드가 없으므로, routeId가 정확히
  // 일치하는 항목이 없으면 정보 없음으로 처리한다.
  const candidates = items.filter((i) => i.routeid === routeId);

  if (candidates.length === 0) return null;

  type Candidate = { arrtimeSec: number; stopsAway: number | null };
  const parsed: Candidate[] = [];

  for (const item of candidates) {
    const arrtimeSec = Number(item.arrtime1 ?? item.arrtime);
    const rawStops = Number(item.arrprevstationcnt1 ?? item.arrprevstationcnt);
    if (isNaN(arrtimeSec) || arrtimeSec < 0) continue;
    const stopsAway =
      item.arrprevstationcnt1 == null && item.arrprevstationcnt == null
        ? null
        : isNaN(rawStops)
          ? null
          : Math.max(0, rawStops);
    parsed.push({ arrtimeSec, stopsAway });
  }

  if (parsed.length === 0) return null;

  parsed.sort(
    (a, b) =>
      a.arrtimeSec - b.arrtimeSec ||
      (a.stopsAway ?? Number.POSITIVE_INFINITY) - (b.stopsAway ?? Number.POSITIVE_INFINITY)
  );
  const nearest = parsed[0];

  return {
    minutes: Math.max(0, Math.round(nearest.arrtimeSec / 60)),
    stopsAway: nearest.stopsAway,
  };
}

export function clearArrivalCache() {
  arrivalCache.clear();
  arrivalInFlight.clear();
  stationItemsCache.clear();
  stationItemsInFlight.clear();
}

export type FetchArrivalOptions = {
  /** true면 캐시를 무시하고 최신 데이터를 요청 (수동 새로고침용) */
  force?: boolean;
};

export async function fetchArrivalInfo(
  nodeId: string,
  routeId: string,
  routeNumber?: string,
  options?: FetchArrivalOptions,
): Promise<ArrivalInfo | null> {
  const force = options?.force === true;
  const key = `${nodeId}|${routeId}|${routeNumber ?? ""}`;
  const now = Date.now();
  const startedAt = Date.now();

  if (!force) {
    const cached = arrivalCache.get(key);
    if (cached && cached.expiresAt > now) {
      console.debug("[CACHE] arrival HIT", key);
      return cached.value;
    }
  } else {
    arrivalCache.delete(key);
  }

  const running = arrivalInFlight.get(key);
  if (running) {
    console.debug("[CACHE] arrival IN-FLIGHT", key);
    return running;
  }

  console.debug("[CACHE] arrival MISS", key, force ? "(force)" : "");

  const request = enqueueArrivalRequest(async (): Promise<ArrivalInfo | null> => {
    try {
      const items = await fetchStationArrivalItems(nodeId, force);
      return pickNearestArrival(items, routeId);
    } catch (error) {
      console.warn("[BUS STOP] Arrival request failed; keeping previous value", {
        nodeId,
        routeId,
        routeNumber,
        error,
      });
      return null;
    }
  });

  arrivalInFlight.set(key, request);

  try {
    const value = await request;
    arrivalCache.set(key, {
      value,
      expiresAt: Date.now() + ARRIVAL_CACHE_TTL_MS,
    });
    console.debug("[BUS STOP] Arrival request done", {
      key,
      ms: Date.now() - startedAt,
      minutes: value?.minutes,
      stopsAway: value?.stopsAway,
    });
    return value;
  } finally {
    arrivalInFlight.delete(key);
  }
}

/** 홈 화면 수동 새로고침용: 등록된 모든 도착정보 훅을 한 번에 갱신 */
type ArrivalRefreshListener = () => Promise<void>;
const arrivalRefreshListeners = new Set<ArrivalRefreshListener>();

export function subscribeArrivalRefresh(listener: ArrivalRefreshListener): () => void {
  arrivalRefreshListeners.add(listener);
  return () => {
    arrivalRefreshListeners.delete(listener);
  };
}

export async function triggerArrivalRefresh(): Promise<void> {
  // 수동 새로고침: 캐시를 비운 뒤 등록된 모든 구독자에게 최신 요청
  clearArrivalCache();
  const tasks = [...arrivalRefreshListeners].map((listener) => listener());
  await Promise.all(tasks);
}
