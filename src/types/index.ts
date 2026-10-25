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
  /**
   * "내 정류장"으로 고정했는지. 고정한 stop_route가 홈 히어로에 먼저 올라간다.
   * 한 번에 하나만 true다(reducer의 SET_FAVORITE_PIN이 보장).
   * 2단계에서 새로 생긴 선택 필드라, 예전 저장값에는 없다 — 없으면 고정 안 함.
   */
  pinned?: boolean;
  /**
   * 시간대별 "내 정류장"(6단계)에서 이 즐겨찾기를 어느 시간대에 올릴지.
   * stop_route만 가질 수 있고, 출근·퇴근 각각 하나씩만 있다(reducer의
   * SET_FAVORITE_COMMUTE가 보장). 6단계에서 생긴 선택 필드라 예전 저장값에는
   * 없다 — 없으면 지정 안 함. 지정하지 않은 항목에는 키를 두지 않는다.
   */
  commute?: "morning" | "evening";
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
  /**
   * 내가 탄 차량 번호(BusLocation.vehicleNo). 있으면 이 차량만 보고 울린다.
   *
   * 예전에는 이 필드가 없어서 노선의 모든 차량 중 아무 차량이나 알림 구간에
   * 들어오면 울렸다(5668번 차량을 탔는데 같은 노선 5670번이 들어와도 울림).
   * 선택 필드라 예전 저장값(필드 없음)은 지금도 모든 차량 기준으로 동작한다.
   * 고정은 "이번 탑승 한 번"이라, 풀리면 이 키를 지운다(lib/dropoffAlert.ts).
   */
  vehicleNo?: string;
  /** vehicleNo를 고정한 시각(ms). 고정이 오래되면 풀기 위해 둔다. vehicleNo와 함께만 있다. */
  boundAt?: number;
  /**
   * 고정이 풀려 다음 탑승 때 차량을 다시 골라야 하는 상태. true인 동안은
   * 모든 차량 기준으로 돌아가지 않고 울리지 않는다. 다시 고르면(차량 또는
   * "잘 모르겠어요") 이 키를 지운다. 기다리는 상태가 아니면 키를 두지 않아
   * 예전 저장 형식과 같은 모양으로 남는다(Favorite.pinned와 같은 방식).
   */
  awaitingVehicle?: true;
}

export interface AlertRecord {
  id: string;
  title: string;
  body: string;
  time: string;
  read: boolean;
  type: "dropoff" | "arrival" | "system";
}
