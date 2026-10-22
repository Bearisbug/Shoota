import { useId, type ComponentProps, type MouseEventHandler, type ReactNode } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';
import { chevronRight } from './icons';
import './List.css';

export interface ListProps extends Omit<ComponentProps<'section'>, 'title'> {
  /** 分组标题 */
  header?: ReactNode;
  /** 分组下方的说明 */
  footer?: ReactNode;
  /** 标题级别，默认 h2 */
  headingLevel?: 2 | 3;
  /** 一组 <ListRow /> */
  children: ReactNode;
}

/** 分组列表（iOS inset grouped）：圆角容器里一行一项，行间发丝线从文字起点画起 */
export function List({ header, footer, headingLevel = 2, className, children, ...rest }: ListProps) {
  const headerId = useId();
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section {...rest} className={cx('ui-list', className)} aria-labelledby={header ? headerId : rest['aria-labelledby']}>
      {header && <Heading id={headerId} className="ui-list-header">{header}</Heading>}
      <ul role="list" className="ui-list-rows">{children}</ul>
      {footer && <p className="ui-list-footer">{footer}</p>}
    </section>
  );
}

interface RowContent {
  title: ReactNode;
  subtitle?: ReactNode;
  /** 行首图标或缩略图 */
  leading?: ReactNode;
  /** 行尾的值，次要色，不换行 */
  value?: ReactNode;
  /** 行尾控件，如 <Switch />；可点的行默认显示 chevron，给了它就不显示 */
  trailing?: ReactNode;
  /** danger：标题用危险色，如「清除本机存档」 */
  tone?: 'default' | 'danger';
}

/** 跳转行 */
export type ListRowLinkProps = RowContent & Omit<ComponentProps<'a'>, 'title' | 'children' | 'href'> & { href: string; onClick?: never };
/** 动作行 */
export type ListRowButtonProps = RowContent & Omit<ComponentProps<'button'>, 'title' | 'children' | 'value' | 'onClick'> & { onClick: MouseEventHandler<HTMLButtonElement>; href?: never };
/** 只展示的行（可放 Switch 之类的控件） */
export type ListRowStaticProps = RowContent & { href?: never; onClick?: never; className?: string };
export type ListRowProps = ListRowLinkProps | ListRowButtonProps | ListRowStaticProps;

function rowBody({ title, subtitle, leading, value, trailing }: RowContent, interactive: boolean) {
  return (
    <>
      {leading && <span className="ui-row-leading">{leading}</span>}
      <span className="ui-row-main">
        <span className="ui-row-text">
          <span className="ui-row-title">{title}</span>
          {subtitle && <span className="ui-row-subtitle">{subtitle}</span>}
        </span>
        {value != null && <span className="ui-row-value">{value}</span>}
        {trailing ?? (interactive && <Icon src={chevronRight} size="sm" className="ui-row-chevron" />)}
      </span>
    </>
  );
}

const rowClass = (tone: RowContent['tone'], interactive: boolean, className?: string) =>
  cx('ui-row', tone === 'danger' && 'ui-row-danger', interactive && 'state-layer focus-ring', className);

export function ListRow(props: ListRowProps) {
  if (props.href !== undefined) {
    const { title, subtitle, leading, value, trailing, tone, className, ...anchor } = props;
    return (
      <li className="ui-row-item">
        <a {...anchor} className={rowClass(tone, true, className)}>{rowBody({ title, subtitle, leading, value, trailing }, true)}</a>
      </li>
    );
  }
  if (props.onClick !== undefined) {
    const { title, subtitle, leading, value, trailing, tone, className, type = 'button', ...button } = props;
    return (
      <li className="ui-row-item">
        <button {...button} type={type} className={rowClass(tone, true, className)}>{rowBody({ title, subtitle, leading, value, trailing }, true)}</button>
      </li>
    );
  }
  const { title, subtitle, leading, value, trailing, tone, className } = props;
  return (
    <li className="ui-row-item">
      <div className={rowClass(tone, false, className)}>{rowBody({ title, subtitle, leading, value, trailing }, false)}</div>
    </li>
  );
}
