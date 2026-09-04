import { useState, useMemo, useEffect, useRef } from "react";
import { Search, X, Star, ArrowLeft, Bus as BusIcon, Navigation, Clock, Calendar, ChevronDown } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { useBusLocations } from "@/hooks/useBusLocations";
import { useApp } from "@/store/appContext";
import { fetchAllRoutes, fetchStopsForRoute, fetchRoutesForStop } from "@/services/routeService";
import { fetchBisTimeInfo, type BisTimeInfo } from "@/api/jeonjuBis";
import type { Route, BusStop } from "@/types/route";
import type { Favorite } from "@/types";
import { LoadingSkeleton, ErrorState, EmptyState, ReliabilityTag } from "@/components/ui";
import type { ReliabilityState } from "@/lib/reliability";
import { showToast } from "@/lib/toastStore";
import type { Station } from "@/types/route";
import { MapPin } from "lucide-react";
import { resolveRouteId } from "@/services/arrivalService";
import { searchStations, fetchRoutesForStation, stripCityPrefix, type StationRoute } from "@/services/stationService";
import { parseInterval, parseTimeToMinutes } from "@/lib/interval";
import { getRouteCategory, isMainRoute } from "@/lib/routeCategory";
import { normalizeStopName } from "@/lib/stopPosition";


