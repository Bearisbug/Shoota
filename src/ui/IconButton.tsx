import type { ComponentProps, ReactNode } from 'react';
import { cx } from './cx';
import './IconButton.css';

export type IconButtonVariant = 'plain' | 'filled' | 'material';

export interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children' | 'aria-label'> {
  /** 可读名，同时作为桌面端悬停提示 */
  label: string;
  /** 通常是 <Icon />（装饰性，不带 label） */
  icon: ReactNode;
  /** plain 透明；filled 灰底；material 半透明材质，浮在游戏画面上的控件用。默认 plain */
  variant?: IconButtonVariant;
  /** sm 视觉 32（命中区 44）/ md 44。默认 md */
  size?: 'sm' | 'md';
}

export function IconButton({ label, icon, variant = 'plain', size = 'md', className, type = 'button', title, ...rest }: IconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      title={title ?? label}
      className={cx('ui-iconbtn', `ui-iconbtn-${variant}`, `ui-iconbtn-${size}`, 'state-layer', 'focus-ring', className)}
    >
      {icon}
    </button>
  );
}
