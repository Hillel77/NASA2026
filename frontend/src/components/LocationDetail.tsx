import { useEffect, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { AnalysisConfig, LocationDetail as LD, Meta } from '../lib/api';
import { api } from '../lib/api';
import { exportGeoJson, exportPdf } from '../lib/exporters';
import { fmtDiff, fmtLat, fmtLon, fmtNum, fmtValue, QUALITY_CLASS, QUALITY_LABEL, REPRO_CLASS, REPRO_SHORT, scoreColor } from '../lib/format';
import { Badge, Modal, Segmented, Spinner } from './ui';

// Validated categorical slots (dark surface): blue, orange, aqua. Target = neutral dashed line.
const C1 = '#3987e5', C2 = '#d95926', C3 = '#199e70', TGT = '#cdd5df';
const AX = { stroke: '#3a4659', tick: { fill: '#8b97a8', fontSize: 11 } };
const TT = { contentStyle: { background: '#0b0f16', border: '1px solid #2a3444', fontSize: 12, borderRadius: 6 }, labelStyle: { color: '#cdd5df' } };

type Tab = 'overview' | 'table' | 'charts' | 'terrain' | 'live' | 'sources';

export default function LocationDetail({ d, loading, cfg, meta, onClose, onAddCompare, inCompare }: {
  d: LD | null; loading: boolean; cfg: AnalysisConfig; meta: Meta; onClose: () => void; onAddCompare: () => void; inCompare: boolean;
}) {
  const [tab, setTab] = useState<Tab>('overview');
  if (!d) {
    return (
      <Modal title="Location analysis" onClose={onClose} wide>
        <div className="flex items-center gap-2 p-8 text-sm text-mute-400">{loading ? <><Spinner /> Loading location analysis…</> : 'No data.'}</div>
      </Modal>
    );
  }
  return (
    <Modal wide onClose={onClose} title={
      <div className="flex items-center gap-3">
        <span>{d.name}</span>
        <span className="text-xs font-normal text-mute-400">{d.country} · <span className="font-mono">{fmtLat(d.lat)} {fmtLon(d.lon)}</span></span>
        {d.data_mode === 'demo' && <Badge className="border-amber-500/50 text-amber-300">SYNTHETIC DEMO DATA</Badge>}
      </div>}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-700 px-5 py-3">
        <div className="flex items-center gap-6">
          <Metric label="Compatibility" value={d.score === null ? '—' : d.score.toFixed(1)} color={scoreColor(d.score)} sub="/ 100" />
          <Metric label="Data confidence" value={d.confidence === null ? '—' : d.confidence.toFixed(0)} sub="%" />
          <div className="text-xs">
            <div className="text-mute-400">vs. {d.target.name}</div>
            <div className={d.status === 'ok' ? 'text-emerald-300' : 'text-amber-300'}>Status: {d.status}</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onAddCompare} className="rounded border border-ink-600 px-2.5 py-1 text-xs text-mute-200 hover:border-accent">{inCompare ? '✓ In comparison' : '+ Compare'}</button>
          <button onClick={() => exportGeoJson([{ lat: d.lat, lon: d.lon, props: { name: d.name, country: d.country, score: d.score, confidence: d.confidence, reference: d.target.name } }])}
            className="rounded border border-ink-600 px-2.5 py-1 text-xs text-mute-200 hover:border-accent">GeoJSON</button>
          <button onClick={() => exportPdf(d, cfg, meta)} className="rounded bg-accent/90 px-2.5 py-1 text-xs font-medium text-ink-950 hover:bg-accent">PDF report</button>
        </div>
      </div>
      <div className="px-5 pt-3">
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'overview', label: 'Overview' }, { value: 'table', label: 'Comparison table' }, { value: 'charts', label: 'Climate charts' },
          { value: 'terrain', label: 'Terrain' }, { value: 'live', label: 'Live data' }, { value: 'sources', label: 'Sources & limits' },
        ]} />
      </div>
      <div className="p-5">
        {tab === 'overview' && <Overview d={d} />}
        {tab === 'table' && <Table d={d} />}
        {tab === 'charts' && <Charts d={d} />}
        {tab === 'terrain' && <Terrain d={d} />}
        {tab === 'live' && <Live d={d} />}
        {tab === 'sources' && <Sources d={d} />}
      </div>
    </Modal>
  );
}

