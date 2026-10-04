import { useEffect, useState } from "react";
import { MapPin, Plus, RefreshCw } from "lucide-react";
import { useArrivalInfo } from "@/hooks/useArrivalInfo";
import { heroArrivalView, updatedLabel, type HeroArrivalView } from "@/lib/heroArrival";
import { MiniRouteLine } from "@/components/MiniRouteLine";
import { ReliabilityChip } from "@/components/ui";
import type { Favorite } from "@/types";
import type { Route } from "@/types/route";

/* "N분 전 갱신" 문구를 다시 계산하는 간격. 분 단위 문구라 30초면 늦어도
   30초 안에 맞는 값이 된다. */
const LABEL_TICK_MS = 30_000;

/**
 * 홈 히어로 카드 (DESIGN.md 7-3). 내 정류장 + 내 버스.
 *
 * 도착 정보는 홈 즐겨찾기 카드(FavoriteArrivalInfo)와 똑같은 값으로
 * useArrivalInfo를 부른다. 히어로에 올라온 즐겨찾기는 목록에서 빠지므로
 * 조회가 늘지 않는다.
 */
export function HeroArrivalCard({
  fav,
  route,
  routeNumber,
  routesLoaded,
  onOpen,
  onRefresh,
  refreshing,
}: {
  fav: Favorite;
  /** appRouteId로 찾은 노선. 있으면 GPS로 정거장 수를 검증하고 방향을 쓴다. */
  route?: Route;
  /** 목록 카드와 같은 규칙으로 만든 노선 번호(조회 키가 같아야 캐시를 같이 쓴다) */
  routeNumber: string;
  /** allRoutes 조회가 끝났는지(성공 또는 실패). FavoriteArrivalInfo와 같은
   *  이유로 그 전에는 조회를 시작하지 않는다(GPS 검증 없는 값이 잠깐 찍히는
   *  깜빡임 방지). 실패로 끝나면 route 없이 조회한다 — 그래야 로딩에 갇히지 않는다. */
  routesLoaded: boolean;
  onOpen: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const canFetch = routesLoaded;
  const { data, status, isRefreshing, reliability } = useArrivalInfo(
    canFetch ? fav.tagoNodeId : undefined,
    canFetch ? fav.tagoRouteId : undefined,
    canFetch ? (fav.routeNumber ?? routeNumber) : undefined,
    canFetch ? route?.interval : undefined,
    canFetch ? route : undefined,
  );

  /* 새 응답을 받은 시각. 값이 같아도 새 응답이면 갱신된 것이다.
     fetchArrivalInfo는 실제로 조회할 때마다 새 객체를 만들고, 15초 캐시에서
     꺼낼 때만 같은 객체를 돌려준다. 그래서 data가 새 객체일 때가 곧 새 응답을
     받은 때다. 갱신에 실패하면 data가 null이 되고 시각도 지운다. */
  const [receivedAt, setReceivedAt] = useState<number | null>(null);
  useEffect(() => {
    setReceivedAt(data ? Date.now() : null);
  }, [data]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), LABEL_TICK_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <HeroArrivalCardView
      stopName={fav.stopName ?? fav.name}
      routeNumber={fav.routeNumber ?? route?.number ?? routeNumber}
      direction={route?.end ? `${route.end} 방면` : undefined}
      origin={route?.start || undefined}
      view={heroArrivalView(data, status, reliability)}
      updatedText={updatedLabel(receivedAt, now, isRefreshing)}
      onOpen={onOpen}
      onRefresh={onRefresh}
      refreshing={refreshing}
    />
  );
}

/* 카드를 누르면 카드 전체가 살짝 줄어든다. 새로고침 버튼은 카드 버튼 안에
   넣을 수 없어(버튼 안의 버튼) 형제로 겹쳐 둔다. 그래서 줄어드는 효과를
   카드 버튼이 아니라 둘을 감싼 바깥 상자에 준다 — 안 그러면 누르는 동안
   새로고침 버튼만 제자리에 남아 어긋나 보인다. */
const PRESS_WRAP =
  "transition-transform duration-100 has-[.hero-press:active]:scale-[0.98]";

