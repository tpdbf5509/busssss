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
const ARRIVAL_CACHE_TTL_MS = 5_000;
const arrivalCache = new Map<string, { value: ArrivalInfo | null; expiresAt: number }>();
const arrivalInFlight = new Map<string, Promise<ArrivalInfo | null>>();
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
const MAX_CONCURRENT_ARRIVAL_REQUESTS = 2;
const MIN_ARRIVAL_REQUEST_GAP_MS = 700;

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
      const items = await getSttnAcctoArvlPrearngeInfoList(nodeId, routeId);
      const normalizedRouteNumber = normalize(routeNumber ?? "");

      // routeId가 가장 정확한 방향 식별자이므로 먼저 사용합니다.
      // 같은 버스번호의 반대 방향이 함께 내려오는 경우에도 잘못된 방향의
      // arrprevstationcnt를 홈 화면에 표시하지 않도록 합니다.
      const item =
        items.find((i) => i.routeid === routeId) ??
        (normalizedRouteNumber
          ? items.find(
              (i) => normalize(i.routeno ?? "") === normalizedRouteNumber
            )
          : undefined) ??
        items[0];

      if (!item) return null;

      const arrtime = Number(item.arrtime1 ?? item.arrtime);
      const stopsAway = Number(item.arrprevstationcnt1 ?? item.arrprevstationcnt);
      if (!arrtime || isNaN(arrtime)) return null;

      return {
        minutes: Math.max(0, Math.round(arrtime / 60)),
        stopsAway: isNaN(stopsAway) ? 0 : Math.max(0, stopsAway),
      };
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
