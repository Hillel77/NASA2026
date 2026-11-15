import type { AnalysisConfig, AnalyzeResponse, LocationDetail, Meta, TopLocation } from './api';
import { fmtDiff, fmtValue } from './format';

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

export async function exportPdf(d: LocationDetail, cfg: AnalysisConfig, meta: Meta) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  let y = 48;
  const line = (txt: string, size = 9, bold = false, color = [20, 20, 20]) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    const parts = doc.splitTextToSize(txt, W - 96);
    for (const p of parts) {
      if (y > 790) { doc.addPage(); y = 48; }
      doc.text(p, 48, y);
      y += size * 1.35;
    }
  };
  line('TerraNova — Planetary analog site report', 16, true);
  line(`Generated ${new Date().toISOString()} · data mode: ${d.data_mode.toUpperCase()}${d.data_mode === 'demo' ? ' (SYNTHETIC DATA – NOT MEASUREMENTS)' : ''}`, 8, false, [90, 90, 90]);
  y += 6;
  line(`${d.name}, ${d.country}`, 13, true);
  line(`Cell centre ${d.lat.toFixed(3)}°, ${d.lon.toFixed(3)}° (0.25° cell)   Reference: ${d.target.name}   Experiment: ${cfg.preset_name ?? 'Custom'}`);
  line(`Compatibility score: ${d.score?.toFixed(1) ?? '—'} / 100    Data confidence: ${d.confidence?.toFixed(0) ?? '—'} %    Status: ${d.status}`, 10, true);
  if (d.failed_constraints.length) line('Constraint violations: ' + d.failed_constraints.join('; '), 9, false, [160, 40, 40]);
  y += 6;
  line('Explanation', 11, true);
  d.explanation.forEach((e) => line(e));
  y += 6;
  line('Environmental comparison', 11, true);
  const cols = [48, 210, 300, 390, 450, 500];
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  ['Parameter', 'Target', 'Earth', 'Difference', 'Similarity', 'Quality'].forEach((h, i) => doc.text(h, cols[i], y));
  y += 11;
  doc.setFont('helvetica', 'normal');
  for (const r of d.rows) {
    if (y > 790) { doc.addPage(); y = 48; }
    const vals = [
      `${r.label}${r.enabled ? ` (w=${r.weight})` : ''}`,
      r.target ? fmtValue(r.target.value, r.unit) : 'n/a',
      fmtValue(r.earth, r.unit),
      fmtDiff(r.difference),
      r.similarity === null ? '—' : `${(r.similarity * 100).toFixed(0)}%`,
      `${r.quality}; ${r.repro}`,
    ];
    vals.forEach((v, i) => doc.text(doc.splitTextToSize(String(v), (cols[i + 1] ?? W - 40) - cols[i] - 4)[0] ?? '', cols[i], y));
    y += 10;
  }
  y += 8;
  line('Data sources', 11, true);
  const used = new Set(d.rows.map((r) => r.source.name));
  used.forEach((s) => {
    const src = d.rows.find((r) => r.source.name === s)!.source;
    line(`• ${src.name} — ${src.resolution}${src.period ? `, ${src.period}` : ''}${src.url ? ` — ${src.url}` : ''}`, 8);
  });
  line('Planetary reference values: see per-parameter citations in the TerraNova UI (LRO Diviner/LOLA, MGS MOLA, THEMIS, MSL REMS, Mars 2020 MEDA, InSight TWINS, Viking, MSL RAD, Chang\'e-4 LND).', 8);
  y += 6;
  line('Method', 11, true);
  line('S(x) = Σ w_i s_i(x) / Σ w_i over enabled parameters with data; s_i are parameter-specific similarity functions (Gaussian, log-Gaussian, Bhattacharyya overlap of slope distributions, preference functions). Confidence = Σ w_i q_i (available) / Σ w_i (enabled), q_i = data-quality factor. Hard constraints exclude or flag cells independently of S.', 8);
  y += 6;
  line('Limitations', 11, true);
  d.limitations.forEach((l) => line('• ' + l, 8));
  line('Non-reproducible conditions (vacuum / low pressure, reduced gravity, space radiation) are not represented by any terrestrial field site.', 8);
  doc.save(`terranova_${d.name.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.pdf`);
}

export function loadConfigFile(file: File): Promise<AnalysisConfig> {
  return file.text().then((t) => {
    const o = JSON.parse(t);
    if (!o.region || !o.params) throw new Error('Not a TerraNova configuration file');
    delete o.terranova_config_version;
    return o as AnalysisConfig;
  });
}

export type { AnalyzeResponse };
