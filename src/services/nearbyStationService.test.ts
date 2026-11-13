import { describe, expect, it, vi } from "vitest";
import {
  CURRENT_LOCATION_NAME,
  NEARBY_LIMIT,
  findNearbyGroup,
} from "@/services/nearbyStationService";

const origin = { lat: 35.8, lng: 127.1 };
const row = (nodeId: string, lat: number, lng: number) => ({
  nodeId,
  name: `정류장${nodeId}`,
  arsId: "",
  lat,
  lng,
});

describe("findNearbyGroup", () => {
  it("가까운 순으로 정류장을 묶고 현재 위치를 기억한다", async () => {
    const fetchBox = vi.fn().mockResolvedValue([
      row("b", 35.803, 127.1),
      row("a", 35.801, 127.1),
    ]);
    const group = await findNearbyGroup(origin, fetchBox);
    expect(group?.name).toBe(CURRENT_LOCATION_NAME);
    expect(group?.origin).toEqual(origin);
    expect(group?.stations.map((s) => s.id)).toEqual(["a", "b"]);
    expect(fetchBox).toHaveBeenCalledTimes(1);
  });

  it("사각형 안이어도 반지름 밖이면 뺀다", async () => {
    // 사각형 모서리(약 0.0044도, 0.0054도)는 반지름 500m보다 멀다.
    const fetchBox = vi.fn().mockResolvedValue([row("corner", 35.8043, 127.1053)]);
    expect(await findNearbyGroup(origin, fetchBox)).toBeNull();
  });

  it("근처에 정류장이 없으면 null이다", async () => {
    expect(await findNearbyGroup(origin, vi.fn().mockResolvedValue([]))).toBeNull();
  });

  it(`후보는 ${NEARBY_LIMIT}개까지다`, async () => {
    const rows = Array.from({ length: 9 }, (_, i) => row(`s${i}`, 35.8 + i * 0.0003, 127.1));
    const group = await findNearbyGroup(origin, vi.fn().mockResolvedValue(rows));
    expect(group?.stations).toHaveLength(NEARBY_LIMIT);
  });

  it("조회가 실패하면 오류를 올린다", async () => {
    await expect(
      findNearbyGroup(origin, vi.fn().mockRejectedValue(new Error("HTTP 402"))),
    ).rejects.toThrow("HTTP 402");
  });
});
