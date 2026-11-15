import { useEffect, useMemo, useState } from 'react';
import type { AnalyzeResponse, TopLocation } from '../lib/api';
import { api } from '../lib/api';
import { fmtLat, fmtLon, scoreColor } from '../lib/format';
import { Segmented, Spinner } from './ui';

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
}

type SortKey = 'score' | 'confidence' | 'name';

export default function ResultsPanel(p: Props) {
  const [tab, setTab] = useState<'ranking' | 'validation'>('ranking');
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
      <div className="border-b border-ink-700 px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-2xs uppercase tracking-[0.12em] text-mute-400">Best locations</div>
          {p.loading && <Spinner />}
        </div>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'ranking', label: 'Top 10 ranking' }, { value: 'validation', label: 'Known analog sites' }]} />
      </div>

      {p.error && <div className="m-3 rounded border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-200">Analysis failed: {p.error}</div>}
      {r?.warnings.map((w, i) => <div key={i} className="mx-3 mt-2 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-2xs text-amber-200">{w}</div>)}

      {tab === 'ranking' ? (
        <>
          {r && <Stats r={r} />}
          <div className="flex flex-wrap items-center gap-2 border-b border-ink-700 px-4 py-2 text-2xs text-mute-400">
            <label className="flex items-center gap-1">Sort
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded border border-ink-600 bg-ink-850 px-1 py-0.5 text-mute-200">
                <option value="score">Score</option><option value="confidence">Confidence</option><option value="name">Name</option>
              </select>
            </label>
            <label className="flex items-center gap-1">Region
              <select value={continent} onChange={(e) => setContinent(e.target.value)} className="max-w-[110px] rounded border border-ink-600 bg-ink-850 px-1 py-0.5 text-mute-200">
                <option value="all">All</option>{continents.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1">Conf ≥
              <select value={minConf} onChange={(e) => setMinConf(Number(e.target.value))} className="rounded border border-ink-600 bg-ink-850 px-1 py-0.5 text-mute-200">
                {[0, 50, 70, 85].map((v) => <option key={v} value={v}>{v}%</option>)}
              </select>
            </label>
          </div>
          <div className="flex-1 overflow-y-auto">
            {!r && !p.error && <div className="p-4 text-xs text-mute-400">Computing…</div>}
            {r && list.length === 0 && <div className="p-4 text-xs text-mute-400">No location satisfies the current constraints and filters.</div>}
            {list.map((t) => {
              const inCmp = p.compare.some((c) => c.cell === t.cell);
              const sel = p.selectedCell === t.cell;
              return (
                <div key={t.cell} onClick={() => p.onSelect(t)}
                  className={`cursor-pointer border-b border-ink-800 px-4 py-2.5 transition-colors ${sel ? 'bg-accent/10' : 'hover:bg-ink-850'}`}>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 w-5 shrink-0 font-mono text-xs text-mute-400">{t.rank}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-sm text-white" title={t.name}>{t.name}</div>
                        <div className="shrink-0 font-mono text-sm font-medium tabular" style={{ color: scoreColor(t.score) }}>{t.score.toFixed(1)}</div>
                      </div>
                      <div className="flex items-center justify-between text-2xs text-mute-400">
                        <span className="truncate">{t.country} · <span className="font-mono">{fmtLat(t.lat)} {fmtLon(t.lon)}</span></span>
                        <span className="shrink-0 font-mono">conf {t.confidence.toFixed(0)}%</span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded bg-ink-700"><div className="h-full" style={{ width: `${t.score}%`, background: scoreColor(t.score) }} /></div>
                      <p className="mt-1 text-2xs leading-snug text-mute-400">{t.summary}</p>
                      {t.flagged && <p className="mt-0.5 text-2xs text-amber-300">⚠ Violates: {t.failed_constraints.join(', ')}</p>}
                      <label className="mt-1 flex items-center gap-1.5 text-2xs text-mute-400" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={inCmp} onChange={() => p.onToggleCompare(t)} className="accent-[#4fa3ff]" /> compare
                      </label>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {p.compare.length > 0 && (
            <div className="border-t border-ink-700 p-3">
              <button onClick={p.onOpenCompare} disabled={p.compare.length < 2}
                className="w-full rounded bg-accent/90 py-1.5 text-xs font-medium text-ink-950 hover:bg-accent disabled:bg-ink-600 disabled:text-mute-400">
                Compare {p.compare.length} location{p.compare.length > 1 ? 's' : ''} side by side{p.compare.length < 2 ? ' (select ≥2)' : ''}
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

function Stats({ r }: { r: AnalyzeResponse }) {
  const max = Math.max(...r.stats.score_hist, 1);
  return (
    <div className="border-b border-ink-700 px-4 py-2.5">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[['Eligible cells', r.stats.ok.toLocaleString()], ['Excluded / flagged', (r.stats.excluded + r.stats.flagged).toLocaleString()], ['No data', r.stats.no_data.toLocaleString()]].map(([k, v]) => (
          <div key={k}><div className="font-mono text-sm text-white tabular">{v}</div><div className="text-2xs text-mute-400">{k}</div></div>
        ))}
      </div>
      <div className="mt-2 flex h-8 items-end gap-0.5" title="Distribution of scores across eligible land cells (0–100)">
        {r.stats.score_hist.map((c, i) => (
          <div key={i} className="flex-1 rounded-t-sm" style={{ height: `${Math.max(2, (c / max) * 100)}%`, background: scoreColor(i * 10 + 5), opacity: 0.85 }}
            title={`${i * 10}–${i * 10 + 10}: ${c.toLocaleString()} cells`} />
        ))}
      </div>
      <div className="mt-0.5 flex justify-between font-mono text-2xs text-mute-400"><span>0</span><span>score distribution · {r.elapsed_ms} ms</span><span>100</span></div>
    </div>
  );
}

function Validation({ rid, onPick }: { rid: string | null; onPick: (lat: number, lon: number) => void }) {
  const [sites, setSites] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!rid) return;
    setErr(null);
    api.validation(rid).then((v) => setSites(v.sites)).catch((e) => setErr(String(e.message ?? e)));
  }, [rid]);
  if (err) return <div className="p-4 text-xs text-red-300">{err}</div>;
  if (!sites) return <div className="p-4 text-xs text-mute-400">Loading…</div>;
  const sorted = [...sites].sort((a, b) => Number(b.same_body) - Number(a.same_body) || (b.percentile ?? -1) - (a.percentile ?? -1));
  return (
    <div className="flex-1 overflow-y-auto">
      <p className="px-4 py-2 text-2xs leading-relaxed text-mute-400">
        Sanity check: where do analog sites actually used by NASA/ESA fall in the current score distribution? Percentile = share of all land cells scoring lower. These sites are never used as inputs.
      </p>
      {sorted.map((s) => (
        <button key={s.name} onClick={() => onPick(s.lat, s.lon)} className="block w-full border-b border-ink-800 px-4 py-2 text-left hover:bg-ink-850">
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2 truncate text-xs text-white">
              <span className={`h-2 w-2 shrink-0 rounded-full ${s.body === 'mars' ? 'bg-mars' : 'bg-moon'}`} />{s.name}
            </span>
            <span className="shrink-0 font-mono text-xs" style={{ color: scoreColor(s.score) }}>{s.score ?? '—'}</span>
          </div>
          <div className="flex justify-between text-2xs text-mute-400">
            <span className="truncate">{s.use}</span>
            <span className="shrink-0 font-mono">{s.percentile !== null ? `P${s.percentile.toFixed(0)}` : 'n/a'}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
