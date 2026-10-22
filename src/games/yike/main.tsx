// 一克之差改写版入口（/play/yike/）：连上平台、等到 welcome 拿到存档后再开局；不在平台里打开时 ShootaProvider 显示「请从 shoota.ai 打开」。
import { createRoot } from 'react-dom/client';
import { connectShoota, ShootaProvider } from '../../sdk/react';
import { App } from './App';
import './yike.css';

const client = connectShoota({ game: 'yike' });

createRoot(document.getElementById('app')!).render(
  <ShootaProvider client={client}>
    <App />
  </ShootaProvider>,
);