function Metric({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-wider text-mute-400">{label}</div>
      <div className="font-mono text-2xl tabular" style={{ color: color ?? '#fff' }}>{value}<span className="ml-1 text-xs text-mute-400">{sub}</span></div>
    </div>
  );
}

function Overview({ d }: { d: LD }) {
  const rows = d.rows.filter((r) => r.enabled && r.similarity !== null).sort((a, b) => b.weight - a.weight);
  const nonrep = d.rows.filter((r) => r.repro === 'laboratory' || r.repro === 'impossible');
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-mute-400">Why this location</h3>
        <div className="space-y-2 text-sm leading-relaxed text-mute-200">{d.explanation.map((e, i) => <p key={i}>{e}</p>)}</div>
        {d.failed_constraints.length > 0 && (
          <div className="mt-3 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">Constraint violations: {d.failed_constraints.join('; ')}</div>
        )}
        <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-mute-400">Category scores</h3>
        <div className="space-y-1.5">
          {Object.entries(d.category_scores).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 text-xs">
              <span className="w-32 text-mute-300">{k}</span>
              <div className="h-2 flex-1 rounded bg-ink-700"><div className="h-full rounded" style={{ width: `${v ?? 0}%`, background: scoreColor(v) }} /></div>
              <span className="w-10 text-right font-mono text-white">{fmtNum(v, 0)}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-mute-400">Parameter similarity (enabled, by weight)</h3>
        <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 24 + 30)}>
          <BarChart data={rows.map((r) => ({ name: r.label, sim: Math.round((r.similarity ?? 0) * 100), w: r.weight }))} layout="vertical" margin={{ left: 10, right: 20 }}>
            <CartesianGrid horizontal={false} stroke="#1e2633" />
            <XAxis type="number" domain={[0, 100]} {...AX} />
            <YAxis type="category" dataKey="name" width={170} {...AX} tick={{ fill: '#cdd5df', fontSize: 11 }} />
            <Tooltip {...TT} formatter={(v: any, _n, it: any) => [`${v}% (weight ${it.payload.w})`, 'Similarity']} cursor={{ fill: '#1e2633' }} />
            <Bar isAnimationActive={false} dataKey="sim" fill={C1} radius={[0, 4, 4, 0]} barSize={14} />
          </BarChart>
        </ResponsiveContainer>
        <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-mute-400">Conditions no Earth field site can reproduce</h3>
        <div className="space-y-1 text-xs">
          {nonrep.map((r) => (
            <div key={r.key} className="flex items-center justify-between rounded border border-ink-700 px-2 py-1">
              <span className="text-mute-200">{r.label}</span>
              <span className="font-mono text-mute-400">Earth {fmtValue(r.earth, r.unit)} · target {fmtValue(r.target?.value, r.unit)}</span>
              <span className={REPRO_CLASS[r.repro]}>{REPRO_SHORT[r.repro]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Table({ d }: { d: LD }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-ink-600 text-left text-2xs uppercase tracking-wider text-mute-400">
            <th className="py-2 pr-3">Parameter</th><th className="pr-3">Target</th><th className="pr-3">Earth</th><th className="pr-3">Difference</th>
            <th className="pr-3">Similarity</th><th className="pr-3">Reproducibility</th><th>Data source</th>
          </tr>
        </thead>
        <tbody>
          {d.rows.map((r) => (
            <tr key={r.key} className={`border-b border-ink-800 align-top ${r.enabled ? '' : 'opacity-55'}`}>
              <td className="py-2 pr-3">
                <div className="text-mute-200">{r.label}</div>
                <div className="text-2xs text-mute-400">{r.enabled ? `weight ${r.weight}` : r.not_applicable ? 'not applicable' : 'disabled'} · {r.unit}</div>
              </td>
              <td className="pr-3">
                {r.target ? (
                  <>
                    <div className="font-mono text-white">{fmtValue(r.target.value, r.unit)}</div>
                    <Badge className={QUALITY_CLASS[r.target.quality] ?? 'border-ink-600'}>{QUALITY_LABEL[r.target.quality] ?? r.target.quality}</Badge>
                    <div className="mt-0.5 max-w-[200px] text-2xs text-mute-400" title={r.target.note}>{r.target.source}</div>
                  </>
                ) : <span className="text-mute-400">n/a</span>}
              </td>
              <td className="pr-3">
                <div className="font-mono text-white">{r.earth_available ? fmtValue(r.earth, r.unit) : <span className="text-mute-400">unavailable</span>}</div>
                <Badge className={QUALITY_CLASS[r.quality]}>{QUALITY_LABEL[r.quality]}</Badge>
              </td>
              <td className="pr-3 font-mono text-mute-300">{fmtDiff(r.difference)}</td>
              <td className="pr-3">
                {r.similarity === null ? <span className="text-mute-400">—</span> : (
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-12 rounded bg-ink-700"><div className="h-full rounded" style={{ width: `${r.similarity * 100}%`, background: scoreColor(r.similarity * 100) }} /></div>
                    <span className="font-mono text-white">{(r.similarity * 100).toFixed(0)}%</span>
                  </div>
                )}
              </td>
              <td className={`pr-3 ${REPRO_CLASS[r.repro]}`}>{REPRO_SHORT[r.repro]}</td>
              <td className="max-w-[220px] text-2xs text-mute-400" title={r.method}>{r.source.name}<br />{r.source.resolution}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

function ChartCard({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-ink-700 bg-ink-850 p-3">
      <div className="text-xs font-medium text-mute-200">{title}</div>
      {note && <div className="mb-1 text-2xs text-mute-400">{note}</div>}
      <ResponsiveContainer width="100%" height={210}>{children as any}</ResponsiveContainer>
    </div>
  );
}

function Charts({ d }: { d: LD }) {
  if (!d.monthly.t2m) return <div className="text-sm text-mute-400">No monthly climatology available for this cell.</div>;
  const tm = target(d, 'temp_mean');
  const tx = target(d, 'temp_extremes');
  const tdr = target(d, 'temp_daily');
  const tsol = target(d, 'solar_irradiance');
  const tdl = target(d, 'daylight');
  const temp = series(d, { mean: 't2m', max: 't2m_max', min: 't2m_min' });
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ChartCard title="Monthly temperature (2 m air, °C)" note="NASA POWER MERRA-2 climatology 2001–2020. Dashed: target mean surface temp.; shaded: target extremes.">
        <LineChart data={temp} margin={{ right: 12, top: 6 }}>
          <CartesianGrid stroke="#1e2633" vertical={false} />
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
      <ChartCard title="Daily surface temperature range (°C)" note="POWER TS_RANGE (skin temperature). Dashed: target diurnal range.">
        <LineChart data={series(d, { range: 'ts_range' })} margin={{ right: 12, top: 6 }}>
          <CartesianGrid stroke="#1e2633" vertical={false} />
          <XAxis dataKey="month" {...AX} /><YAxis {...AX} width={44} domain={[0, 'auto']} />
          <Tooltip {...TT} />
          {tdr !== undefined && <ReferenceLine y={tdr} stroke={TGT} strokeDasharray="5 4" ifOverflow="extendDomain" label={{ value: `target ${tdr}°C`, fill: TGT, fontSize: 10, position: 'insideBottomRight' }} />}
          <Line isAnimationActive={false} dataKey="range" name="Earth daily range" stroke={C1} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ChartCard>
      <ChartCard title="Solar irradiation through the year (W/m², 24 h mean)" note="CERES SYN1deg via POWER. Earth surface vs. top of atmosphere; dashed: target.">
        <LineChart data={series(d, { surface: 'solar', toa: 'toa' })} margin={{ right: 12, top: 6 }}>
          <CartesianGrid stroke="#1e2633" vertical={false} />
          <XAxis dataKey="month" {...AX} /><YAxis {...AX} width={44} />
          <Tooltip {...TT} /><Legend wrapperStyle={{ fontSize: 11 }} />
          {tsol !== undefined && <ReferenceLine y={tsol} stroke={TGT} strokeDasharray="5 4" ifOverflow="extendDomain" label={{ value: `target ${tsol}`, fill: TGT, fontSize: 10, position: 'insideTopRight' }} />}
          <Line isAnimationActive={false} dataKey="toa" name="Top of atmosphere" stroke={C2} strokeWidth={2} dot={false} />
          <Line isAnimationActive={false} dataKey="surface" name="Surface (all-sky)" stroke={C1} strokeWidth={2} dot={false} />
        </LineChart>
      </ChartCard>
      <ChartCard title="Daylight duration (hours)" note="POWER DAY_HOURS. Shaded: target illuminated fraction × 24 h.">
        <LineChart data={series(d, { hours: 'day_hours' })} margin={{ right: 12, top: 6 }}>
          <CartesianGrid stroke="#1e2633" vertical={false} />
          <XAxis dataKey="month" {...AX} /><YAxis {...AX} width={44} domain={[0, 24]} ticks={[0, 6, 12, 18, 24]} />
          <Tooltip {...TT} />
          {tdl && <ReferenceArea y1={tdl[0] * 24} y2={Math.max(tdl[1] * 24, tdl[0] * 24 + 0.3)} fill="#cdd5df" fillOpacity={0.12} />}
          <Line isAnimationActive={false} dataKey="hours" name="Earth daylight" stroke={C1} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ChartCard>
      <ChartCard title="Precipitation (mm/day)" note="POWER PRECTOTCORR. Both target bodies: 0.">
        <BarChart data={series(d, { precip: 'precip' })} margin={{ right: 12, top: 6 }}>
          <CartesianGrid stroke="#1e2633" vertical={false} />
          <XAxis dataKey="month" {...AX} /><YAxis {...AX} width={44} />
          <Tooltip {...TT} cursor={{ fill: '#1e2633' }} />
          <Bar isAnimationActive={false} dataKey="precip" name="Precipitation" fill={C1} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartCard>
      <ChartCard title="Wind speed at 10 m (m/s)" note="POWER WS10M. Dashed: target mean wind.">
        <LineChart data={series(d, { wind: 'wind' })} margin={{ right: 12, top: 6 }}>
          <CartesianGrid stroke="#1e2633" vertical={false} />
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
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ChartCard title="Terrain slope distribution (% of cell area)" note="Earth: ~2.4 km pixels (grid) and ~150 m pixels (live sample). Target: log-normal from published median / p90.">
        <BarChart data={slope} margin={{ right: 12, top: 6 }} barGap={2}>
          <CartesianGrid stroke="#1e2633" vertical={false} />
          <XAxis dataKey="bin" {...AX} tick={{ fill: '#8b97a8', fontSize: 10 }} /><YAxis {...AX} width={40} />
          <Tooltip {...TT} cursor={{ fill: '#1e2633' }} /><Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar isAnimationActive={false} dataKey="earth" name="Earth (2.4 km)" fill={C1} radius={[4, 4, 0, 0]} />
          {hi?.available && <Bar isAnimationActive={false} dataKey="hires" name="Earth (150 m)" fill={C3} radius={[4, 4, 0, 0]} />}
          <Bar isAnimationActive={false} dataKey="target" name="Target" fill={C2} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartCard>
      <ChartCard title="Elevation distribution inside the cell (% of pixels)" note={hi?.available ? `${hi.source}, ${hi.n_pixels.toLocaleString()} land pixels` : 'Live high-resolution DEM sample'}>
        {loading ? <div className="grid h-full place-items-center text-xs text-mute-400"><Spinner /></div> : hi?.available ? (
          <BarChart data={elev} margin={{ right: 12, top: 6 }}>
            <CartesianGrid stroke="#1e2633" vertical={false} />
            <XAxis dataKey="e" {...AX} tick={{ fill: '#8b97a8', fontSize: 10 }} unit=" m" /><YAxis {...AX} width={40} />
            <Tooltip {...TT} cursor={{ fill: '#1e2633' }} formatter={(v: any) => [`${v}%`, 'share']} labelFormatter={(l) => `${l} m`} />
            <Bar isAnimationActive={false} dataKey="pct" fill={C1} radius={[4, 4, 0, 0]} />
          </BarChart>
        ) : <div className="grid h-full place-items-center text-xs text-mute-400">Unavailable: {hi?.error}</div>}
      </ChartCard>
      <div className="md:col-span-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        {[
          ['Mean elevation', d.terrain.elev_mean, 'm'], ['Elevation std-dev', d.terrain.elev_std, 'm'], ['Relief (max−min)', d.terrain.relief_m, 'm'],
          ['Roughness', d.terrain.rough_m, 'm'], ['Slope median (2.4 km)', d.terrain.slope_p50, '°'], ['Slope p90 (2.4 km)', d.terrain.slope_p90, '°'],
          ['Slope median (150 m)', hi?.available ? hi.slope_p50 : null, '°'], ['Slope p90 (150 m)', hi?.available ? hi.slope_p90 : null, '°'],
          ['Bare ground', d.landcover.bare !== null && d.landcover.bare !== undefined ? d.landcover.bare * 100 : null, '%'],
          ['Vegetation', d.landcover.vegetation !== null && d.landcover.vegetation !== undefined ? d.landcover.vegetation * 100 : null, '%'],
          ['Distance to road', d.logistics.dist_road_km, 'km'], ['Nearest town', d.logistics.dist_place_km, 'km'],
        ].map(([k, v, u]) => (
          <div key={k as string} className="rounded border border-ink-700 bg-ink-850 px-2 py-1.5">
            <div className="text-2xs text-mute-400">{k}</div>
            <div className="font-mono text-white">{fmtNum(v as any)} <span className="text-2xs text-mute-400">{u}</span></div>
          </div>
        ))}
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
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-md border border-ink-700 bg-ink-850 p-3 text-xs">
        <div className="mb-1 font-medium text-mute-200">NASA POWER point API (live)</div>
        <p className="mb-2 text-2xs text-mute-400">Independent cross-check of the preprocessed grid via power.larc.nasa.gov. Annual values (ANN).</p>
        {!power ? <Spinner /> : power.available ? (
          <table className="w-full font-mono">
            <tbody>{Object.entries(power.parameters).map(([k, v]: any) => (
              <tr key={k} className="border-b border-ink-800"><td className="py-0.5 text-mute-300">{k}</td><td className="text-right text-white">{fmtNum(v.ANN)}</td><td className="pl-2 text-mute-400">{power.units?.[k]}</td></tr>
            ))}</tbody>
          </table>
        ) : <p className="text-amber-300">Unavailable — {power.error}. The preprocessed POWER climatology (AWS Open Data) is still used for scoring.</p>}
      </div>
      <div className="rounded-md border border-ink-700 bg-ink-850 p-3 text-xs">
        <div className="mb-1 font-medium text-mute-200">ISRIC SoilGrids 2.0 (live, 0–5 cm)</div>
        <p className="mb-2 text-2xs text-mute-400">Measured-model soil texture at 250 m. Shown for context; not used in the global score (no global grid in this build).</p>
        {!soil ? <Spinner /> : soil.available ? (
          <table className="w-full font-mono">
            <tbody>{Object.entries(soil.properties).map(([k, v]: any) => (
              <tr key={k} className="border-b border-ink-800"><td className="py-0.5 text-mute-300">{k}</td><td className="text-right text-white">{fmtNum(v.value)}</td><td className="pl-2 text-mute-400">{v.unit}</td></tr>
            ))}</tbody>
          </table>
        ) : <p className="text-amber-300">Unavailable — {soil.error}</p>}
      </div>
    </div>
  );
}

function Sources({ d }: { d: LD }) {
  const srcs = new Map<string, any>();
  d.rows.forEach((r) => srcs.set(r.source.name, r.source));
  const tsrc = new Set(d.rows.map((r) => r.target?.source).filter(Boolean) as string[]);
  return (
    <div className="grid gap-6 text-xs md:grid-cols-2">
      <div>
        <h3 className="mb-2 font-semibold uppercase tracking-wider text-mute-400">Earth datasets</h3>
        <ul className="space-y-2">{[...srcs.values()].map((s) => (
          <li key={s.name} className="rounded border border-ink-700 p-2"><div className="text-mute-200">{s.name}</div>
            <div className="text-2xs text-mute-400">Resolution: {s.resolution}{s.period ? ` · Period: ${s.period}` : ''}</div>
            {s.url && <div className="text-2xs text-accent">{s.url}</div>}</li>))}</ul>
        <h3 className="mb-2 mt-4 font-semibold uppercase tracking-wider text-mute-400">Calculation method</h3>
        <ul className="space-y-1.5 text-mute-300">{d.rows.filter((r) => r.enabled).map((r) => <li key={r.key}><span className="text-mute-200">{r.label}:</span> {r.method}</li>)}</ul>
      </div>
      <div>
        <h3 className="mb-2 font-semibold uppercase tracking-wider text-mute-400">Planetary reference sources</h3>
        <ul className="list-disc space-y-1 pl-4 text-mute-300">{[...tsrc].map((s) => <li key={s}>{s}</li>)}</ul>
        <h3 className="mb-2 mt-4 font-semibold uppercase tracking-wider text-mute-400">Limitations</h3>
        <ul className="list-disc space-y-1 pl-4 text-mute-300">{d.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
      </div>
    </div>
  );
}
