import { getSttnAcctoArvlPrearngeInfoList } from "@/api/tago";
import { findNearestApproachingBus } from "@/services/busLocationService";
import { fetchStopsForRoute } from "@/services/routeService";
import { stripCityPrefix, toTagoNodeId } from "@/services/stationService";
import { normalizeStopName } from "@/lib/stopPosition";
import { isArrivalTimePlausible } from "@/lib/arrivalPlausibility";
import { estimateMinutesAway } from "@/lib/busPace";
import type { Route } from "@/types/route";

export interface ArrivalInfo {
  /**
   * null이면 도착 시간을 믿을 수 없어 표시하지 않는 상태다(정거장 수만 표시).
   * TAGO 예측이 GPS로 확인한 정거장 수와 앞뒤가 안 맞을 때 여기로 온다 —
   * arrivalPlausibility 참고.
   */
  minutes: number | null;
  /** API가 제공하지 않으면 null — UI에서 정거장 문구를 숨김 */
  stopsAway: number | null;
}

const ARRIVAL_CACHE_TTL_MS = 15_000;
const arrivalCache = new Map<string, { value: ArrivalInfo | null; expiresAt: number }>();
const arrivalInFlight = new Map<string, Promise<ArrivalInfo | null>>();
/** 정류장(nodeId) 단위 원본 응답 캐시 — 같은 정류장의 여러 노선이 API를 1번만 호출 */
const stationItemsCache = new Map<string, { items: Awaited<ReturnType<typeof getSttnAcctoArvlPrearngeInfoList>>; expiresAt: number }>();
const stationItemsInFlight = new Map<string, Promise<Awaited<ReturnType<typeof getSttnAcctoArvlPrearngeInfoList>>>>();

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

/**
 * 같은 이름의 정류장이 방향별로 다른 물리적 위치(= 다른 nodeId)에 있는
 * 경우가 있다(예: 104번 평화동↔송천동 양방향). 정류장명만으로 전체
 * 도시 기준에서 찾으면 반대 방향 정류장을 잘못 골라 실제로는 버스가 오고
 * 있어도 도착정보가 "정보 없음"으로 나오는
 * 버그가 있었다. 노선이 실제로 경유하는 정류장 목록에서 이름을 찾으면
 * 이 노선·방향에 해당하는 nodeId를 정확히 얻을 수 있다.
 *
 * 예전에는 이 목록을 TAGO API(getRouteAcctoThrghSttnList)로 매번 실시간
 * 조회했다. 하지만 이 노선-정류장 관계는 이미 우리 Supabase 캐시
 * (bus_route_stops_cache, fetchStopsForRoute)에 정적 데이터로 들어있고,
 * 노선 상세 화면·GPS 위치 계산 등 이 세션에서 고친 모든 정확성 작업이
 * 이미 이 데이터를 신뢰하고 있다 — 굳이 TAGO를 한 번 더 불러 같은 답을
 * 늦게 받을 이유가 없다. DB 조회로 바꿔서 네트워크 왕복을 없앤다
 * (fetchStopsForRoute 자체에 5분 캐시가 있어 반복 호출도 저렴하다).
 */
export async function resolveNodeIdForRoute(
  stopName: string,
  routeId: string,
  knownNodeId?: string,
): Promise<string | null> {
  const key = normalizeStopName(stopName);
  const appRouteId = stripCityPrefix(routeId);
  if (!appRouteId) return null;
  if (!key && !knownNodeId) return null;

  const stops = await fetchStopsForRoute(appRouteId).catch(() => []);

  // 이미 저장된 nodeId가 이 노선에 실제로 있으면 그대로 둔다.
  //
  // 이름으로 다시 찾으면 안 되는 이유: 아래 find는 목록에서 이름이 처음
  // 일치하는 정류장을 고르는데, 이 목록은 순번 순으로 정렬돼 있어 같은
  // 이름이 여러 개인 노선에서는 "항상 순번이 빠른 쪽"이 걸린다. 예로 10번
  // 추동은 순번 12(305100174)와 13(305100173)에 따로 있어서, 사용자가 고른
  // 순번 13이 앱을 켤 때마다 순번 12로 조용히 바뀌었고 홈 화면에는 엉뚱한
  // 정류장의 도착정보가 떴다. 사용자가 알아챌 방법이 없는 버그였다.
  //
  // 저장된 nodeId가 이 노선에 없을 때만(= 예전 도시 전체 이름 검색으로
  // 잘못 저장된 값) 이름으로 다시 찾는 원래 보정을 그대로 수행한다.
  if (knownNodeId && stops.some((s) => s.id === knownNodeId)) return knownNodeId;

  const matched = stops.find((s) => normalizeStopName(s.name) === key);
  return matched?.id ?? null;
}

/**
 * TAGO가 전주시 노선에 매기는 routeId는 "JUB" + 우리 brtStdid(route.id) 형식을
 * 그대로 쓴다 — fetchRoutesForStation에서 실제 TAGO 응답의 routeid를
 * stripCityPrefix해서 route.id와 직접 대조해 이미 검증된 사실이다.
 * 예전에는 이 값을 얻으려고 TAGO의 노선 검색 API(getRouteNoList)를 매번
 * 호출해 기점/종점 이름을 매칭했지만, 같은 답을 계산만으로 바로 얻을 수
 * 있으므로 네트워크 호출이 불필요하다.
 */
