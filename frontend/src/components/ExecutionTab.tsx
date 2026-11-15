import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  AlertTriangle, CalendarRange, CheckCircle2, ClipboardList, Gauge, Loader2, RotateCcw, SlidersHorizontal, Thermometer, Wand2, XCircle,
} from 'lucide-react';
import type { AnalysisConfig, ExecutionPlan, Meta, Verification } from '../lib/api';
import { fmtNum, scoreColor } from '../lib/format';
import { useI18n } from '../i18n';
import type { ConfigAction } from './AdvisorPanel';
import { Card, INPUT, Skeleton } from './ui';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CLIMATE = ['temp_mean', 'temp_daily', 'temp_seasonal', 'temp_extremes', 'solar_irradiance', 'daylight', 'solar_energy', 'wind', 'precipitation', 'humidity', 'dust'];

export function ExecutionTab({ plan, cfg, meta, onAction, applying }: {
  plan: ExecutionPlan | null; cfg: AnalysisConfig; meta: Meta; onAction: (a: ConfigAction) => void; applying: boolean;
}) {
  const { t } = useI18n();
  const [season, setSeason] = useState<number[]>(cfg.season_months ?? []);
  useEffect(() => setSeason(cfg.season_months ?? []), [cfg.season_months]);
  if (!plan) return <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-56" /><Skeleton className="h-56" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>;
  const toggle = (m: number) => setSeason((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m].sort((a, b) => a - b)));
  const climateParams = meta.parameters.filter((p) => CLIMATE.includes(p.key));
  const bw = plan.best_window;
  return (
    <div className="space-y-5">
      {applying && <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent"><Loader2 size={13} className="animate-spin" />{t('Re-running the analysis with the new settings…')}</div>}
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <Card title={t('Climate match by month')} icon={CalendarRange} subtitle={`${plan.source}. ${t('Parameters used')}: ${plan.monthly_params.map((p) => p.label).join(', ')}`}>
          {bw && (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.07] px-3 py-2 text-xs">
              <CheckCircle2 size={14} className="text-emerald-300" />
              <span className="text-mute-100">{t('Best testing window')}: <b className="text-white">{bw.label}</b></span>
              <span className="font-mono text-mute-300">{bw.score.toFixed(0)}/100 · {t('annual')} {bw.annual.toFixed(0)}/100</span>
            </div>
          )}
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={plan.monthly} margin={{ right: 8, top: 4 }}>
              <CartesianGrid stroke="#1c2433" vertical={false} />
              <XAxis dataKey="month" stroke="#2d384b" tick={{ fill: '#8b97a8', fontSize: 11 }} />
              <YAxis domain={[0, 100]} stroke="#2d384b" tick={{ fill: '#8b97a8', fontSize: 11 }} width={34} />
              <Tooltip contentStyle={{ background: '#0c1018', border: '1px solid #2d384b', fontSize: 12, borderRadius: 8 }} cursor={{ fill: '#171e2b' }}
                formatter={(v: any) => [`${v}/100`, t('Climate match')]} />
              <Bar isAnimationActive={false} dataKey="score" radius={[4, 4, 0, 0]}>
                {plan.monthly.map((m) => <Cell key={m.index} fill={scoreColor(m.score)} fillOpacity={bw?.months.includes(m.index) ? 1 : 0.55} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title={t('Readjust climate parameters')} icon={SlidersHorizontal} subtitle={t('Changes re-run the whole analysis; all sites are rescored.')}>
          <div className="text-2xs font-medium uppercase tracking-[0.12em] text-mute-400">{t('Test season (climate scored for these months only)')}</div>
          <div className="mt-2 grid grid-cols-6 gap-1">
            {MONTHS.map((m, i) => {
              const on = season.includes(i + 1);
              const best = bw?.months.includes(i + 1);
              return (
                <button key={m} onClick={() => toggle(i + 1)} aria-pressed={on}
                  className={`relative rounded-md border py-1 text-2xs transition-colors ${on ? 'border-accent bg-accent/15 text-white' : 'border-ink-600 text-mute-400 hover:text-mute-200'}`}>
                  {t(m)}{best && <span className="absolute right-0.5 top-0.5 h-1 w-1 rounded-full bg-emerald-400" />}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button disabled={applying} onClick={() => onAction({ type: 'season', months: season.length ? season : null })}
              className="rounded-lg bg-accent px-3 py-1 text-2xs font-semibold text-ink-950 hover:opacity-90 disabled:opacity-50">{t('Apply season')}</button>
            {bw && <button onClick={() => setSeason(bw.months)} className="rounded-lg border border-ink-600 px-3 py-1 text-2xs text-mute-200 hover:border-accent">{t('Select best window')}</button>}
            {cfg.season_months && <button onClick={() => onAction({ type: 'season', months: null })} className="flex items-center gap-1 rounded-lg border border-ink-600 px-3 py-1 text-2xs text-mute-200 hover:border-accent"><RotateCcw size={11} />{t('Full year')}</button>}
          </div>
          <p className="mt-1.5 text-2xs text-mute-500">{cfg.season_months ? t('Currently scoring: {m}', { m: cfg.season_months.map((m) => t(MONTHS[m - 1])).join(', ') }) : t('Currently scoring: full-year climatology')}</p>

          <div className="mt-4 text-2xs font-medium uppercase tracking-[0.12em] text-mute-400">{t('Climate tolerances & weights')}</div>
          <div className="mt-1.5 max-h-48 space-y-1 overflow-y-auto pr-1">
            {climateParams.map((p) => {
              const pc = cfg.params[p.key];
              const on = pc?.enabled && pc.weight > 0;
              return (
                <div key={p.key} className={`flex items-center gap-2 rounded-md px-1.5 py-1 text-2xs ${on ? '' : 'opacity-60'}`}>
                  <Thermometer size={11} className="shrink-0 text-mute-500" />
                  <span className="min-w-0 flex-1 truncate text-mute-200" title={p.label}>{p.label}</span>
                  <input type="number" min={0} max={100} value={on ? pc.weight : 0} title={t('Weight')} aria-label={`${p.label} weight`}
                    onChange={(e) => onAction({ type: 'weight', key: p.key, weight: Math.max(0, Math.min(100, Number(e.target.value))) })} className={`${INPUT} w-12 text-right`} />
                  {p.tolerance_label ? (
                    <input type="number" step="any" value={pc?.tolerance ?? p.tolerance} title={`${t('Tolerance')} ${p.tolerance_label}`} aria-label={`${p.label} tolerance`}
                      onChange={(e) => { const v = Number(e.target.value); if (v > 0) onAction({ type: 'tolerance', key: p.key, value: v }); }} className={`${INPUT} w-16 text-right`} />
                  ) : <span className="w-16" />}
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex justify-end gap-6 pr-1 text-2xs text-mute-500"><span>{t('Weight')}</span><span>σ</span></div>
        </Card>
      </div>

      {plan.adjustments.length > 0 && (
        <Card title={t('Suggested readjustments')} icon={Wand2}>
          <div className="space-y-2">
            {plan.adjustments.map((a, i) => (
              <div key={i} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-ink-700 bg-ink-850 p-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-mute-100">{a.title}</div>
                  <p className="mt-0.5 text-2xs leading-relaxed text-mute-300">{a.reason}</p>
                </div>
                <button disabled={applying} onClick={() => onAction(
                  a.type === 'season' ? { type: 'season', months: a.months ?? null }
                    : a.type === 'tolerance' ? { type: 'tolerance', key: a.param!, value: a.to! }
                      : { type: 'disable', key: a.param! })}
                  className="shrink-0 rounded-lg bg-accent px-3 py-1 text-2xs font-semibold text-ink-950 hover:opacity-90 disabled:opacity-50">{t('Apply')}</button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={t('How to execute the experiment')} icon={ClipboardList}>
          <ol className="space-y-3">
            {plan.steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-accent/40 bg-accent/10 font-mono text-2xs text-accent">{i + 1}</span>
                <div><div className="text-xs font-semibold text-mute-100">{t(s.phase)}</div><p className="mt-0.5 text-2xs leading-relaxed text-mute-300">{s.text}</p></div>
              </li>
            ))}
          </ol>
        </Card>
        <Card title={t('Gaps at this site and how to cover them')} icon={AlertTriangle}>
          {plan.gaps.length === 0 ? <p className="text-xs text-emerald-300">{t('Every enabled parameter matches at 50% similarity or better.')}</p> : (
            <div className="space-y-2">
              {plan.gaps.map((g) => (
                <div key={g.key} className="rounded-lg border border-ink-700 bg-ink-850 p-2.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-mute-100">{g.label}</span>
                    <span className="font-mono text-2xs" style={{ color: scoreColor(g.similarity) }}>{g.similarity.toFixed(0)}%</span>
                  </div>
                  <p className="mt-1 text-2xs leading-relaxed text-mute-300">{g.mitigation}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export function VerificationTab({ v, onRetry }: { v: Verification | null; onRetry: () => void }) {
  const { t } = useI18n();
  if (!v) return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-mute-300"><Loader2 size={14} className="animate-spin text-accent" />{t('Cross-checking the data with NASA…')}</div>
      <Skeleton className="h-24" /><Skeleton className="h-48" />
    </div>
  );
  const st = {
    verified: { cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200', icon: CheckCircle2, label: t('Verified against NASA') },
    discrepancies: { cls: 'border-amber-500/40 bg-amber-500/10 text-amber-200', icon: AlertTriangle, label: t('Discrepancies found') },
    unavailable: { cls: 'border-ink-600 bg-ink-850 text-mute-200', icon: XCircle, label: t('Could not verify') },
  }[v.status];
  const I = st.icon;
  return (
    <div className="space-y-5">
      <div className={`flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4 ${st.cls}`}>
        <div className="flex gap-3">
          <I size={22} className="mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-semibold">{st.label}</div>
            <p className="mt-0.5 text-xs leading-relaxed opacity-90">{v.summary}</p>
            {v.source && <p className="mt-1 text-2xs opacity-75">{t('Source')}: {v.source}{v.checked_at ? ` · ${v.checked_at}` : ''}</p>}
          </div>
        </div>
        {v.status === 'unavailable' && <button onClick={onRetry} className="flex items-center gap-1 rounded-lg border border-ink-500 px-3 py-1 text-xs hover:border-accent"><RotateCcw size={12} />{t('Retry')}</button>}
      </div>
      {v.rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-ink-700">
          <table className="w-full min-w-[640px] text-xs">
            <thead className="bg-ink-925">
              <tr className="border-b border-ink-600 text-left text-2xs uppercase tracking-wider text-mute-400">
                <th className="px-3 py-2.5">{t('Variable')}</th><th className="px-3">TerraNova</th><th className="px-3">NASA</th>
                <th className="px-3">{t('Difference')}</th><th className="px-3">{t('Tolerance')}</th><th className="px-3">{t('Result')}</th>
              </tr>
            </thead>
            <tbody>
              {v.rows.map((r) => (
                <tr key={r.variable} className="border-b border-ink-800">
                  <td className="px-3 py-2"><div className="text-mute-100">{r.label}</div><div className="font-mono text-2xs text-mute-500">{r.variable}</div></td>
                  <td className="px-3 font-mono text-white">{fmtNum(r.terranova)} <span className="text-mute-500">{r.terranova !== null ? r.unit : ''}</span></td>
                  <td className="px-3 font-mono text-white">{fmtNum(r.nasa)} <span className="text-mute-500">{r.nasa !== null ? r.unit : ''}</span></td>
                  <td className="px-3 font-mono text-mute-300">{r.difference === undefined ? "—" : r.difference.toFixed(Math.abs(r.difference) < 1 ? 3 : 2)}</td>
                  <td className="px-3 font-mono text-mute-400">± {fmtNum(r.tolerance)}</td>
                  <td className="px-3">
                    {r.status === 'match' ? <span className="inline-flex items-center gap-1 text-emerald-300"><CheckCircle2 size={12} />{t('match')}</span>
                      : r.status === 'mismatch' ? <span className="inline-flex items-center gap-1 text-amber-300"><AlertTriangle size={12} />{t('mismatch')}</span>
                        : <span className="text-mute-500">{t('n/a')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Card title={t('Sources checked')} icon={Gauge}>
        <ul className="space-y-2 text-2xs">
          {v.sources_tried.map((s, i) => (
            <li key={i} className="flex gap-2">
              {s.available ? <CheckCircle2 size={13} className="mt-px shrink-0 text-emerald-300" /> : <XCircle size={13} className="mt-px shrink-0 text-mute-500" />}
              <div><div className="text-mute-200">{s.source} <span className="text-mute-500">({s.ms} ms)</span></div>
                {s.url && <div className="break-all text-accent">{s.url}</div>}
                {s.error && <div className="text-mute-500">{s.error}</div>}</div>
            </li>
          ))}
        </ul>
        {v.note && <p className="mt-3 border-t border-ink-700 pt-2 text-2xs leading-relaxed text-mute-400">{v.note}</p>}
      </Card>
    </div>
  );
}
