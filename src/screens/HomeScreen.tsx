import { useState } from "react";
import { useApp } from "@/store/appContext";
import { useAsync } from "@/hooks/useAsync";
import { fetchAllRoutes } from "@/services/routeService";
import { showToast } from "@/lib/toastStore";
import type { TabId } from "@/components/BottomNav";
import { MapPin, ChevronDown, ChevronRight, Star, Search, X, RefreshCw } from "lucide-react";
import { useArrivalInfo } from "@/hooks/useArrivalInfo";
import { formatArrivalText } from "@/lib/formatArrival";
import { ReliabilityTag } from "@/components/ui";
import { triggerArrivalRefresh } from "@/services/arrivalService";
import type { Favorite } from "@/types";

function getRouteTypeLabel(routeName: string) {
  // bus_routes_master.category가 정답이라 route.name에 이미 반영돼 있다.
  return routeName.startsWith("분선") ? "분선" : "본선";
}
function FavoriteArrivalInfo({
  fav,
  isRoute,
  routeNumber,
  directionLabel,
  routeInterval,
}: {
  fav: Favorite;
  isRoute: boolean;
  routeNumber: string;
  /** stop_route일 때 기점 → 종점 표시용 */
  directionLabel?: string;
  /** A1 지연 판정 기준(배차간격) 계산용 */
  routeInterval?: string;
}) {
  const isStopRoute = fav.type === "stop_route";
  const { data, status, isRefreshing, reliability } = useArrivalInfo(
    isStopRoute ? fav.tagoNodeId : undefined,
    isStopRoute ? fav.tagoRouteId : undefined,
    isStopRoute ? (fav.routeNumber ?? routeNumber) : undefined,
    isStopRoute ? routeInterval : undefined,
  );

  let subtitle: string;
  if (isRoute) {
    subtitle = "노선";
  } else if (!isStopRoute) {
    subtitle = "정류장";
  } else if (directionLabel) {
    // 같은 번호 반대 방향을 구분하기 위해 기점→종점을 표시
    subtitle = directionLabel;
  } else if (status === "loading") {
    subtitle = "정거장 확인 중";
  } else if (status === "success" && data) {
    subtitle =
      data.stopsAway == null
        ? data.minutes <= 0
          ? "곧 도착"
          : `${data.minutes}분 후`
        : data.stopsAway <= 0
          ? "곧 도착"
          : `${data.stopsAway}정거장 전`;
  } else {
    subtitle = fav.routeNumber ? `${fav.routeNumber}번` : "정류장";
  }

  return (
    <>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">
          {isRoute ? `${routeNumber}번` : fav.name}
        </p>
        <p className="text-xs text-slate-400 mt-0.5 truncate">{subtitle}</p>
      </div>

      <div className="text-right shrink-0">
        <p className="text-xs font-medium text-slate-300">
          {isStopRoute && isRefreshing ? "갱신 중" : "도착정보"}
        </p>
        {!isStopRoute && <p className="text-sm font-semibold text-slate-400">준비중</p>}
        {isStopRoute && status === "loading" && !data && (
          <p className="text-sm font-semibold text-slate-300">조회 중</p>
        )}
        {isStopRoute && data && (
          <>
            <p
              className={`text-sm font-bold ${
                reliability.delayed
                  ? "text-amber-600"
                  : data.minutes <= 3
                    ? "text-blue-600"
                    : "text-slate-700"
              }`}
            >
              {formatArrivalText(data.minutes, data.stopsAway)}
            </p>
            <div className="mt-0.5 flex justify-end">
              <ReliabilityTag reliability={reliability} />
            </div>
          </>
        )}
        {isStopRoute && status === "error" && !data && (
          <p className="text-sm font-semibold text-slate-300">정보 없음</p>
        )}
      </div>
    </>
  );
}

