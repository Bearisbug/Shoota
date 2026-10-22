import type { ComponentProps, ReactNode } from 'react';
import { cx } from './cx';
import './Switch.css';

export interface SwitchProps extends Omit<ComponentProps<'input'>, 'type' | 'role' | 'checked' | 'defaultChecked' | 'onChange' | 'children'> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** 开关左侧的可见标签；不给时必须传 aria-label */
  label?: ReactNode;
}

/** 开关：原生 checkbox 加 role="switch"，整块标签都能点，命中区高 44 */
export function Switch({ checked, onCheckedChange, label, className, ...rest }: SwitchProps) {
  return (
    <label className={cx('ui-switch', className)}>
      {label && <span className="ui-switch-label">{label}</span>}
      <span className="ui-switch-track state-layer focus-ring is-field">
        <input
          {...rest}
          type="checkbox"
          role="switch"
          className="ui-switch-input"
          checked={checked}
          onChange={e => onCheckedChange(e.currentTarget.checked)}
        />
        <span className="ui-switch-thumb" aria-hidden="true" />
      </span>
    </label>
  );
}
