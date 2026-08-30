import { Bus, Home, Navigation, Bell, User } from "lucide-react";

export type TabId = "home" | "bus" | "route" | "alert" | "my";

const tabs = [
  { id: "home" as const, label: "홈", icon: Home },
  { id: "bus" as const, label: "버스", icon: Bus },
  { id: "route" as const, label: "길찾기", icon: Navigation },
  { id: "alert" as const, label: "알림", icon: Bell },
  { id: "my" as const, label: "마이", icon: User },
];

export function BottomNav({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (id: TabId) => void;
}) {
  return (
    <nav
      className="shrink-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200"
      // 하단 안전영역 확보 + 상한 클램프.
      //
      // env(safe-area-inset-bottom)은 실행 환경에 따라 값이 다르다. Safari
      // 브라우저 탭에서는 하단 툴바가 이미 안전영역을 차지해 0을 반환하지만,
      // 홈 화면 PWA(standalone)에서는 앱이 물리 화면 최하단까지 차지하므로
      // 홈 인디케이터 실측값(34px)을 그대로 반환한다. 그 값을 다 쓰면 PWA에서만
      // 네비바가 26px 더 두꺼워 보인다.
      //
      // 홈 인디케이터는 화면 하단 8~13pt 구간에 있으므로 20px면 7px 여유를 두고
      // 완전히 비켜가고, iOS의 홈 스와이프 제스처 구간(하단 ~20pt) 밖에 탭
      // 버튼이 놓여 탭이 제스처에 먹히지도 않는다. min()으로 상한을 두되,
      // 안전영역이 없는 기기용 최소값 8px은 max()로 보장한다.
      style={{ paddingBottom: "max(min(env(safe-area-inset-bottom), 20px), 8px)" }}
    >
      <div className="max-w-md mx-auto grid grid-cols-5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className="flex flex-col items-center justify-center py-1 gap-0.5 transition-colors"
            >
              <Icon
                className={`w-5 h-5 transition-colors ${
                  isActive ? "text-blue-600" : "text-slate-400"
                }`}
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span
                className={`text-[11px] font-medium transition-colors ${
                  isActive ? "text-blue-600" : "text-slate-400"
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}