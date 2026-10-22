// 平台入口。index.html 的 head 里搬家检查先同步跑过；它正在跳去搬家页时（window.__cjMoving）这里什么都不做。
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/index.css';
import { SW_URL } from '../sw/constants';
import { App } from './App';
import { PlayerPage } from './player-ui/PlayerPage';
import { createServices } from './wiring';

if (!window.__cjMoving) {
  const services = createServices();
  void services.boot().then(ok => {
    if (!ok) return;
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App services={services} Player={PlayerPage} />
      </StrictMode>,
    );
  });
  // 平台壳与游戏文件的缓存（ADR-009）；页面载入完再注册，不和首屏抢网络
  if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => { navigator.serviceWorker.register(SW_URL).catch(() => {}); }, { once: true });
  }
}
