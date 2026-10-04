import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { subscribeToast, type ToastItem } from "@/lib/toastStore";

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    return subscribeToast((toast) => {
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 3000);
    });
  }, []);

  return (
    // 홈의 얇은 헤더 아래에 띄운다(top-safe-16). 헤더 버튼을 가리지 않게 한다.
    // 3단계에서 하단 탭 위로 옮겨 봤지만, 사용자 결정으로 다시 위쪽에 둔다
    // (DESIGN.md 12장 3단계).
    <div className="fixed top-safe-16 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 w-full max-w-sm px-4">
      {toasts.map((toast) => {
        const Icon =
          toast.type === "success"
            ? CheckCircle2
            : toast.type === "error"
            ? AlertCircle
            : Info;
        /* 아이콘 색은 4-2 토큰: 완료는 실시간 초록(live), 실패는 danger(아이콘이라
           빨강 허용), 안내는 brand. 예전 -500 원색은 흰 바탕 대비가 모자랐다.
           종류는 아이콘 모양(체크·느낌표·i)으로도 구분된다. */
        const color =
          toast.type === "success"
            ? "text-live"
            : toast.type === "error"
            ? "text-danger"
            : "text-brand";
        return (
          <div
            key={toast.id}
            /* 흰 카드 + 1px line, 20px 모서리, float 그림자(6장: 하단 내비, 토스트). */
            className="flex items-center gap-3 bg-surface rounded-card shadow-float border border-line px-4 py-3 animate-slide-down"
          >
            <Icon className={`w-5 h-5 ${color} shrink-0`} aria-hidden="true" />
            <span className="text-body text-ink flex-1">{toast.message}</span>
            <button
              onClick={() =>
                setToasts((prev) => prev.filter((t) => t.id !== toast.id))
              }
              aria-label="닫기"
              /* 아이콘 16px, ::before로 사방 14px 넓혀 누르는 영역 44px. */
              className="relative text-faint active:text-muted before:content-[''] before:absolute before:-inset-3.5"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
