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

function ArrivalSkeleton() {
  /* 도착 줄과 같은 높이(26px)로 깔아 둔다. 값이 들어올 때 줄 높이가
     그대로라 카드가 커졌다 작아졌다 하지 않는다 — 20초마다 갱신되므로
     여기서 1px이라도 달라지면 목록 전체가 주기적으로 흔들린다. */
  return <div className="h-[26px] w-[86px] rounded-md bg-slate-200/70 animate-pulse" />;
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
     큰 글자에는 시간만 넣고 정거장 수는 작은 글자로 옆에 붙인다. */
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

  /* 한 덩어리로 쌓는다: 정류장명 → 도착 시간 → 신뢰도·방향.
     도착 시간을 오른쪽 고정폭 열에 두는 방식도 써 봤지만, 이름이 길면
     가운데가 좁아지고 시간과 이름이 화면 양 끝으로 갈라져 한 카드가 두
     덩어리로 읽혔다. 세로로 쌓으면 왼쪽 한 줄로 시선이 내려간다. */
  return (
    <div className="flex-1 min-w-0">
      <p className="text-[13px] font-semibold text-ink truncate">
        {isRoute ? `${routeNumber}번` : fav.name}
      </p>

      {/* 도착 줄. min-h로 높이를 고정해 로딩 → 값 → 오류 사이에
          카드 높이가 변하지 않게 한다. */}
      <div className="mt-0.5 flex items-baseline gap-2 min-w-0 min-h-[26px]">
        {/* 정류장만 또는 노선만 저장한 즐겨찾기는 도착 시간을 계산할 대상이
            정해지지 않아 "준비중"이 된다. 데이터 오류가 아니라 정상 상태다.
            뒤에 붙는 안내는 별도 버튼이 아니라, 카드를 누르면 무슨 일이
            생기는지 설명하는 글이다. 그래서 파란색을 쓰지 않는다. */}
        {!isStopRoute && (
          <>
            <span className="text-lg font-semibold text-faint shrink-0">
              준비중
            </span>
            <span className="flex items-center gap-0.5 text-[11px] text-muted shrink-0">
              {isRoute ? "정류장 보기" : "노선 보기"}
              <ChevronDown className="w-3 h-3 -rotate-90" />
            </span>
          </>
        )}

        {isStopRoute && status === "loading" && !data && <ArrivalSkeleton />}

        {isStopRoute && data && (
          <>
            {/* tabular-nums: 20초마다 값이 갱신될 때 자릿수가 바뀌어도
                숫자 폭이 고정이라 옆의 정거장 수가 좌우로 밀리지 않는다. */}
            <span
              className={`text-[26px] leading-none font-bold tracking-tight tabular-nums shrink-0 ${etaTone}`}
            >
              {timeLabel}
            </span>
            {stopsLabel && (
              <span className="text-xs text-muted tabular-nums shrink-0">
                {stopsLabel}
              </span>
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
        {/* shrink-0이 없으면 옆 문구에 밀려 "실시간"이 두 글자씩 접힌다. */}
        {isStopRoute && data && (
          <span className="shrink-0">
            <ReliabilityTag reliability={reliability} />
          </span>
        )}
        {subtitle && <p className="text-xs text-faint truncate">{subtitle}</p>}
        {/* 갱신 중에도 이름은 계속 보여야 한다. 예전에는 이 문구가 아랫줄을
            통째로 대신해서, 갱신이 길어지면 이름이 사라졌다. */}
        {isStopRoute && isRefreshing && (
          <span className="text-xs text-faint shrink-0">· 갱신 중</span>
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
      {/* 파란 헤더의 길이를 마이 탭과 같게 맞춘다. 탭을 오갈 때 파란 면이
          위아래로 18px씩 움직이면 화면이 갈아끼워지는 것처럼 보인다.
          높이를 숫자로 고정하지 않고 마이 탭과 같은 구성으로 맞춘다 —
          pt-safe-16 + 64px 내용 + pb-9. 그래야 노치가 있는 기기에서
          pt-safe-16이 늘어날 때 두 화면이 같이 늘어난다.
          (마이 탭의 64px은 프로필 원, 여기서는 아래 min-h-16이다.) */}
      <header className="bg-brand text-white px-5 pt-safe-16 pb-9 shrink-0">
        {/* 내용 자체는 약 50px이지만 min-h-16으로 마이 탭의 프로필 원과 같은
            64px을 차지하게 한다. 남는 공간은 justify-center로 위아래에
            똑같이 나뉜다. */}
        <div className="flex flex-col justify-center min-h-16">
          {/* 앱 이름 아래 정체성 한 줄이 없으면 헤더가 비어 보인다. 지웠던
              부제를 문구를 줄여 다시 넣되, 도시 선택기(14px medium, 흰 알약)
              보다 약해야 하므로 크기·굵기·명도를 모두 한 단계씩 내렸다.
              실측 무게(잉크 폭 x 글자 크기 x 대비/21): 도착 시간 1910,
              BUS STOP 655, 도시 선택기 125, 이 부제 102.
              leading-4는 헤더가 부제 때문에 필요 이상 자라지 않게 하는 값이다. */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight">BUS STOP</h1>
            <button
              onClick={() => setRegionUnderDevOpen(true)}
              /* 알약 배경이 눈에 보이므로 패딩을 키우면 알약 자체가 커진다.
                 투명한 ::before로 위아래만 6px씩 넓혀(32→44px) 보이는 크기는
                 그대로 두고 누를 수 있는 영역만 확보한다. */
              className={`relative flex items-center gap-1 bg-white/15 rounded-full px-3 py-1.5 text-sm font-medium active:bg-white/25 before:content-[''] before:absolute before:inset-x-0 before:-inset-y-1.5 ${PRESSABLE}`}
            >
              <MapPin className="w-4 h-4" />
              <span>{state.region.sigungu}</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="mt-0.5 text-[11px] leading-4 font-normal text-white/80">
            전주시 버스
          </p>
        </div>
      </header>

      {/* 검색은 정보를 보여주는 카드가 아니라 다른 화면으로 가는 입구다.
          즐겨찾기 카드와 같은 격으로 보이면 안 된다 — 홈을 여는 이유는
          검색이 아니라 저장한 버스가 언제 오는지다. 그래서 검색은 낮춘다.

          그림자를 뺀 이유: 화면에서 유일한 그림자가 가장 덜 중요한 요소에
          붙어 있어서, 즐겨찾기보다 더 떠 보였다.
          설명문은 한 번 뺐다가 되돌렸다. 제목만 남기니 이 영역이 무엇으로
          들어가는 입구인지가 "전체 노선 검색" 다섯 글자에만 걸려 있었다.
          대신 원래의 text-slate-400을 같은 값의 토큰(text-faint)으로 바꾸고
          12px·regular를 유지해, 카드 안에서 제목보다 확실히 아래에 둔다. */}
      {/* 파란 헤더를 파고드는 깊이도 마이 탭과 같은 -mt-3(12px)으로 둔다.
          헤더 길이만 맞추고 이 값이 다르면, 카드 위로 보이는 파란 면의
          양이 화면마다 달라 탭을 오갈 때 여전히 다르게 보인다. */}
      <section className="px-4 -mt-3 shrink-0">
        <button
          onClick={() => onNavigate("bus")}
          /* 테두리를 뺀다. 검색과 즐겨찾기 카드가 둘 다 "흰 배경 + 1px 테두리
             + 둥근 모서리"라 크기로만 구분되고 재질이 같았다. 테두리가 없으면
             검색은 가벼운 진입 영역, 즐겨찾기는 테두리를 두른 콘텐츠 카드로
             갈린다. 배경색·높이·글자·아이콘은 그대로다. */
          className={`w-full bg-surface rounded-2xl px-4 py-3 flex items-center gap-3 ${PRESSABLE}`}
        >
          <Search className="w-[18px] h-[18px] text-brand shrink-0" />
          <span className="flex-1 min-w-0 text-left">
            <span className="block text-sm font-semibold text-ink truncate">
              전체 노선 검색
            </span>
            <span className="mt-0.5 block text-xs text-faint truncate">
              노선번호·기점·종점으로 찾아보세요
            </span>
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
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              /* 아이콘 크기(15px)는 그대로 두고 상자만 44×44로. 평소에는 배경이
                 없어 보이는 변화가 없고, 누를 때 생기는 원만 커진다.
                 음수 마진으로 주변 배치가 밀리지 않게 상쇄한다. */
              /* 음수 마진을 사방에 주면 오른쪽으로도 10px 당겨져 옆 버튼(편집)의
                 터치 영역과 겹친다. 왼쪽과 위아래만 당긴다 — 오른쪽은 옆 버튼과의
                 간격을 그대로 남겨 둬야 한다. */
              className={`w-11 h-11 -my-2.5 -ml-2.5 flex items-center justify-center rounded-full text-faint active:bg-slate-200/60 disabled:opacity-40 ${PRESSABLE}`}
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
                /* 글자는 13px. 12px일 때는 "편집" 글자폭(20.8px)보다 버튼 사이
                   간격(30px)이 더 넓어, 오른쪽 세 개가 한 덩어리로 안 읽히고
                   따로 떠 보였다.
                   좌우 패딩은 8px까지만 준다. 간격이 글자폭보다 좁아지면서
                   셋이 하나로 묶인다(글자 사이 30 -> 22px). 모자란 폭은
                   투명한 ::before로 채워 터치 영역은 44px을 유지한다 —
                   버튼 사이 6px을 양쪽에서 3px씩 먹으므로 맞닿기만 하고
                   겹치지는 않는다. */
                className={`relative min-h-11 flex items-center px-2 rounded-lg text-[13px] text-muted font-medium active:bg-slate-200/60 before:content-[''] before:absolute before:-inset-x-[3px] before:inset-y-0 ${PRESSABLE}`}
              >
                {editMode ? "완료" : "편집"}
              </button>
            )}
            <button
              onClick={() => onNavigate("my")}
              className={`relative min-h-11 flex items-center px-2 rounded-lg text-[13px] text-brand font-medium active:bg-brand/10 before:content-[''] before:absolute before:-inset-x-[3px] before:inset-y-0 ${PRESSABLE}`}
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
                    /* 편집 모드에서는 삭제 버튼이 카드 오른쪽에 겹쳐 앉는다.
                       오른쪽 여백을 늘려 글자가 그 아래로 들어가지 않게 한다. */
                    className={`w-full py-4 pl-4 flex items-center gap-3.5 text-left rounded-2xl ${
                      editMode ? "pr-14" : "pr-4"
                    } ${PRESSABLE}`}
                  >
                    {/* 왼쪽 배지: 노선번호(크게) 위에 본선/분선(작게)을 한 덩어리로. */}
                    <div
                      className={`w-14 py-1.5 rounded-xl flex flex-col items-center justify-center shrink-0 ${badgeBg}`}
                    >
                      <span className="font-bold text-base leading-none tracking-tight truncate max-w-full px-1 text-white">
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
