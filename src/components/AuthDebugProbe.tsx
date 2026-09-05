import { useEffect, useState, type RefObject } from "react";

/**
 * TEMPORARY 진단 전용. "797에서 페인트가 끊기는 게 정확히 어느 레이어/
 * 어느 좌표계에서 발생하는지" 실측하기 위한 코드다. 실제 화면에 보이는
 * fixed/absolute 계열 테스트 마커 3개를 포함한다. 원인이 확정되는 대로
 * 이 파일과 AuthScreen.tsx의 호출부(마커 포함)를 통째로 제거한다 —
 * 프로덕션에 남을 코드가 아니다.
 */

const MARKER_H = 10;

type Rect = { top: number; bottom: number; height: number; left: number; right: number };

function rectOf(el: Element | null): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, height: r.height, left: r.left, right: r.right };
}

function styleOf(el: Element | null) {
  if (!el) return null;
  const cs = getComputedStyle(el);
  return {
    position: cs.position,
    height: cs.height,
    minHeight: cs.minHeight,
    maxHeight: cs.maxHeight,
    overflow: cs.overflow,
    overflowY: cs.overflowY,
    transform: cs.transform,
    contain: cs.contain,
    clipPath: cs.clipPath,
    mask: cs.mask || "n/a",
    filter: cs.filter,
    willChange: cs.willChange,
    isolation: cs.isolation,
    background: cs.backgroundColor,
    zIndex: cs.zIndex,
  };
}

function fmtRect(r: Rect | null) {
  if (!r) return "N/A (mounted 안 됨)";
  return `top:${r.top.toFixed(1)} bottom:${r.bottom.toFixed(1)} h:${r.height.toFixed(1)} l:${r.left.toFixed(1)} r:${r.right.toFixed(1)}`;
}

function fmtStyle(s: ReturnType<typeof styleOf>) {
  if (!s) return "N/A";
  return Object.entries(s)
    .map(([k, v]) => `${k}=${v}`)
    .join(" / ");
}

export function AuthDebugProbe({ rootRef }: { rootRef: RefObject<HTMLDivElement> }) {
  const [lines, setLines] = useState<string[]>([]);
  const [hidden, setHidden] = useState(false);
  const [markerTops, setMarkerTops] = useState<{ fixedTopComputed: number; atAuthBottom: number } | null>(null);

  useEffect(() => {
    const measure = () => {
      const bodyEl = document.body;
      const rootEl = document.getElementById("root");
      const authEl = rootRef.current;
      // App.tsx의 fixed 셸(AppContent)이나 !authReady 화면은 로그인 화면에서는
      // 애초에 마운트되지 않는다(App()이 !isAuthenticated면 AuthScreen만
      // 반환) — 그래서 이 값들은 항상 N/A다.
      const appShellEl = document.querySelector(".fixed.inset-0");

      const vv = window.visualViewport;
      const authRect = rectOf(authEl);

      const out: string[] = [];
      out.push("== 1. window / visualViewport ==");
      out.push(`innerHeight: ${window.innerHeight}`);
      out.push(`outerHeight: ${window.outerHeight}`);
      out.push(`documentElement.clientHeight: ${document.documentElement.clientHeight}`);
      out.push(`body.clientHeight: ${bodyEl.clientHeight}`);
      out.push(`visualViewport.height: ${vv?.height ?? "n/a"}`);
      out.push(`visualViewport.offsetTop: ${vv?.offsetTop ?? "n/a"}`);
      out.push(`visualViewport.pageTop: ${vv?.pageTop ?? "n/a"}`);
      out.push(`visualViewport.scale: ${vv?.scale ?? "n/a"}`);
      out.push(`screen.height: ${window.screen.height}`);

      out.push("== 2. rects ==");
      out.push(`body: ${fmtRect(rectOf(bodyEl))}`);
      out.push(`#root: ${fmtRect(rectOf(rootEl))}`);
      out.push(`App fixed shell: ${fmtRect(rectOf(appShellEl))}`);
      out.push(`AuthScreen: ${fmtRect(authRect)}`);

      out.push("== 3. computed style ==");
      out.push(`body: ${fmtStyle(styleOf(bodyEl))}`);
      out.push(`#root: ${fmtStyle(styleOf(rootEl))}`);
      out.push(`AuthScreen: ${fmtStyle(styleOf(authEl))}`);

      setLines(out);

      if (authRect) {
        setMarkerTops({
          fixedTopComputed: window.screen.height - MARKER_H,
          atAuthBottom: authRect.bottom - MARKER_H,
        });
      }
    };
    measure();
    const t = setTimeout(measure, 300);
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
    };
  }, [rootRef]);

  return (
    <>
      {/* 마커 1(빨강): position:fixed; bottom:0 — CSS edge-anchor. 실제 화면
          맨 아래(844)에 보이면, bottom:0 anchoring 방식은 정상 동작한다는 뜻. */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          height: MARKER_H,
          background: "red",
          zIndex: 99997,
        }}
      />
      {/* 마커 2(라임): position:fixed; top: (screen.height - 10)px — JS로 계산한
          절대 좌표. 마커1(빨강)과 물리적으로 같은 위치에 겹쳐 보여야 정상이다.
          안 겹치면 bottom:0 앵커링과 top 오프셋 계산 결과가 실제로 다르다는 뜻. */}
      {markerTops && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            top: markerTops.fixedTopComputed,
            height: MARKER_H,
            background: "lime",
            zIndex: 99996,
          }}
        />
      )}
      {/* 마커 3(마젠타): position:fixed지만 top을 AuthScreen 자신의
          getBoundingClientRect().bottom(844로 실측됨)에서 역산한 좌표에 둔다.
          AuthScreen이 "주장하는" 자기 하단 좌표에 실제로 뭔가 그려지는지 확인. */}
      {markerTops && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            top: markerTops.atAuthBottom,
            height: MARKER_H,
            background: "magenta",
            zIndex: 99995,
          }}
        />
      )}

      {hidden ? (
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
      ) : (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 99999,
            background: "rgba(0,0,0,0.92)",
            color: "#0f0",
            fontFamily: "monospace",
            fontSize: 8.5,
            lineHeight: 1.4,
            padding: "6px 8px",
            maxHeight: "62vh",
            overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <strong style={{ color: "#fff" }}>
              render-surface debug (임시) — 빨강=fixed bottom:0 / 라임=fixed
              top:screen.height-10 / 마젠타=fixed top:AuthScreen.rect.bottom-10
            </strong>
            <button
              onClick={() => setHidden(true)}
              style={{
                background: "transparent",
                color: "#fff",
                border: "1px solid #666",
                borderRadius: 4,
                fontSize: 10,
                padding: "1px 6px",
                flexShrink: 0,
              }}
            >
              숨기기
            </button>
          </div>
          {lines.map((l, i) => (
            <div key={i} style={{ color: l.startsWith("==") ? "#fff" : "#0f0", fontWeight: l.startsWith("==") ? "bold" : "normal" }}>
              {l}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
