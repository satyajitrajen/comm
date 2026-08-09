'use client';

import { InputHTMLAttributes, ReactNode, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** Classes for the outer relative wrapper when not using a framed container. */
  wrapperClassName?: string;
  /** Optional leading icon (e.g. Lock) — enables the framed login-style row. */
  leading?: ReactNode;
  /** Classes for the framed flex container when `leading` is set. */
  frameClassName?: string;
};

export default function PasswordInput({
  className = '',
  wrapperClassName = 'mt-1',
  leading,
  frameClassName = '',
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  const toggle = (
    <button
      type="button"
      tabIndex={-1}
      onClick={() => setVisible((v) => !v)}
      className="shrink-0 rounded p-1 text-slate-400 hover:text-slate-700"
      aria-label={visible ? 'Hide password' : 'Show password'}
    >
      {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );

  if (leading) {
    return (
      <span className={`flex items-center gap-2 ${frameClassName}`}>
        {leading}
        <input
          {...props}
          type={visible ? 'text' : 'password'}
          className={`min-w-0 flex-1 bg-transparent outline-none ${className}`}
        />
        {toggle}
      </span>
    );
  }

  return (
    <span className={`relative block ${wrapperClassName}`}>
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`w-full pr-10 ${className}`}
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2">{toggle}</span>
    </span>
  );
}
