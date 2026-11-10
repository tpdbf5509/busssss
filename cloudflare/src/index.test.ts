import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleRequest, isOriginAllowed, type Env, type KVLike } from "./index";
import { clearUpstreamCache, normalizeServiceKey, SAFE_PATH } from "./upstream";

function fakeKv(): KVLike & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    get: async (key) => store.get(key) ?? null,
    put: async (key, value) => {
      store.set(key, value);
    },
  };
}

function makeEnv(overrides: Partial<Env> = {}): Env & { STATIC: ReturnType<typeof fakeKv> } {
  return {
    STATIC: fakeKv(),
    TAGO_API_KEY: "KEY%2Bx",
    ADMIN_TOKEN: "secret",
    ALLOWED_ORIGINS: "https://app.example",
    ...overrides,
  } as Env & { STATIC: ReturnType<typeof fakeKv> };
}

const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(`https://api.test${path}`, { headers });

const source = {
  master: [{ brt_stdid: "100", route_no: "103", category: "본선", start_node: "가", end_node: "나", start_time: "600", end_time: "2200" }],
  cache: [],
  stops: [
    { route_id: "100", sequence_no: 1, node_id: "N1", node_name: "가정류장", ars_id: "111" },
    { route_id: "100", sequence_no: 2, node_id: "N2", node_name: "나정류장", ars_id: "222" },
  ],
};

const post = (body: unknown, token?: string) =>
  new Request("https://api.test/admin/import", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => clearUpstreamCache());
afterEach(() => vi.restoreAllMocks());

describe("프록시", () => {
  it("TAGO 요청에 우리 키와 _type=xml을 붙이고, 호출자가 보낸 serviceKey는 버린다", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<response/>"));
    const res = await handleRequest(
      get("/api/tago?path=/ArvlInfoInqireService/getList&cityCode=35010&serviceKey=evil", { Origin: "https://app.example" }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("X-BUS-Cache")).toBe("MISS");
    const url = String(spy.mock.calls[0][0]);
    expect(url).toContain("https://apis.data.go.kr/1613000/ArvlInfoInqireService/getList?serviceKey=KEY%2Bx&");
    expect(url).toContain("_type=xml");
    expect(url).not.toContain("evil");
  });

  it("같은 요청은 캐시에서 준다", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("<response/>"));
    const env = makeEnv();
    await handleRequest(get("/api/tago?path=/A/b&x=1"), env);
    const second = await handleRequest(get("/api/tago?path=/A/b&x=1"), env);
    expect(second.headers.get("X-BUS-Cache")).toBe("HIT");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("기관의 XML 오류 응답은 캐시하지 않는다", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("<OpenAPI_ServiceResponse></OpenAPI_ServiceResponse>"));
    const env = makeEnv();
    await handleRequest(get("/api/tago?path=/A/b"), env);
    await handleRequest(get("/api/tago?path=/A/b"), env);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("상류가 실패하면 묵은 응답을 주지 않고 오류를 그대로 돌려준다", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("boom"));
    const res = await handleRequest(get("/api/tago?path=/A/b"), makeEnv());
    expect(res.status).toBe(504);
  });

  it("전주시 /realtime 경로는 realtime 아래로 보낸다", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<RFC30/>"));
    await handleRequest(get("/api/jeonju?path=/realtime/bus_location_bus_position_common&brtStdid=1"), makeEnv());
    expect(String(spy.mock.calls[0][0])).toContain("https://apis.data.go.kr/4641000/realtime/bus_location_bus_position_common?serviceKey=");
  });

  it("전주시 API가 403이면 물러났다가 다시 시도한다", async () => {
    vi.useFakeTimers();
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("no", { status: 403 }))
      .mockResolvedValueOnce(new Response("<RFC30/>"));
    const pending = handleRequest(get("/api/jeonju?path=/bus_location1_common&brtId=1"), makeEnv());
    await vi.advanceTimersByTimeAsync(1000);
    const res = await pending;
    vi.useRealTimers();
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("path에 이상한 글자가 있으면 거절한다", async () => {
    for (const bad of ["no-slash", "/a?x=1", "/a/../b", "//a", "/a b"]) {
      const res = await handleRequest(get(`/api/tago?path=${encodeURIComponent(bad)}`), makeEnv());
      expect(res.status).toBe(400);
    }
    expect(SAFE_PATH.test("/BusRouteInfoInqireService/getRouteNoList")).toBe(true);
  });

  it("서비스키가 없으면 500", async () => {
    const res = await handleRequest(get("/api/tago?path=/A/b"), makeEnv({ TAGO_API_KEY: "" }));
    expect(res.status).toBe(500);
  });

  it("허용하지 않은 주소의 브라우저 요청은 403", async () => {
    const res = await handleRequest(get("/api/tago?path=/A/b", { Origin: "https://evil.example" }), makeEnv());
    expect(res.status).toBe(403);
  });

  it("bis는 시간표를 정리해서 준다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ timeList: [" 05:50 ", ""], result: { BRT_TEXT: "메모", SAT_NLIST: "a", HOLI_NLIST: "b" } })),
    );
    const res = await handleRequest(get("/api/bis?routeId=305001152"), makeEnv());
    expect(await res.json()).toEqual({ times: ["05:50"], note: "메모", satSkip: "a", holidaySkip: "b" });
  });

  it("bis routeId가 없거나 이상하면 400", async () => {
    expect((await handleRequest(get("/api/bis"), makeEnv())).status).toBe(400);
    expect((await handleRequest(get("/api/bis?routeId=a%26b"), makeEnv())).status).toBe(400);
  });

  it("CORS 사전 요청", async () => {
    const res = await handleRequest(
      new Request("https://api.test/api/tago", { method: "OPTIONS", headers: { Origin: "https://app.example" } }),
      makeEnv(),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example");
  });
});

