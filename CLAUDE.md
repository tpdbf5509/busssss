# CLAUDE.md — BUS STOP (busssss)

새 세션을 시작하면 이 파일을 먼저 읽습니다.
UI를 만들거나 고치는 작업이면 `DESIGN.md`도 반드시 읽습니다. 디자인 값과 단계별 계획은 그 문서가 기준입니다.

---

## 1. 프로젝트

- 전주시 버스 앱입니다. 실시간 도착 정보, 노선과 정류장 검색, 즐겨찾기, 하차 알림을 제공합니다.
- 핵심 목표: **앱을 열자마자 내 정류장에서 내 버스가 몇 분, 몇 정거장 남았는지 보이는 것.**
- 스택: Vite + React 18 + TypeScript + Tailwind CSS 3 + lucide-react + Pretendard
- 백엔드: Supabase (DB 캐시 + Edge Function 프록시)
- 배포: Vercel (`busssss-rouge.vercel.app`), iPhone 홈 화면 앱(PWA)으로도 씁니다.

## 2. 명령어

| 명령 | 용도 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run typecheck` | 타입 검사 |
| `npm run lint` | ESLint |
| `npm run test` | Vitest (`src/lib`, `src/services`, `src/store`의 `*.test.ts`) |
| `npm run build` | 배포 빌드 |

작업을 끝냈다고 말하기 전에 `typecheck`, `lint`, `test`, `build`를 모두 실행하고 결과를 확인합니다.

## 3. 폴더

```
src/
  App.tsx              탭 전환, 딥링크(?favorite=), 하차 알람 모달
  screens/             Home, Bus(정류장·노선 상세 포함), Route(길찾기), Alert(홈 헤더 벨로 들어감), My, Card(숨김), Auth(미사용)
  components/          HeroArrivalCard·MiniRouteLine(홈 히어로), BottomNav(떠 있는 4탭), Toast,
                       ui.tsx(공통: 스켈레톤, 빈 상태, 신뢰도 칩, 토글, 뒤로 가기), RegionModal(미사용)
  hooks/               useArrivalInfo(20초 폴링), useBusLocations(15초), useDropoffAlertMonitor
  services/            arrivalService(캐시·검증), routeService, stationService, alertMonitorService
  api/                 tago.ts, jeonju.ts, jeonjuBis.ts → 모두 Supabase 프록시 경유
  lib/                 formatArrival, reliability, stopPosition, arrivalPlausibility, heroArrival(히어로 상태), appSettings(큰 글씨·색약) 등 순수 로직
  store/               AppContext + appReducer(즐겨찾기 고정 포함) + localStorage 저장
