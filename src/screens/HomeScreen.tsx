import { useEffect, useState } from "react";
import { useApp } from "@/store/appContext";
import { useAsync } from "@/hooks/useAsync";
import { fetchAllRoutes } from "@/services/routeService";
import { loadAlertRecords } from "@/services/alertMonitorService";
import { showToast } from "@/lib/toastStore";
import type { TabId } from "@/components/BottomNav";
import {
  AlertTriangle,
  Bell,
  BellRing,
  Bus,
  ChevronDown,
  ChevronRight,
  MapPin,
  Navigation,
  Pin,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useArrivalInfo } from "@/hooks/useArrivalInfo";
import { HeroArrivalCard, HeroEmptyCard } from "@/components/HeroArrivalCard";
import { triggerArrivalRefresh } from "@/services/arrivalService";
import type { Favorite } from "@/types";
import type { Route } from "@/types/route";
import { isMainRoute } from "@/lib/routeCategory";
import { heroArrivalView, pickHeroFavorite } from "@/lib/heroArrival";
import { favoriteSubtitle, favoriteTitle } from "@/lib/favoriteDisplay";
import { isSettled } from "@/lib/asyncStatus";

/* 카드를 누를 때 쓰는 공통 클래스.
   hover는 모바일에 없고 iOS에서는 탭 후 상태가 남아 카드가 눌린 채로
   보이는 문제가 있다. 그래서 hover를 쓰지 않고 active만 쓴다.
   touch-manipulation은 더블탭 확대를 끄고 탭 반응 지연(300ms)을 없앤다. */
const PRESSABLE =
  "select-none touch-manipulation transition-transform duration-100 " +
  "active:scale-[0.98]";

/* 한 카드 안에 쌓인 행을 누를 때 쓰는 클래스. 행이 줄어들면 위아래 이웃
   행과 경계가 어긋나 보여서, 크기 대신 배경색만 바꾼다(아래 목록 주석 참고). */
const ROW_PRESSABLE =
  "select-none touch-manipulation transition-colors duration-75 active:bg-canvas";

/* 읽지 않은 알림 표시를 다시 읽는 간격. 알림 화면(AlertScreen)과 같은 5초다.
   하차 알람 기록은 알람이 울린 뒤에 저장되므로, 알람 이벤트만 듣고 읽으면
   아직 저장 전인 값을 읽는다. localStorage만 읽고 서버에는 묻지 않는다. */
const UNREAD_POLL_MS = 5_000;

function hasUnreadAlerts(): boolean {
  return loadAlertRecords().some((r) => r.read === false);
}

function ArrivalSkeleton() {
  /* 도착 칸과 같은 크기(분 줄 1.5rem + 정거장 줄 1.125rem)로 깔아 둔다.
     값이 들어올 때 줄 높이가 그대로라 카드가 커졌다 작아졌다 하지 않는다 —
     20초마다 갱신되므로 여기서 1px이라도 달라지면 목록 전체가 주기적으로
     흔들린다. */
  return (
    <>
      <span className="h-6 flex items-center justify-end">
        <span className="block h-5 w-10 rounded-md bg-line animate-pulse" />
      </span>
      <span className="h-4.5 flex items-center justify-end">
        <span className="block h-3 w-12 rounded bg-line animate-pulse" />
      </span>
    </>
  );
}

/**
 * "다른 즐겨찾기" 행의 오른쪽 도착 칸 (DESIGN.md 7-5).
 * 훅은 map 안에서 부를 수 없어 행마다 이 컴포넌트로 뺀다. stop_route 행에만 쓴다.
 */
