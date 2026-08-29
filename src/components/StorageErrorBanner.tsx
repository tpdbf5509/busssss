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
  if (!error) return null;

  const failed = [error.favorites && "즐겨찾기", error.alerts && "알림 설정"]
    .filter(Boolean)
    .join(" · ");

  // 중립 표면 + 얇은 경계선으로만 구성한다. 경고색 배경을 깔면 화면 전체가
  // 색 블록으로 읽히고, 정작 강조해야 할 한 곳이 묻힌다. 위험 신호는 아이콘과
  // 텍스트 위계로 전달한다.
  return (
    <div className="shrink-0 bg-white border-b border-slate-200 px-5 py-4">
      <div className="max-w-md mx-auto flex items-start gap-3">
        <AlertTriangle className="w-[18px] h-[18px] text-slate-900 shrink-0 mt-px" />
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-slate-900 tracking-tight leading-snug">
            저장된 {failed}을 불러오지 못했어요
          </p>
          <p className="text-[13px] text-slate-500 mt-1.5 leading-relaxed">
            지금 보이는 목록은 예시 데이터예요. 여기서 항목을 추가하거나 지우면 기존에
            저장된 내용이 이 목록으로 덮어써집니다. 원래 데이터를 지키려면 앱을 다시
            열어보시고, 계속 이 안내가 뜨면 저장된 값이 손상된 것일 수 있어요.
          </p>
          <button
            onClick={() => dispatch({ type: "DISMISS_STORAGE_ERROR" })}
            className="mt-2.5 text-[13px] font-semibold text-slate-900 underline underline-offset-4 decoration-slate-300 hover:decoration-slate-900 transition-colors"
          >
            확인했어요
          </button>
        </div>
      </div>
    </div>
  );
}
