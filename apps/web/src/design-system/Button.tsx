import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
};

export function Button({ variant = 'primary', className, type = 'button', ...props }: Props) {
  const extra = className ? ` ${className}` : '';
  return <button type={type} className={`btn btn-${variant}${extra}`} {...props} />;
}
