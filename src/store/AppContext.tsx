import { useReducer, useEffect, useRef, type ReactNode } from "react";
import { showToast } from "@/lib/toastStore";
import type { Favorite, AlertSetting } from "@/types";
import { FAVORITES, ALERT_SETTINGS, CARD_INFO } from "@/data/mock";
import { fetchAllRoutes } from "@/services/routeService";
import { resolveDirections } from "@/services/busLocationService";
import { resolveNodeIdForRoute } from "@/services/arrivalService";
import {
  AppContext,
  type AppState,
  type Action,
  type StorageLoadError,
} from "@/store/appContext";

const FAVORITES_STORAGE_KEY = "busssss_favorites_v1";
const ALERTS_STORAGE_KEY = "busssss_alerts_v1";

/**
 * 저장값을 읽지 못하면 예시 데이터로 대체하되, "실패했다"는 사실을 함께
 * 돌려준다. 실패 사실을 잃어버리면 (1) 사용자에게 알릴 수 없고 (2) 아래
 * 저장 effect가 마운트 직후 예시 데이터를 원래 저장값 위에 덮어써버린다.
 */
function loadStored<T>(key: string, fallback: T[], label: string): { data: T[]; failed: boolean } {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return { data: fallback, failed: false }; // 저장된 적 없음 = 정상
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { data: parsed as T[], failed: false };
    console.warn(`[AppContext] ${label} 형식이 올바르지 않습니다.`);
  } catch (err) {
    console.warn(`[AppContext] ${label} 로드 실패:`, err);
  }
  return { data: fallback, failed: true };
}

const favoritesLoad = loadStored<Favorite>(FAVORITES_STORAGE_KEY, FAVORITES, "즐겨찾기");
const alertsLoad = loadStored<AlertSetting>(ALERTS_STORAGE_KEY, ALERT_SETTINGS, "알림 설정");

const initialState: AppState = {
  region: { sido: "전북특별자치도", sigungu: "전주시" },
  favorites: favoritesLoad.data,
  cardBalance: CARD_INFO.balance,
  alerts: alertsLoad.data,
  storageError:
    favoritesLoad.failed || alertsLoad.failed
      ? { favorites: favoritesLoad.failed, alerts: alertsLoad.failed }
      : null,
};

/**
 * 사용자가 직접 목록을 바꿨다면 "저장값을 못 읽었다"는 경고는 역할을 다한 것이다.
 * 플래그를 내려서 저장이 재개되게 한다.
 *
 * SYNC_FAVORITE_* 같은 자동 보정에는 적용하지 않는다. 그건 사용자의 의사가
 * 아니라 백그라운드 동작이라, 그걸로 저장을 재개하면 예시 데이터가 원래
 * 저장값을 덮어쓰는 걸 막지 못한다.
 */
