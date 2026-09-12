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

// 하드코딩된 예시 경로(MOCK_ROUTES)는 제거했다. 특정 목적지에만 진짜
// 계산 결과처럼 보이는 가짜 경로를 보여주고 있었기 때문이다(git 이력 참고).
// 실제 경로 계산을 붙일 때 이 자리에 연동한다.

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
      return <Navigation className={`${base} text-muted`} />;
  }
}

// 연한 색 배경을 종류별로 다르게 쓰면 아이콘 색과 겹쳐 톤온톤이 된다.
// 배경은 항상 중립으로 통일하고, 종류 구분은 StepIcon의 아이콘 색으로만 전달한다.
const STEP_ICON_BG = "bg-canvas";

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
      // 예전에는 "전주한옥마을"·"전북대학교"만 하드코딩된 가짜 경로(구체적인
      // 버스 번호·소요시간까지 포함)를 보여줬고, 그 둘에만 "준비 중" 안내가
      // 빠져 있어 진짜 계산 결과처럼 보였다. 게다가 부분 문자열 매칭이라
      // "전주"만 쳐도 한옥마을 가짜 경로가 떴다. 실제 경로 계산을 붙이기
      // 전까지는 목적지와 무관하게 준비 중 안내로 통일한다.
      {
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
    <div className="h-full flex flex-col overflow-hidden bg-canvas">
      {/* 버스/알림과 동일한 흰 헤더 */}
      <header className="bg-surface px-5 pt-safe-16 pb-5 border-b border-line sticky top-0 z-30 shrink-0">
        <h1 className="text-xl font-bold text-ink">길찾기</h1>
        <p className="text-xs text-faint mt-0.5">
          목적지까지 버스 타는 방법
        </p>

        <div className="relative mt-3">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="어디로 가시나요? (예: 전주한옥마을)"
            className="w-full pl-10 pr-10 py-3 bg-canvas rounded-2xl text-base text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-brand focus:bg-surface transition-all"
          />
          {query && (
            <button
              type="button"
              onClick={clearResult}
              className="select-none touch-manipulation absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full active:bg-line"
            >
              <X className="w-4 h-4 text-faint" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => handleSearch()}
          disabled={searching || !query.trim()}
          className="select-none touch-manipulation mt-3 w-full rounded-2xl bg-brand text-white text-sm font-semibold py-3 disabled:opacity-40 active:scale-[0.99] transition-all"
        >
          {searching ? "검색 중..." : "경로 검색"}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-none px-4 pt-4 pb-6">
        {!result && (
          <>
            <p className="text-xs font-semibold text-muted mb-2 px-0.5">
              인기 목적지
            </p>
            <div className="flex flex-wrap gap-2 mb-5">
              {POPULAR_DESTINATIONS.map((dest) => (
                <button
                  key={dest}
                  type="button"
                  onClick={() => handleSearch(dest)}
                  className="select-none touch-manipulation rounded-full bg-surface border border-line px-3.5 py-1.5 text-sm text-ink active:border-brand/40 active:bg-brand/10 active:scale-[0.98] transition-all"
                >
                  {dest}
                </button>
              ))}
            </div>

            {/* 알림 빈 상태와 비슷한 안내 카드 */}
            <div className="bg-surface rounded-2xl border border-line p-8 text-center">
              <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-canvas flex items-center justify-center">
                <Navigation className="w-7 h-7 text-faint" />
              </div>
              <p className="text-sm font-medium text-muted mb-1">
                목적지를 입력해 주세요
              </p>
              <p className="text-xs text-faint leading-relaxed">
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
            <div className="bg-surface rounded-2xl border border-line p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-faint mb-0.5">목적지</p>
                  <h2 className="text-lg font-bold text-ink truncate">
                    {result.destination}
                  </h2>
                  <p className="mt-1 text-xs text-faint flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    현재 위치 · {result.currentArea}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-canvas text-brand text-xs font-semibold px-2.5 py-1">
                  {result.summary}
                </span>
              </div>
            </div>

            {/* 단계별 경로 카드 */}
            <div className="bg-surface rounded-2xl border border-line overflow-hidden">
              <div className="px-4 py-3 border-b border-line">
                <p className="text-xs font-semibold text-muted tracking-wide">추천 경로</p>
                <p className="text-xs text-faint mt-0.5">
                  실제 경로 계산은 추후 연동 예정입니다
                </p>
              </div>

              {/* 행마다 아래 선을 그리고 마지막만 지우는 방식이었다. divide-y는
                  첫 행 위와 마지막 행 아래에 선을 넣지 않아 그 예외가 필요 없다. */}
              <ol className="divide-y divide-line">
                {result.steps.map((step, idx) => (
                  <li key={idx} className="flex gap-3 px-4 py-3.5">
                    <div className="flex flex-col items-center">
                      <div
                        className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${STEP_ICON_BG}`}
                      >
                        <StepIcon type={step.icon} />
                      </div>
                      {idx < result.steps.length - 1 && (
                        <div className="w-0.5 flex-1 min-h-[12px] bg-line mt-1.5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pt-1.5">
                      <p className="text-sm font-semibold text-ink">
                        <span className="text-brand mr-1.5">{idx + 1}</span>
                        {step.title}
                      </p>
                      {step.detail && (
                        <p className="mt-0.5 text-xs text-faint">
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
              className="select-none touch-manipulation w-full rounded-2xl border border-line bg-surface py-3.5 text-sm font-medium text-muted active:bg-canvas active:scale-[0.99] transition-all"
            >
              다른 목적지 검색
            </button>
          </div>
        )}
      </div>
    </div>
  );
}