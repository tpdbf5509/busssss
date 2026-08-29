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

export function subscribeToast(listener: (toast: ToastItem) => void) {
  toastListeners.push(listener);
  return () => {
    toastListeners = toastListeners.filter((l) => l !== listener);
  };
}
