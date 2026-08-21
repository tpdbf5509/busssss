import { getSttnNoList } from "@/api/tago";
import type { Station } from "@/types/route";

function mapToStation(raw: Record<string, string>): Station {
  return {
    id: raw.nodeid ?? "",
    name: raw.nodenm ?? "",
    arsId: raw.nodeno ?? "",
    lat: raw.gpslati ? Number(raw.gpslati) : null,
    lng: raw.gpslong ? Number(raw.gpslong) : null,
  };
}

export async function searchStations(query: string): Promise<Station[]> {
  const raw = await getSttnNoList(query);
  return raw
    .filter((r) => r.nodeid && r.nodenm)
    .map(mapToStation);
}

import { getSttnAcctoArvlPrearngeInfoList } from "@/api/tago";

export interface StationRoute {
  routeId: string;
  routeNo: string;
  routeTp: string;
  arrtime?: number;
  arrprevstationcnt?: number;
}

export async function fetchRoutesForStation(nodeId: string): Promise<StationRoute[]> {
  const items = await getSttnAcctoArvlPrearngeInfoList(nodeId);

  // 같은 버스번호라도 TAGO routeId가 다르면 서로 다른 방향의 노선입니다.
  // 기존에는 routeNo만 key로 사용해서 104번의 양방향을 하나로 합쳐버렸습니다.
  const map = new Map<string, StationRoute>();

  for (const item of items) {
    const routeId = item.routeid ?? "";
    const routeNo = item.routeno ?? "";
    if (!routeId || !routeNo) continue;

    const key = `${routeNo}|${routeId}`;
    const existing = map.get(key);
    const arrtime = Number(item.arrtime1 ?? item.arrtime);
    const prevStationCount = Number(
      item.arrprevstationcnt1 ?? item.arrprevstationcnt
    );

    if (!existing || (arrtime && arrtime < (existing.arrtime ?? Infinity))) {
      map.set(key, {
        routeId,
        routeNo,
        routeTp: item.routetp ?? "",
        arrtime: isNaN(arrtime) ? undefined : arrtime,
        arrprevstationcnt: isNaN(prevStationCount)
          ? undefined
          : prevStationCount,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.routeNo.localeCompare(b.routeNo, undefined, { numeric: true }) ||
    a.routeId.localeCompare(b.routeId)
  );
}
