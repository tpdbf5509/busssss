# Supabase → Cloudflare 이전 계획

## 왜 옮기나

Supabase 무료 플랜의 전송량(egress)과 실시간 메시지 한도를 넘어, 프로젝트(`busssss`)가 제한에 걸렸습니다. REST가 모두 HTTP 402를 돌려주고, 그래서 앱이 노선 정보를 못 불러옵니다.

원인은 두 가지입니다.

1. 노선 목록(454개)과 정류장(1만 6천 줄)을 앱을 열 때마다 DB에서 읽었습니다.
2. 도착·위치 조회가 모두 엣지 함수를 지났습니다.

## 지금 구조 (이전 전)

| 종류 | 위치 | 쓰는 곳 |
|---|---|---|
| 노선 목록 | 테이블 `bus_routes_master`(454) + `bus_routes_cache`(454) | `getRoutes()` |
| 정류장 순서 | 테이블 `bus_route_stops_cache`(16,358줄, 18MB) | `getRouteStops()`, `getRouteIdsForStop()` |
| 정류장 검색 | 뷰 `bus_stations_cache`(2,587개) | `searchStationsCache()` |
| 도착·위치 | 엣지 함수 `tago-proxy`, `jeonju-proxy` | `api/tago.ts`, `api/jeonju.ts` |
| 배차 시간표 | 엣지 함수 `bis-proxy` | `api/jeonjuBis.ts` |
| 동기화 | 엣지 함수 `sync-bus-data` + pg_cron(3시간마다) | 노선·정류장 갱신 |
| 로그인 | `supabase.auth` (숨겨 둔 화면) | `MyScreen`, `AuthScreen` |

점검 중 확인한 것: `bus_sync_state.updated_at`이 2026-10-26에서 멈춰 있습니다. 동기화가 그 뒤로 돌지 않았습니다. `bus_routes_master`는 동기화가 만드는 표가 아니라 한 번 넣은 확정 목록입니다.

## 옮긴 뒤 구조

| 종류 | 위치 |
|---|---|
| 노선·정류장 | Workers KV에 JSON 3개(`routes`, `stops`, `meta`). 앱은 하루에 한 번만 받아 기기에 저장 |
| 도착·위치·시간표 | Worker `/api/tago`, `/api/jeonju`, `/api/bis` |
| 동기화 | (후속) Worker Cron Trigger |
| 로그인 | 지금은 꺼져 있음. 그대로 둠 |

### 저장소를 KV로 고른 이유

- R2는 대시보드에서 먼저 활성화해야 합니다(결제 수단 등록). 지금 계정은 R2가 꺼져 있습니다.
- D1은 쓸 수 있지만, 앱이 쓰는 방식이 "파일 통째로 한 번 받기"라 KV가 더 단순합니다.
- 용량은 `routes` 약 0.2MB, `stops` 약 0.5MB입니다. KV 한도(값 25MB)에 한참 못 미칩니다.
- 무료 한도(읽기 하루 10만, 쓰기 하루 1천)는 이 사용 방식으로 충분합니다. 앱이 기기당 하루 한 번만 읽기 때문입니다.

### 하루 한 번 기기 저장

`src/lib/staticCache.ts`가 담당합니다.

- 한국 날짜(UTC+9)가 바뀌면 한 번 새로 받고, 그날은 기기 저장값(localStorage `busssss_static_v1:routes`, `busssss_static_v1:stops`)을 씁니다.
- 새로 받기에 실패하면 예전 날의 저장값을 씁니다. 노선·정류장은 하루 이틀 묵어도 거의 같기 때문입니다. 저장값도 없으면 오류를 보여 줍니다.
- 도착 시간·버스 위치에는 쓰지 않습니다. 실시간 값은 오래된 값을 남기지 않는다는 기존 규칙 그대로입니다.

## 단계

### 1단계 — 코드 준비 (이 PR)

- `cloudflare/`: Worker 코드, KV 연결(`busssss-static` 생성 완료), 테스트
- 앱: `VITE_API_BASE_URL`이 있으면 Cloudflare, 없으면 Supabase. 환경변수 하나로 전환하고 되돌립니다.
- 앱: 정적 데이터 하루 한 번 기기 저장
- `cloudflare/seed/push-from-supabase.sql`: 한도 초과 중에도 쓸 수 있는 데이터 옮기기

