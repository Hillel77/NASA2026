export function fmtNum(v: any, digits?: number): string {
  if (v === null || v === undefined || (typeof v === 'number' && !isFinite(v))) return '—';
  if (typeof v !== 'number') return String(v);
  const a = Math.abs(v);
  if (digits !== undefined) return v.toFixed(digits);
  if (a !== 0 && (a < 0.01 || a >= 1e5)) return v.toExponential(1);
  if (a < 1) return v.toFixed(2);
  if (a < 100) return v.toFixed(1);
  return v.toFixed(0);
}

/** Format an Earth/target value which may be a number, a [min,max] pair or a slope {median,p90}. */
export function fmtValue(v: any, unit = ''): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map((x) => fmtNum(x)).join(' / ') + (unit ? ` ${unit}` : '');
  if (typeof v === 'object' && 'median' in v) return `med ${fmtNum(v.median)}° · p90 ${fmtNum(v.p90)}°`;
  return fmtNum(v) + (unit ? ` ${unit}` : '');
}

export function fmtDiff(v: any): string {
  if (v === null || v === undefined) return '—';
  const s = (x: number) => (x > 0 ? '+' : '') + fmtNum(x);
  if (Array.isArray(v)) return v.map(s).join(' / ');
  if (typeof v === 'object') return `${s(v.median)} / ${s(v.p90)}`;
  return s(v);
}

export function fmtLat(lat: number) { return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}`; }
export function fmtLon(lon: number) { return `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`; }

/** Same red→yellow→green ramp as the server heatmap. */
const RYG: [number, number[]][] = [[0, [165, 30, 40]], [30, [215, 75, 45]], [50, [235, 185, 55]], [70, [150, 195, 70]], [100, [20, 140, 75]]];
export function scoreColor(s: number | null | undefined): string {
  if (s === null || s === undefined || !isFinite(s)) return 'rgb(95,100,112)';
  const v = Math.max(0, Math.min(100, s));
  for (let i = 1; i < RYG.length; i++) {
    const [x1, c1] = RYG[i];
    const [x0, c0] = RYG[i - 1];
    if (v <= x1) {
      const t = (v - x0) / (x1 - x0);
      return `rgb(${c0.map((c, k) => Math.round(c + t * (c1[k] - c))).join(',')})`;
    }
  }
  return 'rgb(20,140,75)';
}

export const QUALITY_LABEL: Record<string, string> = {
  measured: 'Measured', reanalysis: 'Reanalysis / satellite', modelled: 'Modelled from data',
  proxy: 'Proxy index', constant: 'Constant', derived: 'Derived', estimated: 'Estimated', preference: 'Preference',
};
export const QUALITY_CLASS: Record<string, string> = {
  measured: 'text-emerald-300 border-emerald-500/40', reanalysis: 'text-sky-300 border-sky-500/40',
  modelled: 'text-violet-300 border-violet-500/40', proxy: 'text-amber-300 border-amber-500/40',
  constant: 'text-mute-300 border-ink-500', derived: 'text-sky-300 border-sky-500/40',
  estimated: 'text-amber-300 border-amber-500/40', preference: 'text-mute-300 border-ink-500',
};
export const REPRO_CLASS: Record<string, string> = {
  direct: 'text-emerald-300', partial: 'text-amber-300', laboratory: 'text-orange-400', impossible: 'text-red-400',
};
export const REPRO_SHORT: Record<string, string> = {
  direct: 'Field-reproducible', partial: 'Partial', laboratory: 'Lab only', impossible: 'Not reproducible',
};
