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
    /* 4단계: 원색 주황 계열을 4-2 "지연 의심" 토큰으로 바꿨다(연한 바탕
       delay-soft, 아이콘 delay). 글자는 바탕 위 대비를 위해 ink로 쓴다.
       아이콘 타일은 6장 아이콘 타일(40px, 12px)에 흰 면. 색약 모드에서는
       delay-soft가 4-2 대체 색(연한 노랑)으로 바뀐다. */
    <div className="shrink-0 bg-delay-soft border-b border-line px-5 py-3">
      <div className="max-w-md mx-auto flex items-start gap-3">
        <div className="w-10 h-10 rounded-tile bg-surface flex items-center justify-center shrink-0">
          <AlertTriangle className="w-5 h-5 text-delay" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-body-strong text-ink">
            저장된 {failed}을 불러오지 못했어요
          </p>
          <p className="text-caption text-ink mt-1">
            지금 보이는 목록은 예시 데이터예요. 여기서 항목을 추가하거나 지우면 기존에
            저장된 내용이 이 목록으로 덮어써집니다. 원래 데이터를 지키려면 앱을 다시
            열어보시고, 계속 이 안내가 뜨면 저장된 값이 손상된 것일 수 있어요.
          </p>
          <button
            onClick={() => dispatch({ type: "DISMISS_STORAGE_ERROR" })}
            /* 높이 32px 알약 + 위아래 6px로 누르는 영역 44px. */
            className="relative mt-2 h-8 px-3 rounded-full bg-surface border border-line text-caption font-semibold text-ink active:bg-canvas transition-colors before:content-[''] before:absolute before:inset-x-0 before:-inset-y-1.5"
          >
            확인했어요
          </button>
        </div>
      </div>
    </div>
  );
}
