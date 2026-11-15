import type { AnalysisConfig, AnalyzeResponse, LocationDetail, Meta, TopLocation } from './api';


function download(name: string, data: string | Blob, type = 'text/plain') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

const csvCell = (v: any) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportCsv(top: TopLocation[], cfg: AnalysisConfig, dataMode: string) {
  const head = ['rank', 'name', 'country', 'lat', 'lon', 'score', 'confidence', 'flagged', 'failed_constraints', 'summary'];
  const rows = top.map((t) => [t.rank, t.name, t.country, t.lat, t.lon, t.score, t.confidence, t.flagged,
    t.failed_constraints.join('; '), t.summary]);
  const meta = `# TerraNova ranked locations | reference=${cfg.region} | preset=${cfg.preset_name ?? 'custom'} | data_mode=${dataMode} | ${new Date().toISOString()}`;
  download('terranova_ranking.csv', [meta, head.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n'), 'text/csv');
}

export function exportGeoJson(points: { lat: number; lon: number; props: Record<string, any> }[]) {
  const fc = {
    type: 'FeatureCollection',
    features: points.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: p.props })),
  };
  download('terranova_locations.geojson', JSON.stringify(fc, null, 2), 'application/geo+json');
}

export function exportConfig(cfg: AnalysisConfig) {
  download('terranova_config.json', JSON.stringify({ terranova_config_version: 1, ...cfg }, null, 2), 'application/json');
}

export { exportPdf } from './pdfReport';

export function loadConfigFile(file: File): Promise<AnalysisConfig> {
  return file.text().then((t) => {
    const o = JSON.parse(t);
    if (!o.region || !o.params) throw new Error('Not a TerraNova configuration file');
    delete o.terranova_config_version;
    return o as AnalysisConfig;
  });
}

export type { AnalyzeResponse };
