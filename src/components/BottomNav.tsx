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
    // pb-safe는 max()라 홈 인디케이터(34pt) 높이를 그대로 확보한다.
    // min()으로 상한을 걸면 인디케이터와 겹친다.
    <nav className="shrink-0 z-40 bg-white border-t border-slate-200 pb-safe px-safe">
      <div className="max-w-md mx-auto grid grid-cols-5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className="flex flex-col items-center justify-center py-2 gap-1 transition-colors"
            >
              <Icon
                className={`w-[22px] h-[22px] transition-colors ${
                  isActive ? "text-blue-600" : "text-slate-400"
                }`}
                strokeWidth={isActive ? 2.2 : 1.8}
              />
              <span
                className={`text-[11px] tracking-tight transition-colors ${
                  isActive ? "text-blue-600 font-semibold" : "text-slate-400 font-medium"
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