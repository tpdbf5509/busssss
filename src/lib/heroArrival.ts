import type { Favorite } from "@/types";
import type { ArrivalInfo } from "@/services/arrivalService";
import {
  reliabilityChipKind,
  type ReliabilityChipKind,
  type ReliabilityState,
} from "@/lib/reliability";

/**
 * 홈 히어로 카드(DESIGN.md 7-3)에 필요한 순수 계산을 모아 둔다.
 * 화면 코드에서 분기하면 6가지 상태가 여러 곳에 흩어져 서로 어긋나기 쉽다.
 */

/**
 * 히어로에 올릴 즐겨찾기를 고른다.
 *
 * 남은 분과 정거장 수가 있는 종류는 정류장+노선(stop_route)뿐이라 이것만
 * 올라올 수 있다. 사용자가 고정한 즐겨찾기를 먼저 고르는 규칙은 고정 저장
 * UI와 함께 2단계에서 붙인다. 지금은 목록에서 첫 번째 stop_route다.
 */
export function pickHeroFavorite(favorites: Favorite[]): Favorite | null {
  return favorites.find((f) => f.type === "stop_route") ?? null;
}

/**
 * 히어로의 상태.
 * - loading: 불러오는 중 (데이터 없음)
 * - normal: 보통. 지연 의심도 화면 모양은 보통과 같고 칩만 다르다
 * - arriving: 곧 도착
 * - stopsOnly: 시간 불확실 (시간은 못 믿고 정거장 수만 있음)
 * - error: 정보 없음
 */
export type HeroState = "loading" | "normal" | "arriving" | "stopsOnly" | "error";

export interface HeroArrivalView {
  state: HeroState;
  minutes: number | null;
  /** normal에서 null이면 "시간은 있는데 정거장 수가 없는" 경우다. */
  stopsAway: number | null;
  chip: ReliabilityChipKind | null;
}

type FetchStatus = "idle" | "loading" | "success" | "error";

/**
 * useArrivalInfo의 결과를 7-3 표의 상태로 바꾼다.
 *
 * 판단 순서가 중요하다. 곧 도착을 시간 불확실보다 먼저 본다 — 시간을 못
 * 믿어도 GPS로 확인한 정거장 수가 0이면 버스는 코앞이다.
 */
export function heroArrivalView(
  data: ArrivalInfo | null,
  status: FetchStatus,
  reliability: ReliabilityState,
): HeroArrivalView {
  if (!data) {
    // 조회 전(idle)도 스켈레톤으로 둔다. 노선 목록을 받기 전에는 조회를
    // 시작하지 않는데(HomeScreen의 routesLoaded), 그 사이에도 카드 자리는
    // 바로 보여야 한다.
    return {
      state: status === "error" ? "error" : "loading",
      minutes: null,
      stopsAway: null,
      chip: null,
    };
  }

  const { minutes, stopsAway } = data;

  // 시간도 정거장 수도 없으면 보여 줄 값이 하나도 없다. arrivalService는
  // 이런 값을 만들지 않지만, 만약 오면 "정보 없음"이 정직하다.
  if (minutes == null && stopsAway == null) {
    return { state: "error", minutes: null, stopsAway: null, chip: null };
  }

  const state: HeroState =
    (minutes != null && minutes <= 0) || (stopsAway != null && stopsAway <= 0)
      ? "arriving"
      : minutes == null
        ? "stopsOnly"
        : "normal";

  // 지연 의심이 가장 먼저다. 그다음, 시간을 못 믿는 값(minutes === null)은
  // 신뢰도 추적 결과와 상관없이 "확인 중"이다. 처음 받은 값부터 시간이
  // 없으면 추적기는 unknown을 돌려줘 칩이 사라지기 때문이다.
  const chip: ReliabilityChipKind | null = reliability.delayed
    ? "delay"
    : minutes == null
      ? "pending"
      : reliabilityChipKind(reliability);

  return { state, minutes, stopsAway, chip };
}

/** 미니 노선도에 그리는 칸 수. 핀까지 최대 5정거장을 그린다. */
export const MINI_ROUTE_CELLS = 5;

export type MiniRouteBus =
  /** 노드 위치. 0이 왼쪽 끝, MINI_ROUTE_CELLS가 내 정류장(핀)이다. */
  | { kind: "cell"; index: number }
  /** stopsAway가 0 이하 — 핀 바로 왼쪽에 붙인다. */
  | { kind: "atPin" };

export interface MiniRouteLayout {
  /** null이면 정거장 수를 몰라 마커를 그리지 않는다. */
  bus: MiniRouteBus | null;
  /** 5칸 밖에 남은 정거장 수("+N"). 없으면 0. */
  overflow: number;
}

/**
 * 남은 정거장 수를 미니 노선도의 버스 위치로 바꾼다(DESIGN.md 7-4).
 * 추가 조회 없이 stopsAway 하나로만 그린다. 위치는 stopsAway를 그대로
 * 따른다 — 분이 0 이하여도 stopsAway가 3이면 3칸 위치다.
 */
export function miniRouteLayout(stopsAway: number | null): MiniRouteLayout {
  if (stopsAway == null || Number.isNaN(stopsAway)) return { bus: null, overflow: 0 };

  // formatArrivalText와 같은 반올림. 실제 값은 이미 정수로 온다.
  const stops = Math.round(stopsAway);
  if (stops <= 0) return { bus: { kind: "atPin" }, overflow: 0 };

  if (stops > MINI_ROUTE_CELLS) {
    return { bus: { kind: "cell", index: 0 }, overflow: stops - MINI_ROUTE_CELLS };
  }
  return { bus: { kind: "cell", index: MINI_ROUTE_CELLS - stops }, overflow: 0 };
}

/**
 * 갱신 시각 문구.
 *
 * receivedAt은 "값이 바뀐 때"가 아니라 "새 응답을 받은 때"다. 같은 값이
 * 다시 와도 갱신된 것이다. 1분 미만은 "방금", 그 뒤는 내림한 분이다.
 */
export function updatedLabel(receivedAt: number | null, now: number, refreshing: boolean): string {
  if (refreshing) return "갱신 중";
  if (receivedAt == null) return "";
  const elapsedMin = Math.floor(Math.max(0, now - receivedAt) / 60_000);
  return elapsedMin < 1 ? "방금 갱신" : `${elapsedMin}분 전 갱신`;
}