function FavoriteArrivalInfo({
  fav,
  routeNumber,
  routeInterval,
  route,
  routesLoaded,
}: {
  fav: Favorite;
  routeNumber: string;
  /** A1 지연 판정 기준(배차간격) 계산용 */
  routeInterval?: string;
  /** 있으면 노선상세와 같은 GPS 위치로 정거장 수를 검증한다 */
  route?: Route;
  /** allRoutes 조회가 끝났는지. 끝나기 전엔 route가 "아직 못 찾음"과
   *  "이 노선은 없음"을 구분할 수 없어, 조회를 시작하지 않고 기다린다 —
   *  안 그러면 route 없이 한 번 조회해 GPS 검증 없는 값이 화면에 잠깐
   *  찍혔다가 바뀌는 깜빡임이 생긴다. 조회가 실패로 끝나도 "끝난 것"이라
   *  그때는 route 없이 조회를 시작한다(HomeScreen의 routesLoaded 참고). */
  routesLoaded: boolean;
}) {
  const canFetch = routesLoaded;
  const { data, status, reliability } = useArrivalInfo(
    canFetch ? fav.tagoNodeId : undefined,
    canFetch ? fav.tagoRouteId : undefined,
    canFetch ? (fav.routeNumber ?? routeNumber) : undefined,
    canFetch ? routeInterval : undefined,
    canFetch ? route : undefined,
  );

  /* 상태 판단은 히어로와 같은 함수를 쓴다. 같은 값이 홈의 두 곳에서 다르게
     읽히면 안 된다(곧 도착, 시간 불확실, 정보 없음의 기준이 같아야 한다).
     예전에는 formatArrivalText의 "12분 후 · 3정거장"을 둘로 잘라 썼는데,
     7-5는 "7분 / 4정거장"처럼 "후" 없이 두 줄로 나눠 보여 준다. */
  const view = heroArrivalView(data, status, reliability);
  const { state, minutes, stopsAway } = view;
  const stops = stopsAway == null ? null : Math.round(stopsAway);

  /* 도착 시간 색 (DESIGN.md 7-5).
     3분 이하면 브랜드 블루, 그 외엔 기본 먹색. 예전에는 지연이면 글자를
     주황으로 칠하고 아래에 신뢰도 태그를 붙였는데, 7-5는 숫자 색은 그대로 두고
     숫자 왼쪽에 지연 아이콘(주황 삼각형)을 붙인다. 색만으로 구분하지 않도록
     아이콘에 "지연 의심" 이름을 단다. */
  const soon = state === "arriving" || (minutes != null && minutes <= 3);
  const tone = soon ? "text-brand" : "text-ink";

  if (state === "loading") return <ArrivalSkeleton />;

  /* tabular-nums: 20초마다 값이 갱신될 때 자릿수가 바뀌어도 숫자 폭이
     고정이라 옆의 아이콘이 좌우로 밀리지 않는다. 값이 바뀌면 key가 바뀌어
     새 값이 150ms 동안 나타난다. */
  const top =
    state === "normal" ? (
      <span key={`m-${minutes}`} className={`text-title tabular-nums animate-fade-in ${tone}`}>
        {minutes}분
      </span>
    ) : state === "arriving" ? (
      <span key="arriving" className={`text-title whitespace-nowrap animate-fade-in ${tone}`}>
        곧 도착
      </span>
    ) : state === "stopsOnly" ? (
      /* 시간을 못 믿을 때는 GPS로 확인한 정거장 수를 위에 둔다. "12정거장"을
         모두 Title로 쓰면 64px 칸을 넘어서, 단위만 작게 쓴다. */
      <span key={`s-${stops}`} className="whitespace-nowrap animate-fade-in">
        <span className="text-title text-ink tabular-nums">{stops}</span>
        <span className="text-caption text-ink">정거장</span>
      </span>
    ) : state === "atOrigin" ? (
      /* 기점 대기(7-3 표): 가장 가까운 버스가 노선 첫 정류장에 서 있다.
         "6정거장"을 위에 크게 쓰면 곧 오는 것처럼 읽혀서 출발 전임을 먼저 쓴다. */
      <span key="atOrigin" className="text-title text-ink whitespace-nowrap animate-fade-in">
        출발 전
      </span>
    ) : (
      <span key="error" className="text-body text-muted whitespace-nowrap">
        정보 없음
      </span>
    );

  const bottom =
    state === "stopsOnly"
      ? "시간 확인 중"
      : state === "atOrigin"
        ? "기점 대기"
        : (state === "normal" || state === "arriving") && stops != null && stops > 0
          ? `${stops}정거장`
          : "";

  return (
    <>
      <span className="h-6 flex items-center justify-end gap-1">
        {view.chip === "delay" && (
          <AlertTriangle
            className="w-3 h-3 text-delay shrink-0"
            role="img"
            aria-label="지연 의심"
          />
        )}
        {top}
      </span>
      <span className="h-4.5 flex items-center justify-end text-caption text-muted tabular-nums whitespace-nowrap">
        {bottom}
      </span>
    </>
  );
}

