// Cloudflare에 올려 둔 정적 노선·정류장 JSON을 하루에 한 번만 받아 기기에 저장합니다.
// 같은 파일을 동시에 여러 곳에서 부르면 요청 하나를 같이 씁니다.

import { buildStaticUrl, readBackendEnv } from "@/api/backend";
import { loadDaily } from "@/lib/staticCache";
import {
  isRoutesPayload,
  isStopsPayload,
  type RawRouteField,
  type StopsPayload,
} from "@/lib/staticData";

function browserStorage() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

const inFlight = new Map<string, Promise<unknown>>();

function loadFile<T>(file: "routes" | "stops", validate: (v: unknown) => v is T): Promise<T> {
  const running = inFlight.get(file) as Promise<T> | undefined;
  if (running) return running;

  const url = buildStaticUrl(readBackendEnv(), file);
  const promise = loadDaily<T>({
    name: file,
    storage: browserStorage(),
    now: new Date(),
    validate,
    fetcher: async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`정적 데이터 조회 실패 (HTTP ${res.status})`);
      return (await res.json()) as T;
    },
  }).finally(() => inFlight.delete(file));

  inFlight.set(file, promise);
  return promise;
}

export function loadStaticRoutes(): Promise<RawRouteField[]> {
  return loadFile("routes", isRoutesPayload);
}

export function loadStaticStops(): Promise<StopsPayload> {
  return loadFile("stops", isStopsPayload);
}
