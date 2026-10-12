import { describe, expect, it } from "vitest";
import {
  VEHICLE_BIND_MAX_MS,
  VEHICLE_LOST_RELEASE_MS,
  alertVehicleMode,
  evaluateDropoffAlert,
  isBindingExpired,
  isVehicleLost,
  listPickableVehicles,
  vehicleLabel,
  type DropoffInput,
} from "@/lib/dropoffAlert";
import type { AlertSetting } from "@/types";
import type { BusLocation, BusStop } from "@/types/route";

/* 1004번 노선 정류장 10개(S1~S10). 내릴 정류장은 S8(위치 7), 2정거장 전 알림이라
   알림 구간은 위치 5(S6)부터다. */
const STOPS: BusStop[] = Array.from({ length: 10 }, (_, i) => ({
  id: `S${i + 1}`,
  name: `정류장${i + 1}`,
  order: i + 1,
})) as BusStop[];
const TARGET_INDEX = 7;

const T0 = Date.UTC(2026, 9, 12, 0, 0, 0);
const MIN = 60 * 1000;

function bus(vehicleNo: string, stopNo: number): BusLocation {
  return {
    vehicleNo,
    lat: null,
    lng: null,
    nodeName: `정류장${stopNo}`,
    nodeId: `S${stopNo}`,
    nodeOrder: stopNo,
    routeId: "R1004",
    direction: "기점 → 종점",
  };
}

/** 예전 저장값과 같은 모양(새 필드 없음). */
function legacyAlert(extra: Partial<AlertSetting> = {}): AlertSetting {
  return {
    id: "a1",
    routeId: "R1004",
    routeName: "본선1004",
    routeNumber: "1004",
    targetStation: "정류장8",
    targetStopOrder: 8,
    stopsBefore: 2,
    sound: false,
    vibrate: false,
    active: true,
    ...extra,
  };
}

function boundAlert(vehicleNo = "5668", boundAt = T0): AlertSetting {
  return legacyAlert({ vehicleNo, boundAt });
}

function run(alert: AlertSetting, locations: BusLocation[], extra: Partial<DropoffInput> = {}) {
  const fired = extra.fired ?? new Set<string>();
  const decision = evaluateDropoffAlert({
    alert,
    stops: STOPS,
    targetIndex: TARGET_INDEX,
    locations,
    fired,
    today: "2026-10-12",
    now: T0 + MIN,
    ...extra,
  });
  return { ...decision, fired, firedVehicles: decision.fires.map((f) => f.bus.vehicleNo) };
}

describe("alertVehicleMode", () => {
  it("새 필드가 없는 예전 저장값은 모든 차량 기준", () => {
    expect(alertVehicleMode(legacyAlert())).toBe("all");
  });

  it("차량번호가 있으면 고정", () => {
    expect(alertVehicleMode(boundAlert())).toBe("bound");
  });

  it("다시 고르기를 기다리는 상태", () => {
    expect(alertVehicleMode(legacyAlert({ awaitingVehicle: true }))).toBe("awaiting");
  });

  it("빈 차량번호는 고정으로 보지 않는다", () => {
    expect(alertVehicleMode(legacyAlert({ vehicleNo: " " }))).toBe("all");
  });
});

describe("예전 저장 데이터 로딩", () => {
  it("localStorage의 예전 JSON(새 필드 없음)을 읽으면 모든 차량 기준으로 예전처럼 울린다", () => {
    const raw = JSON.stringify([
      {
        id: "1728700000000",
        routeId: "R1004",
        routeName: "본선1004",
        routeNumber: "1004",
        targetStation: "정류장8",
        targetStopOrder: 8,
        stopsBefore: 2,
        sound: true,
        vibrate: true,
        active: true,
      },
    ]);
    const [loaded] = JSON.parse(raw) as AlertSetting[];
    expect(loaded.vehicleNo).toBeUndefined();
    expect(loaded.boundAt).toBeUndefined();
    expect(loaded.awaitingVehicle).toBeUndefined();
    expect(alertVehicleMode(loaded)).toBe("all");

    const r = run(loaded, [bus("5670", 6)]);
    expect(r.firedVehicles).toEqual(["5670"]);
    expect(r.release).toBeNull();
    // 중복 방지 키도 예전 모양 그대로다.
    expect([...r.fired]).toEqual(["2026-10-12_1728700000000_5670"]);
  });
});

