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
   폭을 정하는 건 가장 긴 도착 문구다. 고정폭 숫자(tabular-nums)라 어림보다
   넓어서, 실제 렌더로 재보니 28px 굵은 글씨에서 이렇게 나온다.

     곧 도착 77 · 3분 후 71 · 11분 후 89 · 정보 없음 100 · 24정거장 106

   96px이면 시간 문구는 모두 들어가고, 그보다 긴 "N정거장"·"정보 없음"은
   아래 ETA_SIZE에서 글자를 줄여 맞춘다(정류장 상세의 같은 열도 같은 값). */
const ETA_COL = "w-[96px] shrink-0 text-right";

/* 도착 시간 글자 크기.
   "3분 후"처럼 실제 시간이 있으면 화면에서 가장 크게 둔다 — 사용자가 이
   카드에서 찾는 단 하나의 값이다. 시간을 못 구해 정거장 수만 남았거나
   정보가 없을 때는 문구가 길어져 열을 넘치므로 한 단계 줄인다(22px에서
   24정거장 84px, 정보 없음 79px으로 96px 안에 들어간다). */
const ETA_SIZE = { time: "text-[28px]", weak: "text-[22px]" } as const;

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

  /* 아랫줄 문구.
     정류장 즐겨찾기는 사용자가 붙인 이름이 이미 왼쪽 배지에 들어간다("집",
     "회사"). 반면 노선·정류장 도착정보는 배지 자리에 노선 번호가 들어가서,
     이름을 바꿔도 홈 어디에도 나오지 않았다 — 마이 화면에서만 보여서 "이름
     변경이 저장되지 않는다"고 보였다. 마이 화면과 같은 순서로 여기 앞에 붙인다. */
  const subtitle = !isRoute && !isStopRoute
    ? "정류장"
    : [fav.label, directionLabel ?? (isRoute ? "노선" : null)]
        .filter(Boolean)
        .join(" · ");

  /* formatArrivalText는 "12분 후 · 3정거장"처럼 두 정보를 한 문자열로 합친다.
     시간은 오른쪽 열에 크게, 정거장 수는 그 아래 작게 나눠 넣는다. */
  const full = data ? formatArrivalText(data.minutes, data.stopsAway) : "";
  const [timeLabel, stopsLabel] = full.includes(" · ")
    ? full.split(" · ")
    : [full, ""];

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
          {/* shrink-0이 없으면 옆 문구에 밀려 "실시간"이 두 글자씩 접힌다. */}
          {isStopRoute && data && (
            <span className="shrink-0">
              <ReliabilityTag reliability={reliability} />
            </span>
          )}
          {subtitle && (
            <p className="text-xs text-faint truncate">{subtitle}</p>
          )}
          {/* 갱신 중에도 이름은 계속 보여야 한다. 예전에는 이 문구가 아랫줄을
              통째로 대신해서, 갱신이 길어지면 이름이 사라졌다. */}
          {isStopRoute && isRefreshing && (
            <span className="text-xs text-faint shrink-0">· 갱신 중</span>
          )}
        </div>
      </div>

      {/* 오른쪽: 도착 정보 전용 열. 폭이 고정이라 카드마다 시간이 같은 자리에 온다. */}
      <div className={ETA_COL}>
        {/* 정류장만 또는 노선만 저장한 즐겨찾기는 도착 시간을 계산할 대상이
            정해지지 않아 "준비중"이 된다. 데이터 오류가 아니라 정상 상태다.

            그런데 여기서 끝나면 오른쪽이 비어 사용자가 "그래서 뭘 해야 하지"에
            답을 못 얻는다. 누르면 이미 다음 화면으로 가게 돼 있으니(카드 전체가
            버튼이다), 그 동작을 글자로 알려 준다. 별도 버튼을 만들지 않는 건
            일부러다 — 작은 터치 영역을 또 만들면 오탭만 늘어난다. */}
        {!isStopRoute && (
          <>
            <span className="text-sm font-medium text-faint">준비중</span>
            {/* 파란색을 쓰지 않는다. 파랑은 이 앱에서 "누르는 것"을 뜻하는데,
                이건 별도 버튼이 아니라 카드를 누르면 무슨 일이 생기는지
                설명하는 글이다. 파랗게 두면 "여기를 따로 눌러야 하나"로
                읽힌다. 행동 유도가 아니라 행동 가능성의 설명이다. */}
            <span className="mt-1 flex items-center justify-end gap-0.5 text-[11px] text-muted">
              {isRoute ? "정류장 보기" : "노선 보기"}
              <ChevronDown className="w-3 h-3 -rotate-90" />
            </span>
          </>
        )}

        {isStopRoute && status === "loading" && !data && <ArrivalSkeleton />}

        {isStopRoute && data && (
          <>
            {/* tabular-nums: 20초마다 값이 갱신될 때 자릿수가 바뀌어도
                숫자 폭이 고정이라 오른쪽 끝이 흔들리지 않는다. */}
            <p
              className={`${
                data.minutes != null ? ETA_SIZE.time : ETA_SIZE.weak
              } leading-none font-bold tracking-tight tabular-nums ${etaTone}`}
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
      {/* 위쪽 여백(pt-safe-16)은 상태바를 피하는 값이라 줄이지 않는다.
          줄이는 건 아래쪽이다 — 검색이 -mt-6(24px)만큼 올라와 겹치므로
          아래 여백이 40px일 필요가 없다. 브랜드 문구 크기는 그대로 둔다. */}
      <header className="bg-brand text-white px-5 pt-safe-16 pb-8 shrink-0">
        {/* 문구 두 줄의 실제 높이(약 55px)보다 min-h-16(64px)이 커서 그만큼
            빈 공간이 생겼다. 마이 탭 헤더와 높이를 맞추려던 값인데, 두 화면을
            나란히 보는 일이 없어 그 이득보다 손해가 크다. */}
        <div className="flex flex-col justify-center">
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
          즐겨찾기 카드와 같은 격으로 보이면 안 된다 — 홈을 여는 이유는
          검색이 아니라 저장한 버스가 언제 오는지다. 그래서 검색은 낮춘다.

          그림자를 뺀 이유: 화면에서 유일한 그림자가 가장 덜 중요한 요소에
          붙어 있어서, 즐겨찾기보다 더 떠 보였다.
          설명문을 뺀 이유: "노선번호·기점·종점으로 찾아보세요"는 검색 화면에
          들어가면 바로 알 수 있는 내용인데, 홈에서 두 줄을 차지했다. */}
      <section className="px-4 -mt-6 shrink-0">
        <button
          onClick={() => onNavigate("bus")}
          className={`w-full bg-surface rounded-2xl border border-line px-4 py-3 flex items-center gap-3 ${PRESSABLE}`}
        >
          <Search className="w-[18px] h-[18px] text-brand shrink-0" />
          <span className="text-sm font-semibold text-ink flex-1 min-w-0 text-left truncate">
            전체 노선 검색
          </span>
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
          /* 즐겨찾기 하나하나가 "지금 버스가 언제 오는지"를 담은 살아있는
             정보 단위다. 한 판 안에 구분선으로 나누면 설정 목록처럼 읽혀서,
             어느 카드의 도착시간인지가 눈에 안 들어온다. 카드를 독립시키고
             사이를 띄운다. */
          <div className="space-y-2.5">
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

              /* 방향 문구는 노선 즐겨찾기에도 필요하다. 같은 번호의 반대 방향을
                 둘 다 즐겨찾기하면 목록에 "10번 / 노선"이 두 줄로 똑같이 찍혀,
                 눌러 보기 전에는 어느 쪽인지 알 수 없었다. 배지 색(본선 파랑 /
                 분선 초록)만 달랐는데 색만으로 구분하게 두면 안 된다.
                 start/end는 이미 받아 둔 값이라 새로 조회하지 않는다. */
              const directionRoute = matchedRoute ?? stopRoute;
              const directionLabel = directionRoute
                ? `${directionRoute.start || "기점"} → ${directionRoute.end || "종점"}`
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
                <div
                  key={fav.id}
                  /* 카드 한 장. 테두리는 1px로만 두고 그림자는 쓰지 않는다 —
                     카드를 나누는 건 그림자가 아니라 사이의 여백이다. */
                  className="relative bg-surface rounded-2xl border border-line"
                >
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
                    /* 카드 한 장 전체가 하나의 터치 영역이다. 이제 카드가
                       독립돼 있으므로 눌렀을 때 살짝 줄어드는 편이 자연스럽다
                       (한 판 안의 행이었을 때는 이웃 행과 경계가 어긋나
                       보여서 배경색만 바꿨다). */
                    /* 편집 모드에서는 삭제 버튼이 카드 오른쪽 위에 겹쳐 앉는다.
                       오른쪽 여백을 늘려 도착 시간이 그 아래로 들어가지 않게 한다
                       (전에는 "11분 후"의 "후"와 "4정거장"이 가려졌다). */
                    className={`w-full py-4 pl-4 flex items-center gap-3.5 text-left rounded-2xl ${
                      editMode ? "pr-14" : "pr-4"
                    } ${PRESSABLE}`}
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

      {/* 목록 끝과 하단 탭 사이 숨 쉴 틈.
          홈 인디케이터 높이를 여기서 더하지 않는다. 하단 탭은 fixed가 아니라
          이 스크롤 영역 "아래"에 자기 자리를 차지하고(App.tsx의 flex 열),
          안전영역은 탭 자신이 pb-nav-safe로 처리한다. 여기서 또 더하면 노치
          기기에서만 빈 공간이 두 번 생긴다. 실측: 12개 목록을 끝까지 내려도
          마지막 행과 탭 사이가 57.7px 남는다. */}
      <div className="h-6 shrink-0" />

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
