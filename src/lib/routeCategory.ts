/**
 * 본선/분선 판정 한 곳.
 *
 * 이전에는 HomeScreen·BusScreen(3곳)·AlertScreen이 각각 조금씩 다르게 같은
 * 판정을 구현했고, 그중 하나(정류장 상세의 StationRouteCard)는 아예 다른
 * 데이터 소스(TAGO 원문 routeTp)를 보고 있어서 같은 노선이 화면마다 다른
 * 색으로 보였다. 판정 기준을 여기 하나로 모은다.
 *
 * 기준은 우리 DB(bus_routes_master.category)다. routeService.mapToRoute가
 * 그 값을 route.name 앞에 붙여("본선100", "분선103-2") 만들기 때문에,
 * route.name만 보면 카테고리를 알 수 있다.
 *
 * TAGO의 routetp("일반버스"/"간선버스" 계열)는 우리 본선/분선 체계와 다른
 * 분류라 여기서 쓰지 않는다.
 */

export type RouteCategory = "본선" | "분선";

export function getRouteCategory(routeName: string | undefined | null): RouteCategory {
  return (routeName ?? "").startsWith("분선") ? "분선" : "본선";
}

/** 배지 색 등 이분 분기용 단축 함수. 이름을 모르면 본선으로 본다(기존 기본값). */
export function isMainRoute(routeName: string | undefined | null): boolean {
  return getRouteCategory(routeName) === "본선";
}