function clearStorageError(
  current: StorageLoadError | null,
  slice: "favorites" | "alerts",
): StorageLoadError | null {
  if (!current?.[slice]) return current;
  const next = { ...current, [slice]: false };
  return next.favorites || next.alerts ? next : null;
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_REGION":
      return { ...state, region: { sido: action.sido, sigungu: action.sigungu } };
    case "ADD_FAVORITE":
      if (
        state.favorites.some(
          (f) => f.refId === action.favorite.refId && f.type === action.favorite.type
        )
      )
        return state;
      return {
        ...state,
        favorites: [...state.favorites, action.favorite],
        storageError: clearStorageError(state.storageError, "favorites"),
      };
    case "REMOVE_FAVORITE":
      return {
        ...state,
        favorites: state.favorites.filter((f) => f.id !== action.id),
        storageError: clearStorageError(state.storageError, "favorites"),
      };
    case "RENAME_FAVORITE":
      return {
        ...state,
        favorites: state.favorites.map((f) =>
          f.id === action.id ? { ...f, label: action.label } : f
        ),
        storageError: clearStorageError(state.storageError, "favorites"),
      };
    case "SYNC_FAVORITE_ROUTE_ID":
      return {
        ...state,
        favorites: state.favorites.map((f) =>
          f.id === action.id ? { ...f, tagoRouteId: action.tagoRouteId } : f
        ),
      };
    case "SYNC_FAVORITE_NODE_ID":
      return {
        ...state,
        favorites: state.favorites.map((f) =>
          f.id === action.id ? { ...f, tagoNodeId: action.tagoNodeId } : f
        ),
      };
    case "CHARGE_CARD":
      return { ...state, cardBalance: state.cardBalance + action.amount };
    case "PAY_CARD":
      return { ...state, cardBalance: Math.max(0, state.cardBalance - action.amount) };
    case "ADD_ALERT":
      return {
        ...state,
        alerts: [...state.alerts, action.alert],
        storageError: clearStorageError(state.storageError, "alerts"),
      };
    case "TOGGLE_ALERT":
      return {
        ...state,
        alerts: state.alerts.map((a) =>
          a.id === action.id ? { ...a, active: !a.active } : a
        ),
        storageError: clearStorageError(state.storageError, "alerts"),
      };
    case "REMOVE_ALERT":
      return {
        ...state,
        alerts: state.alerts.filter((a) => a.id !== action.id),
        storageError: clearStorageError(state.storageError, "alerts"),
      };
    case "DISMISS_STORAGE_ERROR":
      return { ...state, storageError: null };
    default:
      return state;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // 저장값을 못 읽은 슬라이스는 예시 데이터로 덮어쓰지 않는다. 그대로 두면
  // 마운트 직후 사용자의 원래 저장값이 날아가서, 배너로 알릴 때쯤엔 되돌릴
  // 게 없다. 사용자가 직접 목록을 바꾸면 reducer가 이 플래그를 내리고, 그때
  // 비로소 저장이 재개된다.
  //
  // "첫 렌더만 건너뛰기" 같은 방식은 쓰지 않는다 — StrictMode가 개발 모드에서
  // effect를 두 번 실행해 가드가 소진되고, 두 번째 실행이 그대로 덮어쓴다.
  // ref로 최신 값만 읽어 deps는 정직하게 유지하면서 조건을 결정론적으로 만든다.
  const storageErrorRef = useRef(state.storageError);
  storageErrorRef.current = state.storageError;

  // 저장 실패 안내는 세션당 한 번만 (목록을 바꿀 때마다 토스트가 쌓이면 안 됨)
  const saveErrorNotified = useRef(false);
  const notifySaveFailure = () => {
    if (saveErrorNotified.current) return;
    saveErrorNotified.current = true;
    showToast("변경한 내용을 저장하지 못했어요. 앱을 다시 열면 사라질 수 있어요", "error");
  };

  useEffect(() => {
    if (storageErrorRef.current?.favorites) return;
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(state.favorites));
    } catch (err) {
      console.warn("[AppContext] 즐겨찾기 저장 실패:", err);
      notifySaveFailure();
    }
  }, [state.favorites]);

  useEffect(() => {
    if (storageErrorRef.current?.alerts) return;
    try {
      localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(state.alerts));
    } catch (err) {
      console.warn("[AppContext] 알림 설정 저장 실패:", err);
      notifySaveFailure();
    }
  }, [state.alerts]);

  // 저장된 즐겨찾기의 TAGO routeId를 보정할 때 버스 번호만 보지 않습니다.
  // appRouteId가 가리키는 우리 앱의 기점/종점 방향과 정확히 일치하는
  // TAGO 방향만 선택합니다. 따라서 2001번의 정방향/역방향 routeId가 섞이지 않습니다.
  useEffect(() => {
    const stopFavorites = state.favorites.filter(
      (favorite) =>
        favorite.type === "stop_route" &&
        favorite.tagoNodeId &&
        favorite.routeNumber &&
        favorite.appRouteId
    );

    if (stopFavorites.length === 0) return;

    let cancelled = false;

    (async () => {
      try {
        const allRoutes = await fetchAllRoutes();
        if (cancelled) return;

        const routeById = new Map(allRoutes.map((route) => [route.id, route]));
        const directionResults = new Map<string, string | null>();

        // 서로 다른 노선 방향 조회는 병렬로 처리해 초기 로딩을 줄입니다.
        const uniqueRoutes = new Map<string, typeof allRoutes[number]>();
        for (const favorite of stopFavorites) {
          const route = routeById.get(favorite.appRouteId!);
          if (!route) continue;
          const cacheKey = `${route.id}|${route.number}|${route.start}|${route.end}`;
          if (!uniqueRoutes.has(cacheKey)) uniqueRoutes.set(cacheKey, route);
        }

        await Promise.all(
          [...uniqueRoutes.entries()].map(async ([cacheKey, route]) => {
            try {
              const directions = await resolveDirections(route);
              const exact = directions.find(
                (direction) =>
                  direction.routeId &&
                  (direction.start ?? "").replace(/\s+/g, "") === route.start.replace(/\s+/g, "") &&
                  (direction.end ?? "").replace(/\s+/g, "") === route.end.replace(/\s+/g, "")
              );
              directionResults.set(cacheKey, exact?.routeId ?? null);
            } catch {
              directionResults.set(cacheKey, null);
            }
          })
        );

        if (cancelled) return;

        for (const favorite of stopFavorites) {
          const route = routeById.get(favorite.appRouteId!);
          if (!route) continue;
          const cacheKey = `${route.id}|${route.number}|${route.start}|${route.end}`;
          const exactRouteId = directionResults.get(cacheKey);
          if (exactRouteId && exactRouteId !== favorite.tagoRouteId) {
            dispatch({
              type: "SYNC_FAVORITE_ROUTE_ID",
              id: favorite.id,
              tagoRouteId: exactRouteId,
            });
          }
        }
      } catch {
        // 방향 보정 실패는 기존 즐겨찾기를 변경하지 않습니다.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [state.favorites]);

  // 즐겨찾기의 tagoNodeId도 tagoRouteId처럼 잘못 저장돼 있을 수 있습니다.
  // 같은 이름의 정류장이 방향별로 다른 물리적 위치(다른 nodeId)에 있는
  // 경우, 정류장명만으로 도시 전체를 검색하면 반대 방향 정류장을 잘못
  // 고를 수 있고, 그러면 실제로 버스가 오고 있어도 도착정보가 "정보
  // 없음"으로 나옵니다. 이 노선이 실제로 경유하는 정류장 목록에서 다시
  // 조회해 저장된 값과 다르면 보정합니다.
  useEffect(() => {
    const stopFavorites = state.favorites.filter(
      (favorite) =>
        favorite.type === "stop_route" && favorite.tagoRouteId && favorite.stopName
    );

    if (stopFavorites.length === 0) return;

    let cancelled = false;

    // 즐겨찾기 개수만큼 순서대로(await) 기다리면 그만큼 홈 화면 도착정보가
    // 늦게 뜬다. 같은 노선의 정류장 목록은 resolveNodeIdForRoute 내부에서
    // 캐시/in-flight 공유로 중복 호출을 막으므로, 여기서는 병렬로 처리한다.
    Promise.all(
      stopFavorites.map(async (favorite) => {
        try {
          const nodeId = await resolveNodeIdForRoute(
            favorite.stopName!,
            favorite.tagoRouteId!
          );
          if (!cancelled && nodeId && nodeId !== favorite.tagoNodeId) {
            dispatch({
              type: "SYNC_FAVORITE_NODE_ID",
              id: favorite.id,
              tagoNodeId: nodeId,
            });
          }
        } catch {
          // 보정 실패는 기존 즐겨찾기를 변경하지 않습니다.
        }
      })
    );

    return () => {
      cancelled = true;
    };
  }, [state.favorites]);

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}
