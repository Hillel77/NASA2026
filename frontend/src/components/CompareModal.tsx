import { useEffect, useState } from 'react';
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Radar as RadarIcon, Table2 } from 'lucide-react';
import type { LocationDetail, TopLocation } from '../lib/api';
import { api } from '../lib/api';
import { fmtValue, scoreColor } from '../lib/format';
import { Card, Modal, ScoreRing, Skeleton, Spinner } from './ui';
import { useT } from '../i18n';

// Validated categorical order (dark): blue, orange, aqua — the all-pairs-safe first three; more items fold to table only.
const SERIES = ['#3987e5', '#d95926', '#199e70'];

export default function CompareModal({ rid, items, onClose }: { rid: string; items: TopLocation[]; onClose: () => void }) {
  const t = useT();
  const [details, setDetails] = useState<LocationDetail[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    Promise.all(items.map((t) => api.location(rid, t.lat, t.lon))).then(setDetails).catch((e) => setErr(String(e.message ?? e)));
  }, [rid, items]);
  const cats = details ? Object.keys(details[0].category_scores) : [];
  const radar = cats.map((c) => {
    const o: any = { cat: c };
    details!.slice(0, 3).forEach((d, i) => { o[`s${i}`] = d.category_scores[c] ?? 0; });
    return o;
  });
  const rows = details ? details[0].rows.filter((r) => r.enabled) : [];
  return (
    <Modal wide title={t('Comparison of {n} locations', { n: items.length })} onClose={onClose}>
      <div className="p-5">
        {err && <div className="text-sm text-red-300">{err}</div>}
        {!details && !err && (
          <div>
            <div className="mb-4 flex items-center gap-2 text-sm text-mute-400"><Spinner /> {t('Loading…')}</div>
            <div className="grid gap-4 lg:grid-cols-[340px_1fr]"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
          </div>
        )}
        {details && (
          <div className="space-y-5">
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(details.length, 6)}, minmax(0, 1fr))` }}>
              {details.map((d, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-875 p-3">
                  <ScoreRing value={d.score} size={46} label={<span style={{ color: scoreColor(d.score) }}>{d.score?.toFixed(1) ?? '—'}</span>} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 truncate text-[13px] font-semibold text-white">
                      {i < 3 && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SERIES[i] }} />}{d.name}
                    </div>
                    <div className="truncate text-2xs text-mute-400">{d.country}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
              <Card title={<>{t('Category scores')} {details.length > 3 && <span className="font-normal text-mute-400">{t('(first 3 shown)')}</span>}</>} icon={RadarIcon}>
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={radar} outerRadius={100}>
                    <PolarGrid stroke="#2d384b" />
                    <PolarAngleAxis dataKey="cat" tick={{ fill: '#a9b4c3', fontSize: 10 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={{ fill: '#8b97a8', fontSize: 9 }} axisLine={false} />
                    {details.slice(0, 3).map((d, i) => (
                      <Radar key={i} isAnimationActive={false} dataKey={`s${i}`} name={d.name} stroke={SERIES[i]} fill={SERIES[i]} fillOpacity={0.12} strokeWidth={2} />
                    ))}
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: '#0c1018', border: '1px solid #2d384b', fontSize: 12, borderRadius: 8 }} />
                  </RadarChart>
                </ResponsiveContainer>
              </Card>
              <Card title={t('Parameter comparison')} icon={Table2} className="overflow-hidden">
                <div className="-m-4 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-ink-925">
                      <tr className="border-b border-ink-600 text-left text-2xs uppercase tracking-wider text-mute-400">
                        <th className="px-3 py-2.5">{t('Parameter')}</th><th className="px-3">{t('Target')}</th>
                        {details.map((d, i) => <th key={i} className="px-3 normal-case tracking-normal"><span className="text-white">{d.name}</span><br /><span className="text-mute-400">{d.country}</span></th>)}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-ink-700 bg-ink-850/60">
                        <td className="px-3 py-2 font-semibold text-white">{t('Overall score')}</td><td />
                        {details.map((d, i) => <td key={i} className="px-3 font-mono text-sm" style={{ color: scoreColor(d.score) }}>{d.score?.toFixed(1) ?? '—'} <span className="text-2xs text-mute-400">conf {d.confidence?.toFixed(0)}%</span></td>)}
                      </tr>
                      {rows.map((r) => (
                        <tr key={r.key} className="border-b border-ink-800 hover:bg-ink-850/50">
                          <td className="px-3 py-2 text-mute-200">{r.label}</td>
                          <td className="px-3 font-mono text-mute-300">{fmtValue(r.target?.value, r.unit)}</td>
                          {details.map((d, i) => {
                            const x = d.rows.find((y) => y.key === r.key)!;
                            return (
                              <td key={i} className="px-3">
                                <span className="font-mono text-white">{x.earth_available ? fmtValue(x.earth, x.unit) : 'n/a'}</span>
                                {x.similarity !== null && <span className="ml-1.5 rounded px-1 font-mono text-2xs" style={{ color: scoreColor(x.similarity * 100), background: 'rgba(255,255,255,0.04)' }}>{(x.similarity * 100).toFixed(0)}%</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
