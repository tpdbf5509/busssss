import { AlertTriangle } from "lucide-react";
import { useApp } from "@/store/appContext";

/**
 * 저장된 즐겨찾기/알림을 불러오지 못했을 때 띄우는 안내.
 *
 * 토스트가 아니라 배너인 이유: 이 상황에서 화면에 보이는 목록은 예시
 * 데이터이고, 사용자가 그 사실을 모른 채 목록을 건드리면 원래 저장돼 있던
 * 내용이 예시 데이터로 덮어써진다. 3초 뒤 사라지는 토스트는 놓치면 그만이라
 * 사용자가 직접 확인을 누를 때까지 남아 있어야 한다.
 */
export function StorageErrorBanner() {
  const { state, dispatch } = useApp();
  const error = state.storageError;
  // dismissed는 배너만 숨긴다. 저장 잠금은 사용자가 실제로 목록을 편집할 때만
  // 풀린다(AppContext의 clearStorageError 참고).
  if (!error || error.dismissed) return null;

  const failed = [error.favorites && "즐겨찾기", error.alerts && "알림 설정"]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-3">
      <div className="max-w-md mx-auto flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900">
            저장된 {failed}을 불러오지 못했어요
          </p>
          <p className="text-xs text-amber-800 mt-1 leading-relaxed">
            지금 보이는 목록은 예시 데이터예요. 여기서 항목을 추가하거나 지우면 기존에
            저장된 내용이 이 목록으로 덮어써집니다. 원래 데이터를 지키려면 앱을 다시
            열어보시고, 계속 이 안내가 뜨면 저장된 값이 손상된 것일 수 있어요.
          </p>
          <button
            onClick={() => dispatch({ type: "DISMISS_STORAGE_ERROR" })}
            className="mt-2 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            확인했어요
          </button>
        </div>
      </div>
    </div>
  );
}
