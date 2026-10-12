import { resolveBusStopIndex, type BusPositionResolution } from "@/lib/stopPosition";
import type { AlertSetting } from "@/types";
import type { BusLocation, BusStop } from "@/types/route";

/**
 * 하차 알림 판정 (DESIGN.md 12장 "하차 알림 차량 고정").
 *
 * 화면과 저장소, 네트워크에 닿지 않는 판정만 둔다. alertMonitorService가
 * 위치·정류장을 받아 와서 여기에 넘기고, 알람·기록·저장은 그쪽이 한다.
 * 예전에는 차량 반복문이 alertMonitorService 안에 있었다. 차량 고정 판정을
 * 단위 테스트하려고 반복문을 설명 주석과 함께 그대로 옮겼다.
 *
 * ── 차량 고정 ──
 * 예전에는 노선의 모든 차량을 돌며 아무 차량이나 알림 구간에 들어오면
 * 울렸다. 차량번호는 중복 방지 키로만 썼고 "내가 탄 차량"이라는 개념이
 * 없었다. 그래서 1004번 5668번 차량을 타고 가는데 같은 노선 5670번이
 * 내릴 정류장 앞에 들어와도 울렸다. 지금은 알림을 만들 때 탄 차량을
 * 고르면(AlertSetting.vehicleNo) 그 차량만 본다. 고르지 않은 알림과 예전
 * 저장값은 지금도 모든 차량 기준이다.
 *
 * 고정은 "이번 탑승 한 번"이다. 같은 차량이 하루에 같은 노선을 여러 번
 * 돌고 다음 날에도 쓰이기 때문이다. 아래 셋 중 하나가 되면 고정을 푼다.
 *   (a) fired   — 고정한 차량으로 알림이 울렸다. 이번 탑승에서 할 일이 끝났다.
 *   (b) lost    — 고정한 차량이 위치 목록에서 VEHICLE_LOST_RELEASE_MS 넘게 안 보였다.
 *   (c) expired — 고정한 지 VEHICLE_BIND_MAX_MS가 지났다.
 * 풀린 알림은 모든 차량 기준으로 돌아가지 않는다. 다음 탑승 때 차량을 다시
 * 고를 때까지 울리지 않는다(AlertSetting.awaitingVehicle).
 */

/**
 * (b) 고정한 차량이 위치 목록에서 이만큼 안 보이면 고정을 푼다.
 * 운행을 마치고 차고지로 들어갔거나 다른 노선으로 돌았다고 본다. 위치
 * 응답이 잠깐 비는 일(노선 상세는 45초 유예)보다 훨씬 길게 잡았다.
 */
export const VEHICLE_LOST_RELEASE_MS = 30 * 60 * 1000;

/**
 * (c) 고정한 지 이만큼 지나면 고정을 푼다. 전주 시내버스 한 번 타는 시간보다
 * 넉넉히 길고, 같은 차량이 다음 운행으로 다시 오기 전에 풀리게 하려는 값이다.
 */
export const VEHICLE_BIND_MAX_MS = 3 * 60 * 60 * 1000;

export type AlertVehicleMode =
  /** 모든 차량 기준. 차량을 고르지 않았거나 예전 저장값이다. */
  | "all"
  /** 고른 차량 하나만 본다. */
  | "bound"
  /** 고정이 풀려 다음 탑승 때 다시 고르기를 기다린다. 울리지 않는다. */
  | "awaiting";

export type VehicleReleaseReason = "fired" | "lost" | "expired";

export function alertVehicleMode(alert: AlertSetting): AlertVehicleMode {
  if (typeof alert.vehicleNo === "string" && alert.vehicleNo.trim() !== "") return "bound";
  if (alert.awaitingVehicle === true) return "awaiting";
  return "all";
}

/** 차량번호 비교. 응답마다 띄어쓰기가 다르게 올 수 있어 공백을 빼고 맞춘다. */
export function isSameVehicle(a: string, b: string): boolean {
  return a.replace(/\s+/g, "") === b.replace(/\s+/g, "");
}

