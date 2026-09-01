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
import { AuthScreen } from "@/screens/AuthScreen";
import { useDropoffAlertMonitor } from "@/hooks/useDropoffAlertMonitor";
import { stopDropoffAlarm } from "@/services/alertMonitorService";
import { supabase } from "@/lib/supabaseClient";
import { X } from "lucide-react";

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

      {quickViewBanner && (
        <div className="shrink-0 z-20 bg-blue-600 text-white px-4 py-2.5 flex items-center gap-2 text-xs">
          <span className="flex-1">
            지금 화면을 <strong className="font-semibold">Safari 공유 → 홈 화면에 추가</strong>로 저장하면,
            다음부터 앱을 열지 않고 "{quickViewBanner}" 도착정보를 바로 볼 수 있어요.
          </span>
          <button
            type="button"
            onClick={() => {
              setQuickViewBanner(null);
              clearDeepLinkParam();
            }}
            className="p-1 -m-1 shrink-0 rounded-full hover:bg-white/10"
            aria-label="닫기"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <StorageErrorBanner />

      <main ref={mainRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain">
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

function App() {
  const [authReady, setAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadAuth = async () => {
      const { data } = await supabase.auth.getClaims();
      if (mounted) {
        setIsAuthenticated(Boolean(data?.claims?.sub));
        setAuthReady(true);
      }
    };

    loadAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setIsAuthenticated(false);
        return;
      }
      setIsAuthenticated(Boolean(session));
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (!authReady) {
    return (
      <div className="fixed inset-0 bg-slate-50 flex items-center justify-center text-sm text-slate-400">
        로그인 상태를 확인하는 중...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  return (
    <AppProvider>
      <AppContent />
      <ToastContainer />
    </AppProvider>
  );
}

export default App;
