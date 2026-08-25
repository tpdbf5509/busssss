import { Loader2, AlertTriangle, Inbox } from "lucide-react";
import { formatArrivalText } from "@/lib/formatArrival";

export function LoadingSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-shimmer rounded-xl bg-slate-200/60 ${className}`} />
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-50 to-rose-100 flex items-center justify-center mb-4 card-shadow">
        <AlertTriangle className="w-7 h-7 text-red-500" />
      </div>
      <p className="text-slate-800 font-semibold mb-1">정보를 불러오지 못했어요</p>
      <p className="text-slate-400 text-sm mb-5">잠시 후 다시 시도해 주세요</p>
      <button
        onClick={onRetry}
        className="px-5 py-2.5 bg-slate-900 text-white rounded-full text-sm font-medium hover:bg-slate-800 active:scale-95 transition-all flex items-center gap-2 card-shadow"
      >
        <Loader2 className="w-4 h-4" />
        다시 시도
      </button>
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  subtitle,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-slate-400" />
      </div>
      <p className="text-slate-600 font-semibold mb-1">{title}</p>
      {subtitle && <p className="text-slate-400 text-sm">{subtitle}</p>}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
        checked ? "bg-blue-600" : "bg-slate-300"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-[0_1px_3px_rgba(15,23,42,0.25)] transition-transform duration-200 ease-out ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function ArrivalBadge({
  minutes,
  stopsAway,
}: {
  minutes: number;
  stopsAway?: number | null;
}) {
  const color =
    minutes <= 3
      ? "bg-red-50 text-red-600"
      : minutes <= 10
      ? "bg-blue-50 text-blue-600"
      : "bg-slate-100 text-slate-500";
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${color}`}
    >
      {formatArrivalText(minutes, stopsAway)}
    </span>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <Loader2 className={`w-5 h-5 animate-spin text-blue-500 ${className}`} />;
}
