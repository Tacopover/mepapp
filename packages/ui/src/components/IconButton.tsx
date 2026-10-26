import type { ReactElement } from 'react';
import { iconButtonClass, iconToggleClass } from '../iconButtonClass.js';
import type { IconProps } from '../icons.js';

export interface IconButtonProps {
  Icon: (props: IconProps) => ReactElement;
  label: string;
  onClick?: () => void;
  pressed?: boolean;
  disabled?: boolean;
  size?: number;
  testId?: string;
}

export function IconButton(p: IconButtonProps) {
  return (
    <button
      type="button"
      className={iconButtonClass(p.pressed)}
      title={p.label}
      aria-label={p.label}
      aria-pressed={p.pressed}
      disabled={p.disabled}
      onClick={p.onClick}
      data-testid={p.testId}
    >
      <p.Icon size={p.size ?? 16} />
    </button>
  );
}

export interface IconToggleProps {
  Icon: (props: IconProps) => ReactElement;
  label: string;
  type: 'checkbox' | 'radio';
  name?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  size?: number;
  testId?: string;
}

export function IconToggle(p: IconToggleProps) {
  return (
    <label className={iconToggleClass(p.checked, p.disabled)} title={p.label}>
      <input
        type={p.type}
        name={p.name}
        checked={p.checked}
        disabled={p.disabled}
        aria-label={p.label}
        data-testid={p.testId}
        onChange={(e) => p.onChange(e.target.checked)}
      />
      <p.Icon size={p.size ?? 16} />
    </label>
  );
}
