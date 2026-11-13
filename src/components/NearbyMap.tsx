import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { UserLocation } from "@/lib/geo";

/**
 * 길찾기 "근처 정류장" 지도. 내 위치 한 점과 근처 정류장(가까운 순 번호)을 찍는다.
 *
 * - 지도 라이브러리는 Leaflet + OpenStreetMap 타일이다. 열쇠(API 키)나 도메인 등록이
 *   필요 없고, 번들이 작다. 이 파일은 RouteScreen이 지연 불러오기(lazy)로 불러서
 *   지도를 쓰지 않는 화면의 첫 로딩에는 들어가지 않는다.
 * - 전주 실시간 API는 정류장 단위 위치만 준다(CLAUDE.md 4장). 여기 찍는 것은 DB에
 *   저장한 정류장 좌표뿐이고, 버스 위치는 그리지 않는다.
 * - 지도 아래 목록이 같은 번호로 정류장 이름을 말한다. 지도는 색·그림이라 글자
 *   정보를 대신하지 않는다(접근성).
 */

export interface NearbyMapStation {
  id: string;
  name: string;
  /** 지도 위 번호표. 목록의 번호와 같다. */
  rank: number;
  lat: number;
  lng: number;
}

interface Props {
  origin: UserLocation;
  stations: NearbyMapStation[];
}

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

// 내 위치: 가운데 점과 파란 테두리 원. 가장 가까운 정류장이 10m 안쪽이면 번호표가
// 점을 덮을 수 있어서(번호표가 위), 번호표 밖으로 보이는 테두리 원으로도 알아보게
// 한다. 번호표(모서리 둥근 네모+숫자)와 모양이 달라 색만으로 구분하지 않는다.
const ME_ICON = L.divIcon({
  className: "",
  iconSize: [44, 44],
  iconAnchor: [22, 22],
  html:
    '<span class="flex h-11 w-11 items-center justify-center rounded-full border-2 border-brand-fill bg-brand-fill/20">' +
    '<span class="h-3 w-3 rounded-full border-2 border-white bg-brand-fill"></span>' +
    "</span>",
});

function stationIcon(rank: number): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html:
      '<span class="flex h-[1.875rem] w-[1.875rem] items-center justify-center rounded-lg border-2 border-white bg-brand-fill text-caption font-bold tabular-nums text-white shadow-float">' +
      `${rank}</span>`,
  });
}

export default function NearbyMap({ origin, stations }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stationKey = stations.map((s) => `${s.id}:${s.rank}`).join(",");

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // 좌표가 숫자가 아니면(DB 값 이상 등) Leaflet이 예외를 던져 화면이 죽는다.
    // 그리지 않고 건너뛴다.
    if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return;
    const drawable = stations.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));

    const map = L.map(el, {
      // 가운데 정렬·핀치는 지도가 맡는다. 마우스 휠은 화면 스크롤을 가로채지 않게 끈다.
      scrollWheelZoom: false,
      // 디자인(길찾기 · 근처 정류장)에는 확대 버튼이 없다. 휴대폰은 두 손가락으로 확대한다.
      zoomControl: false,
      attributionControl: true,
    });
    map.attributionControl.setPrefix(false);

    L.tileLayer(TILE_URL, {
      maxZoom: 19,
      detectRetina: true,
      attribution: "© OpenStreetMap",
    }).addTo(map);

    const points: L.LatLngTuple[] = [[origin.lat, origin.lng]];

    // 기기가 알려 준 오차 반경. 이 원 안 어딘가가 내 위치라는 뜻이라, 위치가 틀려
    // 보일 때 "얼마나 믿을 수 있는지"를 지도에서 바로 볼 수 있다. 너무 큰 원(PC·IP
    // 위치)은 화면을 덮지 않게 5km로 자르고, 화면 맞춤에는 1km 이하일 때만 넣는다.
    if (origin.accuracy != null && origin.accuracy > 0) {
      L.circle([origin.lat, origin.lng], {
        radius: Math.min(origin.accuracy, 5000),
        interactive: false,
        color: "#2563EB",
        weight: 1,
        fillColor: "#2563EB",
        fillOpacity: 0.08,
      }).addTo(map);
      if (origin.accuracy <= 1000) {
        // circle.getBounds()는 지도 중심이 정해지기 전에는 쓸 수 없어 예외를 던진다
        // (실기기에서 오차가 작을 때 지도가 통째로 실패한 원인). 위치에서 오차 반경만큼
        // 떨어진 네모를 직접 구한다.
        const b = L.latLng(origin.lat, origin.lng).toBounds(origin.accuracy * 2);
        points.push([b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]);
      }
    }
    L.marker([origin.lat, origin.lng], {
      icon: ME_ICON,
      keyboard: false,
      interactive: false,
      zIndexOffset: -1000,
    }).addTo(map);

    for (const s of drawable) {
      points.push([s.lat, s.lng]);
      L.marker([s.lat, s.lng], { icon: stationIcon(s.rank), keyboard: false })
        .bindTooltip(s.name, { direction: "top", offset: [0, -12] })
        .addTo(map);
    }

    map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 18 });

    // 안내 카드가 나타난 직후 크기가 정해지는 경우가 있어 한 번 다시 잰다.
    const timer = setTimeout(() => map.invalidateSize(), 0);

    return () => {
      clearTimeout(timer);
      map.remove();
    };
    // stations 배열 자체가 아니라 내용(stationKey)이 바뀔 때만 다시 그린다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin.lat, origin.lng, origin.accuracy, stationKey]);

  return (
    // isolate: Leaflet 안쪽 z-index(최대 1000)가 하단 탭·알림 위로 올라오지 않게
    // 이 상자 안에 가둔다.
    <div
      ref={containerRef}
      role="img"
      aria-label={`내 위치와 근처 정류장 ${stations.length}곳을 표시한 지도`}
      className="nearby-map isolate h-[11.5rem] w-full bg-canvas"
    />
  );
}
