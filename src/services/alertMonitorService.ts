import { fetchBusLocations } from "@/services/busLocationService";
import { fetchAllRoutes, fetchStopsForRoute } from "@/services/routeService";
import { indexOfStopByOrder } from "@/lib/stopPosition";
import {
  alertVehicleMode,
  evaluateDropoffAlert,
  isBindingExpired,
  vehicleLabel,
  VEHICLE_BIND_MAX_MS,
  VEHICLE_LOST_RELEASE_MS,
  type VehicleReleaseReason,
} from "@/lib/dropoffAlert";
import type { AlertSetting, AlertRecord } from "@/types";
import type { Route } from "@/types/route";

/**
 * 예외 로그 레벨 기준 (이 저장소 공통).
 *
 * - `console.warn` — 사용자의 데이터가 유실됐거나 저장되지 않은 경우.
 *   예: localStorage 읽기/쓰기 실패(용량 초과, 사파리 프라이빗 모드).
 *   조용히 넘어가면 사용자는 설정이 사라진 이유를 알 수 없다.
 * - `console.debug` — 환경에 따라 실패하는 게 정상인 best-effort 호출, 또는
 *   주기적으로 재시도되는 작업. 예: 오디오/진동/알림 API, 20초 폴링의 네트워크
 *   실패. warn으로 올리면 콘솔이 잠겨 진짜 문제가 묻힌다.
 * - 사용자가 지금 한 동작이 실패한 경우는 로그가 아니라 토스트/에러 상태로
 *   화면에 알린다.
 *
 * 빈 `catch {}`는 쓰지 않는다. 최소한 위 중 하나로 흔적을 남긴다.
 */

const FIRED_KEY = "busssss_alert_fired_v1";
const RECORDS_KEY = "busssss_alert_records_v1";
/**
 * 차량을 고정한 알림마다 그 차량을 위치 목록에서 마지막으로 본 시각.
 * 고정 해제 조건 (b) "30분 넘게 안 보임"을 재려고 둔다. 알림 설정
 * (busssss_alerts_v1)에 넣지 않는 이유: 20초마다 바뀌는 값이라, 넣으면 알림
 * 목록이 바뀔 때마다 검사가 처음부터 다시 돌아 위치 조회가 늘어난다.
 * 메모리에만 두지 않는 이유: 홈 화면 앱이 백그라운드에서 내려갔다 다시 열리면
 * 값이 사라져, "사라진 지"를 "고정한 지"로 잘못 재게 된다.
 * 키는 `알림ID|고정시각`이라 새로 고정하면 예전 값을 쓰지 않는다.
 */
const VEHICLE_SEEN_KEY = "busssss_alert_vehicle_seen_v1";

let alarmTimer: number | null = null;
let alarmContext: AudioContext | null = null;

/**
 * 이미 울린 알림 (alertId + vehicleNo) 중복 방지.
 * 예전에는 모든 알림이 이 모양이었다. 지금 차량을 고정한 알림은 고정 시각도
 * 키에 넣는다(lib/dropoffAlert.ts). 모든 차량 기준 알림은 예전 모양 그대로다.
 */
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

function loadVehicleSeen(): Record<string, number> {
  try {
    const raw = localStorage.getItem(VEHICLE_SEEN_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, number>;
      }
    }
  } catch (err) {
    console.warn("[alertMonitorService] 고정 차량 확인 기록 로드 실패:", err);
  }
  return {};
}

function saveVehicleSeen(seen: Record<string, number>) {
  try {
    localStorage.setItem(VEHICLE_SEEN_KEY, JSON.stringify(seen));
  } catch (err) {
    console.warn("[alertMonitorService] 고정 차량 확인 기록 저장 실패:", err);
  }
}

