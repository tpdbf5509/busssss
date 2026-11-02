import { describe, expect, it } from "vitest";
import type { Station } from "@/types/route";
import { boundingBox, distanceMeters, formatDistance, nearestStations } from "./geo";

// 전주역과 전주시청 근처의 실제 좌표(어림). 두 곳은 직선으로 약 5km 떨어져 있다.
const JEONJU_STATION = { lat: 35.8502, lng: 127.1618 };
const JEONJU_CITY_HALL = { lat: 35.8242, lng: 127.148 };

const st = (id: string, lat: number | null, lng: number | null): Station => ({
  id,
  name: `정류장${id}`,
  arsId: "",
  lat,
  lng,
});

describe("distanceMeters", () => {
  it("같은 지점은 0이다", () => {
    expect(distanceMeters(JEONJU_STATION, JEONJU_STATION)).toBe(0);
  });

  it("위도 0.001도는 약 111m다", () => {
    const d = distanceMeters({ lat: 35.8, lng: 127.1 }, { lat: 35.801, lng: 127.1 });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });

  it("전주역과 시청은 3km 안팎이다", () => {
    const d = distanceMeters(JEONJU_STATION, JEONJU_CITY_HALL);
    expect(d).toBeGreaterThan(2500);
    expect(d).toBeLessThan(3500);
  });

  it("순서를 바꿔도 같다", () => {
    expect(distanceMeters(JEONJU_STATION, JEONJU_CITY_HALL)).toBeCloseTo(
      distanceMeters(JEONJU_CITY_HALL, JEONJU_STATION),
      6,
    );
  });
});

describe("boundingBox", () => {
  it("반지름 안의 모든 지점을 포함한다(동서남북 끝)", () => {
    const box = boundingBox(JEONJU_STATION, 500);
    const north = { lat: JEONJU_STATION.lat + 0.0044, lng: JEONJU_STATION.lng }; // 약 489m
    const east = { lat: JEONJU_STATION.lat, lng: JEONJU_STATION.lng + 0.0054 }; // 약 490m
    for (const p of [north, east]) {
      expect(distanceMeters(JEONJU_STATION, p)).toBeLessThan(500);
      expect(p.lat).toBeGreaterThanOrEqual(box.minLat);
      expect(p.lat).toBeLessThanOrEqual(box.maxLat);
      expect(p.lng).toBeGreaterThanOrEqual(box.minLng);
      expect(p.lng).toBeLessThanOrEqual(box.maxLng);
    }
  });

  it("경도 폭이 위도 폭보다 넓다(위도가 높아 경도 1도가 짧음)", () => {
    const box = boundingBox(JEONJU_STATION, 500);
    expect(box.maxLng - box.minLng).toBeGreaterThan(box.maxLat - box.minLat);
  });
});

describe("nearestStations", () => {
  const origin = { lat: 35.8, lng: 127.1 };

  it("반지름 밖과 좌표 없는 정류장을 빼고 가까운 순으로 정렬한다", () => {
    const list = nearestStations(
      origin,
      [
        st("far", 35.81, 127.1), // 약 1.1km
        st("mid", 35.803, 127.1), // 약 330m
        st("none", null, null),
        st("near", 35.801, 127.1), // 약 110m
      ],
      500,
      5,
    );
    expect(list.map((n) => n.station.id)).toEqual(["near", "mid"]);
    expect(list[0].distance).toBeLessThan(list[1].distance);
  });

  it("개수 제한을 지킨다", () => {
    const stations = [1, 2, 3, 4].map((i) => st(`s${i}`, 35.8 + i * 0.0005, 127.1));
    expect(nearestStations(origin, stations, 500, 2)).toHaveLength(2);
  });

  it("근처에 아무것도 없으면 빈 목록이다", () => {
    expect(nearestStations(origin, [st("far", 36, 127.5)], 500, 5)).toEqual([]);
  });
});

describe("formatDistance", () => {
  it("1km 아래는 10m 단위로 내리고 최소 10m다", () => {
    expect(formatDistance(234)).toBe("230m");
    expect(formatDistance(4)).toBe("10m");
    expect(formatDistance(999)).toBe("990m");
  });

  it("1km부터는 소수 한 자리 km로 내린다", () => {
    expect(formatDistance(1000)).toBe("1.0km");
    expect(formatDistance(1990)).toBe("1.9km");
  });

  it("잘못된 값은 빈 글자다", () => {
    expect(formatDistance(NaN)).toBe("");
    expect(formatDistance(-5)).toBe("");
  });
});
