import { useState } from "react";
import { AppProvider } from "@/store/AppContext";
import { BottomNav, type TabId } from "@/components/BottomNav";
import { ToastContainer } from "@/components/Toast";
import { HomeScreen } from "@/screens/HomeScreen";
import { BusScreen } from "@/screens/BusScreen";
import { CardScreen } from "@/screens/CardScreen";
import { AlertScreen } from "@/screens/AlertScreen";
import { MyScreen } from "@/screens/MyScreen";

function App() {
  const [tab, setTab] = useState<TabId>("home");
  const [pendingRouteId, setPendingRouteId] = useState<string | null>(null);

  const handleNavigate = (nextTab: TabId, routeId?: string) => {
    if (routeId) setPendingRouteId(routeId);
    setTab(nextTab);
  };

  return (
    <AppProvider>
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
      <ToastContainer />
    </AppProvider>
  );
}

export default App;