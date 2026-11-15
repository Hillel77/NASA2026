import { useEffect, useState } from 'react';
import {
  AlertTriangle, Beaker, Bot, CalendarRange, CheckCircle2, CircleSlash, Compass, Database, FileSearch, Lightbulb, MinusCircle, PlusCircle,
  Shield, Shuffle, Sparkles, Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AdvisorReport, LlmAnswer, ParamAdvice, Verdict } from '../lib/api';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { Skeleton, Spinner } from './ui';

export type ConfigAction =
  | { type: 'enable'; key: string; weight?: number }
  | { type: 'disable'; key: string }
  | { type: 'weight'; key: string; weight: number }
  | { type: 'tolerance'; key: string; value: number }
  | { type: 'season'; months: number[] | null };

const VERDICT: Record<Verdict, { label: string; cls: string; icon: LucideIcon }> = {
  keep: { label: 'Relevant', cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300', icon: CheckCircle2 },
  review: { label: 'Review', cls: 'border-amber-500/40 bg-amber-500/10 text-amber-300', icon: AlertTriangle },
  reduce: { label: 'Reduce weight', cls: 'border-amber-500/40 bg-amber-500/10 text-amber-300', icon: MinusCircle },
  lab: { label: 'Lab only', cls: 'border-orange-500/40 bg-orange-500/10 text-orange-300', icon: Beaker },
  remove: { label: 'Not relevant', cls: 'border-red-500/40 bg-red-500/10 text-red-300', icon: CircleSlash },
  consider_adding: { label: 'Consider adding', cls: 'border-sky-500/40 bg-sky-500/10 text-sky-300', icon: PlusCircle },
};
const KIND_ICON: Record<string, LucideIcon> = {
  plan: Compass, data: Database, field: FileSearch, lab: Beaker, gap: AlertTriangle, season: CalendarRange,
  robustness: Shuffle, permits: Shield, warning: AlertTriangle,
};
const GROUPS: { title: string; verdicts: Verdict[] }[] = [
  { title: 'Not relevant / move to the lab', verdicts: ['remove', 'lab'] },
  { title: 'Needs review', verdicts: ['review', 'reduce'] },
  { title: 'Consider adding', verdicts: ['consider_adding'] },
  { title: 'Relevant to this research', verdicts: ['keep'] },
];

export default function AdvisorPanel({ rid, topN, sep, llmAvailable, onAction }: {
  rid: string | null; topN: number; sep: number; llmAvailable: boolean; onAction: (a: ConfigAction) => void;
}) {
  const { t, lang } = useI18n();
  const [rep, setRep] = useState<AdvisorReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [brief, setBrief] = useState<LlmAnswer | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);

  useEffect(() => {
    if (!rid) return;
    setErr(null);
    setBrief(null);
    api.advisor(rid, topN, sep).then(setRep).catch((e) => setErr(String(e.message ?? e)));
  }, [rid, topN, sep]);

  if (err) return <div className="m-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">{err}</div>;
  if (!rep) return <div className="space-y-2 p-3"><div className="px-1 text-xs text-mute-400">{t('Analysing your inputs…')}</div>{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>;

  const s = rep.summary;
  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-3">
      <div className="rounded-xl border border-accent/30 bg-accent/[0.06] p-3">
        <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-white"><Sparkles size={14} className="text-accent" />{t('Research advisor')}</div>
        <p className="text-2xs leading-relaxed text-mute-300">{t('Computed from this analysis: every recommendation below comes from the scores, data coverage and sensitivity of your current inputs.')}</p>
        <div className="mt-3 grid grid-cols-2 gap-1.5 text-center">
          {[[t('Relevant'), s.relevant.length, 'text-emerald-300'], [t('Needs review'), s.review.length, 'text-amber-300'],
            [t('Not relevant'), s.not_relevant.length, 'text-red-300'], [t('Consider adding'), s.consider_adding.length, 'text-sky-300']].map(([l, n, c]) => (
            <div key={l as string} className="rounded-lg border border-ink-700 bg-ink-875 px-2 py-1.5">
              <div className={`font-mono text-sm ${c}`}>{n as number}</div><div className="text-2xs text-mute-400">{l as string}</div>
            </div>
          ))}
        </div>
      </div>

      {llmAvailable && (
        <div className="rounded-xl border border-ink-700 bg-ink-875 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-mute-100"><Bot size={14} className="text-accent" />{t('AI research brief')}</div>
            <button disabled={briefLoading} onClick={() => { setBriefLoading(true); api.brief(rid!, lang).then(setBrief).catch((e) => setBrief({ available: false, error: String(e.message ?? e) })).finally(() => setBriefLoading(false)); }}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1 text-2xs font-semibold text-ink-950 hover:opacity-90 disabled:opacity-50">
              {briefLoading ? <Spinner /> : <Sparkles size={12} />}{brief ? t('Regenerate') : t('Generate')}
            </button>
          </div>
          <p className="mt-1 text-2xs text-mute-500">{t('Written by Claude from the computed diagnostics below.')}</p>
          {brief && (brief.available
            ? <div className="mt-2 whitespace-pre-wrap border-t border-ink-700 pt-2 text-xs leading-relaxed text-mute-200">{brief.text}</div>
            : <div className="mt-2 text-2xs text-amber-300">{brief.error}</div>)}
        </div>
      )}

      <section>
        <h3 className="mb-2 flex items-center gap-2 text-2xs font-semibold uppercase tracking-[0.12em] text-mute-400"><Lightbulb size={12} />{t('Practical advice for conducting the research')}</h3>
        <div className="space-y-2">
          {rep.advice.map((a, i) => {
            const I = KIND_ICON[a.kind] ?? Lightbulb;
            return (
              <div key={i} className="flex gap-2.5 rounded-xl border border-ink-700 bg-ink-875 p-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-ink-750 text-accent"><I size={13} /></span>
                <div className="min-w-0"><div className="text-xs font-semibold text-mute-100">{a.title}</div>
                  <p className="mt-0.5 text-2xs leading-relaxed text-mute-300">{a.detail}</p></div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-2 flex items-center gap-2 text-2xs font-semibold uppercase tracking-[0.12em] text-mute-400"><Wrench size={12} />{t('Your inputs: what is relevant and what is not')}</h3>
        <div className="space-y-3">
          {GROUPS.map((g) => {
            const items = rep.parameters.filter((p) => g.verdicts.includes(p.verdict));
            if (!items.length) return null;
            return (
              <div key={g.title}>
                <div className="mb-1.5 text-2xs font-medium text-mute-300">{t(g.title)} <span className="text-mute-500">({items.length})</span></div>
                <div className="space-y-1.5">{items.map((p) => <ParamCard key={p.key} p={p} onAction={onAction} />)}</div>
              </div>
            );
          })}
        </div>
      </section>

      {rep.constraints.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-2xs font-semibold uppercase tracking-[0.12em] text-mute-400"><Shield size={12} />{t('Constraint review')}</h3>
          <div className="space-y-1.5">
            {rep.constraints.map((c) => (
              <div key={c.key} className="rounded-xl border border-ink-700 bg-ink-875 p-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-mute-100">{c.label}</span>
                  <span className="font-mono text-2xs text-mute-400">{String(c.value)} {c.unit}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-700"><div className="h-full rounded-full bg-amber-400/80" style={{ width: `${c.excluded_pct}%` }} /></div>
                  <span className="w-20 text-right font-mono text-2xs text-mute-300">{t('{p}% excluded', { p: c.excluded_pct.toFixed(0) })}</span>
                </div>
                <p className={`mt-1.5 text-2xs leading-relaxed ${c.verdict === 'review' ? 'text-amber-200' : 'text-mute-400'}`}>{c.advice}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ParamCard({ p, onAction }: { p: ParamAdvice; onAction: (a: ConfigAction) => void }) {
  const { t } = useI18n();
  const v = VERDICT[p.verdict];
  const I = v.icon;
  const stats: [string, number | null | undefined, string][] = [
    [t('weight share'), p.enabled ? p.weight_share : null, '%'], [t('data coverage'), p.coverage_pct, '%'],
    [t('spread between sites'), p.discrimination, ' pts'], [t('top-site match'), p.top_mean_similarity, '%'],
  ];
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-875 p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold text-mute-100">{p.label}</span>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-2xs ${v.cls}`}><I size={11} />{t(v.label)}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-2xs text-mute-500">
        {stats.filter(([, x]) => x !== null && x !== undefined).map(([l, x, u]) => <span key={l}>{l} <span className="text-mute-300">{x}{u}</span></span>)}
      </div>
      <ul className="mt-1.5 space-y-1 text-2xs leading-relaxed text-mute-300">{p.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {p.enabled && p.verdict !== 'keep' && (
          <button onClick={() => onAction({ type: 'disable', key: p.key })} className="rounded-md border border-ink-600 px-2 py-0.5 text-2xs text-mute-200 hover:border-accent">{t('Disable')}</button>
        )}
        {p.enabled && (p.verdict === 'reduce' || p.verdict === 'review') && p.weight > 20 && (
          <button onClick={() => onAction({ type: 'weight', key: p.key, weight: Math.round(p.weight / 2) })} className="rounded-md border border-ink-600 px-2 py-0.5 text-2xs text-mute-200 hover:border-accent">
            {t('Halve weight')} ({p.weight} → {Math.round(p.weight / 2)})</button>
        )}
        {!p.enabled && p.verdict === 'consider_adding' && (
          <button onClick={() => onAction({ type: 'enable', key: p.key, weight: 40 })} className="rounded-md border border-sky-500/40 px-2 py-0.5 text-2xs text-sky-300 hover:bg-sky-500/10">{t('Enable (weight 40)')}</button>
        )}
      </div>
    </div>
  );
}
