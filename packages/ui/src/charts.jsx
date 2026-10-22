// SS v13 — tiny SVG chart kit (no dependency). RTL-safe: x grows to the LEFT in the page, so labels are drawn by the caller.
import { toFa } from '@ss/domain/engine.js';
const fa = toFa;
const nice = (lo, hi) => { if (lo === hi) { lo -= 1; hi += 1; } const pad = (hi - lo) * 0.1; return [lo - pad, hi + pad]; };

/** Sparkline of numbers (nulls are gaps). */
export function Spark({ values, w = 120, h = 32, color = 'var(--ink)', ariaLabel = 'روند' }) {
  const v = values.filter(x => x != null); if (v.length < 2) return <span className="text-[12px] text-[var(--pencil)]">—</span>;
  const [lo, hi] = nice(Math.min(...v), Math.max(...v)); const n = values.length; const pts = values.map((x, i) => (x == null ? null : [w - (i / (n - 1)) * w, h - ((x - lo) / (hi - lo)) * h]));
  const d = pts.reduce((a, p) => (p ? a + (a && a.endsWith('M') ? '' : a ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + ' ' : a + 'M'), '').replace(/M\s*$/g, '');
  return <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={ariaLabel}><path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}
/** Line chart. series: [{name,color,points:[{x(label),y}]}]; shared x labels in `labels`. band: {lo:[..],hi:[..]} drawn behind the first series. */
export function LineChart({ labels, series, height = 180, yMin, yMax, unit = '٪', refLine = null, ariaLabel = 'نمودار خطی' }) {
  const W = 560, H = height, L = 36, R = 8, T = 10, B = 24; const all = series.flatMap(s => s.values).filter(v => v != null); if (all.length < 2) return <p className="py-6 text-center text-[14px] text-[var(--pencil)]">داده کافی برای نمودار نیست.</p>;
  const [lo0, hi0] = nice(yMin ?? Math.min(...all, refLine ?? Infinity), yMax ?? Math.max(...all, refLine ?? -Infinity)); const n = labels.length; const X = i => W - R - (n === 1 ? 0 : (i / (n - 1)) * (W - L - R)); const Y = v => T + (1 - (v - lo0) / (hi0 - lo0)) * (H - T - B);
  const ticks = [lo0 + (hi0 - lo0) * 0.1, (lo0 + hi0) / 2, hi0 - (hi0 - lo0) * 0.1];
  return <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={ariaLabel}>
    {ticks.map((t, i) => <g key={i}><line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} stroke="var(--rule)" strokeDasharray="3 4" /><text x={L - 4} y={Y(t) + 4} textAnchor="end" fontSize="11" fill="var(--pencil)">{fa(Math.round(t))}{unit}</text></g>)}
    {refLine != null && <line x1={L} x2={W - R} y1={Y(refLine)} y2={Y(refLine)} stroke="var(--ok)" strokeWidth="1.5" strokeDasharray="6 4" />}
    {series.map((s, k) => { let d = ''; s.values.forEach((v, i) => { if (v == null) return; d += (d && s.values[i - 1] != null ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1) + ' '; });
      return <g key={k}><path d={d} fill="none" stroke={s.color || 'var(--ink)'} strokeWidth={s.dash ? 1.5 : 2.5} strokeDasharray={s.dash ? '5 4' : undefined} strokeLinejoin="round" />{!s.dash && s.values.map((v, i) => v != null && <circle key={i} cx={X(i)} cy={Y(v)} r="3" fill={s.color || 'var(--ink)'} />)}</g>; })}
    {labels.map((l, i) => (n <= 8 || i % Math.ceil(n / 8) === 0 || i === n - 1) && <text key={i} x={X(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--pencil)">{l}</text>)}
  </svg>;
}
/** Horizontal bars. rows: [{label, value, note?, color?}] */
export function Bars({ rows, max = null, unit = '٪', fmt = null, ariaLabel = 'نمودار میله‌ای' }) {
  const m = max ?? Math.max(1, ...rows.map(r => r.value ?? 0));
  return <div className="grid gap-2" role="img" aria-label={ariaLabel}>{rows.map((r, i) => <div key={i}><div className="mb-0.5 flex items-baseline justify-between gap-2 text-[13px]"><span className="min-w-0 truncate">{r.label}</span><b className="shrink-0">{r.value == null ? '—' : fmt ? fmt(r.value) : `${fa(Math.round(r.value))}${unit}`}{r.note && <span className="mr-1 font-normal text-[var(--pencil)]">{r.note}</span>}</b></div>
    <div className="h-[8px] rounded-full bg-[var(--wash)]"><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, ((r.value ?? 0) / m) * 100))}%`, background: r.color || 'var(--ink)' }} /></div></div>)}</div>;
}
/** Vertical columns (histogram / forecast). */
export function Columns({ rows, height = 90, ariaLabel = 'ستون‌ها' }) {
  const mx = Math.max(1, ...rows.map(r => r.value ?? 0));
  return <div className="flex items-end gap-1.5" style={{ height }} role="img" aria-label={ariaLabel}>{rows.map((r, i) => <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1" style={{ height: '100%' }}><span className="text-[11px] text-[var(--pencil)]">{r.value ? fa(Math.round(r.value)) : ''}</span><div className="w-full rounded-t-[4px]" style={{ height: `${Math.max(2, ((r.value ?? 0) / mx) * (height - 34))}px`, background: r.color || 'var(--ink)', opacity: r.dim ? 0.45 : 1 }} /><span className="text-[11px] text-[var(--pencil)]">{r.label}</span></div>)}</div>;
}
/** Calendar heat map: cells [{d,n,col,row}], 7 rows (Saturday first). */
export function HeatCalendar({ cells, label = d => d }) {
  const cols = Math.max(0, ...cells.map(c => c.col)) + 1; const mx = Math.max(1, ...cells.map(c => c.n)); const sz = 12, gap = 3;
  return <svg viewBox={`0 0 ${cols * (sz + gap)} ${7 * (sz + gap)}`} className="w-full" role="img" aria-label="تقویم فعالیت">{cells.map(c => <rect key={c.d} x={(cols - 1 - c.col) * (sz + gap)} y={c.row * (sz + gap)} width={sz} height={sz} rx="2" fill={c.n ? 'var(--ink)' : 'var(--wash)'} opacity={c.n ? 0.25 + 0.75 * Math.min(1, c.n / mx) : 1}><title>{label(c.d)}: {fa(c.n)}</title></rect>)}</svg>;
}
/** Compact stat tile. */
export function Stat({ value, label, hint, tone }) {
  return <div className="rounded-[12px] bg-[var(--wash)] p-3 text-center"><p className="text-[22px] font-black" style={tone ? { color: `var(--${tone})` } : undefined}>{value}</p><p className="text-[13px] text-[var(--pencil)]">{label}</p>{hint && <p className="mt-0.5 text-[12px] text-[var(--pencil)]">{hint}</p>}</div>;
}
/** Confidence-aware value: shows «n» and greys out when data is thin. */
export function Conf({ n, min = 20, children }) { return <span className={n != null && n < min ? 'opacity-60' : ''} title={n != null ? `بر پایهٔ ${fa(n)} تست` : ''}>{children}{n != null && n < min && <i className="mr-1 text-[11px] not-italic text-[var(--amber)]">(داده کم)</i>}</span>; }
