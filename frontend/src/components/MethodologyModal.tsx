import type { Meta } from '../lib/api';
import { QUALITY_CLASS, QUALITY_LABEL, REPRO_CLASS, REPRO_SHORT } from '../lib/format';
import { Badge, Modal } from './ui';

export default function MethodologyModal({ meta, onClose }: { meta: Meta; onClose: () => void }) {
  const pm = meta.power_meta;
  return (
    <Modal wide title="Methodology & data transparency" onClose={onClose}>
      <div className="grid gap-8 p-6 text-sm leading-relaxed text-mute-300 lg:grid-cols-2">
        <div className="space-y-4">
          <section>
            <h3 className="mb-1 font-semibold text-white">Goal</h3>
            <p>TerraNova ranks Earth locations by how well they reproduce <em>specific, user-selected</em> lunar or Martian conditions for a given test campaign — not by visual resemblance.</p>
          </section>
          <section>
            <h3 className="mb-1 font-semibold text-white">Weighted similarity</h3>
            <pre className="rounded bg-ink-850 p-3 font-mono text-xs text-mute-200">{`S(x) = Σ wᵢ · sᵢ(x) / Σ wᵢ          (0–100)
C(x) = Σ_avail wᵢ · qᵢ / Σ_enabled wᵢ  (confidence)`}</pre>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
              <li><b>Gaussian</b> sᵢ = exp(−(x−t)²/2σ²) for temperatures, irradiance, wind, aridity, AOD … σ is editable per parameter.</li>
              <li><b>Log-Gaussian</b> for scale quantities (relief, roughness, pressure), so a factor-of-two error costs the same at 10 m and 1000 m.</li>
              <li><b>Distribution overlap</b> (Bhattacharyya coefficient) between the Earth slope histogram and a log-normal target slope distribution — the whole distribution is compared, not just a mean.</li>
              <li><b>Paired Gaussian</b> for extremes (min and max both must match) and daylight (shortest and longest month).</li>
              <li><b>Preference functions</b> for logistics (road distance, protected areas) — these are not planetary properties.</li>
            </ul>
          </section>
          <section>
            <h3 className="mb-1 font-semibold text-white">Missing data & constraints</h3>
            <p className="text-xs">Missing values are never scored as zero. They are skipped and lower the confidence C(x), weighted by importance and data quality qᵢ (measured 1.0, reanalysis 0.9, modelled 0.7, proxy 0.4). Hard constraints are checked separately: violators are excluded (grey) or flagged and can never rank highly by accident. Unknown constraint values count as violations (conservative), except protected-area status which is only known for the USA.</p>
          </section>
          <section>
            <h3 className="mb-1 font-semibold text-white">What Earth cannot reproduce</h3>
            <p className="text-xs">Vacuum / Martian pressure, reduced gravity and space radiation are listed with real Earth values but excluded from scoring by default; enabling them drives every site toward 0 by construction. They need vacuum chambers, parabolic flights / offloading rigs and accelerator beam lines.</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">{Object.entries(REPRO_SHORT).map(([k, v]) => <span key={k} className={REPRO_CLASS[k]}>● {v}</span>)}</div>
          </section>
          <section>
            <h3 className="mb-1 font-semibold text-white">Data pipeline</h3>
            <p className="text-xs">`backend/scripts/build_grid.py` downloads the source datasets and reduces them to a 0.25° (~28 km) global grid. Climate layers keep their native resolution (nearest-neighbour; no fake detail). The heatmap is rendered from the computed scores of every land cell; similarity layers are cached, so moving a weight slider re-computes only the weighted sum.</p>
            {pm && <p className="mt-1 text-2xs text-mute-400">NASA POWER: {pm.merra2?.version} · {pm.merra2?.time_coverage_start?.slice(0, 10)} → {pm.merra2?.time_coverage_end?.slice(0, 10)} · grid built {meta.built}</p>}
          </section>
        </div>
        <div>
          <h3 className="mb-2 font-semibold text-white">Parameters</h3>
          <div className="space-y-2">
            {meta.parameters.map((p) => (
              <div key={p.key} className="rounded border border-ink-700 p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-mute-200">{p.label}</span>
                  <span className="flex gap-1">
                    <Badge className={QUALITY_CLASS[p.quality]}>{QUALITY_LABEL[p.quality]}</Badge>
                    <Badge className={`border-ink-600 ${REPRO_CLASS[p.repro]}`}>{REPRO_SHORT[p.repro]}</Badge>
                  </span>
                </div>
                <div className="mt-0.5 text-2xs text-mute-400">{p.method}</div>
                <div className="text-2xs text-mute-400">Source: {p.source.name} ({p.source.resolution})</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
