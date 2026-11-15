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
import type { ConfigAction } from './components/AdvisorPanel';
import { LANGS, useI18n } from './i18n';
import type { Lang } from './i18n';
import type { Verification } from './lib/api';
import {
  BookOpen, Braces, ChevronDown, Columns3, Crosshair, Download, FileText, Info, ListOrdered, MapPin, MousePointerClick, RefreshCw,
  Languages, ServerCrash, SlidersHorizontal, Table2,
} from 'lucide-react';

const SAVED_KEY = 'terranova.saved.v1';
type Saved = { name: string; body: Body; presetId: string; cfg: AnalysisConfig };

function readSaved(): Saved[] {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); } catch { return []; }
}

export default function App() {
  const { t, lang, setLang } = useI18n();
  const [verifyMap, setVerifyMap] = useState<Record<number, Verification | 'pending'>>({});
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
      .catch((e) => { setToast(`${t('Could not load location')}: ${e.message ?? e}`); setDetailOpen(false); })
      .finally(() => setDetailLoading(false));
  }, [result]);

  const onPick = useCallback((lat: number, lon: number) => { loadDetail(lat, lon); }, [loadDetail]);

  const selectTop = (t: TopLocation) => {
    setSelected({ lat: t.lat, lon: t.lon, cell: t.cell });
    setFlyTo({ lat: t.lat, lon: t.lon, n: Date.now() });
    loadDetail(t.lat, t.lon);
    setMobilePanel('none');
  };

  // ------------------------------------------------------------------ advisor / execution actions
  const applyAction = useCallback((a: ConfigAction) => {
    setCfg((c) => {
      if (!c) return c;
      const params = { ...c.params };
      const set = (k: string, patch: any) => { params[k] = { ...params[k], ...patch }; };
      if (a.type === 'enable') set(a.key, { enabled: true, weight: a.weight ?? (params[a.key]?.weight || 40) });
      else if (a.type === 'disable') set(a.key, { enabled: false });
      else if (a.type === 'weight') set(a.key, a.weight > 0 ? { enabled: true, weight: a.weight } : { enabled: false });
      else if (a.type === 'tolerance') set(a.key, { tolerance: a.value });
      else if (a.type === 'season') return { ...c, season_months: a.months && a.months.length && a.months.length < 12 ? a.months : null };
      return { ...c, params };
    });
  }, []);

  // ------------------------------------------------------------------ automatic NASA verification of the top 3 sites
  useEffect(() => {
    if (!result || meta?.data_mode !== 'real') return;
    let cancelled = false;
    (async () => {
      for (const tp of result.top.slice(0, 3)) {
        if (cancelled) return;
        if (verifyMap[tp.cell] && verifyMap[tp.cell] !== 'pending') continue;
        setVerifyMap((m) => ({ ...m, [tp.cell]: 'pending' }));
        try {
          const v = await api.verify(tp.lat, tp.lon);
          if (!cancelled) setVerifyMap((m) => ({ ...m, [tp.cell]: v }));
        } catch {
          if (!cancelled) setVerifyMap((m) => { const n = { ...m }; delete n[tp.cell]; return n; });
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.result_id]);

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
    setToast(t('Configuration imported'));
  }).catch((e) => setToast(`${t('Import failed')}: ${e.message ?? e}`));

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);

  if (metaErr) {
    return (
      <div className="grid h-full place-items-center bg-[radial-gradient(ellipse_at_top,#121823,#06080c_60%)] p-6 text-center">
        <div className="max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-8 shadow-float">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-red-500/10 text-red-300"><ServerCrash size={22} /></div>
          <div className="text-lg font-semibold text-white">{t('TerraNova backend not reachable')}</div>
          <p className="mt-2 text-sm text-mute-400">{metaErr}</p>
          <p className="mt-3 rounded-lg bg-ink-850 px-3 py-2 text-xs text-mute-400">Start it with <code className="font-mono text-mute-200">uvicorn app.main:app --port 8000</code> in <code className="font-mono">backend/</code>.</p>
          <button onClick={() => location.reload()} className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink-950 hover:opacity-90"><RefreshCw size={14} />{t('Retry')}</button>
        </div>
      </div>
    );
  }
  if (!meta || !cfg) {
    return (
      <div className="grid h-full place-items-center bg-[radial-gradient(ellipse_at_top,#121823,#06080c_60%)]">
        <div className="flex flex-col items-center gap-4">
          <img src="/favicon.svg" className="h-12 w-12 animate-pulse" alt="" />
          <div className="text-lg font-semibold tracking-tight text-white">TerraNova</div>
          <div className="flex items-center gap-2 text-sm text-mute-400"><Spinner /> {t('Loading global datasets…')}</div>
        </div>
      </div>
    );
  }

  const region = meta.regions.find((r) => r.id === cfg.region);
  const sites = meta.analog_sites;
  const btn = 'flex items-center gap-1.5 rounded-lg border border-ink-600 px-3 py-1.5 text-mute-200 transition-colors hover:border-accent hover:text-white';

  return (
    <div className="flex h-full flex-col">
      {/* ---------------------------------------------------------------- header */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-ink-700 bg-ink-925/95 px-4 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <img src="/favicon.svg" className="h-7 w-7 shrink-0" alt="" />
          <div className="min-w-0">
            <div className="text-base font-semibold leading-tight tracking-tight text-white">TerraNova</div>
            <div className="hidden truncate text-2xs text-mute-400 md:block">{t('Earth analog sites for lunar & Martian testing')}</div>
          </div>
          {meta.data_mode === 'demo'
            ? <span className="ml-1 rounded-full border border-amber-500/60 bg-amber-500/15 px-2.5 py-0.5 text-2xs font-medium text-amber-300">{t('DEMO MODE · SYNTHETIC DATA')}</span>
            : <span className="ml-1 hidden items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-2xs text-emerald-300 sm:inline-flex" title="NASA POWER, AWS Terrain Tiles, ESA WorldCover, Natural Earth">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{t('Real datasets')}</span>}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="hidden items-center gap-1.5 rounded-full border border-ink-700 bg-ink-850 px-3 py-1 font-mono text-2xs text-mute-400 xl:inline-flex">
            <Crosshair size={11} className={body === 'mars' ? 'text-mars' : 'text-moon'} />
            {region?.name} {result ? `· ${result.elapsed_ms} ms` : ''}
          </span>
          {(loading || heatLoading) && <Spinner />}
          <label className={`${btn} cursor-pointer`} title={t('Language')}>
            <Languages size={13} />
            <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t('Language')}
              className="cursor-pointer bg-transparent text-xs text-mute-200 focus:outline-none">
              {LANGS.map((l) => <option key={l.code} value={l.code} className="bg-ink-900">{l.label}</option>)}
            </select>
          </label>
          <button onClick={() => setMethodOpen(true)} className={btn}><BookOpen size={13} /><span className="hidden sm:inline">{t('Methodology')}</span></button>
          <div className="relative">
            <button onClick={() => setExportOpen(!exportOpen)} className={btn} aria-expanded={exportOpen}><Download size={13} /><span className="hidden sm:inline">{t('Export')}</span><ChevronDown size={12} /></button>
            {exportOpen && (
              <div className="tn-in absolute right-0 top-10 z-40 w-60 overflow-hidden rounded-xl border border-ink-600 bg-ink-900 p-1 shadow-float" onMouseLeave={() => setExportOpen(false)}>
                {[
                  ['Ranked list (CSV)', () => result && exportCsv(result.top, cfg, meta.data_mode), Table2],
                  ['Top locations (GeoJSON)', () => result && exportGeoJson(result.top.map((t) => ({ lat: t.lat, lon: t.lon, props: { rank: t.rank, name: t.name, country: t.country, score: t.score, confidence: t.confidence, reference: cfg.region } }))), MapPin],
                  ['Compared locations (GeoJSON)', () => exportGeoJson(compare.map((t) => ({ lat: t.lat, lon: t.lon, props: { name: t.name, score: t.score } }))), Columns3],
                  ['Configuration (JSON)', () => exportConfig(cfg), Braces],
                  ['Location report (PDF)…', () => setToast(t('Open a location and use “PDF report” in its panel')), FileText],
                ].map(([l, f, Icon]) => {
                  const I = Icon as typeof Table2;
                  return (
                    <button key={l as string} onClick={() => { (f as () => void)(); setExportOpen(false); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-mute-200 hover:bg-ink-800 hover:text-white">
                      <I size={13} className="text-mute-400" />{t(l as string)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------------------- body */}
      <div className="relative flex min-h-0 flex-1">
        <aside className={`${mobilePanel === 'config' ? 'absolute inset-y-0 left-0 z-30 flex' : 'hidden'} w-[340px] max-w-[92vw] shrink-0 flex-col border-r border-ink-700 bg-ink-900 shadow-float lg:static lg:flex lg:shadow-none`}>
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
            onBasemapFallback={() => { setLayers((l) => ({ ...l, basemap: 'natural' })); setToast(t('Satellite imagery unreachable – switched to offline Natural Earth basemap')); }}
            onLoading={setHeatLoading} />
          <LayerControl meta={meta} s={layers} active={result?.active ?? []} onChange={setLayers} onReset={() => setResetNonce((n) => n + 1)} />
          <div className="pointer-events-none absolute bottom-3 right-16 z-10 hidden max-w-sm items-center gap-2 rounded-lg border border-ink-700 bg-ink-900/85 px-3 py-1.5 text-2xs text-mute-300 backdrop-blur md:flex">
            <MousePointerClick size={13} className="shrink-0 text-accent" />
            {t('Heatmap = computed score of every 0.25° land cell. Click anywhere for a full comparison.')}
          </div>
          <div className="absolute bottom-14 left-1/2 z-40 flex -translate-x-1/2 gap-1 rounded-xl border border-ink-600 bg-ink-900/95 p-1 shadow-float backdrop-blur lg:hidden">
            <button onClick={() => setMobilePanel(mobilePanel === 'config' ? 'none' : 'config')} className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium ${mobilePanel === 'config' ? 'bg-accent text-ink-950' : 'text-white'}`}><SlidersHorizontal size={14} />{t('Configure')}</button>
            <button onClick={() => setMobilePanel(mobilePanel === 'results' ? 'none' : 'results')} className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium ${mobilePanel === 'results' ? 'bg-accent text-ink-950' : 'text-white'}`}><ListOrdered size={14} />{t('Results')}</button>
          </div>
        </main>

        <aside className={`${mobilePanel === 'results' ? 'absolute inset-y-0 right-0 z-30 flex' : 'hidden'} w-[360px] max-w-[92vw] shrink-0 flex-col border-l border-ink-700 bg-ink-900 shadow-float lg:static lg:flex lg:shadow-none`}>
          <ResultsPanel result={result} loading={loading} error={error} selectedCell={selected?.cell ?? null} compare={compare}
            verifyMap={verifyMap} llmAvailable={!!meta.llm?.available} topN={cfg.top_n} sep={cfg.min_separation_km} onAction={applyAction}
            onSelect={selectTop}
            onToggleCompare={(t) => setCompare((c) => c.some((x) => x.cell === t.cell) ? c.filter((x) => x.cell !== t.cell) : [...c, t].slice(-6))}
            onOpenCompare={() => setCompareOpen(true)}
            onPickSite={(lat, lon) => { setFlyTo({ lat, lon, n: Date.now() }); loadDetail(lat, lon); setLayers((l) => ({ ...l, showSites: true })); }} />
        </aside>
      </div>

      {detailOpen && (
        <LocationDetail d={detail} loading={detailLoading} cfg={cfg} meta={meta} rid={result?.result_id ?? null} onAction={applyAction} applying={loading} onClose={() => setDetailOpen(false)}
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
      {toast && <div role="status" className="tn-in fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-xl border border-ink-600 bg-ink-800 px-4 py-2.5 text-xs text-white shadow-float"><Info size={14} className="shrink-0 text-accent" />{toast}</div>}
    </div>
  );
}
