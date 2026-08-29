export interface Region {
  sido: string;
  sigungus: string[];
}

export interface Favorite {
  id: string;
  type: "station" | "route" | "stop_route";
  name: string;
  label: string;
  refId: string;
  // stop_route 전용: 특정 노선의 특정 정류장 도착정보 즐겨찾기
  tagoNodeId?: string;   // TAGO 정류소ID
  tagoRouteId?: string;  // TAGO 노선ID (실시간 조회용)
  appRouteId?: string;   // 우리 앱 내부 route.id (상세화면 이동용)
  stopName?: string;
  routeNumber?: string;
}


export interface CardInfo {
  balance: number;
  cardName: string;
  cardNumber: string;
  monthlyUsage: number;
  weeklyUsage: number;
  history: CardHistory[];
}

export interface CardHistory {
  id: string;
  date: string;
  routeName: string;
  fromStation: string;
  amount: number;
  type: "ride" | "charge";
}

export interface AlertSetting {
  id: string;
  routeId: string;          // 노선 식별 ID (실시간 조회용)
  routeName: string;        // 표시용 이름 (예: 본선385, 385번)
  routeNumber: string;      // 버스 번호 (예: 385)
  targetStation: string;    // 내릴 정류장 이름
  targetStopOrder: number;  // 내릴 정류장 순서 번호
  stopsBefore: number;      // n정거장 전에 알림
  sound: boolean;
  vibrate: boolean;
  active: boolean;
}

export interface AlertRecord {
  id: string;
  title: string;
  body: string;
  time: string;
  read: boolean;
  type: "dropoff" | "arrival" | "system";
}
