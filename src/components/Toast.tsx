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
    // 하단 탭 바로 위에 띄운다(bottom-toast, index.css 주석 참고). 헤더 버튼과
    // 홈 히어로를 가리지 않는다. 아래에서 올라오므로 slide-up을 쓴다.
    // 좌우 여백은 하단 탭과 같은 12px(px-3)이라 두 카드의 양 끝이 한 줄로 맞는다.
    <div className="fixed bottom-toast left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 w-full max-w-md px-3">
      {toasts.map((toast) => {
        const Icon =
          toast.type === "success"
            ? CheckCircle2
            : toast.type === "error"
            ? AlertCircle
            : Info;
        const color =
          toast.type === "success"
            ? "text-emerald-500"
            : toast.type === "error"
            ? "text-red-500"
            : "text-blue-500";
        return (
          <div
            key={toast.id}
            className="flex items-center gap-3 bg-white rounded-2xl shadow-lg border border-slate-100 px-4 py-3 animate-slide-up"
          >
            <Icon className={`w-5 h-5 ${color} shrink-0`} />
            <span className="text-sm text-slate-700 flex-1">{toast.message}</span>
            <button
              onClick={() =>
                setToasts((prev) => prev.filter((t) => t.id !== toast.id))
              }
              className="text-slate-300 active:text-slate-500"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
