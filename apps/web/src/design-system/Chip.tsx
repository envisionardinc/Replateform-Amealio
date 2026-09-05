import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  unavailable?: boolean;
  children: ReactNode;
};

export function Chip({ selected, unavailable, className, type = 'button', ...props }: Props) {
  const extras = [
    selected ? 'chip-selected' : '',
    unavailable ? 'chip-unavailable' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type={type}
      className={`chip${extras ? ` ${extras}` : ''}`}
      aria-pressed={selected ?? false}
      aria-disabled={unavailable || props.disabled}
      disabled={unavailable || props.disabled}
      {...props}
    />
  );
}
