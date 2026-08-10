// 전주시 교통정보센터(its.jeonju.go.kr)의 공식 배차시간표 API.
// its.jeonju.go.kr은 CORS를 허용하지 않으므로 Supabase Edge Function 프록시를
// 통해 서버 사이드에서 호출합니다.

export interface BisTimeInfo {
  times: string[];      // 실제 출발시각 목록 (예: ["05:50", "06:10", ...])
  note: string;         // 참고사항 (예: "06:00 전북은행본점 출발 / ...")
  satSkip: string;      // 토요일 감회운행(미운행) 시각
  holidaySkip: string;  // 일요일(공휴일) 감회운행(미운행) 시각
}

export async function fetchBisTimeInfo(routeId: string): Promise<BisTimeInfo | null> {
  if (!routeId) return null;

  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) return null;

    const url = `${supabaseUrl}/functions/v1/bis-proxy?routeId=${encodeURIComponent(routeId)}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
    });

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