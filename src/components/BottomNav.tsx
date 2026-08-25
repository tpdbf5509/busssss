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
      style={{ paddingBottom: "min(env(safe-area-inset-bottom), 8px)" }}
    >
      <div className="max-w-md mx-auto grid grid-cols-5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className="flex flex-col items-center justify-center py-1.5 gap-0.5 transition-colors"
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