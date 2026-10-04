import type { Favorite } from "@/types";
import type { AppState, Action, StorageLoadError } from "@/store/appContext";

/**
 * 앱 상태 reducer.
 *
 * AppContext.tsx에 있던 것을 그대로 옮겼다. 그 파일은 불러오는 순간
 * localStorage를 읽고 서비스 모듈을 끌어와서, reducer만 따로 시험할 수
 * 없었다. 여기는 화면과 저장소에 닿지 않는 순수 함수만 둔다.
 */

/** 홈에 몇 줄만 보여줄 목록이라 이 이상 쌓아둘 이유가 없다. */
export const RECENT_ROUTES_LIMIT = 5;

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

/** pinned 필드를 뺀 즐겨찾기. 고정이 아닌 항목은 그대로 돌려줘 불필요한 변경을 만들지 않는다. */
function withoutPin(favorite: Favorite): Favorite {
  if (!favorite.pinned) return favorite;
  const next = { ...favorite };
  delete next.pinned;
  return next;
}

/**
 * "내 정류장" 고정 (DESIGN.md 7-3, 7-5).
 *
 * 히어로에는 한 번에 하나만 올라가므로 고정도 하나만 둔다. 새로 고정하면
 * 기존 고정은 풀린다. 남은 분과 정거장 수가 있는 stop_route만 히어로에
 * 오를 수 있어서, 다른 종류는 고정하지 않는다.
 *
 * 고정하지 않은 항목에는 pinned를 아예 두지 않는다(false로 채우지 않는다).
 * 저장값이 예전 형식(pinned 없음)과 같은 모양으로 남는다.
 */
function setFavoritePin(favorites: Favorite[], id: string, pinned: boolean): Favorite[] {
  const target = favorites.find((f) => f.id === id);
  if (!target) return favorites;

  if (!pinned) {
    if (!target.pinned) return favorites;
    return favorites.map((f) => (f.id === id ? withoutPin(f) : f));
  }

  if (target.type !== "stop_route") return favorites;
  return favorites.map((f) => (f.id === id ? { ...f, pinned: true } : withoutPin(f)));
}

export function reducer(state: AppState, action: Action): AppState {
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
      /* 고정한 즐겨찾기를 지워도 따로 할 일이 없다. 고정이 사라지면
         pickHeroFavorite가 첫 번째 stop_route로 돌아간다. */
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
    case "SET_FAVORITE_PIN": {
      const favorites = setFavoritePin(state.favorites, action.id, action.pinned);
      if (favorites === state.favorites) return state;
      return {
        ...state,
        favorites,
        storageError: clearStorageError(state.storageError, "favorites"),
      };
    }
    case "ADD_RECENT_ROUTE": {
      /* 같은 노선을 다시 열면 새 항목을 쌓지 않고 맨 앞으로 끌어올린다.
         그러지 않으면 자주 타는 노선 하나가 목록을 전부 차지한다. */
      const rest = state.recentRoutes.filter((r) => r.id !== action.route.id);
      return {
        ...state,
        recentRoutes: [
          { ...action.route, viewedAt: Date.now() },
          ...rest,
        ].slice(0, RECENT_ROUTES_LIMIT),
      };
    }
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
      // 배너만 숨긴다. 저장 잠금(favorites/alerts 플래그)은 그대로 둔다 —
      // 여기서 같이 풀면 직후에 도는 SYNC_FAVORITE_* 자동 보정만으로
      // 예시 데이터가 원래 저장값을 덮어쓴다.
      if (!state.storageError) return state;
      return { ...state, storageError: { ...state.storageError, dismissed: true } };
    default:
      return state;
  }
}
