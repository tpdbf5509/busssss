import { Share, PlusSquare, MapPin } from "lucide-react";
import type { Favorite } from "@/types";

/**
 * B4. iOS는 PWA에 네이티브 홈 화면/잠금화면 위젯을 허용하지 않습니다(WidgetKit은
 * 네이티브 앱 확장 전용). 대신 즐겨찾기 하나하나를 개별 딥링크(?favorite=<id>)로
 * "홈 화면에 추가"하면, 앱을 열지 않고 그 정류장 화면으로 한 번에 진입할 수 있습니다.
 * 다만 iOS는 이 과정을 즐겨찾기마다 사용자가 직접 반복해야 해서, 그 안내 흐름입니다.
 */
export function AddShortcutSheet({
  favorite,
  onClose,
}: {
  favorite: Favorite;
  onClose: () => void;
}) {
  const shortcutUrl = (() => {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("favorite", favorite.id);
    return url.toString();
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      {/* 바텀시트: 모서리 28px(hero), sheet 그림자(DESIGN.md 6장). 아이콘은
          6장 아이콘 타일(40px, 12px, brand-soft + brand 20px). 4단계에서
          원색(회색·파랑)을 토큰으로 바꿨다. */}
      <div className="relative bg-surface rounded-t-hero sm:rounded-hero w-full max-w-md shadow-sheet p-6 animate-slide-up">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-tile bg-brand-soft flex items-center justify-center shrink-0">
            <MapPin className="w-5 h-5 text-brand" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-title text-ink truncate">{favorite.name} 바로가기 추가</h2>
            <p className="text-caption text-muted mt-0.5">앱을 열지 않고 도착정보를 바로 확인해요</p>
          </div>
        </div>

        <ol className="space-y-3 mb-6">
          <li className="flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-brand-soft text-brand text-micro tabular-nums flex items-center justify-center shrink-0 mt-0.5">
              1
            </span>
            <p className="text-body text-ink">
              아래 버튼을 눌러 이 정류장 화면으로 이동해요
            </p>
          </li>
          <li className="flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-brand-soft text-brand text-micro tabular-nums flex items-center justify-center shrink-0 mt-0.5">
              2
            </span>
            <p className="text-body text-ink flex items-center gap-1.5 flex-wrap">
              Safari 하단의 <Share className="w-3.5 h-3.5 text-brand" aria-hidden="true" /> 공유 버튼을 눌러요
            </p>
          </li>
          <li className="flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-brand-soft text-brand text-micro tabular-nums flex items-center justify-center shrink-0 mt-0.5">
              3
            </span>
            <p className="text-body text-ink flex items-center gap-1.5 flex-wrap">
              <PlusSquare className="w-3.5 h-3.5 text-brand" aria-hidden="true" /> "홈 화면에 추가"를 선택하면 완료돼요
            </p>
          </li>
        </ol>

        <p className="text-caption text-muted mb-4">
          즐겨찾기마다 이 과정을 한 번씩 반복하면, 정류장별로 따로 홈 화면 아이콘을 만들 수 있어요.
        </p>

        <button
          type="button"
          onClick={() => window.location.assign(shortcutUrl)}
          className="w-full rounded-full bg-brand py-3.5 text-body font-semibold text-white active:scale-[0.98] transition-transform duration-100"
        >
          {favorite.name} 화면으로 이동
        </button>
        <button
          type="button"
          onClick={onClose}
          /* 글자 버튼. 예전 연회색 글자(흰 면 위 2.6:1)는 읽기 어려워 ink로
             올렸다. 높이 44px 이상(py-3 + 21px). */
          className="w-full mt-2 py-3 text-body text-ink active:bg-canvas rounded-full"
        >
          나중에 하기
        </button>
      </div>
    </div>
  );
}