/**
 * 화면에 보이는 차량 이름. 숫자만 오면 "5668번 차량", "전주1309"처럼 글자가
 * 섞여 오면 그대로 "전주1309 차량"이다. 받은 번호를 자르거나 바꾸지 않는다.
 */
export function vehicleLabel(vehicleNo: string): string {
  const v = vehicleNo.trim();
  return /^\d+$/.test(v) ? `${v}번 차량` : `${v} 차량`;
}

/** (c) 고정한 지 VEHICLE_BIND_MAX_MS가 지났는지. 고정하지 않은 알림은 false. */
export function isBindingExpired(alert: AlertSetting, now: number): boolean {
  if (alertVehicleMode(alert) !== "bound") return false;
  const { boundAt } = alert;
  // 고정 시각이 없거나 깨진 값이면 언제 고정했는지 알 수 없다. 앱이 만드는
  // 값은 늘 함께 저장되지만, 그런 값이 들어오면 고정이 영원히 남지 않게
  // 지난 것으로 본다.
  if (typeof boundAt !== "number" || !Number.isFinite(boundAt)) return true;
  return now - boundAt >= VEHICLE_BIND_MAX_MS;
}

/**
 * (b) 고정한 차량이 안 보인 지 VEHICLE_LOST_RELEASE_MS가 지났는지.
 * `lastSeenAt`은 이번 고정 뒤 위치 목록에서 마지막으로 본 시각이다. 한 번도
 * 못 봤으면 고정한 시각부터 센다.
 */
export function isVehicleLost(
  alert: AlertSetting,
  lastSeenAt: number | undefined,
  now: number,
): boolean {
  const boundAt = typeof alert.boundAt === "number" ? alert.boundAt : now;
  const since = Math.max(boundAt, lastSeenAt ?? boundAt);
  return now - since >= VEHICLE_LOST_RELEASE_MS;
}

/** 알림 한 번이 울릴 근거. 알람 문구는 alertMonitorService가 만든다. */
export interface DropoffFire {
  bus: BusLocation;
  busIndex: number;
  /** 내릴 정류장까지 남은 정거장. 폴링 사이에 지나쳤으면 0 이하다. */
  stopsRemaining: number;
}

export interface DropoffDecision {
  fires: DropoffFire[];
  /** 고정을 풀어야 하면 그 이유. 풀 것이 없으면 null. */
  release: VehicleReleaseReason | null;
  /** 고정한 차량을 이번 위치 목록에서 봤는지. (b)의 마지막으로 본 시각을 고친다. */
  boundSeen: boolean;
}

export interface DropoffInput {
  alert: AlertSetting;
  /** order 오름차순 정류장 목록(fetchStopsForRoute). */
  stops: BusStop[];
  /** 하차 정류장의 목록 내 위치. -1이면 호출부가 미리 걸러야 한다. */
  targetIndex: number;
  locations: BusLocation[];
  /**
   * 이미 울린 알림 키. **이 함수가 직접 넣고 뺀다.** 예전 반복문과 같은
   * 동작이며, 호출부가 검사가 끝난 뒤 한 번에 저장한다.
   */
  fired: Set<string>;
  /** YYYY-MM-DD (로컬 기준). 중복 방지 키에 들어간다. */
  today: string;
  now: number;
  /** 이번 고정 뒤 고정 차량을 마지막으로 본 시각(ms). (b) 판정에 쓴다. */
  lastSeenAt?: number;
  /** 버스 위치를 순번으로 어림잡았을 때 남길 흔적(로그). 판정에는 쓰지 않는다. */
  onOrderFallback?: (bus: BusLocation, resolvedBy: BusPositionResolution["resolvedBy"], stopName: string) => void;
}

const NOTHING: DropoffDecision = { fires: [], release: null, boundSeen: false };

