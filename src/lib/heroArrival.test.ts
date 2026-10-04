import { describe, expect, it } from "vitest";
import {
  MINI_ROUTE_CELLS,
  heroArrivalView,
  miniRouteLayout,
  pickHeroFavorite,
  updatedLabel,
} from "@/lib/heroArrival";
import type { Favorite } from "@/types";
import type { ReliabilityState } from "@/lib/reliability";

const fav = (id: string, type: Favorite["type"]): Favorite => ({
  id,
  type,
  name: id,
  label: id,
  refId: id,
});

const LIVE: ReliabilityState = { source: "realtime", delayed: false };
const UNKNOWN: ReliabilityState = { source: "unknown", delayed: false };
const ESTIMATED: ReliabilityState = { source: "estimated", delayed: false };
const DELAYED_LIVE: ReliabilityState = { source: "realtime", delayed: true };
const DELAYED_ESTIMATED: ReliabilityState = { source: "estimated", delayed: true };

describe("pickHeroFavorite", () => {
  it("즐겨찾기 목록에서 첫 번째 stop_route를 고른다", () => {
    const list = [fav("a", "route"), fav("b", "stop_route"), fav("c", "stop_route")];
    expect(pickHeroFavorite(list)?.id).toBe("b");
  });

  it("stop_route가 없으면 null", () => {
    expect(pickHeroFavorite([fav("a", "route"), fav("b", "station")])).toBeNull();
    expect(pickHeroFavorite([])).toBeNull();
  });

  it("고정한 stop_route가 첫 번째 stop_route보다 먼저", () => {
    const list = [fav("a", "stop_route"), fav("b", "route"), { ...fav("c", "stop_route"), pinned: true }];
    expect(pickHeroFavorite(list)?.id).toBe("c");
  });

  it("stop_route가 아닌 항목은 pinned여도 히어로에 오르지 않는다", () => {
    const list = [{ ...fav("a", "route"), pinned: true }, fav("b", "stop_route")];
    expect(pickHeroFavorite(list)?.id).toBe("b");
  });

  it("pinned가 없는 예전 저장값은 첫 번째 stop_route", () => {
    // JSON으로 읽은 예전 형식 그대로: pinned 키 자체가 없다.
    const old = JSON.parse(
      '[{"id":"x","type":"route","name":"1번","label":"1","refId":"r"},' +
        '{"id":"y","type":"stop_route","name":"시청","label":"5","refId":"s"}]',
    ) as Favorite[];
    expect(pickHeroFavorite(old)?.id).toBe("y");
  });

  it("pinned: false는 고정하지 않은 것", () => {
    const list = [{ ...fav("a", "stop_route"), pinned: false }, fav("b", "stop_route")];
    expect(pickHeroFavorite(list)?.id).toBe("a");
  });
});

