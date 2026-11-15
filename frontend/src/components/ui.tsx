import { ReactNode, useEffect, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { scoreColor } from '../lib/format';

/** Shared class for native <select> elements (custom chevron in index.css). */
export const SELECT = 'tn-select w-full rounded-lg border border-ink-600 bg-ink-850 px-3 py-2 text-sm text-mute-100 transition-colors hover:border-ink-500 focus:border-accent focus:outline-none';
export const INPUT = 'rounded-md border border-ink-600 bg-ink-850 px-2 py-1 font-mono text-xs text-white placeholder:text-mute-500 transition-colors hover:border-ink-500 focus:border-accent focus:outline-none';

/** Collapsible panel section with optional step number, icon and subtitle. */
export function Section({ title, step, icon: Icon, subtitle, right, children, defaultOpen = true }: {
  title: string; step?: number; icon?: LucideIcon; subtitle?: ReactNode; right?: ReactNode; children: ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-ink-700/70">
      <div className="flex items-center gap-3 px-4 pb-2 pt-4">
        <button onClick={() => setOpen(!open)} className="group flex min-w-0 flex-1 items-center gap-2.5 text-left" aria-expanded={open}>
          {step !== undefined ? (
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-accent/40 bg-accent/10 font-mono text-2xs font-medium text-accent">{step}</span>
          ) : Icon ? (
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink-750 text-mute-300"><Icon size={13} /></span>
          ) : null}
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold text-mute-100 group-hover:text-white">{title}</span>
            {subtitle && !open && <span className="block truncate text-2xs text-mute-500">{subtitle}</span>}
          </span>
          <ChevronDown size={14} className={`ml-auto shrink-0 text-mute-500 transition-transform ${open ? '' : '-rotate-90'}`} />
        </button>
        {right}
      </div>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </section>
  );
}

export function Card({ children, className = '', title, icon: Icon, right, subtitle }: {
  children: ReactNode; className?: string; title?: ReactNode; icon?: LucideIcon; right?: ReactNode; subtitle?: ReactNode;
}) {
  return (
    <div className={`rounded-xl border border-ink-700 bg-ink-875 shadow-panel ${className}`}>
      {title && (
        <div className="flex items-start justify-between gap-3 border-b border-ink-700/70 px-4 py-3">
          <div className="flex min-w-0 items-start gap-2.5">
            {Icon && <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-accent/10 text-accent"><Icon size={13} /></span>}
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-mute-100">{title}</div>
              {subtitle && <div className="mt-0.5 text-2xs leading-relaxed text-mute-400">{subtitle}</div>}
            </div>
          </div>
          {right}
        </div>
      )}
      <div className={title ? 'p-4' : ''}>{children}</div>
    </div>
  );
}

export function Toggle({ checked, onChange, label, small }: { checked: boolean; onChange: (b: boolean) => void; label?: string; small?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={`relative shrink-0 rounded-full transition-colors ${small ? 'h-4 w-7' : 'h-[18px] w-8'} ${checked ? 'bg-accent' : 'bg-ink-600 hover:bg-ink-500'}`}>
      <span className={`absolute top-0.5 rounded-full bg-white shadow transition-all ${small ? 'h-3 w-3' : 'h-[14px] w-[14px]'} ${checked ? (small ? 'left-[14px]' : 'left-[16px]') : 'left-0.5'}`} />
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = 'md' }: {
  value: T; options: { value: T; label: ReactNode; icon?: LucideIcon }[]; onChange: (v: T) => void; size?: 'sm' | 'md';
}) {
  return (
    <div className="flex gap-0.5 rounded-lg border border-ink-700 bg-ink-925 p-0.5" role="tablist">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button key={o.value} role="tab" aria-selected={on} onClick={() => onChange(o.value)}
            className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md transition-colors ${size === 'sm' ? 'px-2 py-1 text-2xs' : 'px-2.5 py-1.5 text-xs'} ${on ? 'bg-ink-700 font-medium text-white shadow-sm' : 'text-mute-400 hover:bg-ink-800 hover:text-mute-200'}`}>
            {o.icon && <o.icon size={size === 'sm' ? 12 : 13} className={on ? 'text-accent' : ''} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function NumberField({ label, value, onChange, unit, step = 1, placeholder = 'off', hint }: {
  label: string; value: number | null; onChange: (v: number | null) => void; unit?: string; step?: number; placeholder?: string; hint?: string;
}) {
  const on = value !== null && value !== undefined;
  return (
    <label className={`flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-xs transition-colors ${on ? 'bg-accent/[0.06]' : 'hover:bg-ink-850'}`} title={hint}>
      <span className="flex min-w-0 items-center gap-2">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${on ? 'bg-accent' : 'bg-ink-600'}`} />
        <span className={`truncate ${on ? 'text-mute-100' : 'text-mute-300'}`}>{label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <input type="number" step={step} value={value ?? ''} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className={`${INPUT} w-20 text-right`} />
        <span className="w-9 text-2xs text-mute-400">{unit}</span>
      </span>
    </label>
  );
}

export function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-px text-2xs leading-4 ${className}`}>{children}</span>;
}

export function Chip({ children, icon: Icon, className = '' }: { children: ReactNode; icon?: LucideIcon; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-ink-600 bg-ink-850 px-2 py-0.5 text-2xs text-mute-300 ${className}`}>
      {Icon && <Icon size={11} className="text-mute-400" />}{children}
    </span>
  );
}

export function Modal({ title, onClose, children, wide, header }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; header?: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" className={`tn-in flex max-h-[94vh] w-full flex-col overflow-hidden rounded-2xl border border-ink-600 bg-ink-900 shadow-float ${wide ? 'max-w-6xl' : 'max-w-3xl'}`}>
        <div className="flex items-center justify-between gap-4 border-b border-ink-700 bg-ink-925 px-5 py-3.5">
          <div className="min-w-0 text-[15px] font-semibold text-white">{title}</div>
          <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-mute-400 transition-colors hover:bg-ink-750 hover:text-white" aria-label="Close"><X size={16} /></button>
        </div>
        {header}
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return <span className={`inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-mute-400/30 border-t-accent ${className}`} />;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`tn-skeleton ${className}`} />;
}

/** Circular score gauge (0–100) using the compatibility ramp. */
export function ScoreRing({ value, size = 44, stroke = 4, label }: { value: number | null | undefined; size?: number; stroke?: number; label?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value === null || value === undefined || !isFinite(value) ? 0 : Math.max(0, Math.min(100, value));
  const col = scoreColor(value);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#222b3b" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${(v / 100) * c} ${c}`} />
      </svg>
      <div className="absolute inset-0 grid place-items-center font-mono font-medium tabular text-white" style={{ fontSize: size * 0.28 }}>
        {label ?? (value === null || value === undefined ? '—' : value.toFixed(value >= 99.95 ? 0 : 0))}
      </div>
    </div>
  );
}

/** Thin horizontal meter. */
export function Meter({ value, color, className = '' }: { value: number | null | undefined; color?: string; className?: string }) {
  const v = value === null || value === undefined || !isFinite(value) ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-ink-700 ${className}`}>
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${v}%`, background: color ?? scoreColor(value) }} />
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-ink-600 bg-ink-850 px-1 font-mono text-2xs text-mute-300">{children}</kbd>;
}
