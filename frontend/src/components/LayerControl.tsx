import { useState } from 'react';
import { ChevronDown, Grid3x3, Home, Layers, MapPin, Mountain, Tags, Trophy } from 'lucide-react';
import type { Meta } from '../lib/api';
import type { Basemap } from './Globe';
import { SELECT, Toggle } from './ui';
import { useT } from '../i18n';

export interface LayerState {
  layer: string;          // overall | confidence | constraints | cat:<k> | param:<k> | data:<k>
  alpha: number;
  basemap: Basemap;
  showGrid: boolean;
  showLabels: boolean;
  showMarkers: boolean;
  showSites: boolean;
}

export default function LayerControl({ meta, s, active, onChange, onReset }: {
  meta: Meta; s: LayerState; active: string[]; onChange: (s: LayerState) => void; onReset: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1024);
  const set = (p: Partial<LayerState>) => onChange({ ...s, ...p });
  const activeCats = Array.from(new Set(active.map((k) => meta.parameters.find((p) => p.key === k)?.category).filter(Boolean))) as string[];
  const toggles = [
    ['showMarkers', 'Top-ranked markers', Trophy], ['showSites', 'Known analog sites', MapPin],
    ['showGrid', 'Coordinate grid', Grid3x3], ['showLabels', 'Place labels & borders', Tags],
  ] as const;
  return (
    <div className="absolute left-3 top-3 z-10 flex max-h-[calc(100%-4.5rem)] w-[272px] flex-col gap-2">
      <div className="overflow-hidden rounded-xl border border-ink-600/80 bg-ink-900/90 text-xs shadow-float backdrop-blur-md">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <button onClick={() => setOpen(!open)} className="flex items-center gap-2 text-[13px] font-semibold text-mute-100 hover:text-white" aria-expanded={open}>
            <span className="grid h-6 w-6 place-items-center rounded-md bg-accent/10 text-accent"><Layers size={13} /></span>
            {t('Map layers')}
            <ChevronDown size={13} className={`text-mute-500 transition-transform ${open ? '' : '-rotate-90'}`} />
          </button>
          <button onClick={onReset} className="flex items-center gap-1 rounded-md border border-ink-600 px-2 py-1 text-2xs text-mute-300 transition-colors hover:border-accent hover:text-white" title="Reset camera">
            <Home size={11} />{t('Reset view')}
          </button>
        </div>
        {open && (
          <div className="space-y-3 border-t border-ink-700/70 p-3">
            <select value={s.layer} onChange={(e) => set({ layer: e.target.value })} className={`${SELECT} py-1.5 text-xs`} aria-label="Map layer">
              <optgroup label={t('Analysis')}>
                <option value="overall">{t('Overall compatibility')}</option>
                <option value="confidence">{t('Data coverage / confidence')}</option>
                <option value="constraints">{t('Constraint failures')}</option>
              </optgroup>
              <optgroup label={t('Category compatibility')}>
                {activeCats.map((c) => <option key={c} value={`cat:${c}`}>{t(meta.categories[c])} {t('compatibility')}</option>)}
              </optgroup>
              <optgroup label={t('Single-parameter similarity')}>
                {meta.parameters.map((p) => <option key={p.key} value={`param:${p.key}`}>{p.label}</option>)}
              </optgroup>
              <optgroup label={t('Earth data layers (raw)')}>
                {meta.data_layers.map((d) => <option key={d.key} value={`data:${d.key}`}>{d.label}</option>)}
              </optgroup>
            </select>
            <label className="block text-mute-300">
              <span className="mb-1.5 flex justify-between"><span>{t('Opacity')}</span><span className="font-mono text-2xs text-mute-400">{Math.round(s.alpha * 100)}%</span></span>
              <input type="range" min={0} max={1} step={0.05} value={s.alpha} onChange={(e) => set({ alpha: Number(e.target.value) })} className="wslider w-full" aria-label="Opacity" />
            </label>
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-ink-700 bg-ink-925 p-0.5">
              {(['satellite', 'natural'] as Basemap[]).map((b) => (
                <button key={b} onClick={() => set({ basemap: b })}
                  className={`flex items-center justify-center gap-1 rounded-md px-2 py-1 text-2xs leading-tight transition-colors ${s.basemap === b ? 'bg-ink-700 font-medium text-white' : 'text-mute-400 hover:text-mute-200'}`}>
                  {b === 'natural' && <Mountain size={11} />}
                  {b === 'satellite' ? t('Satellite') : t('Natural Earth (offline)')}
                </button>
              ))}
            </div>
            <div className="space-y-0.5">
              {toggles.map(([k, l, Icon]) => (
                <label key={k} className="flex cursor-pointer items-center justify-between rounded-md px-1.5 py-1 text-mute-300 hover:bg-ink-800">
                  <span className="flex items-center gap-2"><Icon size={12} className="text-mute-400" />{t(l)}</span>
                  <Toggle small checked={s[k]} onChange={(b) => set({ [k]: b } as any)} />
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
      <Legend meta={meta} layer={s.layer} />
    </div>
  );
}

function Legend({ meta, layer }: { meta: Meta; layer: string }) {
  const t = useT();
  const box = 'rounded-xl border border-ink-600/80 bg-ink-900/90 p-3 text-xs shadow-float backdrop-blur-md';
  if (layer === 'constraints') {
    return (
      <div className={`${box} overflow-y-auto`}>
        <div className="mb-2 text-2xs font-medium text-mute-300">{t('First failing constraint')}</div>
        <div className="grid grid-cols-1 gap-1">
          <Sw c="rgb(40,160,90)" l={t('Passes all constraints')} />
          {meta.constraints.map((c) => <Sw key={c.bit} c={`rgb(${meta.constraint_colors[String(c.bit)].join(',')})`} l={c.label} />)}
          <Sw c="rgb(95,100,112)" l={t('Insufficient data')} />
        </div>
      </div>
    );
  }
  const data = layer.startsWith('data:') ? meta.data_layers.find((d) => d.key === layer.slice(5)) : null;
  const grad = layer === 'confidence'
    ? 'linear-gradient(90deg, rgb(40,20,60), rgb(70,70,150), rgb(60,150,190), rgb(210,245,250))'
    : data ? 'linear-gradient(90deg, #440154, #3b528b, #21918c, #5ec962, #fde725)'
      : 'linear-gradient(90deg, rgb(165,30,40), rgb(215,75,45) 30%, rgb(235,185,55) 50%, rgb(150,195,70) 70%, rgb(20,140,75))';
  const lo = data ? `${data.vmin}` : '0', hi = data ? `${data.vmax}` : '100';
  const title = layer === 'confidence' ? t('Data confidence (%)') : data ? `${data.label} (${data.unit})${data.log ? `, ${t('log scale')}` : ''}` : t('Compatibility (0–100)');
  return (
    <div className={box}>
      <div className="mb-2 text-2xs font-medium text-mute-300">{title}</div>
      <div className="h-2.5 rounded-full ring-1 ring-white/5" style={{ background: grad }} />
      <div className="mt-1 flex justify-between font-mono text-2xs text-mute-400"><span>{lo}</span>{!data && <span>{layer === 'confidence' ? '' : t('moderate')}</span>}<span>{hi}</span></div>
      {!data && <div className="mt-2 flex items-center gap-1.5 text-2xs text-mute-400"><span className="inline-block h-2.5 w-3.5 rounded-sm" style={{ background: 'rgb(95,100,112)' }} />{t('Insufficient data / excluded')}</div>}
      {data && <div className="mt-1.5 text-2xs leading-relaxed text-mute-400">{data.source.name}</div>}
    </div>
  );
}

function Sw({ c, l }: { c: string; l: string }) {
  return <div className="flex items-center gap-2 text-2xs text-mute-300"><span className="inline-block h-2.5 w-3.5 shrink-0 rounded-sm" style={{ background: c }} />{l}</div>;
}
