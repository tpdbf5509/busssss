import { useEffect, useRef, useState } from "react";
import { AppProvider } from "@/store/AppContext";
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

type DropoffAlarm = { title: string; body: string };

function AppContent() {
  const [tab, setTab] = useState<TabId>("home");
  const [pendingRouteId, setPendingRouteId] = useState<string | null>(null);
  const [pendingStation, setPendingStation] = useState<{
    id: string;
    name: string;
    arsId?: string;
  } | null>(null);
  const [homeRefreshKey, setHomeRefreshKey] = useState(0);
  const [dropoffAlarm, setDropoffAlarm] = useState<DropoffAlarm | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  useDropoffAlertMonitor();

  useEffect(() => {
       mainRef.current?.scrollTo(0, 0);
     }, [tab]);

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
          <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl p-7 text-center animate-pulse">
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

      <main ref={mainRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain">
        {tab === "home" && (
          <div className="animate-tab-in">
            <HomeScreen key={homeRefreshKey} onNavigate={handleNavigate} />
          </div>
        )}
        {tab === "bus" && (
          <div className="animate-tab-in">
            <BusScreen
              initialRouteId={pendingRouteId ?? undefined}
              onConsumeInitialRoute={() => setPendingRouteId(null)}
              initialStation={pendingStation ?? undefined}
              onConsumeInitialStation={() => setPendingStation(null)}
            />
          </div>
        )}
        {tab === "route" && (
          <div className="animate-tab-in">
            <RouteScreen />
          </div>
        )}
        {tab === "alert" && (
          <div className="animate-tab-in">
            <AlertScreen />
          </div>
        )}
        {tab === "my" && (
          <div className="animate-tab-in">
            <MyScreen />
          </div>
        )}
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
