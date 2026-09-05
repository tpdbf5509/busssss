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
import type { Route } from "@/types/route";
import { isMainRoute } from "@/lib/routeCategory";

function FavoriteArrivalInfo({
  fav,
  isRoute,
  routeNumber,
  directionLabel,
  routeInterval,
  route,
  routesLoaded,
}: {
  fav: Favorite;
  isRoute: boolean;
  routeNumber: string;
  /** stop_route일 때 기점 → 종점 표시용 */
  directionLabel?: string;
  /** A1 지연 판정 기준(배차간격) 계산용 */
  routeInterval?: string;
  /** 있으면 노선상세와 같은 GPS 위치로 정거장 수를 검증한다 */
  route?: Route;
  /** allRoutes 조회가 끝났는지. 끝나기 전엔 route가 "아직 못 찾음"과
   *  "이 노선은 없음"을 구분할 수 없어, 조회를 시작하지 않고 기다린다 —
   *  안 그러면 route 없이 한 번 조회해 GPS 검증 없는 값이 화면에 잠깐
   *  찍혔다가 바뀌는 깜빡임이 생긴다. */
  routesLoaded: boolean;
}) {
  const isStopRoute = fav.type === "stop_route";
  const canFetch = isStopRoute && routesLoaded;
  const { data, status, isRefreshing, reliability } = useArrivalInfo(
    canFetch ? fav.tagoNodeId : undefined,
    canFetch ? fav.tagoRouteId : undefined,
    canFetch ? (fav.routeNumber ?? routeNumber) : undefined,
    canFetch ? routeInterval : undefined,
    canFetch ? route : undefined,
  );

  let subtitle: string;
  if (isRoute) {
    subtitle = "노선";
  } else if (!isStopRoute) {
    subtitle = "정류장";
  } else if (directionLabel) {
    // 같은 번호 반대 방향을 구분하기 위해 기점→종점을 표시
    subtitle = directionLabel;
  } else {
    /* 도착 시간은 카드에서 가장 큰 글자로 따로 표시되고, 노선 번호는 왼쪽
       배지에 이미 들어 있다. 방향 정보가 없을 때 여기에 번호를 다시 쓰면
       같은 값이 한 카드에 두 번 나오므로 비워 둔다. */
    subtitle = "";
  }

  /* formatArrivalText는 "12분 후 · 3정거장"처럼 두 정보를 한 문자열로 합친다.
     이걸 통째로 26px로 키우면 좁은 화면에서 배지 옆 공간을 넘어간다. 큰
     글자에는 시간만 넣고 정거장 수는 작은 글자로 옆에 붙인다. */
  const full = data ? formatArrivalText(data.minutes, data.stopsAway) : "";
  const [timeLabel, stopsLabel] = full.includes(" · ")
    ? full.split(" · ")
    : [full, ""];

  const bottomLabel = isStopRoute && isRefreshing ? "갱신 중" : subtitle;

  /* 이 카드에서 사용자가 가장 먼저 알고 싶은 것은 "내 버스 언제 오지?"다.
     그래서 도착 시간을 카드에서 제일 큰 글자로 두고, 정류장명과 방향은 그
     위아래에 보조로 붙인다. 이전에는 정류장명(text-sm semibold)과 도착
     시간(text-sm bold)이 사실상 같은 크기라 눈이 어디로 갈지 정해지지
     않았다. */
  return (
    <div className="flex-1 min-w-0">
      <p className="text-[13px] font-semibold text-ink truncate">
        {isRoute ? `${routeNumber}번` : fav.name}
      </p>

      <div className="mt-0.5 flex items-baseline gap-2 min-w-0">
        {!isStopRoute && (
          <span className="text-lg font-semibold text-faint">준비중</span>
        )}
        {isStopRoute && status === "loading" && !data && (
          <span className="text-lg font-semibold text-faint">조회 중</span>
        )}
        {isStopRoute && data && (
          <>
            <span
              className={`text-[26px] leading-none font-bold tracking-tight shrink-0 ${
                reliability.delayed
                  ? "text-amber-600"
                  : data.minutes <= 3
                    ? "text-brand"
                    : "text-ink"
              }`}
            >
              {timeLabel}
            </span>
            {stopsLabel && (
              <span className="text-xs text-muted shrink-0">{stopsLabel}</span>
            )}
          </>
        )}
        {isStopRoute && status === "error" && !data && (
          <span className="text-lg font-semibold text-faint">정보 없음</span>
        )}
      </div>

      {/* 신뢰도 태그와 방향 정보는 같은 아랫줄에 둔다. 도착 시간 옆에 함께
          두면 좁은 화면에서 한 줄에 세 덩어리가 몰려 넘친다. */}
      <div className="mt-1 flex items-center gap-2 min-w-0">
        {isStopRoute && data && <ReliabilityTag reliability={reliability} />}
        {bottomLabel && (
          <p className="text-xs text-faint truncate">{bottomLabel}</p>
        )}
      </div>
    </div>
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
    <div className="flex flex-col bg-canvas">
       <header className="bg-brand text-white px-5 pt-safe-16 pb-9 shrink-0">
         {/* My탭 헤더는 아바타(h-16=64px)가 기준이라 더 높다. 텍스트만 있는
             이 헤더도 min-h-16으로 같은 높이를 맞추고 세로 중앙 정렬한다. */}
         <div className="min-h-16 flex flex-col justify-center">
           <div className="flex items-center justify-between mb-1.5">
            <h1 className="text-2xl font-bold tracking-tight">BUS STOP</h1>
            <button
              onClick={() => setRegionUnderDevOpen(true)}
              className="flex items-center gap-1 bg-white/15 backdrop-blur-sm rounded-full px-3 py-1.5 text-sm font-medium hover:bg-white/25 transition-colors"
            >
              <MapPin className="w-4 h-4" />
              <span>{state.region.sigungu}</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-blue-100 text-sm">전주시 버스 노선 정보</p>
         </div>
      </header>
  
      <section className="px-4 -mt-3 shrink-0">
        <button
          onClick={() => onNavigate("bus")}
          className="w-full bg-surface rounded-2xl border border-line px-4 py-3.5 flex items-center gap-3 hover:border-brand/40 transition-colors active:scale-[0.99]"
        >
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
            <Search className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-left flex-1">
            <p className="text-sm font-semibold text-slate-800">전체 노선 검색</p>
            <p className="text-xs text-slate-400 mt-0.5">노선번호·기점·종점으로 찾아보세요</p>
          </div>
          <span className="text-slate-300 text-lg">›</span>
        </button>
      </section>
  
      {/* 이 아래에 기존 즐겨찾기 섹션 그대로 유지 */}

      <section className="px-4 mt-6 shrink-0">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h3 className="text-sm font-bold text-ink">즐겨찾기</h3>
        <div className="flex items-center gap-3">
          {/* 새로고침 버튼 */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-1.5 rounded-full text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
            aria-label="새로고침"
            aria-busy={refreshing}
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>

          {state.favorites.length > 0 && (
            <button
              onClick={() => setEditMode((v) => !v)}
              className="text-xs text-slate-400 font-medium hover:text-slate-600"
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
      className="w-full bg-surface rounded-2xl p-6 text-center border border-line hover:border-brand/40 transition-colors active:scale-[0.99]"
    >
      <Star className="w-8 h-8 text-slate-300 mx-auto mb-2" />
      <p className="text-sm text-slate-400">즐겨찾기를 추가해 보세요</p>
    </button>
  ) : (
    <div className="space-y-2">
  {state.favorites.map((fav) => {
        const isRoute = fav.type === "route";
        const isStopRoute = fav.type === "stop_route";
        const isStation = fav.type === "station";
        const targetId = isStopRoute ? fav.appRouteId : fav.refId;

        const matchedRoute = isRoute
          ? routes?.find((r) => r.id === fav.refId)
          : undefined;

        // stop_route: appRouteId로 실제 노선 방향을 찾아 기점→종점 표시
        const stopRoute = isStopRoute && fav.appRouteId
          ? routes?.find((r) => r.id === fav.appRouteId)
          : undefined;
        const directionLabel = stopRoute
          ? `${stopRoute.start || "기점"} → ${stopRoute.end || "종점"}`
          : undefined;

        // route와 stop_route는 실제 버스 노선이라 본선/분선 카테고리 색을
        // 적용한다. station(집/회사)은 노선 카테고리가 없어 브랜드 블루로
        // 통일 — 셋 다 배경을 칠해 즐겨찾기 배지끼리 시각적으로 일관되게 한다.
        const categoryRoute = matchedRoute ?? stopRoute;
        const isMain = categoryRoute ? isMainRoute(categoryRoute.name) : true;
        const badgeBg = isMain ? "bg-blue-500" : "bg-emerald-500";
        const badgeText = "text-white";

        const routeNumber =
          matchedRoute?.number ?? fav.name.replace(/번$/, "").trim();

        /* 배지에 넣을 노선 번호. stop_route는 name이 정류장 이름이라
           routeNumber를 그대로 쓰면 배지에 정류장명이 들어간다. */
        const badgeNumber =
          matchedRoute?.number ??
          fav.routeNumber ??
          stopRoute?.number ??
          routeNumber;

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
              // appRouteId가 없는 stop_route는 targetId가 undefined라
              // onNavigate가 탭만 바꾸고 끝나 아무 반응이 없어 보인다.
              // 딥링크(App.tsx)와 동일하게 정류장 화면으로라도 보낸다.
              if (!targetId && isStopRoute && fav.tagoNodeId && fav.stopName) {
                onNavigate("bus", undefined, {
                  id: fav.tagoNodeId,
                  name: fav.stopName,
                });
                return;
              }
              onNavigate("bus", targetId);
              return;
            }
          }}
              className="w-full bg-surface rounded-xl border border-line px-3.5 py-4 flex items-center gap-3 text-left hover:border-brand/40 transition-colors"
            >
              {/* 왼쪽 배지: 노선번호(크게) 위에 본선/분선(작게)을 한 덩어리로.
                  전에는 배지에 "본선"만 있고 번호는 옆 텍스트에 "101번"으로
                  떨어져 있어서, 어느 노선인지 두 군데를 봐야 알 수 있었다. */}
              <div
                className={`min-w-[56px] py-1.5 rounded-xl flex flex-col items-center justify-center shrink-0 px-2 ${badgeBg}`}
              >
                <span
                  className={`font-bold text-base leading-none tracking-tight truncate max-w-full ${badgeText}`}
                >
                  {isStation ? fav.label : badgeNumber}
                </span>
                <span className={`text-[10px] leading-none mt-1 opacity-80 ${badgeText}`}>
                  {isStation ? "정류장" : isMain ? "본선" : "분선"}
                </span>
              </div>

            {/* 가운데: 정류장명 + 노선 방향 / 오른쪽: 도착정보 배지 */}
            <FavoriteArrivalInfo
              fav={fav}
              isRoute={isRoute}
              routeNumber={routeNumber}
              directionLabel={directionLabel}
              routeInterval={stopRoute?.interval}
              route={stopRoute}
              routesLoaded={routes !== undefined}
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

      {/* 즐겨찾기 아래 빈 공간. 비워두면 화면이 목업처럼 보이고, 즐겨찾기에
          없는 노선을 다시 찾으려면 매번 검색해야 한다. 최근에 연 노선을
          바로 다시 열 수 있게 둔다. */}
      {state.recentRoutes.length > 0 && (
        <section className="px-4 mt-6 shrink-0">
          <h3 className="text-sm font-bold text-ink mb-3">최근 본 노선</h3>
          <div className="space-y-2">
            {state.recentRoutes.map((recent) => (
              <button
                key={recent.id}
                onClick={() => onNavigate("bus", recent.id)}
                className="w-full bg-surface rounded-xl border border-line px-3.5 py-3 flex items-center gap-3 text-left hover:border-brand/40 transition-colors"
              >
                <span className="min-w-[56px] text-center font-bold text-sm text-ink shrink-0">
                  {recent.number}
                </span>
                <span className="flex-1 min-w-0 text-xs text-muted truncate">
                  {recent.start && recent.end
                    ? `${recent.start} → ${recent.end}`
                    : "노선 정보"}
                </span>
                <span className="text-faint text-lg shrink-0">›</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="h-6 shrink-0" />

      {regionUnderDevOpen && (
        <div className="fixed top-0 left-0 right-0 h-app-shell z-50 flex items-end sm:items-center justify-center">
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