import { describe, expect, it } from "vitest";
import { isSettled } from "@/lib/asyncStatus";

describe("isSettled — 조회가 끝났는지 (성공이든 실패든)", () => {
  it("idle: 아직 시작 전이라 끝나지 않았다", () => {
    expect(isSettled("idle")).toBe(false);
  });

  it("loading: 받는 중이라 끝나지 않았다", () => {
    expect(isSettled("loading")).toBe(false);
  });

  it("success: 끝났다", () => {
    expect(isSettled("success")).toBe(true);
  });

  it("error: 실패도 끝난 것이다 — 기다리던 쪽이 영원히 멈추지 않게", () => {
    expect(isSettled("error")).toBe(true);
  });
});
