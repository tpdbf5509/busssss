import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ViewportDebugOverlay } from './components/ViewportDebugOverlay.tsx';
import './index.css';

// iOS 홈 화면 PWA에서 100dvh가 실제 화면보다 짧게 잡히는 WebKit 결함 보정.
// env(safe-area-inset-top)은 실행 직후 0으로 읽히는 등 타이밍을 타서(자세한
// 내용은 index.css의 .h-app-shell 주석 참고) 대신 window.screen.height를 직접
// CSS 변수로 박아 쓴다. 키보드가 열려도 안 바뀌는 물리 화면 높이라 셸 높이가
// 키보드 때문에 흔들리지 않는다.
//
// 조건을 display-mode가 아니라 navigator.standalone으로 잡는 건, 이 값이
// iOS Safari 전용이라서다. 안드로이드 PWA도 display-mode는 standalone인데
// 거기선 screen.height에 상태바/내비바까지 들어가 오히려 셸이 과하게 커진다.
function syncAppShellHeight() {
  const iosStandalone =
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  if (iosStandalone) {
    document.documentElement.style.setProperty(
      '--app-shell-height',
      `${window.screen.height}px`
    );
  } else {
    document.documentElement.style.removeProperty('--app-shell-height');
  }
}
syncAppShellHeight();
window.addEventListener('resize', syncAppShellHeight);
window.addEventListener('orientationchange', syncAppShellHeight);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* TEMPORARY — 로그인 화면 하단 흰 띠 / 홈 화면 하단바 뜸 진단용.
        원인 확인되는 대로 이 줄과 ViewportDebugOverlay.tsx를 제거한다. */}
    <ViewportDebugOverlay />
    <App />
  </StrictMode>
);

// 개발 서버(HMR)와 충돌하지 않도록 프로덕션 빌드에서만 등록합니다.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}