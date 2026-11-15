import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpDown, Award, BadgeCheck, Columns3, Filter, Globe2, ListOrdered, Loader2, MapPin, ShieldCheck, Sparkles, Target } from 'lucide-react';
import type { Verification } from '../lib/api';
import { useT } from '../i18n';
import AdvisorPanel from './AdvisorPanel';
import type { ConfigAction } from './AdvisorPanel';
import type { AnalyzeResponse, TopLocation } from '../lib/api';
import { api } from '../lib/api';
import { fmtLat, fmtLon, scoreColor } from '../lib/format';
import { Meter, ScoreRing, Segmented, Skeleton, Spinner } from './ui';

interface Props {
  result: AnalyzeResponse | null;
  loading: boolean;
  error: string | null;
  selectedCell: number | null;
  compare: TopLocation[];
  onSelect: (t: TopLocation) => void;
  onToggleCompare: (t: TopLocation) => void;
  onOpenCompare: () => void;
  onPickSite: (lat: number, lon: number) => void;
  verifyMap: Record<number, Verification | 'pending'>;
  llmAvailable: boolean;
  topN: number;
  sep: number;
  onAction: (a: ConfigAction) => void;
}

type SortKey = 'score' | 'confidence' | 'name';
const FILTER_SELECT = 'tn-select rounded-md border border-ink-600 bg-ink-850 py-1 pl-2 text-2xs text-mute-100 focus:border-accent focus:outline-none';

export default function ResultsPanel(p: Props) {
  const t = useT();
  const [tab, setTab] = useState<'ranking' | 'validation' | 'advisor'>('ranking');
  const [sort, setSort] = useState<SortKey>('score');
  const [continent, setContinent] = useState('all');
  const [minConf, setMinConf] = useState(0);
  const r = p.result;

  const continents = useMemo(() => Array.from(new Set((r?.top ?? []).map((t) => t.continent).filter(Boolean))) as string[], [r]);
  const list = useMemo(() => {
    let l = [...(r?.top ?? [])];
    if (continent !== 'all') l = l.filter((t) => t.continent === continent);
    l = l.filter((t) => t.confidence >= minConf);
    l.sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : (b[sort] as number) - (a[sort] as number)));
    return l;
  }, [r, sort, continent, minConf]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ink-700/70 bg-ink-925 px-4 pb-3 pt-4">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-2xs font-medium uppercase tracking-[0.14em] text-mute-400"><Award size={12} />{t('Best locations')}</div>
          {p.loading && <Spinner />}
        </div>
        <Segmented size="sm" value={tab} onChange={setTab} options={[
          { value: 'ranking', label: t('Top 10 ranking'), icon: ListOrdered },
          { value: 'validation', label: t('Known analog sites'), icon: BadgeCheck },
          { value: 'advisor', label: t('Advisor'), icon: Sparkles },
        ]} />
        {tab !== 'advisor' && p.result && !p.loading && (
          <button onClick={() => setTab('advisor')} className="mt-2 flex w-full items-center gap-2 rounded-lg border border-accent/30 bg-accent/[0.07] px-3 py-1.5 text-left text-2xs text-mute-200 hover:border-accent/60">
            <Sparkles size={12} className="shrink-0 text-accent" />{t('Research complete – open the advisor for advice on your inputs')}
          </button>
        )}
      </div>

      {p.error && (
        <div className="m-3 flex gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-2.5 text-xs text-red-200">
          <AlertTriangle size={14} className="mt-px shrink-0" />{t('Analysis failed')}: {p.error}
        </div>
      )}
      {r?.warnings.map((w, i) => (
        <div key={i} className="mx-3 mt-2 flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-2xs leading-relaxed text-amber-200">
          <AlertTriangle size={13} className="mt-px shrink-0" />{w}
        </div>
      ))}

      {tab === 'advisor' ? (
        <AdvisorPanel rid={r?.result_id ?? null} topN={p.topN} sep={p.sep} llmAvailable={p.llmAvailable} onAction={p.onAction} />
      ) : tab === 'ranking' ? (
        <>
          {r ? <Stats r={r} /> : <div className="space-y-2 border-b border-ink-700/70 p-4"><Skeleton className="h-10" /><Skeleton className="h-8" /></div>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-ink-700/70 bg-ink-925/60 px-4 py-2.5 text-2xs text-mute-400">
            <label className="flex items-center gap-1.5"><ArrowUpDown size={11} />{t('Sort')}
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={FILTER_SELECT}>
                <option value="score">{t('Score')}</option><option value="confidence">{t('Confidence')}</option><option value="name">{t('Name')}</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5"><Globe2 size={11} />{t('Region')}
              <select value={continent} onChange={(e) => setContinent(e.target.value)} className={`${FILTER_SELECT} max-w-[118px]`}>
                <option value="all">{t('All')}</option>{continents.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5"><Filter size={11} />{t('Conf ≥')}
              <select value={minConf} onChange={(e) => setMinConf(Number(e.target.value))} className={FILTER_SELECT}>
                {[0, 50, 70, 85].map((v) => <option key={v} value={v}>{v}%</option>)}
              </select>
            </label>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {!r && !p.error && (
              <>
                <div className="px-1 text-xs text-mute-400">{t('Computing…')}</div>
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
              </>
            )}
            {r && list.length === 0 && (
              <div className="rounded-xl border border-dashed border-ink-700 p-5 text-center text-xs text-mute-400">{t('No location satisfies the current constraints and filters.')}</div>
            )}
            {list.map((t) => <ResultCard key={t.cell} t={t} selected={p.selectedCell === t.cell} inCmp={p.compare.some((c) => c.cell === t.cell)}
              onSelect={() => p.onSelect(t)} onToggleCompare={() => p.onToggleCompare(t)} ver={p.verifyMap[t.cell]} />)}
          </div>
          {p.compare.length > 0 && (
            <div className="border-t border-ink-700 bg-ink-925 p-3">
              <button onClick={p.onOpenCompare} disabled={p.compare.length < 2}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2 text-xs font-semibold text-ink-950 transition-opacity hover:opacity-90 disabled:bg-ink-700 disabled:text-mute-400">
                <Columns3 size={14} />
                {t('Compare {n} locations side by side', { n: p.compare.length })}{p.compare.length < 2 ? ` ${t('(select ≥2)')}` : ''}
              </button>
            </div>
          )}
        </>
      ) : (
        <Validation rid={r?.result_id ?? null} onPick={p.onPickSite} />
      )}
    </div>
  );
}

