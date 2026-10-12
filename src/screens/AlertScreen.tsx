import { useState, useEffect, useCallback } from "react";
import {
  Bell,
  Plus,
  Volume2,
  Vibrate,
  MapPin,
  Trash2,
  Bell as BellIcon,
  Search,
  X,
  ChevronRight,
  ArrowLeft,
  Bus as BusIcon,
  AlertTriangle,
  HelpCircle,
  Check,
} from "lucide-react";
import { useApp } from "@/store/appContext";
import { useAsync } from "@/hooks/useAsync";
import { fetchAllRoutes, fetchStopsForRoute } from "@/services/routeService";
import { fetchBusLocations } from "@/services/busLocationService";
import { Toggle, LoadingSkeleton, BackButton } from "@/components/ui";
import { showToast } from "@/lib/toastStore";
import { indexOfStopByOrder, maxStopsBefore } from "@/lib/stopPosition";
import { getRouteCategory, isMainRoute } from "@/lib/routeCategory";
import { alertVehicleMode, listPickableVehicles, vehicleLabel } from "@/lib/dropoffAlert";
import type { AlertSetting, AlertRecord } from "@/types";
import type { Route, BusStop } from "@/types/route";
import {
  loadAlertRecords,
  saveAlertRecords,
  requestNotificationPermission,
} from "@/services/alertMonitorService";

