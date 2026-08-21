import { useState, useMemo, useEffect } from "react";
import { Search, X, Star, ArrowLeft, Bus as BusIcon, RadioTower, Navigation, Clock, Calendar, ChevronDown } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { useBusLocations } from "@/hooks/useBusLocations";
import { useApp } from "@/store/AppContext";
import { fetchAllRoutes, fetchStopsForRoute } from "@/services/routeService";
import { fetchBisTimeInfo, type BisTimeInfo } from "@/api/jeonjuBis";
import type { Route, BusStop } from "@/types/route";
import type { Favorite } from "@/types";
import { LoadingSkeleton, ErrorState, EmptyState } from "@/components/ui";
import { showToast } from "@/components/Toast";
import type { Station } from "@/types/route";
import { MapPin } from "lucide-react";
import { resolveNodeId, resolveRouteId } from "@/services/arrivalService";
import { searchStations, fetchRoutesForStation, type StationRoute } from "@/services/stationService";

const MAIN_LINES: { number: string; start: string; end: string }[] = [
  { number: "2", start: "평화동종점", end: "평화동종점" },
  { number: "3-1", start: "전주대학교", end: "전주대학교" },
  { number: "3-2", start: "전주대학교", end: "전주대학교" },
  { number: "5-5", start: "전북대종점", end: "전북대종점" },
  { number: "6", start: "전주대학교", end: "전주대학교" },
  { number: "6-1", start: "전주대학교", end: "평화동종점" },
  { number: "8-1", start: "전북대종점", end: "전북대종점" },
  { number: "8-2", start: "전북대종점", end: "전북대종점" },
  { number: "9", start: "송천동종점", end: "송천동종점" },
  { number: "10", start: "평화코오롱아파트", end: "추동" },
  { number: "12", start: "풍남문", end: "내원당마을" },
  { number: "13", start: "풍남문", end: "은석마을" },
  { number: "14", start: "낙수정", end: "낙수정" },
  { number: "15", start: "낙수정", end: "흑석골종점" },
  { number: "16", start: "풍남문", end: "삼경사" },
  { number: "17", start: "풍남문", end: "흑석골종점" },
  { number: "18", start: "월드컵경기장", end: "백구" },
  { number: "19", start: "월드컵경기장", end: "춘강" },
  { number: "20", start: "원마다리", end: "이서회차지" },
  { number: "21", start: "모산종점", end: "이서회차지" },
  { number: "23", start: "원동마을", end: "이서회차지" },
  { number: "24", start: "구암", end: "이서회차지" },
  { number: "25", start: "대문안종점", end: "이서회차지" },
  { number: "26", start: "콩쥐팥쥐마을", end: "이서회차지" },
  { number: "27", start: "삼례역", end: "이서회차지" },
  { number: "31", start: "삼례역", end: "둔산코아루2차아파트" },
  { number: "32", start: "삼례터미널", end: "비봉종점" },
  { number: "33", start: "삼례역", end: "지암마을" },
  { number: "34", start: "삼례역", end: "지암마을" },
  { number: "34-1", start: "삼례역", end: "지암마을" },
  { number: "35", start: "삼례역", end: "고산터미널" },
  { number: "36", start: "삼례역", end: "고산터미널" },
  { number: "40", start: "월드컵경기장", end: "고잔" },
  { number: "41", start: "하나로마트종점", end: "삼화동" },
  { number: "43", start: "월드컵경기장", end: "홍개" },
  { number: "45", start: "월드컵경기장", end: "덕동" },
  { number: "46", start: "하나로마트종점", end: "용신마을" },
  { number: "47", start: "하나로마트종점", end: "용덕마을" },
  { number: "48", start: "월드컵경기장", end: "신기종점" },
  { number: "49", start: "월드컵경기장", end: "월드컵경기장" },
  { number: "50", start: "소양회차지", end: "봉동주공아파트" },
  { number: "51", start: "고산터미널", end: "둔산코아루2차아파트" },
  { number: "52", start: "완주군청", end: "비봉종점" },
  { number: "53", start: "완주군청", end: "제촌" },
  { number: "54", start: "완주군청", end: "원구암마을" },
  { number: "55", start: "모아엘가아파트", end: "완주군청" },
  { number: "56", start: "설경마을종점", end: "봉동회차지" },
  { number: "57", start: "양야리경로당", end: "봉동회차지" },
  { number: "58", start: "봉동회차지", end: "터지내마을" },
  { number: "59", start: "어린이창의체험관", end: "만경강변 진조리.은평" },
  { number: "60", start: "모아엘가아파트", end: "둔산코아루2차아파트" },
  { number: "61", start: "비전대학교", end: "전주대학교" },
  { number: "62", start: "흑석골종점", end: "삼산리" },
  { number: "62-1", start: "흑석골종점", end: "원상림" },
  { number: "63", start: "흑석골종점", end: "호동마을" },
  { number: "63-1", start: "흑석골종점", end: "신덕마을" },
  { number: "70", start: "민목리", end: "상관농협로컬푸드" },
  { number: "74", start: "평화동종점", end: "전북대종점" },
  { number: "75", start: "평화동종점", end: "전북대종점" },
  { number: "76", start: "상관주민센터", end: "어두마을" },
  { number: "77", start: "대흥마을", end: "상관농협로컬푸드" },
  { number: "79", start: "전주동물원", end: "금산사" },
  { number: "80", start: "금상동", end: "모래내시장" },
  { number: "81", start: "모래내시장", end: "하이리" },
  { number: "82", start: "어린이창의체험관", end: "재전" },
  { number: "82-1", start: "상망표", end: "앞멀" },
  { number: "82-2", start: "앞멀", end: "상망표" },
  { number: "83", start: "소양행정복지센터", end: "동상거인경로당" },
  { number: "84", start: "인덕마을", end: "일임리" },
  { number: "85", start: "용문사.반곡마을", end: "응암마을" },
  { number: "86", start: "월상리", end: "분토종점" },
  { number: "87", start: "송천동종점", end: "원당리" },
  { number: "87-1", start: "다리목", end: "약암마을" },
  { number: "87-2", start: "약암마을", end: "다리목" },
  { number: "89", start: "송천동종점", end: "중인동" },
  { number: "90", start: "원안덕마을", end: "전북도립미술관" },
  { number: "91", start: "막은댐", end: "전북도립미술관" },
  { number: "92", start: "막은댐", end: "전북도립미술관" },
  { number: "94", start: "어린이창의체험관", end: "진기마을종점" },
  { number: "97", start: "전북대종점", end: "만경강변 진조리.은평" },
  { number: "99-1", start: "진조리", end: "진조리" },
  { number: "99-2", start: "진조리", end: "진조리" },
  { number: "101", start: "전북대종점", end: "평화동종점" },
  { number: "102", start: "송천동종점", end: "전주시양묘장" },
  { number: "103-1", start: "송천동종점", end: "전주시양묘장" },
  { number: "104", start: "평화동종점", end: "송천동종점" },
  { number: "108", start: "전주대학교", end: "송천동종점" },
  { number: "110", start: "비전대학교", end: "대성동종점" },
  { number: "119", start: "전주대학교", end: "평화동종점" },
  { number: "165", start: "전주동물원", end: "이서회차지" },
  { number: "200", start: "기린봉", end: "하나로마트종점" },
  { number: "220", start: "비전대학교", end: "비전대학교" },
  { number: "309", start: "평화동종점", end: "우석대종점" },
  { number: "337", start: "전주시양묘장", end: "우석대종점" },
  { number: "350", start: "평화동종점", end: "삼례터미널" },
  { number: "354", start: "비전대학교", end: "우석대종점" },
  { number: "355", start: "전주대학교", end: "삼례터미널" },
  { number: "383", start: "비전대학교", end: "우석대종점" },
  { number: "385", start: "전주대학교", end: "우석대종점" },
  { number: "386", start: "전주대학교", end: "익산더반포레아파트" },
  { number: "401", start: "월드컵경기장", end: "상하보" },
  { number: "402", start: "월드컵경기장", end: "상하보" },
  { number: "403", start: "월드컵경기장", end: "화원마을" },
  { number: "420", start: "월드컵경기장", end: "중인동" },
  { number: "500", start: "평화동종점", end: "봉동회차지" },
  { number: "501", start: "평화동종점", end: "봉동회차지" },
  { number: "530", start: "전주대학교", end: "고산터미널" },
  { number: "550", start: "평화동종점", end: "둔산코아루2차아파트" },
  { number: "554", start: "삼천동종점", end: "둔산코아루2차아파트" },
  { number: "559", start: "삼천동종점", end: "둔산코아루2차아파트" },
  { number: "644", start: "감수리", end: "원평종점" },
  { number: "684", start: "감수리", end: "금구" },
  { number: "685", start: "감수리", end: "오봉리" },
  { number: "752", start: "송천동종점", end: "관촌터미널" },
  { number: "810", start: "평화동종점", end: "소양회차지" },
  { number: "820", start: "이서회차지", end: "소양" },
  { number: "970", start: "에코시티종점차고지(승하차X)", end: "전북도립미술관" },
  { number: "999", start: "전주동물원", end: "국립전주박물관종점" },
  { number: "1001", start: "평화동종점", end: "우석대종점" },
  { number: "1002", start: "평화동종점", end: "우석대종점" },
  { number: "1994", start: "평화동종점", end: "시외고속간이터미널" },
  { number: "2001", start: "평화동종점", end: "송천동종점" },
  { number: "2002", start: "평화동종점", end: "송천동종점" },
  { number: "3001", start: "송천동종점", end: "평화동종점" },
  { number: "3002", start: "송천동종점", end: "삼천동종점" },
  { number: "4000", start: "전주대캠퍼스", end: "전주대캠퍼스" },
  { number: "5001", start: "전주대캠퍼스", end: "전주대캠퍼스" },
  { number: "5002", start: "전주대캠퍼스", end: "전주대캠퍼스" },
  { number: "6001", start: "비전대학교", end: "비전대학교" },
  { number: "6002", start: "비전대학교", end: "비전대학교" },
  { number: "8490", start: "어린이창의체험관", end: "신유강" },
];

