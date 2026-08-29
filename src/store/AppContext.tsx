import { useReducer, useEffect, type ReactNode } from "react";
import type { Favorite, AlertSetting } from "@/types";
import { FAVORITES, ALERT_SETTINGS, CARD_INFO } from "@/data/mock";
import { fetchAllRoutes } from "@/services/routeService";
import { resolveDirections } from "@/services/busLocationService";
import { resolveNodeIdForRoute } from "@/services/arrivalService";
import { AppContext, type AppState, type Action } from "@/store/appContext";

const FAVORITES_STORAGE_KEY = "busssss_favorites_v1";
const ALERTS_STORAGE_KEY = "busssss_alerts_v1";

function loadFavorites(): Favorite[] {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn("[AppContext] 즐겨찾기 로드 실패:", err);
  }
  return FAVORITES;
}

function loadAlerts(): AlertSetting[] {
  try {
    const raw = localStorage.getItem(ALERTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn("[AppContext] 알림 설정 로드 실패:", err);
  }
  return ALERT_SETTINGS;
}

const initialState: AppState = {
  region: { sido: "전북특별자치도", sigungu: "전주시" },
  favorites: loadFavorites(),
  cardBalance: CARD_INFO.balance,
  alerts: loadAlerts(),
};

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
      return { ...state, favorites: [...state.favorites, action.favorite] };
    case "REMOVE_FAVORITE":
      return { ...state, favorites: state.favorites.filter((f) => f.id !== action.id) };
    case "RENAME_FAVORITE":
      return {
        ...state,
        favorites: state.favorites.map((f) =>
          f.id === action.id ? { ...f, label: action.label } : f
        ),
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
      return { ...state, alerts: [...state.alerts, action.alert] };
    case "TOGGLE_ALERT":
      return {
        ...state,
        alerts: state.alerts.map((a) =>
          a.id === action.id ? { ...a, active: !a.active } : a
        ),
      };
    case "REMOVE_ALERT":
      return { ...state, alerts: state.alerts.filter((a) => a.id !== action.id) };
    default:
      return state;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(state.favorites));
    } catch (err) {
      console.warn("[AppContext] 즐겨찾기 저장 실패:", err);
    }
  }, [state.favorites]);

  useEffect(() => {
    try {
      localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(state.alerts));
    } catch (err) {
      console.warn("[AppContext] 알림 설정 저장 실패:", err);
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
