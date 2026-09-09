/**
 * TAGO와 GPS가 서로 다른 말을 하는 순간을 기록만 한다(1단계 — 측정).
 *
 * 왜 기록만 하나.
 * 운행 시간인데 TAGO는 "곧 온다"고 하고 전주시 GPS 피드에는 차량이 0대인
 * 경우를 실제로 봤다(2026-09-08 22:11, 104·309·2001번. 막차는 각각 22:25·
 * 22:40·22:19이라 그때는 운행 중이었다). 둘 중 하나는 틀렸는데 어느 쪽인지
 * 모른다.
 * - TAGO가 유령 예측이면 → GPS 침묵을 믿고 시간을 숨기는 게 맞다
 * - GPS가 차량을 누락한 것이면 → 숨기면 실제 오는 버스를 가리게 된다
 *
 * 근거 없이 한쪽으로 코드를 바꾸면 지금 잘 맞고 있는 도착정보를 망가뜨릴 수
 * 있다. 그래서 화면 동작은 그대로 두고, 이런 순간이 언제·어느 노선에서
 * 얼마나 자주 일어나는지만 모은다. 데이터를 보고 나서 결정한다.
 *
 * 왜 콘솔만으로 부족한가. 이 앱은 주로 아이폰에서 쓰는데 거기서는 콘솔을
 * 열기 어렵다. 그래서 localStorage에 최근 것만 링버퍼로 남겨, 나중에 꺼내
 * 볼 수 있게 한다. 사용자 데이터가 아니라 진단 기록이므로 못 써도 그만이다.
 */

const DIAG_KEY = "busssss_arrival_diag_v1";

/** 오래 두면 저장 공간만 먹는다. 판단에는 최근 몇십 건이면 충분하다. */
const MAX_ENTRIES = 50;

/** GPS 실시간 위치를 못 쓴 이유. 동작 분기에는 쓰지 않고 진단에만 쓴다. */
export type LiveDataMiss =
  /** 피드는 정상 응답했는데 이 노선에 차량이 0대 — "버스 없음"의 적극적 근거 */
  | "empty"
  /** 조회 자체가 실패 — 버스가 있는지 없는지 알 수 없음 */
  | "error"
  /** 이 노선의 정류장 목록에 목표 정류장이 없음 — 즐겨찾기 데이터 문제 */
  | "targetNotOnRoute";

export interface ArrivalDisagreement {
  /** 관측 시각(ISO). 운행 종료 무렵에 몰리는지 보려면 시각이 필요하다. */
  at: string;
  routeId: string;
  routeNumber?: string;
  nodeId: string;
  /** TAGO가 말한 도착 시간(분)과 남은 정거장 수 */
  tagoMinutes: number;
  tagoStops: number | null;
  miss: LiveDataMiss;
}

function read(): ArrivalDisagreement[] {
  try {
    const raw = localStorage.getItem(DIAG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ArrivalDisagreement[]) : [];
  } catch {
    // 진단 기록이라 못 읽어도 앱 동작에는 지장이 없다.
    return [];
  }
}

/**
 * TAGO는 버스가 온다는데 GPS로는 확인이 안 된 순간을 남깁니다.
 * 화면에 보이는 값은 이 함수와 무관하게 그대로다.
 */
export function recordArrivalDisagreement(entry: ArrivalDisagreement): void {
  console.debug("[진단] TAGO/GPS 불일치", entry);
  try {
    const next = [...read(), entry].slice(-MAX_ENTRIES);
    localStorage.setItem(DIAG_KEY, JSON.stringify(next));
  } catch {
    // 사파리 프라이빗 모드 등 저장이 막힌 환경. 콘솔 기록은 이미 남겼다.
  }
}

/** 모아둔 기록을 꺼냅니다(개발자 콘솔에서 확인용). */
export function readArrivalDisagreements(): ArrivalDisagreement[] {
  return read();
}

/** 모아둔 기록을 비웁니다. */
export function clearArrivalDisagreements(): void {
  try {
    localStorage.removeItem(DIAG_KEY);
  } catch {
    // 지우지 못해도 상한(MAX_ENTRIES) 때문에 무한히 쌓이지는 않는다.
  }
}

/**
 * 브라우저 콘솔에서 바로 꺼내 볼 수 있게 window에 붙인다.
 * 아이폰에서는 콘솔을 열기 어려워 PC 브라우저로 같은 주소를 열고
 * `busssssDiag()`를 실행하면 된다.
 */
declare global {
  interface Window {
    busssssDiag?: () => ArrivalDisagreement[];
    busssssDiagClear?: () => void;
  }
}

if (typeof window !== "undefined") {
  window.busssssDiag = readArrivalDisagreements;
  window.busssssDiagClear = clearArrivalDisagreements;
}
