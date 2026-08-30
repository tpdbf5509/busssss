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
      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md shadow-2xl p-6 animate-slide-up">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
            <MapPin className="w-5 h-5 text-blue-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900 truncate">{favorite.name} 바로가기 추가</h2>
            <p className="text-xs text-slate-400 mt-0.5">앱을 열지 않고 도착정보를 바로 확인해요</p>
          </div>
        </div>

        <ol className="space-y-3 mb-6">
          <li className="flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
              1
            </span>
            <p className="text-sm text-slate-700 leading-relaxed">
              아래 버튼을 눌러 이 정류장 화면으로 이동해요
            </p>
          </li>
          <li className="flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
              2
            </span>
            <p className="text-sm text-slate-700 leading-relaxed flex items-center gap-1.5 flex-wrap">
              Safari 하단의 <Share className="w-3.5 h-3.5 text-blue-600" /> 공유 버튼을 눌러요
            </p>
          </li>
          <li className="flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
              3
            </span>
            <p className="text-sm text-slate-700 leading-relaxed flex items-center gap-1.5 flex-wrap">
              <PlusSquare className="w-3.5 h-3.5 text-blue-600" /> "홈 화면에 추가"를 선택하면 완료돼요
            </p>
          </li>
        </ol>

        <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
          즐겨찾기마다 이 과정을 한 번씩 반복하면, 정류장별로 따로 홈 화면 아이콘을 만들 수 있어요.
        </p>

        <button
          type="button"
          onClick={() => window.location.assign(shortcutUrl)}
          className="w-full rounded-2xl bg-blue-600 py-3.5 text-sm font-semibold text-white active:scale-[0.98]"
        >
          {favorite.name} 화면으로 이동
        </button>
        <button
          type="button"
          onClick={onClose}
          className="w-full mt-2 py-2.5 text-sm font-medium text-slate-400"
        >
          나중에 하기
        </button>
      </div>
    </div>
  );
}
