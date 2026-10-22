// SS v13 — «شبکه سیستم‌ها»: for every system, what it needs and who provides it (read from the registry, the same one the build test checks).
import { useState } from 'react';
import { SYSTEMS, connections } from '@ss/contracts/systems.registry.mjs';
import { Card, Chip, Head, fa } from '@ss/ui/ui.jsx';

const ST = { live: ['فعال', 'var(--ok)'], partial: ['جزئی', 'var(--amber)'], planned: ['برنامه‌ریزی‌شده', 'var(--pencil)'] };
export default function Network() {
  const c = connections(SYSTEMS); const [part, setPart] = useState('all'); const name = id => SYSTEMS.find(s => s.id === id)?.fa || id;
  const rows = SYSTEMS.filter(s => part === 'all' || s.part === part);
  return <div><Head kicker="سیستم" title="شبکهٔ ارتباطی سیستم‌ها"><div className="flex gap-2">{[['all', 'همه'], ['SS', 'دانش‌آموز'], ['M', 'مدیریت']].map(([k, t]) => <Chip key={k} active={part === k} onClick={() => setPart(k)}>{t}</Chip>)}</div></Head>
    <Card className="mb-5"><div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">{[[c.links.length, 'اتصال تعریف‌شده'], [c.byStatus.live || 0, 'فعال'], [c.byStatus.partial || 0, 'جزئی'], [c.unmet.length + c.orphans.length, 'ورودی بدون منبع / خروجی بی‌مصرف']].map(([v, t]) => <div key={t} className="rounded-[12px] bg-[var(--wash)] p-3"><p className="text-[24px] font-black">{fa(v)}</p><p className="text-[13px] text-[var(--pencil)]">{t}</p></div>)}</div>
      <p className="mt-3 text-[13px] leading-7 text-[var(--pencil)]">هر سیستم ورودی‌هایش را اعلام می‌کند و ساخت پروژه فقط وقتی سبز می‌شود که هر ورودی اجباری منبعی داشته باشد. اتصال «جزئی» یعنی ساخته شده ولی هنوز کامل نیست؛ توضیحش کنار هر ردیف آمده است.</p></Card>
    <div className="grid gap-3">{rows.map(s => <Card key={s.id}><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-[16px] font-black">{s.id} · {s.fa}</p><span className="text-[12px] text-[var(--pencil)]">تولید: {s.provides.map(p => p.id).join('، ') || '—'}</span></div>
      {s.needs.length === 0 ? <p className="mt-1 text-[13px] text-[var(--pencil)]">ورودی بیرونی ندارد.</p> : <ul className="mt-2 grid gap-1 text-[13px]">{c.links.filter(l => l.to === s.id).map(l => <li key={l.id} className="flex flex-wrap items-center gap-2"><span style={{ color: ST[l.status][1] }} className="font-bold">● {ST[l.status][0]}</span><b>{l.id}</b><span className="text-[var(--pencil)]">← {l.from.map(name).join('، ') || 'بدون منبع'}{l.required ? '' : ' (اختیاری)'}{l.note ? ` · ${l.note}` : ''}</span></li>)}</ul>}</Card>)}</div></div>;
}
