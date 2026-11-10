-- Supabase DB에서 Cloudflare Worker로 정적 노선·정류장 원본을 한 번에 보냅니다.
--
-- 왜 이렇게 하나: Supabase 무료 한도 초과(HTTP 402) 중에는 REST·엣지 함수가
-- 막히지만, 데이터베이스 안에서 나가는 요청(pg_net)과 SQL 실행은 됩니다.
-- 그래서 DB가 직접 Worker의 /admin/import 로 데이터를 밀어 넣습니다.
--
-- 쓰는 법 (Supabase SQL Editor 또는 execute_sql):
--   1) {{WORKER_URL}} 을 배포된 Worker 주소로 바꿉니다. 예: https://busssss-api.<계정>.workers.dev
--   2) {{ADMIN_TOKEN}} 을 wrangler secret put ADMIN_TOKEN 으로 넣은 값으로 바꿉니다.
--   3) 실행하면 요청 번호(request_id)가 나옵니다. 아래 확인 쿼리로 결과를 봅니다.
--   4) 끝나면 ADMIN_TOKEN을 새 값으로 바꿉니다(이 SQL이 로그에 남을 수 있으므로).
--
-- 주의: 읽기만 하고 Supabase 데이터는 바꾸거나 지우지 않습니다.

select net.http_post(
  url := '{{WORKER_URL}}/admin/import',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer {{ADMIN_TOKEN}}'
  ),
  body := jsonb_build_object(
    'master', (
      select coalesce(jsonb_agg(to_jsonb(m) order by m.route_no), '[]'::jsonb)
      from (
        select brt_stdid, route_no, category, start_node, end_node, start_time, end_time
        from public.bus_routes_master
      ) m
    ),
    'cache', (
      select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
      from (
        select brt_id, brt_stdid, brt_class, brt_no, start_name, end_name, raw
        from public.bus_routes_cache
      ) c
    ),
    'stops', (
      select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
      from (
        select route_id, sequence_no, node_id, node_name,
               nullif(raw ->> 'stopId', '') as ars_id
        from public.bus_route_stops_cache
      ) s
    )
  ),
  timeout_milliseconds := 60000
) as request_id;

-- 확인 (몇 초 뒤): status_code 200 이고 content 에 {"ok":true,...} 가 보이면 성공입니다.
-- select id, status_code, left(content::text, 300) as content, error_msg
-- from net._http_response order by id desc limit 3;