export function BusScreen({
  initialRouteId,
  onConsumeInitialRoute,
  initialStation,
  onConsumeInitialStation,
}: {
  initialRouteId?: string;
  onConsumeInitialRoute?: () => void;
  initialStation?: { id: string; name: string; arsId?: string };
  onConsumeInitialStation?: () => void;
} = {}) {
  const [query, setQuery] = useState("");
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const { state, dispatch } = useApp();
  

  const [stations, setStations] = useState<Station[]>([]);
  const [stationStatus, setStationStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [searchTab, setSearchTab] = useState<"route" | "station">("route");

  const { data: routes, status, retry } = useAsync(() => fetchAllRoutes(), []);

  // onConsumeInitialRoute/onConsumeInitialStation은 App.tsx에서 매 렌더마다 새로
  // 만들어지는 인라인 함수라, 이걸 그대로 deps에 넣으면 부모가 리렌더될 때마다
  // (예: 검색어 입력) 이 effect가 다시 실행돼 사용자가 고른 노선/정류장을 되돌려버린다.
  // ref로 최신 콜백만 붙잡아서 deps 경고 없이 안전하게 최신 함수를 호출한다.
  const onConsumeInitialRouteRef = useRef(onConsumeInitialRoute);
  onConsumeInitialRouteRef.current = onConsumeInitialRoute;
  const onConsumeInitialStationRef = useRef(onConsumeInitialStation);
  onConsumeInitialStationRef.current = onConsumeInitialStation;

  /* 최근 본 노선 기록.
     setSelectedRoute를 부르는 곳이 검색 결과 클릭, 정류장 상세에서 노선
     선택, 홈 딥링크로 흩어져 있어서, 호출 지점마다 dispatch를 넣으면 새
     경로가 생길 때 빠뜨리기 쉽다. 선택된 노선이 바뀌는 순간을 한 곳에서
     보고 기록한다. */
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  useEffect(() => {
    if (!selectedRoute) return;
    dispatchRef.current({
      type: "ADD_RECENT_ROUTE",
      route: {
        id: selectedRoute.id,
        number: selectedRoute.number,
        start: selectedRoute.start ?? "",
        end: selectedRoute.end ?? "",
      },
    });
  }, [selectedRoute]);

  useEffect(() => {
    if (!initialRouteId || !routes) return;
    const target = routes.find((r) => r.id === initialRouteId);
    if (target) {
      setSelectedRoute(target);
    }
    onConsumeInitialRouteRef.current?.();
  }, [initialRouteId, routes]);
    // 홈 정류장 즐겨찾기 → 정류장 상세로 바로 이동
    useEffect(() => {
      if (!initialStation?.id) return;
      setSearchTab("station");
      setSelectedRoute(null);
      setSelectedStation({
        id: initialStation.id,
        name: initialStation.name,
        arsId: initialStation.arsId ?? "",
        lat: null,
        lng: null,
      });
      onConsumeInitialStationRef.current?.();
    }, [initialStation]);
    // 검색어로 정류장 검색
    useEffect(() => {
      const q = query.trim();
      if (!q) {
        setStations([]);
        setStationStatus("idle");
        return;
      }
      let cancelled = false;
      setStationStatus("loading");
      const t = setTimeout(() => {
        searchStations(q)
          .then((list) => {
            if (cancelled) return;
            setStations(list);
            setStationStatus("success");
          })
          .catch(() => {
            if (cancelled) return;
            setStations([]);
            setStationStatus("error");
          });
      }, 300);
      return () => {
        cancelled = true;
        clearTimeout(t);
      };
    }, [query]);

  const filtered = routes?.filter(
    (r) =>
      (r.name ?? "").includes(query) ||
      (r.number ?? "").includes(query) ||
      (r.start ?? "").includes(query) ||
      (r.end ?? "").includes(query)
  );
  const isFavorited = (routeId: string) =>
    state.favorites.some((f) => f.type === "route" && f.refId === routeId);

  const toggleFavorite = (route: Route, e: React.MouseEvent) => {
    e.stopPropagation();
    const existing = state.favorites.find(
      (f) => f.type === "route" && f.refId === route.id
    );
    if (existing) {
      dispatch({ type: "REMOVE_FAVORITE", id: existing.id });
      showToast("즐겨찾기에서 삭제했어요");
    } else {
      const favorite: Favorite = {
        id: `fav-route-${route.id}`,
        type: "route",
        name: `${route.number}번`,
        label: route.number,
        refId: route.id,
      };
      dispatch({ type: "ADD_FAVORITE", favorite });
      showToast("즐겨찾기에 추가했어요");
    }
  };
  const isStationFavorited = (stationId: string) =>
  state.favorites.some((f) => f.type === "station" && f.refId === stationId);

const toggleStationFavorite = (station: Station, e: React.MouseEvent) => {
  e.stopPropagation();
  const existing = state.favorites.find(
    (f) => f.type === "station" && f.refId === station.id
  );
  if (existing) {
    dispatch({ type: "REMOVE_FAVORITE", id: existing.id });
    showToast("즐겨찾기에서 삭제했어요");
  } else {
    const favorite: Favorite = {
      id: `fav-station-${station.id}`,
      type: "station",
      name: station.name,
      label: station.arsId || "정류장",
      refId: station.id,
    };
    dispatch({ type: "ADD_FAVORITE", favorite });
    showToast("즐겨찾기에 추가했어요");
  }
};

  if (selectedRoute) {
    return <RouteDetail route={selectedRoute} onBack={() => setSelectedRoute(null)} />;
  }

  if (selectedStation) {
    return (
      <StationDetail
        station={selectedStation}
        onBack={() => setSelectedStation(null)}
        onSelectRoute={(route) => setSelectedRoute(route)}
      />
    );
  }
  return (
    <div className="h-full flex flex-col overflow-hidden bg-canvas">
            <header className="bg-white px-5 pt-safe-16 pb-5 border-b border-slate-100 sticky top-0 z-30 shrink-0">
              <h1 className="text-xl font-bold text-slate-900 mb-3">버스 검색</h1>

              <div className="flex bg-canvas rounded-xl p-1 mb-3">
                <button
                  onClick={() => {
                    setSearchTab("route");
                    setQuery("");
                  }}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    searchTab === "route"
                      ? "bg-surface text-brand border border-line"
                      : "text-muted"
                  }`}
                >
                  노선
                </button>
                <button
                  onClick={() => {
                    setSearchTab("station");
                    setQuery("");
                  }}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    searchTab === "station"
                      ? "bg-surface text-brand border border-line"
                      : "text-muted"
                  }`}
                >
                  정류장
                </button>
              </div>

              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    searchTab === "route"
                      ? "노선번호 또는 기점·종점명"
                      : "정류장명 (예: 전주역, 시청)"
                  }
                  className="w-full pl-10 pr-10 py-3 bg-slate-100 rounded-2xl text-base text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2"
                  >
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                )}
              </div>
              {searchTab === "route" && status === "loading" && (
                <p className="text-[11px] text-slate-400 mt-2">
                  전주시 노선 데이터를 불러오는 중이에요. 노선이 많아 시간이 걸릴 수 있어요.
                </p>
              )}
            </header>

            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        {searchTab === "route" && (
          <>
            {status === "loading" && (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <LoadingSkeleton key={i} className="h-[66px] w-full" />
                ))}
              </div>
            )}
            {status === "error" && <ErrorState onRetry={retry} />}
            {status === "success" && filtered && filtered.length === 0 && (
              <EmptyState
                icon={BusIcon}
                title="검색 결과가 없어요"
                subtitle="다른 노선번호나 기점·종점으로 검색해 보세요"
              />
            )}
            {status === "success" && filtered && filtered.length > 0 && (
              <div className="space-y-2">
                {filtered.map((route) => (
                  <div
                    key={`${route.id}-${route.number}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedRoute(route)}
                    onKeyDown={(e) => e.key === "Enter" && setSelectedRoute(route)}
                    className="w-full bg-surface rounded-2xl px-3.5 py-3 border border-line text-left hover:border-brand/40 transition-colors cursor-pointer flex items-center gap-3"
                  >
                    {/* 검색 결과는 여러 노선을 스크롤하며 비교하는 화면이라
                        한 항목이 차지하는 높이가 중요하다. 배지를 왼쪽으로
                        빼고 번호를 배지 안에 넣어 3단 스택을 2단으로 줄였다. */}
                    {(() => {
                      const label = getRouteCategory(route.name);
                      const isMain = label === "본선";
                      return (
                        <div
                          className={`min-w-[56px] py-1.5 px-2 rounded-xl flex flex-col items-center justify-center shrink-0 ${
                            isMain ? "bg-blue-500" : "bg-emerald-500"
                          }`}
                        >
                          <span className="font-bold text-base leading-none tracking-tight text-white truncate max-w-full">
                            {route.number}
                          </span>
                          <span className="text-[10px] leading-none mt-1 text-white opacity-80">
                            {label}
                          </span>
                        </div>
                      );
                    })()}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-sm min-w-0">
                        <span className="font-semibold text-ink truncate">
                          {route.start || "기점 정보 없음"}
                        </span>
                        <span className="text-faint shrink-0">→</span>
                        <span className="font-semibold text-ink truncate">
                          {route.end || "종점 정보 없음"}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted truncate">
                        첫차 {route.firstBus} · 막차 {route.lastBus} · 배차{" "}
                        {route.interval}
                      </p>
                    </div>

                    <button
                      onClick={(e) => toggleFavorite(route, e)}
                      className="p-1 -m-1 rounded-full hover:bg-amber-50 shrink-0"
                    >
                      <Star
                        className={`w-4 h-4 transition-colors ${
                          isFavorited(route.id)
                            ? "text-amber-400 fill-amber-400"
                            : "text-faint hover:text-amber-400"
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {searchTab === "station" && (
          <>
            {!query.trim() && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <MapPin className="w-10 h-10 text-slate-300 mb-3" />
                <p className="text-sm text-slate-400">정류장 이름을 검색해 보세요</p>
                <p className="text-xs text-slate-300 mt-1">전주시 버스 정류장</p>
              </div>
            )}
            {query.trim() && stationStatus === "loading" && (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <LoadingSkeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            )}
            {query.trim() && stationStatus === "error" && (
              <p className="text-sm text-red-500 text-center py-8">
                정류장 검색에 실패했어요
              </p>
            )}
            {query.trim() && stationStatus === "success" && stations.length === 0 && (
              <EmptyState
                icon={MapPin}
                title="검색 결과가 없어요"
                subtitle="다른 정류장명으로 검색해 보세요"
              />
            )}
            {query.trim() && stationStatus === "success" && stations.length > 0 && (
              <div className="space-y-2">
                {stations.map((station) => (
                  <div
                    key={station.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedStation(station)}
                    onKeyDown={(e) => e.key === "Enter" && setSelectedStation(station)}
                    className="w-full bg-surface rounded-2xl px-3.5 py-3 border border-line flex items-center gap-3 cursor-pointer hover:border-brand/40 transition-colors"
                  >
                    <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                      <MapPin className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {station.name}
                      </p>
                      {station.arsId && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          정류장번호 {station.arsId}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={(e) => toggleStationFavorite(station, e)}
                      className="p-1.5 rounded-full hover:bg-amber-50"
                    >
                      <Star
                        className={`w-4 h-4 transition-colors ${
                          isStationFavorited(station.id)
                            ? "text-amber-400 fill-amber-400"
                            : "text-slate-300 hover:text-amber-400"
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** B1. 정류장 도착 노선 카드 — hero(임박한 1~2개)는 크게, 나머지는 압축된 형태로 재사용합니다. */
function StationRouteCard({
  sr,
  hero = false,
  isFavorited,
  isAdding,
  onSelect,
  onToggleFavorite,
}: {
  sr: StationRoute;
  hero?: boolean;
  isFavorited: boolean;
  isAdding: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}) {
  const minutes = sr.arrtime != null ? Math.max(0, Math.round(sr.arrtime / 60)) : null;
  // 이 목록은 화면을 열 때마다 새로 조회하는 단일 스냅샷이라 지연 추적은 하지 않고,
  // 값이 있으면 항상 "실시간"으로 표시합니다(A1).
  const reliability: ReliabilityState =
    minutes != null ? { source: "realtime", delayed: false } : { source: "unknown", delayed: false };
  const isMain = sr.category === "본선";

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={isAdding}
      className={`w-full bg-surface rounded-2xl border border-line text-left hover:border-brand/40 transition-colors flex items-center gap-3 ${
        hero ? "p-5" : "p-3"
      }`}
    >
      <div
        className={`relative rounded-xl flex items-center justify-center shrink-0 ${
          isMain ? "bg-blue-500" : "bg-emerald-500"
        } ${hero ? "w-14 h-14" : "w-10 h-10"}`}
      >
        <span className={`font-bold text-white ${hero ? "text-base" : "text-xs"}`}>
          {sr.routeNo}
        </span>
        {isFavorited && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-400 flex items-center justify-center ring-2 ring-white">
            <Star className="w-2.5 h-2.5 text-white fill-white" />
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-slate-800 ${hero ? "text-base" : "text-sm"}`}>
          {sr.routeNo}번
          {sr.routeTp ? (
            <span className="text-xs font-normal text-slate-400 ml-1.5">{sr.routeTp}</span>
          ) : null}
        </p>

        <div className="mt-0.5 flex items-baseline gap-1.5">
          <p className={hero ? "text-2xl font-bold text-blue-600" : "text-xs font-semibold text-slate-500"}>
            {minutes == null ? "도착정보 없음" : minutes <= 0 ? "곧 도착" : `${minutes}분${hero ? " 후" : ""}`}
          </p>
          {minutes != null && sr.arrprevstationcnt != null && (
            <span className="text-xs text-slate-400">
              {hero ? "" : "· "}
              {sr.arrprevstationcnt}정거장 전
            </span>
          )}
        </div>

        {minutes != null && (
          <div className="mt-1">
            <ReliabilityTag reliability={reliability} />
          </div>
        )}
      </div>

      {isAdding ? (
        <span className="w-4 h-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin shrink-0" />
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className="p-1 -m-1 shrink-0 rounded-full hover:bg-slate-50"
          aria-label={isFavorited ? "즐겨찾기 해제" : "즐겨찾기 추가"}
        >
          <Star
            className={`w-4 h-4 transition-colors ${
              isFavorited ? "text-amber-400 fill-amber-400" : "text-slate-300"
            }`}
          />
        </button>
      )}
    </button>
  );
}

function StationDetail({
  station,
  onBack,
  onSelectRoute,
}: {
  station: Station;
  onBack: () => void;
  onSelectRoute: (route: Route) => void;
}) {
  const { state, dispatch } = useApp();

  const [routes, setRoutes] = useState<StationRoute[]>([]);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [addingRouteNo, setAddingRouteNo] = useState<string | null>(null);

  const { data: allRoutes } = useAsync(() => fetchAllRoutes(), []);

  const [detailTab, setDetailTab] = useState<"arrival" | "all">("arrival");
  const [showMoreRoutes, setShowMoreRoutes] = useState(false);
  const [allViaRoutes, setAllViaRoutes] = useState<Route[]>([]);
  const [allStatus, setAllStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");

  // 실시간 도착 노선 불러오기
  useEffect(() => {
    let cancelled = false;

    setStatus("loading");

    fetchRoutesForStation(station.id)
      .then((list) => {
        if (cancelled) return;

        setRoutes(list);
        setStatus("success");
      })
      .catch(() => {
        if (cancelled) return;

        setRoutes([]);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [station.id]);

  // 전체 경유노선 불러오기
  //
  // 예전에는 노선 454개를 하나씩 순서대로(await) 조회하면서 정류장 이름이
  // 일치하는지 확인했다 - 정류장 하나 보려고 수백 번 API를 순차 호출하는
  // 셈이라 느렸고, 정류장명만 비교하다 보니 같은 이름의 다른 위치 정류장과
  // 섞일 위험도 있었다. 정류장(node_id) 기준으로 노선-정류장 관계를 한 번에
  // 조회하면 두 문제가 한 번에 해결된다.
  useEffect(() => {
    if (detailTab !== "all") return;

    let cancelled = false;

    setAllStatus("loading");

    const jeonjuNodeId = station.id.replace(/^[A-Za-z]+/, "");

    fetchRoutesForStop(jeonjuNodeId)
      .then((matched) => {
        if (cancelled) return;
        setAllViaRoutes(matched);
        setAllStatus("success");
      })
      .catch(() => {
        if (!cancelled) setAllStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [detailTab, station.id]);

  // 실시간 노선 즐겨찾기 여부.
  //
  // 노선 "번호"로 비교하면 안 된다. 같은 번호를 여러 방향이 공유하기 때문에
  // (운영 DB 기준 "85"번 11개, "48"·"84"번 각 10개), 한 정류장을 양방향이
  // 지나가면 반대 방향 즐겨찾기가 서로를 같은 것으로 인식한다.
  // sr.routeId는 방향별로 고유하므로(stationService가 `JUB${route.id}`로 생성)
  // 그것으로 비교한다.
  const isArrivalFavorited = (sr: StationRoute) =>
    state.favorites.some(
      (f) =>
        f.type === "stop_route" &&
        f.tagoRouteId === sr.routeId &&
        f.stopName === station.name
    );

// 전체 경유노선 즐겨찾기 여부
const isAllRouteFavorited = (route: Route) =>
  state.favorites.some(
    (f) =>
      f.type === "stop_route" &&
      f.appRouteId === route.id &&
      f.stopName === station.name
  );

  // 실시간 노선 즐겨찾기
  const handleRouteClick = async (sr: StationRoute) => {
    // 중복 판정도 번호가 아니라 방향별 고유 ID로 한다. 번호로 비교하면
    // 반대 방향을 추가하려 할 때 기존 즐겨찾기를 "이미 있다"고 보고 지워버린다.
    const existing = state.favorites.find(
      (f) =>
        f.type === "stop_route" &&
        f.tagoRouteId === sr.routeId &&
        f.stopName === station.name
    );

    if (existing) {
      dispatch({
        type: "REMOVE_FAVORITE",
        id: existing.id,
      });

      showToast("즐겨찾기에서 삭제했어요");
      return;
    }

    setAddingRouteNo(sr.routeNo);

    try {
      // 번호로 찾으면 같은 번호의 다른 방향이 먼저 걸릴 수 있다.
      // sr.routeId는 stationService가 우리 route.id로 만든 값(`JUB${id}`)이라
      // 접두사만 떼면 방향까지 정확한 노선을 바로 집을 수 있다.
      const appRouteId = stripCityPrefix(sr.routeId);
      const appRoute =
        allRoutes?.find((r) => r.id === appRouteId) ??
        // 혹시 목록에 없으면(캐시 시점 차이 등) 기존처럼 번호로 폴백
        allRoutes?.find((r) => r.number === sr.routeNo || r.rawNumber === sr.routeNo);

      dispatch({
        type: "ADD_FAVORITE",
        favorite: {
          id: `fav-stop-${station.id}-${sr.routeId}`,
          type: "stop_route",
          name: station.name,
          label: sr.routeNo,
          refId: `${station.id}-${sr.routeId}`,
          tagoNodeId: station.id,
          tagoRouteId: sr.routeId,
          appRouteId: appRoute?.id,
          stopName: station.name,
          routeNumber: sr.routeNo,
        },
      });

      showToast("즐겨찾기에 추가했어요");
    } catch {
      showToast("즐겨찾기 추가에 실패했어요");
    } finally {
      setAddingRouteNo(null);
    }
  };

  // 전체 경유노선 즐겨찾기
  const handleAllRouteClick = async (route: Route) => {
    const existing = state.favorites.find(
      (f) =>
        f.type === "stop_route" &&
        f.appRouteId === route.id &&
        f.stopName === station.name
    );

    if (existing) {
      dispatch({
        type: "REMOVE_FAVORITE",
        id: existing.id,
      });

      showToast("즐겨찾기에서 삭제했어요");
      return;
    }

    setAddingRouteNo(route.number);

    try {
      const tagoRouteId = await resolveRouteId(route);

      if (!tagoRouteId) {
        showToast("이 노선은 아직 실시간 도착정보를 지원하지 않아요");
        return;
      }

      dispatch({
        type: "ADD_FAVORITE",
        favorite: {
          id: `fav-stop-${station.id}-${tagoRouteId}`,
          type: "stop_route",
          name: station.name,
          label: route.number,
          refId: `${station.id}-${tagoRouteId}`,
          tagoNodeId: station.id,
          tagoRouteId,
          appRouteId: route.id,
          stopName: station.name,
          routeNumber: route.number,
        },
      });

      showToast("즐겨찾기에 추가했어요");
    } catch {
      showToast("즐겨찾기 추가에 실패했어요");
    } finally {
      setAddingRouteNo(null);
    }
  };

  // B1. 차분한 인터페이스: 지금 임박한 버스 1~2개만 크게 강조하고 나머지는 접어둡니다.
  // 즐겨찾기 여부가 아니라 "지금 이 순간 가장 급한 버스"를 최우선으로 정렬합니다.
  const sortedRoutes = useMemo(() => {
    return [...routes].sort((a, b) => {
      const aKey = a.arrtime ?? Infinity;
      const bKey = b.arrtime ?? Infinity;
      if (aKey !== bKey) return aKey - bKey;
      return (a.arrprevstationcnt ?? Infinity) - (b.arrprevstationcnt ?? Infinity);
    });
  }, [routes]);

  const HERO_COUNT = 2;
  // "실시간 도착" 탭은 지금 실제로 다가오고 있는 버스만 보여주는 탭이다.
  // 정류장을 지나는 노선 전체 목록은 "전체 경유노선" 탭의 몫이므로,
  // 여기서는 도착정보가 있는 노선만 남긴다.
  const routesWithInfo = sortedRoutes.filter((r) => r.arrtime != null);
  const heroRoutes = routesWithInfo.slice(0, HERO_COUNT);
  const restRoutes = routesWithInfo.slice(HERO_COUNT);

  return (
    <div className="bg-slate-50">
      <header className="bg-white px-4 pt-safe-14 pb-5 border-b border-slate-100 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 -ml-1.5 rounded-full hover:bg-slate-100"
          >
            <ArrowLeft className="w-5 h-5 text-slate-700" />
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-slate-900 truncate">
              {station.name}
            </h1>

            {station.arsId && (
              <p className="text-xs text-slate-400 mt-0.5">
                정류장번호 {station.arsId}
              </p>
            )}
          </div>
        </div>
      </header>

      {/* 탭 */}
      <div className="px-4 pt-3">
        <div className="flex bg-canvas rounded-xl p-1">
          <button
            onClick={() => setDetailTab("arrival")}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              detailTab === "arrival"
                ? "bg-surface text-brand border border-line"
                : "text-muted"
            }`}
          >
            실시간 도착
          </button>

          <button
            onClick={() => setDetailTab("all")}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              detailTab === "all"
                ? "bg-surface text-brand border border-line"
                : "text-muted"
            }`}
          >
            전체 경유노선
          </button>
        </div>
      </div>

      <div className="px-4 py-4">

        {/* ========================= */}
        {/* 실시간 도착 탭 */}
        {/* ========================= */}

        {detailTab === "arrival" && (
          <>
            <p className="text-xs text-slate-400 mb-3">
              이 정류장을 경유하는 노선
            </p>

            {status === "loading" && (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <LoadingSkeleton
                    key={i}
                    className="h-16 w-full"
                  />
                ))}
              </div>
            )}

            {status === "error" && (
              <p className="text-sm text-red-500 text-center py-8">
                노선 정보를 불러오지 못했어요
              </p>
            )}

            {status === "success" && routesWithInfo.length === 0 && (
              <EmptyState
                icon={BusIcon}
                title="지금 도착 예정인 버스가 없어요"
                subtitle="배차 간격이 길거나 운행 시간이 아닐 수 있어요"
              />
            )}

            {status === "success" && routesWithInfo.length > 0 && (
              <div className="space-y-2">
                {heroRoutes.length > 0 && (
                  <>
                    <p className="text-[11px] font-semibold text-blue-600 mb-1">
                      지금 타야 할 버스
                    </p>
                    <div className="space-y-2.5 mb-5">
                      {heroRoutes.map((sr) => (
                        <StationRouteCard
                          key={sr.routeId}
                          sr={sr}
                          hero
                          isFavorited={isArrivalFavorited(sr)}
                          isAdding={addingRouteNo === sr.routeNo}
                          onSelect={() => {
                            const appRoute = allRoutes?.find(
                              (r) => r.number === sr.routeNo || r.rawNumber === sr.routeNo
                            );
                            if (appRoute) onSelectRoute(appRoute);
                            else showToast("노선 정보를 찾을 수 없어요");
                          }}
                          onToggleFavorite={() => handleRouteClick(sr)}
                        />
                      ))}
                    </div>
                  </>
                )}

                {restRoutes.length > 0 && heroRoutes.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowMoreRoutes((v) => !v)}
                    className="w-full flex items-center justify-center gap-1 py-2.5 text-xs font-medium text-slate-400 hover:text-slate-600"
                  >
                    {showMoreRoutes ? "접기" : `다른 노선 보기 (${restRoutes.length})`}
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform ${showMoreRoutes ? "rotate-180" : ""}`}
                    />
                  </button>
                )}

                {(showMoreRoutes || heroRoutes.length === 0) && (
                  <div className="space-y-1.5">
                    {restRoutes.map((sr) => (
                      <StationRouteCard
                        key={sr.routeId}
                        sr={sr}
                        isFavorited={isArrivalFavorited(sr)}
                        isAdding={addingRouteNo === sr.routeNo}
                        onSelect={() => {
                          const appRoute = allRoutes?.find(
                            (r) => r.number === sr.routeNo || r.rawNumber === sr.routeNo
                          );
                          if (appRoute) onSelectRoute(appRoute);
                          else showToast("노선 정보를 찾을 수 없어요");
                        }}
                        onToggleFavorite={() => handleRouteClick(sr)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ========================= */}
        {/* 전체 경유노선 탭 */}
        {/* ========================= */}

        {detailTab === "all" && (
          <>
            <p className="text-xs text-slate-400 mb-3">
              이 정류장을 경유하는 모든 노선
            </p>

            {allStatus === "loading" && (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <LoadingSkeleton
                    key={i}
                    className="h-16 w-full"
                  />
                ))}
              </div>
            )}

            {allStatus === "error" && (
              <p className="text-sm text-red-500 text-center py-8">
                경유 노선을 불러오지 못했어요
              </p>
            )}

            {allStatus === "success" &&
              allViaRoutes.length === 0 && (
                <EmptyState
                  icon={BusIcon}
                  title="경유 노선이 없어요"
                  subtitle="정류장 이름이 일치하는 노선이 없습니다"
                />
              )}

            {allStatus === "success" &&
              allViaRoutes.length > 0 && (
                <div className="space-y-2">
                  {allViaRoutes.map((route) => {
                    const isMain = isMainRoute(route.name);
                    return (
                    <div
                      key={route.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectRoute(route)}
                      onKeyDown={(e) => e.key === "Enter" && onSelectRoute(route)}
                      className="w-full bg-surface rounded-2xl px-3.5 py-3 border border-line text-left hover:border-brand/40 transition-colors flex items-center gap-3 cursor-pointer"
                    >
                      <div
                        className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                          isMain ? "bg-blue-500" : "bg-emerald-500"
                        }`}
                      >
                        <span className="font-bold text-sm text-white">
                          {route.number}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800">
                          {route.number}번
                        </p>

                        <p className="text-xs text-slate-400 mt-0.5 truncate">
                          {route.start} → {route.end}
                        </p>
                      </div>

                      {addingRouteNo === route.number ? (
                        <span className="w-4 h-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin shrink-0" />
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAllRouteClick(route);
                          }}
                          className="p-1 -m-1 shrink-0 rounded-full hover:bg-slate-50"
                          aria-label="즐겨찾기"
                        >
                          <Star
                            className={`w-4 h-4 transition-colors ${
                              isAllRouteFavorited(route)
                                ? "text-amber-400 fill-amber-400"
                                : "text-slate-300"
                            }`}
                          />
                        </button>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
          </>
        )}
      </div>
    </div>
  );
}

function RouteDetail({ route, onBack }: { route: Route; onBack: () => void }) {
  const { data: stops, status, retry } = useAsync(() => fetchStopsForRoute(route.id), [route.id]);
  const { state, dispatch } = useApp();
  const [showSchedule, setShowSchedule] = useState(false);
  const {
    data: buses,
    status: busStatus,
    error: busError,
    lastUpdated,
    retry: retryBuses,
  } = useBusLocations(route);
  // 실시간 버스를 정류장에 붙일 때 정류장 ID를 우선으로 쓴다.
  //
  // 이름으로만 묶으면 같은 이름의 서로 다른 정류장이 한 칸으로 합쳐진다.
  // 운영 DB 확인 결과 454개 노선 중 142개(31%)가 한 노선 안에서 같은 이름을
  // 서로 다른 node_id로 갖고 있어(524건), 버스가 실제로 있지도 않은 정류장에
  // 표시될 수 있었다. 전주시 GW가 정류장 ID를 안 내려주는 경우가 있어
  // (busLocationService의 nodeId 주석 참고) 이름 매칭은 폴백으로 남긴다.
  const busesByStop = useMemo(() => {
    const map = new Map<string, typeof buses>();
    if (!buses) return map;
    for (const bus of buses) {
      const key = bus.nodeId
        ? `id:${bus.nodeId}`
        : `nm:${normalizeStopName(bus.nodeName)}`;
      if (key === "nm:") continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(bus);
    }
    return map;
  }, [buses]);
    const [addingStopId, setAddingStopId] = useState<string | null>(null);

const isArrivalFavorited = (stopName: string) =>
  state.favorites.some(
    (f) => f.type === "stop_route" &&
    f.appRouteId === route.id &&
    f.stopName === stopName
  );

const handleStopClick = async (stop: BusStop) => {
  // 바로 위 isArrivalFavorited와 같은 기준(appRouteId)으로 찾아야 한다.
  // routeNumber로 찾으면 같은 번호의 반대 방향 즐겨찾기를 지워버린다.
  const existing = state.favorites.find(
    (f) => f.type === "stop_route" && f.appRouteId === route.id && f.stopName === stop.name
  );
  if (existing) {
    dispatch({ type: "REMOVE_FAVORITE", id: existing.id });
    showToast("즐겨찾기에서 삭제했어요");
    return;
  }

  setAddingStopId(stop.id);
  try {
    // routeId/nodeId를 다시 조회할 필요가 없다. stop은 이미 이 노선의
    // fetchStopsForRoute 결과 그 자체라 stop.id가 정확한 TAGO nodeId이고
    // (JUB<brtStdid> = TAGO routeId 형식은 계산만으로 나온다), 굳이 TAGO에
    // 실시간으로 되물어 같은 답을 늦게 받을 이유가 없다.
    const routeId = `JUB${route.id}`;
    const nodeId = stop.id;
    if (!route.id || !nodeId) {
      showToast("이 정류장은 아직 실시간 도착정보를 지원하지 않아요");
      return;
    }
    dispatch({
      type: "ADD_FAVORITE",
      favorite: {
        id: `fav-stop-${route.id}-${stop.id}`,
        type: "stop_route",
        name: stop.name,
        label: route.number,
        refId: `${route.id}-${stop.id}`,
        tagoNodeId: nodeId,
        tagoRouteId: routeId,
        appRouteId: route.id,
        stopName: stop.name,
        routeNumber: route.number,
      },
    });
    showToast("즐겨찾기에 추가했어요");
  } catch {
    showToast("즐겨찾기 추가에 실패했어요");
  } finally {
    setAddingStopId(null);
  }
};
  

 
  return (
    <div className="bg-slate-50">
      <header className="bg-white px-4 pt-safe-14 pb-5 border-b border-slate-100 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 -ml-1.5 rounded-full hover:bg-slate-100">
            <ArrowLeft className="w-5 h-5 text-slate-700" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-slate-900">
              {getRouteCategory(route.name)}
              {route.number}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {route.start || "기점 정보 없음"} → {route.end || "종점 정보 없음"}
            </p>
          </div>
          <button
            onClick={() => {
              const existing = state.favorites.find(
                (f) => f.type === "route" && f.refId === route.id
              );
              if (existing) {
                dispatch({ type: "REMOVE_FAVORITE", id: existing.id });
                showToast("즐겨찾기에서 삭제했어요");
              } else {
                dispatch({
                  type: "ADD_FAVORITE",
                  favorite: {
                    id: `fav-route-${route.id}`,
                    type: "route",
                    name: `${route.number}번`,
                    label: route.number,
                    refId: route.id,
                  },
                });
                showToast("즐겨찾기에 추가했어요");
              }
            }}
            className="p-2 rounded-full hover:bg-slate-100"
          >
            <Star
              className={`w-5 h-5 transition-colors ${
                state.favorites.some((f) => f.type === "route" && f.refId === route.id)
                  ? "text-amber-400 fill-amber-400"
                  : "text-slate-300"
              }`}
            />
          </button>
        </div>
        <div className="flex items-center gap-4 mt-3 text-[11px] text-slate-400">
          <span>첫차 {route.firstBus}</span>
          <span>막차 {route.lastBus}</span>
          <span>배차간격 {route.interval}</span>
          <span>{route.distance}</span>
        </div>
        <button
          onClick={() => setShowSchedule(true)}
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-2.5 bg-slate-100 text-blue-700 rounded-xl text-sm font-semibold hover:bg-slate-200 transition-colors"
        >
          <Clock className="w-4 h-4" />
          배차시간 보기
          <ChevronDown className="w-4 h-4" />
        </button>
      </header>

      <div className="px-4 pt-3 flex items-center gap-1.5">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            busStatus === "success" && buses && buses.length > 0
              ? "bg-blue-500"
              : busStatus === "error"
              ? "bg-red-400"
              : "bg-slate-300"
          }`}
        />
        <span className="text-[11px] text-slate-400">
          {busStatus === "loading" && "실시간 위치 불러오는 중"}
          {busStatus === "error" && busError}
          {busStatus === "success" && buses && buses.length > 0 && "실시간 위치 연동 중"}
          {busStatus === "success" && buses && buses.length === 0 && "현재 운행 중인 버스가 없어요"}
        </span>
        {busStatus === "error" && (
          <button
            onClick={() => retryBuses()}
            className="text-[11px] font-semibold text-blue-600 ml-auto hover:underline"
          >
            다시 시도
          </button>
        )}
        {busStatus !== "error" && lastUpdated && (
          <span className="text-[10px] text-slate-300 ml-auto">
            {lastUpdated.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} 갱신
          </span>
        )}
      </div>

      <div className="px-4 py-4">
        {status === "loading" && (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <LoadingSkeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        )}
        {status === "error" && <ErrorState onRetry={retry} />}
        {status === "success" && stops && stops.length === 0 && (
          <EmptyState title="경유 정류장 정보가 없어요" />
        )}
        {status === "success" && stops && stops.length > 0 && (
          <div className="relative">
            <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-slate-200" />
            <div className="space-y-1">
            {stops.map((stop) => {
                const stopBuses =
                  busesByStop.get(`id:${stop.id}`) ??
                  busesByStop.get(`nm:${normalizeStopName(stop.name)}`) ??
                  [];
                const hasBus = stopBuses.length > 0;

                return (
                  <div key={`${stop.order}-${stop.id}`} className="relative flex items-start gap-3">
                    <div
                      className={`relative z-10 mt-3 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-500 ease-out ${
                        hasBus ? "bg-blue-500 border-blue-500 scale-125" : "bg-white border-slate-300 scale-100"
                      }`}
                    >
                      {/* B2. 버스가 지금 이 정류장에 있다는 걸 은은한 펄스로 전달 — 장식이 아니라 실시간 상태 신호입니다 */}
                      {hasBus && (
                        <span className="absolute inset-0 rounded-full bg-blue-400 animate-ping opacity-60" />
                      )}
                      <span className="sr-only">{stop.order}</span>
                    </div>
                    <button
                      onClick={() => handleStopClick(stop)}
                      disabled={addingStopId === stop.id}
                      className="flex-1 flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-white transition-colors text-left"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] text-slate-400 font-medium w-5 shrink-0">
                          {stop.order}
                        </span>
                        <span className="text-sm font-medium text-slate-700">{stop.name}</span>
                        {hasBus && (
                          <span
                            key={stopBuses[0].vehicleNo}
                            className="flex items-center gap-1 bg-blue-500 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full animate-stop-badge-in"
                          >
                            <Navigation className="w-2.5 h-2.5" />
                            {stopBuses[0].vehicleNo || "버스"}
                            {stopBuses.length > 1 && ` +${stopBuses.length - 1}`}
                          </span>
                        )}
                      </div>
                      {addingStopId === stop.id ? (
                        <span className="w-4 h-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin shrink-0" />
                      ) : (
                        <Star
                          className={`w-4 h-4 shrink-0 transition-colors ${
                            isArrivalFavorited(stop.name)
                              ? "text-amber-400 fill-amber-400"
                              : "text-slate-300"
                          }`}
                        />
                      )}
                    </button>
                  </div>
                );
              })}
              </div>
          </div>
        )}
      </div>

      {showSchedule && (
        <DispatchScheduleModal route={route} onClose={() => setShowSchedule(false)} />
      )}
    </div>
  );
}

function generateTimetable(firstBus: string, lastBus: string, interval: string): string[] {
  const info = parseInterval(interval);
  if (!info) return [];
  const start = parseTimeToMinutes(firstBus);
  let end = parseTimeToMinutes(lastBus);
  if (isNaN(start) || isNaN(end)) return [];
  // 막차가 "00:20"처럼 자정을 넘겨 기록된 노선은 end가 start보다 작게
  // 파싱된다. 다음 날로 넘어간 것으로 보고 24시간을 더해 보정한다.
  if (end <= start) end += 24 * 60;
  const avg = Math.max(1, Math.round((info.min + info.max) / 2));
  const times: string[] = [];
  let current = start;
  while (current <= end) {
    const h = Math.floor(current / 60) % 24;
    const m = current % 60;
    times.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    current += avg;
  }
  return times;
}

function DispatchScheduleModal({
  route,
  onClose,
}: {
  route: Route;
  onClose: () => void;
}) {
  const timetable = useMemo(
    () => generateTimetable(route.firstBus, route.lastBus, route.interval),
    [route.firstBus, route.lastBus, route.interval]
  );
  const intervalInfo = parseInterval(route.interval);

  const [realSchedule, setRealSchedule] = useState<BisTimeInfo | null>(null);
  const [realStatus, setRealStatus] = useState<"loading" | "success" | "unavailable">("loading");

  useEffect(() => {
    let cancelled = false;
    setRealStatus("loading");
    setRealSchedule(null);

    fetchBisTimeInfo(route.id).then((data) => {
      if (cancelled) return;
      if (data) {
        setRealSchedule(data);
        setRealStatus("success");
      } else {
        setRealStatus("unavailable");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [route.id]);

  

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl animate-slide-up">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-900">배차시간</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2 mb-3">
            <span className="font-bold text-slate-900 text-lg">{route.number}번</span>
            <span className="text-xs text-slate-400">{route.name}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-50 rounded-xl p-3 text-center">
              <div className="flex items-center justify-center mb-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <p className="text-[10px] text-slate-400 mb-0.5">첫차</p>
              <p className="text-sm font-bold text-slate-700">{route.firstBus}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 text-center">
              <div className="flex items-center justify-center mb-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <p className="text-[10px] text-slate-400 mb-0.5">막차</p>
              <p className="text-sm font-bold text-slate-700">{route.lastBus}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 text-center">
              <div className="flex items-center justify-center mb-1">
                <Clock className="w-3.5 h-3.5 text-blue-500" />
              </div>
              <p className="text-[10px] text-slate-400 mb-0.5">배차간격</p>
              <p className="text-sm font-bold text-blue-700">{route.interval}</p>
            </div>
          </div>
          {intervalInfo && (
            <p className="text-[11px] text-slate-400 mt-3 text-center">
              {intervalInfo.min}분 ~ {intervalInfo.max}분 간격으로 운행합니다
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {realStatus === "loading" && (
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <LoadingSkeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          )}

          {realStatus === "success" && realSchedule && (
            <>
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                <Navigation className="w-4 h-4 text-blue-500" />
                실제 배차시간표
                <span className="text-[10px] font-normal text-blue-500 bg-slate-100 px-1.5 py-0.5 rounded-full ml-1">
                  공식 데이터
                </span>
              </h3>
              <div className="grid grid-cols-4 gap-2">
                {realSchedule.times.map((time, i) => {
                  const now = new Date();
                  const nowMin = now.getHours() * 60 + now.getMinutes();
                  const parts = time.split(":");
                  const depMin = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
                  const isPast = depMin < nowMin;
                  const isNext = depMin >= nowMin && depMin <= nowMin + (intervalInfo?.min ?? 15);
                  const cls = isNext
                    ? "bg-blue-600 text-white font-bold"
                    : isPast
                    ? "bg-slate-50 text-slate-300"
                    : "bg-slate-50 text-slate-600";
                  return (
                    <div
                      key={time + "-" + i}
                      className={"py-2 rounded-lg text-center text-sm font-medium transition-colors " + cls}
                    >
                      {time}
                    </div>
                  );
                })}
              </div>
              {realSchedule.note && (
                <p className="text-[11px] text-slate-400 mt-4 whitespace-pre-line">{realSchedule.note}</p>
              )}
              {realSchedule.satSkip && (
                <p className="text-[11px] text-slate-400 mt-2">토요일 미운행: {realSchedule.satSkip}</p>
              )}
              {realSchedule.holidaySkip && (
                <p className="text-[11px] text-slate-400 mt-1">일요일(공휴일) 미운행: {realSchedule.holidaySkip}</p>
              )}
            </>
          )}

          {realStatus === "unavailable" && (
            <>
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                <Navigation className="w-4 h-4 text-blue-500" />
                예상 출발 시간표
              </h3>
              {timetable.length > 0 ? (
                <div className="grid grid-cols-4 gap-2">
                  {timetable.map((time, i) => {
                    const now = new Date();
                    const nowMin = now.getHours() * 60 + now.getMinutes();
                    const parts = time.split(":");
                    const depMin = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
                    const isPast = depMin < nowMin;
                    const isNext = depMin >= nowMin && depMin <= nowMin + (intervalInfo?.min ?? 15);
                    const cls = isNext
                      ? "bg-blue-600 text-white font-bold"
                      : isPast
                      ? "bg-slate-50 text-slate-300"
                      : "bg-slate-50 text-slate-600";
                    return (
                      <div
                        key={time + "-" + i}
                        className={"py-2 rounded-lg text-center text-sm font-medium transition-colors " + cls}
                      >
                        {time}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8">
                  <Clock className="w-8 h-8 text-slate-300 mb-2" />
                  <p className="text-sm text-slate-400">배차간격 정보가 없어</p>
                  <p className="text-sm text-slate-400">시간표를 생성할 수 없어요</p>
                </div>
              )}
              {timetable.length > 0 && (
                <p className="text-[11px] text-slate-400 mt-4 text-center">
                  배차간격을 기준으로 한 예상 시간표로, 실제와 다를 수 있어요
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
              