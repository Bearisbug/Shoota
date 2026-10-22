import type { CSSProperties } from 'react';
import { cx } from './cx';
import './Skeleton.css';

export interface SkeletonProps {
  /** CSS 长度，如 "60%"、"8rem"；不给时撑满 */
  width?: CSSProperties['inlineSize'];
  /** CSS 长度；text 形状默认一行字高 */
  height?: CSSProperties['blockSize'];
  /** text 一行字；rect 块（封面、卡片）；circle 头像、图标。默认 rect */
  shape?: 'text' | 'rect' | 'circle';
  className?: string;
}

/** 加载占位，按真实内容的形状摆。对读屏隐藏，外层容器给 aria-busy 和可读的加载文字 */
export function Skeleton({ width, height, shape = 'rect', className }: SkeletonProps) {
  return <span className={cx('ui-skeleton', `ui-skeleton-${shape}`, className)} style={{ inlineSize: width, blockSize: height }} aria-hidden="true" />;
}
