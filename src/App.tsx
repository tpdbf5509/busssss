import { useEffect, useRef, useState } from "react";
import { AppProvider } from "@/store/AppContext";
import { useApp } from "@/store/appContext";
import { StorageErrorBanner } from "@/components/StorageErrorBanner";
import { BottomNav, type TabId } from "@/components/BottomNav";
import { ToastContainer } from "@/components/Toast";
import { HomeScreen } from "@/screens/HomeScreen";
import { BusScreen } from "@/screens/BusScreen";
import { RouteScreen } from "@/screens/RouteScreen";
import { AlertScreen } from "@/screens/AlertScreen";
import { MyScreen } from "@/screens/MyScreen";
import { useDropoffAlertMonitor } from "@/hooks/useDropoffAlertMonitor";
import { stopDropoffAlarm } from "@/services/alertMonitorService";
import { Info, X } from "lucide-react";

type DropoffAlarm = { title: string; body: string };

function AppContent() {
  const { state } = useApp();
  const [tab, setTab] = useState<TabId>("home");
  const [pendingRouteId, setPendingRouteId] = useState<string | null>(null);
  const [pendingStation, setPendingStation] = useState<{
    id: string;
    name: string;
    arsId?: string;
  } | null>(null);
  const [homeRefreshKey, setHomeRefreshKey] = useState(0);
  const [dropoffAlarm, setDropoffAlarm] = useState<DropoffAlarm | null>(null);
  const [quickViewBanner, setQuickViewBanner] = useState<string | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const deepLinkHandledRef = useRef(false);

  useDropoffAlertMonitor();

  useEffect(() => {
       mainRef.current?.scrollTo(0, 0);
     }, [tab]);

  // B4. 즐겨찾기 바로가기 딥링크(?favorite=<id>) — 홈 화면에 개별 추가된
  // 아이콘으로 들어오면, 탭 이동 없이 바로 그 정류장/노선 화면으로 진입합니다.
  useEffect(() => {
    if (deepLinkHandledRef.current) return;
    const favoriteId = new URLSearchParams(window.location.search).get("favorite");
    if (!favoriteId) return;

    const fav = state.favorites.find((f) => f.id === favoriteId);
    if (!fav) return;

    deepLinkHandledRef.current = true;

    if (fav.type === "station") {
      setPendingStation({
        id: fav.refId,
        name: fav.name,
        arsId: fav.label !== "정류장" ? fav.label : undefined,
      });
    } else if (fav.type === "stop_route") {
      // appRouteId가 없으면(옵셔널 필드) 노선 상세로는 못 가지만, 정류장
      // 자체는 tagoNodeId로 알 수 있으니 그 정류장 화면으로라도 보낸다.
      // 아무 데도 안 옮기고 배너만 뜨는 것보다 낫다.
      if (fav.appRouteId) {
        setPendingRouteId(fav.appRouteId);
      } else if (fav.tagoNodeId && fav.stopName) {
        setPendingStation({ id: fav.tagoNodeId, name: fav.stopName });
      }
    } else {
      setPendingRouteId(fav.refId);
    }
    setTab("bus");
    document.title = `${fav.name} - BUS STOP`;
    setQuickViewBanner(fav.name);

    // 여기서 URL의 ?favorite= 를 지우면 안 된다. 이 딥링크로 들어온 사용자가
    // 지금부터 하려는 일이 바로 "Safari 공유 → 홈 화면에 추가"인데(아래 안내
    // 배너와 AddShortcutSheet의 안내가 그 순서다), 주소를 미리 일반 URL로
    // 되돌리면 홈 화면에 저장되는 건 그 즐겨찾기가 아니라 앱 첫 화면이 된다.
    // 재진입 방지는 deepLinkHandledRef가 이미 담당하므로 URL을 남겨도 안전하고,
    // 정리는 사용자가 안내 배너를 닫을 때 한다(clearDeepLinkParam).
  }, [state.favorites]);

  // 안내 배너를 닫으면 그때 주소를 정리한다. 히스토리에는 남기지 않는다.
  const clearDeepLinkParam = () => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("favorite")) return;
    url.searchParams.delete("favorite");
    window.history.replaceState(null, "", url.toString());
  };

  useEffect(() => {
    const onAlarm = (event: Event) => {
      const detail = (event as CustomEvent<DropoffAlarm>).detail;
      setDropoffAlarm(detail ?? { title: "하차 알람", body: "하차할 정류장이 가까워졌습니다." });
    };
    const onStop = () => setDropoffAlarm(null);

    window.addEventListener("busssss:dropoff-alarm", onAlarm);
    window.addEventListener("busssss:dropoff-alarm-stop", onStop);
    return () => {
      window.removeEventListener("busssss:dropoff-alarm", onAlarm);
      window.removeEventListener("busssss:dropoff-alarm-stop", onStop);
    };
  }, []);

  const handleTabChange = (nextTab: TabId) => {
    // 다른 탭에서 홈으로 돌아올 때 HomeScreen을 다시 마운트해
    // 도착 정보와 홈 화면 데이터를 새로 불러오도록 합니다.
    if (nextTab === "home" && tab !== "home") {
      setHomeRefreshKey((key) => key + 1);
    }
    setTab(nextTab);
  };

  const handleNavigate = (
    nextTab: TabId,
    routeId?: string,
    station?: { id: string; name: string; arsId?: string }
  ) => {
    if (routeId) {
      setPendingRouteId(routeId);
      setPendingStation(null);
    }
    if (station) {
      setPendingStation(station);
      setPendingRouteId(null);
    }
    handleTabChange(nextTab);
  };

  // StorageErrorBanner 자신의 표시 조건(store/appContext.ts 참고)과 반드시
  // 맞춰야 한다 — 여기가 어긋나면 배너는 안 뜨는데 안전영역 빈 공간만
  // 남거나, 반대로 배너는 뜨는데 공간이 없어 상태바에 가려지는 문제가 생긴다.
  // quickViewBanner는 아래에서 별도로 fixed 오버레이로 띄우므로 여기 포함하지
  // 않는다 — 문서 흐름에 넣으면(이전 버전) 그만큼 홈 화면 헤더 등 실제
  // 콘텐츠를 밀어내리는데, 토스트처럼 콘텐츠 위에 떠야지 밀어내면 안 된다.
  const showStorageErrorBanner = !!state.storageError && !state.storageError.dismissed;

  return (
    <div className="max-w-md mx-auto bg-slate-50 fixed inset-0 overflow-hidden flex flex-col">
      {dropoffAlarm && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-6">
          {/* animate-pulse는 로딩 스켈레톤용 무한 opacity 깜빡임이다. 사용자가
              급하게 읽고 눌러야 하는 실제 알람 내용에 걸려 있으면 계속 흐려졌다
              밝아지길 반복해 방해가 된다 — 알람 카드에는 붙이지 않는다. */}
          <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl p-7 text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-red-100 flex items-center justify-center text-3xl">
              🔔
            </div>
            <div className="text-2xl font-bold text-slate-900">{dropoffAlarm.title}</div>
            <div className="mt-3 whitespace-pre-line text-base leading-6 text-slate-600">
              {dropoffAlarm.body}
            </div>
            <button
              type="button"
              onClick={() => {
                stopDropoffAlarm();
                setDropoffAlarm(null);
              }}
              className="mt-7 w-full rounded-2xl bg-red-500 px-5 py-4 text-lg font-bold text-white active:scale-[0.98]"
            >
              알람 끄기
            </button>
          </div>
        </div>
      )}

      {/* StorageErrorBanner는 문서 흐름 안에 그대로 둔다 — 저장 손상 경고라
          항상 자리를 차지해야 사용자가 놓치지 않는다. */}
      {showStorageErrorBanner && (
        <div className="shrink-0 pt-safe-0">
          <StorageErrorBanner />
        </div>
      )}

      {/* quickViewBanner는 토스트와 동일하게 fixed 오버레이로 띄운다 —
          문서 흐름에 넣으면 그 높이만큼 아래 콘텐츠(홈 화면 헤더 등)를
          밀어내리는데, 이 배너는 잠깐 안내만 하고 넘어가는 용도라 콘텐츠
          위에 떠야지 레이아웃을 밀어내면 안 된다. */}
      {quickViewBanner && (
        <div className="fixed top-safe-4 left-4 right-4 z-30">
          <div className="flex items-center gap-3 bg-white rounded-2xl shadow-lg border border-slate-100 px-4 py-3">
            <Info className="w-5 h-5 text-blue-500 shrink-0" />
            <span className="flex-1 text-sm text-slate-700">
              지금 화면을 <strong className="font-semibold">Safari 공유 → 홈 화면에 추가</strong>로 저장하면,
              다음부터 앱을 열지 않고 "{quickViewBanner}" 도착정보를 바로 볼 수 있어요.
            </span>
            <button
              type="button"
              onClick={() => {
                setQuickViewBanner(null);
                clearDeepLinkParam();
              }}
              className="text-slate-300 active:text-slate-500 shrink-0"
              aria-label="닫기"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <main ref={mainRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-none">
        {tab === "home" && <HomeScreen key={homeRefreshKey} onNavigate={handleNavigate} />}
        {tab === "bus" && (
          <BusScreen
            initialRouteId={pendingRouteId ?? undefined}
            onConsumeInitialRoute={() => setPendingRouteId(null)}
            initialStation={pendingStation ?? undefined}
            onConsumeInitialStation={() => setPendingStation(null)}
          />
        )}
       {tab === "route" && <RouteScreen />}
        {tab === "alert" && <AlertScreen />}
        {tab === "my" && <MyScreen />}
      </main>
      <BottomNav active={tab} onChange={handleTabChange} />
    </div>
  );
}

/**
 * 로그인 없이 바로 앱을 연다.
 *
 * 예전에는 여기서 세션을 확인해 로그인 화면으로 막았는데, 그 관문이 실제로
 * 지키는 게 없었다.
 * - 즐겨찾기·알림·설정은 전부 localStorage에만 있다. 계정에 묶여 서버로
 *   올라가는 사용자 데이터가 하나도 없어서, 다른 기기에서 로그인해도
 *   얻는 게 없었다.
 * - 버스 데이터를 가져오는 모든 호출(tago-proxy, jeonju-proxy, DB 조회)은
 *   anon key로 나간다. 사용자 세션 토큰은 어디에도 쓰이지 않는다.
 * - 그 anon key는 VITE_ 접두사라 빌드된 번들에 그대로 들어간다. 즉 로그인이
 *   API 남용을 막아주지도 못한다.
 *
 * 반면 비용은 컸다. 버스 시간 하나 보려고 회원가입을 해야 했고, 앱을 열
 * 때마다 세션 확인을 기다렸으며, 네트워크가 나쁘면 5초 뒤 로그인 화면으로
 * 튕겼다 — 정류장에서 도착정보가 급한 바로 그 순간에.
 *
 * 계정 자체를 없애지는 않았다. AuthScreen과 supabase.auth 코드는 그대로
 * 남아 있어서, 나중에 즐겨찾기 기기 간 동기화처럼 계정이 실제로 필요한
 * 기능이 생기면 이 관문만 다시 세우면 된다. 이미 로그인해 둔 사용자는
 * 마이 화면에서 로그아웃할 수 있다(MyScreen 참고).
 */
function App() {
  return (
    <AppProvider>
      <AppContent />
      <ToastContainer />
    </AppProvider>
  );
}

export default App;
