import { useState } from "react";
import {
  Search,
  MapPin,
  Footprints,
  Bus,
  Target,
  X,
  Navigation,
} from "lucide-react";

type RouteStep = {
  type: "walk_to_stop" | "board" | "ride" | "alight" | "walk_to_dest";
  title: string;
  detail: string;
  icon: "walk" | "bus" | "pin" | "target";
};

type RecommendedRoute = {
  destination: string;
  currentArea: string;
  steps: RouteStep[];
  summary: string;
};

const MOCK_ROUTES: Record<string, RecommendedRoute> = {
  전주한옥마을: {
    destination: "전주한옥마을",
    currentArea: "전주 ○○동",
    summary: "약 25분 · 환승 없음",
    steps: [
      {
        type: "walk_to_stop",
        title: "가까운 정류장으로 이동",
        detail: "○○정류장까지 도보 약 3분",
        icon: "walk",
      },
      {
        type: "board",
        title: "79번 버스 탑승",
        detail: "한옥마을 방향",
        icon: "bus",
      },
      {
        type: "ride",
        title: "6개 정류장 이동",
        detail: "약 15분 소요",
        icon: "bus",
      },
      {
        type: "alight",
        title: "전주한옥마을 정류장에서 하차",
        detail: "",
        icon: "pin",
      },
      {
        type: "walk_to_dest",
        title: "목적지까지 이동",
        detail: "도보 약 4분",
        icon: "target",
      },
    ],
  },
  전북대학교: {
    destination: "전북대학교",
    currentArea: "전주 ○○동",
    summary: "약 20분 · 환승 없음",
    steps: [
      {
        type: "walk_to_stop",
        title: "가까운 정류장으로 이동",
        detail: "○○정류장까지 도보 약 2분",
        icon: "walk",
      },
      {
        type: "board",
        title: "101번 버스 탑승",
        detail: "전북대 방향",
        icon: "bus",
      },
      {
        type: "ride",
        title: "8개 정류장 이동",
        detail: "약 12분 소요",
        icon: "bus",
      },
      {
        type: "alight",
        title: "전북대학교 정류장에서 하차",
        detail: "",
        icon: "pin",
      },
      {
        type: "walk_to_dest",
        title: "목적지까지 이동",
        detail: "도보 약 3분",
        icon: "target",
      },
    ],
  },
};

const POPULAR_DESTINATIONS = [
  "전주한옥마을",
  "전북대학교",
  "전주역",
  "고속버스터미널",
  "전주월드컵경기장",
  "덕진공원",
];

function StepIcon({ type }: { type: RouteStep["icon"] }) {
  const base = "w-5 h-5";
  switch (type) {
    case "walk":
      return <Footprints className={`${base} text-emerald-600`} />;
    case "bus":
      return <Bus className={`${base} text-blue-600`} />;
    case "pin":
      return <MapPin className={`${base} text-orange-500`} />;
    case "target":
      return <Target className={`${base} text-red-500`} />;
    default:
      return <Navigation className={`${base} text-slate-500`} />;
  }
}

function stepIconBg(_type: RouteStep["icon"]) {
  // 연한 색 배경을 종류별로 다르게 쓰면 아이콘 색과 겹쳐 톤온톤이 된다.
  // 배경은 항상 중립으로 통일하고, 종류 구분은 StepIcon의 아이콘 색으로만 전달한다.
  return "bg-slate-100";
}

