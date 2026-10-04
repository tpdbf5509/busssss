import { Bus, Home, Navigation, User } from "lucide-react";

export type TabId = "home" | "bus" | "route" | "alert" | "my";

/* 하단 탭은 4개다(DESIGN.md 7-9). 알림은 탭에서 빼고 홈 헤더의 벨로
   옮겼다. 알림 화면 자체는 그대로라 TabId에는 "alert"가 남는다 — 벨,
   빠른 실행 "하차 알림"으로 들어가고, 화면 위쪽 뒤로 가기로 나온다. */
const tabs = [
  { id: "home" as const, label: "홈", icon: Home },
  { id: "bus" as const, label: "버스", icon: Bus },
  { id: "route" as const, label: "길찾기", icon: Navigation },
  { id: "my" as const, label: "마이", icon: User },
];

/**
 * 떠 있는 하단 탭 (DESIGN.md 7-9).
 *
 * 예전에는 화면 맨 아래에 붙은 흰 띠였고, 스크롤 영역 "아래"에 자기 자리를
 * 차지했다. 이제 화면 위에 떠 있는 카드라 스크롤 내용이 그 아래로 지나간다.
 * 탭이 덮는 높이만큼은 App의 스크롤 영역이 비워 둔다(index.css pb-nav-clear) —
 * 그래야 어느 화면이든 마지막 항목이 탭에 가려지지 않는다.
 */
export function BottomNav({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (id: TabId) => void;
}) {
  return (
    // 하단 안전영역은 pb-nav-safe(index.css)가 담당한다. env()를 쓰지 않는
    // 이유는 그쪽 주석 참고 — iOS standalone PWA에서 값이 부풀어 오른다.
    // 탭 아래로 8px을 더 띄워 떠 있는 카드로 보이게 한다(7-9: pb-nav-safe + 8px).
    // 이 틈은 홈 인디케이터와의 거리라 큰 글씨에서도 늘리지 않는다(px).
    // 탭 높이는 글자가 들어 있어 큰 글씨를 따라가도록 rem(4rem)으로 둔다.
    // 바깥 상자는 좌우 12px 여백까지 덮으므로, 그 여백을 눌러도 아래 내용이
    // 눌리도록 바깥은 터치를 통과시키고 탭 카드만 받는다.
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 px-3 pb-nav-safe">
      <nav
        aria-label="주 메뉴"
        className="pointer-events-auto mb-[8px] h-16 grid grid-cols-4 bg-surface border border-line rounded-nav shadow-float"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              aria-current={isActive ? "page" : undefined}
              /* 칸 전체(약 88×64px)가 누르는 영역이다. hover 없이 active만 쓴다. */
              className="flex flex-col items-center justify-center gap-0.5 select-none touch-manipulation transition-transform duration-100 active:scale-[0.98]"
            >
              {/* 활성 탭은 아이콘 뒤에 52×32px 알약을 깐다. 색만으로 구분하지
                  않도록 알약 모양과 라벨 굵기(600/500)도 함께 바뀐다. */}
              <span
                className={`w-[3.25rem] h-8 rounded-full flex items-center justify-center transition-colors ${
                  isActive ? "bg-brand-soft text-brand" : "text-faint"
                }`}
              >
                <Icon className="w-5 h-5" aria-hidden="true" />
              </span>
              <span
                className={`text-micro transition-colors ${
                  isActive ? "text-brand" : "text-faint font-medium"
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
