import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/index.css';
import { KanbanApp } from './KanbanApp';
import './kanban.css'; // 排在组件之后，同权重的规则以看板为准

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <KanbanApp />
  </StrictMode>,
);
