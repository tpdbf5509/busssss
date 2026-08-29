import { useEffect, useRef } from "react";
import { useApp } from "@/store/appContext";
import { checkDropoffAlerts } from "@/services/alertMonitorService";

const INTERVAL_MS = 20000; // 20초마다 검사

export function useDropoffAlertMonitor() {
  const { state } = useApp();
  const running = useRef(false);

  useEffect(() => {
    const activeCount = state.alerts.filter((a) => a.active).length;
    if (activeCount === 0) return;

    let cancelled = false;

    const tick = async () => {
      if (running.current || cancelled) return;
      running.current = true;
      try {
        await checkDropoffAlerts(state.alerts);
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
  }, [state.alerts]);
}