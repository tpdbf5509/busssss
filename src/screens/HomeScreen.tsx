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

/* 카드를 누를 때 쓰는 공통 클래스.
   hover는 모바일에 없고 iOS에서는 탭 후 상태가 남아 카드가 눌린 채로
   보이는 문제가 있다. 그래서 hover를 쓰지 않고 active만 쓴다.
   touch-manipulation은 더블탭 확대를 끄고 탭 반응 지연(300ms)을 없앤다. */
const PRESSABLE =
  "select-none touch-manipulation transition-transform duration-100 " +
  "active:scale-[0.98]";

/* 도착 시간이 들어가는 열의 폭. 모든 카드에서 같은 값을 써야
   정류장 이름 길이와 무관하게 시간이 항상 같은 자리에 온다.
   "정보 없음"(5글자)이 줄바꿈되지 않는 최소 폭으로 잡았다. */
const ETA_COL = "w-[76px] shrink-0 text-right";

function ArrivalSkeleton() {
  /* 로딩 중에 "조회 중" 글자를 넣으면 실제 값으로 바뀔 때 글자 수가 달라져
     레이아웃이 튄다. 완성된 카드와 같은 높이의 회색 블록을 깔아 두면
     값이 들어와도 자리가 그대로다. */
  return (
    <div className="flex items-center justify-end gap-1.5">
      <div className="h-[26px] w-12 rounded-md bg-slate-200/70 animate-pulse" />
    </div>
  );
}

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
    /* 도착 시간은 오른쪽 열에 따로 표시되고, 노선 번호는 왼쪽 배지에
       이미 들어 있다. 방향 정보가 없을 때 여기에 번호를 다시 쓰면
       같은 값이 한 카드에 두 번 나오므로 비워 둔다. */
    subtitle = "";
  }

  /* formatArrivalText는 "12분 후 · 3정거장"처럼 두 정보를 한 문자열로 합친다.
     시간은 오른쪽 열에 크게, 정거장 수는 그 아래 작게 나눠 넣는다. */
  const full = data ? formatArrivalText(data.minutes, data.stopsAway) : "";
  const [timeLabel, stopsLabel] = full.includes(" · ")
    ? full.split(" · ")
    : [full, ""];

  const bottomLabel = isStopRoute && isRefreshing ? "갱신 중" : subtitle;

  /* 도착 시간 색.
     지연이면 주황, 3분 이하면 브랜드 블루, 그 외엔 기본 먹색.
     색만으로 구분하지 않도록 지연 상태에는 ReliabilityTag가 아래에 함께 뜬다. */
  const etaTone = !data
    ? "text-faint"
    : reliability.delayed
      ? "text-amber-600"
      : data.minutes != null && data.minutes <= 3
        ? "text-brand"
        : "text-ink";

  return (
    <>
      {/* 왼쪽: 이름 + 방향. 오른쪽 도착 열을 침범하지 않도록 min-w-0로 묶는다. */}
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-semibold text-ink truncate leading-snug">
          {isRoute ? `${routeNumber}번` : fav.name}
        </p>

        <div className="mt-1 flex items-center gap-1.5 min-w-0">
          {isStopRoute && data && <ReliabilityTag reliability={reliability} />}
          {bottomLabel && (
            <p className="text-xs text-faint truncate">{bottomLabel}</p>
          )}
        </div>
      </div>

      {/* 오른쪽: 도착 정보 전용 열. 폭이 고정이라 카드마다 시간이 같은 자리에 온다. */}
      <div className={ETA_COL}>
        {!isStopRoute && (
          <span className="text-sm font-medium text-faint">준비중</span>
        )}

        {isStopRoute && status === "loading" && !data && <ArrivalSkeleton />}

        {isStopRoute && data && (
          <>
            {/* tabular-nums: 20초마다 값이 갱신될 때 자릿수가 바뀌어도
                숫자 폭이 고정이라 오른쪽 끝이 흔들리지 않는다. */}
            <p
              className={`text-[26px] leading-none font-bold tracking-tight tabular-nums ${etaTone}`}
            >
              {timeLabel}
            </p>
            {stopsLabel && (
              <p className="mt-1 text-[11px] text-muted tabular-nums">
                {stopsLabel}
              </p>
            )}
          </>
        )}

        {isStopRoute && status === "error" && !data && (
          <span className="text-sm font-medium text-faint">정보 없음</span>
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
    <div className="flex flex-col bg-canvas">
      <header className="bg-brand text-white px-5 pt-safe-16 pb-10 shrink-0">
        {/* My탭 헤더는 아바타(h-16=64px)가 기준이라 더 높다. 텍스트만 있는
            이 헤더도 min-h-16으로 같은 높이를 맞추고 세로 중앙 정렬한다. */}
        <div className="min-h-16 flex flex-col justify-center">
          <div className="flex items-center justify-between mb-1.5">
            <h1 className="text-2xl font-bold tracking-tight">BUS STOP</h1>
            <button
              onClick={() => setRegionUnderDevOpen(true)}
              className={`flex items-center gap-1 bg-white/15 rounded-full px-3 py-1.5 text-sm font-medium active:bg-white/25 ${PRESSABLE}`}
            >
              <MapPin className="w-4 h-4" />
              <span>{state.region.sigungu}</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-white/70 text-sm">전주시 버스 노선 정보</p>
        </div>
      </header>

      {/* 검색은 정보를 보여주는 카드가 아니라 다른 화면으로 가는 입구다.
          즐겨찾기 카드와 구분하려고 테두리를 빼고 헤더에 더 깊게 겹쳐
          띄운다. 그림자는 헤더 위에 떠 있다는 신호로만 쓴다. */}
      <section className="px-4 -mt-6 shrink-0">
        <button
          onClick={() => onNavigate("bus")}
          className={`w-full bg-surface rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-[0_4px_16px_-4px_rgba(15,23,42,0.18)] ${PRESSABLE}`}
        >
          <Search className="w-5 h-5 text-brand shrink-0" />
          <div className="text-left flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink">전체 노선 검색</p>
            <p className="text-xs text-faint mt-0.5 truncate">
              노선번호·기점·종점으로 찾아보세요
            </p>
          </div>
          <ChevronDown className="w-4 h-4 text-faint -rotate-90 shrink-0" />
        </button>
      </section>

      <section className="px-4 mt-7 shrink-0">
        {/* 섹션 제목은 항목 이름보다 작고 연하게. 제목이 내용만큼 진하면
            화면에 같은 무게의 글자가 반복돼 위계가 사라진다. */}
        <div className="flex items-center justify-between mb-2.5 px-0.5">
          <h3 className="text-xs font-semibold text-muted tracking-wide">
            즐겨찾기
          </h3>
          <div className="flex items-center gap-1">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className={`p-2 -m-0.5 rounded-full text-faint active:bg-slate-200/60 disabled:opacity-40 ${PRESSABLE}`}
              aria-label="새로고침"
              aria-busy={refreshing}
            >
              <RefreshCw
                className={`w-[15px] h-[15px] ${refreshing ? "animate-spin" : ""}`}
              />
            </button>

            {state.favorites.length > 0 && (
              <button
                onClick={() => setEditMode((v) => !v)}
                className={`px-2 py-1 rounded-lg text-xs text-muted font-medium active:bg-slate-200/60 ${PRESSABLE}`}
              >
                {editMode ? "완료" : "편집"}
              </button>
            )}
            <button
              onClick={() => onNavigate("my")}
              className={`px-2 py-1 rounded-lg text-xs text-brand font-medium active:bg-brand/10 ${PRESSABLE}`}
            >
              전체보기
            </button>
          </div>
        </div>

        {state.favorites.length === 0 ? (
          <button
            onClick={() => onNavigate("bus")}
            className={`w-full bg-surface rounded-2xl p-7 text-center ${PRESSABLE}`}
          >
            <Star className="w-7 h-7 text-slate-300 mx-auto mb-2.5" />
            <p className="text-sm font-medium text-ink">
              즐겨찾기를 추가해 보세요
            </p>
            <p className="text-xs text-faint mt-1">
              자주 타는 버스의 도착 시간을 바로 볼 수 있어요
            </p>
          </button>
        ) : (
          /* 카드마다 테두리를 그리는 대신 하나의 흰 판 안에서 구분선으로
             나눈다. 테두리 박스가 여러 개 쌓이면 문서처럼 보이고,
             한 판으로 묶으면 리스트가 하나의 덩어리로 읽힌다.
             divide-y는 첫 행 위에는 선을 넣지 않아 위쪽이 깔끔하다. */
          <div className="bg-surface rounded-2xl overflow-hidden divide-y divide-line">
            {state.favorites.map((fav) => {
              const isRoute = fav.type === "route";
              const isStopRoute = fav.type === "stop_route";
              const isStation = fav.type === "station";
              const targetId = isStopRoute ? fav.appRouteId : fav.refId;

              const matchedRoute = isRoute
                ? routes?.find((r) => r.id === fav.refId)
                : undefined;

              // stop_route: appRouteId로 실제 노선 방향을 찾아 기점→종점 표시
              const stopRoute =
                isStopRoute && fav.appRouteId
                  ? routes?.find((r) => r.id === fav.appRouteId)
                  : undefined;
              const directionLabel = stopRoute
                ? `${stopRoute.start || "기점"} → ${stopRoute.end || "종점"}`
                : undefined;

              // route와 stop_route는 실제 버스 노선이라 본선/분선 카테고리 색을
              // 적용한다. station(집/회사)은 노선 카테고리가 없어 브랜드 블루로
              // 통일 — 셋 다 배경을 칠해 즐겨찾기 배지끼리 시각적으로 일관되게 한다.
              const categoryRoute = matchedRoute ?? stopRoute;
              const isMain = categoryRoute
                ? isMainRoute(categoryRoute.name)
                : true;
              const badgeBg = isMain ? "bg-blue-500" : "bg-emerald-500";

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
                          arsId:
                            fav.label !== "정류장" ? fav.label : undefined,
                        });
                        return;
                      }
                      if (isRoute || isStopRoute) {
                        // appRouteId가 없는 stop_route는 targetId가 undefined라
                        // onNavigate가 탭만 바꾸고 끝나 아무 반응이 없어 보인다.
                        // 딥링크(App.tsx)와 동일하게 정류장 화면으로라도 보낸다.
                        if (
                          !targetId &&
                          isStopRoute &&
                          fav.tagoNodeId &&
                          fav.stopName
                        ) {
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
                    /* 행 전체가 하나의 터치 영역이다. 눌렀을 때 배경이
                       바뀌는 건 iOS/안드로이드 리스트의 기본 동작이라
                       이것만으로 "앱을 누르고 있다"는 느낌이 생긴다.
                       카드를 축소하지 않는 이유: 한 판 안의 행이라
                       scale을 주면 이웃 행과 경계가 어긋나 보인다. */
                    className="w-full px-4 py-3.5 flex items-center gap-3 text-left select-none touch-manipulation transition-colors duration-75 active:bg-slate-100"
                  >
                    {/* 왼쪽 배지: 노선번호(크게) 위에 본선/분선(작게)을 한 덩어리로. */}
                    <div
                      className={`w-14 py-1.5 rounded-lg flex flex-col items-center justify-center shrink-0 ${badgeBg}`}
                    >
                      <span className="font-bold text-[15px] leading-none tracking-tight truncate max-w-full px-1 text-white">
                        {isStation ? fav.label : badgeNumber}
                      </span>
                      <span className="text-[10px] leading-none mt-1 text-white/75">
                        {isStation ? "정류장" : isMain ? "본선" : "분선"}
                      </span>
                    </div>

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
                      aria-label={`${fav.name} 즐겨찾기 삭제`}
                      className="absolute top-1/2 -translate-y-1/2 right-3 w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center active:scale-90 transition-transform touch-manipulation"
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

      {/* 최근 본 노선은 과거 기록이라 즐겨찾기보다 가볍게 둔다.
          흰 판 없이 배경 위에 바로 얹고, 구분선만으로 행을 나눈다. */}
      {state.recentRoutes.length > 0 && (
        <section className="px-4 mt-7 shrink-0">
          <h3 className="text-xs font-semibold text-muted tracking-wide mb-1 px-0.5">
            최근 본 노선
          </h3>
          <div className="divide-y divide-line">
            {state.recentRoutes.map((recent) => (
              <button
                key={recent.id}
                onClick={() => onNavigate("bus", recent.id)}
                className="w-full px-0.5 py-3 flex items-center gap-3 text-left select-none touch-manipulation transition-colors duration-75 active:bg-slate-200/50"
              >
                <span className="w-14 text-center font-bold text-sm text-ink shrink-0 tabular-nums">
                  {recent.number}
                </span>
                <span className="flex-1 min-w-0 text-xs text-muted truncate">
                  {recent.start && recent.end
                    ? `${recent.start} → ${recent.end}`
                    : "노선 정보"}
                </span>
                <ChevronDown className="w-4 h-4 text-faint -rotate-90 shrink-0" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 하단 여백은 고정 px이 아니라 홈 인디케이터 높이를 더해 계산한다.
          BottomNav 높이(56px)는 프로젝트 값에 맞게 조정할 것. */}
      <div
        className="shrink-0"
        style={{ height: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
      />

      {regionUnderDevOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setRegionUnderDevOpen(false)}
          />
          <div
            className="relative bg-surface rounded-t-3xl sm:rounded-3xl w-full max-w-md shadow-2xl p-6 animate-slide-up"
            style={{
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-ink">지역 설정</h2>
              <button
                type="button"
                onClick={() => setRegionUnderDevOpen(false)}
                aria-label="닫기"
                className={`p-2 rounded-full text-muted active:bg-slate-100 ${PRESSABLE}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-muted leading-relaxed">
              이 기능은 현재 개발 중입니다.
              <br />
              향후 업데이트에서 이용하실 수 있습니다.
            </p>
            <button
              type="button"
              onClick={() => setRegionUnderDevOpen(false)}
              className={`mt-6 w-full rounded-2xl bg-brand py-3.5 text-sm font-semibold text-white ${PRESSABLE}`}
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
