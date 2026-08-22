import { getSttnNoList, getSttnAcctoArvlPrearngeInfoList } from "@/api/tago";
import { resolveDirections } from "@/services/busLocationService";
import type { Route } from "@/types/route";

export interface ArrivalInfo {
  minutes: number;
  stopsAway: number;
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
async function fetchStationArrivalItems(nodeId: string) {
  const now = Date.now();
  const cached = stationItemsCache.get(nodeId);
  if (cached && cached.expiresAt > now) return cached.items;

  const running = stationItemsInFlight.get(nodeId);
  if (running) return running;

  const promise = getSttnAcctoArvlPrearngeInfoList(nodeId).then((items) => {
    stationItemsCache.set(nodeId, {
      items,
      expiresAt: Date.now() + ARRIVAL_CACHE_TTL_MS,
    });
    return items;
  }).finally(() => {
    stationItemsInFlight.delete(nodeId);
  });

  stationItemsInFlight.set(nodeId, promise);
  return promise;
}

/** 후보 중 가장 가까운 버스의 도착정보를 고릅니다. */
function pickNearestArrival(
  items: Awaited<ReturnType<typeof getSttnAcctoArvlPrearngeInfoList>>,
  routeId: string,
  routeNumber?: string,
): ArrivalInfo | null {
  const normalizedRouteNumber = normalize(routeNumber ?? "");

  const byRouteId = items.filter((i) => i.routeid === routeId);
  const byRouteNo = normalizedRouteNumber
    ? items.filter((i) => normalize(i.routeno ?? "") === normalizedRouteNumber)
    : [];
  const candidates = byRouteId.length > 0 ? byRouteId : byRouteNo.length > 0 ? byRouteNo : [];

  if (candidates.length === 0) return null;

  type Candidate = { arrtimeSec: number; stopsAway: number };
  const parsed: Candidate[] = [];

  for (const item of candidates) {
    const arrtimeSec = Number(item.arrtime1 ?? item.arrtime);
    const stopsAway = Number(item.arrprevstationcnt1 ?? item.arrprevstationcnt);
    if (isNaN(arrtimeSec) || arrtimeSec < 0) continue;
    parsed.push({
      arrtimeSec,
      stopsAway: isNaN(stopsAway) ? 0 : Math.max(0, stopsAway),
    });
  }

  if (parsed.length === 0) return null;

  parsed.sort((a, b) => a.arrtimeSec - b.arrtimeSec || a.stopsAway - b.stopsAway);
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

export async function fetchArrivalInfo(
  nodeId: string,
  routeId: string,
  routeNumber?: string,
): Promise<ArrivalInfo | null> {
  const key = `${nodeId}|${routeId}|${routeNumber ?? ""}`;
  const now = Date.now();

  const cached = arrivalCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const running = arrivalInFlight.get(key);
  if (running) return running;

  const request = enqueueArrivalRequest(async (): Promise<ArrivalInfo | null> => {
    try {
      const items = await fetchStationArrivalItems(nodeId);
      return pickNearestArrival(items, routeId, routeNumber);
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
    return value;
  } finally {
    arrivalInFlight.delete(key);
  }
}