describe("고정이 없는 예전 알림 — 예전 동작", () => {
  it("구간에 들어온 차량은 아무 차량이나 울린다", () => {
    const r = run(legacyAlert(), [bus("5668", 2), bus("5670", 6)]);
    expect(r.firedVehicles).toEqual(["5670"]);
  });

  it("두 대가 구간에 있으면 둘 다 울린다(예전과 같음)", () => {
    const r = run(legacyAlert(), [bus("5668", 7), bus("5670", 6)]);
    expect(r.firedVehicles).toEqual(["5668", "5670"]);
  });

  it("이미 울린 차량은 다시 울리지 않고, 구간 앞으로 돌아오면 다시 무장한다", () => {
    const fired = new Set<string>();
    expect(run(legacyAlert(), [bus("5670", 6)], { fired }).firedVehicles).toEqual(["5670"]);
    expect(run(legacyAlert(), [bus("5670", 7)], { fired }).firedVehicles).toEqual([]);
    run(legacyAlert(), [bus("5670", 2)], { fired }); // 다음 운행 시작
    expect(run(legacyAlert(), [bus("5670", 6)], { fired }).firedVehicles).toEqual(["5670"]);
  });

  it("고정을 풀 일이 없다", () => {
    expect(run(legacyAlert(), [bus("5670", 6)]).release).toBeNull();
    expect(run(legacyAlert(), []).release).toBeNull();
  });
});

describe("차량 고정 — 고정한 차량만 울림", () => {
  it("다른 차량이 구간에 들어와도 울리지 않는다", () => {
    const r = run(boundAlert("5668"), [bus("5668", 2), bus("5670", 6)]);
    expect(r.firedVehicles).toEqual([]);
    expect(r.release).toBeNull();
    expect(r.boundSeen).toBe(true);
  });

  it("고정한 차량이 구간에 들어오면 울린다", () => {
    const r = run(boundAlert("5668"), [bus("5668", 6), bus("5670", 7)]);
    expect(r.firedVehicles).toEqual(["5668"]);
    expect(r.fires[0].stopsRemaining).toBe(2);
  });

  it("폴링 사이에 내릴 정류장을 지나쳤어도 울린다(상한 없음, 예전과 같음)", () => {
    const r = run(boundAlert("5668"), [bus("5668", 9)]);
    expect(r.firedVehicles).toEqual(["5668"]);
    expect(r.fires[0].stopsRemaining).toBe(-1);
  });

  it("띄어쓰기가 달라도 같은 차량으로 본다", () => {
    const r = run(boundAlert("전주 5668"), [bus("전주5668", 6)]);
    expect(r.firedVehicles).toEqual(["전주5668"]);
  });

  it("중복 방지 키에 고정 시각이 들어가, 같은 날 같은 차량을 새로 고정해도 울린다", () => {
    const fired = new Set<string>();
    run(boundAlert("5668", T0), [bus("5668", 6)], { fired });
    // 오후에 같은 차량을 다시 골랐다(새 고정). 고른 순간 이미 구간 안이다.
    const later = T0 + 5 * 60 * MIN;
    const r = run(boundAlert("5668", later), [bus("5668", 6)], { fired, now: later + MIN });
    expect(r.firedVehicles).toEqual(["5668"]);
  });
});

describe("차량 고정 — 고정한 차량이 사라졌을 때", () => {
  it("다른 차량으로 대신하지 않는다(구간 안 다른 차량이 있어도 안 울림)", () => {
    const r = run(boundAlert("5668"), [bus("5670", 6), bus("5671", 7)]);
    expect(r.firedVehicles).toEqual([]);
    expect(r.boundSeen).toBe(false);
    expect(r.release).toBeNull();
  });

  it("마지막으로 본 지 30분이 안 됐으면 고정을 유지한다", () => {
    const lastSeenAt = T0 + 10 * MIN;
    const r = run(boundAlert(), [bus("5670", 6)], {
      lastSeenAt,
      now: lastSeenAt + VEHICLE_LOST_RELEASE_MS - 1,
    });
    expect(r.release).toBeNull();
  });
});

