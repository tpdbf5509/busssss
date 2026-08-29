export interface Route {
  id: string;
  number: string;       // 표시용 번호 (예: "3-1", "62", "5-5")
  rawNumber: string;    // API brtId (예: "3")
  class: string;        // API brtClass (예: "1")
  subId: string;
  name: string;         // 노선 이름 (예: 본선2, 본선3-1)
  start: string;
  end: string;
  firstBus: string;
  lastBus: string;
  interval: string;
  distance: string;
}

export interface BusStop {
  id: string;
  name: string;
  order: number;
}

/** TAGO 노선ID 방향 정보 (같은 노선번호라도 상행/하행이 서로 다른 routeId를 가짐) */
export interface RouteDirection {
  routeId: string; // TAGO routeId (예: "JUB305200113")
  start: string;
  end: string;
}

/** 실시간으로 운행 중인 버스 한 대의 위치 정보 */
export interface BusLocation {
  vehicleNo: string; // 차량번호
  lat: number | null; // gpslati (옵션값이라 없을 수 있음)
  lng: number | null; // gpslong
  nodeName: string; // 현재 근접한 정류소명
  nodeId: string; // 현재 근접한 정류소ID (GW가 안 주면 빈 문자열)
  nodeOrder: number; // GW가 매긴 정류소 순번 (정적 캐시의 sequence_no와 같은 체계라는 보장 없음)
  routeId: string;
  direction: string; // "start → end" 표시용
}

/** 정류장 (TAGO / 검색용) */
export interface Station {
  id: string;        // nodeid
  name: string;      // nodenm
  arsId: string;     // nodeno (정류장 번호)
  lat: number | null;
  lng: number | null;
}