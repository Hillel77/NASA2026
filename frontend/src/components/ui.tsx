import { ReactNode, useState } from 'react';

export function Section({ title, right, children, defaultOpen = true }: { title: string; right?: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-ink-700">
      <div className="flex items-center justify-between px-4 py-2.5">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-2 text-2xs uppercase tracking-[0.12em] text-mute-400 hover:text-mute-200">
          <span className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>›</span>{title}
        </button>
        {right}
      </div>
      {open && <div className="px-4 pb-3">{children}</div>}
    </section>
  );
}

export function Toggle({ checked, onChange, label, small }: { checked: boolean; onChange: (b: boolean) => void; label?: string; small?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={`relative shrink-0 rounded-full transition-colors ${small ? 'w-7 h-4' : 'w-8 h-[18px]'} ${checked ? 'bg-accent' : 'bg-ink-600'}`}>
      <span className={`absolute top-0.5 rounded-full bg-white transition-all ${small ? 'w-3 h-3' : 'w-[14px] h-[14px]'} ${checked ? (small ? 'left-[14px]' : 'left-[16px]') : 'left-0.5'}`} />
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-md border border-ink-600 bg-ink-850 p-0.5">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={`flex-1 rounded px-2 py-1 text-xs transition-colors ${value === o.value ? 'bg-ink-600 text-white' : 'text-mute-400 hover:text-mute-200'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function NumberField({ label, value, onChange, unit, step = 1, placeholder = 'off', hint }: {
  label: string; value: number | null; onChange: (v: number | null) => void; unit?: string; step?: number; placeholder?: string; hint?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-2 py-1 text-xs" title={hint}>
      <span className="text-mute-300">{label}</span>
      <span className="flex items-center gap-1">
        <input type="number" step={step} value={value ?? ''} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="w-20 rounded border border-ink-600 bg-ink-850 px-1.5 py-0.5 text-right font-mono text-xs text-white placeholder:text-mute-400/60 focus:border-accent focus:outline-none" />
        <span className="w-9 text-2xs text-mute-400">{unit}</span>
      </span>
    </label>
  );
}

export function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded border px-1.5 py-px text-2xs ${className}`}>{children}</span>;
}

export function Modal({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-lg border border-ink-600 bg-ink-900 shadow-2xl ${wide ? 'max-w-6xl' : 'max-w-3xl'}`}>
        <div className="flex items-center justify-between border-b border-ink-700 px-5 py-3">
          <div className="text-sm font-semibold text-white">{title}</div>
          <button onClick={onClose} className="text-mute-400 hover:text-white text-lg leading-none" aria-label="Close">×</button>
        </div>
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return <span className={`inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-mute-400/30 border-t-accent ${className}`} />;
}