function ResultCard({ t, selected, inCmp, onSelect, onToggleCompare, ver }: {
  t: TopLocation; selected: boolean; inCmp: boolean; onSelect: () => void; onToggleCompare: () => void; ver?: Verification | 'pending';
}) {
  const tr = useT();
  return (
    <div onClick={onSelect} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onSelect(); }}
      className={`group cursor-pointer rounded-xl border p-3 transition-all ${selected ? 'border-accent/60 bg-accent/[0.07] shadow-[0_0_0_1px_rgba(79,163,255,0.2)]' : 'border-ink-700 bg-ink-875 hover:border-ink-500 hover:bg-ink-850'}`}>
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center gap-1">
          <span className={`grid h-6 w-6 place-items-center rounded-full font-mono text-2xs font-semibold ${t.rank <= 3 ? 'bg-accent/15 text-accent' : 'bg-ink-750 text-mute-300'}`}>{t.rank}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold leading-tight text-white" title={t.name}>{t.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-mute-400">
            <span className="flex items-center gap-1"><MapPin size={10} />{t.country}</span>
            <span className="font-mono text-mute-500">{fmtLat(t.lat)} {fmtLon(t.lon)}</span>
          </div>
        </div>
        <ScoreRing value={t.score} size={42} label={<span style={{ color: scoreColor(t.score) }}>{t.score.toFixed(1)}</span>} />
      </div>
      <div className="mt-2.5 flex items-center gap-2 text-2xs text-mute-400">
        <span className="w-16 shrink-0">{tr('conf')} {t.confidence.toFixed(0)}%</span>
        <Meter value={t.confidence} color="#5b9bd5" className="flex-1" />
      </div>
      <p className="mt-2 text-2xs leading-relaxed text-mute-300">{t.summary}</p>
      {t.flagged && (
        <p className="mt-1.5 flex gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-2xs text-amber-300"><AlertTriangle size={11} className="mt-px shrink-0" />{tr('Violates')}: {t.failed_constraints.join(', ')}</p>
      )}
      <label className={`mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 text-2xs transition-colors ${inCmp ? 'bg-accent/10 text-accent' : 'text-mute-400 hover:text-mute-200'}`} onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={inCmp} onChange={onToggleCompare} className="accent-[#4fa3ff]" /> {tr('compare')}
      </label>
      {ver && <VerBadge v={ver} />}
    </div>
  );
}

