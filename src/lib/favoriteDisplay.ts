import type { Favorite } from "@/types";
import type { Route } from "@/types/route";

/**
 * 홈 "다른 즐겨찾기" 행(DESIGN.md 7-5)의 이름과 둘째 줄.
 *
 * 즐겨찾기의 label은 만들 때 기본값이 들어가고, 마이 화면에서 사용자가
 * 바꿀 수 있다("집", "회사"). 기본값은 종류마다 다르다.
 * - stop_route: 노선 번호 (BusScreen에서 sr.routeNo / route.number)
 * - route: 노선 번호
 * - station: 정류장 번호(arsId), 번호가 없으면 "정류장"
 * label이 기본값과 다르면 사용자가 붙인 이름으로 보고 그 이름을 쓴다.
 * 예전에는 이 이름이 아랫줄 앞에 작게 붙어 있었는데, 7-5는 이름 자리에
 * 사용자가 붙인 이름을 쓰라고 한다.
 */

/** 사용자가 label을 바꿨는지. 기본값 그대로면 false. */
export function hasCustomLabel(fav: Favorite, routeNumber?: string): boolean {
  const label = fav.label?.trim();
  if (!label) return false;
  switch (fav.type) {
    case "stop_route":
    case "route":
      return label !== (fav.routeNumber ?? routeNumber ?? "").trim();
    case "station":
      // 정류장 번호(숫자)와 "정류장"은 만들 때 들어간 기본값이다.
      return label !== "정류장" && !/^\d+$/.test(label);
    default:
      return false;
  }
}

/** 행의 이름(가운데 위). */
export function favoriteTitle(fav: Favorite, routeNumber?: string): string {
  if (hasCustomLabel(fav, routeNumber)) return fav.label.trim();
  switch (fav.type) {
    case "stop_route":
      return fav.stopName ?? fav.name;
    case "route":
      return routeNumber ? `${routeNumber}번` : fav.name;
    default:
      return fav.name;
  }
}

/**
 * 행의 둘째 줄(가운데 아래). 노선은 "{종점} 방면"이다.
 * 정류장 즐겨찾기는 방면이 없어서, 이름 자리에 사용자 이름이 들어갔으면
 * 실제 정류장 이름을, 아니면 종류("정류장")를 쓴다.
 */
export function favoriteSubtitle(fav: Favorite, route?: Route, routeNumber?: string): string {
  if (fav.type === "station") {
    return hasCustomLabel(fav, routeNumber) ? fav.name : "정류장";
  }
  return route?.end ? `${route.end} 방면` : "";
}
