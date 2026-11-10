// 정적 데이터(노선·정류장)를 기기에 하루에 한 번만 받아 두는 규칙.
//
// 노선·정류장은 거의 안 바뀌는데 앱을 열 때마다 서버에서 받으면 전송량만 늘고
// (Supabase 무료 한도 초과의 원인), 오프라인·느린 망에서 첫 화면도 늦어진다.
// 그래서 "한국 날짜가 바뀌면 한 번 새로 받고, 그날은 기기 저장값을 쓴다".
// 도착 시간·버스 위치 같은 실시간 값에는 쓰지 않는다(CLAUDE.md 4장).

export const STATIC_CACHE_PREFIX = "busssss_static_v1:";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface CachedEntry<T> {
  /** 받은 날(한국 날짜, YYYY-MM-DD) */
  fetchedOn: string;
  data: T;
}

/** 한국 날짜(YYYY-MM-DD). 기기 시간대가 달라도 같은 날 경계를 쓰려고 UTC+9로 계산한다. */
export function kstDateKey(now: Date): string {
  return new Date(now.getTime() + 9 * 60 * 60_000).toISOString().slice(0, 10);
}

function readEntry<T>(
  storage: StorageLike | null,
  name: string,
  validate: (value: unknown) => value is T,
): CachedEntry<T> | null {
  if (!storage) return null;
  try {
    const text = storage.getItem(STATIC_CACHE_PREFIX + name);
    if (!text) return null;
    const parsed = JSON.parse(text) as Partial<CachedEntry<unknown>>;
    if (typeof parsed.fetchedOn !== "string" || !validate(parsed.data)) return null;
    return { fetchedOn: parsed.fetchedOn, data: parsed.data };
  } catch {
    return null;
  }
}

function writeEntry<T>(storage: StorageLike | null, name: string, entry: CachedEntry<T>): void {
  if (!storage) return;
  try {
    storage.setItem(STATIC_CACHE_PREFIX + name, JSON.stringify(entry));
  } catch {
    // 저장 공간이 꽉 찼거나 막힌 브라우저(사생활 보호 모드)면 저장만 건너뛴다.
  }
}

export interface LoadDailyOptions<T> {
  name: string;
  storage: StorageLike | null;
  now: Date;
  fetcher: () => Promise<T>;
  validate: (value: unknown) => value is T;
}

/**
 * 오늘 받은 저장값이 있으면 그대로 쓰고, 없으면 새로 받는다.
 * 새로 받기에 실패하면 예전 날의 저장값이라도 쓴다 — 노선·정류장은 하루 이틀
 * 묵어도 거의 같고, 비어 있는 화면보다 낫다. 저장값도 없으면 오류를 던진다.
 */
export async function loadDaily<T>(options: LoadDailyOptions<T>): Promise<T> {
  const { name, storage, now, fetcher, validate } = options;
  const today = kstDateKey(now);
  const cached = readEntry(storage, name, validate);
  if (cached && cached.fetchedOn === today) return cached.data;

  try {
    const data = await fetcher();
    if (!validate(data)) throw new Error("정적 데이터 형식이 올바르지 않습니다.");
    writeEntry(storage, name, { fetchedOn: today, data });
    return data;
  } catch (err) {
    if (cached) return cached.data;
    throw err;
  }
}
