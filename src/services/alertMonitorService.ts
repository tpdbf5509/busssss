import { fetchBusLocations } from "@/services/busLocationService";
import { fetchAllRoutes } from "@/services/routeService";
import type { AlertSetting, AlertRecord } from "@/types";
import type { Route } from "@/types/route";

const FIRED_KEY = "busssss_alert_fired_v1";
const RECORDS_KEY = "busssss_alert_records_v1";

/** 이미 울린 알림 (alertId + vehicleNo) 중복 방지 */
function loadFired(): Set<string> {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set();
}

function saveFired(set: Set<string>) {
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify([...set].slice(-200)));
  } catch {}
}

export function loadAlertRecords(): AlertRecord[] {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function saveAlertRecords(records: AlertRecord[]) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records.slice(0, 50)));
  } catch {}
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
  } catch {}
}

function vibrate() {
  try {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  } catch {}
}

async function showBrowserNotification(title: string, body: string) {
  if (!("Notification" in window)) return;

  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
  if (Notification.permission !== "granted") return;

  try {
    new Notification(title, {
      body,
      icon: "/favicon.ico",
      tag: "bus-dropoff",
      requireInteraction: true,
    });
  } catch {}
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

/**
 * 활성 하차 알림을 한 번 검사하고, 조건이 맞으면 알림을 울립니다.
 * 반환값: 새로 추가된 AlertRecord[]
 */
export async function checkDropoffAlerts(
  alerts: AlertSetting[]
): Promise<AlertRecord[]> {
  const active = alerts.filter((a) => a.active);
  if (active.length === 0) return [];

  const routes = await fetchAllRoutes();
  const routeMap = new Map<string, Route>();
  for (const r of routes) {
    routeMap.set(r.id, r);
  }

  const fired = loadFired();
  const newRecords: AlertRecord[] = [];

  // 노선별로 그룹핑해서 API 호출 최소화
  const byRoute = new Map<string, AlertSetting[]>();
  for (const a of active) {
    const list = byRoute.get(a.routeId) ?? [];
    list.push(a);
    byRoute.set(a.routeId, list);
  }

  for (const [routeId, routeAlerts] of byRoute) {
    const route = routeMap.get(routeId);
    if (!route) continue;

    let locations;
    try {
      locations = await fetchBusLocations(route);
    } catch {
      continue;
    }

    for (const alert of routeAlerts) {
      const triggerOrder = alert.targetStopOrder - alert.stopsBefore;
      if (triggerOrder < 1) continue;

      for (const bus of locations) {
        // 목표 정류장 이전 구간에서, 트리거 순서 이상이면 알림
        if (
          bus.nodeOrder >= triggerOrder &&
          bus.nodeOrder < alert.targetStopOrder
        ) {
          const key = `${alert.id}_${bus.vehicleNo}`;
          if (fired.has(key)) continue;

          fired.add(key);

          const title = "하차 알림";
          const body = `${alert.routeName} · ${bus.nodeName} 부근\n${alert.targetStation} 하차까지 약 ${alert.targetStopOrder - bus.nodeOrder}정거장`;

          if (alert.sound) playBeep();
          if (alert.vibrate) vibrate();
          await showBrowserNotification(title, body);

          const record: AlertRecord = {
            id: `ar_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            title,
            body: `${alert.routeName} 버스가 ${alert.targetStation} 정류장에 ${alert.stopsBefore}정거장 전입니다. (${bus.nodeName})`,
            time: new Date().toLocaleString("ko-KR", {
              month: "numeric",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
            read: false,
            type: "dropoff",
          };
          newRecords.push(record);
        }
      }
    }
  }

  saveFired(fired);

  if (newRecords.length > 0) {
    const prev = loadAlertRecords();
    saveAlertRecords([...newRecords, ...prev]);
  }

  return newRecords;
}