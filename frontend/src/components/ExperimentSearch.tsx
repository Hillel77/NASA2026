import { ReactNode, useMemo, useState } from 'react';
import { Bot, CornerDownLeft, Search, Sparkles, X } from 'lucide-react';
import type { ExecutionPlan, LlmAnswer, LocationDetail, Meta, Verification } from '../lib/api';
import { api } from '../lib/api';
import { fmtNum, fmtValue } from '../lib/format';
import { useI18n } from '../i18n';
import { Spinner } from './ui';

/**
 * Mini search engine for questions about the experiment. It is fully independent of any
 * external service: it indexes everything known about the selected location (comparison
 * rows, parameter definitions, explanation, execution plan, NASA verification, limitations,
 * sources) plus data-derived FAQ answers, and ranks them with BM25. If Claude is configured
 * on the backend, the same question can also be sent to it for a written answer.
 */
interface Doc { id: string; kind: string; title: string; text: string }

const STOP = new Set('a an and are as at be by can do does for from how i in is it its of on or should that the this to was we what when where which who why will with my our you your me us site location test experiment there their than then'.split(' '));
const tok = (s: string) => (s.toLowerCase().normalize('NFKD').match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length > 1 && !STOP.has(w));

function buildDocs(d: LocationDetail, meta: Meta, ex: ExecutionPlan | null, ver: Verification | null): Doc[] {
  const docs: Doc[] = [];
  const pm = Object.fromEntries(meta.parameters.map((p) => [p.key, p]));
  for (const r of d.rows) {
    const p = pm[r.key];
    docs.push({
      id: `p-${r.key}`, kind: 'Parameter', title: r.label,
      text: `${p?.description ?? ''} Target ${fmtValue(r.target?.value, r.unit)} (${r.target?.source ?? 'n/a'}). Earth here ${r.earth_available ? fmtValue(r.earth, r.unit) : 'unavailable'}. `
        + `Similarity ${r.similarity === null ? 'n/a' : `${(r.similarity * 100).toFixed(0)}%`}. ${r.repro_label}. ${r.enabled ? `Enabled, weight ${r.weight}.` : 'Not enabled.'} `
        + `Method: ${r.method} Source: ${r.source.name}, ${r.source.resolution}.`,
    });
  }
  d.explanation.forEach((e, i) => docs.push({ id: `e-${i}`, kind: 'Explanation', title: 'Why this location', text: e }));
  d.limitations.forEach((l, i) => docs.push({ id: `l-${i}`, kind: 'Limitation', title: 'Limitation', text: l }));
  docs.push({ id: 'cat', kind: 'Scores', title: 'Category scores', text: Object.entries(d.category_scores).map(([k, v]) => `${k}: ${fmtNum(v, 0)}/100`).join('; ') });
  docs.push({
    id: 'terrain', kind: 'Terrain', title: 'Terrain and land cover',
    text: `Mean elevation ${fmtNum(d.terrain.elev_mean)} m, relief ${fmtNum(d.terrain.relief_m)} m, slope median ${fmtNum(d.terrain.slope_p50)}° p90 ${fmtNum(d.terrain.slope_p90)}°, roughness ${fmtNum(d.terrain.rough_m)} m. Bare ground ${fmtNum((d.landcover.bare ?? 0) * 100, 0)}%, vegetation ${fmtNum((d.landcover.vegetation ?? 0) * 100, 0)}%.`,
  });
  docs.push({
    id: 'access', kind: 'Logistics', title: 'Access and logistics (how to get there)',
    text: `Nearest major road ${fmtNum(d.logistics.dist_road_km)} km. Nearest town ${d.nearest_place ?? ''} ${fmtNum(d.logistics.dist_place_km)} km. Nearest city over 100k ${fmtNum(d.logistics.dist_city100k_km)} km. Travel, transport, vehicles, permits.`,
  });
  if (ex) {
    if (ex.best_window) docs.push({ id: 'window', kind: 'Execution', title: 'Best time / season to test (when)', text: `Best testing window ${ex.best_window.label}: climate match ${ex.best_window.score}/100 versus ${ex.best_window.annual}/100 annual average, based on ${ex.monthly_params.map((p) => p.label).join(", ")}. Month schedule timing season.` });
    ex.steps.forEach((s, i) => docs.push({ id: `s-${i}`, kind: 'Execution', title: s.phase, text: s.text }));
    ex.gaps.forEach((g) => docs.push({ id: `g-${g.key}`, kind: 'Mitigation', title: `${g.label} gap (${g.similarity}% similarity)`, text: `${g.mitigation} Equipment chamber lab supplement.` }));
    ex.adjustments.forEach((a, i) => docs.push({ id: `a-${i}`, kind: 'Readjustment', title: a.title, text: a.reason }));
  }
  if (ver) {
    docs.push({ id: 'ver', kind: 'NASA verification', title: `NASA verification: ${ver.status}`, text: `${ver.summary} ${ver.note ?? ''} Source ${ver.source ?? ''}. Verified validated checked NASA POWER official data.` });
    ver.rows.forEach((r) => docs.push({ id: `v-${r.variable}`, kind: 'NASA verification', title: r.label, text: `TerraNova ${fmtNum(r.terranova)} ${r.unit}, NASA ${fmtNum(r.nasa)} ${r.unit}, difference ${fmtNum(r.difference)}; ${r.status}.` }));
  }
  const nonrep = d.rows.filter((r) => r.repro === 'laboratory' || r.repro === 'impossible');
  docs.push({ id: 'faq-nonrep', kind: 'FAQ', title: 'What cannot be reproduced at this site?', text: `${nonrep.map((r) => r.label).join(', ')} cannot be reproduced outdoors; use vacuum chambers, parabolic flights or offloading rigs, and radiation beam lines. Lab laboratory gravity vacuum radiation pressure.` });
  const weights = d.rows.filter((r) => r.enabled).sort((a, b) => b.weight - a.weight);
  docs.push({ id: 'faq-weights', kind: 'FAQ', title: 'Which parameters matter most in this experiment?', text: `Highest weights: ${weights.slice(0, 5).map((r) => `${r.label} (${r.weight})`).join(', ')}. Important priority relevant.` });
  docs.push({ id: 'faq-conf', kind: 'FAQ', title: 'How reliable is this score?', text: `Score ${fmtNum(d.score)}/100 with data confidence ${fmtNum(d.confidence, 0)}%. Proxy parameters: ${d.rows.filter((r) => r.enabled && r.quality === 'proxy').map((r) => r.label).join(', ') || 'none'}. Reliability accuracy uncertainty trust confidence.` });
  return docs;
}