/**
 * 얇은 헤더 (DESIGN.md 7-2).
 *
 * 예전에는 파란 헤더 길이를 마이 탭과 같게 맞췄다(탭을 오갈 때 파란 면이
 * 위아래로 움직이면 화면이 갈아끼워지는 것처럼 보여서). 7-2에 따라 홈은
 * canvas 바탕의 얇은 헤더가 되고 파랑은 히어로 카드가 쓴다. 다른 화면의
 * 헤더는 4단계에서 같은 얇은 헤더로 맞춘다.
 *
 * 높이는 안전영역 + 3.5rem(56px). rem이라 큰 글씨에서 글자와 함께 커진다.
 */
function HomeHeader({
  region,
  onRegion,
  onSearch,
  onAlerts,
}: {
  region: string;
  onRegion: () => void;
  onSearch: () => void;
  onAlerts: () => void;
}) {
  const [hasUnread, setHasUnread] = useState(hasUnreadAlerts);

  useEffect(() => {
    const refresh = () => setHasUnread(hasUnreadAlerts());
    const id = setInterval(refresh, UNREAD_POLL_MS);
    // 다른 앱에 갔다 돌아오면 그 사이 쌓인 기록을 바로 반영한다.
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  /* 원형 버튼: 보이는 원은 40px, 투명한 ::before로 사방 2px씩 넓혀 누르는
     영역은 44px. 버튼 사이 8px에서 양쪽이 2px씩 먹어 4px이 남아 겹치지 않는다.
     검색은 정보를 보여 주는 카드가 아니라 다른 화면으로 가는 입구다. 홈을
     여는 이유는 검색이 아니라 저장한 버스가 언제 오는지라서, 예전 검색 카드도
     그림자를 빼고 낮췄다. 7-2는 한 걸음 더 나가 헤더 오른쪽의 작은 원으로 둔다. */
  const circle =
    "relative w-10 h-10 rounded-full bg-surface border border-line flex items-center justify-center text-ink " +
    "active:bg-canvas before:content-[''] before:absolute before:-inset-0.5 " +
    PRESSABLE;

  return (
    <header className="bg-canvas px-5 pt-safe-0 shrink-0">
      <div className="h-14 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onRegion}
            /* 글자 한 줄(18px)짜리 버튼이라 투명한 ::before로 위아래 13px씩
               넓혀 누르는 영역을 44px로 만든다. 보이는 모양은 그대로다. */
            className="relative flex items-center gap-0.5 text-caption text-muted select-none touch-manipulation active:text-ink before:content-[''] before:absolute before:-inset-x-2 before:-inset-y-[13px]"
          >
            {region}
            <ChevronDown className="w-3 h-3" aria-hidden="true" />
          </button>
          <h1 className="text-title text-ink">BUS STOP</h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={onSearch} aria-label="검색" className={circle}>
            <Search className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={onAlerts}
            aria-label={hasUnread ? "알림, 읽지 않은 알림이 있어요" : "알림"}
            className={circle}
          >
            <Bell className="w-5 h-5" />
            {/* 안 읽은 알림 표시. 8px 빨간 점을 종 아이콘 오른쪽 위에 걸친다.
                흰 테두리로 아이콘 선과 떼어 놓는다. */}
            {hasUnread && (
              <span
                aria-hidden="true"
                className="absolute top-2 right-2 w-2 h-2 rounded-full bg-danger ring-2 ring-surface"
              />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}

/* 빠른 실행 (DESIGN.md 7-7). 모두 이미 있는 화면으로 가는 바로가기다. */
const QUICK_ACTIONS = [
  { label: "노선 검색", Icon: Bus, tab: "bus" as const },
  { label: "정류장 검색", Icon: MapPin, tab: "bus" as const, searchTab: "station" as const },
  { label: "길찾기", Icon: Navigation, tab: "route" as const },
  { label: "하차 알림", Icon: BellRing, tab: "alert" as const },
];

export function HomeScreen({
  onNavigate,
}: {
  onNavigate: (
    tab: TabId,
    routeId?: string,
    station?: { id: string; name: string; arsId?: string },
    options?: { searchTab?: "route" | "station" }
  ) => void;
}) {
  const { state, dispatch } = useApp();
  const [regionUnderDevOpen, setRegionUnderDevOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { data: routes, status: routesStatus } = useAsync(() => fetchAllRoutes(), []);

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

  /* 히어로와 목록 카드가 같은 값으로 도착 정보를 부르도록 한 곳에서 정한다.
     노선 목록 조회가 성공이든 실패든 "끝났는지"로 판단한다.
     예전에는 routes !== undefined로 판단했는데, useAsync의 data는 처음부터
     null이라 늘 참이었다. 그래서 노선 정보 없이 먼저 조회하고, 노선이 도착하면
     한 번 더 조회해 히어로가 "값 → 스켈레톤 → 값"으로 깜빡였다.
     실패도 끝난 것으로 보는 이유: 안 그러면 노선 조회가 실패했을 때 도착 조회가
     시작되지 않아 히어로가 영원히 로딩 상태에 남는다. 실패하면 노선 없이
     (GPS 검증 없이) 조회한다. */
  const routesLoaded = isSettled(routesStatus);

  /* 히어로(DESIGN.md 7-3)에 올라온 즐겨찾기는 아래 목록에서 뺀다. 같은 값을
     두 번 보여 주지 않고, 같은 조회를 두 번 하지 않기 위해서다.
     고정(pinned)한 stop_route가 먼저, 없으면 첫 번째 stop_route가 올라온다. */
  const heroFav = pickHeroFavorite(state.favorites);
  const listFavorites = heroFav
    ? state.favorites.filter((f) => f.id !== heroFav.id)
    : state.favorites;
  /* 편집할 행이 없어지면(예: 마지막 행을 지움) 편집 모드도 끝난 것으로 본다. */
  const editing = editMode && listFavorites.length > 0;

  /* 히어로의 노선과 번호는 아래 목록 카드와 같은 규칙으로 구한다.
     번호가 다르면 조회 키가 달라져 캐시를 같이 쓰지 못한다. */
  const heroRoute =
    heroFav?.appRouteId ? routes?.find((r) => r.id === heroFav.appRouteId) : undefined;
  const heroRouteNumber = heroFav ? heroFav.name.replace(/번$/, "").trim() : "";

  /* 즐겨찾기 카드를 눌렀을 때 갈 곳. 목록 카드와 히어로가 같이 쓴다. */
  const openFavorite = (fav: Favorite) => {
    const isRoute = fav.type === "route";
    const isStopRoute = fav.type === "stop_route";
    const isStation = fav.type === "station";
    const targetId = isStopRoute ? fav.appRouteId : fav.refId;

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
  };

  return (
    <div className="flex flex-col bg-canvas">
      {/* ① 얇은 헤더 */}
      <HomeHeader
        region={state.region.sigungu}
        onRegion={() => setRegionUnderDevOpen(true)}
        onSearch={() => onNavigate("bus")}
        onAlerts={() => onNavigate("alert")}
      />

      {/* ② 히어로: 내 정류장 + 내 버스 (DESIGN.md 7-3). 홈의 주인공이다.
          헤더와 사이는 8px이다. 375×667에서 헤더(56) + 8 + 히어로(264) =
          328px로 첫 화면 위쪽 절반(333.5px) 안에 들어온다(12장).
          올릴 stop_route가 없으면 같은 크기의 점선 카드가 자리를 지킨다. */}
      <section className="px-5 mt-2 shrink-0">
        {heroFav ? (
          <HeroArrivalCard
            /* 다른 즐겨찾기로 바뀌면 갱신 시각 같은 카드 안 상태를 새로 시작한다. */
            key={heroFav.id}
            fav={heroFav}
            route={heroRoute}
            routeNumber={heroRouteNumber}
            routesLoaded={routesLoaded}
            onOpen={() => openFavorite(heroFav)}
            onRefresh={handleRefresh}
            refreshing={refreshing}
          />
        ) : (
          <HeroEmptyCard onAdd={() => onNavigate("bus")} />
        )}
      </section>

      {/* ③ 다른 즐겨찾기 + ④ 점선 추가 행.
          히어로로 올라간 것을 빼고 남은 즐겨찾기가 없으면 목록 카드와 제목을
          숨긴다. 즐겨찾기가 하나도 없을 때의 안내는 히어로 자리의 점선
          카드가 맡는다 — 같은 안내가 두 번 나오지 않게 한다. 즐겨찾기
          관리는 마이 탭에서 할 수 있다.
          점선 추가 행은 히어로가 있을 때만 둔다. 히어로 자리가 점선 카드면
          그 카드가 이미 "등록해 주세요" 입구다. */}
      {(listFavorites.length > 0 || heroFav) && (
        <section className="px-5 mt-7 shrink-0">
          {listFavorites.length > 0 && (
            <>
              {/* 섹션 제목. 예전에는 항목 이름보다 작고 연하게 뒀다(제목이
                  내용만큼 진하면 같은 무게의 글자가 반복돼 위계가 사라져서).
                  7-5는 Body-strong·ink로 제목을 세우고, 위계는 크기 대신 섹션
                  사이 28px 여백과 흰 카드로 만든다. */}
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-body-strong text-ink">다른 즐겨찾기</h2>
                {/* 글자 버튼은 좌우 패딩 8px만 주고, 모자란 높이는 투명한
                    ::before로 채워 누르는 영역 44px을 맞춘다. 줄 높이가 커지지
                    않아 제목과 카드 사이가 12px으로 유지된다. 오른쪽 패딩만큼
                    -mr-2로 당겨 "전체보기" 글자 끝을 카드 끝에 맞춘다. */}
                <div className="flex items-center gap-1.5 -mr-2">
                  <button
                    type="button"
                    onClick={() => setEditMode((v) => !v)}
                    className="relative px-2 text-body text-muted select-none touch-manipulation active:text-ink before:content-[''] before:absolute before:-inset-x-[3px] before:-inset-y-3"
                  >
                    {editing ? "완료" : "편집"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate("my")}
                    className="relative px-2 text-body text-brand select-none touch-manipulation active:opacity-70 before:content-[''] before:absolute before:-inset-x-[3px] before:-inset-y-3"
                  >
                    전체보기
                  </button>
                </div>
              </div>

              {/* 흰 카드 하나 안에 행을 쌓고 1px 선으로 나눈다(7-5).
                  예전에는 즐겨찾기마다 독립 카드로 띄웠다 — 한 판 안에서
                  구분선으로 나누면 설정 목록처럼 읽혀 어느 행의 도착시간인지
                  눈에 안 들어온다는 이유였다. 이제 "지금 버스가 언제 오는지"의
                  주인공은 히어로가 맡고, 이 목록은 나머지를 훑어보는 자리라
                  7-5에 따라 한 카드로 묶는다. 도착 시간은 오른쪽 고정 열에
                  모아 행끼리 세로로 줄 맞춰 비교할 수 있게 한다. */}
              <ul className="bg-surface rounded-card border border-line divide-y divide-line overflow-hidden">
                {listFavorites.map((fav) => {
                  const isRoute = fav.type === "route";
                  const isStopRoute = fav.type === "stop_route";
                  const isStation = fav.type === "station";

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
                     start/end는 이미 받아 둔 값이라 새로 조회하지 않는다.
                     7-5에 따라 "기점 → 종점" 대신 "{종점} 방면"으로 쓴다. */
                  const directionRoute = matchedRoute ?? stopRoute;

                  // route와 stop_route는 실제 버스 노선이라 본선/분선 카테고리 색을
                  // 적용한다. station(집/회사)은 노선 카테고리가 없어 브랜드 블루로
                  // 통일 — 셋 다 배경을 칠해 즐겨찾기 배지끼리 시각적으로 일관되게 한다.
                  const categoryRoute = matchedRoute ?? stopRoute;
                  const isMain = categoryRoute
                    ? isMainRoute(categoryRoute.name)
                    : true;
                  const badgeBg = isMain ? "bg-route-main" : "bg-route-branch";

                  const routeNumber =
                    matchedRoute?.number ?? fav.name.replace(/번$/, "").trim();

                  /* 배지에 넣을 노선 번호. stop_route는 name이 정류장 이름이라
                     routeNumber를 그대로 쓰면 배지에 정류장명이 들어간다. */
                  const badgeNumber =
                    matchedRoute?.number ??
                    fav.routeNumber ??
                    stopRoute?.number ??
                    routeNumber;

                  /* 이름과 둘째 줄. 사용자가 마이 화면에서 바꾼 이름("집")이 있으면
                     이름 자리에 쓴다(7-5). 예전에는 이 이름이 아랫줄 앞에 작게
                     붙었는데, 그 전에는 홈 어디에도 나오지 않아 "이름 변경이
                     저장되지 않는다"고 보였다. */
                  const title = favoriteTitle(fav, isRoute ? routeNumber : badgeNumber);
                  const subtitle = favoriteSubtitle(
                    fav,
                    directionRoute,
                    isRoute ? routeNumber : badgeNumber,
                  );

                  return (
                    <li key={fav.id} className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          if (editing) return;
                          openFavorite(fav);
                        }}
                        /* 행 전체가 하나의 터치 영역이다. 한 카드 안의 행이라 눌렀을 때
                           크기를 줄이지 않고 배경색만 바꾼다 — 줄이면 이웃 행과 경계가
                           어긋나 보인다(예전 독립 카드 시절에는 살짝 줄였다). */
                        className={`w-full min-h-16 px-4 py-3 flex items-center gap-3 text-left ${ROW_PRESSABLE}`}
                      >
                        {/* 왼쪽 배지 48×36 (7-5). 노선 번호만 크게 넣는다.
                            예전 배지는 번호 아래 본선/분선을 작게 적었는데, 7-5 배지에는
                            자리가 없다. 화면 읽기 프로그램에는 글자로 남긴다. 투명도를
                            주지 않는다 — 새 배지 색 위에서 white/75는 4.5:1이 안 나온다. */}
                        <span
                          className={`w-12 h-9 rounded-tile flex items-center justify-center shrink-0 text-white ${badgeBg}`}
                        >
                          {isStation ? (
                            /* 정류장 즐겨찾기는 노선 번호가 없다. 정류장 번호를 크게
                               넣는 대신 핀 아이콘으로 종류를 보인다. */
                            <MapPin className="w-5 h-5" aria-hidden="true" />
                          ) : (
                            <span className="text-body-strong font-bold tabular-nums truncate max-w-full px-1">
                              {badgeNumber}
                            </span>
                          )}
                          <span className="sr-only">
                            {isStation ? "정류장" : isMain ? "본선" : "분선"}
                          </span>
                        </span>

                        <span className="flex-1 min-w-0">
                          <span className="block text-body-strong text-ink truncate">{title}</span>
                          {/* 방향을 아직 못 구해도 줄 높이는 그대로 둔다. */}
                          <span className="block h-4.5 text-caption text-muted truncate">
                            {subtitle}
                          </span>
                        </span>

                        {/* 오른쪽 칸. 편집 중에는 삭제·고정 버튼이 이 자리에 겹쳐
                            앉는다. 칸을 지우지 않고 보이지만 않게 해서, 도착 정보
                            조회가 다시 시작되거나 행 높이가 바뀌지 않게 한다. */}
                        {isStopRoute ? (
                          /* 숫자는 오른쪽 정렬, 고정 폭 64px(7-5). 이름이 길어도
                             도착 시간이 행마다 같은 자리에 온다. */
                          <span
                            className={`w-16 shrink-0 flex flex-col items-end ${editing ? "invisible" : ""}`}
                          >
                            <FavoriteArrivalInfo
                              fav={fav}
                              routeNumber={routeNumber}
                              routeInterval={stopRoute?.interval}
                              route={stopRoute}
                              routesLoaded={routesLoaded}
                            />
                          </span>
                        ) : (
                          /* 정류장만 또는 노선만 저장한 즐겨찾기는 도착 시간을 계산할
                             대상이 정해지지 않는다. 데이터 오류가 아니라 정상 상태다.
                             이 안내는 별도 버튼이 아니라, 행을 누르면 어디로 가는지
                             설명하는 글이다. 그래서 파란색을 쓰지 않는다.
                             정류장 즐겨찾기는 정류장 화면으로, 노선 즐겨찾기는 노선
                             상세로 가므로 가는 곳의 이름을 쓴다(7-5). */
                          <span
                            className={`shrink-0 flex items-center gap-0.5 text-caption text-muted ${editing ? "invisible" : ""}`}
                          >
                            {isStation ? "정류장 보기" : "노선 보기"}
                            <ChevronRight className="w-3 h-3" aria-hidden="true" />
                          </span>
                        )}
                      </button>

                      {editing && (
                        /* 편집 모드 (7-5). 보이는 원은 28px, 투명한 ::before로 사방
                           8px씩 넓혀 누르는 영역 44px. 두 버튼 사이 16px이라 넓힌
                           영역끼리 맞닿기만 하고 겹치지 않는다. */
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-4">
                          {isStopRoute && (
                            <button
                              type="button"
                              onClick={() => {
                                const next = !fav.pinned;
                                dispatch({ type: "SET_FAVORITE_PIN", id: fav.id, pinned: next });
                                /* 고정하면 이 행은 히어로로 올라가 목록에서 사라진다.
                                   화면이 내려가 있으면 히어로가 안 보이므로 글로 알린다. */
                                showToast(next ? "내 정류장으로 고정했어요" : "고정을 해제했어요");
                              }}
                              aria-label={fav.pinned ? "내 정류장 고정 해제" : "내 정류장으로 고정"}
                              aria-pressed={!!fav.pinned}
                              className={`relative w-7 h-7 rounded-full flex items-center justify-center touch-manipulation transition-transform active:scale-90 before:content-[''] before:absolute before:-inset-2 ${
                                fav.pinned ? "bg-brand-soft text-brand" : "bg-canvas text-faint"
                              }`}
                            >
                              <Pin
                                className="w-3.5 h-3.5"
                                fill={fav.pinned ? "currentColor" : "none"}
                              />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              dispatch({ type: "REMOVE_FAVORITE", id: fav.id });
                              showToast("삭제했어요");
                            }}
                            aria-label={`${title} 즐겨찾기 삭제`}
                            className="relative w-7 h-7 rounded-full bg-danger text-white flex items-center justify-center touch-manipulation transition-transform active:scale-90 before:content-[''] before:absolute before:-inset-2"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {/* ④ 점선 추가 행 (7-6). 목록 카드 아래 8px. */}
          {heroFav && (
            <button
              type="button"
              onClick={() => onNavigate("bus")}
              className={`w-full h-14 rounded-card border-[1.5px] border-dashed border-faint flex items-center justify-center gap-1 text-body text-brand ${
                listFavorites.length > 0 ? "mt-2" : ""
              } ${PRESSABLE}`}
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              즐겨찾기 추가
            </button>
          )}
        </section>
      )}

      {/* ⑤ 빠른 실행 (7-7). 4칸을 똑같이 나누고 사이 12px. 칸은 정사각형. */}
      <section className="px-5 mt-7 shrink-0">
        <div className="grid grid-cols-4 gap-3">
          {QUICK_ACTIONS.map(({ label, Icon, tab, searchTab }) => (
            <button
              key={label}
              type="button"
              onClick={() =>
                onNavigate(tab, undefined, undefined, searchTab ? { searchTab } : undefined)
              }
              className={`aspect-square bg-surface border border-line rounded-card flex flex-col items-center justify-center ${PRESSABLE}`}
            >
              <span className="w-10 h-10 rounded-tile bg-brand-soft flex items-center justify-center">
                <Icon className="w-5 h-5 text-brand" aria-hidden="true" />
              </span>
              <span className="mt-1.5 text-micro text-ink whitespace-nowrap">{label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ⑥ 최근 본 노선 (7-8).
          예전에는 과거 기록이라 즐겨찾기보다 가볍게 흰 판 없이 배경 위에 바로
          얹었다. 7-8에 따라 흰 카드 한 장에 담고 1px 선으로 행을 나눈다 — 위
          즐겨찾기 카드와 재질을 맞추고, 가벼움은 섹션 순서(맨 아래)로 둔다. */}
      {state.recentRoutes.length > 0 && (
        <section className="px-5 mt-7 shrink-0">
          <h2 className="text-body-strong text-ink mb-3">최근 본 노선</h2>
          <ul className="bg-surface rounded-card border border-line divide-y divide-line overflow-hidden">
            {state.recentRoutes.map((recent) => (
              <li key={recent.id}>
                <button
                  type="button"
                  onClick={() => onNavigate("bus", recent.id)}
                  className={`w-full min-h-16 px-4 py-3 flex items-center gap-3 text-left ${ROW_PRESSABLE}`}
                >
                  <span className="w-9 h-9 rounded-tile bg-brand-soft flex items-center justify-center shrink-0">
                    <Bus className="w-4.5 h-4.5 text-brand" aria-hidden="true" />
                  </span>
                  {/* 번호 칸은 고정 폭에 왼쪽 정렬. 예전에는 가운데 정렬이라
                      "1002"와 "101"의 시작 위치가 달랐다. 폭을 고정해 오른쪽
                      "기점 → 종점"도 행마다 같은 자리에서 시작한다. */}
                  <span className="w-14 shrink-0 text-body-strong text-ink tabular-nums truncate">
                    {recent.number}
                  </span>
                  <span className="flex-1 min-w-0 text-caption text-muted truncate">
                    {recent.start && recent.end
                      ? `${recent.start} → ${recent.end}`
                      : "노선 정보"}
                  </span>
                  <ChevronRight className="w-4 h-4 text-faint shrink-0" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 목록 끝과 하단 탭 사이 숨 쉴 틈.
          홈 인디케이터 높이와 탭 높이를 여기서 더하지 않는다. 3단계부터 하단
          탭은 화면 위에 떠 있고, 탭이 덮는 높이(안전영역 포함)는 App의 스크롤
          영역이 pb-nav-clear로 이미 비운다. 여기서 또 더하면 빈 공간이 두 번
          생긴다. (1단계 이전 화면 실측: 12개 목록을 끝까지 내려도 마지막 행과
          탭 사이가 57.7px 남았다.)
          탭 위 틈은 섹션 사이와 같은 28px이다. pb-nav-clear가 탭 위로 0.5rem을
          이미 남기므로 여기는 1.25rem(20px)만 둔다. */}
      <div className="h-5 shrink-0" />

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
