// 백엔드 주소를 한 곳에서 정합니다.
//
// 이전 중인 구조: Supabase(엣지 함수 + DB) → Cloudflare(Worker + KV).
// VITE_API_BASE_URL이 있으면 Cloudflare Worker를 쓰고, 없으면 예전처럼
// Supabase를 씁니다. 그래서 Vercel 환경변수 하나로 바꾸고 되돌릴 수 있습니다.

export type ProxyName = "tago" | "jeonju" | "bis";

export interface BackendEnv {
  apiBaseUrl?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/** Cloudflare Worker를 쓰는지 */
export function usesCloudflare(env: BackendEnv): boolean {
  return Boolean(env.apiBaseUrl?.trim());
}

/** 프록시 요청 주소와 머리글을 만든다. Cloudflare는 키가 필요 없다. */
export function buildProxyRequest(
  env: BackendEnv,
  name: ProxyName,
  query: URLSearchParams | Record<string, string>,
): { url: string; headers?: Record<string, string> } {
  const qs = (query instanceof URLSearchParams ? query : new URLSearchParams(query)).toString();

  if (usesCloudflare(env)) {
    return { url: `${trimSlash(env.apiBaseUrl as string)}/api/${name}?${qs}` };
  }

  if (!env.supabaseUrl) throw new Error("VITE_SUPABASE_URL이 설정되지 않았습니다.");
  const key = env.supabaseAnonKey;
  return {
    url: `${trimSlash(env.supabaseUrl)}/functions/v1/${name}-proxy?${qs}`,
    headers: key ? { Authorization: `Bearer ${key}`, apikey: key } : undefined,
  };
}

/** 정적 데이터 파일 주소 (Cloudflare 전용) */
export function buildStaticUrl(env: BackendEnv, file: "routes" | "stops" | "meta"): string {
  return `${trimSlash(env.apiBaseUrl as string)}/static/${file}.json`;
}

export function readBackendEnv(): BackendEnv {
  return {
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL as string | undefined,
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  };
}
