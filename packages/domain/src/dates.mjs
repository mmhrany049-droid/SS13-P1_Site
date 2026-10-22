// SS 12 — dates in Asia/Tehran (report S11: «today» computed with UTC — toISOString().slice(0,10) — is wrong after
// 20:30 UTC and never rolls over). Every server-side «today» goes through here.
export const TZ = 'Asia/Tehran';
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
export const tehranDate = (d = new Date()) => fmt.format(typeof d === 'string' || typeof d === 'number' ? new Date(d) : d);
export const addDaysISO = (iso, n) => { const t = new Date(iso + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const jal = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
export const jalaliLabel = (d = new Date()) => jal.format(typeof d === 'string' ? new Date(d.length === 10 ? d + 'T12:00:00+03:30' : d) : d);
