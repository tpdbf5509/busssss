import { useEffect, useRef } from "react";
import { useApp } from "@/store/appContext";
import { checkDropoffAlerts } from "@/services/alertMonitorService";

const INTERVAL_MS = 20000; // 20초마다 검사

export function useDropoffAlertMonitor() {
  const { state, dispatch } = useApp();
  const running = useRef(false);

  useEffect(() => {
    const activeCount = state.alerts.filter((a) => a.active).length;
    if (activeCount === 0) return;

    let cancelled = false;

    const tick = async () => {
      if (running.current || cancelled) return;
      running.current = true;
      try {
        const { releases } = await checkDropoffAlerts(state.alerts);
        // 차량 고정을 푼 결과는 이 검사가 취소됐어도(알림 목록이 그 사이 바뀜)
        // 반영한다. 안내 기록은 이미 저장됐으므로, 반영하지 않으면 다음 검사에서
        // 같은 알림을 또 풀며 기록이 겹친다. 그 사이 사용자가 버스를 새로
        // 골랐으면 reducer가 고정 값을 비교해 무시한다.
        for (const r of releases) {
          dispatch({
            type: "RELEASE_ALERT_VEHICLE",
            id: r.alertId,
            vehicleNo: r.vehicleNo,
            boundAt: r.boundAt,
          });
        }
      } catch (e) {
        console.warn("[AlertMonitor]", e);
      } finally {
        running.current = false;
      }
    };

    tick(); // 즉시 한 번
    const id = setInterval(tick, INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [state.alerts, dispatch]);
}