describe("고정 해제 조건", () => {
  it("(a) 고정한 차량으로 울리면 바로 푼다", () => {
    const r = run(boundAlert(), [bus("5668", 6)]);
    expect(r.firedVehicles).toEqual(["5668"]);
    expect(r.release).toBe("fired");
  });

  it("(a) 고정한 차량이 아직 구간 앞이면 풀지 않는다", () => {
    expect(run(boundAlert(), [bus("5668", 5)]).release).toBeNull();
  });

  it("(b) 마지막으로 본 지 30분이 지나면 푼다", () => {
    const lastSeenAt = T0 + 10 * MIN;
    const r = run(boundAlert(), [bus("5670", 6)], {
      lastSeenAt,
      now: lastSeenAt + VEHICLE_LOST_RELEASE_MS,
    });
    expect(r.release).toBe("lost");
    expect(r.firedVehicles).toEqual([]);
  });

  it("(b) 한 번도 못 봤으면 고정한 시각부터 센다", () => {
    expect(isVehicleLost(boundAlert(), undefined, T0 + VEHICLE_LOST_RELEASE_MS - 1)).toBe(false);
    expect(isVehicleLost(boundAlert(), undefined, T0 + VEHICLE_LOST_RELEASE_MS)).toBe(true);
  });

  it("(b) 위치 목록이 통째로 비어도 같은 규칙", () => {
    expect(run(boundAlert(), [], { now: T0 + VEHICLE_LOST_RELEASE_MS }).release).toBe("lost");
  });

  it("(c) 고정한 지 3시간이 지나면 푼다 — 그 차량이 구간 안이어도 울리지 않는다", () => {
    const r = run(boundAlert(), [bus("5668", 6)], { now: T0 + VEHICLE_BIND_MAX_MS });
    expect(r.release).toBe("expired");
    expect(r.firedVehicles).toEqual([]);
  });

  it("(c) 3시간 직전까지는 유지한다", () => {
    expect(isBindingExpired(boundAlert(), T0 + VEHICLE_BIND_MAX_MS - 1)).toBe(false);
    expect(isBindingExpired(boundAlert(), T0 + VEHICLE_BIND_MAX_MS)).toBe(true);
  });

  it("(c) 고정 시각이 없는 깨진 값은 지난 것으로 본다", () => {
    expect(isBindingExpired(legacyAlert({ vehicleNo: "5668" }), T0)).toBe(true);
  });

  it("고정하지 않은 알림은 만료되지 않는다", () => {
    expect(isBindingExpired(legacyAlert(), T0 + 10 * VEHICLE_BIND_MAX_MS)).toBe(false);
  });
});

describe("다시 고르기 대기", () => {
  it("모든 차량 기준으로 돌아가지 않고 울리지 않는다", () => {
    const r = run(legacyAlert({ awaitingVehicle: true }), [bus("5668", 6), bus("5670", 7)]);
    expect(r.firedVehicles).toEqual([]);
    expect(r.release).toBeNull();
    expect(r.fired.size).toBe(0);
  });
});

describe("listPickableVehicles", () => {
  it("노선 순서로 정렬하고 내릴 정류장까지 남은 정거장을 붙인다", () => {
    const { vehicles, passedCount } = listPickableVehicles(
      [bus("5670", 6), bus("5668", 2)],
      STOPS,
      TARGET_INDEX,
    );
    expect(vehicles).toEqual([
      { vehicleNo: "5668", stopName: "정류장2", stopsLeft: 6 },
      { vehicleNo: "5670", stopName: "정류장6", stopsLeft: 2 },
    ]);
    expect(passedCount).toBe(0);
  });

  it("내릴 정류장에 왔거나 지난 버스는 빼고 수를 센다", () => {
    const { vehicles, passedCount } = listPickableVehicles(
      [bus("5668", 2), bus("5670", 8), bus("5671", 10)],
      STOPS,
      TARGET_INDEX,
    );
    expect(vehicles.map((v) => v.vehicleNo)).toEqual(["5668"]);
    expect(passedCount).toBe(2);
  });

  it("위치를 못 찾은 버스는 맨 뒤에 남긴다", () => {
    const unknown = { ...bus("5699", 1), nodeId: "", nodeOrder: 0, nodeName: "모르는정류장" };
    const { vehicles } = listPickableVehicles([unknown, bus("5668", 3)], STOPS, TARGET_INDEX);
    expect(vehicles).toEqual([
      { vehicleNo: "5668", stopName: "정류장3", stopsLeft: 5 },
      { vehicleNo: "5699", stopName: "모르는정류장", stopsLeft: null },
    ]);
  });

  it("같은 차량번호는 한 번만", () => {
    const { vehicles } = listPickableVehicles([bus("5668", 2), bus("5668", 3)], STOPS, TARGET_INDEX);
    expect(vehicles).toHaveLength(1);
  });

  it("위치 응답에 이름이 없으면 노선 목록의 이름을 쓴다", () => {
    const noName = { ...bus("5668", 4), nodeName: "" };
    expect(listPickableVehicles([noName], STOPS, TARGET_INDEX).vehicles[0].stopName).toBe("정류장4");
  });
});

describe("vehicleLabel", () => {
  it("숫자만이면 '번 차량'", () => {
    expect(vehicleLabel("5668")).toBe("5668번 차량");
  });
  it("글자가 섞이면 그대로", () => {
    expect(vehicleLabel("전주1309")).toBe("전주1309 차량");
  });
});
