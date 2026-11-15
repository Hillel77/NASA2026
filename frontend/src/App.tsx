import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnalysisConfig, AnalyzeResponse, Body, LocationDetail as LD, Meta, TopLocation } from './lib/api';
import { api, configFromPreset, toRequest } from './lib/api';
import { exportConfig, exportCsv, exportGeoJson, loadConfigFile } from './lib/exporters';
import ConfigPanel from './components/ConfigPanel';
import Globe from './components/Globe';
import LayerControl, { LayerState } from './components/LayerControl';
import ResultsPanel from './components/ResultsPanel';
import LocationDetail from './components/LocationDetail';
import CompareModal from './components/CompareModal';
import MethodologyModal from './components/MethodologyModal';
import { Spinner } from './components/ui';

const SAVED_KEY = 'terranova.saved.v1';
type Saved = { name: string; body: Body; presetId: string; cfg: AnalysisConfig };

function readSaved(): Saved[] {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); } catch { return []; }
}

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaErr, setMetaErr] = useState<string | null>(null);
  const [body, setBody] = useState<Body>('mars');
  const [presetId, setPresetId] = useState('mars_rover');
  const [cfg, setCfg] = useState<AnalysisConfig | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [layers, setLayers] = useState<LayerState>({ layer: 'overall', alpha: 0.82, basemap: 'satellite', showGrid: false, showLabels: false, showMarkers: true, showSites: false });
  const [heatLoading, setHeatLoading] = useState(false);
  const [selected, setSelected] = useState<{ lat: number; lon: number; bounds?: number[]; cell?: number } | null>(null);
  const [detail, setDetail] = useState<LD | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [flyTo, setFlyTo] = useState<{ lat: number; lon: number; n: number } | null>(null);
  const [resetNonce, setResetNonce] = useState(0);
  const [compare, setCompare] = useState<TopLocation[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [saved, setSaved] = useState<Saved[]>(readSaved);
  const [mobilePanel, setMobilePanel] = useState<'none' | 'config' | 'results'>('none');
  const [toast, setToast] = useState<string | null>(null);

  // ------------------------------------------------------------------ bootstrap
  useEffect(() => {
    api.meta().then((m) => {
      setMeta(m);
      const p = m.presets.find((x) => x.id === 'mars_rover')!;
      setCfg(configFromPreset(p, m));
    }).catch((e) => setMetaErr(String(e.message ?? e)));
  }, []);

  // ------------------------------------------------------------------ debounced analysis
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!cfg) return;
    const t = setTimeout(() => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      setError(null);
      api.analyze(toRequest(cfg), ac.signal)
        .then((r) => { setResult(r); setLoading(false); })
        .catch((e) => { if (e.name !== 'AbortError') { setError(String(e.message ?? e)); setLoading(false); } });
    }, 280);
    return () => clearTimeout(t);
  }, [cfg]);

  // re-fetch detail for the selected location when the analysis changes
  useEffect(() => {
    if (!result || !selected || !detailOpen) return;
    loadDetail(selected.lat, selected.lon, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.result_id]);

  const heatmapUrl = useMemo(() => {
    if (!result) return null;
    return api.layerUrl(result.result_id, layers.layer);
  }, [result, layers.layer]);

  const loadDetail = useCallback((lat: number, lon: number, open = true) => {
    if (!result) return;
    if (open) { setDetailOpen(true); setDetail(null); }
    setDetailLoading(true);
    api.location(result.result_id, lat, lon)
      .then((d) => { setDetail(d); setSelected({ lat: d.lat, lon: d.lon, bounds: d.cell_bounds }); })
      .catch((e) => { setToast(`Could not load location: ${e.message ?? e}`); setDetailOpen(false); })
      .finally(() => setDetailLoading(false));
  }, [result]);

  const onPick = useCallback((lat: number, lon: number) => { loadDetail(lat, lon); }, [loadDetail]);

  const selectTop = (t: TopLocation) => {
    setSelected({ lat: t.lat, lon: t.lon, cell: t.cell });
    setFlyTo({ lat: t.lat, lon: t.lon, n: Date.now() });
    loadDetail(t.lat, t.lon);
    setMobilePanel('none');
  };

  // ------------------------------------------------------------------ config actions
  const changeBody = (b: Body) => {
    if (!meta) return;
    setBody(b);
    const pid = b === 'moon' ? 'lunar_landing' : 'mars_rover';
    setPresetId(pid);
    setCfg(configFromPreset(meta.presets.find((x) => x.id === pid)!, meta));
    setCompare([]);
  };
  const changePreset = (id: string) => {
    if (!meta) return;
    const p = meta.presets.find((x) => x.id === id)!;
    setPresetId(id);
    const c = configFromPreset(p, meta);
    // generic presets (solar, custom) keep the currently selected body
    if (p.body !== body) c.region = meta.regions.find((r) => r.body === body && (body === 'moon' ? r.id === 'moon_mare' : r.id === 'mars_global'))!.id;
    setCfg(c);
  };
  const persist = (s: Saved[]) => { setSaved(s); try { localStorage.setItem(SAVED_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } };
  const importCfg = (f: File) => loadConfigFile(f).then((c) => {
    if (!meta) return;
    const reg = meta.regions.find((r) => r.id === c.region);
    if (!reg) throw new Error('Unknown reference region in file');
    setBody(reg.body);
    setPresetId('custom');
    const base = configFromPreset(meta.presets.find((x) => x.id === 'custom')!, meta);
    setCfg({ ...base, ...c, params: { ...base.params, ...c.params }, constraints: { ...base.constraints, ...c.constraints } });
    setToast('Configuration imported');
  }).catch((e) => setToast(`Import failed: ${e.message ?? e}`));

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);

  if (metaErr) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div>
          <div className="text-lg text-white">TerraNova backend not reachable</div>
          <p className="mt-2 text-sm text-mute-400">{metaErr}</p>
          <p className="mt-1 text-xs text-mute-400">Start it with <code className="font-mono text-mute-200">uvicorn app.main:app --port 8000</code> in <code className="font-mono">backend/</code>.</p>
          <button onClick={() => location.reload()} className="mt-4 rounded border border-ink-600 px-3 py-1 text-sm hover:border-accent">Retry</button>
        </div>
      </div>
    );
  }
  if (!meta || !cfg) {
    return <div className="grid h-full place-items-center text-sm text-mute-400"><div className="flex items-center gap-2"><Spinner /> Loading global datasets…</div></div>;
  }

  const region = meta.regions.find((r) => r.id === cfg.region);
  const sites = meta.analog_sites;

  return (
    <div className="flex h-full flex-col">
      {/* ---------------------------------------------------------------- header */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-ink-700 bg-ink-900 px-4">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" className="h-6 w-6" alt="" />
          <div className="text-[15px] font-semibold tracking-tight text-white">TerraNova</div>
          <div className="hidden text-xs text-mute-400 md:block">Earth analog sites for lunar &amp; Martian testing</div>
          {meta.data_mode === 'demo'
            ? <span className="rounded border border-amber-500/60 bg-amber-500/15 px-2 py-0.5 text-2xs font-medium text-amber-300">DEMO MODE · SYNTHETIC DATA</span>
            : <span className="hidden rounded border border-emerald-500/40 px-2 py-0.5 text-2xs text-emerald-300 sm:inline" title="NASA POWER, AWS Terrain Tiles, ESA WorldCover, Natural Earth">Real datasets</span>}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="hidden font-mono text-2xs text-mute-400 lg:inline">
            {region?.name} {result ? `· ${result.elapsed_ms} ms` : ''}
          </span>
          {(loading || heatLoading) && <Spinner />}
          <button onClick={() => setMethodOpen(true)} className="rounded border border-ink-600 px-2.5 py-1 text-mute-200 hover:border-accent">Methodology</button>
          <div className="relative">
            <button onClick={() => setExportOpen(!exportOpen)} className="rounded border border-ink-600 px-2.5 py-1 text-mute-200 hover:border-accent">Export ▾</button>
            {exportOpen && (
              <div className="absolute right-0 top-8 z-40 w-56 rounded-md border border-ink-600 bg-ink-900 py-1 shadow-xl" onMouseLeave={() => setExportOpen(false)}>
                {[
                  ['Ranked list (CSV)', () => result && exportCsv(result.top, cfg, meta.data_mode)],
                  ['Top locations (GeoJSON)', () => result && exportGeoJson(result.top.map((t) => ({ lat: t.lat, lon: t.lon, props: { rank: t.rank, name: t.name, country: t.country, score: t.score, confidence: t.confidence, reference: cfg.region } })))],
                  ['Compared locations (GeoJSON)', () => exportGeoJson(compare.map((t) => ({ lat: t.lat, lon: t.lon, props: { name: t.name, score: t.score } })))],
                  ['Configuration (JSON)', () => exportConfig(cfg)],
                  ['Location report (PDF)…', () => setToast('Open a location and use “PDF report” in its panel')],
                ].map(([l, f]) => (
                  <button key={l as string} onClick={() => { (f as () => void)(); setExportOpen(false); }} className="block w-full px-3 py-1.5 text-left text-mute-200 hover:bg-ink-800">{l as string}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------------------- body */}
      <div className="relative flex min-h-0 flex-1">
        <aside className={`${mobilePanel === 'config' ? 'absolute inset-y-0 left-0 z-30 flex' : 'hidden'} w-[320px] shrink-0 flex-col border-r border-ink-700 bg-ink-900 lg:static lg:flex`}>
          <ConfigPanel meta={meta} body={body} presetId={presetId} cfg={cfg} onBody={changeBody} onPreset={changePreset}
            onChange={(c) => setCfg(c)} saved={saved}
            onSave={(name) => persist([...saved, { name, body, presetId, cfg }])}
            onLoadSaved={(i) => { const s = saved[i]; setBody(s.body); setPresetId(s.presetId); setCfg(s.cfg); }}
            onDeleteSaved={(i) => persist(saved.filter((_, j) => j !== i))}
            onImport={importCfg} />
        </aside>

        <main className="relative min-w-0 flex-1 bg-ink-950">
          <Globe heatmapUrl={heatmapUrl} overlayAlpha={layers.alpha} markers={result?.top ?? []} sites={sites}
            showSites={layers.showSites} showMarkers={layers.showMarkers} showGrid={layers.showGrid} showLabels={layers.showLabels}
            basemap={layers.basemap} selected={selected} flyTo={flyTo} resetNonce={resetNonce} onPick={onPick}
            onBasemapFallback={() => { setLayers((l) => ({ ...l, basemap: 'natural' })); setToast('Satellite imagery unreachable – switched to offline Natural Earth basemap'); }}
            onLoading={setHeatLoading} />
          <LayerControl meta={meta} s={layers} active={result?.active ?? []} onChange={setLayers} onReset={() => setResetNonce((n) => n + 1)} />
          <div className="pointer-events-none absolute bottom-3 right-14 z-10 hidden max-w-sm md:block rounded border border-ink-700 bg-ink-900/80 px-2 py-1 text-2xs text-mute-400">
            Heatmap = computed score of every 0.25° land cell. Click anywhere for a full comparison.
          </div>
          <div className="absolute bottom-12 left-3 z-20 flex gap-2 lg:hidden">
            <button onClick={() => setMobilePanel(mobilePanel === 'config' ? 'none' : 'config')} className="rounded border border-ink-600 bg-ink-900 px-3 py-1.5 text-xs text-white">Configure</button>
            <button onClick={() => setMobilePanel(mobilePanel === 'results' ? 'none' : 'results')} className="rounded border border-ink-600 bg-ink-900 px-3 py-1.5 text-xs text-white">Results</button>
          </div>
        </main>

        <aside className={`${mobilePanel === 'results' ? 'absolute inset-y-0 right-0 z-30 flex' : 'hidden'} w-[340px] max-w-full shrink-0 flex-col border-l border-ink-700 bg-ink-900 lg:static lg:flex`}>
          <ResultsPanel result={result} loading={loading} error={error} selectedCell={selected?.cell ?? null} compare={compare}
            onSelect={selectTop}
            onToggleCompare={(t) => setCompare((c) => c.some((x) => x.cell === t.cell) ? c.filter((x) => x.cell !== t.cell) : [...c, t].slice(-6))}
            onOpenCompare={() => setCompareOpen(true)}
            onPickSite={(lat, lon) => { setFlyTo({ lat, lon, n: Date.now() }); loadDetail(lat, lon); setLayers((l) => ({ ...l, showSites: true })); }} />
        </aside>
      </div>

      {detailOpen && (
        <LocationDetail d={detail} loading={detailLoading} cfg={cfg} meta={meta} onClose={() => setDetailOpen(false)}
          inCompare={!!detail && compare.some((c) => Math.abs(c.lat - detail.lat) < 0.01 && Math.abs(c.lon - detail.lon) < 0.01)}
          onAddCompare={() => {
            if (!detail) return;
            const t: TopLocation = {
              rank: 0, lat: detail.lat, lon: detail.lon, cell: Math.round((90 - detail.lat) / 0.25 - 0.5) * 1440 + Math.round((detail.lon + 180) / 0.25 - 0.5),
              name: detail.name, country: detail.country, iso3: detail.iso3, continent: detail.continent, nearest_place: detail.nearest_place,
              nearest_place_km: detail.nearest_place_km, score: detail.score ?? 0, confidence: detail.confidence ?? 0, flagged: false, failed_constraints: [], summary: '',
            };
            setCompare((c) => c.some((x) => x.cell === t.cell) ? c.filter((x) => x.cell !== t.cell) : [...c, t].slice(-6));
          }} />
      )}
      {compareOpen && result && <CompareModal rid={result.result_id} items={compare} onClose={() => setCompareOpen(false)} />}
      {methodOpen && <MethodologyModal meta={meta} onClose={() => setMethodOpen(false)} />}
      {toast && <div className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded border border-ink-600 bg-ink-800 px-3 py-2 text-xs text-white shadow-xl">{toast}</div>}
    </div>
  );
}