function rank(docs: Doc[], q: string) {
  const qt = tok(q);
  if (!qt.length) return [];
  const toks = docs.map((d) => ({ d, title: tok(d.title), body: tok(d.text) }));
  const N = toks.length;
  const avg = toks.reduce((s, x) => s + x.body.length + x.title.length, 0) / Math.max(N, 1);
  const df = (term: string) => toks.filter((x) => x.title.some((w) => w.startsWith(term)) || x.body.some((w) => w.startsWith(term))).length;
  const idf = Object.fromEntries(qt.map((q) => [q, Math.log(1 + (N - df(q) + 0.5) / (df(q) + 0.5))]));
  return toks.map((x) => {
    const len = x.body.length + x.title.length;
    let s = 0;
    for (const term of qt) {
      const f = x.body.filter((w) => w.startsWith(term)).length + 2.5 * x.title.filter((w) => w.startsWith(term)).length;
      if (f) s += idf[term] * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * len / avg));
    }
    return { doc: x.d, score: s };
  }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
}

function highlight(text: string, q: string): ReactNode {
  const terms = tok(q);
  if (!terms.length) return text;
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return text.split(re).map((p, i) => (i % 2 ? <mark key={i} className="rounded bg-accent/25 px-0.5 text-white">{p}</mark> : p));
}

