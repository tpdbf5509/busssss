// BUS STOP 최소 서비스워커.
//
// Vite 빌드 산출물의 파일명은 해시가 붙어 배포마다 바뀌기 때문에, 빌드 시점에
// 파일 목록을 미리 캐시하는 대신 "방문하면서 캐시"하는 런타임 캐싱만 씁니다.
// 오프라인일 때 이전에 열어본 화면(앱 셸)은 뜨게 하는 게 목표이고, 실시간
// 도착정보 같은 API 응답은 절대 캐시하지 않습니다(오래된 값을 보여주면 더
// 위험하기 때문).
// 버전을 올리면 activate 핸들러가 이전 캐시를 전부 지운다. iOS 홈 화면 PWA는
// Safari 탭과 저장소가 분리돼 있어, Safari에서는 최신 빌드가 보이는데 PWA만
// 옛 자산을 계속 쓰는 경우가 있다. 그럴 때 강제로 갈아끼우기 위한 버전이다.
const CACHE_NAME = "bus-stop-runtime-v2";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

function isCacheableRequest(url) {
  if (url.origin !== self.location.origin) return false;
  // Supabase Edge Function 프록시(tago-proxy, jeonju-proxy, bis-proxy) 등
  // 실시간 데이터 API는 절대 캐시하지 않는다.
  if (url.pathname.includes("/functions/") || url.pathname.includes("/rest/")) {
    return false;
  }
  return true;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // 화면 이동(네비게이션) 요청: 네트워크 우선, 실패하면 캐시된 앱 셸로 대체.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
    );
    return;
  }

  if (!isCacheableRequest(url)) return;

  // 정적 자산: 캐시에 있으면 즉시 응답하고, 백그라운드에서 최신 버전으로 갱신.
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
