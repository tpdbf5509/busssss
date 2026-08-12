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
  const map = new Map<string, StationRoute>();

  for (const item of items) {
    const routeId = item.routeid ?? "";
    const routeNo = item.routeno ?? "";
    if (!routeId || !routeNo) continue;

    const existing = map.get(routeNo);
    const arrtime = Number(item.arrtime1 ?? item.arrtime);
    if (!existing || (arrtime && arrtime < (existing.arrtime ?? Infinity))) {
      map.set(routeNo, {
        routeId,
        routeNo,
        routeTp: item.routetp ?? "",
        arrtime: isNaN(arrtime) ? undefined : arrtime,
        arrprevstationcnt: Number(item.arrprevstationcnt1 ?? item.arrprevstationcnt) || undefined,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.routeNo.localeCompare(b.routeNo, undefined, { numeric: true })
  );
}
