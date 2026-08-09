// 전주시 교통정보센터(its.jeonju.go.kr)의 공식 배차시간표 API.
// 주의: 이 API는 its.jeonju.go.kr 자체 페이지에서 쓰라고 만든 것이라
// 다른 도메인(우리 앱)에서 호출하면 CORS로 막힐 수 있습니다.
// 막히면 실패로 처리되고, 화면에서는 자동으로 배차간격 추정 방식으로 대체됩니다.

export interface BisTimeInfo {
  times: string[];      // 실제 출발시각 목록 (예: ["05:50", "06:10", ...])
  note: string;         // 참고사항 (예: "06:00 전북은행본점 출발 / ...")
  satSkip: string;      // 토요일 감회운행(미운행) 시각
  holidaySkip: string;  // 일요일(공휴일) 감회운행(미운행) 시각
}

export async function fetchBisTimeInfo(routeId: string): Promise<BisTimeInfo | null> {
  if (!routeId) return null;

  try {
    const res = await fetch("https://its.jeonju.go.kr/bis/selectBisRouteTimeInfo.do", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: `locale=ko-kr&routeId=${encodeURIComponent(routeId)}`
    });

    if (!res.ok) return null;

    const json = await res.json();
    const times: string[] = (json.timeList || []).map((t: string) => t.trim()).filter(Boolean);

    if (times.length === 0) return null;

    const d = json.result || {};
    return {
      times,
      note: d.BRT_TEXT || "",
      satSkip: d.SAT_NLIST || "",
      holidaySkip: d.HOLI_NLIST || "",
    };
  } catch {
    // CORS 차단, 네트워크 오류 등 — 조용히 실패 처리 (호출부에서 fallback 처리)
    return null;
  }
}