scripts/contrast-check.mjs   DESIGN.md 4장 색 대비 계산 (node scripts/contrast-check.mjs --md)
supabase/functions/    tago-proxy, jeonju-proxy, bis-proxy, sync-bus-data
public/                manifest.json, sw.js, icons/
```

## 4. 데이터와 API — 꼭 알아야 할 제약

- **모든 외부 API는 Supabase Edge Function 프록시로 부릅니다.** 브라우저에서 공공 API를 직접 부르지 않습니다(CORS).
  - `tago-proxy`: TAGO 도착 정보, 버스 위치
  - `jeonju-proxy`: 전주시 노선 API
  - `bis-proxy`: 전주 ITS 시간표
  - `sync-bus-data`: 정적 노선 데이터를 DB에 채우는 함수
- 환경 변수: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- **정적 데이터와 실시간 데이터를 나눕니다.**
  - 노선 목록, 기점·종점, 정류장 순서 → Supabase DB(`bus_routes_cache`, `bus_route_stops_cache`)
  - 버스 위치, 도착 시간 → API 실시간 호출
- **TAGO 규칙**: 전주 cityCode `35010`, 노선·정류장 ID는 `JUB` 접두사
- **요청 제한(403/429)**: 한꺼번에 많이 부르지 않습니다. 순서대로, 간격을 두고 부릅니다(`sync-bus-data`는 350ms 간격 + 백오프). 새 화면에서 API 호출을 늘리기 전에 기존 캐시와 훅을 먼저 씁니다.
- **캐시**: 도착 정보 15초 캐시, 같은 정류장의 여러 노선은 한 번만 호출(`arrivalService`)
- **버스 위치는 정류장 단위입니다.** 전주 실시간 API는 GPS 좌표가 아니라 "가장 가까운 정류장 순번"만 줍니다. 지도 위 정확한 위치나 정류장 사이 연속 이동은 표시할 수 없습니다.
- **도착 분은 내림입니다**(`arrivalMinutesFromSeconds`). 반올림으로 바꾸지 않습니다. 늦게 말하면 버스를 놓치기 때문입니다.
- `ArrivalInfo.minutes === null`은 "시간을 믿을 수 없음"입니다. 이때도 `stopsAway`는 GPS 확인 값이라 그대로 보여 줍니다.
- `ArrivalInfo.atOrigin`은 가장 가까운 버스가 노선 첫 정류장(기점)에 서 있다는 뜻입니다. 버스 위치를 정류장 ID나 이름으로 확인한 경우만 켜집니다(순번 어림잡기로는 켜지 않음). 기점에 선 버스는 TAGO 도착 목록에 없어 시간이 비므로, 홈은 "출발 전"으로 보여 줍니다(DESIGN.md 7-3).
- 갱신에 실패하면 예전 값을 남기지 않습니다. 오래된 값을 보여 주는 것보다 "정보 없음"이 낫습니다.
- 서비스워커(`public/sw.js`)는 API 응답을 캐시하지 않습니다. 화면 자산이 크게 바뀌면 `CACHE_NAME` 버전을 올립니다.

## 5. 상태 저장

- 사용자 데이터는 모두 localStorage에만 있습니다. 서버에 올라가는 사용자 데이터는 없습니다.
  - `busssss_favorites_v1`, `busssss_alerts_v1`, `busssss_recent_routes_v1`, `busssss_alert_records_v1`(알림 센터), `busssss_settings_v1`(큰 글씨·색약)
- 저장 형식을 바꿀 때는 예전 데이터가 그대로 읽히게 합니다. 새 필드는 선택 필드(`?`)로 추가합니다.
- 즐겨찾기 종류: `station`(정류장), `route`(노선), `stop_route`(정류장+노선, 도착 시간이 있는 유일한 종류)
- 즐겨찾기 고정: `pinned?: boolean`(선택 필드). `stop_route` 하나만 고정되고(reducer `SET_FAVORITE_PIN`), 고정한 것이 홈 히어로에 올라갑니다. 없으면 첫 번째 `stop_route`입니다. 고정하지 않은 항목에는 `pinned` 키를 두지 않아 예전 저장 형식과 같습니다.

## 5-1. 화면 구성 (디자인 개선 0~5단계 뒤)

- 하단 탭은 4개입니다: 홈, 버스, 길찾기, 마이. 화면 위에 떠 있는 카드 모양입니다(`BottomNav`, `pb-nav-safe`, 스크롤 영역 `pb-nav-clear`).
- 알림 화면은 탭이 아닙니다. 홈 헤더의 종 버튼(안 읽은 알림이 있으면 빨간 점)으로만 들어가고, 위쪽 뒤로 가기로 돌아갑니다. 하차 알림 설정도 이 화면에서만 합니다. (예전 홈 빠른 실행 "하차 알림"은 지웠습니다.)
- 홈: 얇은 헤더 → 히어로(내 정류장 + 내 버스, 7가지 상태) → 다른 즐겨찾기 → 점선 추가 행 → 최근 본 노선 (`DESIGN.md` 7장). 빠른 실행 4칸은 지웠습니다(`DESIGN.md` 7-7, 12장). 같은 길이 하단 탭과 헤더 버튼에 있습니다.
- 히어로 "기점 대기" 상태: 시간이 없고 가장 가까운 버스가 기점에 서 있으면 "출발 전"(`ArrivalInfo.atOrigin`, 4장).
- 알림(토스트)은 얇은 헤더 바로 아래(`top-safe-16`)에 뜹니다. 3초 동안 히어로 첫 줄을 덮습니다(사용자 결정).
- 큰 글씨·색약 모드: 마이 → 메뉴(≡) → 더보기. 설정(`lib/appSettings.ts`)은 앱을 열 때 `main.tsx`가 `html`에 붙이고, 마이에서 바꾸면 다시 붙입니다.
- 탭 화면(홈·버스·길찾기·마이) 머리글의 검은 제목은 같은 높이입니다. 홈은 "전주시 ▾" 아래, 길찾기는 부제 아래, 버스·마이는 `TAB_TITLE_CLASS`(ui.tsx)로 맞춥니다. 새 탭 화면도 이 규칙을 따릅니다.

## 6. 현재 상태 (일부러 꺼 둔 것)

- 로그인·회원가입: 꺼짐. 로그인 없이 앱이 바로 열립니다. `AuthScreen`과 supabase auth 코드는 남겨 둠
- 교통카드(`CardScreen`): 하단 탭에서 숨김
- 다크 모드: 토글 숨김 (`!important` 덮어쓰기 방식이라 미완성)
- 지역 설정: "개발 중" 안내만 표시
- 길찾기: 실제 경로 계산 없음. "준비 중" 안내와 예시 단계만 표시
- 하차 알림: 앱이 열려 있을 때만 동작 (진동 + 탭 안 알림). 백그라운드 푸시 없음

이 항목들은 사용자가 요청하기 전에 켜거나 고치지 않습니다.

## 7. 코드 규칙

- **React 훅을 `map` 안에서 부르지 않습니다.** 목록 항목마다 훅이 필요하면 하위 컴포넌트로 뺍니다(예: `FavoriteArrivalInfo`).
- **`setInterval`, 이벤트 리스너는 반드시 정리(cleanup)합니다.**
- **색은 토큰만 씁니다**(`brand`, `canvas`, `surface`, `line`, `ink`, `muted`, `faint`, `pending`, `live`, `delay`, `route-main`, `route-branch`, `danger`, `star`, `DESIGN.md` 4장). `slate-*`, `blue-*` 같은 원시 색을 새로 쓰지 않습니다. 색약 모드 대체 색은 `index.css`의 토큰 클래스 규칙에 겁니다. 색을 바꾸면 `scripts/contrast-check.mjs`로 대비를 다시 계산합니다.
- **모바일 기준입니다.** hover 스타일을 쓰지 않고 `active:`만 씁니다. 누르는 요소는 44×44px 이상입니다.
- **화면이 흔들리지 않게 합니다.** 바뀌는 숫자에는 `tabular-nums`, 로딩·값·오류 상태는 같은 높이를 씁니다.
- **새 글자 크기는 `rem`으로** 씁니다. px 값은 "큰 글씨" 설정을 따라가지 않습니다.
- **상태는 색만으로 구분하지 않습니다.** 아이콘과 글자를 함께 씁니다(색약 모드 대응).
- 주석은 한국어로, "무엇"보다 "왜"를 씁니다. 기존 코드의 설명 주석은 근거가 담겨 있으니 지우지 않습니다. 동작을 바꾸면 주석도 함께 고칩니다.
- import 경로는 `@/` 별칭을 씁니다.

## 8. iOS 홈 화면 앱(PWA) 주의

- 안전영역은 `index.css`의 유틸리티를 씁니다: 위쪽 `pt-safe-0`(머리글), `top-safe-4`(바로보기 안내 띠), `top-safe-16`(토스트), 아래쪽 `pb-nav-safe`(하단 탭), `pb-nav-clear`(스크롤 영역 끝). 예전 `pt-safe-16`/`pt-safe-14`는 쓰는 곳이 없어져 5단계에서 지웠습니다.
- **`env(safe-area-inset-bottom)`을 `min()`/`max()` 안에 넣지 않습니다.** iOS standalone에서 값이 비정상적으로 커집니다. 하단은 `pb-nav-safe`(홈 화면 앱 여부로 분기한 고정값)를 씁니다. 홈 화면 앱 여부는 display-mode와 `html.ios-standalone`(`main.tsx`가 `navigator.standalone`으로 붙임) 두 가지로 가립니다. display-mode만으로는 실기기에서 맞지 않은 적이 있습니다.
- **상태바 방식은 `default`입니다**(`index.html`). iOS 26 홈 화면 앱은 세로 길이를 상태바 높이만큼 짧게 잡습니다. `black-translucent`면 화면 맨 아래 47pt에 앱이 그릴 수 없는 흰 띠가 생기고, CSS로는 고칠 수 없습니다(PR #23 실기기 조사). 상태바 줄 색은 `theme-color`(canvas와 같은 값)입니다. 이 설정을 바꾸면 홈 화면 앱을 다시 추가해야 반영됩니다.
- 핀치 확대는 `touch-action`으로 막혀 있습니다. 앱 셸이 `position: fixed`라 확대하면 화면이 깨지기 때문입니다.
- 레이아웃을 바꾸면 Safari 탭과 홈 화면 앱 두 가지에서 모두 확인해야 합니다. 직접 확인할 수 없으면 사용자에게 확인을 요청합니다.

## 9. 작업 방식

- 대답과 보고는 **한국어 존댓말**로 합니다.
- 진행 보고와 작업 요약은 **어려운 용어 없이 쉬운 말로** 합니다. 무엇을 바꿨고, 화면에서 무엇이 달라지는지 위주로 씁니다.
- **디자인·UI 작업은 완성도가 최우선입니다.** 간격, 정렬, 상태별 표시까지 빠짐없이 맞춥니다.
- 큰 작업은 `DESIGN.md` 10장의 단계를 따릅니다. 단계마다 따로 커밋하고, 끝나면 그 단계의 완료 기준을 하나씩 확인해 보고합니다.
- 범위 밖의 기능을 몰래 추가하거나 바꾸지 않습니다. 필요해 보이면 먼저 제안합니다.
- "버그 찾아줘", "코드 검토해줘" 같은 요청에는 `busssss-bug-hunter` 스킬이 있으면 그것을 씁니다. 찾은 문제는 심각도 순으로 보고하고, 사용자가 승인한 항목만 고칩니다.
- 이전 버그 조사 기록은 `BUG_REPORT.md`에 있습니다. 이미 고친 항목이 섞여 있을 수 있으니 코드와 대조해서 봅니다.
