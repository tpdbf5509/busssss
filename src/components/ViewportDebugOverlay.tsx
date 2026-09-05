import { useEffect, useState } from "react";

/**
 * TEMPORARY 진단용 오버레이. 로그인 화면 하단 흰 띠 + 홈 화면 하단바가
 * 붕 뜨는 문제(둘 다 셸 높이가 47px 짧게 잡히는 것으로 의심)의 실기기
 * 원인을 확인하려고 넣었다. 원인이 확정되는 대로 이 파일과 main.tsx의
 * 마운트 코드를 함께 제거한다 — 프로덕션에 남겨둘 코드가 아니다.
 */
function readSafeAreaInset(side: "top" | "bottom"): string {
  const probe = document.createElement("div");
  probe.style.position = "fixed";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style[side === "top" ? "paddingTop" : "paddingBottom"] =
    `env(safe-area-inset-${side})`;
  document.body.appendChild(probe);
  const value =
    side === "top"
      ? getComputedStyle(probe).paddingTop
      : getComputedStyle(probe).paddingBottom;
  document.body.removeChild(probe);
  return value;
}

// 어떤 빌드가 실기기에 실제로 떠 있는지 한눈에 확인하기 위한 표식.
// 수정을 푸시할 때마다 손으로 올린다. 화면에 찍힌 값이 아래 상수와 다르면
// 새 빌드가 아직 기기에 전달되지 않은 것이다.
const DEBUG_BUILD = "v4-statusbar-default";

function readViewportInfo() {
  const rootEl = document.getElementById("root");
  return {
    build: DEBUG_BUILD,
    bodyHeight: Math.round(document.body.getBoundingClientRect().height),
    rootHeight: rootEl ? Math.round(rootEl.getBoundingClientRect().height) : null,
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
    clientHeight: document.documentElement.clientHeight,
    clientWidth: document.documentElement.clientWidth,
    visualViewportHeight: window.visualViewport?.height ?? null,
    visualViewportWidth: window.visualViewport?.width ?? null,
    screenHeight: window.screen.height,
    screenWidth: window.screen.width,
    devicePixelRatio: window.devicePixelRatio,
    safeAreaTop: readSafeAreaInset("top"),
    safeAreaBottom: readSafeAreaInset("bottom"),
    standalone: window.matchMedia("(display-mode: standalone)").matches,
    // iOS Safari 전용 legacy 플래그. display-mode 미디어쿼리보다 먼저부터 있었고
    // WebKit에서 여전히 정확도가 더 높다는 보고가 있어 같이 찍어 대조한다.
    navigatorStandalone:
      (navigator as unknown as { standalone?: boolean }).standalone ?? null,
    dvh: (() => {
      const probe = document.createElement("div");
      probe.style.position = "fixed";
      probe.style.visibility = "hidden";
      probe.style.height = "100dvh";
      document.body.appendChild(probe);
      const h = probe.getBoundingClientRect().height;
      document.body.removeChild(probe);
      return h;
    })(),
  };
}

export function ViewportDebugOverlay() {
  const [info, setInfo] = useState(() => readViewportInfo());
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const update = () => setInfo(readViewportInfo());
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  if (hidden) {
    return (
      <button
        onClick={() => setHidden(false)}
        style={{
          position: "fixed",
          top: 4,
          right: 4,
          zIndex: 99999,
          fontSize: 10,
          background: "rgba(0,0,0,0.6)",
          color: "#fff",
          padding: "2px 6px",
          borderRadius: 6,
          border: "none",
        }}
      >
        debug
      </button>
    );
  }

  const rows: [string, string | number | null][] = [
    ["build", info.build],
    ["body / #root 높이", `${info.bodyHeight} / ${info.rootHeight}`],
    ["innerHeight×innerWidth", `${info.innerHeight}×${info.innerWidth}`],
    ["clientHeight×clientWidth", `${info.clientHeight}×${info.clientWidth}`],
    [
      "visualViewport h×w",
      info.visualViewportHeight != null
        ? `${info.visualViewportHeight}×${info.visualViewportWidth}`
        : "n/a",
    ],
    ["screen h×w", `${info.screenHeight}×${info.screenWidth}`],
    ["devicePixelRatio", info.devicePixelRatio],
    ["100dvh", info.dvh],
    ["safe-area-inset-top", info.safeAreaTop],
    ["safe-area-inset-bottom", info.safeAreaBottom],
    ["display-mode: standalone", String(info.standalone)],
    ["navigator.standalone", String(info.navigatorStandalone)],
  ];

  return (
    <>
      {/* 뷰포트 맨 아래를 표시하는 선. status bar style을 default로 바꾼 뒤
          이 선이 화면 물리적 끝에 딱 붙으면 하단 죽은 영역이 사라진 것이다. */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          height: 8,
          background: "#00e000",
          pointerEvents: "none",
          zIndex: 99998,
        }}
      />
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        background: "rgba(0,0,0,0.85)",
        color: "#0f0",
        fontFamily: "monospace",
        fontSize: 11,
        lineHeight: 1.5,
        padding: "6px 8px",
        pointerEvents: "auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <strong style={{ color: "#fff" }}>viewport debug (임시)</strong>
        <button
          onClick={() => setHidden(true)}
          style={{
            background: "transparent",
            color: "#fff",
            border: "1px solid #666",
            borderRadius: 4,
            fontSize: 10,
            padding: "1px 6px",
          }}
        >
          숨기기
        </button>
      </div>
      {rows.map(([label, value]) => (
        <div key={label}>
          {label}: <span style={{ color: "#fff" }}>{value}</span>
        </div>
      ))}
    </div>
    </>
  );
}
