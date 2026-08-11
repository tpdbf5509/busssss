import { useState } from "react";
import { MapPin, ChevronDown, Star, Search, RadioTower } from "lucide-react";
import { useApp } from "@/store/AppContext";
import { RegionModal } from "@/components/RegionModal";
import { showToast } from "@/components/Toast";
import type { TabId } from "@/components/BottomNav";

export function HomeScreen({
  onNavigate,
}: {
  onNavigate: (tab: TabId, routeId?: string) => void;
}) {
  const { state, dispatch } = useApp();
  const [regionOpen, setRegionOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <header className="bg-gradient-to-b from-blue-600 to-blue-500 text-white px-5 pt-12 pb-6">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold tracking-tight">BUS STOP</h1>
          <button
            onClick={() => setRegionOpen(true)}
            className="flex items-center gap-1 bg-white/15 backdrop-blur-sm rounded-full px-3 py-1.5 text-sm font-medium hover:bg-white/25 transition-colors"
          >
            <MapPin className="w-4 h-4" />
            <span>{state.region.sigungu}</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-blue-100 text-sm">전주시 버스 노선 정보</p>
      </header>

      {/* 실시간 도착정보 준비중 안내 */}
      <section className="px-4 -mt-3">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 px-4 py-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
            <RadioTower className="w-4.5 h-4.5 text-amber-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">실시간 도착정보는 준비중이에요</p>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              현재 연동된 API는 노선·정류장·배차시간 정보만 제공합니다. 실시간 위치와 도착예정시간은
              추가 연동 후 제공될 예정이에요.
            </p>
          </div>
        </div>
      </section>

      {/* 전체 노선 검색 (노선 둘러보기 대신) */}
      <section className="px-4 mt-4">
        <button
          onClick={() => onNavigate("bus")}
          className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3.5 flex items-center gap-3 hover:border-blue-300 hover:shadow transition-all active:scale-[0.99]"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <Search className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-left flex-1">
            <p className="text-sm font-semibold text-slate-800">전체 노선 검색</p>
            <p className="text-xs text-slate-400 mt-0.5">노선번호·기점·종점으로 찾아보세요</p>
          </div>
          <span className="text-slate-300 text-lg">›</span>
        </button>
      </section>

      {/* Favorites */}
      <section className="px-4 mt-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-700">즐겨찾기</h3>
          <button
            onClick={() => onNavigate("my")}
            className="text-xs text-blue-600 font-medium hover:underline"
          >
            전체보기
          </button>
        </div>
        {state.favorites.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center border border-slate-100">
            <Star className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">즐겨찾기를 추가해 보세요</p>
          </div>
        ) : (
          <div className="space-y-2">
            {state.favorites.map((fav) => (
              <button
                key={fav.id}
                onClick={() =>
                  onNavigate(fav.type === "route" ? "bus" : "home", fav.refId)
                }
                className="w-full bg-white rounded-2xl border border-slate-100 px-4 py-3.5 flex items-center gap-3 text-left hover:border-blue-200 hover:shadow-sm transition-all"
              >
                <div className="min-w-[64px] h-11 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 px-2">
                  <span className="font-bold text-blue-700 text-sm leading-tight text-center truncate">
                    {fav.type === "route" ? fav.name.replace(/번$/, "") + "번" : fav.label}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {fav.type === "route" ? fav.label || fav.name : fav.name}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {fav.type === "station" ? "정류장" : "노선"}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-medium text-slate-300">도착정보</p>
                  <p className="text-sm font-semibold text-slate-400">준비중</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <RegionModal
        open={regionOpen}
        onClose={() => setRegionOpen(false)}
        onSelect={(sido, sigungu) => {
          dispatch({ type: "SET_REGION", sido, sigungu });
          setRegionOpen(false);
          showToast(`${sido} ${sigungu}로 설정되었어요`);
        }}
      />
    </div>
  );
}