import { toFa } from '@ss/domain/engine.js';

export const fa = toFa;
export const pct = p => p == null ? '—' : `${toFa(p.toFixed(1))}٪`;
const toD = iso => /^\d{4}-\d{2}-\d{2}$/.test(String(iso)) ? (([y, m, d]) => new Date(y, m - 1, d, 12))(iso.split('-').map(Number)) : new Date(iso);
export const jDate = iso => { try { return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'long', day: 'numeric', weekday: 'long' }).format(toD(iso)); } catch { return iso; } };
export const jShort = iso => { try { return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'numeric', day: 'numeric' }).format(toD(iso)); } catch { return iso; } };
export const jWeekday = iso => { try { return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long' }).format(toD(iso)); } catch { return iso; } };
export const jDay = iso => { try { return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'long' }).format(toD(iso)); } catch { return iso; } };

export function Btn({ kind = 'solid', className = '', ...p }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-[10px] px-4 min-h-[42px] text-[15px] font-bold transition active:scale-[.98] disabled:opacity-40 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]';
  const k = {
    solid: 'bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--ink-deep)]',
    ghost: 'bg-transparent text-[var(--graphite)] hover:bg-[var(--wash)]',
    line: 'border-2 border-[var(--ink)] text-[var(--ink)] hover:bg-[var(--wash)]',
    soft: 'bg-[var(--wash)] text-[var(--ink-deep)] hover:brightness-95',
  }[kind];
  return <button type="button" className={`${base} ${k} ${className}`} {...p} />;
}

export function Card({ className = '', children, ...p }) {
  return <section className={`rounded-[14px] bg-[var(--card)] p-5 shadow-[0_1px_0_var(--rule),0_8px_24px_-18px_var(--shadow,rgba(60,20,35,.35))] ${className}`} {...p}>{children}</section>;
}

export function Head({ kicker, title, children }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {kicker && <p className="mb-1 text-[14px] font-bold text-[var(--ink)]">{kicker}</p>}
        <h1 className="text-[34px] font-black leading-[1.15] tracking-[-0.02em] text-[var(--graphite)] sm:text-[44px]">{title}</h1>
      </div>
      {children}
    </header>
  );
}

export function Chip({ active, className = '', ...p }) {
  return <button type="button" aria-pressed={!!active} className={`rounded-full px-4 min-h-[38px] text-[14px] font-bold border-2 transition disabled:opacity-40 disabled:pointer-events-none ${active ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]' : 'border-[var(--rule)] bg-[var(--card)] text-[var(--graphite)] hover:border-[var(--ink)]'} ${className}`} {...p} />;
}

export function Bubble({ label, filled, tone, onClick, size = 34, title }) {
  const color = tone === 'C' ? 'var(--ok)' : tone === 'W' ? 'var(--bad)' : tone === 'U' ? 'var(--amber)' : 'var(--pencil)';
  return (
    <button type="button" title={title} aria-label={title || label} aria-pressed={!!filled} onClick={onClick}
      className="grid place-items-center rounded-full border-2 text-[13px] font-bold transition"
      style={{ width: size, height: size, borderColor: filled ? color : 'var(--ink-faint)', background: filled ? color : 'transparent', color: filled ? 'var(--paper)' : 'var(--ink)' }}>
      {label}
    </button>
  );
}

export function Empty({ title, text, action }) {
  return (
    <div className="grid place-items-center gap-3 rounded-[14px] border-2 border-dashed border-[var(--rule)] p-8 text-center">
      <p className="text-[18px] font-black text-[var(--graphite)]">{title}</p>
      {text && <p className="max-w-md text-[15px] text-[var(--pencil)]">{text}</p>}
      {action}
    </div>
  );
}

export function Meter({ value, max = 1, color = 'var(--ink)', h = 10 }) {
  const w = Math.max(0, Math.min(1, value / max)) * 100;
  return <div className="w-full overflow-hidden rounded-full bg-[var(--wash)]" style={{ height: h }}><div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${w}%`, background: color }} /></div>;
}

/** Interval bar on percent scale [-33.3, 100] */
export function Interval({ P10, P50, P90, target }) {
  const x = v => ((v + 33.34) / 133.34) * 100;
  return (
    <div className="relative h-8 w-full" aria-label={`بین ${fa(P10.toFixed(0))} و ${fa(P90.toFixed(0))}`}>
      <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded bg-[var(--wash)]" />
      <div className="absolute top-1/2 h-[12px] -translate-y-1/2 rounded-full bg-[var(--ink)] opacity-25" style={{ right: `${x(P10)}%`, width: `${x(P90) - x(P10)}%` }} />
      <div className="absolute top-1/2 h-5 w-[5px] -translate-y-1/2 rounded bg-[var(--ink)]" style={{ right: `calc(${x(P50)}% - 2px)` }} />
      {target != null && <div className="absolute top-0 h-full w-[2px] bg-[var(--graphite)] opacity-50" style={{ right: `${x(target)}%` }} title="هدف" />}
      <div className="absolute top-1/2 h-4 w-[2px] -translate-y-1/2 bg-[var(--pencil)] opacity-40" style={{ right: `${x(0)}%` }} />
    </div>
  );
}
