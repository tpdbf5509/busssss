import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// iOS 홈 화면 앱이면 html에 ios-standalone을 붙인다. index.css의 하단 탭
// 여백(pb-nav-safe, pb-nav-clear)이 이걸 보고 홈 화면 앱 값을 쓴다.
// display-mode 미디어 쿼리만으로는 실기기에서 홈 화면 앱인데도 브라우저 값(8px)이
// 잡힌 적이 있다(4단계 캡처). navigator.standalone은 iOS 홈 화면 앱에서만 true다.
// 첫 화면을 그리기 전에 붙여 탭이 자리를 옮기며 깜빡이지 않게 한다.
if ((window.navigator as Navigator & { standalone?: boolean }).standalone === true) {
  document.documentElement.classList.add('ios-standalone');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// 개발 서버(HMR)와 충돌하지 않도록 프로덕션 빌드에서만 등록합니다.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}