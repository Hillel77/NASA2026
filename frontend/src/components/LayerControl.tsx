import { useState } from 'react';
import type { Meta } from '../lib/api';
import type { Basemap } from './Globe';
import { Toggle } from './ui';

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
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1024);
  const set = (p: Partial<LayerState>) => onChange({ ...s, ...p });
  const activeCats = Array.from(new Set(active.map((k) => meta.parameters.find((p) => p.key === k)?.category).filter(Boolean))) as string[];
  return (
    <div className="absolute left-3 top-3 z-10 w-64 rounded-md border border-ink-600 bg-ink-900/90 text-xs shadow-xl backdrop-blur">
      <div className="flex items-center justify-between border-b border-ink-700 px-3 py-2">
        <button onClick={() => setOpen(!open)} className="text-2xs uppercase tracking-[0.12em] text-mute-400 hover:text-mute-200">{open ? '▾' : '▸'} Map layers</button>
        <button onClick={onReset} className="rounded border border-ink-600 px-1.5 py-0.5 text-2xs text-mute-300 hover:border-accent" title="Reset camera">⌂ Reset view</button>
      </div>
      {open && (
        <div className="space-y-2 p-3">
          <select value={s.layer} onChange={(e) => set({ layer: e.target.value })}
            className="w-full rounded border border-ink-600 bg-ink-850 px-2 py-1 text-xs text-white focus:border-accent focus:outline-none">
            <optgroup label="Analysis">
              <option value="overall">Overall compatibility</option>
              <option value="confidence">Data coverage / confidence</option>
              <option value="constraints">Constraint failures</option>
            </optgroup>
            <optgroup label="Category compatibility">
              {activeCats.map((c) => <option key={c} value={`cat:${c}`}>{meta.categories[c]} compatibility</option>)}
            </optgroup>
            <optgroup label="Single-parameter similarity">
              {meta.parameters.map((p) => <option key={p.key} value={`param:${p.key}`}>{p.label}</option>)}
            </optgroup>
            <optgroup label="Earth data layers (raw)">
              {meta.data_layers.map((d) => <option key={d.key} value={`data:${d.key}`}>{d.label}</option>)}
            </optgroup>
          </select>
          <label className="flex items-center gap-2 text-mute-300">Opacity
            <input type="range" min={0} max={1} step={0.05} value={s.alpha} onChange={(e) => set({ alpha: Number(e.target.value) })} className="wslider flex-1" />
          </label>
          <div className="flex gap-1">
            {(['satellite', 'natural'] as Basemap[]).map((b) => (
              <button key={b} onClick={() => set({ basemap: b })}
                className={`flex-1 rounded border px-2 py-0.5 text-2xs ${s.basemap === b ? 'border-accent text-white' : 'border-ink-600 text-mute-400'}`}>
                {b === 'satellite' ? 'Satellite' : 'Natural Earth (offline)'}
              </button>
            ))}
          </div>
          {([['showMarkers', 'Top-ranked markers'], ['showSites', 'Known analog sites'], ['showGrid', 'Coordinate grid'], ['showLabels', 'Place labels & borders']] as const).map(([k, l]) => (
            <label key={k} className="flex items-center justify-between text-mute-300">{l}<Toggle small checked={s[k]} onChange={(b) => set({ [k]: b } as any)} /></label>
          ))}
        </div>
      )}
      <Legend meta={meta} layer={s.layer} />
    </div>
  );
}

function Legend({ meta, layer }: { meta: Meta; layer: string }) {
  if (layer === 'constraints') {
    return (
      <div className="border-t border-ink-700 p-3">
        <div className="mb-1 text-2xs text-mute-400">First failing constraint</div>
        <div className="grid grid-cols-1 gap-0.5">
          <Sw c="rgb(40,160,90)" l="Passes all constraints" />
          {meta.constraints.map((c) => <Sw key={c.bit} c={`rgb(${meta.constraint_colors[String(c.bit)].join(',')})`} l={c.label} />)}
          <Sw c="rgb(95,100,112)" l="Insufficient data" />
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
  const title = layer === 'confidence' ? 'Data confidence (%)' : data ? `${data.label} (${data.unit})${data.log ? ', log scale' : ''}` : 'Compatibility (0–100)';
  return (
    <div className="border-t border-ink-700 p-3">
      <div className="mb-1 text-2xs text-mute-400">{title}</div>
      <div className="h-2.5 rounded" style={{ background: grad }} />
      <div className="mt-0.5 flex justify-between font-mono text-2xs text-mute-400"><span>{lo}</span>{!data && <span>{layer === 'confidence' ? '' : 'moderate'}</span>}<span>{hi}</span></div>
      {!data && <div className="mt-1.5 flex items-center gap-1.5 text-2xs text-mute-400"><span className="inline-block h-2.5 w-3 rounded-sm" style={{ background: 'rgb(95,100,112)' }} />Insufficient data / excluded</div>}
      {data && <div className="mt-1 text-2xs text-mute-400">{data.source.name}</div>}
    </div>
  );
}

function Sw({ c, l }: { c: string; l: string }) {
  return <div className="flex items-center gap-1.5 text-2xs text-mute-300"><span className="inline-block h-2.5 w-3 shrink-0 rounded-sm" style={{ background: c }} />{l}</div>;
}
