import { useMemo, useState } from 'react';
import { AlertOctagon, Database, EyeOff, FlaskConical, Search, Sigma, Target } from 'lucide-react';
import type { Meta, ParamMeta } from '../lib/api';
import { QUALITY_CLASS, QUALITY_LABEL, REPRO_CLASS, REPRO_SHORT } from '../lib/format';
import { Badge, Card, Modal } from './ui';
import { useT } from '../i18n';

export default function MethodologyModal({ meta, onClose }: { meta: Meta; onClose: () => void }) {
  const t = useT();
  const pm = meta.power_meta;
  const [q, setQ] = useState('');
  const grouped = useMemo(() => {
    const g: [string, ParamMeta[]][] = [];
    for (const p of meta.parameters) {
      if (q && !(`${p.label} ${p.method} ${p.source.name}`.toLowerCase().includes(q.toLowerCase()))) continue;
      const e = g.find(([c]) => c === p.category);
      if (e) e[1].push(p); else g.push([p.category, [p]]);
    }
    return g;
  }, [meta, q]);
  return (
    <Modal wide title={t('Methodology & data transparency')} onClose={onClose}>
      <div className="grid gap-6 p-6 text-sm leading-relaxed text-mute-300 lg:grid-cols-[1fr_1.05fr]">
        <div className="space-y-4">
          <Card title={t('Goal')} icon={Target}>
            <p>TerraNova ranks Earth locations by how well they reproduce <em className="text-white">specific, user-selected</em> lunar or Martian conditions for a given test campaign — not by visual resemblance.</p>
          </Card>
          <Card title={t('Weighted similarity')} icon={Sigma}>
            <pre className="overflow-x-auto rounded-lg border border-ink-700 bg-ink-925 p-3 font-mono text-xs leading-relaxed text-mute-100">{`S(x) = Σ wᵢ · sᵢ(x) / Σ wᵢ          (0–100)
C(x) = Σ_avail wᵢ · qᵢ / Σ_enabled wᵢ  (confidence)`}</pre>
            <ul className="mt-3 space-y-2 text-xs">
              {[
                [<b key="a">Gaussian</b>, ' sᵢ = exp(−(x−t)²/2σ²) for temperatures, irradiance, wind, aridity, AOD … σ is editable per parameter.'],
                [<b key="b">Log-Gaussian</b>, ' for scale quantities (relief, roughness, pressure), so a factor-of-two error costs the same at 10 m and 1000 m.'],
                [<b key="c">Distribution overlap</b>, ' (Bhattacharyya coefficient) between the Earth slope histogram and a log-normal target slope distribution — the whole distribution is compared, not just a mean.'],
                [<b key="d">Paired Gaussian</b>, ' for extremes (min and max both must match) and daylight (shortest and longest month).'],
                [<b key="e">Preference functions</b>, ' for logistics (road distance, protected areas) — these are not planetary properties.'],
              ].map(([h, t], i) => (
                <li key={i} className="flex gap-2.5 rounded-lg bg-ink-850 px-3 py-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" /><span><span className="text-white">{h}</span>{t}</span></li>
              ))}
            </ul>
          </Card>
          <Card title={t('Missing data & constraints')} icon={EyeOff}>
            <p className="text-xs">Missing values are never scored as zero. They are skipped and lower the confidence C(x), weighted by importance and data quality qᵢ (measured 1.0, reanalysis 0.9, modelled 0.7, proxy 0.4). Hard constraints are checked separately: violators are excluded (grey) or flagged and can never rank highly by accident. Unknown constraint values count as violations (conservative), except protected-area status which is only known for the USA.</p>
          </Card>
          <Card title={t('What Earth cannot reproduce')} icon={AlertOctagon}>
            <p className="text-xs">Vacuum / Martian pressure, reduced gravity and space radiation are listed with real Earth values but excluded from scoring by default; enabling them drives every site toward 0 by construction. They need vacuum chambers, parabolic flights / offloading rigs and accelerator beam lines.</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">{Object.entries(REPRO_SHORT).map(([k, v]) => (
              <span key={k} className={`rounded-full border border-ink-600 bg-ink-850 px-2 py-0.5 ${REPRO_CLASS[k]}`}>● {v}</span>
            ))}</div>
          </Card>
          <Card title={t('Data pipeline')} icon={Database}>
            <p className="text-xs">`backend/scripts/build_grid.py` downloads the source datasets and reduces them to a 0.25° (~28 km) global grid. Climate layers keep their native resolution (nearest-neighbour; no fake detail). The heatmap is rendered from the computed scores of every land cell; similarity layers are cached, so moving a weight slider re-computes only the weighted sum.</p>
            {pm && <p className="mt-2 rounded-md bg-ink-850 px-2 py-1 font-mono text-2xs text-mute-400">NASA POWER: {pm.merra2?.version} · {pm.merra2?.time_coverage_start?.slice(0, 10)} → {pm.merra2?.time_coverage_end?.slice(0, 10)} · grid built {meta.built}</p>}
          </Card>
        </div>
        <div>
          <div className="sticky top-0 z-[1] -mx-1 mb-3 flex items-center justify-between gap-3 bg-ink-900 px-1 pb-2">
            <h3 className="flex items-center gap-2 text-[13px] font-semibold text-white"><FlaskConical size={14} className="text-accent" />{t('Parameters')}</h3>
            <label className="flex items-center gap-1.5 rounded-lg border border-ink-600 bg-ink-850 px-2 py-1 text-xs focus-within:border-accent">
              <Search size={12} className="text-mute-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Filter')} className="w-28 bg-transparent text-mute-100 placeholder:text-mute-500 focus:outline-none" />
            </label>
          </div>
          <div className="space-y-4">
            {grouped.map(([cat, list]) => (
              <div key={cat}>
                <div className="mb-1.5 text-2xs font-semibold uppercase tracking-[0.12em] text-mute-400">{meta.categories[cat]}</div>
                <div className="space-y-2">
                  {list.map((p) => (
                    <div key={p.key} className="rounded-xl border border-ink-700 bg-ink-875 p-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-mute-100">{p.label}</span>
                        <span className="flex gap-1">
                          <Badge className={QUALITY_CLASS[p.quality]}>{QUALITY_LABEL[p.quality]}</Badge>
                          <Badge className={`border-ink-600 ${REPRO_CLASS[p.repro]}`}>{REPRO_SHORT[p.repro]}</Badge>
                        </span>
                      </div>
                      <div className="mt-1.5 text-2xs leading-relaxed text-mute-400">{p.method}</div>
                      <div className="mt-1 text-2xs text-mute-500">Source: {p.source.name} ({p.source.resolution})</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