이 PR을 병합해도 `VITE_API_BASE_URL`을 넣기 전에는 앱 동작이 그대로입니다.

### 2단계 — Worker 배포 (사용자 작업)

`cloudflare/README.md`의 배포 순서를 따릅니다. 이 환경에서는 Cloudflare 배포 권한이 없어 직접 할 수 없습니다.

1. `wrangler login`
2. `wrangler secret put TAGO_API_KEY`, `wrangler secret put ADMIN_TOKEN`
3. `wrangler deploy` → Worker 주소 확인

### 3단계 — 데이터 옮기기

`push-from-supabase.sql`을 실행합니다. Supabase 쪽 데이터는 읽기만 하고 바꾸지 않습니다. `/health`에서 `routeCount: 454`를 확인합니다.

### 4단계 — 앱 전환

1. Vercel 환경변수 `VITE_API_BASE_URL`에 Worker 주소를 넣고 다시 배포합니다.
2. 폰(Safari 탭, 홈 화면 앱)에서 홈, 버스 검색, 정류장 상세, 노선 상세, 하차 알림을 확인합니다.
3. 문제가 있으면 환경변수를 지우고 다시 배포하면 예전 경로로 돌아갑니다(Supabase가 풀려 있을 때).

`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`는 지우지 않습니다. 숨겨 둔 로그인 코드(`src/lib/supabaseClient.ts`)가 값이 없으면 앱 시작 때 오류를 던집니다.

### 5단계 — 자동 갱신 (후속 PR)

`sync-bus-data`를 Worker Cron으로 옮깁니다.

- 무료 플랜은 한 번 실행에 외부 호출 50개 제한이 있어, 노선을 나눠(커서를 KV에 저장) 여러 번에 걸쳐 돕니다. 현재 Supabase 방식(30개씩 배치, 커서)과 같은 구조입니다.
- 새 노선 발견용 `bus_routes_master`를 대신할 목록 방식은 그때 정합니다. 지금은 master가 한 번 넣은 표라서 새 노선이 자동으로 늘지 않습니다.
- 동기화가 10월 말부터 멈춰 있었으므로, 옮기기 전에 지금 데이터가 맞는지 먼저 확인합니다.

### 6단계 — Supabase 정리 (사용자 확인 뒤)

되돌릴 수 없는 일이라 마지막에, 사용자가 확인한 뒤에만 합니다.

- pg_cron 작업 `sync-bus-routes-every-3h` 끄기
- 엣지 함수 4개 내리기
- 테이블 백업 보관 후 삭제 여부 결정
- 로그인 코드를 쓰지 않기로 하면 `@supabase/supabase-js` 제거

## 위험과 확인할 것

| 항목 | 내용 |
|---|---|
| Workers 무료 요청 한도 | 하루 10만 건. 도착 20초 + 위치 15초 갱신이면 앱을 1시간 켜 둔 사용자가 약 400건입니다. 사용자가 많아지면 유료 플랜(월 $5, 1천만 건)이 필요합니다. |
| 캐시 | `workers.dev` 주소에서는 Cache API가 안 됩니다. 인스턴스 메모리 캐시라 요청 수는 줄이지 못하고 공공 API 호출만 줄입니다. 사용자 지정 도메인을 쓰면 개선할 수 있습니다. |
| 프록시 남용 | `ALLOWED_ORIGINS` 검사는 브라우저가 아니면 우회됩니다. 필요하면 속도 제한 규칙을 붙입니다. |
| 서비스키 | `TAGO_API_KEY`를 Cloudflare secret으로 다시 넣어야 합니다. 이 환경에서는 키 값을 읽을 수 없습니다. |
| 공공 API 허용 | 공공데이터포털이 서버 IP를 제한하지 않는지 첫 호출 때 확인합니다. Supabase에서는 문제가 없었습니다. |
| 정류장 좌표 | 예전과 같이 좌표는 없습니다(앱이 쓰지 않음). |
