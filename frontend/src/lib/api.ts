// Typed client for the TerraNova FastAPI backend.

export type Body = 'moon' | 'mars';

export interface SourceInfo { name: string; url: string; resolution: string; period: string }

export interface ParamMeta {
  key: string; label: string; category: string; unit: string; description: string; method: string;
  source: SourceInfo; source_key: string; quality: string; q: number; repro: string; repro_label: string;
  kind: string; tolerance: number; tolerance_label: string; default_enabled: boolean; extra: Record<string, any>;
}
export interface Region { id: string; body: Body; name: string; lat: number; lon: number; description: string }
export interface Preset {
  id: string; body: Body; region: string; name: string; summary: string;
  weights: Record<string, number>; constraints: Partial<Constraints>; tolerances: Record<string, number>;
}
export interface DataLayer { key: string; label: string; unit: string; vmin: number; vmax: number; log: boolean; source: SourceInfo }
export interface AnalogSite { name: string; country: string; lat: number; lon: number; body: Body; use: string; ref: string }
export interface Meta {
  data_mode: 'real' | 'demo';
  grid: { resolution_deg: number; nlat: number; nlon: number };
  parameters: ParamMeta[]; categories: Record<string, string>; repro_labels: Record<string, string>;
  regions: Region[]; presets: Preset[]; sources: Record<string, SourceInfo>;
  constraints: { bit: number; key: string; label: string; unit: string }[];
  constraint_colors: Record<string, number[]>;
  data_layers: DataLayer[]; analog_sites: AnalogSite[]; power_meta: any; built?: string;
}

export interface ParamCfg { enabled: boolean; weight: number; tolerance?: number | null; extra?: Record<string, any> | null }
export interface Constraints {
  max_slope_p90: number | null; min_solar_wm2: number | null; max_daily_range: number | null;
  max_seasonal_range: number | null; min_area_km2: number | null; area_score_threshold: number;
  max_relief_m: number | null; max_road_km: number | null; exclude_protected: boolean; exclude_ice_sheets: boolean;
}
export interface AnalysisConfig {
  region: string; params: Record<string, ParamCfg>; constraints: Constraints;
  constraint_mode: 'exclude' | 'flag'; missing_mode: 'partial' | 'exclude'; min_confidence: number;
  top_n: number; min_separation_km: number; preset_name?: string | null;
}

export interface TopLocation {
  rank: number; lat: number; lon: number; cell: number; name: string; country: string; iso3: string | null;
  continent: string | null; nearest_place: string | null; nearest_place_km: number | null;
  score: number; confidence: number; flagged: boolean; failed_constraints: string[]; summary: string;
}
export interface AnalyzeResponse {
  result_id: string; data_mode: string; elapsed_ms: number; active: string[]; not_applicable: string[];
  weights: Record<string, number>;
  stats: { land: number; ok: number; no_data: number; excluded: number; flagged: number; score_hist: number[];
    score_p50: number | null; score_max: number | null; mean_confidence: number | null };
  top: TopLocation[]; warnings: string[];
}

export interface TargetValue { value: any; source: string; quality: string; note: string }
export interface DetailRow {
  key: string; label: string; category: string; unit: string; enabled: boolean; weight: number;
  target: TargetValue | null; earth: any; earth_available: boolean; difference: any; similarity: number | null;
  quality: string; repro: string; repro_label: string; source: SourceInfo; method: string; not_applicable: boolean;
}
export interface LocationDetail {
  lat: number; lon: number; cell_bounds: [number, number, number, number]; name: string; country: string;
  iso3: string | null; continent: string | null; nearest_place: string | null; nearest_place_km: number | null;
  score: number | null; confidence: number | null; status: string; failed_constraints: string[];
  category_scores: Record<string, number | null>; target: { id: string; name: string; body: Body };
  rows: DetailRow[];
  monthly: Record<string, (number | null)[] | string[] | null> & { months: string[] };
  slope: { bins: string[]; earth_pct: (number | null)[]; target_pct?: number[] };
  terrain: Record<string, number | null>; landcover: Record<string, number | null>;
  logistics: Record<string, number | null>; data_mode: string; explanation: string[]; limitations: string[];
}

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`;
    try { const b = await r.json(); msg = b.detail ? (typeof b.detail === 'string' ? b.detail : JSON.stringify(b.detail)) : msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return r.json();
}

export const api = {
  meta: () => fetch('/api/meta').then((r) => j<Meta>(r)),
  analyze: (cfg: AnalysisConfig, signal?: AbortSignal) =>
    fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg), signal })
      .then((r) => j<AnalyzeResponse>(r)),
  layerUrl: (rid: string, layer: string) => `/api/layer/${rid}.png?layer=${encodeURIComponent(layer)}`,
  location: (rid: string, lat: number, lon: number) =>
    fetch(`/api/location?rid=${rid}&lat=${lat}&lon=${lon}`).then((r) => j<LocationDetail>(r)),
  live: (source: 'nasa_power' | 'soilgrids' | 'terrain', lat: number, lon: number) =>
    fetch(`/api/live?source=${source}&lat=${lat}&lon=${lon}`).then((r) => j<any>(r)),
  validation: (rid: string) => fetch(`/api/validation?rid=${rid}`).then((r) => j<{ sites: any[] }>(r)),
};

export const EMPTY_CONSTRAINTS: Constraints = {
  max_slope_p90: null, min_solar_wm2: null, max_daily_range: null, max_seasonal_range: null,
  min_area_km2: null, area_score_threshold: 50, max_relief_m: null, max_road_km: null,
  exclude_protected: false, exclude_ice_sheets: false,
};

export function configFromPreset(p: Preset, meta: Meta): AnalysisConfig {
  const params: Record<string, ParamCfg> = {};
  for (const pm of meta.parameters) {
    const w = p.weights[pm.key] ?? 0;
    params[pm.key] = {
      enabled: w > 0, weight: w > 0 ? w : 50,
      tolerance: p.tolerances?.[pm.key] ?? null,
      extra: pm.kind === 'pref' ? { ...pm.extra } : null,
    };
  }
  return {
    region: p.region, params, constraints: { ...EMPTY_CONSTRAINTS, ...p.constraints },
    constraint_mode: 'exclude', missing_mode: 'partial', min_confidence: 0, top_n: 10,
    min_separation_km: 250, preset_name: p.name,
  };
}

/** Request body actually sent: disabled params are dropped, enabled ones carry their weight. */
export function toRequest(cfg: AnalysisConfig): AnalysisConfig {
  const params: Record<string, ParamCfg> = {};
  for (const [k, v] of Object.entries(cfg.params)) if (v.enabled && v.weight > 0) params[k] = v;
  return { ...cfg, params };
}
