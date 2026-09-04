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

function App() {
  const [authReady, setAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  /**
   * 로그인 상태 확인이 네트워크 때문에 실패했을 때만 채워진다.
   * 이유를 알리지 않으면 사용자는 계정이 풀린 줄 안다(QA #12).
   */
  const [authNotice, setAuthNotice] = useState("");

  useEffect(() => {
    let mounted = true;

    /**
     * 저장된 토큰이 만료돼 있으면 getClaims()는 갱신을 위해 네트워크를 탄다.
     * 그런데 오프라인에서는 이 Promise가 reject되지 않는다 — supabase-js가
     * 갱신 요청을 백오프로 계속 재시도하고, 자동 갱신 타이머가 그 재시도를
     * 다시 살려낸다. 실측(오프라인 재현) 결과 60초가 넘도록 22회를 재시도하며
     * 끝내 settle하지 않았고, 그동안 앱은 "로그인 상태를 확인하는 중..."
     * 화면에 갇혀 있었다. try/catch만으로는 이 경우를 못 잡는다.
     *
     * 그래서 시간 제한을 함께 둔다. 제한을 넘기면 일단 로그인 화면으로
     * 내보내되 원인이 네트워크임을 안내하고, 뒤늦게 갱신이 성공하면 아래
     * settle()이 다시 호출돼 그대로 로그인 상태로 넘어간다(재로그인 불필요).
     */
    const AUTH_CHECK_TIMEOUT_MS = 5000;
    const NETWORK_NOTICE =
      "네트워크 문제로 로그인 상태를 확인하지 못했어요. 연결을 확인한 뒤 다시 시도하면 로그인 상태가 그대로 유지될 수 있어요.";

    const settle = (authenticated: boolean, notice: string) => {
      if (!mounted) return;
      setIsAuthenticated(authenticated);
      setAuthNotice(notice);
      setAuthReady(true);
    };

    const timeoutId = window.setTimeout(() => {
      console.warn(`[App] 로그인 상태 확인이 ${AUTH_CHECK_TIMEOUT_MS}ms 안에 끝나지 않았습니다.`);
      settle(false, NETWORK_NOTICE);
    }, AUTH_CHECK_TIMEOUT_MS);

    const loadAuth = async () => {
      try {
        const { data } = await supabase.auth.getClaims();
        window.clearTimeout(timeoutId);
        settle(Boolean(data?.claims?.sub), "");
      } catch (err) {
        console.warn("[App] 로그인 상태 확인 실패:", err);
        window.clearTimeout(timeoutId);
        settle(false, NETWORK_NOTICE);
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
      // 세션이 살아났으면 남아 있던 네트워크 안내는 더 이상 사실이 아니다.
      if (session) setAuthNotice("");
    });

    return () => {
      mounted = false;
      window.clearTimeout(timeoutId);
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
    return <AuthScreen notice={authNotice} />;
  }

  return (
    <AppProvider>
      <AppContent />
      <ToastContainer />
    </AppProvider>
  );
}

export default App;
