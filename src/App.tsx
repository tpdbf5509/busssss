import { useEffect, useState } from "react";
import { AppProvider } from "@/store/AppContext";
import { BottomNav, type TabId } from "@/components/BottomNav";
import { ToastContainer } from "@/components/Toast";
import { HomeScreen } from "@/screens/HomeScreen";
import { BusScreen } from "@/screens/BusScreen";
import { CardScreen } from "@/screens/CardScreen";
import { AlertScreen } from "@/screens/AlertScreen";
import { MyScreen } from "@/screens/MyScreen";
import { AuthScreen } from "@/screens/AuthScreen";
import { useDropoffAlertMonitor } from "@/hooks/useDropoffAlertMonitor";
import { supabase } from "@/lib/supabaseClient";

function AppContent() {
  const [tab, setTab] = useState<TabId>("home");
  const [pendingRouteId, setPendingRouteId] = useState<string | null>(null);
  const [homeRefreshKey, setHomeRefreshKey] = useState(0);

  useDropoffAlertMonitor();

  const handleTabChange = (nextTab: TabId) => {
    // 다른 탭에서 홈으로 돌아올 때 HomeScreen을 다시 마운트해
    // 도착 정보와 홈 화면 데이터를 새로 불러오도록 합니다.
    if (nextTab === "home" && tab !== "home") {
      setHomeRefreshKey((key) => key + 1);
    }
    setTab(nextTab);
  };

  const handleNavigate = (nextTab: TabId, routeId?: string) => {
    if (routeId) setPendingRouteId(routeId);
    handleTabChange(nextTab);
  };

  return (
    <div className="max-w-md mx-auto bg-slate-50 min-h-screen relative">
      {tab === "home" && <HomeScreen key={homeRefreshKey} onNavigate={handleNavigate} />}
      {tab === "bus" && (
        <BusScreen
          initialRouteId={pendingRouteId ?? undefined}
          onConsumeInitialRoute={() => setPendingRouteId(null)}
        />
      )}
      {tab === "card" && <CardScreen />}
      {tab === "alert" && <AlertScreen />}
      {tab === "my" && <MyScreen />}
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-400">
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