function VerBadge({ v }: { v: Verification | 'pending' }) {
  const t = useT();
  if (v === 'pending') return <span className="ml-2 inline-flex items-center gap-1 text-2xs text-mute-400"><Loader2 size={11} className="animate-spin" />{t('NASA check…')}</span>;
  const m = { verified: ['text-emerald-300', t('NASA verified')], discrepancies: ['text-amber-300', t('NASA: discrepancies')], unavailable: ['text-mute-400', t('NASA: not verified')] }[v.status];
  return <span className={`ml-2 inline-flex items-center gap-1 text-2xs ${m[0]}`} title={v.summary}><ShieldCheck size={11} />{m[1]}</span>;
}

function Stats({ r }: { r: AnalyzeResponse }) {
  const t = useT();
  const max = Math.max(...r.stats.score_hist, 1);
  return (
    <div className="border-b border-ink-700/70 px-4 py-3">
      <div className="grid grid-cols-3 gap-2">
        {[
          [t('Eligible cells'), r.stats.ok.toLocaleString(), 'text-emerald-300'],
          [t('Excluded / flagged'), (r.stats.excluded + r.stats.flagged).toLocaleString(), 'text-amber-300'],
          [t('No data'), r.stats.no_data.toLocaleString(), 'text-mute-300'],
        ].map(([k, v, c]) => (
          <div key={k} className="rounded-lg border border-ink-700 bg-ink-875 px-2 py-2 text-center">
            <div className={`font-mono text-sm font-medium tabular ${c}`}>{v}</div>
            <div className="mt-0.5 text-2xs leading-tight text-mute-400">{k}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex h-9 items-end gap-[3px]" title="Distribution of scores across eligible land cells (0–100)">
        {r.stats.score_hist.map((c, i) => (
          <div key={i} className="flex-1 rounded-t-[3px]" style={{ height: `${Math.max(3, (c / max) * 100)}%`, background: scoreColor(i * 10 + 5), opacity: 0.9 }}
            title={`${i * 10}–${i * 10 + 10}: ${c.toLocaleString()} cells`} />
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-2xs text-mute-500"><span>0</span><span>{t('score distribution')} · {r.elapsed_ms} ms</span><span>100</span></div>
    </div>
  );
}

function Validation({ rid, onPick }: { rid: string | null; onPick: (lat: number, lon: number) => void }) {
  const t = useT();
  const [sites, setSites] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!rid) return;
    setErr(null);
    api.validation(rid).then((v) => setSites(v.sites)).catch((e) => setErr(String(e.message ?? e)));
  }, [rid]);
  if (err) return <div className="p-4 text-xs text-red-300">{err}</div>;
  if (!sites) return <div className="space-y-2 p-3"><div className="px-1 text-xs text-mute-400">{t('Loading…')}</div>{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}</div>;
  const sorted = [...sites].sort((a, b) => Number(b.same_body) - Number(a.same_body) || (b.percentile ?? -1) - (a.percentile ?? -1));
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="m-3 flex gap-2 rounded-lg border border-ink-700 bg-ink-875 p-3 text-2xs leading-relaxed text-mute-400">
        <Target size={13} className="mt-px shrink-0 text-accent" />
        <span>{t('Sanity check: where do analog sites actually used by NASA/ESA fall in the current score distribution? Percentile = share of all land cells scoring lower. These sites are never used as inputs.')}</span>
      </div>
      <div className="space-y-1.5 px-3 pb-3">
        {sorted.map((s) => (
          <button key={s.name} onClick={() => onPick(s.lat, s.lon)}
            className="block w-full rounded-lg border border-ink-700 bg-ink-875 px-3 py-2 text-left transition-colors hover:border-ink-500 hover:bg-ink-850">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2 truncate text-xs font-medium text-white">
                <span className={`h-2 w-2 shrink-0 rounded-full ${s.body === 'mars' ? 'bg-mars' : 'bg-moon'}`} />{s.name}
              </span>
              <span className="shrink-0 font-mono text-xs font-medium" style={{ color: scoreColor(s.score) }}>{s.score ?? '—'}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 text-2xs text-mute-400">
              <span className="truncate">{s.use}</span>
              <span className="shrink-0 rounded bg-ink-750 px-1.5 font-mono text-mute-300">{s.percentile !== null ? `P${s.percentile.toFixed(0)}` : 'n/a'}</span>
            </div>
            {s.percentile !== null && <Meter value={s.percentile} color={scoreColor(s.score)} className="mt-1.5 h-1" />}
          </button>
        ))}
      </div>
    </div>
  );
}
