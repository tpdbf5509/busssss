import { useState } from "react";
import { MapPin, ChevronDown, Star, Clock, RadioTower } from "lucide-react";
import { useApp } from "@/store/AppContext";
import { useAsync } from "@/hooks/useAsync";
import { fetchAllRoutes } from "@/services/routeService";
import { RegionModal } from "@/components/RegionModal";
import { LoadingSkeleton, ErrorState, EmptyState } from "@/components/ui";
import { showToast } from "@/components/Toast";
import type { TabId } from "@/components/BottomNav";
const MAIN_LINES: { number: string; start: string; end: string }[] = [
  { number: "2", start: "평화동종점", end: "평화동종점" },
  { number: "3-1", start: "전주대학교", end: "전주대학교" },
  { number: "3-2", start: "전주대학교", end: "전주대학교" },
  { number: "5-5", start: "전북대종점", end: "전북대종점" },
  { number: "6", start: "전주대학교", end: "전주대학교" },
  { number: "6-1", start: "전주대학교", end: "평화동종점" },
  { number: "8-1", start: "전북대종점", end: "전북대종점" },
  { number: "8-2", start: "전북대종점", end: "전북대종점" },
  { number: "9", start: "송천동종점", end: "송천동종점" },
  { number: "10", start: "평화코오롱아파트", end: "추동" },
  { number: "12", start: "풍남문", end: "내원당마을" },
  { number: "13", start: "풍남문", end: "은석마을" },
  { number: "14", start: "낙수정", end: "낙수정" },
  { number: "15", start: "낙수정", end: "흑석골종점" },
  { number: "16", start: "풍남문", end: "삼경사" },
  { number: "17", start: "풍남문", end: "흑석골종점" },
  { number: "18", start: "월드컵경기장", end: "백구" },
  { number: "19", start: "월드컵경기장", end: "춘강" },
  { number: "20", start: "원마다리", end: "이서회차지" },
  { number: "21", start: "모산종점", end: "이서회차지" },
  { number: "23", start: "원동마을", end: "이서회차지" },
  { number: "24", start: "구암", end: "이서회차지" },
  { number: "25", start: "대문안종점", end: "이서회차지" },
  { number: "26", start: "콩쥐팥쥐마을", end: "이서회차지" },
  { number: "27", start: "삼례역", end: "이서회차지" },
  { number: "31", start: "삼례역", end: "둔산코아루2차아파트" },
  { number: "32", start: "삼례터미널", end: "비봉종점" },
  { number: "33", start: "삼례역", end: "지암마을" },
  { number: "34", start: "삼례역", end: "지암마을" },
  { number: "34-1", start: "삼례역", end: "지암마을" },
  { number: "35", start: "삼례역", end: "고산터미널" },
  { number: "36", start: "삼례역", end: "고산터미널" },
  { number: "40", start: "월드컵경기장", end: "고잔" },
  { number: "41", start: "하나로마트종점", end: "삼화동" },
  { number: "43", start: "월드컵경기장", end: "홍개" },
  { number: "45", start: "월드컵경기장", end: "덕동" },
  { number: "46", start: "하나로마트종점", end: "용신마을" },
  { number: "47", start: "하나로마트종점", end: "용덕마을" },
  { number: "48", start: "월드컵경기장", end: "신기종점" },
  { number: "49", start: "월드컵경기장", end: "월드컵경기장" },
  { number: "50", start: "소양회차지", end: "봉동주공아파트" },
  { number: "51", start: "고산터미널", end: "둔산코아루2차아파트" },
  { number: "52", start: "완주군청", end: "비봉종점" },
  { number: "53", start: "완주군청", end: "제촌" },
  { number: "54", start: "완주군청", end: "원구암마을" },
  { number: "55", start: "모아엘가아파트", end: "완주군청" },
  { number: "56", start: "설경마을종점", end: "봉동회차지" },
  { number: "57", start: "양야리경로당", end: "봉동회차지" },
  { number: "58", start: "봉동회차지", end: "터지내마을" },
  { number: "59", start: "어린이창의체험관", end: "만경강변 진조리.은평" },
  { number: "60", start: "모아엘가아파트", end: "둔산코아루2차아파트" },
  { number: "61", start: "비전대학교", end: "전주대학교" },
  { number: "62", start: "흑석골종점", end: "삼산리" },
  { number: "62-1", start: "흑석골종점", end: "원상림" },
  { number: "63", start: "흑석골종점", end: "호동마을" },
  { number: "63-1", start: "흑석골종점", end: "신덕마을" },
  { number: "70", start: "민목리", end: "상관농협로컬푸드" },
  { number: "74", start: "평화동종점", end: "전북대종점" },
  { number: "75", start: "평화동종점", end: "전북대종점" },
  { number: "76", start: "상관주민센터", end: "어두마을" },
  { number: "77", start: "대흥마을", end: "상관농협로컬푸드" },
  { number: "79", start: "전주동물원", end: "금산사" },
  { number: "80", start: "금상동", end: "모래내시장" },
  { number: "81", start: "모래내시장", end: "하이리" },
  { number: "82", start: "어린이창의체험관", end: "재전" },
  { number: "82-1", start: "상망표", end: "앞멀" },
  { number: "82-2", start: "앞멀", end: "상망표" },
  { number: "83", start: "소양행정복지센터", end: "동상거인경로당" },
  { number: "84", start: "인덕마을", end: "일임리" },
  { number: "85", start: "용문사.반곡마을", end: "응암마을" },
  { number: "86", start: "월상리", end: "분토종점" },
  { number: "87", start: "송천동종점", end: "원당리" },
  { number: "87-1", start: "다리목", end: "약암마을" },
  { number: "87-2", start: "약암마을", end: "다리목" },
  { number: "89", start: "송천동종점", end: "중인동" },
  { number: "90", start: "원안덕마을", end: "전북도립미술관" },
  { number: "91", start: "막은댐", end: "전북도립미술관" },
  { number: "92", start: "막은댐", end: "전북도립미술관" },
  { number: "94", start: "어린이창의체험관", end: "진기마을종점" },
  { number: "97", start: "전북대종점", end: "만경강변 진조리.은평" },
  { number: "99-1", start: "진조리", end: "진조리" },
  { number: "99-2", start: "진조리", end: "진조리" },
  { number: "101", start: "전북대종점", end: "평화동종점" },
  { number: "102", start: "송천동종점", end: "전주시양묘장" },
  { number: "103-1", start: "송천동종점", end: "전주시양묘장" },
  { number: "104", start: "평화동종점", end: "송천동종점" },
  { number: "108", start: "전주대학교", end: "송천동종점" },
  { number: "110", start: "비전대학교", end: "대성동종점" },
  { number: "119", start: "전주대학교", end: "평화동종점" },
  { number: "165", start: "전주동물원", end: "이서회차지" },
  { number: "200", start: "기린봉", end: "하나로마트종점" },
  { number: "220", start: "비전대학교", end: "비전대학교" },
  { number: "309", start: "평화동종점", end: "우석대종점" },
  { number: "337", start: "전주시양묘장", end: "우석대종점" },
  { number: "350", start: "평화동종점", end: "삼례터미널" },
  { number: "354", start: "비전대학교", end: "우석대종점" },
  { number: "355", start: "전주대학교", end: "삼례터미널" },
  { number: "383", start: "비전대학교", end: "우석대종점" },
  { number: "385", start: "전주대학교", end: "우석대종점" },
  { number: "386", start: "전주대학교", end: "익산더반포레아파트" },
  { number: "401", start: "월드컵경기장", end: "상하보" },
  { number: "402", start: "월드컵경기장", end: "상하보" },
  { number: "403", start: "월드컵경기장", end: "화원마을" },
  { number: "420", start: "월드컵경기장", end: "중인동" },
  { number: "500", start: "평화동종점", end: "봉동회차지" },
  { number: "501", start: "평화동종점", end: "봉동회차지" },
  { number: "530", start: "전주대학교", end: "고산터미널" },
  { number: "550", start: "평화동종점", end: "둔산코아루2차아파트" },
  { number: "554", start: "삼천동종점", end: "둔산코아루2차아파트" },
  { number: "559", start: "삼천동종점", end: "둔산코아루2차아파트" },
  { number: "644", start: "감수리", end: "원평종점" },
  { number: "684", start: "감수리", end: "금구" },
  { number: "685", start: "감수리", end: "오봉리" },
  { number: "752", start: "송천동종점", end: "관촌터미널" },
  { number: "810", start: "평화동종점", end: "소양회차지" },
  { number: "820", start: "이서회차지", end: "소양" },
  { number: "970", start: "에코시티종점차고지(승하차X)", end: "전북도립미술관" },
  { number: "999", start: "전주동물원", end: "국립전주박물관종점" },
  { number: "1001", start: "평화동종점", end: "우석대종점" },
  { number: "1002", start: "평화동종점", end: "우석대종점" },
  { number: "1994", start: "평화동종점", end: "시외고속간이터미널" },
  { number: "2001", start: "평화동종점", end: "송천동종점" },
  { number: "2002", start: "평화동종점", end: "송천동종점" },
  { number: "3001", start: "송천동종점", end: "평화동종점" },
  { number: "3002", start: "송천동종점", end: "삼천동종점" },
  { number: "4000", start: "전주대캠퍼스", end: "전주대캠퍼스" },
  { number: "5001", start: "전주대캠퍼스", end: "전주대캠퍼스" },
  { number: "5002", start: "전주대캠퍼스", end: "전주대캠퍼스" },
  { number: "6001", start: "비전대학교", end: "비전대학교" },
  { number: "6002", start: "비전대학교", end: "비전대학교" },
  { number: "8490", start: "어린이창의체험관", end: "신유강" },
];

