import { useState } from "react";
import { AppProvider } from "@/store/AppContext";
import { BottomNav, type TabId } from "@/components/BottomNav";
import { ToastContainer } from "@/components/Toast";
import { HomeScreen } from "@/screens/HomeScreen";
import { BusScreen } from "@/screens/BusScreen";
import { CardScreen } from "@/screens/CardScreen";
import { AlertScreen } from "@/screens/AlertScreen";
import { MyScreen } from "@/screens/MyScreen";
import { useDropoffAlertMonitor } from "@/hooks/useDropoffAlertMonitor";

function AppContent() {
  const [tab, setTab] = useState<TabId>("home");
  const [pendingRouteId, setPendingRouteId] = useState<string | null>(null);

  // 활성 하차 알림 백그라운드 감시
  useDropoffAlertMonitor();

  const handleNavigate = (nextTab: TabId, routeId?: string) => {
    if (routeId) setPendingRouteId(routeId);
    setTab(nextTab);
  };

  return (
    <div className="max-w-md mx-auto bg-slate-50 min-h-screen relative">
      {tab === "home" && <HomeScreen onNavigate={handleNavigate} />}
      {tab === "bus" && (
        <BusScreen
          initialRouteId={pendingRouteId ?? undefined}
          onConsumeInitialRoute={() => setPendingRouteId(null)}
        />
      )}
      {tab === "card" && <CardScreen />}
      {tab === "alert" && <AlertScreen />}
      {tab === "my" && <MyScreen />}
      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
      <ToastContainer />
    </AppProvider>
  );
}

export default App;