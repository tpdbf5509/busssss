import { createContext, useContext, useReducer, useEffect, type ReactNode } from "react";
import type { Favorite, AlertSetting } from "@/types";
import { FAVORITES, ALERT_SETTINGS, CARD_INFO } from "@/data/mock";
import { fetchRoutesForStation } from "@/services/stationService";
import { fetchAllRoutes } from "@/services/routeService";
import { resolveDirections } from "@/services/busLocationService";

interface AppState {
  region: { sido: string; sigungu: string };
  favorites: Favorite[];
  cardBalance: number;
  alerts: AlertSetting[];
}

type Action =
  | { type: "SET_REGION"; sido: string; sigungu: string }
  | { type: "ADD_FAVORITE"; favorite: Favorite }
  | { type: "REMOVE_FAVORITE"; id: string }
  | { type: "RENAME_FAVORITE"; id: string; label: string }
  | { type: "SYNC_FAVORITE_ROUTE_ID"; id: string; tagoRouteId: string; appRouteId?: string }
  | { type: "CHARGE_CARD"; amount: number }
  | { type: "PAY_CARD"; amount: number }
  | { type: "ADD_ALERT"; alert: AlertSetting }
  | { type: "TOGGLE_ALERT"; id: string }
  | { type: "REMOVE_ALERT"; id: string };

const FAVORITES_STORAGE_KEY = "busssss_favorites_v1";
const ALERTS_STORAGE_KEY = "busssss_alerts_v1";

function loadFavorites(): Favorite[] {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return FAVORITES;
}

function loadAlerts(): AlertSetting[] {
  try {
    const raw = localStorage.getItem(ALERTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
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
      if (state.favorites.some((f) => f.refId === action.favorite.refId)) return state;
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
          f.id === action.id
              ? { ...f, tagoRouteId: action.tagoRouteId, ...(action.appRouteId ? { appRouteId: action.appRouteId } : {}) }
              : f
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

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
} | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(state.favorites));
    } catch {}
  }, [state.favorites]);

  useEffect(() => {
    try {
      localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(state.alerts));
    } catch {}
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

        for (const favorite of stopFavorites) {
          if (cancelled) return;

          const route = routeById.get(favorite.appRouteId!);
          if (!route) continue;

          const cacheKey = `${route.id}|${route.number}|${route.start}|${route.end}`;
          if (!directionResults.has(cacheKey)) {
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
          }

          const exactRouteId = directionResults.get(cacheKey);
          if (
            exactRouteId &&
            exactRouteId !== favorite.tagoRouteId
          ) {
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

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
