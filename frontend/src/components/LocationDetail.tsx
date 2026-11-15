import { useEffect, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  AlertTriangle, BarChart3, BookOpen, Check, CloudRain, Columns3, Crosshair, Download, FileText, FlaskConical, Info, LayoutDashboard,
  MapPin, Mountain, Radio, Sigma, Sparkles, Sun, Sunrise, Table2, Thermometer, Wind,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AnalysisConfig, DetailRow, LocationDetail as LD, Meta } from '../lib/api';
import { api } from '../lib/api';
import { exportGeoJson, exportPdf } from '../lib/exporters';
import { fmtDiff, fmtLat, fmtLon, fmtNum, fmtValue, QUALITY_CLASS, QUALITY_LABEL, REPRO_CLASS, REPRO_SHORT, scoreColor } from '../lib/format';
import { Badge, Card, Chip, Meter, Modal, ScoreRing, Segmented, Skeleton, Spinner } from './ui';

// Validated categorical slots (dark surface): blue, orange, aqua. Target = neutral dashed line.
const C1 = '#3987e5', C2 = '#d95926', C3 = '#199e70', TGT = '#cdd5df';
const AX = { stroke: '#2d384b', tick: { fill: '#8b97a8', fontSize: 11 } };
const TT = { contentStyle: { background: '#0c1018', border: '1px solid #2d384b', fontSize: 12, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }, labelStyle: { color: '#cdd5df' } };
const GRID = '#1c2433';

type Tab = 'overview' | 'table' | 'charts' | 'terrain' | 'live' | 'sources';

