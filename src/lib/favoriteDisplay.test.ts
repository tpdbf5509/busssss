import { describe, expect, it } from "vitest";
import { favoriteSubtitle, favoriteTitle, hasCustomLabel } from "@/lib/favoriteDisplay";
import type { Favorite } from "@/types";
import type { Route } from "@/types/route";

const route = { id: "R5", number: "5", end: "송천동" } as Route;

const stopRoute = (label = "5"): Favorite => ({
  id: "s",
  type: "stop_route",
  name: "시청",
  label,
  refId: "s",
  stopName: "시청",
  routeNumber: "5",
});
const routeFav = (label = "5"): Favorite => ({ id: "r", type: "route", name: "5번", label, refId: "R5" });
const station = (label: string): Favorite => ({ id: "t", type: "station", name: "전북대 정문", label, refId: "JUB1" });

describe("favoriteDisplay — 7-5 행 이름과 방향", () => {
  it("stop_route 기본값: 정류장 이름 / 종점 방면", () => {
    expect(hasCustomLabel(stopRoute())).toBe(false);
    expect(favoriteTitle(stopRoute(), "시청")).toBe("시청");
    expect(favoriteSubtitle(stopRoute(), route)).toBe("송천동 방면");
  });

  it("stop_route에 사용자가 이름을 붙이면 그 이름", () => {
    expect(favoriteTitle(stopRoute("집"), "시청")).toBe("집");
  });

  it("route 기본값: N번 / 종점 방면", () => {
    expect(favoriteTitle(routeFav(), "5")).toBe("5번");
    expect(favoriteSubtitle(routeFav(), route, "5")).toBe("송천동 방면");
  });

  it("route에 사용자가 이름을 붙이면 그 이름", () => {
    expect(favoriteTitle(routeFav("출근"), "5")).toBe("출근");
  });

  it("station 기본값(정류장 번호·'정류장'): 정류장 이름 / '정류장'", () => {
    for (const label of ["30512", "정류장"]) {
      expect(favoriteTitle(station(label))).toBe("전북대 정문");
      expect(favoriteSubtitle(station(label))).toBe("정류장");
    }
  });

  it("station에 사용자가 이름을 붙이면 이름 / 실제 정류장 이름", () => {
    expect(favoriteTitle(station("집"))).toBe("집");
    expect(favoriteSubtitle(station("집"))).toBe("전북대 정문");
  });

  it("노선을 아직 못 찾았으면 둘째 줄은 비운다 (줄 높이는 화면에서 유지)", () => {
    expect(favoriteSubtitle(stopRoute(), undefined)).toBe("");
  });
});
