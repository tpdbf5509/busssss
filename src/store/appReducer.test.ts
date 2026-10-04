import { describe, expect, it } from "vitest";
import { reducer } from "@/store/appReducer";
import { pickHeroFavorite } from "@/lib/heroArrival";
import type { AppState } from "@/store/appContext";
import type { Favorite } from "@/types";

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
