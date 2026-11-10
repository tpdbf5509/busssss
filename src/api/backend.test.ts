import { describe, expect, it } from "vitest";
import { buildProxyRequest, buildStaticUrl, usesCloudflare } from "@/api/backend";

describe("buildProxyRequest", () => {
  it("Cloudflare 주소가 있으면 /api/{이름}으로 보내고 키를 붙이지 않는다", () => {
    const req = buildProxyRequest(
      { apiBaseUrl: "https://api.example.workers.dev/", supabaseUrl: "https://x.supabase.co", supabaseAnonKey: "k" },
      "tago",
      { path: "/A/b", cityCode: "35010" },
    );
    expect(req.url).toBe("https://api.example.workers.dev/api/tago?path=%2FA%2Fb&cityCode=35010");
    expect(req.headers).toBeUndefined();
  });

  it("주소가 없으면 Supabase 엣지 함수로 보낸다", () => {
    const req = buildProxyRequest({ supabaseUrl: "https://x.supabase.co/", supabaseAnonKey: "k" }, "bis", { routeId: "1" });
    expect(req.url).toBe("https://x.supabase.co/functions/v1/bis-proxy?routeId=1");
    expect(req.headers).toEqual({ Authorization: "Bearer k", apikey: "k" });
  });

  it("둘 다 없으면 오류", () => {
    expect(() => buildProxyRequest({}, "jeonju", {})).toThrow("VITE_SUPABASE_URL");
  });

  it("빈 문자열 주소는 Cloudflare로 보지 않는다", () => {
    expect(usesCloudflare({ apiBaseUrl: "  " })).toBe(false);
  });

  it("정적 파일 주소", () => {
    expect(buildStaticUrl({ apiBaseUrl: "https://a.dev/" }, "routes")).toBe("https://a.dev/static/routes.json");
  });
});
