import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AlertSetting } from "@/types";
import type { BusLocation, BusStop, Route } from "@/types/route";
import { VEHICLE_BIND_MAX_MS, VEHICLE_LOST_RELEASE_MS } from "@/lib/dropoffAlert";

/* 가짜 응답으로 하차 알림 감시를 처음부터 끝까지 돌린다.
   위치·노선·정류장 조회만 가짜로 바꾸고, 판정·기록·저장은 실제 코드다. */

const fetchBusLocations = vi.fn();
const fetchAllRoutes = vi.fn();
const fetchStopsForRoute = vi.fn();

vi.mock("@/services/busLocationService", () => ({
  fetchBusLocations: (...args: unknown[]) => fetchBusLocations(...args),
}));
vi.mock("@/services/routeService", () => ({
  fetchAllRoutes: (...args: unknown[]) => fetchAllRoutes(...args),
  fetchStopsForRoute: (...args: unknown[]) => fetchStopsForRoute(...args),
}));

const { checkDropoffAlerts, loadAlertRecords } = await import("@/services/alertMonitorService");

const ROUTE = { id: "R1004", number: "1004", name: "본선1004", start: "기점", end: "종점" } as Route;
/* 정류장 10개. 내릴 정류장은 S8(전북대), 2정거장 전 알림이라 S6부터 알림 구간이다. */
const STOPS = Array.from({ length: 10 }, (_, i) => ({
  id: `S${i + 1}`,
  name: i === 7 ? "전북대" : `정류장${i + 1}`,
  order: i + 1,
})) as BusStop[];

const T0 = new Date(2026, 9, 12, 8, 0, 0).getTime();
const MIN = 60 * 1000;

function bus(vehicleNo: string, stopNo: number): BusLocation {
  return {
    vehicleNo,
    lat: null,
    lng: null,
    nodeName: STOPS[stopNo - 1].name,
    nodeId: `S${stopNo}`,
    nodeOrder: stopNo,
    routeId: ROUTE.id,
    direction: "기점 → 종점",
  };
}

function alert(extra: Partial<AlertSetting> = {}): AlertSetting {
  return {
    id: "a1",
    routeId: ROUTE.id,
    routeName: "본선1004",
    routeNumber: "1004",
    targetStation: "전북대",
    targetStopOrder: 8,
    stopsBefore: 2,
    sound: true,
    vibrate: true,
    active: true,
    ...extra,
  };
}

/** 가짜 localStorage (vitest는 브라우저가 아니라 node에서 돈다). */
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

const dispatchEvent = vi.fn();

function alarmBodies(): string[] {
  return dispatchEvent.mock.calls
    .map(([e]) => e as CustomEvent<{ body: string }>)
    .filter((e) => e.type === "busssss:dropoff-alarm")
    .map((e) => e.detail.body);
}

