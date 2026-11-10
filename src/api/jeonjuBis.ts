// 전주시 교통정보센터(its.jeonju.go.kr)의 공식 배차시간표 API.
// its.jeonju.go.kr은 CORS를 허용하지 않으므로 프록시(Cloudflare Worker, 주소가
// 없으면 Supabase Edge Function)를 통해 서버 사이드에서 호출합니다.

import { buildProxyRequest, readBackendEnv, usesCloudflare } from "@/api/backend";

export interface BisTimeInfo {
  times: string[];      // 실제 출발시각 목록 (예: ["05:50", "06:10", ...])
  note: string;         // 참고사항 (예: "06:00 전북은행본점 출발 / ...")
  satSkip: string;      // 토요일 감회운행(미운행) 시각
  holidaySkip: string;  // 일요일(공휴일) 감회운행(미운행) 시각
}

export async function fetchBisTimeInfo(routeId: string): Promise<BisTimeInfo | null> {
  if (!routeId) return null;

  try {
    const env = readBackendEnv();
    // 예전에는 키가 없으면 요청 자체를 하지 않았다. Cloudflare는 키가 필요 없으니
    // Supabase 경로일 때만 같은 조건을 유지한다.
    if (!usesCloudflare(env) && (!env.supabaseUrl || !env.supabaseAnonKey)) return null;

    const request = buildProxyRequest(env, "bis", { routeId });
    const res = await fetch(request.url, { headers: request.headers });

    if (!res.ok) return null;

    const json = await res.json();
    const times: string[] = (json.times || []).map((t: string) => t.trim()).filter(Boolean);

    if (times.length === 0) return null;

    return {
      times,
      note: json.note || "",
      satSkip: json.satSkip || "",
      holidaySkip: json.holidaySkip || "",
    };
  } catch {
    return null;
  }
}