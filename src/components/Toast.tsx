import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

let toastListeners: ((toast: ToastItem) => void)[] = [];

export function showToast(message: string, type: ToastType = "success") {
  const toast: ToastItem = { id: Date.now().toString(), message, type };
  toastListeners.forEach((l) => l(toast));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const listener = (toast: ToastItem) => {
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 3000);
    };
    toastListeners.push(listener);
    return () => {
      toastListeners = toastListeners.filter((l) => l !== listener);
    };
  }, []);

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 w-full max-w-sm px-4">
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
            className="flex items-center gap-3 bg-white rounded-2xl shadow-lg border border-slate-100 px-4 py-3 animate-slide-down"
          >
            <Icon className={`w-5 h-5 ${color} shrink-0`} />
            <span className="text-sm text-slate-700 flex-1">{toast.message}</span>
            <button
              onClick={() =>
                setToasts((prev) => prev.filter((t) => t.id !== toast.id))
              }
              className="text-slate-300 hover:text-slate-500"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
