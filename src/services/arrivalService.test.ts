import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Route } from "@/types/route";

const getSttnAcctoArvlPrearngeInfoList = vi.fn();
const findNearestApproachingBus = vi.fn();

vi.mock("@/api/tago", () => ({
  getSttnAcctoArvlPrearngeInfoList: (...args: unknown[]) =>
    getSttnAcctoArvlPrearngeInfoList(...args),
}));

vi.mock("@/services/busLocationService", () => ({
  findNearestApproachingBus: (...args: unknown[]) => findNearestApproachingBus(...args),
}));

const { fetchArrivalInfo, clearArrivalCache } = await import("@/services/arrivalService");

/** 제보된 상황: 75번 전북대종점 → 평화동종점 */
const route75 = {
  id: "305001493",
  number: "75",
  start: "전북대종점",
  end: "평화동종점",
} as Route;

const NODE = "305100650"; // 전주대학교 (순번 35)
const ROUTE_ID = "JUB305001493";

beforeEach(() => {
  clearArrivalCache();
  getSttnAcctoArvlPrearngeInfoList.mockReset();
  findNearestApproachingBus.mockReset();
});

describe("TAGO 정류장 ID 형식 (회귀)", () => {
  it('TAGO에는 "JUB" 접두사를 붙여서 조회한다', async () => {
    // 우리 DB 값(305100650)을 그대로 넘기면 TAGO가 오류 대신 빈 목록을
    // 돌려줘 "도착 예정 버스 없음"과 구분이 안 됐다. 실측 확인:
    //   305100650    → totalCount 0
    //   JUB305100650 → totalCount 5 (165번 333초 후, 7정거장 전)
    getSttnAcctoArvlPrearngeInfoList.mockResolvedValue([]);
    findNearestApproachingBus.mockResolvedValue({ hasLiveData: false, bus: null });

    await fetchArrivalInfo(NODE, ROUTE_ID, "75", undefined, route75);

    expect(getSttnAcctoArvlPrearngeInfoList).toHaveBeenCalledWith("JUB305100650");
  });

  it("이미 접두사가 붙어 있으면 두 번 붙이지 않는다", async () => {
    getSttnAcctoArvlPrearngeInfoList.mockResolvedValue([]);
    findNearestApproachingBus.mockResolvedValue({ hasLiveData: false, bus: null });

    await fetchArrivalInfo(`JUB${NODE}`, ROUTE_ID, "75", undefined, route75);

    expect(getSttnAcctoArvlPrearngeInfoList).toHaveBeenCalledWith("JUB305100650");
  });
});

describe("시간 출처 — TAGO만 쓴다 (회귀)", () => {
  it("TAGO 예측이 쓸 만하면 그대로 보여준다", async () => {
    getSttnAcctoArvlPrearngeInfoList.mockResolvedValue([
      { routeid: ROUTE_ID, arrtime: "240", arrprevstationcnt: "3" }, // 4분
    ]);
    findNearestApproachingBus.mockResolvedValue({
      hasLiveData: true,
      bus: { stopsAway: 3, vehicleNo: "전주1309" },
    });

    const info = await fetchArrivalInfo(NODE, ROUTE_ID, "75", undefined, route75);

    expect(info?.minutes).toBe(4);
    expect(info?.stopsAway).toBe(3);
  });

  it("TAGO에 시간이 없으면 시간을 지어내지 않고 정거장 수만 남긴다", async () => {
    // 예전에는 여기서 노선 평균 속도(busPace)로 시간을 만들었는데, 실측 결과
    // 2~3배 부풀려져 있었다(104번: 우리 6분 vs TAGO·네이버 2분). 실제보다 길게
    // 알려주면 사용자가 버스를 놓치므로, 근거가 없으면 시간을 비운다.
    getSttnAcctoArvlPrearngeInfoList.mockResolvedValue([]);
    findNearestApproachingBus.mockResolvedValue({
      hasLiveData: true,
      bus: { stopsAway: 3, vehicleNo: "전주1309" },
    });

    const info = await fetchArrivalInfo(NODE, ROUTE_ID, "75", undefined, route75);

    expect(info?.minutes).toBeNull();
    expect(info?.stopsAway).toBe(3);
  });
});

describe("fetchArrivalInfo — TAGO에 없는 버스 (회귀)", () => {
  it("TAGO 예측이 없어도 GPS로 다가오는 버스가 보이면 정거장 수를 알려준다", async () => {
    // TAGO 도착예정 목록에는 어느 정도 가까워진 버스만 올라온다. 버스가 순번
    // 11, 즐겨찾기는 순번 35라 아직 안 잡힌 상태 — 예전에는 이때 GPS를 보지도
    // 않고 "정보 없음"을 내보냈다.
    getSttnAcctoArvlPrearngeInfoList.mockResolvedValue([]);
    findNearestApproachingBus.mockResolvedValue({
      hasLiveData: true,
      bus: { stopsAway: 24, vehicleNo: "전주2040" },
    });

    const info = await fetchArrivalInfo(NODE, ROUTE_ID, "75", undefined, route75);

    expect(info).not.toBeNull();
    expect(info?.stopsAway).toBe(24);
    expect(info?.minutes).toBeNull(); // 시간은 근거가 없어 표시하지 않는다
  });

  it("확인된 버스가 모두 정류장을 지났으면 여전히 정보 없음", async () => {
    getSttnAcctoArvlPrearngeInfoList.mockResolvedValue([]);
    findNearestApproachingBus.mockResolvedValue({ hasLiveData: true, bus: null });

    expect(await fetchArrivalInfo(NODE, ROUTE_ID, "75", undefined, route75)).toBeNull();
  });

  it("GPS 데이터 자체가 없으면(운행 종료 등) 정보 없음", async () => {
    getSttnAcctoArvlPrearngeInfoList.mockResolvedValue([]);
    findNearestApproachingBus.mockResolvedValue({ hasLiveData: false, bus: null });

    expect(await fetchArrivalInfo(NODE, ROUTE_ID, "75", undefined, route75)).toBeNull();
  });

  it("TAGO 예측이 있고 정거장 수와 맞으면 시간을 함께 보여준다", async () => {
    getSttnAcctoArvlPrearngeInfoList.mockResolvedValue([
      { routeid: ROUTE_ID, arrtime: "180", arrprevstationcnt: "2" },
    ]);
    findNearestApproachingBus.mockResolvedValue({
      hasLiveData: true,
      bus: { stopsAway: 2, vehicleNo: "전주2040" },
    });

    const info = await fetchArrivalInfo(NODE, ROUTE_ID, "75", undefined, route75);

    expect(info?.minutes).toBe(3);
    expect(info?.stopsAway).toBe(2);
  });

  it("TAGO 시간이 정거장 수와 앞뒤가 안 맞으면 시간만 버린다", async () => {
    // 한 정거장 앞인데 14분 — 다른 버스의 예측이다(arrivalPlausibility).
    getSttnAcctoArvlPrearngeInfoList.mockResolvedValue([
      { routeid: ROUTE_ID, arrtime: "840", arrprevstationcnt: "6" },
    ]);
    findNearestApproachingBus.mockResolvedValue({
      hasLiveData: true,
      bus: { stopsAway: 1, vehicleNo: "전주2040" },
    });

    const info = await fetchArrivalInfo(NODE, ROUTE_ID, "75", undefined, route75);

    expect(info?.minutes).toBeNull();
    expect(info?.stopsAway).toBe(1);
  });
});
