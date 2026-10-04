import type { CSSProperties } from "react";
import { Bus, MapPin } from "lucide-react";
import { MINI_ROUTE_CELLS, miniRouteLayout } from "@/lib/heroArrival";

/*
 * 미니 노선도 (DESIGN.md 7-4).
 *
 * 전주 실시간 API는 GPS 좌표가 아니라 "가장 가까운 정류장"만 준다. 그래서
 * 연속된 진행 바가 아니라 정류장 칸으로 그린다. stopsAway 하나로만 그리고
 * 추가 조회는 없다.
 *
 * 가로 위치는 모두 rem과 %로 계산한다. px로 두면 "큰 글씨"에서 마커는
 * 커지는데 간격은 그대로라 서로 겹친다.
 *
 * - 노드 0~4: 정류장 점, 노드 5: 내 정류장 핀(오른쪽 끝)
 * - 노드 0의 중심을 왼쪽에서 2.25rem 띄운다. "+N"이 들어갈 자리다. 이 자리를
 *   늘 비워 둬야 "+N"이 생기고 사라질 때 점들이 옆으로 밀리지 않는다.
 *   평소에는 지나온 구간 실선이 이 자리까지 이어진다.
 */

const LEAD = "2.25rem"; // 노드 0 중심 (= "+N" 자리 + 버스 반지름)
const PIN_R = "0.625rem"; // 핀 20px의 반
const SPAN = `(100% - ${LEAD} - ${PIN_R})`; // 노드 0 ~ 노드 5 거리

/** 노드 i의 가로 중심 */
const nodeX = (i: number) => `calc(${LEAD} + ${SPAN} * ${i} / ${MINI_ROUTE_CELLS})`;
/** 핀 바로 왼쪽 버스 중심: 핀 반지름 + 버스 반지름(0.75rem) + 틈 0.125rem */
const AT_PIN_X = `calc(100% - ${PIN_R} - 1.5rem)`;
/** 점(8px) 둘레에 남길 틈. 점선이 빈 점 안으로 지나가지 않게 한다. */
const DOT_GAP = "0.375rem";

const centerAt = (x: string): CSSProperties => ({ left: x, top: "50%", transform: "translate(-50%, -50%)" });

export function MiniRouteLine({
  stopsAway,
  atOrigin = false,
}: {
  stopsAway: number | null;
  /** 버스가 노선 첫 정류장(기점)에 서 있다. 지나온 구간이 없으므로 버스
   *  왼쪽의 실선과 점을 그리지 않는다 — 그리면 이미 달려오는 버스로 읽힌다. */
  atOrigin?: boolean;
}) {
  const { bus, overflow } = miniRouteLayout(stopsAway);

  const busIndex = bus == null ? null : bus.kind === "atPin" ? MINI_ROUTE_CELLS : bus.index;
  const busX = bus == null ? null : bus.kind === "atPin" ? AT_PIN_X : nodeX(bus.index);

  const label =
    bus == null
      ? "버스의 정거장 정보가 없어요"
      : atOrigin && bus.kind === "cell"
        ? `버스가 기점에서 출발을 기다려요. 내 정류장까지 ${Math.round(stopsAway ?? 0)}정거장`
        : bus.kind === "atPin"
        ? "버스가 곧 내 정류장에 도착해요"
        : `버스가 내 정류장 ${Math.round(stopsAway ?? 0)}정거장 전에 있어요`;

  return (
    <span role="img" aria-label={label} className="relative block h-7 w-full">
      {bus == null ? (
        /* 정거장 수를 모르면 점선과 핀만 그린다. 버스가 어디 있는지 지어내지 않는다. */
        <span
          aria-hidden="true"
          className="absolute left-0 h-0 border-t-2 border-dotted border-white/60 -translate-y-1/2"
          style={{ top: "50%", width: `calc(100% - ${PIN_R})` }}
        />
      ) : (
        <>
          {/* 남은 구간: 칸마다 점선. 양 끝을 점 둘레만큼 비워 빈 점(○) 안으로
              선이 지나가지 않게 한다. 지나온 칸의 점선은 아래 실선이 덮는다. */}
          {Array.from({ length: MINI_ROUTE_CELLS }, (_, i) => i).filter((i) => !atOrigin || busIndex == null || i >= busIndex).map((i) => (
            <span
              key={i}
              aria-hidden="true"
              className="absolute h-0 border-t-2 border-dotted border-white/60 -translate-y-1/2"
              style={{
                top: "50%",
                left: `calc(${nodeX(i)} + ${DOT_GAP})`,
                width: `calc(${SPAN} / ${MINI_ROUTE_CELLS} - ${DOT_GAP} * 2)`,
              }}
            />
          ))}

          {/* 지나온 구간: 버스 왼쪽 흰 실선. "+N"이 있으면 그 자리는 비운다.
              기점 대기면 지나온 구간이 없어 그리지 않는다. */}
          {overflow === 0 && !atOrigin && busX && (
            <span
              aria-hidden="true"
              className="absolute left-0 h-0.5 bg-white -translate-y-1/2 transition-[width] duration-400 ease-out"
              style={{ top: "50%", width: busX }}
            />
          )}
        </>
      )}

      {/* 정류장 점 8px. 지나온 점은 채우고, 남은 점은 테두리만. */}
      {busIndex != null &&
        Array.from({ length: MINI_ROUTE_CELLS }, (_, i) => i).filter((i) => !atOrigin || i > busIndex).map((i) => (
          <span
            key={i}
            aria-hidden="true"
            className={`absolute w-2 h-2 rounded-full ${
              i < busIndex ? "bg-white" : "border-2 border-white/60"
            }`}
            style={centerAt(nodeX(i))}
          />
        ))}

      {/* 내 정류장 핀: 흰 원 20px + brand MapPin */}
      <span
        aria-hidden="true"
        className="absolute w-5 h-5 rounded-full bg-white flex items-center justify-center"
        style={centerAt(nodeX(MINI_ROUTE_CELLS))}
      >
        <MapPin className="w-3 h-3 text-brand" />
      </span>

      {/* 5칸보다 멀면 버스 왼쪽에 남은 정거장 수. 오른쪽 끝을 마커 앞에 맞추고
          글자가 길어지면 왼쪽으로 자란다. */}
      {overflow > 0 && (
        <span
          aria-hidden="true"
          className="absolute text-micro text-white tabular-nums whitespace-nowrap -translate-y-1/2"
          style={{ top: "50%", right: "calc(100% - 1.25rem)" }}
        >
          +{overflow}
        </span>
      )}

      {/* 버스 마커: 흰 원 24px + brand Bus. 위치가 바뀌면 400ms 동안 옮겨 간다. */}
      {busX && (
        <span
          aria-hidden="true"
          className="absolute w-6 h-6 rounded-full bg-white flex items-center justify-center transition-[left] duration-400 ease-out"
          style={centerAt(busX)}
        >
          <Bus className="w-3.5 h-3.5 text-brand" />
        </span>
      )}
    </span>
  );
}