export default function LocationDetail({ d, loading, cfg, meta, onClose, onAddCompare, inCompare }: {
  d: LD | null; loading: boolean; cfg: AnalysisConfig; meta: Meta; onClose: () => void; onAddCompare: () => void; inCompare: boolean;
}) {
  const [tab, setTab] = useState<Tab>('overview');
  if (!d) {
    return (
      <Modal title="Location analysis" onClose={onClose} wide>
        <div className="p-6">
          <div className="mb-5 flex items-center gap-2 text-sm text-mute-400">{loading ? <><Spinner /> Loading location analysis…</> : 'No data.'}</div>
          {loading && <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-40" /><Skeleton className="h-40" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>}
        </div>
      </Modal>
    );
  }
  const ok = d.status === 'ok';
  const header = (
    <div className="border-b border-ink-700 bg-gradient-to-b from-ink-925 to-ink-900">
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div className="flex flex-wrap items-center gap-5">
          <div className="flex items-center gap-3">
            <ScoreRing value={d.score} size={64} stroke={5} label={<span style={{ color: scoreColor(d.score) }}>{d.score === null ? '—' : d.score.toFixed(1)}</span>} />
            <div>
              <div className="text-2xs uppercase tracking-[0.14em] text-mute-400">Compatibility</div>
              <div className="font-mono text-lg tabular text-white">{d.score === null ? '—' : d.score.toFixed(1)}<span className="ml-1 text-xs text-mute-400">/ 100</span></div>
            </div>
          </div>
          <div className="h-10 w-px bg-ink-700" />
          <div className="min-w-[140px]">
            <div className="text-2xs uppercase tracking-[0.14em] text-mute-400">Data confidence</div>
            <div className="font-mono text-lg tabular text-white">{d.confidence === null ? '—' : d.confidence.toFixed(0)}<span className="ml-1 text-xs text-mute-400">%</span></div>
            <Meter value={d.confidence} color="#5b9bd5" className="mt-1" />
          </div>
          <div className="h-10 w-px bg-ink-700" />
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 text-mute-300"><Crosshair size={12} className="text-mute-400" />vs. {d.target.name}</div>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs ${ok ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/40 bg-amber-500/10 text-amber-300'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-amber-400'}`} />Status: {d.status}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onAddCompare} className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${inCompare ? 'border-accent/50 bg-accent/10 text-accent' : 'border-ink-600 text-mute-200 hover:border-accent hover:text-white'}`}>
            {inCompare ? <Check size={13} /> : <Columns3 size={13} />}{inCompare ? '✓ In comparison' : '+ Compare'}
          </button>
          <button onClick={() => exportGeoJson([{ lat: d.lat, lon: d.lon, props: { name: d.name, country: d.country, score: d.score, confidence: d.confidence, reference: d.target.name } }])}
            className="flex items-center gap-1.5 rounded-lg border border-ink-600 px-3 py-1.5 text-xs text-mute-200 transition-colors hover:border-accent hover:text-white"><Download size={13} />GeoJSON</button>
          <button onClick={() => exportPdf(d, cfg, meta)} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-ink-950 transition-opacity hover:opacity-90"><FileText size={13} />PDF report</button>
        </div>
      </div>
      <div className="overflow-x-auto px-5 pb-3">
        <div className="min-w-[640px]">
          <Segmented value={tab} onChange={setTab} options={[
            { value: 'overview', label: 'Overview', icon: LayoutDashboard }, { value: 'table', label: 'Comparison table', icon: Table2 },
            { value: 'charts', label: 'Climate charts', icon: BarChart3 }, { value: 'terrain', label: 'Terrain', icon: Mountain },
            { value: 'live', label: 'Live data', icon: Radio }, { value: 'sources', label: 'Sources & limits', icon: BookOpen },
          ]} />
        </div>
      </div>
    </div>
  );
  return (
    <Modal wide onClose={onClose} header={header} title={
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="truncate">{d.name}</span>
        <span className="flex items-center gap-1.5 text-xs font-normal text-mute-400">
          <Chip icon={MapPin}>{d.country}</Chip>
          <Chip><span className="font-mono">{fmtLat(d.lat)} {fmtLon(d.lon)}</span></Chip>
        </span>
        {d.data_mode === 'demo' && <Badge className="border-amber-500/50 text-amber-300">SYNTHETIC DEMO DATA</Badge>}
      </div>}>
      <div key={tab} className="tn-in p-5">
        {tab === 'overview' && <Overview d={d} />}
        {tab === 'table' && <Table d={d} meta={meta} />}
        {tab === 'charts' && <Charts d={d} />}
        {tab === 'terrain' && <Terrain d={d} />}
        {tab === 'live' && <Live d={d} />}
        {tab === 'sources' && <Sources d={d} />}
      </div>
    </Modal>
  );
}

function Overview({ d }: { d: LD }) {
  const rows = d.rows.filter((r) => r.enabled && r.similarity !== null).sort((a, b) => b.weight - a.weight);
  const nonrep = d.rows.filter((r) => r.repro === 'laboratory' || r.repro === 'impossible');
  const [lead, ...rest] = d.explanation;
  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
      <div className="space-y-5">
        <Card title="Why this location" icon={Sparkles}>
          <p className="text-[15px] leading-relaxed text-white">{lead}</p>
          <div className="mt-3 space-y-2.5 text-sm leading-relaxed text-mute-300">{rest.map((e, i) => <p key={i}>{e}</p>)}</div>
          {d.failed_constraints.length > 0 && (
            <div className="mt-4 flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
              <AlertTriangle size={14} className="mt-px shrink-0" />Constraint violations: {d.failed_constraints.join('; ')}
            </div>
          )}
        </Card>
        <Card title="Category scores" icon={Sigma}>
          <div className="space-y-2.5">
            {Object.entries(d.category_scores).map(([k, v]) => (
              <div key={k} className="flex items-center gap-3 text-xs">
                <span className="w-32 shrink-0 text-mute-300">{k}</span>
                <Meter value={v} className="h-2 flex-1" />
                <span className="w-10 text-right font-mono tabular text-white">{fmtNum(v, 0)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div className="space-y-5">
        <Card title="Parameter similarity (enabled, by weight)" icon={BarChart3}>
          <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 26 + 30)}>
            <BarChart data={rows.map((r) => ({ name: r.label, sim: Math.round((r.similarity ?? 0) * 100), w: r.weight }))} layout="vertical" margin={{ left: 0, right: 16 }}>
              <CartesianGrid horizontal={false} stroke={GRID} />
              <XAxis type="number" domain={[0, 100]} {...AX} />
              <YAxis type="category" dataKey="name" width={195} {...AX} tick={{ fill: '#cdd5df', fontSize: 11 }} />
              <Tooltip {...TT} formatter={(v: any, _n, it: any) => [`${v}% (weight ${it.payload.w})`, 'Similarity']} cursor={{ fill: '#171e2b' }} />
              <Bar isAnimationActive={false} dataKey="sim" fill={C1} radius={[0, 4, 4, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Conditions no Earth field site can reproduce" icon={FlaskConical}>
          <div className="space-y-2 text-xs">
            {nonrep.map((r) => (
              <div key={r.key} className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-mute-100">{r.label}</span>
                  <span className={`text-2xs ${REPRO_CLASS[r.repro]}`}>{REPRO_SHORT[r.repro]}</span>
                </div>
                <div className="mt-1 font-mono text-2xs text-mute-400">Earth {fmtValue(r.earth, r.unit)} · target {fmtValue(r.target?.value, r.unit)}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Table({ d, meta }: { d: LD; meta: Meta }) {
  const groups: [string, DetailRow[]][] = [];
  for (const r of d.rows) {
    const g = groups.find(([c]) => c === r.category);
    if (g) g[1].push(r); else groups.push([r.category, [r]]);
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-700">
      <table className="w-full min-w-[920px] text-xs">
        <thead className="sticky top-0 z-[1] bg-ink-925">
          <tr className="border-b border-ink-600 text-left text-2xs uppercase tracking-wider text-mute-400">
            <th className="px-3 py-2.5">Parameter</th><th className="px-3">Target</th><th className="px-3">Earth</th><th className="px-3">Difference</th>
            <th className="px-3">Similarity</th><th className="px-3">Reproducibility</th><th className="px-3">Data source</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(([cat, rows]) => (
            <GroupRows key={cat} label={meta.categories[cat] ?? cat} rows={rows} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({ label, rows }: { label: string; rows: DetailRow[] }) {
  return (
    <>
      <tr className="bg-ink-850/80">
        <td colSpan={7} className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-[0.12em] text-mute-300">{label}</td>
      </tr>
      {rows.map((r) => (
        <tr key={r.key} className={`border-b border-ink-800 align-top transition-colors hover:bg-ink-850/50 ${r.enabled ? '' : 'opacity-55'}`}>
          <td className="px-3 py-2.5">
            <div className="font-medium text-mute-100">{r.label}</div>
            <div className="mt-0.5 text-2xs text-mute-400">{r.enabled ? `weight ${r.weight}` : r.not_applicable ? 'not applicable' : 'disabled'} · {r.unit}</div>
          </td>
          <td className="px-3 py-2.5">
            {r.target ? (
              <>
                <div className="font-mono text-white">{fmtValue(r.target.value, r.unit)}</div>
                <div className="mt-1"><Badge className={QUALITY_CLASS[r.target.quality] ?? 'border-ink-600'}>{QUALITY_LABEL[r.target.quality] ?? r.target.quality}</Badge></div>
                <div className="mt-1 max-w-[210px] text-2xs leading-snug text-mute-400" title={r.target.note}>{r.target.source}</div>
              </>
            ) : <span className="text-mute-400">n/a</span>}
          </td>
          <td className="px-3 py-2.5">
            <div className="font-mono text-white">{r.earth_available ? fmtValue(r.earth, r.unit) : <span className="text-mute-400">unavailable</span>}</div>
            <div className="mt-1"><Badge className={QUALITY_CLASS[r.quality]}>{QUALITY_LABEL[r.quality]}</Badge></div>
          </td>
          <td className="px-3 py-2.5 font-mono text-mute-300">{fmtDiff(r.difference)}</td>
          <td className="px-3 py-2.5">
            {r.similarity === null ? <span className="text-mute-400">—</span> : (
              <div className="flex items-center gap-2">
                <Meter value={r.similarity * 100} className="w-14" />
                <span className="font-mono tabular text-white">{(r.similarity * 100).toFixed(0)}%</span>
              </div>
            )}
          </td>
          <td className={`px-3 py-2.5 ${REPRO_CLASS[r.repro]}`}>{REPRO_SHORT[r.repro]}</td>
          <td className="max-w-[220px] px-3 py-2.5 text-2xs leading-snug text-mute-400" title={r.method}>{r.source.name}<br /><span className="text-mute-500">{r.source.resolution}</span></td>
        </tr>
      ))}
    </>
  );
}

function series(d: LD, keys: Record<string, string>) {
  return d.monthly.months.map((m, i) => {
    const o: any = { month: m };
    for (const [k, src] of Object.entries(keys)) { const s = d.monthly[src] as (number | null)[] | null; o[k] = s ? s[i] : null; }
    return o;
  });
}

function target(d: LD, key: string) { return d.rows.find((r) => r.key === key)?.target?.value; }

function ChartCard({ title, note, icon: Icon, children }: { title: string; note?: string; icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-875 p-4 shadow-panel">
      <div className="mb-3 flex items-start gap-2.5">
        {Icon && <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-accent/10 text-accent"><Icon size={13} /></span>}
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-mute-100">{title}</div>
          {note && <div className="mt-0.5 text-2xs leading-relaxed text-mute-400">{note}</div>}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>{children as any}</ResponsiveContainer>
    </div>
  );
}

function Charts({ d }: { d: LD }) {
  if (!d.monthly.t2m) return <div className="rounded-xl border border-dashed border-ink-700 p-8 text-center text-sm text-mute-400">No monthly climatology available for this cell.</div>;
  const tm = target(d, 'temp_mean');
  const tx = target(d, 'temp_extremes');
  const tdr = target(d, 'temp_daily');
  const tsol = target(d, 'solar_irradiance');
  const tdl = target(d, 'daylight');
  const temp = series(d, { mean: 't2m', max: 't2m_max', min: 't2m_min' });
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ChartCard icon={Thermometer} title="Monthly temperature (2 m air, °C)" note="NASA POWER MERRA-2 climatology 2001–2020. Dashed: target mean surface temp.; shaded: target extremes.">
        <LineChart data={temp} margin={{ right: 12, top: 6 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" {...AX} /><YAxis {...AX} domain={['auto', 'auto']} width={44} />
          <Tooltip {...TT} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {tx && <ReferenceArea y1={tx[0]} y2={tx[1]} fill="#cdd5df" fillOpacity={0.05} ifOverflow="extendDomain" />}
          {tm !== undefined && <ReferenceLine y={tm} stroke={TGT} strokeDasharray="5 4" ifOverflow="extendDomain" label={{ value: `target ${tm}°C`, fill: TGT, fontSize: 10, position: 'insideTopRight' }} />}
          <Line isAnimationActive={false} dataKey="max" name="Mean daily max" stroke={C2} strokeWidth={2} dot={false} />
          <Line isAnimationActive={false} dataKey="mean" name="Mean" stroke={C1} strokeWidth={2} dot={false} />
          <Line isAnimationActive={false} dataKey="min" name="Mean daily min" stroke={C3} strokeWidth={2} dot={false} />
        </LineChart>
      </ChartCard>
      <ChartCard icon={Thermometer} title="Daily surface temperature range (°C)" note="POWER TS_RANGE (skin temperature). Dashed: target diurnal range.">
        <LineChart data={series(d, { range: 'ts_range' })} margin={{ right: 12, top: 6 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" {...AX} /><YAxis {...AX} width={44} domain={[0, 'auto']} />
          <Tooltip {...TT} />
          {tdr !== undefined && <ReferenceLine y={tdr} stroke={TGT} strokeDasharray="5 4" ifOverflow="extendDomain" label={{ value: `target ${tdr}°C`, fill: TGT, fontSize: 10, position: 'insideBottomRight' }} />}
          <Line isAnimationActive={false} dataKey="range" name="Earth daily range" stroke={C1} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ChartCard>
      <ChartCard icon={Sun} title="Solar irradiation through the year (W/m², 24 h mean)" note="CERES SYN1deg via POWER. Earth surface vs. top of atmosphere; dashed: target.">
        <LineChart data={series(d, { surface: 'solar', toa: 'toa' })} margin={{ right: 12, top: 6 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" {...AX} /><YAxis {...AX} width={44} />
          <Tooltip {...TT} /><Legend wrapperStyle={{ fontSize: 11 }} />
          {tsol !== undefined && <ReferenceLine y={tsol} stroke={TGT} strokeDasharray="5 4" ifOverflow="extendDomain" label={{ value: `target ${tsol}`, fill: TGT, fontSize: 10, position: 'insideTopRight' }} />}
          <Line isAnimationActive={false} dataKey="toa" name="Top of atmosphere" stroke={C2} strokeWidth={2} dot={false} />
          <Line isAnimationActive={false} dataKey="surface" name="Surface (all-sky)" stroke={C1} strokeWidth={2} dot={false} />
        </LineChart>
      </ChartCard>
      <ChartCard icon={Sunrise} title="Daylight duration (hours)" note="POWER DAY_HOURS. Shaded: target illuminated fraction × 24 h.">
        <LineChart data={series(d, { hours: 'day_hours' })} margin={{ right: 12, top: 6 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" {...AX} /><YAxis {...AX} width={44} domain={[0, 24]} ticks={[0, 6, 12, 18, 24]} />
          <Tooltip {...TT} />
          {tdl && <ReferenceArea y1={tdl[0] * 24} y2={Math.max(tdl[1] * 24, tdl[0] * 24 + 0.3)} fill="#cdd5df" fillOpacity={0.12} />}
          <Line isAnimationActive={false} dataKey="hours" name="Earth daylight" stroke={C1} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ChartCard>
      <ChartCard icon={CloudRain} title="Precipitation (mm/day)" note="POWER PRECTOTCORR. Both target bodies: 0.">
        <BarChart data={series(d, { precip: 'precip' })} margin={{ right: 12, top: 6 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" {...AX} /><YAxis {...AX} width={44} />
          <Tooltip {...TT} cursor={{ fill: '#171e2b' }} />
          <Bar isAnimationActive={false} dataKey="precip" name="Precipitation" fill={C1} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartCard>
      <ChartCard icon={Wind} title="Wind speed at 10 m (m/s)" note="POWER WS10M. Dashed: target mean wind.">
        <LineChart data={series(d, { wind: 'wind' })} margin={{ right: 12, top: 6 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" {...AX} /><YAxis {...AX} width={44} />
          <Tooltip {...TT} />
          {target(d, 'wind') !== undefined && <ReferenceLine y={target(d, 'wind')} stroke={TGT} strokeDasharray="5 4" ifOverflow="extendDomain" />}
          <Line isAnimationActive={false} dataKey="wind" name="Earth wind" stroke={C1} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ChartCard>
    </div>
  );
}

function Terrain({ d }: { d: LD }) {
  const [hi, setHi] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    api.live('terrain', d.lat, d.lon).then(setHi).catch((e) => setHi({ available: false, error: String(e.message ?? e) })).finally(() => setLoading(false));
  }, [d.lat, d.lon]);
  const slope = d.slope.bins.map((b, i) => ({ bin: b, earth: d.slope.earth_pct[i], target: d.slope.target_pct?.[i], hires: hi?.available ? hi.slope_hist_pct[i] : undefined }));
  const elev = hi?.available ? hi.elev_hist.counts.map((c: number, i: number) => ({ e: Math.round((hi.elev_hist.edges[i] + hi.elev_hist.edges[i + 1]) / 2), pct: +(c / hi.n_pixels * 100).toFixed(2) })) : [];
  const stats: [string, any, string][] = [
    ['Mean elevation', d.terrain.elev_mean, 'm'], ['Elevation std-dev', d.terrain.elev_std, 'm'], ['Relief (max−min)', d.terrain.relief_m, 'm'],
    ['Roughness', d.terrain.rough_m, 'm'], ['Slope median (2.4 km)', d.terrain.slope_p50, '°'], ['Slope p90 (2.4 km)', d.terrain.slope_p90, '°'],
    ['Slope median (150 m)', hi?.available ? hi.slope_p50 : null, '°'], ['Slope p90 (150 m)', hi?.available ? hi.slope_p90 : null, '°'],
    ['Bare ground', d.landcover.bare !== null && d.landcover.bare !== undefined ? d.landcover.bare * 100 : null, '%'],
    ['Vegetation', d.landcover.vegetation !== null && d.landcover.vegetation !== undefined ? d.landcover.vegetation * 100 : null, '%'],
    ['Distance to road', d.logistics.dist_road_km, 'km'], ['Nearest town', d.logistics.dist_place_km, 'km'],
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
        {stats.map(([k, v, u]) => (
          <div key={k} className="rounded-xl border border-ink-700 bg-ink-875 px-3 py-2.5">
            <div className="text-2xs text-mute-400">{k}</div>
            <div className="mt-0.5 font-mono text-[15px] tabular text-white">{fmtNum(v)} <span className="text-2xs text-mute-400">{u}</span></div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard icon={Mountain} title="Terrain slope distribution (% of cell area)" note="Earth: ~2.4 km pixels (grid) and ~150 m pixels (live sample). Target: log-normal from published median / p90.">
          <BarChart data={slope} margin={{ right: 12, top: 6 }} barGap={2}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="bin" {...AX} tick={{ fill: '#8b97a8', fontSize: 10 }} /><YAxis {...AX} width={40} />
            <Tooltip {...TT} cursor={{ fill: '#171e2b' }} /><Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar isAnimationActive={false} dataKey="earth" name="Earth (2.4 km)" fill={C1} radius={[4, 4, 0, 0]} />
            {hi?.available && <Bar isAnimationActive={false} dataKey="hires" name="Earth (150 m)" fill={C3} radius={[4, 4, 0, 0]} />}
            <Bar isAnimationActive={false} dataKey="target" name="Target" fill={C2} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartCard>
        <ChartCard icon={BarChart3} title="Elevation distribution inside the cell (% of pixels)" note={hi?.available ? `${hi.source}, ${hi.n_pixels.toLocaleString()} land pixels` : 'Live high-resolution DEM sample'}>
          {loading ? <div className="grid h-full place-items-center text-xs text-mute-400"><Spinner /></div> : hi?.available ? (
            <BarChart data={elev} margin={{ right: 12, top: 6 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="e" {...AX} tick={{ fill: '#8b97a8', fontSize: 10 }} unit=" m" /><YAxis {...AX} width={40} />
              <Tooltip {...TT} cursor={{ fill: '#171e2b' }} formatter={(v: any) => [`${v}%`, 'share']} labelFormatter={(l) => `${l} m`} />
              <Bar isAnimationActive={false} dataKey="pct" fill={C1} radius={[4, 4, 0, 0]} />
            </BarChart>
          ) : <div className="grid h-full place-items-center text-xs text-mute-400">Unavailable: {hi?.error}</div>}
        </ChartCard>
      </div>
    </div>
  );
}

function Live({ d }: { d: LD }) {
  const [power, setPower] = useState<any>(null);
  const [soil, setSoil] = useState<any>(null);
  useEffect(() => {
    api.live('nasa_power', d.lat, d.lon).then(setPower).catch((e) => setPower({ available: false, error: String(e) }));
    api.live('soilgrids', d.lat, d.lon).then(setSoil).catch((e) => setSoil({ available: false, error: String(e) }));
  }, [d.lat, d.lon]);
  const unavailable = (msg: string) => (
    <p className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200"><AlertTriangle size={14} className="mt-px shrink-0" />{msg}</p>
  );
  const kv = (rows: [string, any, string | undefined][]) => (
    <table className="w-full font-mono text-xs">
      <tbody>{rows.map(([k, v, u]) => (
        <tr key={k} className="border-b border-ink-800 last:border-0"><td className="py-1.5 text-mute-300">{k}</td><td className="text-right tabular text-white">{fmtNum(v)}</td><td className="pl-2 text-mute-400">{u}</td></tr>
      ))}</tbody>
    </table>
  );
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="NASA POWER point API (live)" icon={Radio} subtitle="Independent cross-check of the preprocessed grid via power.larc.nasa.gov. Annual values (ANN).">
        {!power ? <div className="space-y-2"><Skeleton className="h-5" /><Skeleton className="h-5" /><Skeleton className="h-5" /></div> : power.available
          ? kv(Object.entries(power.parameters).map(([k, v]: any) => [k, v.ANN, power.units?.[k]]))
          : unavailable(`Unavailable — ${power.error}. The preprocessed POWER climatology (AWS Open Data) is still used for scoring.`)}
      </Card>
      <Card title="ISRIC SoilGrids 2.0 (live, 0–5 cm)" icon={Radio} subtitle="Measured-model soil texture at 250 m. Shown for context; not used in the global score (no global grid in this build).">
        {!soil ? <div className="space-y-2"><Skeleton className="h-5" /><Skeleton className="h-5" /><Skeleton className="h-5" /></div> : soil.available
          ? kv(Object.entries(soil.properties).map(([k, v]: any) => [k, v.value, v.unit]))
          : unavailable(`Unavailable — ${soil.error}`)}
      </Card>
    </div>
  );
}

function Sources({ d }: { d: LD }) {
  const srcs = new Map<string, any>();
  d.rows.forEach((r) => srcs.set(r.source.name, r.source));
  const tsrc = new Set(d.rows.map((r) => r.target?.source).filter(Boolean) as string[]);
  return (
    <div className="grid gap-5 text-xs lg:grid-cols-2">
      <div className="space-y-5">
        <Card title="Earth datasets" icon={BookOpen}>
          <ul className="space-y-2">{[...srcs.values()].map((s) => (
            <li key={s.name} className="rounded-lg border border-ink-700 bg-ink-850 p-3"><div className="font-medium text-mute-100">{s.name}</div>
              <div className="mt-1 text-2xs text-mute-400">Resolution: {s.resolution}{s.period ? ` · Period: ${s.period}` : ''}</div>
              {s.url && <div className="mt-0.5 break-all text-2xs text-accent">{s.url}</div>}</li>))}</ul>
        </Card>
        <Card title="Calculation method" icon={Sigma}>
          <ul className="space-y-2.5 leading-relaxed text-mute-300">{d.rows.filter((r) => r.enabled).map((r) => (
            <li key={r.key} className="border-l-2 border-ink-600 pl-3"><span className="font-medium text-mute-100">{r.label}:</span> {r.method}</li>
          ))}</ul>
        </Card>
      </div>
      <div className="space-y-5">
        <Card title="Planetary reference sources" icon={Crosshair}>
          <ul className="space-y-1.5 text-mute-300">{[...tsrc].map((s) => <li key={s} className="flex gap-2"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-mute-400" />{s}</li>)}</ul>
        </Card>
        <Card title="Limitations" icon={Info}>
          <ul className="space-y-2 leading-relaxed text-mute-300">{d.limitations.map((l) => <li key={l} className="flex gap-2"><AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-400/80" />{l}</li>)}</ul>
        </Card>
      </div>
    </div>
  );
}