/**
 * 히어로 카드의 화면만 그린다. 상태는 밖에서 받는다.
 *
 * 높이 고정: 여섯 줄 모두 높이를 rem으로 정해 두고, 어느 상태든 같은 줄을
 * 채운다(DESIGN.md 7-3, 12장). 20초마다 값이 바뀌어도 카드가 움직이지 않고,
 * 큰 글씨에서는 모든 줄이 같은 비율로 커진다.
 *   1줄 2rem / 2줄 1.5rem (위 0.25rem) / 3줄 4rem (위 0.5rem)
 *   4줄 1.75rem (위 0) / 5줄 1.75rem (위 0.5rem) / 6줄 1.25rem (위 0.5rem)
 *   안쪽 여백 위아래 1.25rem → 합계 16.5rem(264px)
 */
export function HeroArrivalCardView({
  stopName,
  routeNumber,
  direction,
  origin,
  view,
  updatedText,
  onOpen,
  onRefresh,
  refreshing,
}: {
  stopName: string;
  routeNumber: string;
  direction?: string;
  /** 노선의 기점 이름("평화동종점"). 기점 대기 문구에 쓴다. */
  origin?: string;
  view: HeroArrivalView;
  updatedText: string;
  onOpen: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const { state, stopsAway } = view;
  const hasData =
    state === "normal" || state === "arriving" || state === "stopsOnly" || state === "atOrigin";

  return (
    <div className={`relative rounded-hero bg-hero shadow-hero text-white ${PRESS_WRAP}`}>
      <button
        type="button"
        onClick={onOpen}
        className="hero-press block w-full p-5 text-left rounded-hero select-none touch-manipulation"
      >
        {/* 1줄: 정류장 이름. 오른쪽 2.5rem은 새로고침 버튼(2rem) + 사이 0.5rem 자리 */}
        <span className="flex items-center gap-1.5 h-8 pr-10 min-w-0">
          <MapPin className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="text-body-strong truncate">{stopName}</span>
        </span>

        {/* 2줄: 노선 칩 + 방향.
            칩 바탕은 흰색이 아니라 검정 20%다. white/20 위 흰 글자는 3.14~3.62:1로
            4.5:1에 못 미친다. black/20이면 7.23:1, 광택이 가장 밝게 겹쳐도 6.21:1. */}
        <span className="mt-1 flex items-center gap-2 h-6 min-w-0">
          <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-black/20 text-body-strong font-bold tabular-nums shrink-0">
            {routeNumber}
          </span>
          {direction && <span className="text-body text-white/90 truncate">{direction}</span>}
        </span>

        {/* 3줄: 남은 분. 가장 먼저 읽히는 숫자다. */}
        <span className="mt-2 h-16 flex items-end min-w-0">
          <HeroBigRow view={view} />
        </span>

        {/* 4줄: 남은 정거장. 3줄과 사이를 두지 않는다 — 64px 숫자 아래에
            글자 자체 여백이 있어 붙여도 답답하지 않다. */}
        <span className="h-7 flex items-center min-w-0">
          {state === "loading" ? (
            <span className="block h-5 w-28 rounded-full bg-white/20 animate-pulse" />
          ) : (
            <span
              key={subText(view, origin)}
              className="text-headline text-white/90 tabular-nums truncate animate-fade-in"
            >
              {subText(view, origin)}
            </span>
          )}
        </span>

        {/* 5줄: 미니 노선도. 정보 없음이면 같은 높이로 비워 둔다. */}
        <span className="mt-2 h-7 flex items-center">
          {state === "loading" && (
            <span className="block h-2 w-full rounded-full bg-white/20 animate-pulse" />
          )}
          {hasData && <MiniRouteLine stopsAway={stopsAway} atOrigin={state === "atOrigin"} />}
        </span>

        {/* 6줄: 신뢰도 칩 + 갱신 시각 */}
        <span className="mt-2 h-5 flex items-center gap-2 min-w-0">
          {hasData && (
            <>
              {state === "arriving" && (
                <span
                  aria-hidden="true"
                  className="w-1.5 h-1.5 rounded-full bg-white shrink-0 animate-blink"
                />
              )}
              {view.chip && <ReliabilityChip kind={view.chip} onHero />}
              {updatedText && (
                <span className="text-micro text-white truncate">{updatedText}</span>
              )}
            </>
          )}
        </span>
      </button>

      {/* 새로고침: 보이는 원은 32px, 투명한 ::before로 누르는 영역을 44px로
          넓힌다(위아래좌우 6px). 카드 안쪽 여백(20px) 안에 들어간다. */}
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        aria-label="새로고침"
        aria-busy={refreshing}
        className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/15 flex items-center justify-center select-none touch-manipulation active:bg-white/25 before:content-[''] before:absolute before:-inset-1.5"
      >
        <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
      </button>
    </div>
  );
}

/** 4줄 문구 (DESIGN.md 7-3 표, 12장 결정 기록) */
function subText({ state, stopsAway }: HeroArrivalView, origin?: string): string {
  switch (state) {
    case "normal":
      return stopsAway != null ? `${Math.round(stopsAway)}정거장 전` : "정거장 정보 없음";
    case "arriving":
      return "잠시 후 정류장에 와요";
    case "stopsOnly":
      return "시간 확인 중";
    case "atOrigin":
      // 기점 이름을 아직 못 구했으면(노선 목록 전) 일반 이름으로 쓴다.
      return `${origin ?? "기점"}에서 기다려요`;
    case "error":
      return "잠시 후 다시 확인해요";
    default:
      return "";
  }
}

/** 3줄. 숫자는 Display, 단위는 Display-unit("3분", "2정거장 전"과 같은 짜임). */
function HeroBigRow({ view }: { view: HeroArrivalView }) {
  const { state, minutes, stopsAway } = view;

  if (state === "loading") {
    return <span className="block h-16 w-[7.5rem] rounded-tile bg-white/20 animate-pulse" />;
  }

  if (state === "error") {
    return (
      <span key="error" className="text-headline animate-fade-in">
        도착 정보 없음
      </span>
    );
  }

  if (state === "arriving") {
    return (
      <span key="arriving" className="text-display whitespace-nowrap animate-fade-in">
        곧 도착
      </span>
    );
  }

  /* 기점 대기: 가장 가까운 버스가 노선 첫 정류장에 서 있다. "N정거장 전"을
     크게 쓰면 곧 오는 것처럼 읽혀서, 출발 전이라는 사실을 크게 쓴다. */
  if (state === "atOrigin") {
    return (
      <span key="atOrigin" className="text-display whitespace-nowrap animate-fade-in">
        출발 전
      </span>
    );
  }

  // 숫자가 바뀌면 key가 바뀌어 새 숫자가 150ms 동안 나타난다.
  // tabular-nums로 자릿수가 같으면 폭도 같다.
  const value = state === "normal" ? minutes : Math.round(stopsAway ?? 0);
  const unit = state === "normal" ? "분" : "정거장 전";
  return (
    <span key={`${state}-${value}`} className="flex items-baseline whitespace-nowrap animate-fade-in">
      <span className="text-display tabular-nums">{value}</span>
      <span className="ml-0.5 text-display-unit">{unit}</span>
    </span>
  );
}

/**
 * 히어로에 올릴 stop_route가 없을 때의 자리 (DESIGN.md 7-3).
 * 히어로와 같은 크기(16.5rem)라 즐겨찾기를 추가해도 아래 내용이 밀리지 않는다.
 */
export function HeroEmptyCard({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="w-full h-[16.5rem] px-5 rounded-hero bg-surface border-[1.5px] border-dashed border-faint flex flex-col items-center justify-center text-center select-none touch-manipulation transition-transform duration-100 active:scale-[0.98]"
    >
      <span className="w-14 h-14 rounded-full bg-brand-soft flex items-center justify-center">
        <Plus className="w-6 h-6 text-brand" aria-hidden="true" />
      </span>
      <span className="mt-3 text-body-strong text-ink">내 정류장을 등록해 주세요</span>
      <span className="mt-1 text-caption text-muted">정류장에서 탈 버스를 고르면 여기에 바로 보여요</span>
    </button>
  );
}
