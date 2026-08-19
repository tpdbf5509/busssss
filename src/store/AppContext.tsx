import { createContext, useContext, useReducer, useEffect, type ReactNode } from "react";
import type { Favorite, AlertSetting } from "@/types";
import { FAVORITES, ALERT_SETTINGS, CARD_INFO } from "@/data/mock";

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

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}