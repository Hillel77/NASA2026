/**
 * TerraNova location report (PDF).
 *
 * Layout: cover band with score badge -> key-figure cards -> summary & category scores ->
 * monthly temperature chart -> environmental comparison table (grouped by category, with
 * similarity bars) -> execution plan -> NASA verification -> sources, method, limitations.
 * Every page carries a running header and a footer with page numbers and the data mode.
 *
 * The built-in PDF fonts cover Latin-1 only, so the report is written in English and a few
 * symbols (σ, Σ, ≈, ≤ …) are transliterated by `clean()`.
 */
import type { AnalysisConfig, DetailRow, ExecutionPlan, LocationDetail, Meta, Verification } from './api';
import { fmtDiff, fmtValue } from './format';

type RGB = [number, number, number];
const NAVY: RGB = [11, 18, 32];
const INK: RGB = [24, 32, 46];
const MUTED: RGB = [96, 108, 126];
const LINE: RGB = [222, 227, 235];
const PANEL: RGB = [244, 246, 250];
const ACCENT: RGB = [43, 108, 176];
const WHITE: RGB = [255, 255, 255];
const C_BLUE: RGB = [57, 135, 229];
const C_ORANGE: RGB = [217, 89, 38];
const C_AQUA: RGB = [25, 158, 112];

const RAMP: [number, RGB][] = [[0, [165, 30, 40]], [30, [215, 75, 45]], [50, [222, 165, 40]], [70, [120, 175, 60]], [100, [20, 140, 75]]];
function scoreRgb(v: number | null | undefined): RGB {
  if (v === null || v === undefined || !isFinite(v)) return [140, 146, 158];
  const x = Math.max(0, Math.min(100, v));
  for (let i = 1; i < RAMP.length; i++) {
    const [x1, c1] = RAMP[i];
    const [x0, c0] = RAMP[i - 1];
    if (x <= x1) { const t = (x - x0) / (x1 - x0); return c0.map((c, k) => Math.round(c + t * (c1[k] - c))) as RGB; }
  }
  return RAMP[RAMP.length - 1][1];
}

const MAP: [RegExp, string][] = [[/σ/g, 'sigma'], [/Σ/g, 'Sum '], [/≈/g, '~'], [/≤/g, '<='], [/≥/g, '>='], [/−/g, '-'], [/→/g, '->'], [/✓/g, ''],
  [/ᵢ/g, 'i'], [/₂/g, '2'], [/⁻¹/g, '^-1'], [/⁻/g, '-'], [/[‘’]/g, "'"], [/[“”]/g, '"'], [/…/g, '...'], [/τ/g, 'tau'], [/µ/g, 'u'], [/ /g, ' ']];
export function clean(s: any): string {
  let o = s === null || s === undefined ? '' : String(s);
  for (const [r, v] of MAP) o = o.replace(r, v);
  return o.replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF–—•]/g, '');
}

