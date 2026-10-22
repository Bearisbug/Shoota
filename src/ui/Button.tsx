import type { ComponentProps, MouseEvent, ReactNode } from 'react';
import { cx } from './cx';
import './Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonLook {
  /** primary 强调色底，每屏至多一个；secondary 灰底；text 无底；danger 危险色底，用于删除、清空这类不可逆动作。默认 secondary */
  variant?: ButtonVariant;
  /** sm 32（命中区仍是 44）/ md 44 / lg 52。默认 md */
  size?: ButtonSize;
  /** 文字前的图标 */
  icon?: ReactNode;
  /** 撑满父容器宽度 */
  block?: boolean;
}

export interface ButtonProps extends ButtonLook, Omit<ComponentProps<'button'>, 'children'> {
  children: ReactNode;
  /** 进行中：宽度不变，文字隐去换成转圈，重复点击被吞掉 */
  loading?: boolean;
}

export interface ButtonLinkProps extends ButtonLook, Omit<ComponentProps<'a'>, 'children' | 'href'> {
  href: string;
  children: ReactNode;
}

function lookClass({ variant = 'secondary', size = 'md', block }: ButtonLook, className?: string) {
  return cx('ui-btn', `ui-btn-${variant}`, `ui-btn-${size}`, block && 'ui-btn-block', 'state-layer', 'focus-ring', className);
}

export function Button({ variant, size, icon, block, loading = false, className, children, type = 'button', onClick, ...rest }: ButtonProps) {
  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (loading) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  };
  return (
    <button {...rest} type={type} className={lookClass({ variant, size, block }, className)} aria-busy={loading || undefined} onClick={handleClick}>
      <span className="ui-btn-content">{icon}{children}</span>
      {loading && <span className="ui-btn-spinner" aria-hidden="true" />}
    </button>
  );
}

/** 外观同 Button 的链接，用于跳到别的页面 */
export function ButtonLink({ variant, size, icon, block, className, children, ...rest }: ButtonLinkProps) {
  return (
    <a {...rest} className={lookClass({ variant, size, block }, className)}>
      <span className="ui-btn-content">{icon}{children}</span>
    </a>
  );
}
