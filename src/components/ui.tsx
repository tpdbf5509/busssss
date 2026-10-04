import { Loader2, AlertTriangle, Inbox, Radio, Clock3, ArrowLeft } from "lucide-react";
import {
  reliabilityChipKind,
  type ReliabilityChipKind,
  type ReliabilityState,
} from "@/lib/reliability";

export function LoadingSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-line rounded-xl ${className}`} />
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-14 h-14 rounded-full bg-canvas flex items-center justify-center mb-4">
        <AlertTriangle className="w-7 h-7 text-danger" aria-hidden="true" />
      </div>
      {/* 글자 크기는 5장 토큰(제목 Body-strong, 안내 Body). 4단계에서 기본
          크기·text-sm을 토큰으로 바꿨다. 버튼은 다른 화면 버튼과 같은 full
          모서리, 높이 44px. */}
      <p className="text-body-strong text-ink mb-1">정보를 불러오지 못했어요</p>
      <p className="text-body text-muted mb-4">잠시 후 다시 시도해 주세요</p>
      <button
        onClick={onRetry}
        className="h-11 px-5 bg-ink text-white rounded-full text-body active:bg-ink/90 transition-colors flex items-center gap-2"
      >
        <Loader2 className="w-4 h-4" aria-hidden="true" />
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
      <div className="w-14 h-14 rounded-full bg-canvas flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-faint" />
      </div>
      <p className="text-body-strong text-ink mb-1">{title}</p>
      {subtitle && <p className="text-body text-muted">{subtitle}</p>}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  /** 화면 읽기 프로그램이 읽을 이름. 옆에 보이는 글자는 스위치와 묶여 있지 않아,
   *  이게 없으면 "스위치, 꺼짐"만 읽혀 무엇을 켜는지 알 수 없었다(5단계). */
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      /* 꺼짐 색: 예전 연회색은 맞는 토큰이 없어 0단계에서 남겨 뒀다.
         4단계에서 faint로 바꾼다. 흰 카드 위 대비가 1.5:1에서 2.6:1로 올라
         꺼진 스위치의 테두리가 더 잘 보인다(line은 너무 옅어 흰 손잡이가 묻힌다).
         켜짐은 brand(8장). 스위치는 높이 24px라 ::before로 위아래 10px씩
         넓혀 누르는 영역 44px. */
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 shrink-0 rounded-full transition-colors before:content-[''] before:absolute before:inset-x-0 before:-inset-y-2.5 ${
        checked ? "bg-brand" : "bg-faint"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-surface rounded-full shadow-sm transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

/* ArrivalBadge(도착 분 배지)는 0단계에서 "쓰이지 않지만 지우지 않고 색만 토큰으로
   바꾼다"로 두었다. 5단계 정리에서 사용처가 0건인 것을 다시 확인하고 지웠다.
   도착 표시는 히어로(HeroArrivalCard)와 목록 칸(HomeScreen FavoriteArrivalInfo),
   정류장 상세 카드가 각자 맡는다. */

const CHIP_CONTENT: Record<
  ReliabilityChipKind,
  { label: string; Icon: typeof Radio; text: string; bg: string }
> = {
  live: { label: "실시간", Icon: Radio, text: "text-live", bg: "bg-live-soft" },
  delay: { label: "지연 의심", Icon: AlertTriangle, text: "text-delay", bg: "bg-delay-soft" },
  pending: { label: "확인 중", Icon: Clock3, text: "text-pending", bg: "bg-canvas" },
};

/**
 * 신뢰도 칩 한 개 (DESIGN.md 4-2).
 *
 * 높이 20px(1.25rem), 좌우 8px, 아이콘 12px. 모두 rem이라 큰 글씨에서 함께
 * 커진다. 상태는 색만이 아니라 아이콘과 글자로도 구분한다(색약 대응).
 *
 * onHero: 파란 히어로 카드 위에서는 틴트 배경이 묻혀서, 흰 배경에 상태 색
 * 글자를 쓴다(DESIGN.md 7-3).
 */
export function ReliabilityChip({
  kind,
  onHero = false,
}: {
  kind: ReliabilityChipKind;
  onHero?: boolean;
}) {
  const { label, Icon, text, bg } = CHIP_CONTENT[kind];
  return (
    <span
      className={`inline-flex items-center gap-1 h-5 px-2 rounded-full text-micro whitespace-nowrap ${text} ${
        onHero ? "bg-surface" : bg
      }`}
    >
      <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * A1. 도착정보 신뢰도 태그.
 * 색상만이 아니라 아이콘/문구로도 구분해서(B3 접근성) 실시간 GPS 기반인지
 * 배차표 기반 추정인지, 그리고 지연이 의심되는지를 알려줍니다.
 */
export function ReliabilityTag({
  reliability,
  onHero = false,
}: {
  reliability: ReliabilityState;
  onHero?: boolean;
}) {
  const kind = reliabilityChipKind(reliability);
  if (!kind) return null;
  return <ReliabilityChip kind={kind} onHero={onHero} />;
}

/**
 * 화면 위쪽 뒤로 가기(알림 화면, 정류장 상세, 노선 상세).
 *
 * 홈 헤더의 원형 버튼(DESIGN.md 7-2)과 같은 모양이다 — 보이는 원 40px, 흰 면 +
 * 1px line, 아이콘 20px ink. 투명한 ::before로 사방 2px씩 넓혀 누르는 영역은
 * 44px. 예전에는 화면마다 테두리 없는 작은 화살표(누르는 영역을 따로 넓힘)를
 * 썼는데, 3단계 알림 화면에서 원형으로 정했고 4단계에서 세 화면을 맞췄다.
 */
export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="뒤로 가기"
      className="relative w-10 h-10 shrink-0 rounded-full bg-surface border border-line flex items-center justify-center text-ink active:bg-canvas before:content-[''] before:absolute before:-inset-0.5 select-none touch-manipulation transition-transform duration-100 active:scale-[0.98]"
    >
      <ArrowLeft className="w-5 h-5" aria-hidden="true" />
    </button>
  );
}
