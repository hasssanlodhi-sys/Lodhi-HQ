import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Priority, Status, TagId } from '../types';
import { TAGS } from '../lib/tags';
import { cx } from '../lib/utils';

export function Button({
  variant = 'primary',
  className,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'soft' }) {
  const styles = {
    primary: 'bg-ink text-white hover:bg-stone-800',
    ghost: 'bg-white border border-line text-ink hover:bg-stone-50',
    danger: 'bg-white text-red-700 border border-red-200 hover:bg-red-50',
    soft: 'bg-amber-100 text-amber-950 hover:bg-amber-200',
  }[variant];
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl px-3 h-10 text-sm font-medium transition disabled:opacity-40',
        styles,
        className,
      )}
      {...rest}
    />
  );
}

export function TagPill({ tag, full = false }: { tag: TagId; full?: boolean }) {
  const meta = TAGS[tag];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ background: meta.tint, color: meta.text }}
      title={meta.name}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
      {full ? meta.name : meta.short}
    </span>
  );
}

const PRIORITY_STYLE: Record<Priority, string> = {
  Urgent: 'bg-red-50 text-red-700',
  High: 'bg-amber-50 text-amber-800',
  Medium: 'bg-sky-50 text-sky-800',
  Low: 'bg-stone-100 text-stone-600',
};

const STATUS_STYLE: Record<Status, string> = {
  'To Do': 'bg-stone-100 text-stone-700',
  'In Progress': 'bg-blue-50 text-blue-700',
  Waiting: 'bg-amber-50 text-amber-800',
  Done: 'bg-emerald-50 text-emerald-700',
};

export function PriorityPill({ priority }: { priority: Priority }) {
  return <span className={cx('rounded-full px-2 py-0.5 text-xs font-medium', PRIORITY_STYLE[priority])}>{priority}</span>;
}

export function StatusPill({ status }: { status: Status }) {
  return <span className={cx('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_STYLE[status])}>{status}</span>;
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-serif text-3xl tracking-tight text-ink md:text-4xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-stone-500">{subtitle}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <button type="button" className="absolute inset-0 bg-ink/40" aria-label="Close" onClick={onClose} />
      <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-card md:max-w-lg md:rounded-3xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="font-serif text-2xl">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-full px-2 py-1 text-sm text-stone-500 hover:bg-stone-100" aria-label="Close dialog">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
