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
import { BellRing, Info, X } from "lucide-react";

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
  /* 홈 빠른 실행 "정류장 검색"(DESIGN.md 7-7)으로 들어올 때 버스 화면을
     정류장 검색 쪽으로 열기 위한 값. 노선·정류장 바로 열기와 같은 방식으로
     한 번 쓰고 비운다. */
  const [pendingSearchTab, setPendingSearchTab] = useState<"route" | "station" | null>(null);
  const [homeRefreshKey, setHomeRefreshKey] = useState(0);
  /* 알림 화면은 하단 탭에 없다(DESIGN.md 7-9). 홈 헤더의 벨이나 빠른 실행으로
     들어가므로, 화면 위쪽 뒤로 가기는 들어오기 직전의 탭으로 돌려보낸다. */
  const [alertReturnTab, setAlertReturnTab] = useState<TabId>("home");
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
    if (nextTab === "alert" && tab !== "alert") {
      setAlertReturnTab(tab);
    }
    setTab(nextTab);
  };

  const handleNavigate = (
    nextTab: TabId,
    routeId?: string,
    station?: { id: string; name: string; arsId?: string },
    options?: { searchTab?: "route" | "station" }
  ) => {
    setPendingSearchTab(options?.searchTab ?? null);
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
    <div className="max-w-md mx-auto bg-canvas fixed inset-0 overflow-hidden flex flex-col">
      {dropoffAlarm && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-6">
          {/* animate-pulse는 로딩 스켈레톤용 무한 opacity 깜빡임이다. 사용자가
              급하게 읽고 눌러야 하는 실제 알람 내용에 걸려 있으면 계속 흐려졌다
              밝아지길 반복해 방해가 된다 — 알람 카드에는 붙이지 않는다. */}
          {/* 4단계(DESIGN.md 8장): 🔔 이모지 대신 BellRing 아이콘. 이모지는 기기마다
              모양이 달라지고 색을 맞출 수 없었다. 빨강은 아이콘에만 쓴다(4-2) —
              예전 연분홍 원 바탕은 canvas로, 빨간 "알람 끄기" 면(흰 글자 3.8:1)은
              brand로 바꿨다. 카드는 바텀시트와 같은 28px 모서리와 sheet 그림자. */}
          <div
            role="alertdialog"
            aria-labelledby="dropoff-alarm-title"
            className="w-full max-w-sm rounded-hero bg-surface shadow-sheet p-7 text-center"
          >
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-canvas flex items-center justify-center">
              <BellRing className="w-8 h-8 text-danger" aria-hidden="true" />
            </div>
            <div id="dropoff-alarm-title" className="text-headline font-bold text-ink">{dropoffAlarm.title}</div>
            {/* 급하게 읽어야 하는 내용이라 보조 회색이 아니라 ink로 쓴다. */}
            <div className="mt-3 whitespace-pre-line text-body-strong text-ink">
              {dropoffAlarm.body}
            </div>
            <button
              type="button"
              onClick={() => {
                stopDropoffAlarm();
                setDropoffAlarm(null);
              }}
              className="mt-7 w-full rounded-full bg-brand px-5 py-4 text-body-strong font-bold text-white active:scale-[0.98] transition-transform duration-100"
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
          {/* 토스트와 같은 모양(흰 카드 + 1px line, 20px 모서리, float 그림자). */}
          <div className="flex items-center gap-3 bg-surface rounded-card shadow-float border border-line px-4 py-3">
            <Info className="w-5 h-5 text-brand shrink-0" aria-hidden="true" />
            <span className="flex-1 text-body text-ink">
              지금 화면을 <strong className="font-semibold">Safari 공유 → 홈 화면에 추가</strong>로 저장하면,
              다음부터 앱을 열지 않고 "{quickViewBanner}" 도착정보를 바로 볼 수 있어요.
            </span>
            <button
              type="button"
              onClick={() => {
                setQuickViewBanner(null);
                clearDeepLinkParam();
              }}
              /* 아이콘 16px, ::before로 사방 14px 넓혀 누르는 영역 44px. */
              className="relative text-faint active:text-muted shrink-0 before:content-[''] before:absolute before:-inset-3.5"
              aria-label="닫기"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* 하단 탭은 이 영역 위에 떠 있다(BottomNav 참고). 탭이 덮는 높이만큼
          아래를 비워(pb-nav-clear) 어느 화면이든 마지막 항목이 탭에 가려지지
          않게 한다. 높이를 꽉 채우는 화면(버스, 길찾기, 마이)은 이 여백만큼
          짧아져 탭 위에서 끝난다. */}
      <main ref={mainRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-none pb-nav-clear">
        {tab === "home" && <HomeScreen key={homeRefreshKey} onNavigate={handleNavigate} />}
        {tab === "bus" && (
          <BusScreen
            initialRouteId={pendingRouteId ?? undefined}
            onConsumeInitialRoute={() => setPendingRouteId(null)}
            initialStation={pendingStation ?? undefined}
            onConsumeInitialStation={() => setPendingStation(null)}
            initialSearchTab={pendingSearchTab ?? undefined}
            onConsumeInitialSearchTab={() => setPendingSearchTab(null)}
          />
        )}
       {tab === "route" && <RouteScreen />}
        {tab === "alert" && <AlertScreen onBack={() => handleTabChange(alertReturnTab)} />}
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
