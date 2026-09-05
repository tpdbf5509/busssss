import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ViewportDebugOverlay } from './components/ViewportDebugOverlay.tsx';
import './index.css';

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