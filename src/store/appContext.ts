import { createContext, useContext } from "react";
import type { Favorite, AlertSetting } from "@/types";

/**
 * 컨텍스트 객체와 useApp 훅은 AppContext.tsx가 아니라 이 파일에 둡니다.
 * 컴포넌트 파일이 컴포넌트 외의 값을 함께 export하면 Vite의 Fast Refresh가
 * 해당 모듈 갱신 시 상태를 보존하지 못합니다(react-refresh/only-export-components).
 * AppContext.tsx는 AppProvider 컴포넌트만 export하도록 분리했습니다.
 */

export interface AppState {
  region: { sido: string; sigungu: string };
  favorites: Favorite[];
  cardBalance: number;
  alerts: AlertSetting[];
}

export type Action =
  | { type: "SET_REGION"; sido: string; sigungu: string }
  | { type: "ADD_FAVORITE"; favorite: Favorite }
  | { type: "REMOVE_FAVORITE"; id: string }
  | { type: "RENAME_FAVORITE"; id: string; label: string }
  | { type: "SYNC_FAVORITE_ROUTE_ID"; id: string; tagoRouteId: string }
  | { type: "SYNC_FAVORITE_NODE_ID"; id: string; tagoNodeId: string }
  | { type: "CHARGE_CARD"; amount: number }
  | { type: "PAY_CARD"; amount: number }
  | { type: "ADD_ALERT"; alert: AlertSetting }
  | { type: "TOGGLE_ALERT"; id: string }
  | { type: "REMOVE_ALERT"; id: string };

export interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
