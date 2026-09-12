import { useState, useEffect } from "react";
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
} from "lucide-react";
import { useApp } from "@/store/appContext";
import { useAsync } from "@/hooks/useAsync";
import { fetchAllRoutes, fetchStopsForRoute } from "@/services/routeService";
import { Toggle, EmptyState, LoadingSkeleton } from "@/components/ui";
import { showToast } from "@/lib/toastStore";
import { indexOfStopByOrder, maxStopsBefore } from "@/lib/stopPosition";
import { isMainRoute } from "@/lib/routeCategory";
import type { AlertSetting, AlertRecord } from "@/types";
import type { Route, BusStop } from "@/types/route";
import {
  loadAlertRecords,
  saveAlertRecords,
  requestNotificationPermission,
} from "@/services/alertMonitorService";

export function AlertScreen() {
  const { state, dispatch } = useApp();
  const [showAdd, setShowAdd] = useState(false);
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
    <div className="bg-canvas">
      <header className="bg-surface px-5 pt-safe-16 pb-5 border-b border-line sticky top-0 z-30 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-ink">알림</h1>
            <p className="text-xs text-faint mt-0.5">하차 알림 · 알림 센터</p>
          </div>
          <button
            onClick={markAllRead}
            className="select-none touch-manipulation text-xs text-brand font-medium active:underline"
          >
            모두 읽음
          </button>
        </div>
      </header>
        {notifPermission !== "granted" && (
          <div className="mx-4 mt-4 p-4 bg-surface border border-line rounded-2xl flex items-center justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-canvas flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4 text-brand" />
              </div>
              <p className="text-xs text-muted leading-relaxed pt-1">
                실제 하차 알림을 받으려면 브라우저 알림 권한이 필요해요.
              </p>
            </div>
            <button
              onClick={handleRequestPermission}
              className="select-none touch-manipulation shrink-0 text-xs font-semibold text-brand bg-canvas active:bg-line px-3 py-1.5 rounded-full transition-colors"
            >
              허용하기
            </button>
          </div>
        )}

      <section className="px-4 pt-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-muted tracking-wide">하차 알림 설정</h2>
          <button
            onClick={() => setShowAdd(true)}
            className="select-none touch-manipulation flex items-center gap-1 text-xs text-brand font-medium bg-canvas px-3 py-1.5 rounded-full active:bg-line transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            추가
          </button>
        </div>

        {state.alerts.length === 0 ? (
          <div className="bg-surface rounded-2xl border border-line p-6 text-center">
            <Bell className="w-8 h-8 text-faint mx-auto mb-2" />
            <p className="text-sm text-faint">설정된 하차 알림이 없어요</p>
            <button
              onClick={() => setShowAdd(true)}
              className="select-none touch-manipulation mt-3 text-sm text-brand font-medium active:underline"
            >
              알림 설정하기
            </button>
          </div>
        ) : (
          /* 카드마다 테두리를 두르고 쌓으면 목록이 문서처럼 보인다. 한 판
             안에서 구분선으로만 나눈다(홈 화면과 같은 문법). */
          <div className="bg-surface rounded-2xl overflow-hidden divide-y divide-line">
            {state.alerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onToggle={() => dispatch({ type: "TOGGLE_ALERT", id: alert.id })}
                onRemove={() => {
                  dispatch({ type: "REMOVE_ALERT", id: alert.id });
                  showToast("알림을 삭제했어요");
                }}
              />
            ))}
          </div>
        )}
      </section>

      <section className="px-4 mt-6">
        <h2 className="text-xs font-semibold text-muted tracking-wide mb-3">알림 센터</h2>
        {records.length === 0 ? (
          <EmptyState icon={BellIcon} title="알림이 없어요" />
        ) : (
          /* 행마다 "마지막이면 아래 선을 빼라"를 직접 계산하고 있었다.
             divide-y는 첫 행 위와 마지막 행 아래에 선을 넣지 않으므로
             그 계산이 필요 없다. */
          <div className="bg-surface rounded-2xl border border-line overflow-hidden divide-y divide-line">
            {records.map((r) => (
              <div
                key={r.id}
                className={`flex items-start gap-3 px-4 py-3.5 ${
                  !r.read ? "bg-brand/5" : ""
                }`}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-canvas"
                >
                  <Bell
                    className={`w-4 h-4 ${
                      r.type === "dropoff"
                        ? "text-brand"
                        : r.type === "arrival"
                        ? "text-emerald-600"
                        : "text-amber-600"
                    }`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-ink">{r.title}</p>
                    {!r.read && <span className="w-2 h-2 rounded-full bg-brand shrink-0" />}
                  </div>
                  <p className="text-xs text-muted mt-0.5 leading-relaxed">{r.body}</p>
                  <p className="text-[11px] text-faint mt-1">{r.time}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

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
}: {
  alert: AlertSetting;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="px-4 py-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-ink">{alert.routeName}</span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                alert.active ? "bg-canvas text-brand" : "bg-canvas text-faint"
              }`}
            >
              {alert.active ? "활성" : "꺼짐"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <MapPin className="w-3 h-3" />
            <span className="font-medium text-muted">{alert.targetStation}</span>
            <span className="text-faint">하차</span>
          </div>
        </div>
        <Toggle checked={alert.active} onChange={onToggle} />
      </div>

      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-line">
        <span className="flex items-center gap-1 text-xs text-muted">
          <MapPin className="w-3.5 h-3.5 text-brand" />
          <span className="tabular-nums">{alert.stopsBefore}정거장 전</span>
        </span>
        <div className="flex items-center gap-2 ml-auto">
          {alert.sound && <Volume2 className="w-3.5 h-3.5 text-faint" />}
          {alert.vibrate && <Vibrate className="w-3.5 h-3.5 text-faint" />}
          <button
            onClick={onRemove}
            className="select-none touch-manipulation text-faint active:text-red-500 transition-colors ml-1"
          >
            <Trash2 className="w-4 h-4" />
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
  const [step, setStep] = useState<"route" | "stop" | "options">("route");
  const [query, setQuery] = useState("");
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [selectedStop, setSelectedStop] = useState<BusStop | null>(null);
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
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl">
        <div className="px-5 py-4 border-b border-line sticky top-0 bg-surface z-10 flex items-center gap-2">
          {step !== "route" && (
            <button
              onClick={() => {
                if (step === "options") setStep("stop");
                else {
                  setStep("route");
                  setSelectedRoute(null);
                  setSelectedStop(null);
                }
              }}
              className="select-none touch-manipulation p-1 -ml-1 rounded-full active:bg-canvas"
            >
              <ArrowLeft className="w-5 h-5 text-muted" />
            </button>
          )}
          <h2 className="text-lg font-bold text-ink">
            {step === "route" && "노선 선택"}
            {step === "stop" && "하차 정류장 선택"}
            {step === "options" && "알림 설정"}
          </h2>
        </div>

        {step === "route" && (
          <div className="px-4 py-3">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="노선번호 검색"
                className="w-full pl-9 pr-9 py-2.5 bg-canvas rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-brand"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="select-none touch-manipulation absolute right-3 top-1/2 -translate-y-1/2"
                >
                  <X className="w-4 h-4 text-faint" />
                </button>
              )}
            </div>
            {routesStatus === "loading" && (
              /* 값이 들어올 때 목록이 튀지 않도록 완성된 모양과 같게 깔아 둔다. */
              <div className="bg-surface rounded-2xl border border-line overflow-hidden divide-y divide-line">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="px-3 py-3 flex items-center gap-3">
                    <LoadingSkeleton className="w-11 h-11 shrink-0" />
                    <LoadingSkeleton className="h-4 flex-1" />
                  </div>
                ))}
              </div>
            )}
            {routesStatus === "success" && (
              <div className="bg-surface rounded-2xl border border-line overflow-hidden divide-y divide-line max-h-[50vh] overflow-y-auto">
                {filteredRoutes.map((route) => {
                  const isMain = isMainRoute(route.name);
                  return (
                  <button
                    key={`${route.id}-${route.number}`}
                    onClick={() => {
                      setSelectedRoute(route);
                      setStep("stop");
                    }}
                    className="w-full flex items-center gap-3 px-3 py-3 text-left select-none touch-manipulation transition-colors duration-75 active:bg-canvas"
                  >
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                        isMain ? "bg-blue-500" : "bg-emerald-500"
                      }`}
                    >
                      <span className="text-white font-bold text-xs">{route.number}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {route.name || `${route.number}번`}
                      </p>
                      <p className="text-[11px] text-faint truncate">
                        {route.start} → {route.end}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-faint" />
                  </button>
                  );
                })}
                {filteredRoutes.length === 0 && (
                  <p className="text-sm text-faint text-center py-8">검색 결과가 없어요</p>
                )}
              </div>
            )}
          </div>
        )}

        {step === "stop" && (
          <div className="px-4 py-3">
            <p className="text-xs text-faint mb-2">
              {selectedRoute?.name || selectedRoute?.number} · 내릴 정류장을 고르세요
            </p>
            {stopsStatus === "loading" && (
              <div className="bg-surface rounded-2xl border border-line overflow-hidden divide-y divide-line">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="px-3 py-3 flex items-center gap-3">
                    <LoadingSkeleton className="w-7 h-7 shrink-0 rounded-full" />
                    <LoadingSkeleton className="h-4 flex-1" />
                  </div>
                ))}
              </div>
            )}
            {stopsStatus === "success" && stops && (
              <div className="bg-surface rounded-2xl border border-line overflow-hidden divide-y divide-line max-h-[55vh] overflow-y-auto">
                {stops.map((stop) => (
                  <button
                    key={`${stop.order}-${stop.id}`}
                    onClick={() => {
                      setSelectedStop(stop);
                      setStep("options");
                    }}
                    className="w-full flex items-center gap-3 px-3 py-3 text-left select-none touch-manipulation transition-colors duration-75 active:bg-canvas"
                  >
                    <span className="text-[11px] text-faint w-6 shrink-0">{stop.order}</span>
                    <span className="text-sm font-medium text-ink flex-1">{stop.name}</span>
                    <ChevronRight className="w-4 h-4 text-faint" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === "options" && selectedRoute && selectedStop && (
          <div className="px-5 py-5 space-y-5">
            <div className="bg-canvas rounded-xl p-3">
              <p className="text-sm font-semibold text-ink">
                {selectedRoute.name || `${selectedRoute.number}번`}
              </p>
              <p className="text-xs text-muted mt-0.5">
                하차: {selectedStop.name}
                {targetIndex >= 0 && ` (${targetIndex + 1}번째 정류장)`}
              </p>
            </div>

            <div>
              <label className="text-xs font-medium text-muted mb-1.5 block">
                몇 정거장 전에 알릴까요?
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setStopsBefore((s) => Math.max(1, s - 1))}
                  disabled={stopsBeforeDisabled}
                  className="select-none touch-manipulation w-10 h-10 rounded-xl bg-canvas flex items-center justify-center text-lg font-bold disabled:opacity-40"
                >
                  -
                </button>
                <span className="flex-1 text-center font-bold text-ink text-lg">
                  {stopsBefore}정거장 전
                </span>
                <button
                  onClick={() => setStopsBefore((s) => Math.min(stopsBeforeMax, s + 1))}
                  disabled={stopsBeforeDisabled || stopsBefore >= stopsBeforeMax}
                  className="select-none touch-manipulation w-10 h-10 rounded-xl bg-canvas flex items-center justify-center text-lg font-bold disabled:opacity-40"
                >
                  +
                </button>
              </div>
              {stopNotFound ? (
                <p className="text-[11px] text-red-500 mt-1.5">
                  이 정류장의 위치 정보를 확인하지 못했어요. 다른 정류장을 골라주세요.
                </p>
              ) : isFirstStopOfRoute ? (
                <p className="text-[11px] text-amber-600 mt-1.5">
                  이 정류장은 노선의 첫 정류장이라 하차 알림을 설정할 수 없어요. 다른 정류장을 골라주세요.
                </p>
              ) : (
                stopsBeforeMax < 10 && (
                  <p className="text-[11px] text-faint mt-1.5">
                    선택한 정류장 앞에 정거장이 {stopsBeforeMax}개뿐이라 최대 {stopsBeforeMax}정거장 전까지 설정할 수 있어요
                  </p>
                )
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between py-2">
                <span className="flex items-center gap-2 text-sm text-muted">
                  <Volume2 className="w-4 h-4 text-faint" />
                  소리 알림
                </span>
                <Toggle checked={sound} onChange={setSound} />
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="flex items-center gap-2 text-sm text-muted">
                  <Vibrate className="w-4 h-4 text-faint" />
                  진동 알림
                </span>
                <Toggle checked={vibrate} onChange={setVibrate} />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={onClose}
                className="select-none touch-manipulation flex-1 py-3 bg-canvas text-muted rounded-2xl font-medium text-sm"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={stopsBeforeDisabled}
                className="select-none touch-manipulation flex-1 py-3 bg-brand text-white rounded-2xl font-semibold text-sm disabled:opacity-40"
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