/**
 * 알림 하나를 이번 위치 목록으로 판정한다.
 *
 * - 모든 차량 기준(`all`): 예전과 똑같다. 차량마다 구간에 들어오면 울리고,
 *   중복 방지 키도 예전 모양(`날짜_알림_차량`)이다.
 * - 차량 고정(`bound`): 고정한 차량만 본다. 다른 차량은 구간에 들어와도
 *   건너뛴다. 고정한 차량이 목록에 없으면 다른 차량으로 대신하지 않는다.
 *   울리면 (a), 오래 안 보이면 (b), 오래 고정돼 있으면 (c)로 고정을 푼다.
 * - 다시 고르기 대기(`awaiting`): 아무것도 하지 않는다.
 */
export function evaluateDropoffAlert(input: DropoffInput): DropoffDecision {
  const { alert, stops, targetIndex, locations, fired, today, now, lastSeenAt } = input;
  const mode = alertVehicleMode(alert);
  if (mode === "awaiting") return NOTHING;

  let boundSeen = false;
  if (mode === "bound") {
    if (isBindingExpired(alert, now)) return { ...NOTHING, release: "expired" };
    boundSeen = locations.some((bus) => isSameVehicle(bus.vehicleNo, alert.vehicleNo!));
    if (!boundSeen) {
      // 고정한 차량이 목록에 없다. 다른 차량으로 대신하지 않고 기다린다.
      return { ...NOTHING, release: isVehicleLost(alert, lastSeenAt, now) ? "lost" : null };
    }
  }

  if (targetIndex < 0) return { ...NOTHING, boundSeen };
  const triggerIndex = targetIndex - alert.stopsBefore;
  if (triggerIndex < 0) return { ...NOTHING, boundSeen };

  const fires: DropoffFire[] = [];

  for (const bus of locations) {
    // 차량을 고정한 알림은 그 차량만 평가한다. 같은 노선의 다른 차량이
    // 구간에 들어와도 내가 탄 버스가 아니므로 울리지 않는다.
    if (mode === "bound" && !isSameVehicle(bus.vehicleNo, alert.vehicleNo!)) continue;

    const { index: busIndex, resolvedBy } = resolveBusStopIndex(
      stops,
      bus.nodeId,
      bus.nodeOrder,
      bus.nodeName,
    );
    if (busIndex === -1) continue;

    if (resolvedBy === "order" || resolvedBy === "name+order") {
      // GW가 정류장 ID를 안 줘서 순번 체계가 같다는 가정에 의존한 경우다.
      // ("name+order"는 이름이 같은 정류장이 여럿이라 순번으로 가려낸 경우)
      // 실제 운영 데이터로 이 가정을 확인할 수 있게 흔적을 남긴다.
      input.onOrderFallback?.(bus, resolvedBy, stops[busIndex].name);
    }

    // 고정한 알림은 고정 시각을 키에 더한다. 같은 날 같은 차량을 다시 골라
    // 새로 고정했는데, 앞선 고정에서 남은 키 때문에 구간 안에서 고른 경우
    // 울리지 않는 일을 막는다. 모든 차량 기준 키는 예전 모양 그대로다.
    const key =
      mode === "bound"
        ? `${today}_${alert.id}_${bus.vehicleNo}_${alert.boundAt}`
        : `${today}_${alert.id}_${bus.vehicleNo}`;

    // 이 차량이 아직 트리거 구간 앞에 있으면 발송 기록을 푼다.
    //
    // 버스는 하루에 같은 노선을 여러 번 운행한다. 날짜+알림+차량번호만으로
    // 막으면, 오전에 한 번 울린 뒤 같은 차량이 오후에 같은 구간을 다시
    // 지나가도 두 번째는 조용히 무시됐다 — 매일 켜두는 출퇴근 알림이
    // 전제인데 하루 두 번째 탑승에서 알림이 안 오는 셈이었다.
    // "구간 앞으로 돌아왔다 = 다음 운행이 시작됐다"로 보고 다시 무장한다.
    if (busIndex < triggerIndex) {
      fired.delete(key);
      continue;
    }

    // 여기부터는 버스가 트리거 구간 안에 들어온 경우다. 상한
    // (< targetIndex)은 두지 않는다 — 두면 폴링 사이에 버스가 구간을
    // 통째로 지나쳐버렸을 때 알림이 영원히 안 울린다. 한 번의 접근에
    // 대한 중복 발송은 위 fired 키가 막는다.
    if (fired.has(key)) continue;

    fired.add(key);
    fires.push({ bus, busIndex, stopsRemaining: targetIndex - busIndex });
  }

  // (a) 고정한 차량으로 울렸으면 이번 탑승은 끝났다. 바로 푼다. 내릴
  // 정류장을 실제로 지날 때까지 기다리지 않는 이유: 울린 뒤에는 이번
  // 탑승에서 더 할 일이 없고(같은 키로 다시 울리지 않음), 기다리는 동안
  // 위치가 앞뒤로 튀면 다시 무장돼 한 번 더 울릴 수 있다.
  const release = mode === "bound" && fires.length > 0 ? "fired" : null;
  return { fires, release, boundSeen };
}

