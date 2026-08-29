import { fetchBusLocations } from "@/services/busLocationService";
import { fetchAllRoutes, fetchStopsForRoute } from "@/services/routeService";
import { indexOfStopByOrder, resolveBusStopIndex } from "@/lib/stopPosition";
import type { AlertSetting, AlertRecord } from "@/types";
import type { Route } from "@/types/route";

const FIRED_KEY = "busssss_alert_fired_v1";
const RECORDS_KEY = "busssss_alert_records_v1";

let alarmTimer: number | null = null;
let alarmContext: AudioContext | null = null;

/** 이미 울린 알림 (alertId + vehicleNo) 중복 방지 */
function loadFired(): Set<string> {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch (err) {
    console.warn("[alertMonitorService] 중복 방지 기록 로드 실패:", err);
  }
  return new Set();
}

function saveFired(set: Set<string>) {
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify([...set].slice(-200)));
  } catch (err) {
    console.warn("[alertMonitorService] 중복 방지 기록 저장 실패:", err);
  }
}

export function loadAlertRecords(): AlertRecord[] {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn("[alertMonitorService] 알림 기록 로드 실패:", err);
  }
  return [];
}

export function saveAlertRecords(records: AlertRecord[]) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records.slice(0, 50)));
  } catch (err) {
    console.warn("[alertMonitorService] 알림 기록 저장 실패:", err);
  }
}

function playAlarmPattern() {
  try {
    const AudioContextClass =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!alarmContext) alarmContext = new AudioContextClass();
    if (alarmContext.state === "suspended") alarmContext.resume().catch(() => {});

    const start = alarmContext.currentTime;
    const beepLength = 0.28;
    const gap = 0.16;

    // 시계 알람처럼 띠링-띠링-띠링 3회
    for (let i = 0; i < 3; i += 1) {
      const offset = i * (beepLength + gap);
      const osc = alarmContext.createOscillator();
      const gain = alarmContext.createGain();
      osc.connect(gain);
      gain.connect(alarmContext.destination);
      osc.frequency.setValueAtTime(880, start + offset);
      osc.frequency.exponentialRampToValueAtTime(660, start + offset + beepLength);
      osc.type = "sine";
      gain.gain.setValueAtTime(0.001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.32, start + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, start + offset + beepLength);
      osc.start(start + offset);
      osc.stop(start + offset + beepLength);
    }
  } catch (err) {
    console.debug("[alertMonitorService] 알람 소리 재생 실패:", err);
  }
}

function stopAlarmSound() {
  if (alarmTimer !== null) {
    window.clearInterval(alarmTimer);
    alarmTimer = null;
  }
  try {
    alarmContext?.close();
  } catch (err) {
    console.debug("[alertMonitorService] AudioContext 종료 실패:", err);
  }
  alarmContext = null;
}

/** 현재 재생 중인 하차 알람을 중지합니다. */
export function stopDropoffAlarm() {
  stopAlarmSound();
  window.dispatchEvent(new CustomEvent("busssss:dropoff-alarm-stop"));
}

/** 하차 알람을 시작하고 UI에 알람 내용을 전달합니다. */
export function startDropoffAlarm(title: string, body: string) {
  stopAlarmSound();
  playAlarmPattern();
  alarmTimer = window.setInterval(playAlarmPattern, 1800);
  window.dispatchEvent(
    new CustomEvent("busssss:dropoff-alarm", { detail: { title, body } })
  );
}

function vibrate() {
  try {
    if (navigator.vibrate) {
      navigator.vibrate([350, 150, 350, 150, 350, 500]);
    }
  } catch (err) {
    console.debug("[alertMonitorService] 진동 실패:", err);
  }
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
  } catch (err) {
    console.warn("[alertMonitorService] 브라우저 알림 표시 실패:", err);
  }
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

    // "N정거장 전"은 순번(sequence_no) 뺄셈이 아니라 정류장 목록에서의 위치로
    // 계산해야 한다. 순번에는 구멍이 있어서 뺄셈 결과가 실제 정거장 수와 다르다
    // (stopPosition.ts 주석 참고). 목록은 routeService에서 캐시되므로 폴링마다
    // 새로 받아오지 않는다.
    let stops;
    try {
      stops = await fetchStopsForRoute(route);
    } catch {
      continue;
    }
    if (stops.length === 0) continue;

    const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD (로컬 기준)

    for (const alert of routeAlerts) {
      // 저장된 targetStopOrder는 raw sequence_no라 위치로 환산한다.
      // 노선 데이터가 갱신돼 그 순번이 사라졌으면 조용히 넘기지 않고 남긴다.
      const targetIndex = indexOfStopByOrder(stops, alert.targetStopOrder);
      if (targetIndex === -1) {
        console.warn(
          `[alertMonitorService] 알림(${alert.id})의 하차 정류장 순번 ${alert.targetStopOrder}을 ` +
            `${route.number}번 노선 정류장 목록에서 찾지 못해 건너뜁니다.`,
        );
        continue;
      }

      const triggerIndex = targetIndex - alert.stopsBefore;
      if (triggerIndex < 0) continue;

      for (const bus of locations) {
        const { index: busIndex, resolvedBy } = resolveBusStopIndex(
          stops,
          bus.nodeId,
          bus.nodeOrder,
        );
        if (busIndex === -1) continue;

        if (resolvedBy === "order") {
          // GW가 정류장 ID를 안 줘서 순번 체계가 같다는 가정에 의존한 경우다.
          // 실제 운영 데이터로 이 가정을 확인할 수 있게 흔적을 남긴다.
          console.debug(
            `[alertMonitorService] 버스 ${bus.vehicleNo} 위치를 nodeOrder(${bus.nodeOrder})로 환산했습니다 ` +
              `(정류장 ID 없음 → ${stops[busIndex].name}).`,
          );
        }

        // 상한(< targetIndex)을 두면 폴링 사이에 버스가 구간을 통째로
        // 지나쳐버렸을 때 알림이 영원히 안 울린다. 하한만 확인하고, 같은
        // 날 같은 차량에 대한 중복 발송은 아래 fired 키로 막는다.
        if (busIndex >= triggerIndex) {
          const key = `${today}_${alert.id}_${bus.vehicleNo}`;
          if (fired.has(key)) continue;

          fired.add(key);

          const title = "하차 알람";
          const body = `${alert.routeName} · ${bus.nodeName} 부근\n${alert.targetStation} 하차까지 약 ${targetIndex - busIndex}정거장`;

          if (alert.sound) startDropoffAlarm(title, body);
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