describe("정적 데이터", () => {
  it("올리기 전에는 404", async () => {
    const res = await handleRequest(get("/static/routes.json"), makeEnv());
    expect(res.status).toBe(404);
  });

  it("가져오기 뒤에 routes·stops·meta를 내려준다", async () => {
    const env = makeEnv();
    const imported = await handleRequest(post(source, "secret"), env);
    expect(imported.status).toBe(200);
    expect(await imported.json()).toMatchObject({ ok: true, routeCount: 1, stationCount: 2, stopLinkCount: 2 });

    const routes = await (await handleRequest(get("/static/routes.json"), env)).json();
    expect(routes[0]).toMatchObject({ brtStdid: "100", brtNo: "103", category: "본선" });
    const stops = await (await handleRequest(get("/static/stops.json"), env)).json();
    expect(stops.stations).toHaveLength(2);
    const health = await (await handleRequest(get("/health"), env)).json();
    expect(health.data.routeCount).toBe(1);
  });

  it("정적 파일은 Origin 제한을 받지 않는다", async () => {
    const env = makeEnv();
    await handleRequest(post(source, "secret"), env);
    const res = await handleRequest(get("/static/meta.json", { Origin: "https://other.example" }), env);
    expect(res.status).toBe(200);
  });

  it("알 수 없는 파일 이름은 404", async () => {
    expect((await handleRequest(get("/static/secrets.json"), makeEnv())).status).toBe(404);
  });
});

describe("가져오기 보안", () => {
  it("비밀번호가 없거나 틀리면 401이고 아무것도 저장하지 않는다", async () => {
    const env = makeEnv();
    expect((await handleRequest(post(source), env)).status).toBe(401);
    expect((await handleRequest(post(source, "wrong"), env)).status).toBe(401);
    expect(env.STATIC.store.size).toBe(0);
  });

  it("ADMIN_TOKEN이 설정되지 않으면 꺼져 있다", async () => {
    expect((await handleRequest(post(source, "secret"), makeEnv({ ADMIN_TOKEN: "" }))).status).toBe(503);
  });

  it("깨진 JSON과 모양이 틀린 본문은 거절한다", async () => {
    const env = makeEnv();
    expect((await handleRequest(post("{깨짐", "secret"), env)).status).toBe(400);
    expect((await handleRequest(post({ master: [] }, "secret"), env)).status).toBe(400);
  });

  it("빈 데이터로 기존 파일을 덮어쓰지 않는다", async () => {
    const env = makeEnv();
    await handleRequest(post(source, "secret"), env);
    const before = env.STATIC.store.get("routes");
    const res = await handleRequest(post({ master: [], cache: [], stops: [] }, "secret"), env);
    expect(res.status).toBe(422);
    expect(env.STATIC.store.get("routes")).toBe(before);
  });
});

describe("도우미", () => {
  it("허용 목록이 비어 있으면 모두 허용한다", () => {
    expect(isOriginAllowed(makeEnv({ ALLOWED_ORIGINS: "" }), "https://any.example")).toBe(true);
    expect(isOriginAllowed(makeEnv(), null)).toBe(true);
  });

  it("서비스키는 이미 인코딩돼 있어도 한 번만 인코딩한다", () => {
    expect(normalizeServiceKey("a+b/c==")).toBe("a%2Bb%2Fc%3D%3D");
    expect(normalizeServiceKey("a%2Bb%2Fc%3D%3D")).toBe("a%2Bb%2Fc%3D%3D");
  });
});
