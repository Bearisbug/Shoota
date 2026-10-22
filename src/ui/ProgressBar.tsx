import { cx } from './cx';
import './ProgressBar.css';

export interface ProgressBarProps {
  /** 0–1；不给表示进度未知，显示往复滑动的条 */
  value?: number;
  /** 可访问名：在等什么 */
  label: string;
  /** 读屏念的进度文字，如「已下载 3 / 5」；不给时念百分比 */
  valueText?: string;
  className?: string;
}

export function ProgressBar({ value, label, valueText, className }: ProgressBarProps) {
  const v = value === undefined || Number.isNaN(value) ? undefined : Math.min(1, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v === undefined ? undefined : Math.round(v * 100)}
      aria-valuetext={valueText}
      className={cx('ui-progress', v === undefined && 'ui-progress-indeterminate', className)}
    >
      <span className="ui-progress-fill" style={v === undefined ? undefined : { transform: `scaleX(${v})` }} />
    </div>
  );
}
