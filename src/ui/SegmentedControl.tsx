import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from './cx';
import './SegmentedControl.css';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** 可访问名：这组选项切换的是什么 */
  label: string;
  /** 撑满父容器宽度，各段等宽 */
  block?: boolean;
  className?: string;
}

/** 同一份内容的视图切换。单选组语义：Tab 只停一次，方向键在段间移动并选中 */
export function SegmentedControl<T extends string>({ options, value, onChange, label, block, className }: SegmentedControlProps<T>) {
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, options.findIndex(o => o.value === value));

  // 从 from 出发按 step 找下一个可选的段，首尾相接
  const next = (from: number, step: number) => {
    for (let i = 1; i <= options.length; i++) {
      const j = (((from + step * i) % options.length) + options.length) % options.length;
      if (!options[j].disabled) return j;
    }
    return from;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const to = ({
      ArrowRight: next(index, 1),
      ArrowDown: next(index, 1),
      ArrowLeft: next(index, -1),
      ArrowUp: next(index, -1),
      Home: next(options.length - 1, 1),
      End: next(0, -1),
    } as Record<string, number | undefined>)[e.key];
    if (to === undefined) return;
    e.preventDefault();
    onChange(options[to].value);
    items.current[to]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx('ui-seg', block && 'ui-seg-block', className)}
      style={{ '--ui-seg-count': options.length, '--ui-seg-index': index } as CSSProperties}
      onKeyDown={onKeyDown}
    >
      <span className="ui-seg-thumb" aria-hidden="true" />
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={el => { items.current[i] = el; }}
          type="button"
          role="radio"
          aria-checked={i === index}
          tabIndex={i === index ? 0 : -1}
          disabled={o.disabled}
          className="ui-seg-item state-layer focus-ring"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