function vehicleSeenKey(alert: AlertSetting): string {
  return `${alert.id}|${alert.boundAt}`;
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

/** 차량 고정을 푼 결과. 화면 상태(알림 목록)에 반영하는 것은 호출부 몫이다. */
export interface VehicleRelease {
  alertId: string;
  /** 풀기 전 고정 값. 그 사이 사용자가 새로 고정했으면 reducer가 무시하는 데 쓴다. */
  vehicleNo: string;
  boundAt: number | undefined;
  reason: VehicleReleaseReason;
}

export interface DropoffCheckResult {
  /** 이번 검사에서 새로 저장한 알림 기록 */
  records: AlertRecord[];
  /** 이번 검사에서 고정을 푼 알림. 다음 탑승 때 다시 고르기를 기다리게 된다. */
  releases: VehicleRelease[];
}

function recordTime(): string {
  return new Date().toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function newRecordId(): string {
  return `ar_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * (b)(c)로 고정이 풀렸다는 안내 기록. 이때는 알람이 울리지 않았으니, 왜 이
 * 알림이 다음부터 울리지 않는지 알림 센터에 남긴다(홈 종 버튼의 빨간 점도
 * 켜진다). (a)는 하차 알람 기록이 이미 남아 따로 만들지 않는다 — 알림
 * 카드에 "다시 골라 주세요" 안내가 보인다.
 */
function releaseRecord(alert: AlertSetting, reason: "lost" | "expired"): AlertRecord {
  const vehicle = vehicleLabel(alert.vehicleNo ?? "");
  const what = `${alert.routeNumber ? `${alert.routeNumber}번` : alert.routeName} ${alert.targetStation} 하차 알림`;
  const why =
    reason === "lost"
      ? `${vehicle}이 ${Math.round(VEHICLE_LOST_RELEASE_MS / 60000)}분 넘게 보이지 않아 고정을 풀었어요.`
      : `${vehicle}을 고정한 지 ${Math.round(VEHICLE_BIND_MAX_MS / 3600000)}시간이 지나 고정을 풀었어요.`;
  return {
    id: newRecordId(),
    title: "탈 버스를 다시 골라 주세요",
    body: `${why} ${what}은 다음에 탈 버스를 고르면 다시 울려요.`,
    time: recordTime(),
    read: false,
    type: "system",
  };
}

/**
 * 활성 하차 알림을 한 번 검사하고, 조건이 맞으면 알림을 울립니다.
 * 반환값: 새로 추가된 AlertRecord[]와 고정을 푼 알림 목록.
 * (예전 반환값은 AlertRecord[]뿐이었다. 차량 고정을 풀려면 알림 설정을
 * 바꿔야 하는데, 설정은 화면 상태(reducer)가 저장하므로 결과로 돌려준다.)
 *
 * 차량을 고정한 알림은 그 차량만 본다(lib/dropoffAlert.ts). 고정이 풀려
 * 다시 고르기를 기다리는 알림은 검사하지 않는다 — 위치 조회도 하지 않는다.
 */
export async function checkDropoffAlerts(
  alerts: AlertSetting[]
): Promise<DropoffCheckResult> {
  const now = Date.now();
  const newRecords: AlertRecord[] = [];
  const releases: VehicleRelease[] = [];
  const seen = loadVehicleSeen();

  const release = (alert: AlertSetting, reason: VehicleReleaseReason) => {
    releases.push({
      alertId: alert.id,
      vehicleNo: alert.vehicleNo ?? "",
      boundAt: alert.boundAt,
      reason,
    });
    if (reason !== "fired") newRecords.push(releaseRecord(alert, reason));
  };

  // (c) 고정한 지 오래된 알림은 위치 조회가 되든 안 되든 먼저 푼다. 시간만
  // 보는 조건이라 조회 실패로 미룰 이유가 없다.
  const active: AlertSetting[] = [];
  for (const a of alerts) {
    if (!a.active || alertVehicleMode(a) === "awaiting") continue;
    if (isBindingExpired(a, now)) {
      release(a, "expired");
      continue;
    }
    active.push(a);
  }

  if (active.length > 0) {
    await checkActiveAlerts(active, now, seen, newRecords, release);
  }

  // 지금 고정돼 있는 알림의 확인 기록만 남긴다. 풀렸거나 지운 알림의 값은
  // 다시 쓰이지 않는다(새로 고정하면 키가 달라짐).
  const released = new Set(releases.map((r) => r.alertId));
  const keep = new Set(
    alerts
      .filter((a) => alertVehicleMode(a) === "bound" && !released.has(a.id))
      .map(vehicleSeenKey),
  );
  const nextSeen: Record<string, number> = {};
  for (const [key, at] of Object.entries(seen)) {
    if (keep.has(key)) nextSeen[key] = at;
  }
  if (Object.keys(nextSeen).length > 0 || Object.keys(seen).length > 0) {
    saveVehicleSeen(nextSeen);
  }

  if (newRecords.length > 0) {
    const prev = loadAlertRecords();
    saveAlertRecords([...newRecords, ...prev]);
  }

  return { records: newRecords, releases };
}

async function checkActiveAlerts(
  active: AlertSetting[],
  now: number,
  seen: Record<string, number>,
  newRecords: AlertRecord[],
  release: (alert: AlertSetting, reason: VehicleReleaseReason) => void,
) {
  const routes = await fetchAllRoutes();
  const routeMap = new Map<string, Route>();
  for (const r of routes) {
    routeMap.set(r.id, r);
  }

  const fired = loadFired();

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
    } catch (err) {
      // 20초마다 재시도하므로 warn으로 올리면 콘솔이 잠긴다. 다만 완전히
      // 삼키면 알림이 계속 안 울릴 때 단서가 없어 debug로 흔적만 남긴다.
      // 조회가 실패한 동안은 고정 차량이 "사라졌다"고 보지 않는다(b).
      console.debug(`[alertMonitorService] ${route.number}번 실시간 위치 조회 실패:`, err);
      continue;
    }

    // "N정거장 전"은 순번(sequence_no) 뺄셈이 아니라 정류장 목록에서의 위치로
    // 계산해야 한다. 순번에는 구멍이 있어서 뺄셈 결과가 실제 정거장 수와 다르다
    // (stopPosition.ts 주석 참고). 목록은 routeService에서 캐시되므로 폴링마다
    // 새로 받아오지 않는다.
    let stops;
    try {
      stops = await fetchStopsForRoute(route);
    } catch (err) {
      console.debug(`[alertMonitorService] ${route.number}번 정류장 목록 조회 실패:`, err);
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

      // 차량 반복문(구간 판정, 중복 방지 키, 다시 무장)은 lib/dropoffAlert.ts로
      // 설명 주석과 함께 옮겼다. 차량을 고정한 알림은 거기서 그 차량만 본다.
      const seenKey = vehicleSeenKey(alert);
      const decision = evaluateDropoffAlert({
        alert,
        stops,
        targetIndex,
        locations,
        fired,
        today,
        now,
        lastSeenAt: seen[seenKey],
        onOrderFallback: (bus, resolvedBy, stopName) => {
          console.debug(
            `[alertMonitorService] 버스 ${bus.vehicleNo} 위치를 nodeOrder(${bus.nodeOrder})로 환산했습니다 ` +
              `(${resolvedBy}, 정류장 ID 없음 → ${stopName}).`,
          );
        },
      });
      if (decision.boundSeen) seen[seenKey] = now;

      for (const { bus, stopsRemaining } of decision.fires) {
        // 폴링 사이에 버스가 목표 정류장까지 통째로 지나쳤으면 stopsRemaining이
        // 0 이하가 된다. 그대로 표시하면 "약 -2정거장"처럼 나오므로 문구를 분기한다.
        const title = "하차 알람";
        const body =
          stopsRemaining > 0
            ? `${alert.routeName} · ${bus.nodeName} 부근\n${alert.targetStation} 하차까지 약 ${stopsRemaining}정거장`
            : `${alert.routeName} · ${bus.nodeName} 부근\n${alert.targetStation} 정류장에 이미 도착했거나 지나쳤을 수 있어요`;

        if (alert.sound) startDropoffAlarm(title, body);
        if (alert.vibrate) vibrate();
        await showBrowserNotification(title, body);

        const record: AlertRecord = {
          id: newRecordId(),
          title,
          // 팝업(body)과 같은 값을 쓴다. 설정값(stopsBefore)을 그대로 저장하면
          // 나중에 기록을 봤을 때 실제 울린 시점과 숫자가 어긋난다.
          body:
            stopsRemaining > 0
              ? `${alert.routeName} 버스가 ${alert.targetStation} 정류장에 ${stopsRemaining}정거장 전입니다. (${bus.nodeName})`
              : `${alert.routeName} 버스가 ${alert.targetStation} 정류장에 이미 도착했거나 지나쳤을 수 있어요. (${bus.nodeName})`,
          time: recordTime(),
          read: false,
          type: "dropoff",
        };
        newRecords.push(record);
      }

      if (decision.release) release(alert, decision.release);
    }
  }

  saveFired(fired);
}
