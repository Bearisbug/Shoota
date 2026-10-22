import type { ReactNode } from 'react';
import { cx } from './cx';
import './EmptyState.css';

export interface EmptyStateProps {
  /** 通常是 <Icon size="lg" /> */
  icon?: ReactNode;
  /** 说清楚这里空着的是什么 */
  title: ReactNode;
  /** 一句话：为什么空、怎么让它不空 */
  description?: ReactNode;
  /** 一个动作，如「去商店看看」 */
  action?: ReactNode;
  /** 标题级别，默认 h2 */
  headingLevel?: 2 | 3;
  className?: string;
}

export function EmptyState({ icon, title, description, action, headingLevel = 2, className }: EmptyStateProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div className={cx('ui-empty', className)}>
      {icon && <span className="ui-empty-icon">{icon}</span>}
      <Heading className="ui-empty-title">{title}</Heading>
      {description && <p className="ui-empty-description">{description}</p>}
      {action && <div className="ui-empty-action">{action}</div>}
    </div>
  );
}
