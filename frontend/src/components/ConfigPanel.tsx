import { useMemo, useRef, useState } from 'react';
import type { AnalysisConfig, Body, Constraints, Meta, ParamCfg, ParamMeta } from '../lib/api';
import { QUALITY_CLASS, QUALITY_LABEL, REPRO_CLASS, REPRO_SHORT } from '../lib/format';
import { Badge, NumberField, Section, Segmented, Toggle } from './ui';

interface Props {
  meta: Meta;
  body: Body;
  presetId: string;
  cfg: AnalysisConfig;
  onBody: (b: Body) => void;
  onPreset: (id: string) => void;
  onChange: (cfg: AnalysisConfig) => void;
  saved: { name: string; body: Body; cfg: AnalysisConfig }[];
  onSave: (name: string) => void;
  onLoadSaved: (i: number) => void;
  onDeleteSaved: (i: number) => void;
  onImport: (f: File) => void;
}

export default function ConfigPanel(p: Props) {
  const { meta, cfg } = p;
  const presets = meta.presets.filter((x) => x.body === p.body || x.id === 'custom' || x.id === 'solar_energy');
  const regions = meta.regions.filter((r) => r.body === p.body);
  const region = meta.regions.find((r) => r.id === cfg.region);
  const preset = meta.presets.find((x) => x.id === p.presetId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [saveName, setSaveName] = useState('');

  const setParam = (k: string, patch: Partial<ParamCfg>) =>
    p.onChange({ ...cfg, params: { ...cfg.params, [k]: { ...cfg.params[k], ...patch } } });
  const setC = (patch: Partial<Constraints>) => p.onChange({ ...cfg, constraints: { ...cfg.constraints, ...patch } });

  const grouped = useMemo(() => {
    const g: Record<string, ParamMeta[]> = {};
    for (const pm of meta.parameters) (g[pm.category] ??= []).push(pm);
    return g;
  }, [meta]);
  const totalW = Object.values(cfg.params).reduce((s, v) => s + (v.enabled ? v.weight : 0), 0);
  const nEnabled = Object.values(cfg.params).filter((v) => v.enabled && v.weight > 0).length;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ink-700 px-4 py-3">
        <div className="mb-2 text-2xs uppercase tracking-[0.12em] text-mute-400">Target environment</div>
        <div className="grid grid-cols-2 gap-2">
          {(['moon', 'mars'] as Body[]).map((b) => (
            <button key={b} onClick={() => p.onBody(b)}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${p.body === b ? (b === 'mars' ? 'border-mars/70 bg-mars/10 text-white' : 'border-moon/60 bg-moon/10 text-white') : 'border-ink-600 text-mute-400 hover:text-mute-200'}`}>
              <span className={`h-3 w-3 rounded-full ${b === 'mars' ? 'bg-mars' : 'bg-moon'}`} />
              {b === 'moon' ? 'Moon' : 'Mars'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Section title="Mission preset">
          <select value={p.presetId} onChange={(e) => p.onPreset(e.target.value)}
            className="w-full rounded border border-ink-600 bg-ink-850 px-2 py-1.5 text-sm text-white focus:border-accent focus:outline-none">
            {presets.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          {preset && <p className="mt-2 text-xs leading-relaxed text-mute-400">{preset.summary}</p>}
          <div className="mt-3 text-2xs uppercase tracking-[0.12em] text-mute-400">Reference region</div>
          <select value={cfg.region} onChange={(e) => p.onChange({ ...cfg, region: e.target.value })}
            className="mt-1 w-full rounded border border-ink-600 bg-ink-850 px-2 py-1.5 text-sm text-white focus:border-accent focus:outline-none">
            {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          {region && <p className="mt-2 text-xs leading-relaxed text-mute-400">{region.description} <span className="font-mono text-mute-400/80">({region.lat.toFixed(1)}°, {region.lon.toFixed(1)}°)</span></p>}
        </Section>

        <Section title={`Parameters & weights`} right={<span className="font-mono text-2xs text-mute-400">{nEnabled} active</span>}>
          <p className="mb-2 text-2xs leading-relaxed text-mute-400">Weights (0–100) are normalised automatically: S = Σ wᵢsᵢ / Σ wᵢ. Bars show each parameter's share of the total.</p>
          {Object.entries(grouped).map(([cat, list]) => (
            <div key={cat} className="mb-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-mute-200">{meta.categories[cat]}</span>
                {cat === 'nonrepro' && <span className="text-2xs text-orange-400">not reproducible outdoors</span>}
              </div>
              <div className="space-y-1">
                {list.map((pm) => (
                  <ParamRow key={pm.key} pm={pm} pc={cfg.params[pm.key]} share={cfg.params[pm.key]?.enabled ? cfg.params[pm.key].weight / Math.max(totalW, 1) : 0}
                    onChange={(patch) => setParam(pm.key, patch)} />
                ))}
              </div>
            </div>
          ))}
        </Section>

        <Section title="Hard constraints">
          <div className="mb-2"><Segmented value={cfg.constraint_mode} onChange={(v) => p.onChange({ ...cfg, constraint_mode: v })}
            options={[{ value: 'exclude', label: 'Exclude violators' }, { value: 'flag', label: 'Flag violators' }]} /></div>
          <NumberField label="Max terrain slope (p90)" unit="°" value={cfg.constraints.max_slope_p90} onChange={(v) => setC({ max_slope_p90: v })} step={0.5}
            hint="90th percentile of km-scale slopes inside the cell" />
          <NumberField label="Min solar irradiation" unit="W/m²" value={cfg.constraints.min_solar_wm2} onChange={(v) => setC({ min_solar_wm2: v })} step={5} />
          <NumberField label="Max daily temp. range" unit="°C" value={cfg.constraints.max_daily_range} onChange={(v) => setC({ max_daily_range: v })} />
          <NumberField label="Max seasonal temp. range" unit="°C" value={cfg.constraints.max_seasonal_range} onChange={(v) => setC({ max_seasonal_range: v })} />
          <NumberField label="Max elevation variation" unit="m" value={cfg.constraints.max_relief_m} onChange={(v) => setC({ max_relief_m: v })} step={50}
            hint="max − min elevation inside the 0.25° cell" />
          <NumberField label="Min contiguous area" unit="km²" value={cfg.constraints.min_area_km2} onChange={(v) => setC({ min_area_km2: v })} step={100}
            hint="Connected region of cells passing all constraints with score ≥ threshold" />
          {cfg.constraints.min_area_km2 ? (
            <NumberField label="  …area score threshold" unit="/100" value={cfg.constraints.area_score_threshold} onChange={(v) => setC({ area_score_threshold: v ?? 50 })} />
          ) : null}
          <NumberField label="Max distance to road" unit="km" value={cfg.constraints.max_road_km} onChange={(v) => setC({ max_road_km: v })} step={10} />
          <label className="flex items-center justify-between py-1 text-xs text-mute-300">Exclude known protected areas (USA only)
            <Toggle small checked={cfg.constraints.exclude_protected} onChange={(b) => setC({ exclude_protected: b })} /></label>
          <label className="flex items-center justify-between py-1 text-xs text-mute-300">Exclude permanent ice sheets
            <Toggle small checked={cfg.constraints.exclude_ice_sheets} onChange={(b) => setC({ exclude_ice_sheets: b })} /></label>
        </Section>

        <Section title="Data availability">
          <Segmented value={cfg.missing_mode} onChange={(v) => p.onChange({ ...cfg, missing_mode: v })}
            options={[{ value: 'partial', label: 'Score + confidence' }, { value: 'exclude', label: 'Exclude missing' }]} />
          <p className="mt-2 text-2xs leading-relaxed text-mute-400">
            {cfg.missing_mode === 'partial'
              ? 'Missing parameters are skipped (never scored 0). Confidence = Σ wᵢqᵢ over available parameters / Σ wᵢ, where qᵢ is data quality (measured 1.0 … proxy 0.4).'
              : 'Cells lacking data for any enabled parameter are shown grey and never ranked.'}
          </p>
          <label className="mt-2 block text-xs text-mute-300">Minimum confidence: <span className="font-mono text-white">{cfg.min_confidence}%</span>
            <input type="range" min={0} max={100} step={5} value={cfg.min_confidence} onChange={(e) => p.onChange({ ...cfg, min_confidence: Number(e.target.value) })} className="wslider mt-1 w-full" />
          </label>
          <label className="mt-2 block text-xs text-mute-300">Min separation of ranked sites: <span className="font-mono text-white">{cfg.min_separation_km} km</span>
            <input type="range" min={0} max={1500} step={50} value={cfg.min_separation_km} onChange={(e) => p.onChange({ ...cfg, min_separation_km: Number(e.target.value) })} className="wslider mt-1 w-full" />
          </label>
        </Section>

        <Section title="Saved experiments" defaultOpen={false}>
          <div className="flex gap-1">
            <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Configuration name"
              className="min-w-0 flex-1 rounded border border-ink-600 bg-ink-850 px-2 py-1 text-xs text-white focus:border-accent focus:outline-none" />
            <button disabled={!saveName.trim()} onClick={() => { p.onSave(saveName.trim()); setSaveName(''); }}
              className="rounded border border-ink-600 px-2 text-xs text-mute-200 hover:border-accent disabled:opacity-40">Save</button>
          </div>
          <div className="mt-2 space-y-1">
            {p.saved.length === 0 && <div className="text-2xs text-mute-400">No saved configurations (stored in this browser).</div>}
            {p.saved.map((s, i) => (
              <div key={i} className="flex items-center justify-between rounded border border-ink-700 px-2 py-1 text-xs">
                <button onClick={() => p.onLoadSaved(i)} className="truncate text-left text-mute-200 hover:text-white">{s.name} <span className="text-mute-400">· {s.body}</span></button>
                <button onClick={() => p.onDeleteSaved(i)} className="text-mute-400 hover:text-red-300" aria-label="Delete">×</button>
              </div>
            ))}
          </div>
          <button onClick={() => fileRef.current?.click()} className="mt-2 w-full rounded border border-dashed border-ink-600 py-1 text-xs text-mute-400 hover:text-mute-200">Import configuration JSON…</button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) p.onImport(f); e.target.value = ''; }} />
        </Section>
      </div>
    </div>
  );
}

function ParamRow({ pm, pc, share, onChange }: { pm: ParamMeta; pc: ParamCfg; share: number; onChange: (p: Partial<ParamCfg>) => void }) {
  const [open, setOpen] = useState(false);
  if (!pc) return null;
  const on = pc.enabled;
  return (
    <div className={`rounded border ${open ? 'border-ink-600 bg-ink-850' : 'border-transparent'} px-1.5 py-1`}>
      <div className="flex items-center gap-2">
        <Toggle small checked={on} onChange={(b) => onChange({ enabled: b })} label={`Enable ${pm.label}`} />
        <button onClick={() => setOpen(!open)} className={`min-w-0 flex-1 truncate text-left text-xs ${on ? 'text-mute-200' : 'text-mute-400'}`} title={pm.description}>
          {pm.label}
          {(pm.quality === 'proxy') && <span className="ml-1 text-2xs text-amber-300">proxy</span>}
        </button>
        <span className={`w-7 text-right font-mono text-2xs ${on ? 'text-white' : 'text-mute-400'}`}>{Math.round(pc.weight)}</span>
      </div>
      <div className="flex items-center gap-2 pl-9">
        <input type="range" min={0} max={100} step={1} value={pc.weight} disabled={!on}
          onChange={(e) => onChange({ weight: Number(e.target.value) })} className="wslider flex-1" aria-label={`${pm.label} weight`} />
        <div className="h-1 w-10 overflow-hidden rounded bg-ink-700" title={`${(share * 100).toFixed(0)}% of total weight`}>
          <div className="h-full bg-accent" style={{ width: `${Math.min(100, share * 100 * 2.5)}%` }} />
        </div>
      </div>
      {open && (
        <div className="mt-1.5 space-y-1.5 pl-9 text-2xs leading-relaxed text-mute-400">
          <p>{pm.description}</p>
          <p><span className="text-mute-300">Method:</span> {pm.method}</p>
          <div className="flex flex-wrap gap-1">
            <Badge className={QUALITY_CLASS[pm.quality]}>{QUALITY_LABEL[pm.quality]}</Badge>
            <Badge className={`border-ink-600 ${REPRO_CLASS[pm.repro]}`}>{REPRO_SHORT[pm.repro]}</Badge>
            <Badge className="border-ink-600 text-mute-300">{pm.unit}</Badge>
          </div>
          <p><span className="text-mute-300">Source:</span> {pm.source.name} · {pm.source.resolution}</p>
          {pm.tolerance_label && (
            <label className="flex items-center justify-between gap-2 text-mute-300">Tolerance {pm.tolerance_label}
              <input type="number" step="any" value={pc.tolerance ?? pm.tolerance}
                onChange={(e) => onChange({ tolerance: e.target.value === '' ? null : Math.max(1e-6, Number(e.target.value)) })}
                className="w-20 rounded border border-ink-600 bg-ink-900 px-1 py-0.5 text-right font-mono text-white focus:border-accent focus:outline-none" />
            </label>
          )}
          {pm.kind === 'pref' && (
            <>
              <label className="flex items-center justify-between gap-2 text-mute-300">Mode
                <select value={pc.extra?.mode ?? 'accessible'} onChange={(e) => onChange({ extra: { ...pc.extra, mode: e.target.value } })}
                  className="rounded border border-ink-600 bg-ink-900 px-1 py-0.5 text-white">
                  <option value="accessible">Prefer accessible</option>
                  <option value="remote">Prefer remote (isolation)</option>
                </select>
              </label>
              <label className="flex items-center justify-between gap-2 text-mute-300">Ideal distance (km)
                <input type="number" value={pc.extra?.ideal_km ?? 50} onChange={(e) => onChange({ extra: { ...pc.extra, ideal_km: Number(e.target.value) } })}
                  className="w-20 rounded border border-ink-600 bg-ink-900 px-1 py-0.5 text-right font-mono text-white" />
              </label>
            </>
          )}
        </div>
      )}
    </div>
  );
}
