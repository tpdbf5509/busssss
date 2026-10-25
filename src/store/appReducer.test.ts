import { describe, expect, it } from "vitest";
import { reducer } from "@/store/appReducer";
import { pickHeroFavorite, pickHeroFavoriteForSlot } from "@/lib/heroArrival";
import type { AppState } from "@/store/appContext";
import type { AlertSetting, Favorite } from "@/types";

const fav = (id: string, type: Favorite["type"], extra: Partial<Favorite> = {}): Favorite => ({
  id,
  type,
  name: id,
  label: id,
  refId: id,
  ...extra,
});

const state = (favorites: Favorite[], storageError: AppState["storageError"] = null): AppState => ({
  region: { sido: "전북특별자치도", sigungu: "전주시" },
  favorites,
  recentRoutes: [],
  cardBalance: 0,
  alerts: [],
  storageError,
});

const pinnedIds = (s: AppState) => s.favorites.filter((f) => f.pinned).map((f) => f.id);

describe("reducer — SET_FAVORITE_PIN", () => {
  it("stop_route를 고정한다", () => {
    const s = reducer(state([fav("a", "stop_route"), fav("b", "stop_route")]), {
      type: "SET_FAVORITE_PIN",
      id: "b",
      pinned: true,
    });
    expect(pinnedIds(s)).toEqual(["b"]);
  });

  it("고정은 하나만 남는다 — 새로 고정하면 기존 고정이 풀린다", () => {
    let s = state([fav("a", "stop_route"), fav("b", "stop_route"), fav("c", "stop_route")]);
    s = reducer(s, { type: "SET_FAVORITE_PIN", id: "a", pinned: true });
    s = reducer(s, { type: "SET_FAVORITE_PIN", id: "c", pinned: true });
    expect(pinnedIds(s)).toEqual(["c"]);
  });

  it("풀린 항목에는 pinned 키를 남기지 않는다 (예전 저장 형식과 같은 모양)", () => {
    let s = state([fav("a", "stop_route"), fav("b", "stop_route")]);
    s = reducer(s, { type: "SET_FAVORITE_PIN", id: "a", pinned: true });
    s = reducer(s, { type: "SET_FAVORITE_PIN", id: "b", pinned: true });
    expect("pinned" in s.favorites[0]).toBe(false);
  });

  it("고정을 해제한다", () => {
    let s = state([fav("a", "stop_route", { pinned: true }), fav("b", "stop_route")]);
    s = reducer(s, { type: "SET_FAVORITE_PIN", id: "a", pinned: false });
    expect(pinnedIds(s)).toEqual([]);
    expect("pinned" in s.favorites[0]).toBe(false);
  });

  it("stop_route가 아니면 고정하지 않는다", () => {
    const before = state([fav("a", "route"), fav("b", "station"), fav("c", "stop_route", { pinned: true })]);
    const afterRoute = reducer(before, { type: "SET_FAVORITE_PIN", id: "a", pinned: true });
    const afterStation = reducer(before, { type: "SET_FAVORITE_PIN", id: "b", pinned: true });
    expect(afterRoute).toBe(before);
    expect(afterStation).toBe(before);
  });

  it("없는 id면 상태를 그대로 둔다", () => {
    const before = state([fav("a", "stop_route")]);
    expect(reducer(before, { type: "SET_FAVORITE_PIN", id: "zz", pinned: true })).toBe(before);
  });

  it("이미 고정된 것을 다시 고정해도 하나만 남는다", () => {
    let s = state([fav("a", "stop_route", { pinned: true }), fav("b", "stop_route")]);
    s = reducer(s, { type: "SET_FAVORITE_PIN", id: "a", pinned: true });
    expect(pinnedIds(s)).toEqual(["a"]);
  });

  it("사용자 편집이라 저장 잠금을 푼다 (다른 편집 동작과 같음)", () => {
    const locked = state([fav("a", "stop_route")], { favorites: true, alerts: false, dismissed: false });
    const s = reducer(locked, { type: "SET_FAVORITE_PIN", id: "a", pinned: true });
    expect(s.storageError).toBeNull();
  });
});