export default function ExperimentSearch({ d, meta, rid, execution, verification }: {
  d: LocationDetail; meta: Meta; rid: string; execution: ExecutionPlan | null; verification: Verification | null;
}) {
  const { t, lang } = useI18n();
  const [q, setQ] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [ai, setAi] = useState<LlmAnswer | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const docs = useMemo(() => buildDocs(d, meta, execution, verification), [d, meta, execution, verification]);
  const results = useMemo(() => rank(docs, submitted), [docs, submitted]);
  const suggestions = [t('When is the best time to test?'), t('What cannot be reproduced here?'), t('How reliable is this score?'),
    t('How do we get there?'), t('Dust and soil conditions'), t('Is the data verified by NASA?')];
  const EN_SUGG = ['When is the best time to test?', 'What cannot be reproduced here?', 'How reliable is this score?', 'How do we get there?', 'Dust and soil conditions', 'Is the data verified by NASA?'];
  const run = (text: string, enText?: string) => { setQ(text); setSubmitted(enText ?? text); setAi(null); };
  const askAi = () => {
    if (!q.trim()) return;
    setAiLoading(true);
    api.ask(rid, q.trim(), lang, d.lat, d.lon).then(setAi).catch((e) => setAi({ available: false, error: String(e.message ?? e) })).finally(() => setAiLoading(false));
  };

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-875 p-4 shadow-panel">
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-accent/10 text-accent"><Search size={13} /></span>
        <div>
          <div className="text-[13px] font-semibold text-mute-100">{t('Ask about this experiment')}</div>
          <div className="text-2xs text-mute-400">{t('Searches everything TerraNova knows about this location and plan')}{meta.llm?.available ? ` · ${t('or ask Claude')}` : ''}</div>
        </div>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); run(q); }} className="flex items-center gap-2 rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 focus-within:border-accent">
        <Search size={14} className="shrink-0 text-mute-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('e.g. When should we test? What limits this site?')}
          className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-mute-500 focus:outline-none" aria-label={t('Ask about this experiment')} />
        {q && <button type="button" onClick={() => { setQ(''); setSubmitted(''); setAi(null); }} className="text-mute-500 hover:text-white" aria-label="Clear"><X size={14} /></button>}
        <button type="submit" className="flex items-center gap-1 rounded-md bg-ink-750 px-2 py-1 text-2xs text-mute-200 hover:bg-ink-700"><CornerDownLeft size={11} />{t('Search')}</button>
        {meta.llm?.available && (
          <button type="button" onClick={askAi} disabled={aiLoading || !q.trim()} className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-2xs font-semibold text-ink-950 disabled:opacity-50">
            {aiLoading ? <Spinner /> : <Sparkles size={11} />}{t('Ask AI')}</button>
        )}
      </form>
      {!submitted && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {suggestions.map((s, i) => (
            <button key={s} onClick={() => run(s, EN_SUGG[i])} className="rounded-full border border-ink-600 bg-ink-850 px-2.5 py-0.5 text-2xs text-mute-300 hover:border-accent hover:text-white">{s}</button>
          ))}
        </div>
      )}
      {ai && (
        <div className="mt-3 rounded-lg border border-accent/30 bg-accent/[0.06] p-3">
          <div className="mb-1 flex items-center gap-1.5 text-2xs font-semibold text-accent"><Bot size={12} />{t('Claude answer')}{ai.model ? ` · ${ai.model}` : ''}</div>
          {ai.available ? <div className="whitespace-pre-wrap text-xs leading-relaxed text-mute-100">{ai.text}</div> : <div className="text-2xs text-amber-300">{ai.error}</div>}
        </div>
      )}
      {submitted && (
        <div className="mt-3 space-y-1.5">
          {results.length === 0 && <div className="text-2xs text-mute-400">{t('No matching information. Try other words or a suggested question.')}</div>}
          {results.map(({ doc }) => (
            <div key={doc.id} className="rounded-lg border border-ink-700 bg-ink-850 p-2.5">
              <div className="flex items-center gap-2">
                <span className="rounded bg-ink-700 px-1.5 text-2xs text-mute-300">{t(doc.kind)}</span>
                <span className="text-xs font-medium text-mute-100">{highlight(doc.title, submitted)}</span>
              </div>
              <p className="mt-1 text-2xs leading-relaxed text-mute-300">{highlight(doc.text, submitted)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