export async function resolveRouteId(route: Pick<Route, "id">): Promise<string | null> {
  return route.id ? `JUB${route.id}` : null;
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
  // TAGO는 "JUB" 접두사가 붙은 정류장 ID만 안다. 우리 DB 값을 그대로 넘기면
  // 오류가 아니라 "도착 예정 버스 없음"과 똑같은 빈 목록이 돌아온다
  // (toTagoNodeId 주석의 실측 비교 참고). 캐시 키는 호출부가 넘긴 값
  // 그대로 두고, 실제 요청에서만 변환한다.
  const promise = getSttnAcctoArvlPrearngeInfoList(toTagoNodeId(nodeId))
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
  route?: Route,
): Promise<ArrivalInfo | null> {
  const force = options?.force === true;
  // route 유무를 키에 포함한다. route 없이 시작한 요청이 아직 진행 중일 때
  // route가 막 준비된 재조회가 오면, 같은 키의 in-flight 요청을 그대로
  // 돌려주면서 GPS 검증 없이 끝나버리는 경쟁 상태가 있었다(HomeScreen이
  // fetchAllRoutes보다 먼저 이 훅을 마운트하는 경우 실제로 발생 확인).
  // route 유무별로 슬롯을 분리해 서로의 진행 중인 요청을 가로채지 않게 한다.
  const key = `${nodeId}|${routeId}|${routeNumber ?? ""}|${route ? "gps" : "tago"}`;
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
      const tagoInfo = pickNearestArrival(items, routeId);

      // route를 아직 못 구했으면(호출부가 조회 중) GPS로 확인할 방법이 없다.
      if (!route) return tagoInfo;

      // 여기서 TAGO 결과가 비었다고 끝내면 안 된다.
      //
      // TAGO 도착예정 목록에는 정류장에 어느 정도 가까워진 버스만 올라온다.
      // 그래서 노선상세 화면에는 GPS로 버스가 뻔히 보이는데(예: 75번에서
      // 버스는 순번 11, 즐겨찾기한 전주대학교는 순번 35) 홈 즐겨찾기 카드만
      // "정보 없음"으로 뜨는 문제가 있었다. 그 버스는 정류장을 지난 것도
      // 아니고 멀쩡히 오고 있는데, TAGO에 아직 안 잡혔다는 이유로 "안 온다"고
      // 말한 셈이다.
      //
      // 버스가 오고 있다는 사실 자체는 GPS만으로도 확정할 수 있다. TAGO는
      // 시간을 붙이는 용도이지, 버스의 존재를 판정하는 근거가 아니다.
      const gps = await findNearestApproachingBus(route, nodeId);
      if (!gps.hasLiveData) return tagoInfo; // 검증할 GPS 데이터가 없으면 TAGO를 믿는다
      if (!gps.bus) return null; // GPS로 확인되는 모든 버스가 이미 지나감

      const stopsAway = gps.bus.stopsAway;

      // 1순위 — TAGO의 도착 예정 시간.
      //
      // TAGO는 버스 한 대 한 대에 대해 따로 예측을 내놓는다. 같은 정류장에서
      // 실측한 예: 104번 193초/3정거장(64초/정거장), 2001번 683초/10정거장
      // (68초/정거장), 3-2번 921초/14정거장(66초/정거장) — 차량과 구간에 따라
      // 값이 달라진다. 아래 busPace는 노선당 평균 하나뿐이라 이 차이를 담지
      // 못하고, 정거장 수가 많아질수록 오차가 그대로 곱해진다(제보 사례:
      // 우리 5정거장 10분 = 120초/정거장인데 실제·타 앱은 80~90초/정거장).
      //
      // 예전에는 busPace를 1순위로 뒀는데, 그건 TAGO 정류장 ID에 "JUB"
      // 접두사를 안 붙여 도착정보가 늘 비어 있던 때의 판단이었다
      // (stationService.toTagoNodeId 참고). 접두사를 고친 뒤로는 TAGO가
      // 차량별 예측을 정상적으로 내려주므로 그쪽이 더 정확하다.
      //
      // 단 시간(TAGO)과 정거장 수(GPS)는 출처가 달라 같은 버스의 값이라는
      // 보장이 없다. TAGO 목록에 코앞의 버스가 빠져 있으면 그 다음 버스의
      // 예측 시간에 앞 버스의 정거장 수가 붙어 "14분 후 · 1정거장" 같은
      // 조합이 나온다(실측 도착은 2분). 앞뒤가 맞을 때만 쓴다
      // — arrivalPlausibility 참고.
      if (tagoInfo?.minutes != null && isArrivalTimePlausible(tagoInfo.minutes, stopsAway)) {
        return { minutes: tagoInfo.minutes, stopsAway };
      }

      // 2순위 — TAGO에 이 버스의 시간이 없거나 정거장 수와 앞뒤가 안 맞으면,
      // 이 노선에서 실제로 관측된 속도로 계산한다(busPace). GPS에는 보이는데
      // TAGO가 아직 안 잡은 버스가 여기 해당한다.
      const measured = estimateMinutesAway(route.id, stopsAway);
      if (measured != null) return { minutes: measured, stopsAway };

      // 3순위 — 근거가 없으면 시간 없이 정거장 수만 남긴다("5정거장").
      return { minutes: null, stopsAway };
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