describe("고정과 히어로", () => {
  it("고정한 항목이 히어로에 오른다", () => {
    let s = state([fav("a", "stop_route"), fav("b", "route"), fav("c", "stop_route")]);
    expect(pickHeroFavorite(s.favorites)?.id).toBe("a");
    s = reducer(s, { type: "SET_FAVORITE_PIN", id: "c", pinned: true });
    expect(pickHeroFavorite(s.favorites)?.id).toBe("c");
  });

  it("고정한 항목을 지우면 첫 번째 stop_route가 히어로로 돌아온다", () => {
    let s = state([fav("a", "route"), fav("b", "stop_route"), fav("c", "stop_route")]);
    s = reducer(s, { type: "SET_FAVORITE_PIN", id: "c", pinned: true });
    s = reducer(s, { type: "REMOVE_FAVORITE", id: "c" });
    expect(pinnedIds(s)).toEqual([]);
    expect(pickHeroFavorite(s.favorites)?.id).toBe("b");
  });

  it("마지막 stop_route까지 지우면 히어로가 빈다 (점선 카드)", () => {
    let s = state([fav("a", "station"), fav("b", "stop_route", { pinned: true })]);
    s = reducer(s, { type: "REMOVE_FAVORITE", id: "b" });
    expect(pickHeroFavorite(s.favorites)).toBeNull();
  });

  it("고정을 해제하면 첫 번째 stop_route로 돌아간다", () => {
    let s = state([fav("a", "stop_route"), fav("b", "stop_route", { pinned: true })]);
    s = reducer(s, { type: "SET_FAVORITE_PIN", id: "b", pinned: false });
    expect(pickHeroFavorite(s.favorites)?.id).toBe("a");
  });

  it("저장했다 다시 읽어도 고정이 남는다 (localStorage는 JSON)", () => {
    let s = state([fav("a", "stop_route"), fav("b", "stop_route")]);
    s = reducer(s, { type: "SET_FAVORITE_PIN", id: "b", pinned: true });
    const reloaded = JSON.parse(JSON.stringify(s.favorites)) as Favorite[];
    expect(pickHeroFavorite(reloaded)?.id).toBe("b");
  });
});

describe("reducer — 하차 알림 차량 고정", () => {
  const alert = (extra: Partial<AlertSetting> = {}): AlertSetting => ({
    id: "a1",
    routeId: "R1004",
    routeName: "본선1004",
    routeNumber: "1004",
    targetStation: "전북대",
    targetStopOrder: 8,
    stopsBefore: 2,
    sound: true,
    vibrate: true,
    active: true,
    ...extra,
  });
  const withAlerts = (alerts: AlertSetting[], storageError: AppState["storageError"] = null): AppState => ({
    ...state([], storageError),
    alerts,
  });

  it("차량을 고르면 vehicleNo와 boundAt만 붙고, 다시 고르기 대기는 끝난다", () => {
    const s = reducer(withAlerts([alert({ awaitingVehicle: true })]), {
      type: "SET_ALERT_VEHICLE",
      id: "a1",
      vehicleNo: "5668",
      boundAt: 1000,
    });
    expect(s.alerts[0]).toEqual(alert({ vehicleNo: "5668", boundAt: 1000 }));
    expect("awaitingVehicle" in s.alerts[0]).toBe(false);
  });

  it("'잘 모르겠어요'는 고정 키를 모두 지워 예전 저장 형식과 같은 모양이 된다", () => {
    const s = reducer(withAlerts([alert({ vehicleNo: "5668", boundAt: 1000 })]), {
      type: "SET_ALERT_VEHICLE",
      id: "a1",
      vehicleNo: null,
      boundAt: 2000,
    });
    expect(Object.keys(s.alerts[0]).sort()).toEqual(Object.keys(alert()).sort());
  });

  it("감시가 고정을 풀면 다시 고르기 대기가 된다", () => {
    const s = reducer(withAlerts([alert({ vehicleNo: "5668", boundAt: 1000 })]), {
      type: "RELEASE_ALERT_VEHICLE",
      id: "a1",
      vehicleNo: "5668",
      boundAt: 1000,
    });
    expect(s.alerts[0]).toEqual(alert({ awaitingVehicle: true }));
    expect(s.alerts[0].active).toBe(true);
  });

  it("그 사이 사용자가 새로 고정했으면 푸는 요청을 무시한다", () => {
    const before = withAlerts([alert({ vehicleNo: "5670", boundAt: 3000 })]);
    const s = reducer(before, {
      type: "RELEASE_ALERT_VEHICLE",
      id: "a1",
      vehicleNo: "5668",
      boundAt: 1000,
    });
    expect(s).toBe(before);
  });

  it("푸는 것은 자동 동작이라 저장 잠금을 풀지 않는다", () => {
    const lock = { favorites: false, alerts: true, dismissed: false };
    const s = reducer(withAlerts([alert({ vehicleNo: "5668", boundAt: 1000 })], lock), {
      type: "RELEASE_ALERT_VEHICLE",
      id: "a1",
      vehicleNo: "5668",
      boundAt: 1000,
    });
    expect(s.storageError).toEqual(lock);
  });
});

