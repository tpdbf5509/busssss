import { createContext, useContext } from "react";
import type { Favorite, AlertSetting } from "@/types";

/**
 * 컨텍스트 객체와 useApp 훅은 AppContext.tsx가 아니라 이 파일에 둡니다.
 * 컴포넌트 파일이 컴포넌트 외의 값을 함께 export하면 Vite의 Fast Refresh가
 * 해당 모듈 갱신 시 상태를 보존하지 못합니다(react-refresh/only-export-components).
 * AppContext.tsx는 AppProvider 컴포넌트만 export하도록 분리했습니다.
 */

/**
 * localStorage에서 저장된 데이터를 불러오지 못한 상황.
 *
 * 이때 화면에는 예시(mock) 데이터가 대신 뜨는데, 그 사실을 사용자가 모르면
 * 목록을 건드리는 순간 원래 저장돼 있던 내용이 예시 데이터로 덮어써진다.
 * 그래서 조용히 넘기지 않고 배너로 알린다(StorageErrorBanner).
 *
 * `dismissed`는 "배너를 닫았다"는 뜻일 뿐, 저장 잠금과는 무관하다. 둘을 같이
 * 묶으면 배너를 닫는 순간 저장이 재개되고, 그 직후 앱이 자동으로 도는
 * 즐겨찾기 보정(SYNC_FAVORITE_*)만으로도 예시 데이터가 원래 저장값을
 * 덮어쓴다 — 배너가 막으려던 사고를 배너 닫기가 여는 셈이었다.
 * 저장 재개는 오직 사용자가 직접 목록을 편집했을 때만 일어난다.
 */
export interface StorageLoadError {
  favorites: boolean;
  alerts: boolean;
  /** 사용자가 배너를 닫았는지 (저장 잠금 해제와는 무관) */
  dismissed: boolean;
}

/**
 * 최근에 열어 본 노선. 홈 화면 아래쪽 빈 공간을 채우는 용도라 화면에 필요한
 * 최소한만 담는다. 노선 정보 전체를 저장하면 저장값이 오래돼 실제 노선과
 * 어긋날 수 있으므로, 상세 화면 이동에 필요한 id와 표시용 값만 둔다.
 */
export interface RecentRoute {
  id: string;
  number: string;
  start: string;
  end: string;
  /** 마지막으로 연 시각(ms). 최신순 정렬과 오래된 항목 정리에 쓴다. */
  viewedAt: number;
}

export interface AppState {
  region: { sido: string; sigungu: string };
  favorites: Favorite[];
  recentRoutes: RecentRoute[];
  cardBalance: number;
  alerts: AlertSetting[];
  /** null이면 정상 로드됐거나 사용자가 안내를 확인한 상태 */
  storageError: StorageLoadError | null;
}

export type Action =
  | { type: "SET_REGION"; sido: string; sigungu: string }
  | { type: "ADD_FAVORITE"; favorite: Favorite }
  | { type: "REMOVE_FAVORITE"; id: string }
  | { type: "ADD_RECENT_ROUTE"; route: Omit<RecentRoute, "viewedAt"> }
  | { type: "RENAME_FAVORITE"; id: string; label: string }
  | { type: "SYNC_FAVORITE_ROUTE_ID"; id: string; tagoRouteId: string }
  | { type: "SYNC_FAVORITE_NODE_ID"; id: string; tagoNodeId: string }
  | { type: "CHARGE_CARD"; amount: number }
  | { type: "PAY_CARD"; amount: number }
  | { type: "ADD_ALERT"; alert: AlertSetting }
  | { type: "TOGGLE_ALERT"; id: string }
  | { type: "REMOVE_ALERT"; id: string }
  | { type: "DISMISS_STORAGE_ERROR" };

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
