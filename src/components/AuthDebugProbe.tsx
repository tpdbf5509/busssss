import { useEffect, useState, type RefObject } from "react";

/**
 * TEMPORARY 진단 전용. AuthScreen 하단에 남아 있는 밝은 띠의 실제 원인을
 * 확인하기 위해 DOM/CSS 실측값을 화면에 찍는다. 원인이 확정되는 대로 이
 * 파일과 호출부(AuthScreen.tsx)를 함께 제거한다 — 프로덕션 코드가 아니다.
 */

function probeHeight(cssValue: string): number {
  const el = document.createElement("div");
  el.style.position = "fixed";
  el.style.visibility = "hidden";
  el.style.pointerEvents = "none";
  el.style.left = "0";
  el.style.top = "0";
  el.style.height = cssValue;
  document.body.appendChild(el);
  const h = el.getBoundingClientRect().height;
  document.body.removeChild(el);
  return h;
}

function probeSafeAreaBottom(): string {
  const el = document.createElement("div");
  el.style.position = "fixed";
  el.style.visibility = "hidden";
  el.style.paddingBottom = "env(safe-area-inset-bottom)";
  document.body.appendChild(el);
  const v = getComputedStyle(el).paddingBottom;
  document.body.removeChild(el);
  return v;
}

function measure(rootEl: HTMLElement | null) {
  const bodyEl = document.body;
  const appRootEl = document.getElementById("root");

  const rootRect = rootEl?.getBoundingClientRect();
  const bodyRect = bodyEl.getBoundingClientRect();
  const appRootRect = appRootEl?.getBoundingClientRect();

  const rootCS = rootEl ? getComputedStyle(rootEl) : null;
  const bodyCS = getComputedStyle(bodyEl);
  const appRootCS = appRootEl ? getComputedStyle(appRootEl) : null;

  return {
    "1 innerHeight": String(window.innerHeight),
    "2 visualViewport.height": String(window.visualViewport?.height ?? "n/a"),
    "3 screen.height": String(window.screen.height),
    "4 100vh probe": String(probeHeight("100vh")),
    "5 100dvh probe": String(probeHeight("100dvh")),
    "6 -webkit-fill-available probe": String(probeHeight("-webkit-fill-available")),
    "7 safe-area-inset-bottom": probeSafeAreaBottom(),
    "8 body computed height": bodyCS.height,
    "9 body rect height/bottom": `${bodyRect.height} / ${bodyRect.bottom}`,
    "10 body bg-color": bodyCS.backgroundColor,
    "11 body overflow-y": bodyCS.overflowY,
    "12 #root computed height": appRootCS?.height ?? "n/a",
    "13 #root rect height/bottom": appRootRect ? `${appRootRect.height} / ${appRootRect.bottom}` : "n/a",
    "14 #root bg-color": appRootCS?.backgroundColor ?? "n/a",
    "15 #root overflow-y": appRootCS?.overflowY ?? "n/a",
    "16 AuthScreen tag/class": rootEl ? `${rootEl.tagName}.${rootEl.className.slice(0, 40)}` : "NOT FOUND",
    "17 AuthScreen computed height": rootCS?.height ?? "n/a",
    "18 AuthScreen min-height": rootCS?.minHeight ?? "n/a",
    "19 AuthScreen rect height/bottom": rootRect ? `${rootRect.height} / ${rootRect.bottom}` : "n/a",
    "20 AuthScreen position": rootCS?.position ?? "n/a",
    "21 AuthScreen bg-color": rootCS?.backgroundColor ?? "n/a",
    "22 AuthScreen bg-image": rootCS?.backgroundImage ?? "n/a",
    "23 AuthScreen overflow-y": rootCS?.overflowY ?? "n/a",
  };
}

export function AuthDebugProbe({ rootRef }: { rootRef: RefObject<HTMLDivElement> }) {
  const [info, setInfo] = useState<Record<string, string>>({});
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const update = () => setInfo(measure(rootRef.current));
    update();
    const t = setTimeout(update, 300);
    window.addEventListener("resize", update);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", update);
    };
  }, [rootRef]);

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

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        background: "rgba(0,0,0,0.9)",
        color: "#0f0",
        fontFamily: "monospace",
        fontSize: 9.5,
        lineHeight: 1.45,
        padding: "6px 8px",
        maxHeight: "55vh",
        overflowY: "auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <strong style={{ color: "#fff" }}>auth debug (임시)</strong>
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
      {Object.entries(info).map(([label, value]) => (
        <div key={label}>
          {label}: <span style={{ color: "#fff" }}>{value}</span>
        </div>
      ))}
    </div>
  );
}