export async function exportPdf(d: LocationDetail, cfg: AnalysisConfig, meta: Meta,
  extra: { plan?: ExecutionPlan | null; verification?: Verification | null } = {}) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  const CW = W - 2 * M;
  let y = 0;

  const color = (c: RGB, kind: 'text' | 'fill' | 'draw' = 'text') =>
    kind === 'text' ? doc.setTextColor(...c) : kind === 'fill' ? doc.setFillColor(...c) : doc.setDrawColor(...c);
  const font = (size: number, style: 'normal' | 'bold' | 'italic' = 'normal', c: RGB = INK) => {
    doc.setFont('helvetica', style); doc.setFontSize(size); color(c);
  };
  const ensure = (h: number) => { if (y + h > H - 56) { doc.addPage(); y = 64; } };
  const para = (txt: string, size = 9.5, c: RGB = INK, gap = 4, x = M, w = CW) => {
    font(size, 'normal', c);
    for (const line of doc.splitTextToSize(clean(txt), w) as string[]) { ensure(size * 1.4); doc.text(line, x, y); y += size * 1.42; }
    y += gap;
  };
  const section = (title: string, kicker?: string) => {
    ensure(48);
    y += 8;
    color(ACCENT, 'fill'); doc.rect(M, y - 10, 3, 14, 'F');
    font(13, 'bold', NAVY); doc.text(clean(title), M + 10, y + 1);
    if (kicker) { font(8.5, 'normal', MUTED); doc.text(clean(kicker), W - M, y + 1, { align: 'right' }); }
    y += 16;
  };

  // ------------------------------------------------------------------ cover band
  color(NAVY, 'fill'); doc.rect(0, 0, W, 150, 'F');
  color([22, 34, 56], 'fill'); doc.rect(0, 150, W, 4, 'F');
  font(9, 'bold', [120, 170, 230]); doc.text('TERRANOVA  ·  PLANETARY ANALOG SITE REPORT', M, 38);
  font(22, 'bold', WHITE); doc.text(doc.splitTextToSize(clean(d.name), CW - 120)[0], M, 72);
  font(10.5, 'normal', [200, 210, 225]);
  doc.text(clean(`${d.country}  ·  ${Math.abs(d.lat).toFixed(3)}°${d.lat >= 0 ? 'N' : 'S'}, ${Math.abs(d.lon).toFixed(3)}°${d.lon >= 0 ? 'E' : 'W'}  ·  0.25° cell`), M, 92);
  doc.text(clean(`Reference: ${d.target.name}`), M, 110);
  doc.text(clean(`Experiment: ${cfg.preset_name ?? 'Custom'}${cfg.season_months ? `  ·  Test season: ${cfg.season_months.map((m) => 'JFMAMJJASOND'[m - 1]).join('')}` : ''}`), M, 126);
  // score badge
  const bx = W - M - 46, by = 76, sc = scoreRgb(d.score);
  color(sc, 'fill'); doc.circle(bx, by, 40, 'F');
  color(NAVY, 'fill'); doc.circle(bx, by, 33, 'F');
  font(20, 'bold', WHITE); doc.text(d.score === null ? '-' : d.score.toFixed(0), bx, by + 5, { align: 'center' });
  font(7.5, 'normal', [180, 190, 205]); doc.text('/ 100', bx, by + 17, { align: 'center' });
  font(7.5, 'bold', [180, 190, 205]); doc.text('COMPATIBILITY', bx, by + 54, { align: 'center' });

  // ------------------------------------------------------------------ key-figure cards
  y = 178;
  const ver = extra.verification;
  const cards: [string, string, RGB][] = [
    ['Compatibility', d.score === null ? '-' : `${d.score.toFixed(1)} / 100`, sc],
    ['Data confidence', d.confidence === null ? '-' : `${d.confidence.toFixed(0)} %`, ACCENT],
    ['Status', clean(d.status), d.status === 'ok' ? [20, 140, 75] : [200, 120, 20]],
    ['NASA verification', ver ? ({ verified: 'Verified', discrepancies: 'Discrepancies', unavailable: 'Not verified' } as const)[ver.status] : 'Not run',
      ver?.status === 'verified' ? [20, 140, 75] : ver?.status === 'discrepancies' ? [200, 120, 20] : MUTED],
  ];
  const cw = (CW - 3 * 10) / 4;
  cards.forEach(([k, v, c], i) => {
    const x = M + i * (cw + 10);
    color(PANEL, 'fill'); doc.roundedRect(x, y, cw, 50, 6, 6, 'F');
    color(c, 'fill'); doc.rect(x, y + 8, 2.5, 34, 'F');
    font(7.5, 'bold', MUTED); doc.text(k.toUpperCase(), x + 12, y + 18);
    font(13, 'bold', c); doc.text(clean(v), x + 12, y + 38);
  });
  y += 72;
  if (d.data_mode === 'demo') {
    color([255, 243, 214], 'fill'); doc.roundedRect(M, y - 10, CW, 22, 4, 4, 'F');
    font(8.5, 'bold', [150, 90, 0]); doc.text('DEMO MODE: SYNTHETIC DATA - NOT MEASUREMENTS', M + 10, y + 4); y += 24;
  }

  // ------------------------------------------------------------------ summary
  section('Summary', 'Generated from measured values');
  const [lead, ...rest] = d.explanation;
  para(lead ?? '', 10.5, NAVY, 6);
  rest.forEach((e) => para(e, 9.2, INK, 3));
  if (d.failed_constraints.length) para(`Constraint violations: ${d.failed_constraints.join('; ')}`, 9, [170, 60, 40]);

  // ------------------------------------------------------------------ category scores
  section('Category scores');
  for (const [k, v] of Object.entries(d.category_scores)) {
    ensure(18);
    font(9, 'normal', INK); doc.text(clean(k), M, y + 4);
    const bx0 = M + 120, bw = CW - 170;
    color([230, 234, 241], 'fill'); doc.roundedRect(bx0, y - 3, bw, 8, 4, 4, 'F');
    color(scoreRgb(v), 'fill'); doc.roundedRect(bx0, y - 3, Math.max(4, bw * (v ?? 0) / 100), 8, 4, 4, 'F');
    font(9, 'bold', INK); doc.text(v === null ? '-' : v.toFixed(0), W - M, y + 4, { align: 'right' });
    y += 17;
  }

  // ------------------------------------------------------------------ monthly temperature chart
  const t2m = d.monthly.t2m as (number | null)[] | null;
  if (t2m) {
    section('Monthly temperature', 'NASA POWER MERRA-2, 2001-2020');
    ensure(170);
    const ch = 130, x0 = M + 30, x1 = W - M - 10, y0 = y + 6, y1 = y0 + ch;
    const series: [string, (number | null)[] | null, RGB][] = [
      ['Mean daily max', d.monthly.t2m_max as any, C_ORANGE], ['Mean', t2m, C_BLUE], ['Mean daily min', d.monthly.t2m_min as any, C_AQUA]];
    const tm = d.rows.find((r) => r.key === 'temp_mean')?.target?.value as number | undefined;
    const all = series.flatMap(([, s]) => (s ?? []).filter((v): v is number => v !== null)).concat(tm !== undefined ? [tm] : []);
    let lo = Math.floor(Math.min(...all) / 10) * 10, hi = Math.ceil(Math.max(...all) / 10) * 10;
    if (hi === lo) hi = lo + 10;
    const X = (i: number) => x0 + (i / 11) * (x1 - x0);
    const Y = (v: number) => y1 - ((v - lo) / (hi - lo)) * ch;
    doc.setLineWidth(0.5);
    for (let v = lo; v <= hi; v += 10) {
      color(LINE, 'draw'); doc.line(x0, Y(v), x1, Y(v));
      font(7, 'normal', MUTED); doc.text(`${v}°`, x0 - 6, Y(v) + 2.5, { align: 'right' });
    }
    (d.monthly.months as string[]).forEach((m, i) => { font(7, 'normal', MUTED); doc.text(m, X(i), y1 + 11, { align: 'center' }); });
    if (tm !== undefined) {
      color([90, 100, 115], 'draw'); doc.setLineDashPattern([3, 2], 0); doc.line(x0, Y(tm), x1, Y(tm)); doc.setLineDashPattern([], 0);
      font(7, 'italic', MUTED); doc.text(`target mean ${tm}°C`, x1, Y(tm) - 3, { align: 'right' });
    }
    doc.setLineWidth(1.6);
    for (const [, s, c] of series) {
      if (!s) continue;
      color(c, 'draw');
      for (let i = 1; i < 12; i++) if (s[i - 1] !== null && s[i] !== null) doc.line(X(i - 1), Y(s[i - 1]!), X(i), Y(s[i]!));
    }
    doc.setLineWidth(0.5);
    let lx = x0;
    for (const [n, , c] of series) { color(c, 'fill'); doc.rect(lx, y1 + 20, 10, 3, 'F'); font(7.5, 'normal', INK); doc.text(n, lx + 14, y1 + 23.5); lx += 110; }
    y = y1 + 36;
  }

  // ------------------------------------------------------------------ comparison table
  doc.addPage(); y = 64;
  section('Environmental comparison', `vs. ${d.target.name}`);
  const groups: [string, DetailRow[]][] = [];
  for (const r of d.rows) { const g = groups.find(([c]) => c === r.category); if (g) g[1].push(r); else groups.push([r.category, [r]]); }
  const body: any[] = [];
  const simByRow: (number | null)[] = [];
  for (const [cat, rows] of groups) {
    body.push([{ content: clean(meta.categories[cat] ?? cat).toUpperCase(), colSpan: 7, styles: { fillColor: [235, 239, 246], textColor: NAVY, fontStyle: 'bold', fontSize: 7.5 } }]);
    simByRow.push(null);
    for (const r of rows) {
      body.push([
        clean(`${r.label}${r.enabled ? `\nweight ${r.weight}` : r.not_applicable ? '\nnot applicable' : '\ndisabled'}`),
        clean(r.target ? `${fmtValue(r.target.value, r.unit)}\n${r.target.quality}` : 'n/a'),
        clean(r.earth_available ? `${fmtValue(r.earth, r.unit)}\n${r.quality}` : 'unavailable'),
        clean(fmtDiff(r.difference)),
        r.similarity === null ? '-' : `${(r.similarity * 100).toFixed(0)}%`,
        clean(r.repro_label.replace('Directly reproducible at field sites', 'Field-reproducible').replace('Partially reproducible outdoors', 'Partial')
          .replace('Requires laboratory simulation', 'Lab only').replace('Cannot be realistically reproduced on Earth', 'Not reproducible')),
        clean(`${r.source.name}`),
      ]);
      simByRow.push(r.similarity);
    }
  }
  autoTable(doc, {
    startY: y, margin: { left: M, right: M, top: 64, bottom: 56 },
    head: [['Parameter', 'Target', 'Earth', 'Difference', 'Similarity', 'Reproducibility', 'Data source']],
    body,
    styles: { font: 'helvetica', fontSize: 7.4, cellPadding: { top: 4, bottom: 4, left: 4, right: 4 }, textColor: INK, lineColor: LINE, lineWidth: 0.4, valign: 'top' },
    headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 7.6 },
    alternateRowStyles: { fillColor: [250, 251, 253] },
    rowPageBreak: 'avoid',
    columnStyles: { 0: { cellWidth: 92, fontStyle: 'bold' }, 1: { cellWidth: 70 }, 2: { cellWidth: 70 }, 3: { cellWidth: 50 }, 4: { cellWidth: 60 }, 5: { cellWidth: 74 }, 6: { cellWidth: 'auto', textColor: MUTED, fontSize: 6.6 } },
    didDrawCell: (h: any) => {
      if (h.section !== 'body' || h.column.index !== 4) return;
      const v = simByRow[h.row.index];
      if (v === null || v === undefined) return;
      const bx = h.cell.x + 26, bwid = h.cell.width - 30, byy = h.cell.y + 6.5;
      doc.setFillColor(230, 234, 241); doc.roundedRect(bx, byy, bwid, 4, 2, 2, 'F');
      doc.setFillColor(...scoreRgb(v * 100)); doc.roundedRect(bx, byy, Math.max(2, bwid * v), 4, 2, 2, 'F');
    },
  });
  y = (doc as any).lastAutoTable.finalY + 16;

  // ------------------------------------------------------------------ execution plan
  const plan = extra.plan;
  if (plan) {
    section('Experiment execution plan', plan.best_window ? `Best window: ${plan.best_window.label}` : undefined);
    if (plan.best_window) para(`Best testing window ${plan.best_window.label}: climate match ${plan.best_window.score.toFixed(0)}/100 vs. ${plan.best_window.annual.toFixed(0)}/100 annual average.`, 9.5, NAVY);
    plan.steps.forEach((s, i) => {
      ensure(30);
      color(ACCENT, 'fill'); doc.circle(M + 7, y - 3, 7, 'F');
      font(7.5, 'bold', WHITE); doc.text(String(i + 1), M + 7, y - 0.5, { align: 'center' });
      font(9, 'bold', NAVY); doc.text(clean(s.phase), M + 20, y);
      y += 12;
      para(s.text, 8.8, INK, 4, M + 20, CW - 20);
    });
    if (plan.gaps.length) {
      autoTable(doc, {
        startY: y, margin: { left: M, right: M, top: 64, bottom: 56 },
        head: [['Gap at this site', 'Similarity', 'How to cover it']],
        body: plan.gaps.map((g) => [clean(g.label), `${g.similarity.toFixed(0)}%`, clean(g.mitigation)]),
        styles: { fontSize: 7.8, cellPadding: 4, textColor: INK, lineColor: LINE, lineWidth: 0.4 },
        headStyles: { fillColor: [235, 239, 246], textColor: NAVY, fontStyle: 'bold' },
        rowPageBreak: 'avoid',
        columnStyles: { 0: { cellWidth: 120, fontStyle: 'bold' }, 1: { cellWidth: 58 } },
      });
      y = (doc as any).lastAutoTable.finalY + 14;
    }
  }

  // ------------------------------------------------------------------ NASA verification
  if (ver) {
    section('NASA data verification', ver.checked_at ?? undefined);
    const vc: RGB = ver.status === 'verified' ? [20, 140, 75] : ver.status === 'discrepancies' ? [200, 120, 20] : MUTED;
    ensure(30);
    color(vc, 'fill'); doc.roundedRect(M, y - 10, CW, 24, 5, 5, 'F');
    font(9.5, 'bold', WHITE); doc.text(clean(ver.status === 'verified' ? 'VERIFIED AGAINST NASA' : ver.status === 'discrepancies' ? 'DISCREPANCIES FOUND' : 'COULD NOT VERIFY'), M + 10, y + 5);
    y += 24;
    para(ver.summary, 9, INK, 2);
    if (ver.source) para(`Source: ${ver.source}`, 8, MUTED, 4);
    if (ver.rows.length) {
      autoTable(doc, {
        startY: y, margin: { left: M, right: M, top: 64, bottom: 56 },
        head: [['Variable', 'TerraNova', 'NASA', 'Difference', 'Tolerance', 'Result']],
        body: ver.rows.map((r) => [clean(r.label), r.terranova === null ? '-' : `${r.terranova} ${clean(r.unit)}`, r.nasa === null ? '-' : `${r.nasa} ${clean(r.unit)}`,
          r.difference === undefined ? '-' : String(r.difference), r.tolerance === undefined ? '-' : `+/- ${r.tolerance}`, r.status === 'not_available' ? 'n/a' : r.status]),
        styles: { fontSize: 7.8, cellPadding: 4, textColor: INK, lineColor: LINE, lineWidth: 0.4 },
        headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold' },
        rowPageBreak: 'avoid',
        didParseCell: (h: any) => {
          if (h.section === 'body' && h.column.index === 5) {
            h.cell.styles.fontStyle = 'bold';
            h.cell.styles.textColor = h.cell.raw === 'match' ? [20, 140, 75] : h.cell.raw === 'mismatch' ? [200, 120, 20] : MUTED;
          }
        },
      });
      y = (doc as any).lastAutoTable.finalY + 14;
    }
  }

  // ------------------------------------------------------------------ sources, method, limitations
  section('Data sources');
  const srcs = new Map<string, DetailRow['source']>();
  d.rows.forEach((r) => srcs.set(r.source.name, r.source));
  srcs.forEach((s) => para(`•  ${s.name} — ${s.resolution}${s.period ? `, ${s.period}` : ''}${s.url ? ` — ${s.url}` : ''}`, 8.2, INK, 1));
  const tsrc = new Set(d.rows.map((r) => r.target?.source).filter(Boolean) as string[]);
  y += 4;
  para('Planetary reference values (literature):', 8.6, NAVY, 1);
  tsrc.forEach((s) => para(`•  ${s}`, 7.8, MUTED, 0));
  section('Method');
  para('S(x) = Sum(w_i * s_i(x)) / Sum(w_i) over enabled parameters with data; s_i are parameter-specific similarity functions (Gaussian, log-Gaussian, Bhattacharyya overlap of slope distributions, preference functions). Confidence C(x) = Sum over available parameters of w_i * q_i / Sum over enabled parameters of w_i, where q_i is the data-quality factor. Hard constraints exclude or flag cells independently of S.', 8.6);
  if (cfg.season_months) para(`Climate parameters were scored for a test season (months ${cfg.season_months.join(', ')}) using NASA POWER monthly climatology.`, 8.6);
  section('Limitations');
  d.limitations.forEach((l) => para(`•  ${l}`, 8.4, INK, 1));
  para('•  Non-reproducible conditions (vacuum / low pressure, reduced gravity, space radiation) are not represented by any terrestrial field site.', 8.4, INK, 1);

  // ------------------------------------------------------------------ running header & footer on every page
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    if (i > 1) {
      color(NAVY, 'fill'); doc.rect(0, 0, W, 34, 'F');
      font(8, 'bold', [120, 170, 230]); doc.text('TERRANOVA', M, 21);
      font(8, 'normal', [200, 210, 225]); doc.text(clean(`${d.name}, ${d.country}  ·  vs. ${d.target.name}`), W - M, 21, { align: 'right' });
    }
    color(LINE, 'draw'); doc.setLineWidth(0.5); doc.line(M, H - 38, W - M, H - 38);
    font(7.5, 'normal', MUTED);
    doc.text(clean(`Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC  ·  data mode: ${d.data_mode.toUpperCase()}  ·  NASA Space Apps Challenge 2026`), M, H - 24);
    doc.text(`Page ${i} of ${n}`, W - M, H - 24, { align: 'right' });
  }
  doc.save(`terranova_${d.name.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.pdf`);
}
