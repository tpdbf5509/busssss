import { describe, expect, it, vi } from "vitest";
import { STATIC_CACHE_PREFIX, kstDateKey, loadDaily, type StorageLike } from "@/lib/staticCache";

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

const isNumbers = (v: unknown): v is number[] => Array.isArray(v) && v.every((n) => typeof n === "number");
const KEY = `${STATIC_CACHE_PREFIX}routes`;

describe("kstDateKey", () => {
  it("UTC 15시부터는 한국 날짜가 다음 날이다", () => {
    expect(kstDateKey(new Date("2026-11-10T14:59:59Z"))).toBe("2026-11-10");
    expect(kstDateKey(new Date("2026-11-10T15:00:00Z"))).toBe("2026-11-11");
  });
});

describe("loadDaily", () => {
  const now = new Date("2026-11-10T03:00:00Z");

  it("오늘 받은 저장값이 있으면 서버를 부르지 않는다", async () => {
    const storage = memoryStorage({ [KEY]: JSON.stringify({ fetchedOn: "2026-11-10", data: [1] }) });
    const fetcher = vi.fn().mockResolvedValue([2]);
    expect(await loadDaily({ name: "routes", storage, now, fetcher, validate: isNumbers })).toEqual([1]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("날짜가 지났으면 새로 받아 저장한다", async () => {
    const storage = memoryStorage({ [KEY]: JSON.stringify({ fetchedOn: "2026-11-09", data: [1] }) });
    const fetcher = vi.fn().mockResolvedValue([2]);
    expect(await loadDaily({ name: "routes", storage, now, fetcher, validate: isNumbers })).toEqual([2]);
    expect(JSON.parse(storage.data[KEY])).toEqual({ fetchedOn: "2026-11-10", data: [2] });
  });

  it("새로 받기에 실패하면 예전 저장값을 쓴다", async () => {
    const storage = memoryStorage({ [KEY]: JSON.stringify({ fetchedOn: "2026-11-01", data: [1] }) });
    const fetcher = vi.fn().mockRejectedValue(new Error("402"));
    expect(await loadDaily({ name: "routes", storage, now, fetcher, validate: isNumbers })).toEqual([1]);
    // 실패한 날은 저장값 날짜를 바꾸지 않으므로 다음에 다시 시도한다
    expect(JSON.parse(storage.data[KEY]).fetchedOn).toBe("2026-11-01");
  });

  it("저장값도 없으면 오류를 던진다", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("402"));
    await expect(
      loadDaily({ name: "routes", storage: memoryStorage(), now, fetcher, validate: isNumbers }),
    ).rejects.toThrow("402");
  });

  it("모양이 틀린 응답은 저장하지 않는다", async () => {
    const storage = memoryStorage();
    const fetcher = vi.fn().mockResolvedValue("엉뚱한 값");
    await expect(
      loadDaily({ name: "routes", storage, now, fetcher: fetcher as never, validate: isNumbers }),
    ).rejects.toThrow();
    expect(storage.data[KEY]).toBeUndefined();
  });

  it("깨진 저장값은 없는 것으로 본다", async () => {
    const storage = memoryStorage({ [KEY]: "{깨짐" });
    const fetcher = vi.fn().mockResolvedValue([3]);
    expect(await loadDaily({ name: "routes", storage, now, fetcher, validate: isNumbers })).toEqual([3]);
  });

  it("저장이 막혀 있어도 받은 값은 돌려준다", async () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
      removeItem: () => {},
    };
    const fetcher = vi.fn().mockResolvedValue([4]);
    expect(await loadDaily({ name: "routes", storage, now, fetcher, validate: isNumbers })).toEqual([4]);
  });

  it("저장소가 없어도(null) 동작한다", async () => {
    const fetcher = vi.fn().mockResolvedValue([5]);
    expect(await loadDaily({ name: "routes", storage: null, now, fetcher, validate: isNumbers })).toEqual([5]);
  });
});
