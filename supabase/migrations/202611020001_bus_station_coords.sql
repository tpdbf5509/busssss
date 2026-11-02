-- 정류장 좌표(위도·경도). 길찾기의 "현재 위치에서 출발"이 가까운 정류장을 찾는 데 쓴다.
--
-- 기존 bus_route_stops_cache / bus_stations_cache에는 좌표가 없다(전주시 GW의
-- 정류장 응답에 좌표 필드가 없음). 기존 표와 뷰를 건드리지 않고, 좌표만 따로
-- 담는 새 표를 더한다. node_id는 bus_route_stops_cache.node_id와 같은 값
-- ("JUB" 접두사 없는 숫자 ID)이라 이름으로 맞추지 않고 ID로 이어 붙일 수 있다.
-- 채우는 곳: supabase/functions/sync-station-coords (TAGO 정류소 목록).
create table if not exists public.bus_station_coords (
  node_id text primary key,
  node_name text not null,
  ars_id text,
  lat double precision not null,
  lng double precision not null,
  updated_at timestamptz not null default now()
);

-- 앱은 "내 위치 주변 사각형"을 lat·lng 범위로 조회한다.
create index if not exists bus_station_coords_lat_lng_idx
  on public.bus_station_coords (lat, lng);

alter table public.bus_station_coords enable row level security;

drop policy if exists "public can read bus station coords" on public.bus_station_coords;
create policy "public can read bus station coords"
on public.bus_station_coords for select
using (true);
