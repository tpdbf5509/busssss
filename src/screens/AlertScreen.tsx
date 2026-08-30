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
    <div className="bg-slate-50">
      <header className="bg-white px-5 pt-safe-16 pb-5 border-b border-slate-100 sticky top-0 z-30 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">알림</h1>
            <p className="text-xs text-slate-400 mt-0.5">하차 알림 · 알림 센터</p>
          </div>
          <button
            onClick={markAllRead}
            className="text-xs text-blue-600 font-medium hover:underline"
          >
            모두 읽음
          </button>
        </div>
      </header>
        {notifPermission !== "granted" && (
          <div className="mx-4 mt-4 p-4 bg-white border border-slate-100 rounded-2xl flex items-center justify-between gap-3 shadow-sm">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-xs text-slate-500 leading-relaxed pt-1">
                실제 하차 알림을 받으려면 브라우저 알림 권한이 필요해요.
              </p>
            </div>
            <button
              onClick={handleRequestPermission}
              className="shrink-0 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-full transition-colors"
            >
              허용하기
            </button>
          </div>
        )}

      <section className="px-4 pt-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-700">하차 알림 설정</h2>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 text-xs text-blue-600 font-medium bg-blue-50 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            추가
          </button>
        </div>

        {state.alerts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-6 text-center">
            <Bell className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">설정된 하차 알림이 없어요</p>
            <button
              onClick={() => setShowAdd(true)}
              className="mt-3 text-sm text-blue-600 font-medium hover:underline"
            >
              알림 설정하기
            </button>
          </div>
        ) : (
          <div className="space-y-2">
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
        <h2 className="text-sm font-bold text-slate-700 mb-3">알림 센터</h2>
        {records.length === 0 ? (
          <EmptyState icon={BellIcon} title="알림이 없어요" />
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            {records.map((r, i) => (
              <div
                key={r.id}
                className={`flex items-start gap-3 px-4 py-3.5 ${
                  i !== records.length - 1 ? "border-b border-slate-50" : ""
                } ${!r.read ? "bg-blue-50/40" : ""}`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    r.type === "dropoff"
                      ? "bg-blue-50"
                      : r.type === "arrival"
                      ? "bg-emerald-50"
                      : "bg-amber-50"
                  }`}
                >
                  <Bell
                    className={`w-4 h-4 ${
                      r.type === "dropoff"
                        ? "text-blue-600"
                        : r.type === "arrival"
                        ? "text-emerald-600"
                        : "text-amber-600"
                    }`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-800">{r.title}</p>
                    {!r.read && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{r.body}</p>
                  <p className="text-[11px] text-slate-300 mt-1">{r.time}</p>
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
    <div className="bg-white rounded-2xl p-4 border border-slate-100">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-slate-900">{alert.routeName}</span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                alert.active ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-400"
              }`}
            >
              {alert.active ? "활성" : "꺼짐"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <MapPin className="w-3 h-3" />
            <span className="font-medium text-slate-600">{alert.targetStation}</span>
            <span className="text-slate-300">하차</span>
          </div>
        </div>
        <Toggle checked={alert.active} onChange={onToggle} />
      </div>

      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-50">
        <span className="flex items-center gap-1 text-xs text-slate-500">
          <MapPin className="w-3.5 h-3.5 text-blue-500" />
          {alert.stopsBefore}정거장 전
        </span>
        <div className="flex items-center gap-2 ml-auto">
          {alert.sound && <Volume2 className="w-3.5 h-3.5 text-slate-400" />}
          {alert.vibrate && <Vibrate className="w-3.5 h-3.5 text-slate-400" />}
          <button
            onClick={onRemove}
            className="text-slate-300 hover:text-red-500 transition-colors ml-1"
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
  const isFirstStopOfRoute = selectedStop != null && stops != null && stopsBeforeMax === 0;

  useEffect(() => {
    if (stopsBeforeMax > 0) {
      setStopsBefore((s) => Math.min(s, stopsBeforeMax));
    }
  }, [stopsBeforeMax]);

  const handleSave = () => {
    if (!selectedRoute || !selectedStop) return;
    // 첫 정류장은 "N정거장 전"이 성립하지 않아 저장해도 절대 울리지 않는다.
    if (isFirstStopOfRoute) return;
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
      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl">
        <div className="px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10 flex items-center gap-2">
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
              className="p-3 -ml-3 rounded-full hover:bg-slate-100"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
          )}
          <h2 className="text-lg font-bold text-slate-900">
            {step === "route" && "노선 선택"}
            {step === "stop" && "하차 정류장 선택"}
            {step === "options" && "알림 설정"}
          </h2>
        </div>

        {step === "route" && (
          <div className="px-4 py-3">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="노선번호 검색"
                className="w-full pl-9 pr-9 py-2.5 bg-slate-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-2"
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              )}
            </div>
            {routesStatus === "loading" && (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <LoadingSkeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            )}
            {routesStatus === "success" && (
              <div className="space-y-1 max-h-[50vh] overflow-y-auto">
                {filteredRoutes.map((route) => (
                  <button
                    key={`${route.id}-${route.number}`}
                    onClick={() => {
                      setSelectedRoute(route);
                      setStep("stop");
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 text-left"
                  >
                    <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                      <span className="text-blue-700 font-bold text-xs">{route.number}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">
                        {route.name || `${route.number}번`}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {route.start} → {route.end}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </button>
                ))}
                {filteredRoutes.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-8">검색 결과가 없어요</p>
                )}
              </div>
            )}
          </div>
        )}

        {step === "stop" && (
          <div className="px-4 py-3">
            <p className="text-xs text-slate-400 mb-2">
              {selectedRoute?.name || selectedRoute?.number} · 내릴 정류장을 고르세요
            </p>
            {stopsStatus === "loading" && (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <LoadingSkeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            )}
            {stopsStatus === "success" && stops && (
              <div className="space-y-1 max-h-[55vh] overflow-y-auto">
                {stops.map((stop) => (
                  <button
                    key={`${stop.order}-${stop.id}`}
                    onClick={() => {
                      setSelectedStop(stop);
                      setStep("options");
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 text-left"
                  >
                    <span className="text-[11px] text-slate-400 w-6 shrink-0">{stop.order}</span>
                    <span className="text-sm font-medium text-slate-800 flex-1">{stop.name}</span>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === "options" && selectedRoute && selectedStop && (
          <div className="px-5 py-5 pb-safe-5 space-y-5">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-sm font-semibold text-slate-800">
                {selectedRoute.name || `${selectedRoute.number}번`}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                하차: {selectedStop.name}
                {targetIndex >= 0 && ` (${targetIndex + 1}번째 정류장)`}
              </p>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 mb-1.5 block">
                몇 정거장 전에 알릴까요?
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setStopsBefore((s) => Math.max(1, s - 1))}
                  disabled={isFirstStopOfRoute}
                  className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-lg font-bold disabled:opacity-40"
                >
                  -
                </button>
                <span className="flex-1 text-center font-bold text-slate-900 text-lg">
                  {stopsBefore}정거장 전
                </span>
                <button
                  onClick={() => setStopsBefore((s) => Math.min(stopsBeforeMax, s + 1))}
                  disabled={isFirstStopOfRoute || stopsBefore >= stopsBeforeMax}
                  className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-lg font-bold disabled:opacity-40"
                >
                  +
                </button>
              </div>
              {isFirstStopOfRoute ? (
                <p className="text-[11px] text-amber-600 mt-1.5">
                  이 정류장은 노선의 첫 정류장이라 하차 알림을 설정할 수 없어요. 다른 정류장을 골라주세요.
                </p>
              ) : (
                stopsBeforeMax < 10 && (
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    선택한 정류장 앞에 정거장이 {stopsBeforeMax}개뿐이라 최대 {stopsBeforeMax}정거장 전까지 설정할 수 있어요
                  </p>
                )
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between py-2">
                <span className="flex items-center gap-2 text-sm text-slate-700">
                  <Volume2 className="w-4 h-4 text-slate-400" />
                  소리 알림
                </span>
                <Toggle checked={sound} onChange={setSound} />
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="flex items-center gap-2 text-sm text-slate-700">
                  <Vibrate className="w-4 h-4 text-slate-400" />
                  진동 알림
                </span>
                <Toggle checked={vibrate} onChange={setVibrate} />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={onClose}
                className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-medium text-sm"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={isFirstStopOfRoute}
                className="flex-1 py-3 bg-blue-600 text-white rounded-2xl font-semibold text-sm disabled:opacity-40"
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
