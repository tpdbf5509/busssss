import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  MapPin,
  Footprints,
  Bus,
  X,
  Navigation,
  ArrowUpDown,
  SearchX,
  LocateFixed,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { useApp } from "@/store/appContext";
import { searchStations } from "@/services/stationService";
import { findNearbyGroup } from "@/services/nearbyStationService";
import { StationCoordsUnavailableError } from "@/api/jeonju";
import type { NearbyMapStation } from "@/components/NearbyMap";
import {
  directRouteKey,
  fetchLiveArrivals,
  findDirectRoutes,
  MAX_LIVE_ARRIVALS,
  type DirectRouteResult,
} from "@/services/directRouteService";
import type { ArrivalInfo } from "@/services/arrivalService";
import { formatArrivalText } from "@/lib/formatArrival";
import { getRouteCategory } from "@/lib/routeCategory";
import {
  groupLabel,
  groupStationsByName,
  isSameGroup,
  splitStationsOneByOne,
  type StationGroup,
} from "@/lib/directRoutes";
import { distanceMeters, formatDistance, type LatLng } from "@/lib/geo";
import {
  getCurrentLocation,
  locationFailureMessage,
  LocationError,
  POOR_ACCURACY_M,
} from "@/lib/geolocation";
import { showToast } from "@/lib/toastStore";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui";

type Field = "from" | "to";
type LoadStatus = "idle" | "loading" | "success" | "error";

type StepIconKind = "walk" | "bus" | "pin";

type RouteStep = {
  title: string;
  detail: string;
  icon: StepIconKind;
};

const POPULAR_DESTINATIONS = [
  "전주한옥마을",
  "전북대학교",
  "전주역",
  "고속버스터미널",
  "전주월드컵경기장",
  "덕진공원",
];

const MAX_FAVORITE_CHIPS = 6;

// 단계 아이콘은 DESIGN.md 6장 아이콘 타일과 같은 brand 20px이다. 예전에는
// 종류마다 아이콘 색(초록·파랑·주황·빨강)을 달리했는데, 4단계에서 원색을
// 걷어내며 한 색으로 맞췄다. 종류는 아이콘 모양(걷기·버스·핀)과 단계
// 제목 글자로 구분한다 — 색만으로 구분하지 않는다는 원칙에도 맞다.
function StepIcon({ type }: { type: StepIconKind }) {
  const base = "w-5 h-5 text-brand";
  switch (type) {
    case "walk":
      return <Footprints className={base} aria-hidden="true" />;
    case "bus":
      return <Bus className={base} aria-hidden="true" />;
    case "pin":
      return <MapPin className={base} aria-hidden="true" />;
  }
}

// 연한 색 배경을 종류별로 다르게 쓰면 아이콘 색과 겹쳐 톤온톤이 된다.
// 4단계부터는 아이콘이 모두 brand라, 배경도 6장 아이콘 타일의
// brand-soft 하나로 통일한다(종류마다 다른 틴트를 쓰지 않는 원칙은 그대로).
const STEP_ICON_BG = "bg-brand-soft";

/**
 * 결과 한 줄을 단계로 풀어 쓴다. 보여 주는 값은 전부 DB에서 온 실제 값이다.
 * 좌표가 없어 걷는 시간, 버스 이동 시간은 알 수 없으니 쓰지 않는다
 * (지어낸 시간은 안 된다. CLAUDE.md 4장).
 */
