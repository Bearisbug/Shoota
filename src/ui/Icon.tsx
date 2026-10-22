import type { CSSProperties } from 'react';
import { cx } from './cx';
import './Icon.css';

export type IconSize = 'sm' | 'md' | 'lg';

export interface IconProps {
  /** SVG 地址（import 得到的 URL）。按遮罩着色，颜色跟随文字 */
  src: string;
  /** sm 16 / md 20 / lg 24 */
  size?: IconSize;
  /** 图标本身有含义时给可读名；装饰性图标省略，对读屏隐藏 */
  label?: string;
  className?: string;
}

export function Icon({ src, size = 'md', label, className }: IconProps) {
  return (
    <span
      className={cx('ui-icon', `ui-icon-${size}`, className)}
      style={{ '--ui-icon': `url("${src}")` } as CSSProperties}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
