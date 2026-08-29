# BUS STOP 버그 리포트

조사 범위: `claude/animate-o60mbs` 브랜치 현재 상태 전체 (main 병합 반영 완료, PR #5).
방법: 전체 소스 수동 검토 + `npm run lint` 정적 분석 교차 확인.

---

## 🔴 심각 — 실제로 사용자가 겪을 수 있는 기능 버그

### 1. `CardScreen.tsx:43` — 클래스명 오타로 헤더 스타일 두 개가 통째로 깨짐
```tsx
className="bg-gradient-to-b from-slate-900 to-slate-800 px-5 pt-16 pb-9 text-whitesticky top-0 z-30 shrink-0"
```
`text-white`와 `sticky` 사이에 공백이 빠져서 `text-whitesticky`라는, 존재하지 않는 클래스 하나로 합쳐졌습니다. Tailwind가 이 토큰을 인식하지 못해 **흰 글씨 색도, 스크롤 시 상단 고정(sticky)도 둘 다 적용되지 않습니다.** 어두운 그라디언트 배경 위에 기본(어두운) 글자색이 얹혀 대비가 나쁘고, 스크롤하면 헤더가 다른 화면들과 다르게 같이 흘러가버립니다.
→ `text-white sticky`로 공백 하나만 넣으면 해결됩니다.

### 2. `RegionModal.tsx` — 지역 설정 모달이 실제 저장된 지역을 반영하지 않음
```tsx
const [selectedSido, setSelectedSido] = useState("전북특별자치도");
const [selectedSigungu, setSelectedSigungu] = useState("전주시");
```
이 모달은 현재 앱에 저장된 `state.region` 값을 prop으로 전혀 받지 않고, 항상 "전북특별자치도 / 전주시"로 초기화됩니다. `MyScreen`은 탭을 벗어났다가 돌아올 때마다 통째로 다시 마운트되므로, 그 안의 `RegionModal`도 매번 새로 만들어집니다.

**재현 시나리오**: 마이 탭에서 지역을 "서울특별시 종로구"로 변경 → 다른 탭으로 이동했다가 마이 탭으로 복귀 → 지역 버튼을 다시 눌러 모달을 열면 "전주시"가 선택된 상태로 뜸 → 사용자가 값을 안 바꾸고 그냥 "이 지역으로 설정"을 다시 누르면 **의도치 않게 지역이 전주시로 되돌아갑니다.**

### 3. `alertMonitorService.ts` — 하차 알림이 같은 버스에 대해 평생 딱 한 번만 울림
```ts
const key = `${alert.id}_${bus.vehicleNo}`;
if (fired.has(key)) continue;
```
중복 방지 키가 알림ID+차량번호 조합이고, `localStorage`에 개수(최근 200개)로만 정리될 뿐 **날짜/시간 기준으로 만료되지 않습니다.** 매일 같은 노선을 타는 사용자가 어느 날 우연히 같은 차량(vehicleNo)을 다시 타면, 그 알림은 이후 다시는 울리지 않습니다 — 알람이 "고장난 것처럼" 조용히 무력화됩니다.

### 4. `alertMonitorService.ts` — 짧은 정류장 간격에서 하차 알림이 통째로 씹힐 수 있음
20초 주기로만 버스 위치를 확인하는데, 그 사이에 버스가 `[triggerOrder, targetStopOrder)` 구간을 통째로 지나쳐버리면(정류장 간격이 짧거나 버스가 빠르면) 그 구간을 "본 적"이 없어 알림이 전혀 울리지 않고 지나갑니다.

### 5. `App.tsx:57-60` — 딥링크(홈 화면 바로가기)가 stop_route 즐겨찾기의 appRouteId가 없으면 아무 데도 이동 안 함
```ts
const targetId = fav.type === "stop_route" ? fav.appRouteId : fav.refId;
if (targetId) setPendingRouteId(targetId);
```
`appRouteId`는 옵셔널 필드라 없을 수 있습니다. 이 경우 `pendingRouteId`도 `pendingStation`도 설정되지 않아, 안내 배너("OO 도착정보를 바로 볼 수 있어요")만 뜨고 실제로는 빈 버스 검색 화면에 멈춥니다.
(참고: 정확히 같은 한계가 홈 화면에서 즐겨찾기를 직접 탭할 때도 이미 존재합니다 — 새로 생긴 버그라기보단 기존 한계를 딥링크가 그대로 물려받은 것이지만, 배너 문구는 실제보다 더 정밀하게 이동하는 것처럼 약속하고 있어 사용자 혼란을 줄 수 있습니다.)

### 6. `src/api/tagoProxy.ts` — 이미 고쳤던 버그가 그대로 남아있는 죽은 코드
`tago.ts`와 함수 이름이 완전히 겹치는 예전 버전 사본인데, 정류장 도착정보 조회 시 `routeId`를 쿼리에 그대로 붙입니다:
```ts
if (routeId) p.routeId = routeId;
```
`tago.ts`에는 "특정 노선에서 504 오류가 나서 일부러 뺐다"는 주석과 함께 이 파라미터가 제거되어 있는데, `tagoProxy.ts`에는 예전 버그가 그대로 남아 있습니다. 지금은 어디서도 `import`하지 않아 실행되지 않지만, 이름이 거의 같아 나중에 실수로 이 파일을 가져다 쓰면 고쳤던 504 버그가 재발합니다. → 삭제 권장.

### 7. `BusScreen.tsx`의 `generateTimetable`이 자정 넘는 막차 시간을 처리 못 함
```ts
if (isNaN(start) || isNaN(end) || end <= start) return [];
```
막차 시간이 "00:20"처럼 자정 이후로 기록된 노선은 `end`(20분)가 `start`(예: 330분)보다 작아져 `end <= start`에 걸리고, 예상 배차표 전체가 빈 배열이 됩니다. 이런 노선은 실제로는 정상 운행 중인데도 "배차간격 정보가 없어 시간표를 생성할 수 없어요"로 잘못 표시됩니다.
> **DB로 검증**: Supabase `bus_routes_master`를 직접 조회해보니 현재는 `end_time < start_time`인 노선이 0건입니다. 즉 지금 당장 발현되는 사례는 없고, 코드 자체의 결함(향후 자정 넘는 막차 데이터가 들어오면 바로 터짐)으로 남겨둡니다 — 심각도를 실제 발현 버그보다 한 단계 낮게 보셔도 됩니다.

### 25. `MyScreen.tsx` — 로그아웃이 iOS 홈 화면 앱(설치된 PWA)에서 동작하지 않을 수 있음
```ts
const handleLogout = async () => {
  if (!confirm("로그아웃 할까요? (로컬 설정은 유지됩니다)")) return;
  ...
```
`window.confirm()`(그리고 `alert`/`prompt`)은 iOS Safari의 "홈 화면에 추가"로 설치된 standalone 모드 앱에서는 브라우저 크롬이 없어서 아예 표시되지 않거나 즉시 취소된 것처럼 동작하는 것으로 알려진 WebKit 제약입니다. 이 프로젝트의 목표가 정확히 "아이폰 홈 화면 배포"이기 때문에, 배포 후 홈 화면 아이콘으로 실행했을 때 로그아웃 버튼을 눌러도 아무 반응이 없을 가능성이 있습니다.

### 26. `manifest.json` — 아이콘의 `purpose` 값이 스펙에 없는 값
```json
{ "src": "/icons/bus_stop_icon_180x180.png", "sizes": "180x180", "type": "image/png", "purpose": "apple touch icon" }
```
Web App Manifest 스펙에서 `purpose`는 `"any"` / `"maskable"` / `"monochrome"`(공백으로 조합 가능)만 허용합니다. `"apple touch icon"`은 유효한 값이 아니라서(HTML의 `<link rel="apple-touch-icon">` 개념을 매니페스트에 잘못 옮겨 적은 것으로 보임) 브라우저가 이 값을 그냥 무시합니다 — 크래시는 안 나지만 의도한 효과가 없습니다. 또한 `maskable` 아이콘이 하나도 없어 안드로이드에서 어댑티브 아이콘 마스크가 적용되면 로고 여백이 잘릴 수 있습니다.

### 27. `index.html` — `user-scalable=no`로 핀치 줌이 완전히 막혀 있음
```html
<meta name="viewport" content="...maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover" />
```
저시력 사용자가 화면을 확대해서 볼 수 있는 표준 접근성 기능(핀치 줌)이 통째로 비활성화되어 있습니다. 앱 안에 "큰 글씨" 토글이 있긴 하지만, 이는 브라우저 표준 확대 기능을 대체하지 못합니다. WCAG 1.4.4(Resize Text) 기준으로도 문제가 되는 설정입니다.

### 28. PWA에 서비스워커가 전혀 없음 — 오프라인/백그라운드 알림 불가
`vite.config.ts`에 PWA 플러그인이 없고, `public/`에도 서비스워커 파일이 없습니다. 지금 PWA는 매니페스트+아이콘만 있는 "홈 화면 아이콘" 수준이라 (1) 오프라인일 때 정적 노선도조차 캐시로 뜨지 않고, (2) 하차 알림도 브라우저 탭/앱이 완전히 켜져 있을 때만 동작하는 `Notification()` 방식이라 앱을 완전히 종료하거나 백그라운드로 오래 두면 알림이 안 옵니다. "진행 중인 PWA 작업"의 다음 단계로 필요한 부분입니다.

---

## 🟠 중간 — 데이터 정합성 / 표시 오류

### 8. `AppContext.tsx:66` — 즐겨찾기 중복검사가 타입을 안 보고 refId만 봄
```ts
case "ADD_FAVORITE":
  if (state.favorites.some((f) => f.refId === action.favorite.refId)) return state;
```
노선ID·정류장ID·복합ID는 서로 다른 값 공간에서 오지만 전부 문자열이라, 우연히 같은 문자열이면 타입이 달라도 추가가 조용히 막힙니다. 반면 화면 쪽 로직은 각자 `type`까지 확인한 뒤 "즐겨찾기에 추가했어요" 토스트를 먼저 띄우므로, **실제로는 저장 안 됐는데 성공한 것처럼 보이는 상황**이 생길 수 있습니다.

### 9. (제가 이번에 새로 넣은 코드) `src/lib/reliability.ts` — 급격한 지연은 오히려 "새 버스"로 오인
폴링 사이 예정 도착시각이 지연 임계값보다 **한 번에 크게** 나빠지면, 로직이 이를 "다른 버스로 교체됨"으로 판단해 기준 시각을 초기화합니다. 완만하게 누적되는 지연은 정상적으로 잡아내지만, 급격한 이상치(재배차, GPS 튐 등)는 되레 "지연 아님"으로 리셋될 수 있는 설계상 빈틈입니다. 폴링에 차량 식별자가 없어 "같은 버스인지" 자체를 확실히 알 방법이 없다는 근본적 한계에서 옵니다.

### 10. `src/types/index.ts` — 안 쓰이는 중복/사장 타입
`Station`(← `types/route.ts`의 `Station`과 이름은 같은데 필드가 다름 — `lat/lng`이 `number` 필수 vs `number | null`), `Arrival`, `RouteType`, `Congestion`, `BusRoute`, `RouteStation` 전부 어디서도 import되지 않는 옛 mock 시절 잔재입니다. 이름이 겹치는 `Station` 두 개가 각각 다른 파일에 존재하는 게 특히 위험 — 나중에 자동완성으로 잘못된 쪽을 import하기 쉽습니다.

### 11. `CardScreen.tsx` — "준비중" 안내와 달리 충전이 실제로 잔액을 바꿈
"실제 충전·결제 기능은 사용할 수 없어요"라고 안내하지만, 충전 버튼은 실제로 `dispatch({type:"CHARGE_CARD", amount})`를 실행해 `state.cardBalance`를 바꾸고 성공 토스트까지 띄웁니다. 문구와 동작이 어긋납니다.

### 12. `CardScreen.tsx` — 충전 금액 증가(+)에 상한이 없음
`+` 버튼을 계속 누르면 1,000원씩 무제한 증가합니다 (감소는 0원에서 멈추도록 처리되어 있는 것과 비대칭).

### 13. `routeService.ts:70` — `route.name`이 항상 "본선"으로 고정, 그리고 이미 정확한 정답이 DB에 있는데 안 씀
```ts
name: `본선${displayNumber}`,
```
실제 본선/분선 구분은 `getRouteTypeLabel()`이 기점·종점을 앱 안에 하드코딩된 131개짜리 `MAIN_LINES` 배열과 비교해 따로 "추측"하는데, `route.name` 필드 자체는 무조건 "본선"+번호로 박혀 있습니다. 홈 화면 즐겨찾기 카드는 `getRouteTypeLabel`을 쓰므로 문제없지만, **`route.name`을 직접 표시하는 곳은 분선 노선도 "본선"으로 잘못 표시**됩니다:
- `AlertScreen.tsx` 하차 알림 노선 선택 목록(361줄), 알림 설정 헤더(381, 415줄), 저장되는 `alert.routeName` 필드
- `BusScreen.tsx` 배차시간표 모달 헤더(1466줄)

> **DB로 검증**: 사실 Supabase `bus_routes_master` 테이블에 `category`라는 컬럼이 **이미** 있고, `본선`/`분선` 값만 허용하는 CHECK 제약까지 걸려 있어서 이게 정답입니다(`본선` 267개, `분선` 187개, 총 454개). `jeonju.ts`의 `getRoutes()`는 이 컬럼을 SELECT까지 해오고서 **매핑 코드에서 한 번도 안 씁니다.** 그리고 하드코딩된 프론트엔드 131개짜리 배열을 DB의 실제 `category`와 대조해보니, 최소 2개 노선이 이미 어긋나 있는 걸 확인했습니다:
> - **103-2번**(전주시양묘장 ↔ 송천동종점): DB엔 `본선`, 프론트 배열엔 "103-1"만 있고 "103-2"가 없어서 앱에서는 **분선으로 잘못 표시됨**
> - **430번**(전주대학교 순환): DB엔 `본선`, 프론트 배열엔 아예 없어서 **분선으로 잘못 표시됨**
>
> 이건 단순 표시 오류를 넘어서는 문제입니다 — DB의 노선 목록은 계속 갱신되는데(sync-bus-data 유지보수 작업 언급이 코드 주석에 있음) 프론트엔드 배열은 사람이 수동으로 안 고치면 절대 안 늘어나므로, **시간이 지날수록 이런 불일치가 계속 쌓입니다.** `route.name`을 DB의 `category`로 채우고, `getRouteTypeLabel()`의 하드코딩된 배열 대신 `route.name`(혹은 `category`)을 직접 쓰도록 바꾸면 이 버그 전체(#13 포함)가 근본적으로 사라집니다.

### 14. `routeService.ts:94` — 배차간격이 같은 값일 때도 "15~15분"처럼 표시됨
```ts
return min && max ? `${min}~${max}분` : "정보 없음";
```
`min === max`(고정 배차)인 노선도 항상 범위 표기를 쓰기 때문에 정류장 상세 화면의 "배차간격" 줄에 "15~15분" 같은 어색한 문구가 뜹니다. (파싱 자체는 정상 동작하므로 A1 지연 판정 계산에는 영향 없음)
> **DB로 검증**: `bus_routes_cache.raw`에서 `brtMininterval === brtMaxinterval`(둘 다 비어있지 않은 값)인 실제 노선이 **9개** 있습니다 — 예: "36"/"36", "50"/"50". 그중 일부는 "0"/"0"이라 화면에 **"0~0분"**으로 뜨는, 더 눈에 띄게 이상한 케이스도 실존합니다. 이론상 가능한 얘기가 아니라 지금 데이터에 실제로 있는 문제입니다.

### 29. `AddAlertModal` — "N정거장 전"을 목적지 정류장 위치와 상관없이 최대 10까지 고를 수 있음
> **⚠️ 이 항목의 1차 수정은 불충분했습니다.** 상한을 `정류장 순번 - 1`로 막았는데, 이는 순번이 1..N으로 연속이라는 전제였고 그 전제가 **실제 데이터에서 거짓**입니다. 아래 #38 참고. 2차 수정에서 위치(index) 기준으로 다시 고쳤습니다.

```ts
const triggerOrder = alert.targetStopOrder - alert.stopsBefore;
if (triggerOrder < 1) continue; // alertMonitorService.ts
```
하차 알림 설정 화면의 `stopsBefore` 스테퍼는 무조건 1~10 범위만 허용(`Math.min(10, s+1)`)하는데, 선택한 하차 정류장이 노선의 앞쪽(예: 3번째 정류장)이면 `stopsBefore`를 7 이상으로 설정하는 순간 `triggerOrder`가 1 미만이 되어 **그 알림은 영원히 울리지 않습니다.** 화면에는 아무 경고도 없어서 사용자는 알림을 정상적으로 설정했다고 믿게 됩니다.

### 30. `BusStop.order`(경유 정류장 캐시)와 `BusLocation.nodeOrder`(실시간 위치)가 서로 다른 데이터 소스의 순번 — 어긋날 위험
> **해결됨(2차 수정).** #29와 같은 원인이었습니다. 이제 양쪽을 정류장 목록에서의 위치(index)로 환산해 비교하고, 실시간 GW가 정류장 ID를 주면 순번이 아니라 **ID로 직접 대조**합니다(`bus_route_stops_cache.node_id`가 16,357행 전부 채워져 있어 가능). GW가 ID를 안 주면 순번 기반으로 폴백하고 그 사실을 `console.debug`로 남겨, 두 순번 체계가 실제로 일치하는지 운영 로그로 확인할 수 있게 했습니다.

하차 알림·정류장 도착 로직은 노선의 "몇 번째 정류장"이라는 순번을 두 군데에서 따로 가져옵니다: 정적 목록은 Supabase `bus_route_stops_cache.sequence_no`(`routeService.ts`), 실시간 버스 위치는 전주시 GW가 그때그때 내려주는 자체 순번(`busLocationService.ts`)입니다. 이 둘이 정확히 같은 기준으로 매겨진다는 보장이 코드 어디에도 없고, 실제로 이 코드베이스에는 "서로 다른 소스의 ID가 어긋나서 생긴 버그"를 고친 이력이 이미 두 번 있습니다(`arrivalService.ts`의 `resolveNodeIdForRoute`, `resolveRouteId` 관련 주석 참고). 순번도 같은 종류의 위험을 안고 있어, 실측 데이터로 한 번 검증해볼 가치가 있습니다.

### 31. `MyScreen.tsx` — 설정 화면의 "더보기" 행이 같은 화살표 아이콘을 두 번 보여줌
```tsx
<SettingRow icon={ChevronRight} label="더보기" onClick={() => setMoreOpen((prev) => !prev)} />
```
`SettingRow`는 왼쪽에 전달받은 아이콘을, 오른쪽 끝에는 항상 고정된 `ChevronRight`를 그립니다. "더보기" 행은 왼쪽 아이콘으로도 `ChevronRight`를 넘겨서 **같은 화살표가 한 줄에 두 번** 나옵니다. 게다가 "더보기"는 다른 화면으로 이동하는 게 아니라 그 자리에서 펼쳐지는 동작인데, `ChevronRight`(다음 화면으로 이동을 암시하는 아이콘)를 쓰는 것도 의미상 맞지 않습니다. 펼쳐진 상태를 나타내는 회전 애니메이션도 없어서, 펼쳐졌는지 접혔는지는 아래 항목이 나타나고 사라지는 것으로만 알 수 있습니다.

---

## 🟡 낮음 — 죽은 코드 / 자잘한 정적분석 이슈 (`npm run lint` 결과 포함)

15. `src/api/jeonju.ts` — `ApiEnvelope` 인터페이스 정의만 있고 어디서도 안 씀.
16. `src/screens/BusScreen.tsx` — `RadioTower` 아이콘을 import했지만 실제로는 안 씀.
17. `src/screens/BusScreen.tsx:1147` — `retryBuses`(버스 위치 재조회 함수)를 받아오기만 하고 아무 버튼에도 연결 안 함. 실시간 위치 조회가 실패해도(`busStatus === "error"`) 재시도할 UI가 없음.
18. `src/screens/HomeScreen.tsx` — `RegionModal` import, `regionOpen`/`setRegionOpen`가 안 쓰임. 주석("지역 설정은 일시 비활성화")으로 보아 의도적으로 막아둔 것으로 보이지만, 죽은 코드가 그대로 남아있음.
19. `src/store/AppContext.tsx` — `fetchRoutesForStation` import 후 안 씀.
20. 빈 `catch {}` 블록 다수 (`AppContext.tsx` 4곳, `MyScreen.tsx` 2곳, `alertMonitorService.ts` 6곳) — 모든 에러를 무조건 삼켜서, 실제 저장 실패(예: localStorage 용량 초과) 같은 진짜 문제도 콘솔에 아무 흔적 없이 사라짐.
21. `alertMonitorService.ts:46` — `(window as any).webkitAudioContext`에 `any` 타입 사용.
22. `useAsync.ts:22` — `useCallback(fn, deps)`에서 `deps`가 배열 리터럴이 아니라 매개변수로 전달돼 ESLint 의존성 검사를 받을 수 없음(런타임 동작 자체는 정상).
23. `BusScreen.tsx` 202·216번 줄 — `useEffect`에 `onConsumeInitialRoute`/`onConsumeInitialStation`이 의존성 배열에서 빠져있다는 경고.
24. `Toast.tsx`, `AppContext.tsx` — "Fast refresh only works when a file only exports components" 경고 (컴포넌트 외 함수/상수를 같은 파일에서 export). 동작엔 영향 없음.
32. `src/api/jeonju.ts:getRoutes` — Supabase `bus_routes_master`에서 `category` 컬럼을 조회는 하지만 실제 매핑(`fromMaster`)에서 한 번도 안 씀. 불필요한 컬럼 조회.
33. `src/api/xml.ts`의 주석/`isArray` 규칙(`tagName === "list"`)이 예전 "노선 목록 XML API" 구조를 설명하는데, 그 API는 이제 Supabase로 대체돼 이 파서가 안 쓰입니다. 실제로 이 파서를 쓰는 유일한 곳(`getBusLocationsByRoute`, 실시간 위치 API)은 태그 구조가 달라서 `collectObjects`가 배열 여부와 상관없이 트리를 전부 순회하는 별도 로직으로 우회하고 있음 — 동작엔 문제없지만 주석이 실제 용도와 안 맞아 헷갈리기 쉬움.
34. `src/api/jeonju.ts:collectObjects`의 위치정보 판별 키워드 목록에 `"car"`가 포함되어 있어, 나중에 API 응답 필드명에 "car"를 부분 문자열로 포함하는 무관한 필드(예: "carrierCode")가 추가되면 엉뚱한 레코드를 버스 위치로 잘못 인식할 수 있음(현재 실제 응답 기준으로는 문제 없음, 잠재적 취약점).
35. `MyScreen.tsx:190` — 즐겨찾기 관리 목록에서 `fav.type === "station" ? "정류장" : "노선"`으로만 구분해서, `stop_route`(특정 정류장의 특정 노선 도착정보) 즐겨찾기도 그냥 "노선"으로 표시됨. 홈 화면 쪽 로직만큼 세분화되어 있지 않음.
36. `MyScreen.tsx` 설정 드로어의 "알림 설정" 행이 현재 브라우저 알림 권한 상태(허용/거부)를 전혀 표시하지 않음 — `AlertScreen.tsx`는 같은 정보를 상태로 갖고 배너로 보여주는데 여기는 안내가 없음.
37. `CardScreen.tsx`의 `applyCustomInput`이 입력 자릿수 제한이 없어서, 숫자를 아주 길게 붙여넣으면 충전 금액이 그대로 초천문학적 숫자가 됨(12번 항목의 상한 없음 문제와 같은 근본 원인).

---

## 🔴 2차 조사에서 추가로 발견 (1차 리포트가 놓친 것)

### 38. `sequence_no`는 위치 인덱스가 아니다 — "N정거장 전"이 실제보다 훨씬 늦게 울림

`bus_route_stops_cache.sequence_no`를 코드 전반이 "몇 번째 정류장"이라는 위치 번호처럼 산술 계산하는데, **실제 데이터는 연속 번호가 아닙니다.**

> **DB로 검증**: 454개 노선 중 **85개(19%)에 순번 구멍**이 있고, **7개 노선은 1번에서 시작하지도 않습니다.** 예를 들어 **10번 노선**(route_id 305001790)은 정류장이 26개인데 순번은 `1,3,4,6,8,10,12,13,15,16,17,18,21,22,23,24,25,26,27,28,30,34,37,39,47,49`입니다.

**실사용 피해**: 10번 노선 종점(순번 49)에 "3정거장 전" 알림을 걸면 `49-3=46`으로 계산되고, 46 이상인 첫 정류장은 47입니다. 즉 **실제로는 1정거장 전에 울립니다.** 사용자는 3정거장 분의 여유를 기대했는데 하차 준비를 못 합니다. 알림이 아예 안 울리는 것보다 나쁠 수 있는, 앱 핵심 기능의 실패입니다.

#29(스텝퍼 상한)와 #30(두 순번 소스 불일치)이 사실 이 문제의 서로 다른 증상이었습니다.

**수정**: `src/lib/stopPosition.ts`를 추가해 순번 공간 ↔ 위치 공간 변환을 담당하게 하고, 알림 계산 전체를 위치 공간으로 옮겼습니다. 10번 노선의 실제 순번 배열을 픽스처로 쓴 유닛 테스트 14개로 고정했으며, 그중 하나는 **옛 방식이 3정거장 대신 1정거장만 여유를 줬다는 사실 자체를 회귀 테스트로 박아뒀습니다.**

---

## 요약

| 심각도 | 개수 |
|---|---|
| 🔴 심각 (실사용 영향) | 12 |
| 🟠 중간 (데이터/표시 오류) | 10 |
| 🟡 낮음 (죽은 코드/lint/잠재적 취약점) | 16 |

**1차 보고 이후 추가로 찾은 것**: #25(iOS 홈 화면 앱에서 로그아웃 확인창이 안 뜰 수 있음), #26(매니페스트 아이콘 purpose 값 오류), #27(핀치 줌 차단), #28(서비스워커 부재), #29(하차 알림이 조건에 따라 영원히 안 울리는 설정을 그대로 허용), #30(정류장 순번 두 데이터 소스 불일치 위험), #31(더보기 행 아이콘 중복) 순으로 심각도가 높습니다.

가장 먼저 손보면 좋을 것: **#1(오타 한 글자), #2(지역 리셋), #3(알림 평생 1회 제한), #25(iOS 로그아웃)** — 넷 다 재현이 쉽고, 특히 #25는 이 프로젝트의 핵심 목표(아이폰 홈 화면 배포)와 직결됩니다.

---

## 검증 방법과 남은 한계

### 어떻게 검증했나
- **유닛 테스트(vitest 도입)**: 순수 로직은 실제 DB 데이터를 픽스처로 고정. 현재 14개.
- **실제 브라우저(Playwright, 일회성)**: 헤드리스 Chromium으로 화면을 직접 조작해 8개 항목 확인 — #29(상한/첫 정류장 차단), #17(재시도 버튼이 뜨고 실제로 재조회까지 하는지), #31(화살표 회전), #36(권한 배지).
- 샌드박스에서 Supabase 도메인이 프록시 정책상 차단(403)되어 실제 서버 데이터로는 띄울 수 없었습니다. 대신 **앱 코드는 손대지 않고** 테스트 하네스에서 응답만 주입해, 실제 컴포넌트/상태 흐름을 그대로 통과시켜 검증했습니다.

### 아직 검증 못 한 것 (정직하게)
- **실서버 데이터로의 확인은 못 했습니다.** 위 차단 때문이며, 주입한 데이터는 실제 DB에서 뽑은 값이지만 서버 응답 그 자체는 아닙니다.
- **#30의 잔여 위험**: 실시간 GW가 정류장 ID를 실제로 내려주는지 확인하지 못했습니다. ID를 주면 완전히 해소되고, 안 주면 순번 기반 폴백이 쓰이는데 이때 두 순번 체계가 같다는 가정이 남습니다. 폴백이 쓰일 때마다 `console.debug` 로그를 남기므로 **실제 운영 콘솔을 한 번 보면 바로 답이 나옵니다.**
- **#20 로그 레벨 기준**은 임의 판단이었던 것을 `alertMonitorService.ts` 상단에 규칙으로 명문화하고 전 파일을 그 기준으로 재검토했습니다. 다만 `loadFavorites` 실패 시 조용히 mock 데이터로 대체되는 동작(사용자에겐 즐겨찾기가 사라진 것처럼 보임)은 로그만으로 충분한지 제품 판단이 필요해 그대로 뒀습니다.
