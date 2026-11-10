# busssss-api (Cloudflare Worker)

BUS STOP의 백엔드입니다. Supabase 엣지 함수 3개(`tago-proxy`, `jeonju-proxy`, `bis-proxy`)와 노선·정류장 DB 읽기를 대신합니다. 전체 이전 계획은 [`docs/CLOUDFLARE_MIGRATION.md`](../docs/CLOUDFLARE_MIGRATION.md)에 있습니다.

## 주소

| 주소 | 하는 일 |
|---|---|
| `GET /api/tago?path=…` | TAGO 도착·버스 위치·정류장 (예전 `tago-proxy`) |
| `GET /api/jeonju?path=…` | 전주시 노선 API (예전 `jeonju-proxy`) |
| `GET /api/bis?routeId=…` | 전주 ITS 시간표 (예전 `bis-proxy`) |
| `GET /static/routes.json` | 노선 454개 (본선·분선, 기점·종점, 첫차·막차 포함) |
| `GET /static/stops.json` | 정류장 표 + 노선별 정류장 순서 |
| `GET /static/meta.json` | 파일 생성 시각과 개수 |
| `POST /admin/import` | Supabase 원본 행을 받아 위 JSON을 만들어 KV에 저장 (비밀번호 필요) |
| `GET /health` | 살아 있는지, 데이터 생성 시각 |

## 배포 순서

KV 저장소(`busssss-static`)는 이미 만들어 두었고 `wrangler.toml`에 연결돼 있습니다.

```bash
cd cloudflare
npm install
npx wrangler login                    # 브라우저로 로그인
npx wrangler secret put TAGO_API_KEY  # 공공데이터포털 서비스키 (Supabase에 넣어 둔 값과 같은 것)
npx wrangler secret put ADMIN_TOKEN   # 임의의 긴 문자열
npx wrangler deploy                   # 주소가 출력됩니다. 예: https://busssss-api.<계정>.workers.dev
```

Cloudflare 대시보드에서 GitHub 저장소를 연결(Workers Builds)해도 됩니다. 이때 루트 디렉터리는 `cloudflare`, 배포 명령은 `npx wrangler deploy`입니다.

## 데이터 넣기

`seed/push-from-supabase.sql`을 Supabase SQL Editor에서 실행합니다(주소와 비밀번호를 바꾼 뒤). Supabase 한도 초과(402) 중에도 DB 안에서 나가는 요청은 되기 때문에, DB가 Worker로 직접 데이터를 보냅니다. 끝나면 `ADMIN_TOKEN`을 새 값으로 바꿉니다.

확인:

```bash
curl https://<Worker 주소>/health          # data 에 routeCount 454 가 보여야 합니다
curl -s https://<Worker 주소>/static/meta.json
```

## 로컬 실행

```bash
npx wrangler dev --local --var ADMIN_TOKEN:test --var TAGO_API_KEY:키
```

테스트는 저장소 루트에서 `npm run test`입니다(이 폴더의 `*.test.ts`도 함께 돕니다).

## 정해 둔 것

- 프록시는 `ALLOWED_ORIGINS`(wrangler.toml)에 있는 주소의 브라우저 요청만 받습니다. 정적 JSON은 공개 데이터라 제한하지 않습니다. 다만 Origin 머리글은 브라우저가 아니면 흉내 낼 수 있으므로 완전한 차단은 아닙니다. 남용이 보이면 Cloudflare 대시보드에서 속도 제한 규칙을 붙입니다.
- 캐시는 Worker 인스턴스 메모리입니다. `workers.dev` 주소에서는 Cache API가 저장되지 않습니다. 사용자 지정 도메인을 붙이면 Cache API로 바꿀 수 있습니다.
- 상류(공공 API)가 실패하면 묵은 응답을 대신 주지 않습니다. 예전 `tago-proxy`는 마지막 값을 돌려줬지만, 도착 정보는 오래된 값보다 "정보 없음"이 낫기 때문입니다(`CLAUDE.md` 4장).
- 비밀값(`TAGO_API_KEY`, `ADMIN_TOKEN`)은 저장소에 넣지 않습니다.
