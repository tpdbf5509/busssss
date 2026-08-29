import { Loader2, AlertTriangle, Inbox, Radio, Clock3 } from "lucide-react";
import { formatArrivalText } from "@/lib/formatArrival";
import type { ReliabilityState } from "@/lib/reliability";

export function LoadingSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-slate-200/70 rounded-xl ${className}`} />
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-14 h-14 rounded-full border border-slate-200 flex items-center justify-center mb-4">
        <AlertTriangle className="w-7 h-7 text-red-500" />
      </div>
      <p className="text-slate-700 font-medium mb-1">정보를 불러오지 못했어요</p>
      <p className="text-slate-400 text-sm mb-4">잠시 후 다시 시도해 주세요</p>
      <button
        onClick={onRetry}
        className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors flex items-center gap-2"
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
      <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-slate-400" />
      </div>
      <p className="text-slate-600 font-medium mb-1">{title}</p>
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
      className={`relative w-11 h-6 rounded-full transition-colors ${
        checked ? "bg-blue-600" : "bg-slate-300"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
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
      ? "border border-slate-300 text-slate-700"
      : minutes <= 10
      ? "border border-slate-200 text-slate-500"
      : "bg-slate-100 text-slate-500";
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ${color}`}
    >
      {formatArrivalText(minutes, stopsAway)}
    </span>
  );
}

/**
 * A1. 도착정보 신뢰도 태그.
 * 색상만이 아니라 아이콘/문구로도 구분해서(B3 접근성) 실시간 GPS 기반인지
 * 배차표 기반 추정인지, 그리고 지연이 의심되는지를 알려줍니다.
 */
export function ReliabilityTag({ reliability }: { reliability: ReliabilityState }) {
  if (reliability.source === "unknown") return null;

  if (reliability.delayed) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-600">
        <AlertTriangle className="w-2.5 h-2.5" />
        지연 의심
      </span>
    );
  }

  if (reliability.source === "realtime") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-600">
        <Radio className="w-2.5 h-2.5" />
        실시간
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-400">
      <Clock3 className="w-2.5 h-2.5" />
      확인 중
    </span>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <Loader2 className={`w-5 h-5 animate-spin text-blue-500 ${className}`} />;
}