describe("reducer — SET_FAVORITE_COMMUTE (6단계)", () => {
  const commuteIds = (s: AppState, slot: "morning" | "evening") =>
    s.favorites.filter((f) => f.commute === slot).map((f) => f.id);

  it("stop_route를 출근·퇴근으로 지정한다", () => {
    let s = state([fav("a", "stop_route"), fav("b", "stop_route")]);
    s = reducer(s, { type: "SET_FAVORITE_COMMUTE", id: "a", slot: "morning" });
    s = reducer(s, { type: "SET_FAVORITE_COMMUTE", id: "b", slot: "evening" });
    expect(commuteIds(s, "morning")).toEqual(["a"]);
    expect(commuteIds(s, "evening")).toEqual(["b"]);
  });

  it("같은 시간대는 하나만 남는다 — 새로 지정하면 기존 지정이 풀린다", () => {
    let s = state([fav("a", "stop_route"), fav("b", "stop_route")]);
    s = reducer(s, { type: "SET_FAVORITE_COMMUTE", id: "a", slot: "morning" });
    s = reducer(s, { type: "SET_FAVORITE_COMMUTE", id: "b", slot: "morning" });
    expect(commuteIds(s, "morning")).toEqual(["b"]);
    expect("commute" in s.favorites[0]).toBe(false);
  });

  it("한 즐겨찾기를 퇴근으로 바꾸면 출근 지정은 사라진다(키가 하나)", () => {
    let s = state([fav("a", "stop_route")]);
    s = reducer(s, { type: "SET_FAVORITE_COMMUTE", id: "a", slot: "morning" });
    s = reducer(s, { type: "SET_FAVORITE_COMMUTE", id: "a", slot: "evening" });
    expect(s.favorites[0].commute).toBe("evening");
  });

  it("null이면 지정을 풀고 키를 남기지 않는다(예전 저장 형식과 같은 모양)", () => {
    let s = state([fav("a", "stop_route")]);
    s = reducer(s, { type: "SET_FAVORITE_COMMUTE", id: "a", slot: "morning" });
    s = reducer(s, { type: "SET_FAVORITE_COMMUTE", id: "a", slot: null });
    expect("commute" in s.favorites[0]).toBe(false);
    expect(JSON.stringify(s.favorites[0])).not.toContain("commute");
  });

  it("stop_route가 아니면 지정하지 않는다", () => {
    const before = state([fav("r", "route"), fav("s", "station")]);
    expect(reducer(before, { type: "SET_FAVORITE_COMMUTE", id: "r", slot: "morning" })).toBe(before);
    expect(reducer(before, { type: "SET_FAVORITE_COMMUTE", id: "s", slot: "evening" })).toBe(before);
  });

  it("없는 id나 바뀔 게 없는 요청은 같은 상태를 돌려준다", () => {
    const before = state([fav("a", "stop_route")]);
    expect(reducer(before, { type: "SET_FAVORITE_COMMUTE", id: "zz", slot: "morning" })).toBe(before);
    expect(reducer(before, { type: "SET_FAVORITE_COMMUTE", id: "a", slot: null })).toBe(before);
    const set = reducer(before, { type: "SET_FAVORITE_COMMUTE", id: "a", slot: "morning" });
    expect(reducer(set, { type: "SET_FAVORITE_COMMUTE", id: "a", slot: "morning" })).toBe(set);
  });

  it("고정(pinned)과 독립이다 — 지정해도 고정은 그대로", () => {
    let s = state([fav("a", "stop_route", { pinned: true }), fav("b", "stop_route")]);
    s = reducer(s, { type: "SET_FAVORITE_COMMUTE", id: "b", slot: "morning" });
    expect(pinnedIds(s)).toEqual(["a"]);
    s = reducer(s, { type: "SET_FAVORITE_PIN", id: "b", pinned: true });
    expect(s.favorites.find((f) => f.id === "b")?.commute).toBe("morning");
  });

  it("지정한 즐겨찾기를 지우면 시간대 지정도 함께 사라져 고정 → 첫 번째로 돌아간다", () => {
    let s = state([fav("a", "stop_route"), fav("b", "stop_route", { commute: "morning" })]);
    s = reducer(s, { type: "REMOVE_FAVORITE", id: "b" });
    expect(pickHeroFavoriteForSlot(s.favorites, "morning")?.id).toBe("a");
  });
});