function normalizeName(s: string) {
  return (s ?? "").replace(/\s+/g, "").trim();
}

function getRouteTypeLabel(number: string, start: string, end: string) {
  const ns = normalizeName(start);
  const ne = normalizeName(end);
  const matched = MAIN_LINES.some(
    (m) =>
      m.number === number &&
      normalizeName(m.start) === ns &&
      normalizeName(m.end) === ne
  );
  return matched ? "본선" : "분선";
}

export function HomeScreen({
  onNavigate,
}: {
  onNavigate: (tab: TabId, routeId?: string) => void;
}) {  const { state, dispatch } = useApp();
  const [regionOpen, setRegionOpen] = useState(false);

  const { data: routes, status, retry } = useAsync(() => fetchAllRoutes(), []);
  const preview = routes?.slice(0, 6);

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

      {/* 노선 둘러보기 */}
      <section className="px-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-700">노선 둘러보기</h3>
          <button
            onClick={() => onNavigate("bus")}
            className="text-xs text-blue-600 font-medium hover:underline"
          >
            전체 노선 검색
          </button>
        </div>

        {status === "loading" && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <LoadingSkeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        )}
        {status === "error" && <ErrorState onRetry={retry} />}
        {status === "success" && preview && preview.length === 0 && (
          <EmptyState title="불러올 수 있는 노선이 없어요" />
        )}
        {status === "success" && preview && preview.length > 0 && (
          <div className="space-y-2">
            {preview.map((route) => (
              <button
                key={`${route.id}-${route.number}`}
                onClick={() => onNavigate("bus")}
                className="w-full bg-white rounded-2xl p-4 border border-slate-100 hover:border-blue-200 hover:shadow-sm transition-all text-left"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {/* 본선=파랑, 분선=초록 */}
                    {(() => {
                      const label = getRouteTypeLabel(route.number, route.start, route.end);
                      const isMain = label === "본선";
                      return (
                        <div
                          className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                            isMain ? "bg-blue-50" : "bg-emerald-50"
                          }`}
                        >
                          <span
                            className={`font-bold text-xs leading-tight text-center ${
                              isMain ? "text-blue-700" : "text-emerald-700"
                            }`}
                          >
                            {label}
                          </span>
                        </div>
                      );
                    })()}
                    <div>
                      {/* 검은 글씨: 번호만 */}
                      <span className="font-semibold text-slate-900 text-base">{route.number}</span>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                        <span className="font-medium text-slate-600">
                          {route.start || "기점 정보 없음"}
                        </span>
                        <span className="text-slate-300">→</span>
                        <span className="font-medium text-slate-600">
                          {route.end || "종점 정보 없음"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right text-[11px] text-slate-400 flex items-center gap-0.5">
                    <Clock className="w-3 h-3" />
                    첫차 {route.firstBus}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
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
          <div className="grid grid-cols-2 gap-2">
            {state.favorites.map((fav) => (
              <button
                key={fav.id}
                onClick={() =>
                  onNavigate(fav.type === "route" ? "bus" : "home", fav.refId)
                }
                className="bg-white rounded-2xl p-3.5 border border-slate-100 text-left hover:border-blue-200 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  </div>
                  <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                    {fav.label}
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-800 truncate">{fav.name}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {fav.type === "station" ? "정류장" : "노선"}
                </p>
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