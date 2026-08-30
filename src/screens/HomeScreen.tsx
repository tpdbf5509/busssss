import { useState } from "react";
import { useApp } from "@/store/appContext";
import { useAsync } from "@/hooks/useAsync";
import { fetchAllRoutes } from "@/services/routeService";
import { showToast } from "@/lib/toastStore";
import type { TabId } from "@/components/BottomNav";
import { MapPin, ChevronDown, Star, Search, X, RefreshCw } from "lucide-react";
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
        <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>
      </div>

      <div className="text-right shrink-0">
        <p className="text-xs font-medium text-slate-400">
          {isStopRoute && isRefreshing ? "갱신 중" : "도착정보"}
        </p>
        {!isStopRoute && <p className="text-sm font-semibold text-slate-500">준비중</p>}
        {isStopRoute && status === "loading" && !data && (
          <p className="text-sm font-semibold text-slate-400">조회 중</p>
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
          <p className="text-sm font-semibold text-slate-400">정보 없음</p>
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
    <div className="flex flex-col bg-slate-50">
       {/* 다른 화면(버스/알림/길찾기)은 전부 흰 배경+구분선 헤더를 쓴다.
           이 화면만 파란 그라디언트였던 걸 같은 패턴으로 통일 — 새 트렌드가
           아니라 이 앱 안에 이미 있는 스타일을 따른 것 */}
       <header className="bg-white border-b border-slate-100 px-5 pt-safe-16 pb-5 shrink-0">
         <div className="flex items-center justify-between mb-0.5">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">BUS STOP</h1>
          <button
            onClick={() => setRegionUnderDevOpen(true)}
            className="flex items-center gap-1 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors"
          >
            <MapPin className="w-4 h-4" />
            <span>{state.region.sigungu}</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-slate-500 text-xs">전주시 버스 노선 정보</p>
      </header>
  
      <section className="px-4 shrink-0">
        {/* 카드(배경+테두리+그림자) 대신 구분선 하나로 감싼 행. 이전엔
            파란 헤더 위로 겹치도록 -mt-3에 그림자를 얹었지만, 헤더가
            평범한 흰 배경이 된 지금은 그 연출 자체가 의미가 없어졌다. */}
        <button
          onClick={() => onNavigate("bus")}
          className="w-full border-y border-slate-100 py-3.5 flex items-center gap-3 hover:bg-slate-50 transition-colors active:scale-[0.99]"
        >
          <Search className="w-5 h-5 text-slate-500 shrink-0" />
          <div className="text-left flex-1">
            <p className="text-sm font-semibold text-slate-800">전체 노선 검색</p>
            <p className="text-xs text-slate-500 mt-0.5">노선번호·기점·종점으로 찾아보세요</p>
          </div>
          <span className="text-slate-400 text-lg">›</span>
        </button>
      </section>
  
      {/* 이 아래에 기존 즐겨찾기 섹션 그대로 유지 */}

      <section className="px-4 mt-6 flex flex-col min-h-0 overflow-y-auto">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h3 className="text-sm font-bold text-slate-700">즐겨찾기</h3>
        <div className="flex items-center gap-3">
          {/* 새로고침 버튼 */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-1.5 rounded-full text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
            aria-label="새로고침"
            aria-busy={refreshing}
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>

          {state.favorites.length > 0 && (
            <button
              onClick={() => setEditMode((v) => !v)}
              className="text-xs text-slate-500 font-medium hover:text-slate-600"
            >
              {editMode ? "완료" : "편집"}
            </button>
          )}
          <button
            onClick={() => onNavigate("my")}
            className="text-xs text-blue-600 font-medium hover:underline"
          >
            전체보기
          </button>
        </div>
      </div>
      {state.favorites.length === 0 ? (
    <button
      onClick={() => onNavigate("bus")}
      className="w-full py-10 text-center border-t border-slate-100 hover:bg-slate-50 transition-colors active:scale-[0.99]"
    >
      <Star className="w-7 h-7 text-slate-400 mx-auto mb-2" />
      <p className="text-sm text-slate-500">즐겨찾기를 추가해 보세요</p>
    </button>
  ) : (
    // 개별 카드(테두리+그림자+radius) 대신 하나의 리스트 컨테이너 + 얇은
    // 구분선(Divider)만 사용. 항목이 많아질수록 카드형은 시각 노이즈만
    // 늘고, 이 화면의 핵심 행동(빠른 스캔)엔 방해가 된다.
    <div className="max-h-[50vh] overflow-y-auto divide-y divide-slate-100 border-t border-slate-100">
  {state.favorites.map((fav) => {
        const isRoute = fav.type === "route";
        const matchedRoute = isRoute
          ? routes?.find((r) => r.id === fav.refId)
          : undefined;
        const isMain = matchedRoute ? getRouteTypeLabel(matchedRoute.name) === "본선" : true;

        // 톤온톤 배지(강한 색+옅은 배경 박스) 대신 텍스트 색만으로 구분
        const labelColor = isRoute ? (isMain ? "text-slate-700" : "text-emerald-700") : "text-slate-700";

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
              className={`w-full py-3.5 pl-1 flex items-center gap-3 text-left hover:bg-slate-50 transition-colors ${
                editMode ? "pr-10" : "pr-1"
              }`}
            >
              {/* 왼쪽: 본선/분선 텍스트 라벨 — 배경 박스 없음 */}
              <div className="min-w-[44px] shrink-0">
                <span className={`font-bold text-xs leading-tight ${labelColor}`}>
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
                className="absolute top-1/2 -translate-y-1/2 right-0 w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center active:scale-90 transition-transform"
                aria-label="즐겨찾기 삭제"
              >
                <X className="w-3.5 h-3.5" strokeWidth={3} />
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
          <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md shadow-2xl p-6 pb-safe-6 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">지역 설정</h2>
              <button
                type="button"
                onClick={() => setRegionUnderDevOpen(false)}
                className="p-3 -m-3 rounded-full hover:bg-slate-100"
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