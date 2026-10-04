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

// 단계 아이콘은 DESIGN.md 6장 아이콘 타일과 같은 brand 20px이다. 예전에는
// 종류마다 아이콘 색(초록·파랑·주황·빨강)을 달리했는데, 4단계에서 원색을
// 걷어내며 한 색으로 맞췄다. 종류는 아이콘 모양(걷기·버스·핀·과녁)과 단계
// 제목 글자로 구분한다 — 색만으로 구분하지 않는다는 원칙에도 맞다.
function StepIcon({ type }: { type: RouteStep["icon"] }) {
  const base = "w-5 h-5 text-brand";
  switch (type) {
    case "walk":
      return <Footprints className={base} aria-hidden="true" />;
    case "bus":
      return <Bus className={base} aria-hidden="true" />;
    case "pin":
      return <MapPin className={base} aria-hidden="true" />;
    case "target":
      return <Target className={base} aria-hidden="true" />;
    default:
      return <Navigation className={base} aria-hidden="true" />;
  }
}

// 연한 색 배경을 종류별로 다르게 쓰면 아이콘 색과 겹쳐 톤온톤이 된다.
// 예전에는 배경을 중립(canvas)으로 통일하고 종류 구분은 아이콘 색으로만
// 전달했다. 4단계부터는 아이콘이 모두 brand라, 배경도 6장 아이콘 타일의
// brand-soft 하나로 통일한다(종류마다 다른 틴트를 쓰지 않는 원칙은 그대로).
const STEP_ICON_BG = "bg-brand-soft";

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
      {/* 버스/알림과 같은 공통 얇은 헤더(DESIGN.md 8장). 예전에는 흰 바탕 +
          아래 선 + 최소 4rem 윗여백이었다. 이제 canvas 바탕, 제목 줄은
          안전영역 + 3.5rem, 아래 선 없음. 부제는 제목 줄 안에 작게 둔다.
          결과 목록은 아래 별도 스크롤 상자라 헤더 밑으로 비치지 않는다.
          예전에는 부제가 제목 아래였다. 그러면 제목이 홈 "BUS STOP"보다 14px
          위에 있어, 탭을 오갈 때 검은 제목이 위아래로 움직였다(5단계 사용자
          확인). 홈의 "전주시 ▾"처럼 부제를 제목 위 작은 글씨로 옮겨, 같은 두 줄
          묶음(Caption + Title)이 되게 했다. 제목 줄 높이는 그대로라 아래 검색창
          위치는 바뀌지 않는다. */}
      <header className="bg-canvas px-5 pt-safe-0 pb-4 shrink-0">
        <div className="h-14 flex flex-col justify-center">
          <p className="text-caption text-muted">
            목적지까지 버스 타는 방법
          </p>
          <h1 className="text-title text-ink">길찾기</h1>
        </div>

        {/* 검색창과 버튼은 버스 검색과 같은 모양(흰 면 + 1px line, full 모서리).
            제목 아래 간격은 홈·버스·마이와 같은 15px(제목 줄 아래 mt-2)이다.
            예전에는 mt-1(11px)이었다(5단계). */}
        <div className="relative mt-2">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none" aria-hidden="true" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="어디로 가시나요? (예: 전주한옥마을)"
            className="w-full pl-10 pr-10 py-3 bg-surface border border-line rounded-full text-base text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-brand transition-shadow"
          />
          {query && (
            <button
              type="button"
              onClick={clearResult}
              aria-label="검색어 지우기"
              /* 보이는 원 24px, ::before로 사방 10px씩 넓혀 누르는 영역 44px. */
              className="select-none touch-manipulation absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full active:bg-line before:content-[''] before:absolute before:-inset-2.5"
            >
              <X className="w-4 h-4 text-faint" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => handleSearch()}
          disabled={searching || !query.trim()}
          className="select-none touch-manipulation mt-3 w-full rounded-full bg-brand text-white text-body font-semibold py-3 disabled:opacity-40 active:scale-[0.98] transition-transform duration-100"
        >
          {searching ? "검색 중..." : "경로 검색"}
        </button>
      </header>

      {/* 좌우 20px. 아래 pb-5 + App 스크롤 영역의 0.5rem = 하단 탭 위 28px. */}
      <div className="flex-1 overflow-y-auto overscroll-none px-5 pb-5">
        {!result && (
          <>
            {/* 섹션 제목(Body-strong, ink)과 내용 사이 12px(6장). */}
            <p className="text-body-strong text-ink mb-3">
              인기 목적지
            </p>
            {/* 알약 높이 40px + 위아래 2px씩 넓혀 누르는 영역 44px. 줄 사이
                8px 안에서 이웃 줄과 겹치지 않는다. 예전 알약은 34px였다. */}
            <div className="flex flex-wrap gap-2 mb-7">
              {POPULAR_DESTINATIONS.map((dest) => (
                <button
                  key={dest}
                  type="button"
                  onClick={() => handleSearch(dest)}
                  className="relative select-none touch-manipulation h-10 rounded-full bg-surface border border-line px-4 text-body text-ink active:bg-brand-soft active:scale-[0.98] transition-transform duration-100 before:content-[''] before:absolute before:inset-x-0 before:-inset-y-0.5"
                >
                  {dest}
                </button>
              ))}
            </div>

            {/* 알림 빈 상태와 비슷한 안내 카드 */}
            <div className="bg-surface rounded-card border border-line p-8 text-center">
              <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-canvas flex items-center justify-center">
                <Navigation className="w-7 h-7 text-faint" aria-hidden="true" />
              </div>
              <p className="text-body-strong text-ink mb-1">
                목적지를 입력해 주세요
              </p>
              <p className="text-caption text-muted">
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
            <div className="bg-surface rounded-card border border-line p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-caption text-muted mb-0.5">목적지</p>
                  <h2 className="text-title text-ink truncate">
                    {result.destination}
                  </h2>
                  <p className="mt-1 text-caption text-muted flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                    현재 위치 · {result.currentArea}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-canvas text-brand text-caption font-semibold px-2.5 py-1">
                  {result.summary}
                </span>
              </div>
            </div>

            {/* 단계별 경로 카드 */}
            <div className="bg-surface rounded-card border border-line overflow-hidden">
              <div className="px-4 py-3 border-b border-line">
                <p className="text-caption font-semibold text-muted">추천 경로</p>
                <p className="text-caption text-muted mt-0.5">
                  실제 경로 계산은 추후 연동 예정입니다
                </p>
              </div>

              {/* 행마다 아래 선을 그리고 마지막만 지우는 방식이었다. divide-y는
                  첫 행 위와 마지막 행 아래에 선을 넣지 않아 그 예외가 필요 없다. */}
              <ol className="divide-y divide-line">
                {result.steps.map((step, idx) => (
                  <li key={idx} className="flex gap-3 px-4 py-3.5">
                    <div className="flex flex-col items-center">
                      {/* 단계 아이콘 타일 40px, 모서리 12px(8장). */}
                      <div
                        className={`h-10 w-10 rounded-tile flex items-center justify-center shrink-0 ${STEP_ICON_BG}`}
                      >
                        <StepIcon type={step.icon} />
                      </div>
                      {idx < result.steps.length - 1 && (
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
            </div>

            <button
              type="button"
              onClick={clearResult}
              /* 보조 버튼: 흰 면 + 1px line + full 모서리(노선 상세 "배차시간 보기"와
                 같음). 글자는 ink다 — muted는 흰 면 위 4.0:1이라 14px 글자에 모자라다. */
              className="select-none touch-manipulation w-full rounded-full border border-line bg-surface py-3.5 text-body text-ink active:bg-canvas active:scale-[0.98] transition-transform duration-100"
            >
              다른 목적지 검색
            </button>
          </div>
        )}
      </div>
    </div>
  );
}