export function RouteScreen() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<RecommendedRoute | null>(null);
  const [searching, setSearching] = useState(false);

  const handleSearch = (dest?: string) => {
    const q = (dest ?? query).trim();
    if (!q) return;

    setSearching(true);
    setQuery(q);

    setTimeout(() => {
      const key = Object.keys(MOCK_ROUTES).find(
        (k) => q.includes(k) || k.includes(q)
      );
      if (key) {
        setResult(MOCK_ROUTES[key]);
      } else {
        setResult({
          destination: q,
          currentArea: "전주 ○○동",
          summary: "경로 계산 준비 중",
          steps: [
            {
              type: "walk_to_stop",
              title: "가까운 정류장으로 이동",
              detail: "○○정류장까지 도보 약 3분",
              icon: "walk",
            },
            {
              type: "board",
              title: "○○번 버스 탑승",
              detail: "목적지 방향",
              icon: "bus",
            },
            {
              type: "ride",
              title: "N개 정류장 이동",
              detail: "소요 시간 계산 예정",
              icon: "bus",
            },
            {
              type: "alight",
              title: `${q} 근처 정류장에서 하차`,
              detail: "",
              icon: "pin",
            },
            {
              type: "walk_to_dest",
              title: "목적지까지 이동",
              detail: "도보 약 5분",
              icon: "target",
            },
          ],
        });
      }
      setSearching(false);
    }, 600);
  };

  const clearResult = () => {
    setResult(null);
    setQuery("");
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50">
      {/* 버스/알림과 동일한 흰 헤더 */}
      <header className="bg-white px-5 pt-safe-16 pb-5 border-b border-slate-100 sticky top-0 z-30 shrink-0">
        <h1 className="text-xl font-bold text-slate-900">길찾기</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          목적지까지 버스 타는 방법
        </p>

        <div className="relative mt-3">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="어디로 가시나요? (예: 전주한옥마을)"
            className="w-full pl-10 pr-10 py-3 bg-slate-100 rounded-2xl text-base text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
          />
          {query && (
            <button
              type="button"
              onClick={clearResult}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-slate-200"
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => handleSearch()}
          disabled={searching || !query.trim()}
          className="mt-3 w-full rounded-2xl bg-blue-600 text-white text-sm font-semibold py-3 disabled:opacity-40 active:scale-[0.99] transition-all"
        >
          {searching ? "검색 중..." : "경로 검색"}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6">
        {!result && (
          <>
            <p className="text-xs font-semibold text-slate-500 mb-2 px-0.5">
              인기 목적지
            </p>
            <div className="flex flex-wrap gap-2 mb-5">
              {POPULAR_DESTINATIONS.map((dest) => (
                <button
                  key={dest}
                  type="button"
                  onClick={() => handleSearch(dest)}
                  className="rounded-full bg-white border border-slate-100 px-3.5 py-1.5 text-sm text-slate-700 hover:border-blue-200 hover:bg-blue-50 active:scale-[0.98] transition-all shadow-sm"
                >
                  {dest}
                </button>
              ))}
            </div>

            {/* 알림 빈 상태와 비슷한 안내 카드 */}
            <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center shadow-sm">
              <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-slate-100 flex items-center justify-center">
                <Navigation className="w-7 h-7 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-600 mb-1">
                목적지를 입력해 주세요
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                어디에서 몇 번 버스를 타고
                <br />
                어디에서 내려야 하는지 알려드려요
              </p>
            </div>
          </>
        )}

        {result && (
          <div className="space-y-3">
            {/* 목적지 요약 카드 */}
            <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-slate-400 mb-0.5">목적지</p>
                  <h2 className="text-lg font-bold text-slate-900 truncate">
                    {result.destination}
                  </h2>
                  <p className="mt-1 text-xs text-slate-400 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    현재 위치 · {result.currentArea}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 text-blue-600 text-xs font-semibold px-2.5 py-1">
                  {result.summary}
                </span>
              </div>
            </div>

            {/* 단계별 경로 카드 */}
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-slate-50">
                <p className="text-sm font-semibold text-slate-800">추천 경로</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  실제 경로 계산은 추후 연동 예정입니다
                </p>
              </div>

              <ol>
                {result.steps.map((step, idx) => (
                  <li
                    key={idx}
                    className="flex gap-3 px-4 py-3.5 border-b border-slate-50 last:border-b-0"
                  >
                    <div className="flex flex-col items-center">
                      <div
                        className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${stepIconBg(step.icon)}`}
                      >
                        <StepIcon type={step.icon} />
                      </div>
                      {idx < result.steps.length - 1 && (
                        <div className="w-0.5 flex-1 min-h-[12px] bg-slate-100 mt-1.5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pt-1.5">
                      <p className="text-sm font-semibold text-slate-800">
                        <span className="text-blue-600 mr-1.5">{idx + 1}</span>
                        {step.title}
                      </p>
                      {step.detail && (
                        <p className="mt-0.5 text-xs text-slate-400">
                          {step.detail}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <button
              type="button"
              onClick={clearResult}
              className="w-full rounded-2xl border border-slate-100 bg-white py-3.5 text-sm font-medium text-slate-600 hover:bg-slate-50 active:scale-[0.99] shadow-sm transition-all"
            >
              다른 목적지 검색
            </button>
          </div>
        )}
      </div>
    </div>
  );
}