function normalizeName(s: string) {
  return (s ?? "").replace(/\s+/g, "").trim();
}

function getRouteTypeLabel(number: string, start: string, end: string) {
  const ns = normalizeName(start);
  const ne = normalizeName(end);
  const matched = MAIN_LINES.some((m) => {
    if (m.number !== number) return false;
    const ms = normalizeName(m.start);
    const me = normalizeName(m.end);
    // 정방향(기점→종점) 또는 역방향(종점→기점) 둘 다 본선으로 인정
    const sameDirection = ms === ns && me === ne;
    const reversedDirection = ms === ne && me === ns;
    return sameDirection || reversedDirection;
  });
  return matched ? "본선" : "분선";
}

export function BusScreen({
  initialRouteId,
  onConsumeInitialRoute,
}: {
  initialRouteId?: string;
  onConsumeInitialRoute?: () => void;
} = {}) {
  const [query, setQuery] = useState("");
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const { state, dispatch } = useApp();
  

  const [stations, setStations] = useState<Station[]>([]);
  const [stationStatus, setStationStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [searchTab, setSearchTab] = useState<"route" | "station">("route");

  const { data: routes, status, retry } = useAsync(() => fetchAllRoutes(), []);

  useEffect(() => {
    if (!initialRouteId || !routes) return;
    const target = routes.find((r) => r.id === initialRouteId);
    if (target) {
      setSelectedRoute(target);
    }
    onConsumeInitialRoute?.();
  }, [initialRouteId, routes]);
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
      />
    );
  }
  return (
    <div className="min-h-screen bg-slate-50 pb-20">
            <header className="bg-white px-5 pt-12 pb-4 border-b border-slate-100 sticky top-0 z-30">
              <h1 className="text-xl font-bold text-slate-900 mb-3">버스 검색</h1>

              <div className="flex bg-slate-100 rounded-xl p-1 mb-3">
                <button
                  onClick={() => {
                    setSearchTab("route");
                    setQuery("");
                  }}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    searchTab === "route"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-slate-500"
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
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-slate-500"
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
                  className="w-full pl-10 pr-10 py-3 bg-slate-100 rounded-2xl text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
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

            <div className="px-4 py-4">
        {searchTab === "route" && (
          <>
            {status === "loading" && (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <LoadingSkeleton key={i} className="h-24 w-full" />
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
                    className="w-full bg-white rounded-2xl p-4 border border-slate-100 text-left hover:border-blue-200 hover:shadow-sm transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {(() => {
                          const label = getRouteTypeLabel(route.number, route.start, route.end);
                          const isMain = label === "본선";
                          return (
                            <div
                              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                                isMain ? "bg-blue-50" : "bg-emerald-50"
                              }`}
                            >
                              <span
                                className={`font-bold text-xs leading-tight text-center ${
                                  isMain ? "text-blue-700" : "text-emerald-700"
                                }`}
                              >
                                {label}
                              </span>
                            </div>
                          );
                        })()}
                        <div>
                          <span className="font-semibold text-slate-900 text-base">
                            {route.number}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => toggleFavorite(route, e)}
                        className="p-1 -m-1 rounded-full hover:bg-amber-50"
                      >
                        <Star
                          className={`w-4 h-4 transition-colors ${
                            isFavorited(route.id)
                              ? "text-amber-400 fill-amber-400"
                              : "text-slate-300 hover:text-amber-400"
                          }`}
                        />
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <span className="font-medium text-slate-600">
                        {route.start || "기점 정보 없음"}
                      </span>
                      <span className="text-slate-300">→</span>
                      <span className="font-medium text-slate-600">
                        {route.end || "종점 정보 없음"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
                      <span>첫차 {route.firstBus}</span>
                      <span>막차 {route.lastBus}</span>
                      <span>배차 {route.interval}</span>
                    </div>
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
                    className="w-full bg-white rounded-2xl p-4 border border-slate-100 flex items-center gap-3 cursor-pointer hover:border-blue-200 hover:shadow-sm transition-all"
                  >
                    <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
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

function StationDetail({
  station,
  onBack,
}: {
  station: Station;
  onBack: () => void;
}) {
  const { state, dispatch } = useApp();

  const [routes, setRoutes] = useState<StationRoute[]>([]);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [addingRouteNo, setAddingRouteNo] = useState<string | null>(null);

  const { data: allRoutes } = useAsync(() => fetchAllRoutes(), []);

  const [detailTab, setDetailTab] = useState<"arrival" | "all">("arrival");
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
  useEffect(() => {
    if (detailTab !== "all") return;
    if (!allRoutes || allRoutes.length === 0) return;

    let cancelled = false;

    setAllStatus("loading");

    const normalize = (s: string) =>
      (s ?? "")
        .replace(/\s+/g, "")
        .replace(/\(.*?\)/g, "")
        .trim();

    const target = normalize(station.name);

    (async () => {
      try {
        const matched: Route[] = [];

        for (const route of allRoutes) {
          if (cancelled) return;

          try {
            const stops = await fetchStopsForRoute(route.id);

            const hit = stops.some(
              (st) => normalize(st.name) === target
            );

            if (hit) {
              matched.push(route);
            }
          } catch {
            // 한 노선 조회 실패해도 다른 노선은 계속 조회
          }
        }

        if (cancelled) return;

        matched.sort((a, b) =>
          a.number.localeCompare(b.number, undefined, {
            numeric: true,
          })
        );

        setAllViaRoutes(matched);
        setAllStatus("success");
      } catch {
        if (!cancelled) {
          setAllStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [detailTab, station.name, allRoutes]);

  // 실시간 노선 즐겨찾기 여부
  const isArrivalFavorited = (routeNo: string) =>
    state.favorites.some(
      (f) =>
        f.type === "stop_route" &&
        f.routeNumber === routeNo &&
        f.stopName === station.name
    );

  // 실시간 노선 즐겨찾기
  const handleRouteClick = async (sr: StationRoute) => {
    const existing = state.favorites.find(
      (f) =>
        f.type === "stop_route" &&
        f.routeNumber === sr.routeNo &&
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
      const appRoute = allRoutes?.find(
        (r) =>
          r.number === sr.routeNo ||
          r.rawNumber === sr.routeNo
      );

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
        f.routeNumber === route.number &&
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

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-white px-4 pt-12 pb-4 border-b border-slate-100 sticky top-0 z-30">
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
        <div className="flex bg-slate-100 rounded-xl p-1">
          <button
            onClick={() => setDetailTab("arrival")}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              detailTab === "arrival"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-slate-500"
            }`}
          >
            실시간 도착
          </button>

          <button
            onClick={() => setDetailTab("all")}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              detailTab === "all"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-slate-500"
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

            {status === "success" && routes.length === 0 && (
              <EmptyState
                icon={BusIcon}
                title="경유 노선이 없어요"
                subtitle="운행 중인 버스가 없거나 정보가 없을 수 있어요"
              />
            )}

            {status === "success" && routes.length > 0 && (
              <div className="space-y-2">
                {routes.map((sr) => {
                  const minutes =
                    sr.arrtime != null
                      ? Math.max(
                          0,
                          Math.round(sr.arrtime / 60)
                        )
                      : null;

                  return (
                    <button
                      key={sr.routeId}
                      onClick={() => handleRouteClick(sr)}
                      disabled={
                        addingRouteNo === sr.routeNo
                      }
                      className="w-full bg-white rounded-2xl p-4 border border-slate-100 text-left hover:border-blue-200 hover:shadow-sm transition-all flex items-center gap-3"
                    >
                      <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                        <span className="font-bold text-sm text-blue-700">
                          {sr.routeNo}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800">
                          {sr.routeNo}번

                          {sr.routeTp ? (
                            <span className="text-xs font-normal text-slate-400 ml-1.5">
                              {sr.routeTp}
                            </span>
                          ) : null}
                        </p>

                        <p className="text-xs text-slate-400 mt-0.5">
                          {minutes == null
                            ? "도착정보 없음"
                            : minutes <= 0
                            ? "곧 도착"
                            : `${minutes}분 후` +
                              (sr.arrprevstationcnt != null
                                ? ` · ${sr.arrprevstationcnt}정거장 전`
                                : "")}
                        </p>
                      </div>

                      {addingRouteNo === sr.routeNo ? (
                        <span className="w-4 h-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin shrink-0" />
                      ) : (
                        <Star
                          className={`w-4 h-4 shrink-0 transition-colors ${
                            isArrivalFavorited(sr.routeNo)
                              ? "text-amber-400 fill-amber-400"
                              : "text-slate-300"
                          }`}
                        />
                      )}
                    </button>
                  );
                })}
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
                  {allViaRoutes.map((route) => (
                    <button
                      key={route.id}
                      onClick={() =>
                        handleAllRouteClick(route)
                      }
                      disabled={
                        addingRouteNo === route.number
                      }
                      className="w-full bg-white rounded-2xl p-4 border border-slate-100 text-left hover:border-blue-200 hover:shadow-sm transition-all flex items-center gap-3"
                    >
                      <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                        <span className="font-bold text-sm text-emerald-700">
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
                        <Star
                          className={`w-4 h-4 shrink-0 transition-colors ${
                            isArrivalFavorited(route.number)
                              ? "text-amber-400 fill-amber-400"
                              : "text-slate-300"
                          }`}
                        />
                      )}
                    </button>
                  ))}
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
  const busesByStop = useMemo(() => {
    const normalize = (s: string) => (s ?? "").replace(/\s+/g, "").replace(/\(.*?\)/g, "").trim();
    const map = new Map<string, typeof buses>();
    if (!buses) return map;
    for (const bus of buses) {
      const key = normalize(bus.nodeName);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(bus);
    }
    return map;
  }, [buses]);
  const normalizeStopName = (s: string) =>
    (s ?? "").replace(/\s+/g, "").replace(/\(.*?\)/g, "").trim();
    const [addingStopId, setAddingStopId] = useState<string | null>(null);

const isArrivalFavorited = (stopName: string) =>
  state.favorites.some(
    (f) => f.type === "stop_route" &&
    f.appRouteId === route.id &&
    f.stopName === stopName
  );

const handleStopClick = async (stop: BusStop) => {
  const existing = state.favorites.find(
    (f) => f.type === "stop_route" && f.routeNumber === route.number && f.stopName === stop.name
  );
  if (existing) {
    dispatch({ type: "REMOVE_FAVORITE", id: existing.id });
    showToast("즐겨찾기에서 삭제했어요");
    return;
  }

  setAddingStopId(stop.id);
  try {
    const [nodeId, routeId] = await Promise.all([
      resolveNodeId(stop.name),
      resolveRouteId(route),
    ]);
    if (!nodeId || !routeId) {
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
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-white px-4 pt-12 pb-4 border-b border-slate-100 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 -ml-1.5 rounded-full hover:bg-slate-100">
            <ArrowLeft className="w-5 h-5 text-slate-700" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-slate-900">
              {getRouteTypeLabel(route.number, route.start, route.end)}
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
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-2.5 bg-blue-50 text-blue-700 rounded-xl text-sm font-semibold hover:bg-blue-100 transition-colors"
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
        {lastUpdated && (
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
                const stopBuses = busesByStop.get(normalizeStopName(stop.name)) ?? [];
                const hasBus = stopBuses.length > 0;

                return (
                  <div key={`${stop.order}-${stop.id}`} className="relative flex items-start gap-3">
                    <div
                      className={`relative z-10 mt-3 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                        hasBus ? "bg-blue-500 border-blue-500" : "bg-white border-slate-300"
                      }`}
                    >
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
                          <span className="flex items-center gap-1 bg-blue-500 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
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

function parseInterval(interval: string): { min: number; max: number } | null {
  const match = interval.match(/(\d+)~(\d+)분/);
  if (match) return { min: parseInt(match[1], 10), max: parseInt(match[2], 10) };
  const single = interval.match(/(\d+)분/);
  if (single) {
    const val = parseInt(single[1], 10);
    return { min: val, max: val };
  }
  return null;
}

function parseTimeToMinutes(time: string): number {
  const parts = time.split(":");
  if (parts.length !== 2) return NaN;
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

function generateTimetable(firstBus: string, lastBus: string, interval: string): string[] {
  const info = parseInterval(interval);
  if (!info) return [];
  const start = parseTimeToMinutes(firstBus);
  const end = parseTimeToMinutes(lastBus);
  if (isNaN(start) || isNaN(end) || end <= start) return [];
  const avg = Math.max(1, Math.round((info.min + info.max) / 2));
  const times: string[] = [];
  let current = start;
  while (current <= end) {
    const h = Math.floor(current / 60);
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
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <div className="flex items-center justify-center mb-1">
                <Clock className="w-3.5 h-3.5 text-blue-500" />
              </div>
              <p className="text-[10px] text-blue-400 mb-0.5">배차간격</p>
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
                <span className="text-[10px] font-normal text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full ml-1">
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
              