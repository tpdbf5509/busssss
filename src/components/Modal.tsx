import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * 공용 모달 래퍼. role="dialog"/aria-modal, 열릴 때 첫 포커스, Tab 트랩,
 * Esc 닫기, 닫힐 때 이전 포커스 복원을 모든 오버레이(바텀시트/드로어)에
 * 동일하게 적용하기 위한 컴포넌트입니다.
 */
export function Modal({
  onClose,
  labelledBy,
  children,
  className = "",
  align = "bottom",
}: {
  onClose: () => void;
  labelledBy: string;
  children: React.ReactNode;
  className?: string;
  align?: "bottom" | "center" | "right";
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  const alignClass =
    align === "center"
      ? "items-center justify-center"
      : align === "right"
      ? "justify-end"
      : "items-end sm:items-center justify-center";

  return (
    <div className={`fixed inset-0 z-50 flex ${alignClass}`}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`relative overscroll-contain ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
