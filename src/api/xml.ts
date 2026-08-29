import { XMLParser } from "fast-xml-parser";

// 노선 목록은 이제 Supabase가 단일 소스라 이 파서는 안 씁니다(getRoutes 참고).
// 지금 이 파서를 실제로 쓰는 곳은 전주시 실시간 버스 위치 GW뿐이고, 그 응답은
// <RFC30><routeList><list>...</list></routeList></RFC30> 같은 고정 태그 구조가
// 아니라서 isArray 규칙이 적용되지 않습니다 — 대신 jeonju.ts의 collectObjects가
// 태그 이름과 상관없이 트리를 전부 순회하며 위치 데이터를 찾아냅니다.
// parseTagValue만 아래에서 계속 쓰입니다("0501" 같은 값이 숫자로 잘못 변환되는 걸 방지).
const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false, // "0501" 같은 값이 숫자로 잘못 변환되는 걸 방지
  trimValues: true,
  isArray: (tagName) => tagName === "list",
});

export function parseXml<T = unknown>(xml: string): T {
  return parser.parse(xml) as T;
}
