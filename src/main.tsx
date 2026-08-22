import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';


function setAppHeight() {
  const height = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty('--app-height', `${height}px`);
}
setAppHeight();
window.addEventListener('resize', setAppHeight);
window.visualViewport?.addEventListener('resize', setAppHeight);


window.addEventListener('load', setAppHeight);
window.addEventListener('pageshow', setAppHeight);
document.addEventListener('visibilitychange', setAppHeight);
setTimeout(setAppHeight, 100);
setTimeout(setAppHeight, 500);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);