/** 탄 버스 고르기 목록의 한 줄. */
export interface PickableVehicle {
  vehicleNo: string;
  /** 지금 있는 정류장 이름(위치 응답 이름, 없으면 노선 목록 이름). 모르면 빈 값. */
  stopName: string;
  /** 내릴 정류장까지 남은 정거장. 위치를 정류장 목록에서 못 찾았으면 null. */
  stopsLeft: number | null;
}

/**
 * 탄 버스 고르기 목록을 만든다. 새 조회 없이 fetchBusLocations 결과만 쓴다.
 *
 * - 내릴 정류장에 이미 왔거나 지난 버스는 뺀다. 그 버스를 타고는 내릴
 *   정류장에 갈 수 없고, 고르면 바로 울릴 수 있다. 뺀 수는 `passedCount`.
 * - 위치를 정류장 목록에서 못 찾은 버스는 남긴다. 내가 탄 버스일 수 있다.
 * - 노선 순서(기점 쪽 먼저)로 정렬한다. 바로 앞 단계의 정류장 목록과 같은
 *   순서다. 위치를 모르는 버스는 맨 뒤.
 * - 같은 차량번호가 두 번 오면 하나만 남긴다.
 */
export function listPickableVehicles(
  locations: BusLocation[],
  stops: BusStop[],
  targetIndex: number,
): { vehicles: PickableVehicle[]; passedCount: number } {
  const seen = new Set<string>();
  const rows: Array<PickableVehicle & { index: number }> = [];
  let passedCount = 0;

  for (const bus of locations) {
    const id = bus.vehicleNo.replace(/\s+/g, "");
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const { index } = resolveBusStopIndex(stops, bus.nodeId, bus.nodeOrder, bus.nodeName);
    if (targetIndex >= 0 && index >= targetIndex) {
      passedCount += 1;
      continue;
    }
    rows.push({
      vehicleNo: bus.vehicleNo,
      stopName: bus.nodeName || (index >= 0 ? stops[index].name : ""),
      stopsLeft: index >= 0 && targetIndex >= 0 ? targetIndex - index : null,
      index,
    });
  }

  rows.sort((a, b) => {
    const ai = a.index < 0 ? Number.MAX_SAFE_INTEGER : a.index;
    const bi = b.index < 0 ? Number.MAX_SAFE_INTEGER : b.index;
    return ai - bi || a.vehicleNo.localeCompare(b.vehicleNo);
  });

  return {
    vehicles: rows.map(({ vehicleNo, stopName, stopsLeft }) => ({ vehicleNo, stopName, stopsLeft })),
    passedCount,
  };
}
