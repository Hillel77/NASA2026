import { useEffect, useState } from 'react';
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import type { LocationDetail, TopLocation } from '../lib/api';
import { api } from '../lib/api';
import { fmtValue, scoreColor } from '../lib/format';
import { Modal, Spinner } from './ui';

// Validated categorical order (dark): blue, orange, aqua — the all-pairs-safe first three; more items fold to table only.
const SERIES = ['#3987e5', '#d95926', '#199e70'];

export default function CompareModal({ rid, items, onClose }: { rid: string; items: TopLocation[]; onClose: () => void }) {
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
    <Modal wide title={`Comparison of ${items.length} locations`} onClose={onClose}>
      <div className="p-5">
        {err && <div className="text-sm text-red-300">{err}</div>}
        {!details && !err && <div className="flex items-center gap-2 text-sm text-mute-400"><Spinner /> Loading…</div>}
        {details && (
          <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
            <div>
              <div className="mb-1 text-xs font-medium text-mute-200">Category scores {details.length > 3 && <span className="text-mute-400">(first 3 shown)</span>}</div>
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={radar} outerRadius={100}>
                  <PolarGrid stroke="#2a3444" />
                  <PolarAngleAxis dataKey="cat" tick={{ fill: '#a9b4c3', fontSize: 10 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={{ fill: '#8b97a8', fontSize: 9 }} axisLine={false} />
                  {details.slice(0, 3).map((d, i) => (
                    <Radar isAnimationActive={false} key={i} dataKey={`s${i}`} name={d.name} stroke={SERIES[i]} fill={SERIES[i]} fillOpacity={0.12} strokeWidth={2} />
                  ))}
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#0b0f16', border: '1px solid #2a3444', fontSize: 12 }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-ink-600 text-left text-2xs uppercase tracking-wider text-mute-400">
                    <th className="py-2 pr-3">Parameter</th><th className="pr-3">Target</th>
                    {details.map((d, i) => <th key={i} className="pr-3 normal-case tracking-normal"><span className="text-white">{d.name}</span><br /><span className="text-mute-400">{d.country}</span></th>)}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-ink-700">
                    <td className="py-1.5 pr-3 font-medium text-white">Overall score</td><td />
                    {details.map((d, i) => <td key={i} className="pr-3 font-mono text-sm" style={{ color: scoreColor(d.score) }}>{d.score?.toFixed(1) ?? '—'} <span className="text-2xs text-mute-400">conf {d.confidence?.toFixed(0)}%</span></td>)}
                  </tr>
                  {rows.map((r) => (
                    <tr key={r.key} className="border-b border-ink-800">
                      <td className="py-1.5 pr-3 text-mute-200">{r.label}</td>
                      <td className="pr-3 font-mono text-mute-300">{fmtValue(r.target?.value, r.unit)}</td>
                      {details.map((d, i) => {
                        const x = d.rows.find((y) => y.key === r.key)!;
                        return (
                          <td key={i} className="pr-3">
                            <span className="font-mono text-white">{x.earth_available ? fmtValue(x.earth, x.unit) : 'n/a'}</span>
                            {x.similarity !== null && <span className="ml-1 font-mono text-2xs" style={{ color: scoreColor(x.similarity * 100) }}>{(x.similarity * 100).toFixed(0)}%</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
