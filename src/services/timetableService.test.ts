import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BisTimeInfo } from "@/api/jeonjuBis";
import {
  FAILURE_RETRY_MS,
  TIMETABLE_STORAGE_KEY,
  getTodayTimetable,
  localDateKey,
  readTodayTimetable,
  resetTimetableMemo,
} from "@/services/timetableService";

// vitest 환경이 node라 localStorage가 없다. 시험용 가짜를 붙인다.
function installFakeStorage() {
  const store = new Map<string, string>();
  const fake = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  vi.stubGlobal("localStorage", fake);
  return store;
}

const INFO: BisTimeInfo = { times: ["14:00"], note: "", satSkip: "", holidaySkip: "" };
const day1 = new Date(2026, 9, 19, 10, 0);
const day2 = new Date(2026, 9, 20, 10, 0);

describe("timetableService", () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = installFakeStorage();
    resetTimetableMemo();
  });

  it("처음에는 한 번 받아 오늘 날짜로 저장하고, 같은 날 다시 부르면 받지 않는다", async () => {
    const fetcher = vi.fn().mockResolvedValue(INFO);
    expect(await getTodayTimetable("R1", day1, fetcher)).toEqual(INFO);
    expect(await getTodayTimetable("R1", day1, fetcher)).toEqual(INFO);
    expect(await getTodayTimetable("R1", new Date(2026, 9, 19, 23, 0), fetcher)).toEqual(INFO);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(store.get(TIMETABLE_STORAGE_KEY)!).date).toBe(localDateKey(day1));
  });

  it("앱을 다시 열어도(모듈 상태가 비어도) 같은 날 저장분을 쓴다", async () => {
    const fetcher = vi.fn().mockResolvedValue(INFO);
    await getTodayTimetable("R1", day1, fetcher);
    resetTimetableMemo();
    await getTodayTimetable("R1", day1, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(readTodayTimetable("R1", day1)).toEqual(INFO);
  });

  it("다음 날이 되면 어제 저장분을 버리고 다시 받는다", async () => {
    const fetcher = vi.fn().mockResolvedValue(INFO);
    await getTodayTimetable("R1", day1, fetcher);
    await getTodayTimetable("R1", day2, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(readTodayTimetable("R1", day1)).toBeNull();
  });

  it("노선마다 따로 한 번씩, 다른 노선 저장분을 지우지 않는다", async () => {
    const fetcher = vi.fn().mockResolvedValue(INFO);
    await getTodayTimetable("R1", day1, fetcher);
    await getTodayTimetable("R2", day1, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(readTodayTimetable("R1", day1)).toEqual(INFO);
    expect(readTodayTimetable("R2", day1)).toEqual(INFO);
  });

  it("동시에 같은 노선을 부르면 요청은 한 번", async () => {
    let resolve!: (v: BisTimeInfo) => void;
    const fetcher = vi.fn().mockReturnValue(new Promise<BisTimeInfo>((r) => (resolve = r)));
    const a = getTodayTimetable("R1", day1, fetcher);
    const b = getTodayTimetable("R1", day1, fetcher);
    resolve(INFO);
    expect(await a).toEqual(INFO);
    expect(await b).toEqual(INFO);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("실패하면 10분 동안 다시 부르지 않고, 지나면 다시 시도한다", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(INFO);
    expect(await getTodayTimetable("R1", day1, fetcher)).toBeNull();
    expect(await getTodayTimetable("R1", new Date(day1.getTime() + 60_000), fetcher)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await getTodayTimetable("R1", new Date(day1.getTime() + FAILURE_RETRY_MS + 1), fetcher)).toEqual(INFO);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("요청이 던져도(예외) null로 처리하고 앱이 깨지지 않는다", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("boom"));
    expect(await getTodayTimetable("R1", day1, fetcher)).toBeNull();
  });

  it("깨진 저장값은 없는 것으로 보고 다시 받는다", async () => {
    store.set(TIMETABLE_STORAGE_KEY, "{broken");
    const fetcher = vi.fn().mockResolvedValue(INFO);
    expect(await getTodayTimetable("R1", day1, fetcher)).toEqual(INFO);
  });

  it("노선 id가 비면 받지 않는다", async () => {
    const fetcher = vi.fn();
    expect(await getTodayTimetable("", day1, fetcher)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
