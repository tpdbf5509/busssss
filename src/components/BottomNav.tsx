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
      className="shrink-0 z-40 bg-white/80 backdrop-blur-xl border-t border-slate-900/5"
      style={{ paddingBottom: "min(env(safe-area-inset-bottom), 8px)" }}
    >
      <div className="max-w-md mx-auto grid grid-cols-5 px-2 pt-1.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className="relative flex flex-col items-center justify-center py-1.5 gap-1 transition-colors"
            >
              <span
                className={`absolute top-0 h-0.5 w-6 rounded-full bg-blue-600 transition-all duration-200 ${
                  isActive ? "opacity-100 scale-100" : "opacity-0 scale-50"
                }`}
              />
              <Icon
                className={`w-5 h-5 transition-all duration-200 ${
                  isActive ? "text-blue-600 scale-110 -translate-y-0.5" : "text-slate-400 scale-100"
                }`}
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span
                className={`text-[11px] transition-all duration-200 ${
                  isActive ? "text-blue-600 font-bold" : "text-slate-400 font-medium"
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