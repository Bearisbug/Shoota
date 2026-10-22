import { useId, type ComponentProps, type ReactNode } from 'react';
import { cx } from './cx';
import './Card.css';

export interface CardProps extends Omit<ComponentProps<'section'>, 'title'> {
  title?: ReactNode;
  /** 标题下一行说明 */
  subtitle?: ReactNode;
  /** 标题行右侧的动作，如「查看全部」 */
  action?: ReactNode;
  /** 标题级别，默认 h2 */
  headingLevel?: 2 | 3;
  /** 内容贴边（封面图、整块列表），不加内边距 */
  flush?: boolean;
  children: ReactNode;
}

/** 面板。卡片里不再套卡片 */
export function Card({ title, subtitle, action, headingLevel = 2, flush, className, children, ...rest }: CardProps) {
  const titleId = useId();
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section {...rest} className={cx('ui-card', flush && 'ui-card-flush', className)} aria-labelledby={title ? titleId : rest['aria-labelledby']}>
      {(title || action) && (
        <header className="ui-card-head">
          <div className="ui-card-titles">
            {title && <Heading id={titleId} className="ui-card-title">{title}</Heading>}
            {subtitle && <p className="ui-card-subtitle">{subtitle}</p>}
          </div>
          {action && <div className="ui-card-action">{action}</div>}
        </header>
      )}
      <div className="ui-card-body">{children}</div>
    </section>
  );
}
