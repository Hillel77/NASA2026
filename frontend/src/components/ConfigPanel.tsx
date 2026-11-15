import { useMemo, useRef, useState } from 'react';
import {
  ChevronDown, Database, Droplets, FlaskConical, FolderOpen, Gem, Info, Mountain, Rocket, Save, ShieldCheck, SlidersHorizontal,
  Sun, Thermometer, Trash2, Truck, Upload, Wind,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AnalysisConfig, Body, Constraints, Meta, ParamCfg, ParamMeta } from '../lib/api';
import { QUALITY_CLASS, QUALITY_LABEL, REPRO_CLASS, REPRO_SHORT } from '../lib/format';
import { Badge, INPUT, NumberField, SELECT, Section, Segmented, Toggle } from './ui';
import { useT } from '../i18n';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CAT_ICON: Record<string, LucideIcon> = {
  temperature: Thermometer, solar: Sun, terrain: Mountain, geology: Gem, atmosphere: Wind, water: Droplets,
  logistics: Truck, nonrepro: FlaskConical,
};

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
  const t = useT();
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
  const c = cfg.constraints;
  const nConstraints = [c.max_slope_p90, c.min_solar_wm2, c.max_daily_range, c.max_seasonal_range, c.max_relief_m, c.min_area_km2, c.max_road_km]
    .filter((v) => v !== null && v !== undefined).length + (c.exclude_protected ? 1 : 0) + (c.exclude_ice_sheets ? 1 : 0);

  return (
    <div className="flex h-full flex-col">
      {/* ------------------------------------------------ target */}
      <div className="border-b border-ink-700/70 bg-ink-925 px-4 pb-4 pt-4">
        <div className="mb-2.5 flex items-center gap-2 text-2xs font-medium uppercase tracking-[0.14em] text-mute-400">
          <Rocket size={12} /> {t('Target environment')}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(['moon', 'mars'] as Body[]).map((b) => {
            const on = p.body === b;
            return (
              <button key={b} onClick={() => p.onBody(b)} aria-pressed={on}
                className={`group relative flex items-center gap-3 overflow-hidden rounded-xl border px-3 py-2.5 text-left transition-all ${on
                  ? (b === 'mars' ? 'border-mars/60 bg-gradient-to-br from-mars/20 to-mars/5 shadow-[0_0_0_1px_rgba(224,119,59,0.15)]' : 'border-moon/50 bg-gradient-to-br from-moon/15 to-moon/5 shadow-[0_0_0_1px_rgba(185,194,208,0.12)]')
                  : 'border-ink-700 bg-ink-850 hover:border-ink-500'}`}>
                <span className={`h-7 w-7 shrink-0 rounded-full ${b === 'mars' ? 'bg-[radial-gradient(circle_at_35%_30%,#f3a06c,#c4561f_55%,#6e2a0c)]' : 'bg-[radial-gradient(circle_at_35%_30%,#f2f4f8,#a5adba_55%,#525a68)]'} ${on ? '' : 'opacity-60 grayscale-[30%]'}`} />
                <span className={`text-sm font-semibold ${on ? 'text-white' : 'text-mute-300'}`}>{b === 'moon' ? t('Moon') : t('Mars')}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ------------------------------------------------ preset */}
        <Section title={t('Mission preset')} step={1} subtitle={preset?.name}>
          <select value={p.presetId} onChange={(e) => p.onPreset(e.target.value)} className={SELECT} aria-label={t('Mission preset')}>
            {presets.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          {preset && <p className="mt-2.5 rounded-lg border-l-2 border-accent/50 bg-ink-850 px-3 py-2 text-xs leading-relaxed text-mute-300">{preset.summary}</p>}
          <div className="mb-1.5 mt-4 text-2xs font-medium uppercase tracking-[0.14em] text-mute-400">{t('Reference region')}</div>
          <select value={cfg.region} onChange={(e) => p.onChange({ ...cfg, region: e.target.value })} className={SELECT} aria-label="Reference region">
            {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          {region && (
            <p className="mt-2.5 text-xs leading-relaxed text-mute-400">
              {region.description} <span className="whitespace-nowrap font-mono text-2xs text-mute-500">({region.lat.toFixed(1)}°, {region.lon.toFixed(1)}°)</span>
            </p>
          )}
        </Section>

        {/* ------------------------------------------------ parameters */}
        <Section title={t('Parameters & weights')} step={2} subtitle={t('{n} active', { n: nEnabled })}
          right={<span className="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-2xs text-accent">{t('{n} active', { n: nEnabled })}</span>}>
          <p className="mb-3 rounded-lg bg-ink-850 px-3 py-2 text-2xs leading-relaxed text-mute-400">
            {t('Weights (0–100) are normalised automatically:')} <span className="whitespace-nowrap font-medium text-mute-100">S = Σ wᵢsᵢ / Σ wᵢ</span>{t('. Bars show each parameter\'s share of the total.')}
          </p>
          <div className="space-y-2">
            {Object.entries(grouped).map(([cat, list]) => (
              <CategoryGroup key={cat} cat={cat} label={meta.categories[cat]} list={list} cfg={cfg} totalW={totalW} setParam={setParam} />
            ))}
          </div>
        </Section>

        {/* ------------------------------------------------ constraints */}
        <Section title={t('Hard constraints')} step={3} subtitle={nConstraints ? t('{n} set', { n: nConstraints }) : t('none set')}>
          <div className="mb-3"><Segmented value={cfg.constraint_mode} onChange={(v) => p.onChange({ ...cfg, constraint_mode: v })}
            options={[{ value: 'exclude', label: t('Exclude violators') }, { value: 'flag', label: t('Flag violators') }]} /></div>
          <div className="space-y-0.5">
            <NumberField label={t('Max terrain slope (p90)')} unit="°" value={c.max_slope_p90} onChange={(v) => setC({ max_slope_p90: v })} step={0.5}
              hint="90th percentile of km-scale slopes inside the cell" />
            <NumberField label={t('Min solar irradiation')} unit="W/m²" value={c.min_solar_wm2} onChange={(v) => setC({ min_solar_wm2: v })} step={5} />
            <NumberField label={t('Max daily temp. range')} unit="°C" value={c.max_daily_range} onChange={(v) => setC({ max_daily_range: v })} />
            <NumberField label={t('Max seasonal temp. range')} unit="°C" value={c.max_seasonal_range} onChange={(v) => setC({ max_seasonal_range: v })} />
            <NumberField label={t('Max elevation variation')} unit="m" value={c.max_relief_m} onChange={(v) => setC({ max_relief_m: v })} step={50}
              hint="max − min elevation inside the 0.25° cell" />
            <NumberField label={t('Min contiguous area')} unit="km²" value={c.min_area_km2} onChange={(v) => setC({ min_area_km2: v })} step={100}
              hint="Connected region of cells passing all constraints with score ≥ threshold" />
            {c.min_area_km2 ? (
              <div className="ml-4 border-l border-ink-600 pl-1">
                <NumberField label={t('…area score threshold')} unit="/100" value={c.area_score_threshold} onChange={(v) => setC({ area_score_threshold: v ?? 50 })} />
              </div>
            ) : null}
            <NumberField label={t('Max distance to road')} unit="km" value={c.max_road_km} onChange={(v) => setC({ max_road_km: v })} step={10} />
          </div>
          <div className="mt-2 space-y-0.5 border-t border-ink-700/70 pt-2">
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-xs text-mute-300 hover:bg-ink-850">
              <span className="flex items-center gap-2"><ShieldCheck size={13} className="text-mute-400" />{t('Exclude known protected areas (USA only)')}</span>
              <Toggle small checked={c.exclude_protected} onChange={(b) => setC({ exclude_protected: b })} />
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-xs text-mute-300 hover:bg-ink-850">
              <span className="flex items-center gap-2"><Mountain size={13} className="text-mute-400" />{t('Exclude permanent ice sheets')}</span>
              <Toggle small checked={c.exclude_ice_sheets} onChange={(b) => setC({ exclude_ice_sheets: b })} />
            </label>
          </div>
        </Section>

        {/* ------------------------------------------------ data */}
        <Section title={t('Data availability')} step={4} subtitle={cfg.missing_mode === 'partial' ? t('Score + confidence') : t('Exclude missing')}>
          <Segmented value={cfg.missing_mode} onChange={(v) => p.onChange({ ...cfg, missing_mode: v })}
            options={[{ value: 'partial', label: t('Score + confidence') }, { value: 'exclude', label: t('Exclude missing') }]} />
          <p className="mt-2.5 rounded-lg bg-ink-850 px-3 py-2 text-2xs leading-relaxed text-mute-400">
            {cfg.missing_mode === 'partial'
              ? t('Missing parameters are skipped (never scored 0). Confidence = Σ wᵢqᵢ over available parameters / Σ wᵢ, where qᵢ is data quality (measured 1.0 … proxy 0.4).')
              : t('Cells lacking data for any enabled parameter are shown grey and never ranked.')}
          </p>
          <RangeRow label={t('Minimum confidence')} value={`${cfg.min_confidence}%`}>
            <input type="range" min={0} max={100} step={5} value={cfg.min_confidence} onChange={(e) => p.onChange({ ...cfg, min_confidence: Number(e.target.value) })} className="wslider w-full" aria-label="Minimum confidence" />
          </RangeRow>
          <RangeRow label={t('Min separation of ranked sites')} value={`${cfg.min_separation_km} km`}>
            <input type="range" min={0} max={1500} step={50} value={cfg.min_separation_km} onChange={(e) => p.onChange({ ...cfg, min_separation_km: Number(e.target.value) })} className="wslider w-full" aria-label="Min separation of ranked sites" />
          </RangeRow>
          <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-ink-850 px-3 py-2 text-xs">
            <span className="text-mute-300">{t('Climate scoring period')}</span>
            {cfg.season_months ? (
              <span className="flex items-center gap-1.5">
                <span className="rounded bg-accent/15 px-1.5 font-mono text-2xs text-accent">{cfg.season_months.map((m) => t(MONTHS[m - 1])).join(' ')}</span>
                <button onClick={() => p.onChange({ ...cfg, season_months: null })} className="text-2xs text-mute-400 underline hover:text-white">{t('Full year')}</button>
              </span>
            ) : <span className="text-2xs text-mute-400">{t('Full year')} · {t('change it in a location\'s Execution tab')}</span>}
          </div>
        </Section>

        {/* ------------------------------------------------ saved */}
        <Section title={t('Saved experiments')} icon={Database} defaultOpen={false} subtitle={t('{n} saved', { n: p.saved.length })}>
          <div className="flex gap-1.5">
            <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder={t('Configuration name')}
              onKeyDown={(e) => { if (e.key === 'Enter' && saveName.trim()) { p.onSave(saveName.trim()); setSaveName(''); } }}
              className="min-w-0 flex-1 rounded-lg border border-ink-600 bg-ink-850 px-3 py-1.5 text-xs text-white placeholder:text-mute-500 focus:border-accent focus:outline-none" />
            <button disabled={!saveName.trim()} onClick={() => { p.onSave(saveName.trim()); setSaveName(''); }}
              className="flex items-center gap-1 rounded-lg bg-accent px-3 text-xs font-medium text-ink-950 transition-opacity hover:opacity-90 disabled:bg-ink-700 disabled:text-mute-500">
              <Save size={12} />{t('Save')}
            </button>
          </div>
          <div className="mt-2.5 space-y-1">
            {p.saved.length === 0 && <div className="rounded-lg border border-dashed border-ink-700 px-3 py-3 text-center text-2xs text-mute-500">{t('No saved configurations (stored in this browser).')}</div>}
            {p.saved.map((s, i) => (
              <div key={i} className="group flex items-center justify-between gap-2 rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-1.5 text-xs">
                <button onClick={() => p.onLoadSaved(i)} className="flex min-w-0 items-center gap-2 truncate text-left text-mute-200 hover:text-white">
                  <FolderOpen size={12} className="shrink-0 text-mute-400" />
                  <span className="truncate">{s.name}</span> <span className="shrink-0 text-mute-500">· {s.body}</span>
                </button>
                <button onClick={() => p.onDeleteSaved(i)} className="text-mute-500 opacity-60 transition hover:text-red-300 group-hover:opacity-100" aria-label="Delete"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
          <button onClick={() => fileRef.current?.click()} className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-ink-600 py-2 text-xs text-mute-400 transition-colors hover:border-accent/60 hover:text-mute-200">
            <Upload size={12} />{t('Import configuration JSON…')}
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) p.onImport(f); e.target.value = ''; }} />
        </Section>
      </div>
    </div>
  );
}

function RangeRow({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <label className="mt-3 block text-xs text-mute-300">
      <span className="mb-1.5 flex items-center justify-between"><span>{label}</span><span className="rounded bg-ink-750 px-1.5 py-px font-mono text-2xs text-white">{value}</span></span>
      {children}
    </label>
  );
}

function CategoryGroup({ cat, label, list, cfg, totalW, setParam }: {
  cat: string; label: string; list: ParamMeta[]; cfg: AnalysisConfig; totalW: number; setParam: (k: string, p: Partial<ParamCfg>) => void;
}) {
  const t = useT();
  const active = list.filter((pm) => cfg.params[pm.key]?.enabled && cfg.params[pm.key].weight > 0);
  const [open, setOpen] = useState(active.length > 0 || cat !== 'nonrepro');
  const Icon = CAT_ICON[cat] ?? SlidersHorizontal;
  const catShare = active.reduce((s, pm) => s + cfg.params[pm.key].weight, 0) / Math.max(totalW, 1);
  return (
    <div className={`overflow-hidden rounded-xl border ${cat === 'nonrepro' ? 'border-orange-500/20' : 'border-ink-700'} bg-ink-875`}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-ink-850" aria-expanded={open}>
        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md ${cat === 'nonrepro' ? 'bg-orange-500/10 text-orange-400' : 'bg-ink-750 text-mute-300'}`}><Icon size={13} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium text-mute-100">{t(label)}</span>
          {cat === 'nonrepro'
            ? <span className="block text-2xs text-orange-400">{t('not reproducible outdoors')}</span>
            : <span className="block text-2xs text-mute-500">{t('{a}/{b} active · {p}% of weight', { a: active.length, b: list.length, p: (catShare * 100).toFixed(0) })}</span>}
        </span>
        <ChevronDown size={13} className={`shrink-0 text-mute-500 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && (
        <div className="divide-y divide-ink-700/60 border-t border-ink-700/70">
          {list.map((pm) => (
            <ParamRow key={pm.key} pm={pm} pc={cfg.params[pm.key]} share={cfg.params[pm.key]?.enabled ? cfg.params[pm.key].weight / Math.max(totalW, 1) : 0}
              onChange={(patch) => setParam(pm.key, patch)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ParamRow({ pm, pc, share, onChange }: { pm: ParamMeta; pc: ParamCfg; share: number; onChange: (p: Partial<ParamCfg>) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!pc) return null;
  const on = pc.enabled;
  return (
    <div className={`px-3 py-2 transition-colors ${open ? 'bg-ink-850' : ''}`}>
      <div className="flex items-center gap-2.5">
        <Toggle small checked={on} onChange={(b) => onChange({ enabled: b })} label={`Enable ${pm.label}`} />
        <button onClick={() => setOpen(!open)} className={`flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs ${on ? 'text-mute-100' : 'text-mute-400'}`} title={pm.description} aria-expanded={open}>
          <span className="truncate">{pm.label}</span>
          {(pm.quality === 'proxy') && <span className="shrink-0 rounded bg-amber-400/10 px-1 text-2xs text-amber-300">{t('proxy')}</span>}
          <Info size={11} className={`shrink-0 ${open ? 'text-accent' : 'text-mute-500'}`} />
        </button>
        <span className={`w-8 rounded bg-ink-750 py-px text-center font-mono text-2xs tabular ${on ? 'text-white' : 'text-mute-500'}`}>{Math.round(pc.weight)}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2.5 pl-[38px]">
        <input type="range" min={0} max={100} step={1} value={pc.weight} disabled={!on}
          onChange={(e) => onChange({ weight: Number(e.target.value) })} className="wslider flex-1" aria-label={`${pm.label} weight`} />
        <div className="h-1.5 w-12 overflow-hidden rounded-full bg-ink-700" title={`${(share * 100).toFixed(0)}% of total weight`}>
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.min(100, share * 100 * 2.5)}%` }} />
        </div>
      </div>
      {open && (
        <div className="tn-in mt-2.5 space-y-2 rounded-lg border border-ink-700 bg-ink-900 p-3 text-2xs leading-relaxed text-mute-400">
          <p className="text-mute-300">{pm.description}</p>
          <p><span className="font-medium text-mute-200">{t('Method')}:</span> {pm.method}</p>
          <div className="flex flex-wrap gap-1">
            <Badge className={QUALITY_CLASS[pm.quality]}>{t(QUALITY_LABEL[pm.quality])}</Badge>
            <Badge className={`border-ink-600 ${REPRO_CLASS[pm.repro]}`}>{t(REPRO_SHORT[pm.repro])}</Badge>
            <Badge className="border-ink-600 text-mute-300">{pm.unit}</Badge>
          </div>
          <p><span className="font-medium text-mute-200">{t('Source')}:</span> {pm.source.name} · {pm.source.resolution}</p>
          {pm.tolerance_label && (
            <label className="flex items-center justify-between gap-2 border-t border-ink-700 pt-2 text-mute-300">{t('Tolerance')} {pm.tolerance_label}
              <input type="number" step="any" value={pc.tolerance ?? pm.tolerance}
                onChange={(e) => onChange({ tolerance: e.target.value === '' ? null : Math.max(1e-6, Number(e.target.value)) })}
                className={`${INPUT} w-20 text-right`} />
            </label>
          )}
          {pm.kind === 'pref' && (
            <>
              <label className="flex items-center justify-between gap-2 text-mute-300">{t('Mode')}
                <select value={pc.extra?.mode ?? 'accessible'} onChange={(e) => onChange({ extra: { ...pc.extra, mode: e.target.value } })}
                  className="tn-select rounded-md border border-ink-600 bg-ink-850 py-1 pl-2 text-2xs text-white focus:border-accent focus:outline-none">
                  <option value="accessible">{t('Prefer accessible')}</option>
                  <option value="remote">{t('Prefer remote (isolation)')}</option>
                </select>
              </label>
              <label className="flex items-center justify-between gap-2 text-mute-300">{t('Ideal distance (km)')}
                <input type="number" value={pc.extra?.ideal_km ?? 50} onChange={(e) => onChange({ extra: { ...pc.extra, ideal_km: Number(e.target.value) } })}
                  className={`${INPUT} w-20 text-right`} />
              </label>
            </>
          )}
        </div>
      )}
    </div>
  );
}