async function tickAt(time: number, alerts: AlertSetting[], locations: BusLocation[] | Error) {
  vi.setSystemTime(time);
  if (locations instanceof Error) fetchBusLocations.mockRejectedValue(locations);
  else fetchBusLocations.mockResolvedValue(locations);
  return checkDropoffAlerts(alerts);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("localStorage", fakeStorage());
  vi.stubGlobal("window", {
    dispatchEvent,
    setInterval: vi.fn(() => 1),
    clearInterval: vi.fn(),
  });
  dispatchEvent.mockReset();
  fetchBusLocations.mockReset();
  fetchAllRoutes.mockReset().mockResolvedValue([ROUTE]);
  fetchStopsForRoute.mockReset().mockResolvedValue(STOPS);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("시나리오: 같은 노선 차량 2대(5668, 5670), 5668 고정", () => {
  const bound = alert({ vehicleNo: "5668", boundAt: T0 });

  it("5670이 알림 구간에 들어오면 울리지 않는다", async () => {
    // 5668은 S2(아직 멀리), 5670은 S7(내릴 정류장 1정거장 전, 구간 안)
    const r = await tickAt(T0 + MIN, [bound], [bus("5668", 2), bus("5670", 7)]);
    expect(r.records).toEqual([]);
    expect(r.releases).toEqual([]);
    expect(alarmBodies()).toEqual([]);
  });

  it("5668이 들어오면 울리고, 고정을 푼다(a)", async () => {
    await tickAt(T0 + MIN, [bound], [bus("5668", 2), bus("5670", 7)]);
    // 1분 뒤 5668이 S6(2정거장 전)에 들어왔다. 5670은 S8.
    const r = await tickAt(T0 + 2 * MIN, [bound], [bus("5668", 6), bus("5670", 8)]);

    expect(alarmBodies()).toEqual(["본선1004 · 정류장6 부근\n전북대 하차까지 약 2정거장"]);
    expect(r.records).toHaveLength(1);
    // 울린 알림 문구는 예전과 같다(차량번호 없음).
    expect(r.records[0]).toMatchObject({
      title: "하차 알람",
      body: "본선1004 버스가 전북대 정류장에 2정거장 전입니다. (정류장6)",
      type: "dropoff",
      read: false,
    });
    expect(r.releases).toEqual([
      { alertId: "a1", vehicleNo: "5668", boundAt: T0, reason: "fired" },
    ]);
    expect(loadAlertRecords()).toHaveLength(1);
  });

  it("비교: 고정이 없는 예전 알림은 같은 응답에서 5670으로 울린다", async () => {
    const r = await tickAt(T0 + MIN, [alert()], [bus("5668", 2), bus("5670", 7)]);
    expect(alarmBodies()).toEqual(["본선1004 · 정류장7 부근\n전북대 하차까지 약 1정거장"]);
    expect(r.records).toHaveLength(1);
    expect(r.releases).toEqual([]);
  });
});

describe("고정 차량이 사라졌을 때 (b)", () => {
  const bound = alert({ vehicleNo: "5668", boundAt: T0 });

  it("다른 차량으로 대신하지 않고, 마지막으로 본 지 30분이 지나야 푼다", async () => {
    // 8:01 5668을 봤다.
    await tickAt(T0 + MIN, [bound], [bus("5668", 3)]);
    // 8:21 5668이 목록에 없다. 5670이 구간 안에 있어도 울리지 않는다.
    let r = await tickAt(T0 + 21 * MIN, [bound], [bus("5670", 7)]);
    expect(alarmBodies()).toEqual([]);
    expect(r.releases).toEqual([]);
    // 8:30:59 — 마지막으로 본 8:01부터 30분이 안 됐다. (고정한 8:00부터는 30분이 넘었다)
    r = await tickAt(T0 + MIN + VEHICLE_LOST_RELEASE_MS - 1000, [bound], [bus("5670", 7)]);
    expect(r.releases).toEqual([]);
    // 8:31 — 30분이 지났다.
    r = await tickAt(T0 + MIN + VEHICLE_LOST_RELEASE_MS, [bound], [bus("5670", 7)]);
    expect(r.releases).toEqual([
      { alertId: "a1", vehicleNo: "5668", boundAt: T0, reason: "lost" },
    ]);
    expect(r.records).toEqual([
      expect.objectContaining({
        title: "탈 버스를 다시 골라 주세요",
        body: "5668번 차량이 30분 넘게 보이지 않아 고정을 풀었어요. 1004번 전북대 하차 알림은 다음에 탈 버스를 고르면 다시 울려요.",
        type: "system",
        read: false,
      }),
    ]);
    expect(alarmBodies()).toEqual([]);
  });

  it("위치 조회가 실패한 동안은 사라졌다고 보지 않는다", async () => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    const r = await tickAt(T0 + 2 * VEHICLE_LOST_RELEASE_MS, [bound], new Error("네트워크"));
    expect(r.releases).toEqual([]);
  });
});

describe("고정한 지 3시간 (c)", () => {
  it("위치 조회 없이 푼다 — 그 차량이 구간 안이어도 울리지 않는다", async () => {
    const bound = alert({ vehicleNo: "5668", boundAt: T0 });
    const r = await tickAt(T0 + VEHICLE_BIND_MAX_MS, [bound], [bus("5668", 6)]);
    expect(r.releases).toEqual([
      { alertId: "a1", vehicleNo: "5668", boundAt: T0, reason: "expired" },
    ]);
    expect(r.records[0].body).toBe(
      "5668번 차량을 고정한 지 3시간이 지나 고정을 풀었어요. 1004번 전북대 하차 알림은 다음에 탈 버스를 고르면 다시 울려요.",
    );
    expect(fetchBusLocations).not.toHaveBeenCalled();
    expect(alarmBodies()).toEqual([]);
  });
});

describe("다시 고르기 대기", () => {
  it("울리지 않고 위치 조회도 하지 않는다", async () => {
    const r = await tickAt(T0, [alert({ awaitingVehicle: true })], [bus("5668", 6)]);
    expect(r).toEqual({ records: [], releases: [] });
    expect(fetchAllRoutes).not.toHaveBeenCalled();
    expect(fetchBusLocations).not.toHaveBeenCalled();
  });
});

describe("고정 차량 확인 기록", () => {
  it("고정한 알림이 없으면 저장 키를 만들지 않는다(예전 사용자 저장소 그대로)", async () => {
    await tickAt(T0, [alert()], [bus("5670", 3)]);
    expect(localStorage.getItem("busssss_alert_vehicle_seen_v1")).toBeNull();
  });

  it("고정을 풀면 그 알림의 확인 기록을 지운다", async () => {
    const bound = alert({ vehicleNo: "5668", boundAt: T0 });
    await tickAt(T0 + MIN, [bound], [bus("5668", 3)]);
    expect(JSON.parse(localStorage.getItem("busssss_alert_vehicle_seen_v1")!)).toEqual({
      [`a1|${T0}`]: T0 + MIN,
    });
    await tickAt(T0 + 2 * MIN, [bound], [bus("5668", 6)]);
    expect(JSON.parse(localStorage.getItem("busssss_alert_vehicle_seen_v1")!)).toEqual({});
  });
});
