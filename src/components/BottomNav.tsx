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
      className="pointer-events-none absolute inset-x-0 bottom-0 z-40 px-3"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 10px)" }}
    >
      <div className="pointer-events-auto max-w-md mx-auto">
        <div className="relative grid grid-cols-5 rounded-[26px] bg-white/60 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_10px_30px_-8px_rgba(15,23,42,0.28),inset_0_1px_0_rgba(255,255,255,0.5)] px-1.5 py-1.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = active === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onChange(tab.id)}
                className="relative flex flex-col items-center justify-center py-1.5 gap-0.5 rounded-[20px] transition-colors"
              >
                <span
                  className={`absolute inset-0 rounded-[20px] bg-blue-50/80 backdrop-blur-sm transition-all duration-200 ${
                    isActive ? "opacity-100 scale-100" : "opacity-0 scale-90"
                  }`}
                />
                <Icon
                  className={`relative w-5 h-5 transition-colors duration-200 ${
                    isActive ? "text-blue-600" : "text-slate-400"
                  }`}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                <span
                  className={`relative text-[11px] transition-all duration-200 ${
                    isActive ? "text-blue-600 font-bold" : "text-slate-400 font-medium"
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