function buildSteps(result: DirectRouteResult, walk: string): RouteStep[] {
  const { route, boardStation, alightStation, stopCount } = result;
  const boardDetail = [
    walk,
    boardStation.arsId ? `정류장 번호 ${boardStation.arsId}` : "",
    route.end ? `${route.end} 방면` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return [
    {
      title: `${boardStation.name} 정류장으로 이동`,
      detail: boardDetail,
      icon: "walk",
    },
    {
      title: `${route.number}번 버스 탑승`,
      detail: route.start && route.end ? `${route.start} → ${route.end}` : "",
      icon: "bus",
    },
    {
      title: `${stopCount}정거장 이동`,
      detail: "",
      icon: "bus",
    },
    {
      title: `${alightStation.name}에서 하차`,
      detail: alightStation.arsId ? `정류장 번호 ${alightStation.arsId}` : "",
      icon: "pin",
    },
  ];
}

/**
 * 현재 위치에서 승차 정류장까지 직선거리 글. 걷는 길을 모르므로 시간으로 바꾸지
 * 않는다(lib/geo.ts). 현재 위치로 출발하지 않았거나 좌표가 없으면 빈 글자다.
 */
function walkDistanceLabel(origin: LatLng | undefined, result: DirectRouteResult): string {
  const { lat, lng } = result.boardStation;
  if (!origin || lat == null || lng == null) return "";
  const text = formatDistance(distanceMeters(origin, { lat, lng }));
  return text ? `현재 위치에서 직선 약 ${text}` : "";
}

/** 승차 정류장 도착 정보를 한 줄 글로. 시간을 못 믿는 값도 정거장 수는 보여 준다. */
function liveArrivalLabel(info: ArrivalInfo | null): string {
  if (!info) return "도착 정보 없음";
  if (info.minutes == null && info.atOrigin) return "출발 전";
  return formatArrivalText(info.minutes, info.stopsAway);
}

/** 묶음의 정류장 번호를 "12345 · 12346" 꼴로. 번호가 없으면 정류장 수로 대신한다. */
// 지도는 "근처 정류장"을 찾은 뒤에만 쓰므로 그때 처음 불러온다(첫 화면 번들에
// 넣지 않는다). 받기에 실패해도 화면 전체가 깨지지 않고 아래 목록만 남게 한다.
const NearbyMap = lazy(() =>
  import("@/components/NearbyMap").catch(() => ({
    default: () => (
      <div className="h-56 flex items-center justify-center bg-canvas text-caption text-muted">
        지도를 불러오지 못했어요
      </div>
    ),
  })),
);

function groupCaption(group: StationGroup): string {
  const ars = group.stations.map((s) => s.arsId).filter(Boolean);
  if (ars.length === 0) return group.single ? "정류장 번호 없음" : `정류장 ${group.stations.length}곳`;
  const shown = ars.slice(0, 3).join(" · ");
  return ars.length > 3 ? `정류장 번호 ${shown} 외 ${ars.length - 3}곳` : `정류장 번호 ${shown}`;
}

export function RouteScreen() {
  const { state } = useApp();

  const [fromGroup, setFromGroup] = useState<StationGroup | null>(null);
  const [toGroup, setToGroup] = useState<StationGroup | null>(null);
  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");
  const [active, setActive] = useState<Field | null>(null);
  const [locating, setLocating] = useState(false);

  const [suggestions, setSuggestions] = useState<StationGroup[]>([]);
  const [suggestStatus, setSuggestStatus] = useState<LoadStatus>("idle");
  const [suggestRetry, setSuggestRetry] = useState(0);

  const [results, setResults] = useState<DirectRouteResult[]>([]);
  const [resultStatus, setResultStatus] = useState<LoadStatus>("idle");
  const [resultRetry, setResultRetry] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // 키가 없으면 아직 부르는 중이거나 부르지 않은 줄이다. 값이 null이면 불렀지만
  // 정보가 없는 줄이다.
  const [arrivals, setArrivals] = useState<Record<string, ArrivalInfo | null>>({});

  const activeText = active === "from" ? fromText : toText;
  const activeGroup = active === "from" ? fromGroup : toGroup;
  // 고른 정류장 이름이 그대로 들어 있는 칸은 "다시 고르는 중"이 아니다.
  // 글자를 고쳐 쓰기 시작해야 검색 목록을 띄운다.
  const typing = active !== null && activeText.trim() !== "" && activeText !== (activeGroup ? groupLabel(activeGroup) : undefined);

  // 정류장 검색. 입력이 멈춘 뒤 300ms에 한 번만 부른다.
  useEffect(() => {
    if (!typing) return;
    const q = activeText.trim();
    let cancelled = false;
    setSuggestStatus("loading");
    const t = setTimeout(() => {
      searchStations(q)
        .then((list) => {
          if (cancelled) return;
          setSuggestions(splitStationsOneByOne(list));
          setSuggestStatus("success");
        })
        .catch(() => {
          if (cancelled) return;
          setSuggestions([]);
          setSuggestStatus("error");
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [typing, activeText, suggestRetry]);

  const sameStop = !!fromGroup && !!toGroup && isSameGroup(fromGroup, toGroup);
  const ready = !!fromGroup && !!toGroup && !sameStop;

  // 출발·도착이 모두 정해지면 자동으로 직행 경로를 찾는다. 요청은 고를 때
  // 한 번뿐이고 폴링은 없다(findDirectRoutes의 요청 수 설명 참고).
  useEffect(() => {
    setArrivals({});
    setSelectedKey(null);
    if (!fromGroup || !toGroup || sameStop) {
      setResults([]);
      setResultStatus("idle");
      return;
    }
    let cancelled = false;
    setResults([]);
    setResultStatus("loading");
    findDirectRoutes(fromGroup.stations, toGroup.stations)
      .then((list) => {
        if (cancelled) return;
        setResults(list);
        setResultStatus("success");
        if (list.length > 0) {
          setSelectedKey(directRouteKey(list[0]));
          void fetchLiveArrivals(
            list,
            () => cancelled,
            (key, info) => setArrivals((prev) => ({ ...prev, [key]: info })),
          );
        }
      })
      .catch(() => {
        if (cancelled) return;
        setResults([]);
        setResultStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [fromGroup, toGroup, sameStop, resultRetry]);

  const favoriteNames = useMemo(() => {
    const names: string[] = [];
    for (const fav of state.favorites) {
      const name = fav.type === "station" ? fav.name : fav.type === "stop_route" ? fav.stopName : "";
      if (name && !names.includes(name)) names.push(name);
      if (names.length >= MAX_FAVORITE_CHIPS) break;
    }
    return names;
  }, [state.favorites]);

  const setGroup = (field: Field, group: StationGroup | null) =>
    field === "from" ? setFromGroup(group) : setToGroup(group);
  const setText = (field: Field, text: string) =>
    field === "from" ? setFromText(text) : setToText(text);

  const pickGroup = (field: Field, group: StationGroup) => {
    setGroup(field, group);
    setText(field, groupLabel(group));
    setActive(null);
  };

  const handleInput = (field: Field, value: string) => {
    setText(field, value);
    const current = field === "from" ? fromGroup : toGroup;
    if (current && value !== groupLabel(current)) setGroup(field, null);
  };

  const clearField = (field: Field) => {
    setGroup(field, null);
    setText(field, "");
    setActive(field);
  };

  const swap = () => {
    setFromGroup(toGroup);
    setToGroup(fromGroup);
    setFromText(toText);
    setToText(fromText);
    setActive(null);
  };

  // 즐겨찾기·인기 목적지 알약은 이름만 알고 있어서, 이름으로 정류장을 찾아
  // 이름이 같은 묶음을 고른다. 정확히 같은 이름이 없으면 글자만 채우고 검색
  // 목록에서 고르게 한다.
  const selectByName = async (name: string, field: Field) => {
    setText(field, name);
    setGroup(field, null);
    setActive(field);
    try {
      const groups = groupStationsByName(await searchStations(name));
      const exact = groups.find((g) => isSameGroup(g, { name, stations: [] }));
      if (exact) pickGroup(field, exact);
    } catch {
      showToast("정류장을 찾지 못했어요");
    }
  };

  // 누른 순간의 위치를 한 번만 받아 근처 정류장을 출발 후보로 삼는다.
  const startFromCurrentLocation = async () => {
    if (locating) return;
    setLocating(true);
    try {
      const origin = await getCurrentLocation();
      const group = await findNearbyGroup(origin);
      if (group) pickGroup("from", group);
      else showToast("가까운 정류장을 찾지 못했어요 (500m 안)", "info");
    } catch (error) {
      // 실패 알림이라 error 종류로 띄운다(기본값 success는 초록 체크가 붙는다).
      showToast(
        error instanceof LocationError
          ? locationFailureMessage(error.reason)
          : error instanceof StationCoordsUnavailableError
          ? "근처 정류장 데이터를 아직 준비하지 못했어요"
          : "근처 정류장을 불러오지 못했어요",
        "error",
      );
    } finally {
      setLocating(false);
    }
  };

  const showLocationButton = active === "from" || (!fromGroup && active === null);

  const locationButton = (
    <button
      type="button"
      onClick={() => void startFromCurrentLocation()}
      disabled={locating}
      className="select-none touch-manipulation mb-3 w-full min-h-12 rounded-card border border-line bg-surface px-4 flex items-center gap-3 text-left text-body-strong text-ink active:bg-canvas disabled:opacity-60 transition-colors duration-75"
    >
      {locating ? (
        <Loader2 className="w-5 h-5 text-brand animate-spin" aria-hidden="true" />
      ) : (
        <LocateFixed className="w-5 h-5 text-brand" aria-hidden="true" />
      )}
      {locating ? "현재 위치 찾는 중" : "현재 위치에서 출발"}
    </button>
  );

  const favoriteTarget: Field = active ?? (fromGroup ? "to" : "from");

  const pillClass =
    "relative select-none touch-manipulation h-10 rounded-full bg-surface border border-line px-4 text-body text-ink active:bg-brand-soft active:scale-[0.98] transition-transform duration-100 before:content-[''] before:absolute before:inset-x-0 before:-inset-y-0.5";

  const renderField = (field: Field) => {
    const value = field === "from" ? fromText : toText;
    const isFrom = field === "from";
    return (
      <div className="relative">
        <span
          className="absolute left-4 top-1/2 -translate-y-1/2 flex w-4 justify-center pointer-events-none"
          aria-hidden="true"
        >
          {isFrom ? (
            <span className="h-3 w-3 rounded-full border-2 border-brand" />
          ) : (
            <MapPin className="w-4 h-4 text-brand" />
          )}
        </span>
        <input
          type="text"
          value={value}
          onChange={(e) => handleInput(field, e.target.value)}
          onFocus={() => setActive(field)}
          placeholder={isFrom ? "출발 정류장" : "도착 정류장 (예: 전주한옥마을)"}
          aria-label={isFrom ? "출발 정류장" : "도착 정류장"}
          className="w-full h-12 bg-transparent pl-11 pr-24 text-base text-ink placeholder:text-faint focus:outline-none"
        />
        {value && (
          <button
            type="button"
            onClick={() => clearField(field)}
            aria-label={isFrom ? "출발 정류장 지우기" : "도착 정류장 지우기"}
            /* 보이는 원 24px, ::before로 사방 10px씩 넓혀 누르는 영역 44px. */
            className="select-none touch-manipulation absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full active:bg-line before:content-[''] before:absolute before:-inset-2.5"
          >
            <X className="w-4 h-4 text-faint" />
          </button>
        )}
      </div>
    );
  };

  // 근처 정류장으로 출발을 정했을 때 안내 카드(지도 + 목록)에 보여 줄 요약.
  // 정류장 좌표는 이 묶음에만 있고, 가까운 순으로 담겨 있어 첫 정류장이 가장
  // 가깝다. 번호(rank)는 지도 번호표와 목록이 같다. 거리는 직선거리다.
  const nearbyFrom = (() => {
    const origin = fromGroup?.origin;
    if (!fromGroup || !origin) return null;
    const items = fromGroup.stations.flatMap((st, i) =>
      st.lat == null || st.lng == null
        ? []
        : [
            {
              id: st.id,
              name: st.name,
              arsId: st.arsId,
              rank: i + 1,
              lat: st.lat,
              lng: st.lng,
              distance: formatDistance(distanceMeters(origin, { lat: st.lat, lng: st.lng })),
            },
          ],
    );
    if (items.length === 0) return null;
    // 기기가 알려 준 오차 반경. 크면 내 위치가 아닐 수 있다는 안내를 붙인다.
    const accuracy = origin.accuracy;
    return {
      origin,
      items,
      closest: items[0],
      accuracyLabel: accuracy != null ? formatDistance(Math.ceil(accuracy / 10) * 10) : "",
      poorAccuracy: accuracy != null && accuracy > POOR_ACCURACY_M,
    };
  })();

  // "현재 위치" 묶음은 출발로만 쓴다. 바꾸면 도착 칸에 들어가 버리므로 바꾸기를 숨긴다.
  const hasText = (fromText !== "" || toText !== "") && !fromGroup?.origin;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-canvas">
      {/* 버스/알림과 같은 공통 얇은 헤더(DESIGN.md 8장). canvas 바탕, 제목 줄은
          안전영역 + 3.5rem, 아래 선 없음. 부제는 홈의 "전주시 ▾"처럼 제목 위
          작은 글씨다. 그러면 탭을 오갈 때 검은 제목이 같은 높이에 있다(5단계
          사용자 확인). 결과 목록은 아래 별도 스크롤 상자라 헤더 밑으로 비치지
          않는다. */}
      <header className="bg-canvas px-5 pt-safe-0 pb-4 shrink-0">
        <div className="h-14 flex flex-col justify-center">
          <p className="text-caption text-muted">
            목적지까지 버스 타는 방법
          </p>
          <h1 className="text-title text-ink">길찾기</h1>
        </div>

        {/* 출발·도착 두 칸을 한 판(흰 면 + 1px line)에 묶고 칸 사이를 1px 선으로
            나눈다. 제목 아래 간격은 홈·버스·마이와 같은 15px(mt-2)이다.
            바꾸기 버튼은 두 칸 사이 선 위, 지우기(X)에서 떨어진 자리에 둔다. */}
        <div className="relative mt-2 bg-surface border border-line rounded-card focus-within:ring-2 focus-within:ring-brand transition-shadow">
          {renderField("from")}
          <div className="h-px bg-line ml-11 mr-4" aria-hidden="true" />
          {renderField("to")}

          {hasText && (
            <button
              type="button"
              onClick={swap}
              aria-label="출발과 도착 바꾸기"
              /* 보이는 원 32px, ::before로 넓혀 누르는 영역 44px. */
              className="select-none touch-manipulation absolute right-14 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-surface border border-line flex items-center justify-center active:bg-canvas before:content-[''] before:absolute before:-inset-1.5"
            >
              <ArrowUpDown className="w-4 h-4 text-muted" aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      {/* 좌우 20px. 아래 pb-5 + App 스크롤 영역의 0.5rem = 하단 탭 위 28px. */}
      <div className="flex-1 overflow-y-auto overscroll-none px-5 pb-5">
        {/* 1) 정류장 이름을 치는 중: 검색 결과에서 고른다 */}
        {typing && active && (
          <>
            {active === "from" && locationButton}
            {suggestStatus === "loading" && (
              <div className="space-y-2" role="status" aria-label="정류장 검색 중">
                <LoadingSkeleton className="h-14" />
                <LoadingSkeleton className="h-14" />
                <LoadingSkeleton className="h-14" />
              </div>
            )}
            {suggestStatus === "error" && (
              <ErrorState onRetry={() => setSuggestRetry((n) => n + 1)} />
            )}
            {suggestStatus === "success" && suggestions.length === 0 && (
              <EmptyState
                icon={SearchX}
                title="검색 결과가 없어요"
                subtitle="정류장 이름을 다시 확인해 주세요"
              />
            )}
            {suggestStatus === "success" && suggestions.length > 0 && (
              /* 버스 탭 검색 결과와 같은 문법: 한 판 + 구분선. */
              <div className="bg-surface rounded-card border border-line overflow-hidden divide-y divide-line">
                {suggestions.map((group) => (
                  <button
                    key={group.stations[0]?.id ?? group.name}
                    type="button"
                    onClick={() => pickGroup(active, group)}
                    className="w-full min-h-14 px-4 py-3 text-left select-none touch-manipulation transition-colors duration-75 active:bg-canvas"
                  >
                    <p className="text-body-strong text-ink truncate">{group.name}</p>
                    <p className="mt-0.5 text-caption text-muted truncate tabular-nums">
                      {groupCaption(group)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* 2) 출발·도착이 모두 정해졌고 입력 중이 아닐 때: 결과 */}
        {!typing && sameStop && (
          <EmptyState
            icon={Navigation}
            title="출발과 도착이 같아요"
            subtitle="다른 정류장을 골라 주세요"
          />
        )}

        {!typing && ready && resultStatus === "loading" && (
          <div className="space-y-3" role="status" aria-label="경로 찾는 중">
            <LoadingSkeleton className="h-28" />
            <LoadingSkeleton className="h-28" />
          </div>
        )}

        {!typing && ready && resultStatus === "error" && (
          <ErrorState onRetry={() => setResultRetry((n) => n + 1)} />
        )}

        {!typing && ready && resultStatus === "success" && results.length === 0 && (
          <EmptyState
            icon={SearchX}
            title="직행 버스가 없어요"
            subtitle="갈아타야 하는 경로는 아직 찾지 못해요"
          />
        )}

        {!typing && ready && resultStatus === "success" && results.length > 0 && (
          <div>
            {/* 섹션 제목(Body-strong, ink)과 내용 사이 12px(6장). */}
            <p className="text-body-strong text-ink mb-3">
              직행 버스 {results.length}개
            </p>
            <ul className="space-y-3">
              {results.map((result, index) => {
                const key = directRouteKey(result);
                const selected = key === selectedKey;
                const category = getRouteCategory(result.route.name);
                const isMain = category === "본선";
                const arrival = key in arrivals ? arrivals[key] : undefined;
                const live =
                  index < MAX_LIVE_ARRIVALS
                    ? arrival === undefined
                      ? "도착 정보 확인 중"
                      : liveArrivalLabel(arrival)
                    : null;
                const walk = walkDistanceLabel(fromGroup?.origin, result);
                const steps = selected ? buildSteps(result, walk) : [];

                return (
                  <li
                    key={key}
                    className={`bg-surface rounded-card border overflow-hidden ${
                      selected ? "border-brand" : "border-line"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedKey(key)}
                      aria-pressed={selected}
                      className="w-full min-h-16 px-4 py-3.5 text-left select-none touch-manipulation transition-colors duration-75 active:bg-canvas"
                    >
                      <div className="flex items-center gap-3">
                        {/* 버스 탭 검색 결과와 같은 배지: 48×36, 모서리 12px. */}
                        <div
                          className={`min-w-12 h-9 px-1 rounded-tile flex items-center justify-center shrink-0 text-white ${
                            isMain ? "bg-route-main" : "bg-route-branch"
                          }`}
                        >
                          <span className="text-body-strong font-bold tabular-nums whitespace-nowrap">
                            {result.route.number}
                          </span>
                          <span className="sr-only">{category}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-body-strong text-ink truncate">
                            {result.boardStation.name}
                            <span className="text-faint mx-1.5" aria-hidden="true">→</span>
                            <span className="sr-only">에서 </span>
                            {result.alightStation.name}
                          </p>
                          <p className="mt-0.5 text-caption text-muted truncate">
                            {result.route.start || "기점 정보 없음"} →{" "}
                            {result.route.end || "종점 정보 없음"} 방향
                          </p>
                        </div>
                        <span className="shrink-0 text-body-strong text-ink tabular-nums">
                          {result.stopCount}정거장
                        </span>
                      </div>
                      {live && (
                        <p className="mt-2 text-caption text-muted tabular-nums">
                          {walk ? `${walk.replace("현재 위치에서 ", "")} · ` : ""}승차 정류장 · {live}
                        </p>
                      )}
                    </button>

                    {selected && (
                      /* 행마다 아래 선을 그리고 마지막만 지우는 방식이었다. divide-y는
                         첫 행 위와 마지막 행 아래에 선을 넣지 않아 그 예외가 필요 없다. */
                      <ol className="divide-y divide-line border-t border-line">
                        {steps.map((step, idx) => (
                          <li key={idx} className="flex gap-3 px-4 py-3.5">
                            <div className="flex flex-col items-center">
                              {/* 단계 아이콘 타일 40px, 모서리 12px(8장). */}
                              <div
                                className={`h-10 w-10 rounded-tile flex items-center justify-center shrink-0 ${STEP_ICON_BG}`}
                              >
                                <StepIcon type={step.icon} />
                              </div>
                              {idx < steps.length - 1 && (
                                <div className="w-0.5 flex-1 min-h-3 bg-line mt-1.5" aria-hidden="true" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0 pt-1.5">
                              <p className="text-body-strong text-ink">
                                <span className="text-brand mr-1.5">{idx + 1}</span>
                                {step.title}
                              </p>
                              {step.detail && (
                                <p className="mt-0.5 text-caption text-muted">
                                  {step.detail}
                                </p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-caption text-muted">
              정거장이 적은 순서예요. 걷는 시간과 갈아타는 경로는 아직 계산하지 않아요.
            </p>
          </div>
        )}

        {/* 3) 아직 고르는 중: 즐겨찾기·인기 목적지 알약과 안내 */}
        {!typing && !sameStop && !ready && (
          <>
            {showLocationButton && locationButton}
            {favoriteNames.length > 0 && (
              <>
                <p className="text-body-strong text-ink mb-3">
                  즐겨찾기 정류장
                </p>
                {/* 알약 높이 40px + 위아래 2px씩 넓혀 누르는 영역 44px. 줄 사이
                    8px 안에서 이웃 줄과 겹치지 않는다. */}
                <div className="flex flex-wrap gap-2 mb-7">
                  {favoriteNames.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => void selectByName(name, favoriteTarget)}
                      className={pillClass}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </>
            )}

            <p className="text-body-strong text-ink mb-3">
              인기 목적지
            </p>
            <div className="flex flex-wrap gap-2 mb-7">
              {POPULAR_DESTINATIONS.map((dest) => (
                <button
                  key={dest}
                  type="button"
                  onClick={() => void selectByName(dest, "to")}
                  className={pillClass}
                >
                  {dest}
                </button>
              ))}
            </div>

            {nearbyFrom ? (
              /* 출발칸이 "근처 정류장"이라고만 보이면 어디를 찾았는지 알 수 없다.
                 지도에 내 위치와 근처 정류장을 번호로 찍고, 아래에 같은 번호로
                 이름·정류장 번호·직선거리를 말한 뒤 남은 일(도착 고르기)을 알린다.
                 걷는 시간은 말하지 않는다(CLAUDE.md 5-1장). */
              <div className="bg-surface rounded-card border border-line overflow-hidden">
                <Suspense fallback={<LoadingSkeleton className="h-56 rounded-none" />}>
                  <NearbyMap
                    origin={nearbyFrom.origin}
                    stations={nearbyFrom.items.map(
                      (it): NearbyMapStation => ({
                        id: it.id,
                        name: it.name,
                        rank: it.rank,
                        lat: it.lat,
                        lng: it.lng,
                      }),
                    )}
                  />
                </Suspense>
                <div className="px-4 pt-4 pb-1">
                  <p className="text-body-strong text-ink">
                    근처 정류장 {nearbyFrom.items.length}곳을 찾았어요
                  </p>
                  <p className="mt-0.5 text-caption text-muted">
                    가장 가까운 곳은 {nearbyFrom.closest.name} · 직선 약{" "}
                    <span className="tabular-nums">{nearbyFrom.closest.distance}</span>
                    <br />
                    이제 도착 정류장을 골라 주세요
                  </p>
                </div>
                {nearbyFrom.accuracyLabel && (
                  <p className="px-4 mt-2 text-caption text-muted">
                    위치 오차 약 <span className="tabular-nums">{nearbyFrom.accuracyLabel}</span>
                  </p>
                )}
                {nearbyFrom.poorAccuracy && (
                  /* 오차가 크면 이 기기가 알려 준 위치가 실제 내 위치와 다를 수 있다.
                     틀린 위치를 맞는 것처럼 보여 주지 않고, 다시 받아 보게 한다. */
                  <div className="mx-4 mt-3 rounded-xl border border-line bg-canvas px-3 py-3 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-delay" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-caption text-ink">
                        내 위치와 다를 수 있어요. 이 기기가 정확한 위치를 주지 못하고 있어요.
                      </p>
                      <button
                        type="button"
                        onClick={() => void startFromCurrentLocation()}
                        disabled={locating}
                        className="select-none touch-manipulation mt-1 min-h-11 text-body-strong text-brand disabled:opacity-60"
                      >
                        {locating ? "위치 찾는 중" : "위치 다시 찾기"}
                      </button>
                    </div>
                  </div>
                )}
                <ul className="mt-3 divide-y divide-line border-t border-line">
                  {nearbyFrom.items.map((it) => (
                    <li key={it.id} className="flex items-center gap-3 px-4 py-3">
                      <span
                        className="h-6 w-6 shrink-0 rounded-md bg-brand-fill text-caption font-bold tabular-nums text-white flex items-center justify-center"
                        aria-hidden="true"
                      >
                        {it.rank}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-body-strong text-ink truncate">{it.name}</p>
                        {it.arsId && (
                          <p className="text-caption text-muted tabular-nums">
                            정류장 번호 {it.arsId}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-caption text-muted tabular-nums">
                        직선 약 {it.distance}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              /* 알림 빈 상태와 비슷한 안내 카드 */
              <div className="bg-surface rounded-card border border-line p-8 text-center">
                <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-canvas flex items-center justify-center">
                  <Navigation className="w-7 h-7 text-faint" aria-hidden="true" />
                </div>
                <p className="text-body-strong text-ink mb-1">
                  출발과 도착 정류장을 골라 주세요
                </p>
                <p className="text-caption text-muted">
                  갈아타지 않고 갈 수 있는
                  <br />
                  버스와 정거장 수를 알려드려요
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