export function AlertScreen({ onBack }: { onBack?: () => void }) {
  const { state, dispatch } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  /* 탄 버스를 다시 고르는 창을 연 알림. 창이 열린 동안 감시가 고정을 풀 수
     있으므로 알림 자체가 아니라 ID를 들고 있다가 최신 값을 찾는다. */
  const [pickAlertId, setPickAlertId] = useState<string | null>(null);
  const pickAlert = pickAlertId ? state.alerts.find((a) => a.id === pickAlertId) ?? null : null;
  const [records, setRecords] = useState<AlertRecord[]>(() => loadAlertRecords());
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    () => ("Notification" in window ? Notification.permission : "denied")
  );

  useEffect(() => {
    const id = setInterval(() => {
      setRecords(loadAlertRecords());
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const markAllRead = () => {
    const next = records.map((r) => ({ ...r, read: true }));
    setRecords(next);
    saveAlertRecords(next);
    showToast("모든 알림을 읽었어요");
  };

  const handleRequestPermission = async () => {
    const ok = await requestNotificationPermission();
    setNotifPermission(
      ok ? "granted" : "Notification" in window ? Notification.permission : "denied"
    );
    if (ok) showToast("알림 권한이 허용되었어요");
    else showToast("알림 권한이 거부되었어요. 브라우저 설정에서 허용해 주세요");
  };

  return (
    // 맨 아래 pb-5(20px): App의 스크롤 영역(pb-nav-clear)이 하단 탭 위로 남기는
    // 0.5rem과 더해 마지막 카드와 탭 사이가 홈과 같은 28px이 된다.
    <div className="bg-canvas pb-5">
      {/* 공통 얇은 헤더(DESIGN.md 8장): canvas 바탕, 안전영역 + 3.5rem, 제목
          Title, 아래 1px 선 없음. 예전에는 흰 바탕 + 아래 선 + 최소 4rem
          윗여백(pt-safe-16)이었다. 이 화면은 App 스크롤 영역 안에서
          스크롤되므로 헤더가 sticky다 — 불투명한 canvas 바탕이라 스크롤 중에도
          밑으로 지나가는 카드가 비치지 않는다. */}
      <header className="bg-canvas px-5 pt-safe-0 sticky top-0 z-30">
        <div className="h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* 알림은 하단 탭에서 빠졌다(DESIGN.md 7-9). 하단 탭에 이 화면의
                자리가 없으니, 들어온 곳으로 돌아가는 버튼을 위쪽에 둔다. 예전에는
                홈 헤더의 벨과 홈 빠른 실행에서 들어왔고, 빠른 실행을 지운 뒤로는
                벨에서만 들어온다. 모양은 홈 헤더의 원형 버튼과 같다 — 보이는
                원 40px, 투명한 ::before로 사방 2px씩 넓혀 누르는 영역 44px.
                4단계부터 정류장·노선 상세와 같은 부품(ui.tsx BackButton)을 쓴다. */}
            {onBack && <BackButton onClick={onBack} />}
            <div className="min-w-0">
              <h1 className="text-title text-ink">알림</h1>
              <p className="text-caption text-muted">하차 알림 · 알림 센터</p>
            </div>
          </div>
          {/* 홈 "전체보기"와 같은 Body brand 글자 버튼. 글자 줄(21px)에
              ::before로 위아래 12px씩 더해 누르는 영역 44px. */}
          <button
            onClick={markAllRead}
            className="relative shrink-0 select-none touch-manipulation text-body text-brand active:underline before:content-[''] before:absolute before:-inset-x-2 before:-inset-y-3"
          >
            모두 읽음
          </button>
        </div>
      </header>
        {notifPermission !== "granted" && (
          <div className="mx-5 mt-2 p-4 bg-surface border border-line rounded-card flex items-center justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              {/* 아이콘 타일은 7-8과 같은 36px(brand-soft + brand 18px). */}
              <div className="w-9 h-9 rounded-tile bg-brand-soft flex items-center justify-center shrink-0">
                <Bell className="w-4.5 h-4.5 text-brand" aria-hidden="true" />
              </div>
              <p className="text-caption text-muted pt-0.5">
                실제 하차 알림을 받으려면 브라우저 알림 권한이 필요해요.
              </p>
            </div>
            {/* 흰 카드 위라 canvas 바탕은 거의 보이지 않았다(1.06:1).
                brand-soft 알약으로 바꾸고, 높이 32px + 위아래 6px로 44px. */}
            <button
              onClick={handleRequestPermission}
              className="relative select-none touch-manipulation shrink-0 h-8 px-3 rounded-full bg-brand-soft text-brand text-caption font-semibold active:bg-line transition-colors before:content-[''] before:absolute before:inset-x-0 before:-inset-y-1.5"
            >
              허용하기
            </button>
          </div>
        )}

      {/* 섹션 제목은 Body-strong ink, 제목과 내용 사이 12px, 섹션 사이 28px(6장).
          예전 제목은 12px muted였다. */}
      <section className={`px-5 ${notifPermission !== "granted" ? "pt-7" : "pt-2"}`}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-body-strong text-ink">하차 알림 설정</h2>
          <button
            onClick={() => setShowAdd(true)}
            className="relative select-none touch-manipulation flex items-center gap-1 h-8 px-3 rounded-full bg-brand-soft text-brand text-caption font-semibold active:bg-line transition-colors before:content-[''] before:absolute before:inset-x-0 before:-inset-y-1.5"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            추가
          </button>
        </div>

        {state.alerts.length === 0 ? (
          /* 빈 상태는 점선 카드(8장). 홈의 빈 히어로 카드(7-3)와 같은 문법:
             흰 카드 + 1.5px faint 점선, 56px brand-soft 원 + brand 아이콘,
             제목 Body-strong ink. 예전에는 실선 카드에 흐린(faint) 글자였다. */
          <div className="bg-surface rounded-card border-[1.5px] border-dashed border-faint px-6 py-7 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full bg-brand-soft flex items-center justify-center mb-3">
              <Bell className="w-6 h-6 text-brand" aria-hidden="true" />
            </div>
            <p className="text-body-strong text-ink">설정된 하차 알림이 없어요</p>
            <button
              onClick={() => setShowAdd(true)}
              className="relative mt-2 select-none touch-manipulation text-body text-brand active:underline before:content-[''] before:absolute before:-inset-x-2 before:-inset-y-3"
            >
              알림 설정하기
            </button>
          </div>
        ) : (
          /* 카드마다 테두리를 두르고 쌓으면 목록이 문서처럼 보인다. 한 판
             안에서 구분선으로만 나눈다(홈 화면과 같은 문법). 4단계에서 홈처럼
             판 바깥에도 1px line을 두르고 모서리를 20px로 맞췄다. */
          <div className="bg-surface rounded-card border border-line overflow-hidden divide-y divide-line">
            {state.alerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onToggle={() => dispatch({ type: "TOGGLE_ALERT", id: alert.id })}
                onPickVehicle={() => setPickAlertId(alert.id)}
                onRemove={() => {
                  dispatch({ type: "REMOVE_ALERT", id: alert.id });
                  showToast("알림을 삭제했어요");
                }}
              />
            ))}
          </div>
        )}
      </section>

      <section className="px-5 mt-7">
        <h2 className="text-body-strong text-ink mb-3">알림 센터</h2>
        {records.length === 0 ? (
          /* 알림 센터의 빈 상태도 같은 점선 카드다. 예전에는 카드 없이
             큰 여백(EmptyState)만 있어 위 섹션과 모양이 달랐다. */
          <div className="bg-surface rounded-card border-[1.5px] border-dashed border-faint px-6 py-7 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full bg-brand-soft flex items-center justify-center mb-3">
              <BellIcon className="w-6 h-6 text-brand" aria-hidden="true" />
            </div>
            <p className="text-body-strong text-ink">알림이 없어요</p>
          </div>
        ) : (
          /* 행마다 "마지막이면 아래 선을 빼라"를 직접 계산하고 있었다.
             divide-y는 첫 행 위와 마지막 행 아래에 선을 넣지 않으므로
             그 계산이 필요 없다. */
          <div className="bg-surface rounded-card border border-line overflow-hidden divide-y divide-line">
            {records.map((r) => {
              /* 아이콘이 알림 종류를 말하게 한다. 예전에는 종류와 무관하게 같은
                 종 모양이 회색 타일(흰 판 대비 1.06:1)에 담겨 보이지 않는 박스가
                 행마다 48px씩 차지했다. 읽지 않음은 연파랑 배경(1.07:1)으로도
                 표시했는데 연속되면 파란 덩어리로 뭉쳐 오히려 행 구분이 흐려졌다.
                 신호는 점(5.17:1)과 제목 굵기, 둘로 충분하다.
                 색은 4-2 상태 색을 쓴다: 도착은 실시간 초록, 지연은
                 지연 의심 주황(delay). 예전 -600 값은 흰 바탕 대비가 모자랐다.
                 도착 아이콘은 4단계에서 진한 live(emerald-700)로 올렸다가, 녹색
                 복원 작업에서 디자인 작업 전 값인 live-icon(emerald-600, 3.77:1)으로
                 되돌렸다. 글자가 아닌 아이콘이라 3:1 기준이고, 옆 제목 글자가
                 종류를 함께 말한다. */
              const Icon =
                r.type === "dropoff"
                  ? MapPin
                  : r.type === "arrival"
                    ? BusIcon
                    : AlertTriangle;
              const tone =
                r.type === "dropoff"
                  ? "text-brand"
                  : r.type === "arrival"
                    ? "text-live-icon"
                    : "text-delay";
              return (
              <div key={r.id} className="min-h-16 flex items-start gap-3 px-4 py-3.5">
                <Icon className={`w-4.5 h-4.5 mt-0.5 shrink-0 ${tone}`} aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p
                      className={`text-body text-ink ${
                        r.read ? "font-medium" : "font-semibold"
                      }`}
                    >
                      {r.title}
                    </p>
                    {!r.read && (
                      <span className="w-2 h-2 rounded-full bg-brand shrink-0">
                        <span className="sr-only">읽지 않음</span>
                      </span>
                    )}
                  </div>
                  <p className="text-caption text-muted mt-0.5">{r.body}</p>
                  <p className="text-micro font-medium text-muted tabular-nums mt-1">{r.time}</p>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </section>

      {pickAlert && (
        <VehiclePickSheet
          alert={pickAlert}
          onClose={() => setPickAlertId(null)}
          onPick={(vehicleNo) => {
            dispatch({
              type: "SET_ALERT_VEHICLE",
              id: pickAlert.id,
              vehicleNo,
              boundAt: Date.now(),
            });
            setPickAlertId(null);
            showToast(
              vehicleNo
                ? `${vehicleLabel(vehicleNo)} 기준으로 알려 드릴게요`
                : "모든 버스 기준으로 알려 드릴게요"
            );
          }}
        />
      )}

      {showAdd && (
        <AddAlertModal
          onClose={() => setShowAdd(false)}
          onAdd={(alert) => {
            dispatch({ type: "ADD_ALERT", alert });
            setShowAdd(false);
            showToast("하차 알림을 설정했어요");
          }}
        />
      )}
    </div>
  );
}

function AlertCard({
  alert,
  onToggle,
  onRemove,
  onPickVehicle,
}: {
  alert: AlertSetting;
  onToggle: () => void;
  onRemove: () => void;
  /** 탄 버스 고르기 창을 연다(바꾸기, 다시 고르기). */
  onPickVehicle: () => void;
}) {
  const vehicleMode = alertVehicleMode(alert);
  return (
    <div className="px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {/* alert.routeName은 route.name("본선104")을 그대로 담고 있다.
                그대로 쓰면 분류와 번호가 한 단어로 붙어 읽히고, 같은 노선이
                버스 화면("104번 본선")과 다르게 보인다. 표시만 맞춘다 —
                저장된 값은 건드리지 않는다. */}
            <span className="flex items-baseline gap-1.5">
              <span className="text-body-strong text-ink">
                {alert.routeNumber ? `${alert.routeNumber}번` : alert.routeName}
              </span>
              <span className="text-caption text-muted">
                {getRouteCategory(alert.routeName)}
              </span>
            </span>
            {/* 상태 칩은 신뢰도 칩과 같은 모양(높이 20px, Micro). 켜짐은
                brand-soft + brand, 꺼짐은 canvas + pending(확인 중 칩과 같은
                회색). 예전 꺼짐 글자는 faint라 정보 글자로는 대비가 모자랐다. */}
            <span
              className={`inline-flex items-center h-5 px-2 rounded-full text-micro ${
                alert.active ? "bg-brand-soft text-brand" : "bg-canvas text-pending"
              }`}
            >
              {alert.active ? "활성" : "꺼짐"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-caption text-muted min-w-0">
            <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span className="font-medium truncate">{alert.targetStation}</span>
            <span className="shrink-0">하차</span>
          </div>
          {/* 무엇을 기준으로 울리는지 작게 한 줄로 보인다(Caption muted).
              고정한 차량이면 "5668번 차량 기준 · 바꾸기"다. "바꾸기"는 잘못
              고른 차량을 바로잡는 길이다 — 잘못 고르면 내가 탄 버스로는 울리지
              않는다. 모든 버스 기준이면 "모든 버스 기준 · 버스 고르기"다.
              처음에는 고정한 차량일 때만 이 줄을 두었는데, 그러면 "잘 모르겠어요"를
              고른 알림이나 예전 알림은 지웠다 다시 만들어야 차량을 고를 수
              있었다(사용자 결정으로 모든 카드에 둠). 고정이 풀려 다시 고르기를
              기다리는 동안은 이 줄 대신 아래 안내가 보인다. 글자 줄(18px)에
              ::before로 위아래 14px씩 더해 누르는 영역 46px. */}
          {vehicleMode !== "awaiting" && (
            <div className="flex items-center gap-1.5 mt-1 text-caption text-muted min-w-0">
              <BusIcon className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span className="tabular-nums truncate">
                {vehicleMode === "bound" ? `${vehicleLabel(alert.vehicleNo!)} 기준` : "모든 버스 기준"}
              </span>
              <button
                onClick={onPickVehicle}
                aria-label={vehicleMode === "bound" ? "탄 버스 바꾸기" : "탄 버스 고르기"}
                className="relative shrink-0 ml-1 select-none touch-manipulation text-brand active:underline before:content-[''] before:absolute before:-inset-x-2 before:-inset-y-3.5"
              >
                {vehicleMode === "bound" ? "바꾸기" : "버스 고르기"}
              </button>
            </div>
          )}
        </div>
        <Toggle
          checked={alert.active}
          onChange={onToggle}
          label={`${alert.routeNumber}번 ${alert.targetStation} 하차 알림`}
        />
      </div>

      {/* 고정이 풀려 다음 탑승 때 다시 골라야 하는 상태(lib/dropoffAlert.ts).
          이때는 모든 버스 기준으로 돌아가지 않고 울리지 않으므로, 그 사실과
          고르는 버튼을 카드 안에 둔다. 버튼은 섹션 "추가"와 같은 brand-soft
          알약(높이 32px + 위아래 6px로 44px). */}
      {vehicleMode === "awaiting" && (
        <div className="flex items-center justify-between gap-3 mt-3">
          {/* 한 줄씩 짧게 둔다. 길게 쓰면 버튼 옆에서 "전/에는"처럼 낱말이
              갈라져, 줄바꿈도 낱말 단위(break-keep)로 한다. */}
          <div className="min-w-0 break-keep">
            <p className="text-caption text-ink">탈 버스를 다시 골라 주세요</p>
            <p className="text-caption text-muted">고르기 전에는 울리지 않아요</p>
          </div>
          <button
            onClick={onPickVehicle}
            className="relative select-none touch-manipulation shrink-0 h-8 px-3 rounded-full bg-brand-soft text-brand text-caption font-semibold active:bg-line transition-colors before:content-[''] before:absolute before:inset-x-0 before:-inset-y-1.5"
          >
            버스 고르기
          </button>
        </div>
      )}

      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-line">
        <span className="flex items-center gap-1 text-caption text-muted">
          <MapPin className="w-3.5 h-3.5 text-brand" aria-hidden="true" />
          <span className="tabular-nums">{alert.stopsBefore}정거장 전</span>
        </span>
        {/* 소리·진동 아이콘은 "켜져 있음"을 알리는 정보라 faint가 아니라
            muted다(4-1: faint는 비활성 표시에만). */}
        <div className="flex items-center gap-2 ml-auto">
          {alert.sound && <Volume2 className="w-3.5 h-3.5 text-muted" aria-label="소리 알림" />}
          {alert.vibrate && <Vibrate className="w-3.5 h-3.5 text-muted" aria-label="진동 알림" />}
          {/* 아이콘 16px + 안쪽 6px = 28px, ::before로 사방 8px 더해 44px. */}
          <button
            onClick={onRemove}
            aria-label="알림 삭제"
            className="relative p-1.5 -m-1.5 ml-0 rounded-full select-none touch-manipulation text-faint active:text-danger transition-colors before:content-[''] before:absolute before:-inset-2"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

function AddAlertModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (alert: AlertSetting) => void;
}) {
  // 노선 → 하차 정류장 → 탄 버스 → 알림 설정. 탄 버스 단계는 고를 버스가
  // 없으면 건너뛴다(vehicleSkip). 예전에는 탄 버스 단계가 없어 모든 차량 기준이었다.
  const [step, setStep] = useState<"route" | "stop" | "vehicle" | "options">("route");
  const [query, setQuery] = useState("");
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [selectedStop, setSelectedStop] = useState<BusStop | null>(null);
  /** 고른 차량번호. null이면 "잘 모르겠어요"(모든 버스 기준). */
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  /** 탄 버스 단계를 건너뛴 이유. 알림 설정 단계에 안내 문구로 보인다. */
  const [vehicleSkip, setVehicleSkip] = useState<"empty" | "error" | null>(null);
  const [stopsBefore, setStopsBefore] = useState(2);
  const [sound, setSound] = useState(true);
  const [vibrate, setVibrate] = useState(true);

  const { data: routes, status: routesStatus } = useAsync(() => fetchAllRoutes(), []);
  const { data: stops, status: stopsStatus } = useAsync(
    () => (selectedRoute ? fetchStopsForRoute(selectedRoute) : Promise.resolve([])),
    [selectedRoute?.id]
  );

  const filteredRoutes =
    routes?.filter(
      (r) =>
        (r.name ?? "").includes(query) ||
        (r.number ?? "").includes(query) ||
        (r.start ?? "").includes(query) ||
        (r.end ?? "").includes(query)
    ) ?? [];

  // 순번(order)이 아니라 정류장 목록에서의 위치로 계산해야 한다. 순번에는
  // 구멍이 있어서 "순번 - 1"이 실제 앞선 정거장 수와 다르다(stopPosition.ts 참고).
  const targetIndex =
    selectedStop && stops ? indexOfStopByOrder(stops, selectedStop.order) : -1;
  const stopsBeforeMax = maxStopsBefore(targetIndex);
  // targetIndex === -1은 "노선의 첫 정류장"이 아니라 정류장 순번을 목록에서
  // 찾지 못한 경우(데이터 갱신 등)다. 원인이 다르므로 안내 문구도 분리한다.
  const stopNotFound = selectedStop != null && stops != null && targetIndex === -1;
  const isFirstStopOfRoute = selectedStop != null && stops != null && targetIndex === 0;
  const stopsBeforeDisabled = isFirstStopOfRoute || stopNotFound;

  useEffect(() => {
    if (stopsBeforeMax > 0) {
      setStopsBefore((s) => Math.min(s, stopsBeforeMax));
    }
  }, [stopsBeforeMax]);

  // 지금 보이는 버스가 없거나 위치를 못 불러오면 탄 버스 단계를 건너뛰고
  // 모든 버스 기준으로 만든다. 알림 설정 단계에 이유를 한 줄로 남긴다.
  const handleVehicleUnavailable = useCallback((reason: "empty" | "error") => {
    setSelectedVehicle(null);
    setVehicleSkip(reason);
    setStep("options");
  }, []);

  const handleSave = () => {
    if (!selectedRoute || !selectedStop) return;
    // 첫 정류장이거나 위치를 확인 못했으면 "N정거장 전"이 성립하지 않아 저장해도 절대 울리지 않는다.
    if (stopsBeforeDisabled) return;
    onAdd({
      id: Date.now().toString(),
      routeId: selectedRoute.id,
      routeName: selectedRoute.name || `${selectedRoute.number}번`,
      routeNumber: selectedRoute.number,
      targetStation: selectedStop.name,
      targetStopOrder: selectedStop.order,
      stopsBefore,
      sound,
      vibrate,
      active: true,
      // 탄 버스를 골랐을 때만 고정 키를 넣는다. 고르지 않으면 예전과 같은
      // 모양(모든 차량 기준)으로 저장된다.
      ...(selectedVehicle ? { vehicleNo: selectedVehicle, boundAt: Date.now() } : {}),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      {/* 바텀시트: 모서리 28px(hero), sheet 그림자(6장). */}
      <div className="relative bg-surface rounded-t-hero sm:rounded-hero w-full max-w-md max-h-[85vh] overflow-y-auto shadow-sheet">
        <div className="px-5 py-4 border-b border-line sticky top-0 bg-surface z-10 flex items-center gap-2">
          {step !== "route" && (
            <button
              onClick={() => {
                // 탄 버스 단계를 건너뛰고 왔으면(고를 버스 없음, 첫 정류장 등)
                // 그 단계로 돌아가지 않고 정류장 고르기로 간다.
                if (step === "options") {
                  setStep(vehicleSkip || targetIndex <= 0 ? "stop" : "vehicle");
                } else if (step === "vehicle") setStep("stop");
                else {
                  setStep("route");
                  setSelectedRoute(null);
                  setSelectedStop(null);
                }
              }}
              aria-label="이전 단계"
              /* 보이는 크기 28px, ::before로 사방 8px 더해 누르는 영역 44px. */
              className="relative select-none touch-manipulation p-1 -ml-1 rounded-full active:bg-canvas before:content-[''] before:absolute before:-inset-2"
            >
              <ArrowLeft className="w-5 h-5 text-ink" aria-hidden="true" />
            </button>
          )}
          <h2 className="text-title text-ink">
            {step === "route" && "노선 선택"}
            {step === "stop" && "하차 정류장 선택"}
            {step === "vehicle" && "탄 버스 선택"}
            {step === "options" && "알림 설정"}
          </h2>
        </div>

        {step === "route" && (
          <div className="px-4 py-3">
            <div className="relative mb-3">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="노선번호 검색"
                className="w-full pl-9 pr-9 py-2.5 bg-canvas rounded-full text-base text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-brand"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  aria-label="검색어 지우기"
                  className="select-none touch-manipulation absolute right-3 top-1/2 -translate-y-1/2 before:content-[''] before:absolute before:-inset-3.5"
                >
                  <X className="w-4 h-4 text-faint" />
                </button>
              )}
            </div>
            {routesStatus === "loading" && (
              /* 값이 들어올 때 목록이 튀지 않도록 완성된 모양과 같게 깔아 둔다. */
              <div className="bg-surface rounded-card border border-line overflow-hidden divide-y divide-line">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="min-h-16 px-3 py-3 flex items-center gap-3">
                    <LoadingSkeleton className="w-12 h-9 rounded-tile shrink-0" />
                    <LoadingSkeleton className="h-4 flex-1" />
                  </div>
                ))}
              </div>
            )}
            {routesStatus === "success" && (
              <div className="bg-surface rounded-card border border-line overflow-hidden divide-y divide-line max-h-[50vh] overflow-y-auto">
                {filteredRoutes.map((route) => {
                  const isMain = isMainRoute(route.name);
                  return (
                  <button
                    key={`${route.id}-${route.number}`}
                    onClick={() => {
                      setSelectedRoute(route);
                      setStep("stop");
                    }}
                    className="w-full min-h-16 flex items-center gap-3 px-3 py-3 text-left select-none touch-manipulation transition-colors duration-75 active:bg-canvas"
                  >
                    {/* 버스 검색 결과와 같은 7-5 배지(48×36, 번호만). 본선/분선은
                        화면 읽기용 글자로 남긴다. 예전 40px 배지의 12px 번호는
                        px라 큰 글씨를 따라가지 않았다. */}
                    <div
                      className={`min-w-12 h-9 px-1 rounded-tile flex items-center justify-center shrink-0 text-white ${
                        isMain ? "bg-route-main" : "bg-route-branch"
                      }`}
                    >
                      <span className="text-body-strong font-bold tabular-nums whitespace-nowrap">{route.number}</span>
                      <span className="sr-only">{isMain ? "본선" : "분선"}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-body text-ink">
                        {route.name || `${route.number}번`}
                      </p>
                      <p className="text-caption text-muted truncate">
                        {route.start} → {route.end}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-faint" aria-hidden="true" />
                  </button>
                  );
                })}
                {filteredRoutes.length === 0 && (
                  <p className="text-body text-muted text-center py-8">검색 결과가 없어요</p>
                )}
              </div>
            )}
          </div>
        )}

        {step === "stop" && (
          <div className="px-4 py-3">
            <p className="text-caption text-muted mb-2">
              {selectedRoute?.name || selectedRoute?.number} · 내릴 정류장을 고르세요
            </p>
            {stopsStatus === "loading" && (
              <div className="bg-surface rounded-card border border-line overflow-hidden divide-y divide-line">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="min-h-12 px-3 py-3 flex items-center gap-3">
                    <LoadingSkeleton className="w-7 h-7 shrink-0 rounded-full" />
                    <LoadingSkeleton className="h-4 flex-1" />
                  </div>
                ))}
              </div>
            )}
            {stopsStatus === "success" && stops && (
              <div className="bg-surface rounded-card border border-line overflow-hidden divide-y divide-line max-h-[55vh] overflow-y-auto">
                {stops.map((stop) => (
                  <button
                    key={`${stop.order}-${stop.id}`}
                    onClick={() => {
                      setSelectedStop(stop);
                      setSelectedVehicle(null);
                      setVehicleSkip(null);
                      // 첫 정류장이거나 목록에서 못 찾으면 알림을 만들 수 없다.
                      // 탄 버스를 묻지 않고 바로 안내가 있는 설정 단계로 간다.
                      const index = indexOfStopByOrder(stops, stop.order);
                      setStep(index > 0 ? "vehicle" : "options");
                    }}
                    className="w-full min-h-12 flex items-center gap-3 px-3 py-3 text-left select-none touch-manipulation transition-colors duration-75 active:bg-canvas"
                  >
                    <span className="text-micro font-medium text-muted tabular-nums w-6 shrink-0">{stop.order}</span>
                    <span className="text-body text-ink flex-1">{stop.name}</span>
                    <ChevronRight className="w-4 h-4 text-faint" aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === "vehicle" && selectedRoute && selectedStop && stops && (
          /* 맨 아래가 "잘 모르겠어요" 줄이라, 알림 설정 단계(py-5)처럼 아래를
             20px 띄워 홈 인디케이터 쪽에 붙지 않게 한다. */
          <div className="px-4 pt-3 pb-5 break-keep">
            <p className="text-caption text-muted">
              {selectedRoute.name || selectedRoute.number} · 지금 탄 버스를 골라 주세요
            </p>
            <p className="text-caption text-muted mb-2">
              고른 버스가 {selectedStop.name}에 가까워질 때만 울려요.
            </p>
            <VehicleChoices
              route={selectedRoute}
              stops={stops}
              targetIndex={targetIndex}
              onPick={(vehicleNo) => {
                setSelectedVehicle(vehicleNo);
                setVehicleSkip(null);
                setStep("options");
              }}
              onUnavailable={handleVehicleUnavailable}
            />
          </div>
        )}

        {step === "options" && selectedRoute && selectedStop && (
          <div className="px-5 py-5 space-y-5">
            <div className="bg-canvas rounded-tile p-3">
              <p className="text-body-strong text-ink">
                {selectedRoute.name || `${selectedRoute.number}번`}
              </p>
              <p className="text-caption text-muted mt-0.5">
                하차: {selectedStop.name}
                {targetIndex >= 0 && ` (${targetIndex + 1}번째 정류장)`}
              </p>
              {/* 첫 정류장 등으로 저장이 막히면 아래 안내가 따로 나오므로 숨긴다. */}
              {!stopsBeforeDisabled && (
                <p className="text-caption text-muted">
                  {selectedVehicle ? `${vehicleLabel(selectedVehicle)} 기준` : "모든 버스 기준"}
                </p>
              )}
              {!stopsBeforeDisabled && vehicleSkip && (
                <p className="text-caption text-muted">
                  {vehicleSkip === "empty"
                    ? "지금 운행 중인 버스가 보이지 않아 고르지 못했어요."
                    : "버스 위치를 불러오지 못해 고르지 못했어요."}
                </p>
              )}
            </div>

            <div>
              <label className="text-caption text-muted mb-1.5 block">
                몇 정거장 전에 알릴까요?
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setStopsBefore((s) => Math.max(1, s - 1))}
                  disabled={stopsBeforeDisabled}
                  aria-label="한 정거장 줄이기"
                  /* 44px(6장 누르는 크기). 예전 40px. */
                  className="select-none touch-manipulation w-11 h-11 rounded-tile bg-canvas flex items-center justify-center text-title text-ink active:bg-line disabled:opacity-40"
                >
                  -
                </button>
                <span className="flex-1 text-center text-title text-ink tabular-nums">
                  {stopsBefore}정거장 전
                </span>
                <button
                  onClick={() => setStopsBefore((s) => Math.min(stopsBeforeMax, s + 1))}
                  disabled={stopsBeforeDisabled || stopsBefore >= stopsBeforeMax}
                  aria-label="한 정거장 늘리기"
                  className="select-none touch-manipulation w-11 h-11 rounded-tile bg-canvas flex items-center justify-center text-title text-ink active:bg-line disabled:opacity-40"
                >
                  +
                </button>
              </div>
              {stopNotFound ? (
                /* 저장을 막는 안내라 눈에 띄어야 한다. 4-2에서 빨강은 점과 아이콘에만
                   쓰므로, 예전 빨강·주황 글자를 둘 다 지연 의심 색(delay, 4.8:1)으로 맞춘다. */
                <p className="text-caption text-delay mt-1.5">
                  이 정류장의 위치 정보를 확인하지 못했어요. 다른 정류장을 골라주세요.
                </p>
              ) : isFirstStopOfRoute ? (
                <p className="text-caption text-delay mt-1.5">
                  이 정류장은 노선의 첫 정류장이라 하차 알림을 설정할 수 없어요. 다른 정류장을 골라주세요.
                </p>
              ) : (
                stopsBeforeMax < 10 && (
                  <p className="text-caption text-muted mt-1.5">
                    선택한 정류장 앞에 정거장이 {stopsBeforeMax}개뿐이라 최대 {stopsBeforeMax}정거장 전까지 설정할 수 있어요
                  </p>
                )
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between py-2">
                <span className="flex items-center gap-2 text-body text-ink">
                  <Volume2 className="w-4 h-4 text-muted" aria-hidden="true" />
                  소리 알림
                </span>
                <Toggle checked={sound} onChange={setSound} label="소리 알림" />
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="flex items-center gap-2 text-body text-ink">
                  <Vibrate className="w-4 h-4 text-muted" aria-hidden="true" />
                  진동 알림
                </span>
                <Toggle checked={vibrate} onChange={setVibrate} label="진동 알림" />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={onClose}
                className="select-none touch-manipulation flex-1 py-3 bg-canvas text-ink rounded-full text-body active:bg-line"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={stopsBeforeDisabled}
                className="select-none touch-manipulation flex-1 py-3 bg-brand text-white rounded-full text-body font-semibold active:scale-[0.98] transition-transform duration-100 disabled:opacity-40"
              >
                설정 완료
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 탄 버스 고르기 목록 (DESIGN.md 12장 "하차 알림 차량 고정").
 *
 * 새 종류의 조회 없이 노선 상세와 같은 버스 위치 조회(fetchBusLocations)를
 * 한 번만 부른다. 15초마다 다시 부르지 않는 이유: 고르는 동안 목록 순서가
 * 바뀌면 다른 버스를 잘못 누를 수 있다. 위치 조회는 3초 동안 저장값을
 * 같이 쓰므로, 감시가 방금 부른 노선이면 요청이 새로 나가지 않는다.
 *
 * 행: 36px 아이콘 타일(7-8) / 차량번호(Body-strong) / 지금 정류장(Caption)
 * / 하차까지 남은 정거장(Caption). 맨 아래 "잘 모르겠어요"는 모든 버스 기준.
 */
function VehicleChoices({
  route,
  stops,
  targetIndex,
  currentVehicleNo,
  onPick,
  onUnavailable,
}: {
  route: Route;
  stops: BusStop[];
  targetIndex: number;
  /** 지금 고정된 차량. 다시 고를 때 그 줄에 체크를 보인다. */
  currentVehicleNo?: string;
  /** null이면 "잘 모르겠어요"(모든 버스 기준). */
  onPick: (vehicleNo: string | null) => void;
  /**
   * 있으면 고를 버스가 없을 때 목록 대신 이것을 부른다(알림 만들기에서 이
   * 단계를 건너뜀). 없으면 안내와 "다시 불러오기"를 이 자리에 보인다.
   */
  onUnavailable?: (reason: "empty" | "error") => void;
}) {
  const { data: locations, status, retry } = useAsync(() => fetchBusLocations(route), [route.id]);
  const pickable = locations ? listPickableVehicles(locations, stops, targetIndex) : null;
  const unavailable: "empty" | "error" | null =
    status === "error"
      ? "error"
      : status === "success" && pickable && pickable.vehicles.length === 0
        ? "empty"
        : null;

  useEffect(() => {
    if (unavailable && onUnavailable) onUnavailable(unavailable);
  }, [unavailable, onUnavailable]);

  // 조회 전(idle)도 불러오는 중으로 본다. 건너뛸 때도 다음 단계로 넘어가기
  // 전 한 순간이라 같은 모양을 깔아 둔다.
  if (status === "idle" || status === "loading" || (unavailable && onUnavailable)) {
    return (
      <div className="bg-surface rounded-card border border-line overflow-hidden divide-y divide-line">
        {[1, 2, 3].map((i) => (
          <div key={i} className="min-h-16 px-3 py-3 flex items-center gap-3">
            <LoadingSkeleton className="w-9 h-9 rounded-tile shrink-0" />
            <div className="flex-1 space-y-1.5">
              <LoadingSkeleton className="h-4 w-20" />
              <LoadingSkeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      {unavailable ? (
        /* 다른 빈 상태와 같은 점선 카드(8장). */
        <div className="bg-surface rounded-card border-[1.5px] border-dashed border-faint px-6 py-7 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-brand-soft flex items-center justify-center mb-3">
            <BusIcon className="w-6 h-6 text-brand" aria-hidden="true" />
          </div>
          <p className="text-body-strong text-ink">
            {unavailable === "empty"
              ? "지금 운행 중인 버스가 보이지 않아요"
              : "버스 위치를 불러오지 못했어요"}
          </p>
          <p className="text-caption text-muted mt-1">
            {unavailable === "empty" ? "버스에 탄 뒤 다시 불러와 주세요" : "잠시 후 다시 불러와 주세요"}
          </p>
          <button
            onClick={retry}
            className="relative mt-2 select-none touch-manipulation text-body text-brand active:underline before:content-[''] before:absolute before:-inset-x-2 before:-inset-y-3"
          >
            다시 불러오기
          </button>
        </div>
      ) : (
        pickable && (
          <>
            <div className="bg-surface rounded-card border border-line overflow-hidden divide-y divide-line max-h-[45vh] overflow-y-auto">
              {pickable.vehicles.map((v) => {
                const isCurrent =
                  currentVehicleNo != null &&
                  currentVehicleNo.replace(/\s+/g, "") === v.vehicleNo.replace(/\s+/g, "");
                return (
                  <button
                    key={v.vehicleNo}
                    onClick={() => onPick(v.vehicleNo)}
                    className="w-full min-h-16 flex items-center gap-3 px-3 py-3 text-left select-none touch-manipulation transition-colors duration-75 active:bg-canvas"
                  >
                    <div className="w-9 h-9 rounded-tile bg-brand-soft flex items-center justify-center shrink-0">
                      <BusIcon className="w-4.5 h-4.5 text-brand" aria-hidden="true" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-body-strong text-ink tabular-nums truncate">{v.vehicleNo}</p>
                      <p className="text-caption text-muted truncate">
                        {v.stopName ? `${v.stopName} 부근` : "위치 확인 중"}
                      </p>
                    </div>
                    {v.stopsLeft !== null && (
                      <span className="text-caption text-muted tabular-nums shrink-0">
                        하차까지 {v.stopsLeft}정거장
                      </span>
                    )}
                    {isCurrent ? (
                      <Check className="w-4 h-4 text-brand shrink-0" aria-label="지금 고른 버스" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-faint shrink-0" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
            {pickable.passedCount > 0 && (
              <p className="text-caption text-muted mt-2">
                내릴 정류장을 이미 지난 버스 {pickable.passedCount}대는 뺐어요.
              </p>
            )}
          </>
        )
      )}

      {/* 고르지 않으면 예전처럼 모든 버스 기준이다. 목록이 길어 스크롤돼도
          보이도록 목록 상자 밖, 맨 아래에 둔다. */}
      <button
        onClick={() => onPick(null)}
        className="mt-2 w-full min-h-16 flex items-center gap-3 px-3 py-3 bg-surface rounded-card border border-line text-left select-none touch-manipulation transition-colors duration-75 active:bg-canvas"
      >
        <div className="w-9 h-9 rounded-tile bg-brand-soft flex items-center justify-center shrink-0">
          <HelpCircle className="w-4.5 h-4.5 text-brand" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-body text-ink">잘 모르겠어요</p>
          <p className="text-caption text-muted">모든 버스 기준</p>
        </div>
        <ChevronRight className="w-4 h-4 text-faint shrink-0" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * 알림 카드에서 여는 탄 버스 고르기 창. 고정이 풀린 알림을 다음 탑승 때
 * 다시 고르거나("버스 고르기"), 잘못 고른 차량을 바꿀 때("바꾸기"), 모든
 * 버스 기준 알림에 차량을 고를 때("버스 고르기") 쓴다.
 * 모양은 하차 알림 추가 창과 같은 바텀시트(모서리 28px, sheet 그림자).
 */
function VehiclePickSheet({
  alert,
  onClose,
  onPick,
}: {
  alert: AlertSetting;
  onClose: () => void;
  onPick: (vehicleNo: string | null) => void;
}) {
  // 노선 목록과 정류장 목록은 routeService가 저장해 두어 보통 새 요청이 없다.
  const { data, status, retry } = useAsync(async () => {
    const routes = await fetchAllRoutes();
    const route = routes.find((r) => r.id === alert.routeId);
    if (!route) throw new Error("노선을 찾지 못했어요");
    const stops = await fetchStopsForRoute(route);
    return { route, stops };
  }, [alert.routeId]);
  const targetIndex = data ? indexOfStopByOrder(data.stops, alert.targetStopOrder) : -1;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface rounded-t-hero sm:rounded-hero w-full max-w-md max-h-[85vh] overflow-y-auto shadow-sheet">
        <div className="px-5 py-4 border-b border-line sticky top-0 bg-surface z-10">
          <h2 className="text-title text-ink">탄 버스 선택</h2>
          <p className="text-caption text-muted mt-0.5 truncate">
            {alert.routeNumber ? `${alert.routeNumber}번` : alert.routeName} · {alert.targetStation} 하차
          </p>
        </div>

        <div className="px-4 py-3 break-keep">
          <p className="text-caption text-muted mb-2">
            지금 탄 버스를 골라 주세요. 고른 버스가 가까워질 때만 울려요.
          </p>
          {status === "error" ? (
            <div className="bg-surface rounded-card border-[1.5px] border-dashed border-faint px-6 py-7 flex flex-col items-center text-center">
              <p className="text-body-strong text-ink">노선 정보를 불러오지 못했어요</p>
              <button
                onClick={retry}
                className="relative mt-2 select-none touch-manipulation text-body text-brand active:underline before:content-[''] before:absolute before:-inset-x-2 before:-inset-y-3"
              >
                다시 불러오기
              </button>
            </div>
          ) : data ? (
            <VehicleChoices
              route={data.route}
              stops={data.stops}
              targetIndex={targetIndex}
              currentVehicleNo={alert.vehicleNo}
              onPick={onPick}
            />
          ) : (
            <div className="bg-surface rounded-card border border-line overflow-hidden divide-y divide-line">
              {[1, 2, 3].map((i) => (
                <div key={i} className="min-h-16 px-3 py-3 flex items-center gap-3">
                  <LoadingSkeleton className="w-9 h-9 rounded-tile shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <LoadingSkeleton className="h-4 w-20" />
                    <LoadingSkeleton className="h-3 w-32" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 pt-1 pb-5">
          <button
            onClick={onClose}
            className="select-none touch-manipulation w-full py-3 bg-canvas text-ink rounded-full text-body active:bg-line"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
