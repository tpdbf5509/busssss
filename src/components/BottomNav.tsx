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
    // 하단 안전영역은 pb-nav-safe(index.css)가 담당한다. env()를 쓰지 않는
    // 이유는 그쪽 주석 참고 — iOS standalone PWA에서 값이 부풀어 오른다.
    <nav className="shrink-0 z-40 bg-white/95 backdrop-blur-lg border-t border-line pb-nav-safe">
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
                  isActive ? "text-brand" : "text-faint"
                }`}
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span
                className={`text-[11px] font-medium transition-colors ${
                  isActive ? "text-brand" : "text-faint"
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