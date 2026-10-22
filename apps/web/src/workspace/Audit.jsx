import { useEffect, useState } from 'react';
import { api } from './adminApi.js';
import { Card, Chip, Head, jDate } from '@ss/ui/ui.jsx';
import { actFa } from './Desk.jsx';
export default function Audit({ offline }) {
  const [l, setL] = useState(null); const [f, setF] = useState('all');
  useEffect(() => { if (!offline) api('/api/admin/audit').then(r => setL(r.items)).catch(() => setL([])); }, []);
  const rows = (l || []).filter(x => f === 'all' || (f === 'security' ? /login|password|2fa|sessions|admin-|setup|forgot/.test(x.action) : f === 'students' ? /student|signup/.test(x.action) : /mail|message|bulletin|telegram/.test(x.action)));
  return <div><Head kicker="سیستم" title="گزارش فعالیت"><div className="flex gap-2">{[['all', 'همه'], ['security', 'امنیت'], ['students', 'دانش‌آموزان'], ['comm', 'ارتباطات']].map(([k, t]) => <Chip key={k} active={f === k} onClick={() => setF(k)}>{t}</Chip>)}</div></Head>
    <Card className="overflow-x-auto p-0">{!l ? <p className="p-4">…</p> : <table className="w-full min-w-[620px] text-right text-[14px]"><thead><tr className="text-[13px] text-[var(--pencil)]"><th className="p-3">زمان</th><th>چه کسی</th><th>کار</th><th>جزئیات</th><th>IP</th></tr></thead>
      <tbody>{rows.map((x, i) => <tr key={i} className={`border-t border-[var(--rule)] ${x.action === 'login-failed' ? 'text-[var(--bad)]' : ''}`}><td className="p-3 text-[13px]">{jDate(x.at)} {new Date(x.at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</td><td dir="auto">{x.who}</td><td className="font-bold">{actFa(x.action)}</td><td className="max-w-[260px] truncate">{x.target}</td><td dir="ltr" className="text-left text-[12px] text-[var(--pencil)]">{x.ip}</td></tr>)}</tbody></table>}</Card></div>;
}