export function HomeScreen({
  onNavigate,
}: {
  onNavigate: (
    tab: TabId,
    routeId?: string,
    station?: { id: string; name: string; arsId?: string }
  ) => void;
}) {
  const { state, dispatch } = useApp();
  const [regionUnderDevOpen, setRegionUnderDevOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { data: routes } = useAsync(() => fetchAllRoutes(), []);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await triggerArrivalRefresh();
      showToast("새로고침했어요");
    } catch {
      showToast("갱신에 실패했어요");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
       <header className="bg-white px-5 pt-safe-header pb-5 shrink-0">
         <div className="flex items-start justify-between mb-1">
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-slate-900 leading-tight">
            BUS STOP
          </h1>
          <button
            onClick={() => setRegionUnderDevOpen(true)}
            className="flex items-center gap-1 -mr-1 px-2 py-1 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
          >
            <MapPin className="w-4 h-4" />
            <span>{state.region.sigungu}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
        <p className="text-slate-400 text-[13px] tracking-tight">전주시 버스 노선 정보</p>
      </header>

      <section className="px-5 shrink-0">
        <button
          onClick={() => onNavigate("bus")}
          className="w-full border-y border-slate-200 py-3.5 flex items-center gap-3 text-left active:bg-slate-50 transition-colors"
        >
          <Search className="w-[18px] h-[18px] text-slate-400 shrink-0" />
          <span className="flex-1 text-[15px] text-slate-500 tracking-tight">
            노선번호·기점·종점으로 검색
          </span>
          <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
        </button>
      </section>

      <section className="px-5 mt-8 flex flex-col min-h-0 overflow-y-auto">
      <div className="flex items-baseline justify-between gap-2 mb-1 shrink-0">
        <h3 className="text-[17px] font-bold text-slate-900 tracking-[-0.01em] min-w-0">즐겨찾기</h3>
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-1 -m-1 rounded-full text-slate-400 hover:text-slate-700 transition-colors disabled:opacity-40"
            aria-label="새로고침"
            aria-busy={refreshing}
          >
            <RefreshCw className={`w-[15px] h-[15px] ${refreshing ? "animate-spin" : ""}`} />
          </button>

          {state.favorites.length > 0 && (
            <button
              onClick={() => setEditMode((v) => !v)}
              className="text-[13px] text-slate-400 font-medium hover:text-slate-700"
            >
              {editMode ? "완료" : "편집"}
            </button>
          )}
          <button
            onClick={() => onNavigate("my")}
            className="text-[13px] text-slate-400 font-medium hover:text-slate-700"
          >
            전체보기
          </button>
        </div>
      </div>
      {state.favorites.length === 0 ? (
    <button
      onClick={() => onNavigate("bus")}
      className="w-full py-12 text-center border-t border-slate-200 mt-3 active:bg-slate-50 transition-colors"
    >
      <Star className="w-7 h-7 text-slate-200 mx-auto mb-2.5" strokeWidth={1.5} />
      <p className="text-[13px] text-slate-400">즐겨찾기를 추가해 보세요</p>
    </button>
  ) : (
    <div className="max-h-[52vh] overflow-y-auto divide-y divide-slate-100 border-t border-slate-200 mt-3 scroll-pb-safe">
  {state.favorites.map((fav) => {
        const isRoute = fav.type === "route";
        const matchedRoute = isRoute
          ? routes?.find((r) => r.id === fav.refId)
          : undefined;
        const isMain = matchedRoute ? getRouteTypeLabel(matchedRoute.name) === "본선" : true;

        // 본선/분선은 색이 아니라 라벨 텍스트로 구분한다. 아이콘/배지 색을
        // 같은 계열 배경과 짝지으면 화면이 색 블록의 나열이 된다.
        const routeNumber =
          matchedRoute?.number ?? fav.name.replace(/번$/, "").trim();

          const isStopRoute = fav.type === "stop_route";
          const isStation = fav.type === "station";
          const targetId = isStopRoute ? fav.appRouteId : fav.refId;

          // stop_route: appRouteId로 실제 노선 방향을 찾아 기점→종점 표시
          const stopRoute = isStopRoute && fav.appRouteId
            ? routes?.find((r) => r.id === fav.appRouteId)
            : undefined;
          const directionLabel = stopRoute
            ? `${stopRoute.start || "기점"} → ${stopRoute.end || "종점"}`
            : undefined;

        return (
          <div key={fav.id} className="relative">
            <button
              onClick={() => {
              if (editMode) return;
              if (isStation) {
                onNavigate("bus", undefined, {
                  id: fav.refId,
                  name: fav.name,
                  arsId: fav.label !== "정류장" ? fav.label : undefined,
                });
                return;
              }
            if (isRoute || isStopRoute) {
              onNavigate("bus", targetId);
              return;
            }
          }}              
              className="w-full px-1 py-4 flex items-center gap-3.5 text-left active:bg-slate-50 transition-colors"
            >
              {/* 왼쪽: 구분 라벨 — 중립 표면 + 얇은 선으로만 구분 */}
              <div className="min-w-[58px] h-10 rounded-lg border border-slate-200 flex items-center justify-center shrink-0 px-2">
                <span className="font-semibold text-[13px] leading-tight text-center truncate text-slate-600 tracking-tight">
                  {isRoute ? (isMain ? "본선" : "분선") : fav.label}
                </span>
              </div>

            {/* 가운데: 정류장명 + 노선 방향 / 오른쪽: 도착정보 배지 */}
            <FavoriteArrivalInfo
              fav={fav}
              isRoute={isRoute}
              routeNumber={routeNumber}
              directionLabel={directionLabel}
              routeInterval={stopRoute?.interval}
            />
            </button>

            {editMode && (
              <button
                onClick={() => {
                  dispatch({ type: "REMOVE_FAVORITE", id: fav.id });
                  showToast("삭제했어요");
                }}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow-sm active:scale-90 transition-transform"
              >
                <X className="w-3 h-3" strokeWidth={3} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  )}
</section>

      {regionUnderDevOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setRegionUnderDevOpen(false)}
          />
          <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md shadow-2xl p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">지역 설정</h2>
              <button
                type="button"
                onClick={() => setRegionUnderDevOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              이 기능은 현재 개발 중입니다.
              <br />
              향후 업데이트에서 이용하실 수 있습니다.
            </p>
            <button
              type="button"
              onClick={() => setRegionUnderDevOpen(false)}
              className="mt-6 w-full rounded-2xl bg-blue-600 py-3.5 text-sm font-semibold text-white active:scale-[0.98]"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}