describe("heroArrivalView — 7-3 상태 표", () => {
  it("불러오는 중: 데이터 없이 loading", () => {
    const v = heroArrivalView(null, "loading", UNKNOWN);
    expect(v.state).toBe("loading");
    expect(v.chip).toBeNull();
  });

  it("조회 전(idle)도 불러오는 중으로 본다 — 앱을 열자마자 스켈레톤", () => {
    expect(heroArrivalView(null, "idle", UNKNOWN).state).toBe("loading");
  });

  it("정보 없음: 데이터 없이 error", () => {
    const v = heroArrivalView(null, "error", UNKNOWN);
    expect(v.state).toBe("error");
    expect(v.chip).toBeNull();
  });

  it("보통: minutes ≥ 1", () => {
    const v = heroArrivalView({ minutes: 3, stopsAway: 2 }, "success", LIVE);
    expect(v).toMatchObject({ state: "normal", minutes: 3, stopsAway: 2, chip: "live" });
  });

  it("곧 도착: minutes ≤ 0", () => {
    const v = heroArrivalView({ minutes: 0, stopsAway: 1 }, "success", LIVE);
    expect(v).toMatchObject({ state: "arriving", stopsAway: 1, chip: "live" });
  });

  it("곧 도착: stopsAway ≤ 0", () => {
    expect(heroArrivalView({ minutes: 2, stopsAway: 0 }, "success", LIVE).state).toBe("arriving");
  });

  it("시간 불확실: minutes === null, stopsAway 있음 → 확인 중 칩", () => {
    const v = heroArrivalView({ minutes: null, stopsAway: 2 }, "success", UNKNOWN);
    expect(v).toMatchObject({ state: "stopsOnly", stopsAway: 2, chip: "pending" });
  });

  it("시간 불확실은 신뢰도가 estimated여도 확인 중", () => {
    expect(heroArrivalView({ minutes: null, stopsAway: 4 }, "success", ESTIMATED).chip).toBe("pending");
  });

  it("지연 의심: 보통과 같고 칩만 지연 의심", () => {
    const v = heroArrivalView({ minutes: 9, stopsAway: 5 }, "success", DELAYED_LIVE);
    expect(v).toMatchObject({ state: "normal", chip: "delay" });
  });

  it("지연 의심이 확인 중보다 먼저", () => {
    const v = heroArrivalView({ minutes: null, stopsAway: 3 }, "success", DELAYED_ESTIMATED);
    expect(v).toMatchObject({ state: "stopsOnly", chip: "delay" });
  });

  it("시간은 있고 정거장 수가 없으면 보통 상태에 stopsAway null", () => {
    const v = heroArrivalView({ minutes: 5, stopsAway: null }, "success", LIVE);
    expect(v).toMatchObject({ state: "normal", minutes: 5, stopsAway: null, chip: "live" });
  });

  it("시간도 정거장 수도 없는 값은 정보 없음으로 본다", () => {
    expect(heroArrivalView({ minutes: null, stopsAway: null }, "success", UNKNOWN).state).toBe("error");
  });

  it("기점 대기: 시간이 없고 버스가 기점에 있으면 출발 전", () => {
    const v = heroArrivalView({ minutes: null, stopsAway: 3, atOrigin: true }, "success", UNKNOWN);
    expect(v).toMatchObject({ state: "atOrigin", stopsAway: 3, chip: null });
  });

  it("기점 대기여도 지연 의심이면 지연 칩", () => {
    expect(heroArrivalView({ minutes: null, stopsAway: 3, atOrigin: true }, "success", DELAYED_ESTIMATED).chip).toBe("delay");
  });

  it("기점에 있어도 TAGO 시간이 있으면 보통으로 보여 준다", () => {
    const v = heroArrivalView({ minutes: 5, stopsAway: 3, atOrigin: true }, "success", LIVE);
    expect(v).toMatchObject({ state: "normal", minutes: 5, chip: "live" });
  });

  it("내 정류장이 기점이라 정거장 수가 0이면 곧 도착이 먼저", () => {
    expect(heroArrivalView({ minutes: null, stopsAway: 0, atOrigin: true }, "success", UNKNOWN).state).toBe("arriving");
  });

  it("갱신 중 실패해 데이터가 사라지면 예전 값을 남기지 않고 정보 없음", () => {
    expect(heroArrivalView(null, "error", LIVE).state).toBe("error");
  });
});

describe("miniRouteLayout — 7-4 미니 노선도", () => {
  it("항상 5칸", () => {
    expect(MINI_ROUTE_CELLS).toBe(5);
  });

  it("버스는 핀에서 왼쪽으로 stopsAway칸", () => {
    expect(miniRouteLayout(2)).toEqual({ bus: { kind: "cell", index: 3 }, overflow: 0 });
    expect(miniRouteLayout(1)).toEqual({ bus: { kind: "cell", index: 4 }, overflow: 0 });
    expect(miniRouteLayout(5)).toEqual({ bus: { kind: "cell", index: 0 }, overflow: 0 });
  });

  it("5칸보다 멀면 왼쪽 끝 + 그리지 못한 나머지 정거장 수", () => {
    expect(miniRouteLayout(8)).toEqual({ bus: { kind: "cell", index: 0 }, overflow: 3 });
    expect(miniRouteLayout(6)).toEqual({ bus: { kind: "cell", index: 0 }, overflow: 1 });
  });

  it("0 이하일 때만 핀 바로 왼쪽", () => {
    expect(miniRouteLayout(0)).toEqual({ bus: { kind: "atPin" }, overflow: 0 });
    expect(miniRouteLayout(-1)).toEqual({ bus: { kind: "atPin" }, overflow: 0 });
  });

  it("null이면 마커를 그리지 않는다", () => {
    expect(miniRouteLayout(null)).toEqual({ bus: null, overflow: 0 });
  });

  it("소수가 와도 칸 단위로 반올림한다", () => {
    expect(miniRouteLayout(2.4)).toEqual({ bus: { kind: "cell", index: 3 }, overflow: 0 });
  });
});

describe("updatedLabel — 갱신 시각 문구", () => {
  const t0 = 1_000_000;

  it("새 응답을 받은 적이 없으면 비운다", () => {
    expect(updatedLabel(null, t0, false)).toBe("");
  });

  it("1분 미만은 방금 갱신", () => {
    expect(updatedLabel(t0, t0 + 59_000, false)).toBe("방금 갱신");
  });

  it("시계가 응답 시각보다 앞서 있어도 방금 갱신", () => {
    expect(updatedLabel(t0, t0 - 5_000, false)).toBe("방금 갱신");
  });

  it("1분 이상은 N분 전 갱신 (내림)", () => {
    expect(updatedLabel(t0, t0 + 60_000, false)).toBe("1분 전 갱신");
    expect(updatedLabel(t0, t0 + 179_000, false)).toBe("2분 전 갱신");
  });

  it("새로고침 중이면 갱신 중", () => {
    expect(updatedLabel(t0, t0 + 120_000, true)).toBe("갱신 중");
  });
});
