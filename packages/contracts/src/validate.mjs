// SS 12 — dependency-free schema validation. Every command is validated before it can touch storage (report S5).
const fail = (field, code) => ({ ok: false, error: 'invalid-input', field, code });
const DIG = s => String(s).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
export const normDigits = DIG;
/** schema: { field: { type: 'int'|'string'|'enum'|'date'|'bool', min, max, required, values, pattern, maxLen } } */
export function check(schema, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'invalid-input', field: null, code: 'not-object' };
  const out = {};
  for (const [k, r] of Object.entries(schema)) {
    let v = input[k];
    if (v === undefined || v === null || v === '') { if (r.required) return fail(k, 'required'); if (r.default !== undefined) out[k] = r.default; continue; }
    if (r.type === 'int') { if (typeof v === 'string' && /^[\d۰-۹٠-٩]+$/.test(v.trim())) v = +DIG(v.trim()); if (typeof v !== 'number' || !Number.isInteger(v)) return fail(k, 'not-integer'); if (r.min != null && v < r.min) return fail(k, 'too-small'); if (r.max != null && v > r.max) return fail(k, 'too-large'); }
    else if (r.type === 'string') { if (typeof v !== 'string') return fail(k, 'not-string'); v = v.trim(); if (r.min && v.length < r.min) return fail(k, 'too-short'); if (v.length > (r.maxLen ?? 500)) return fail(k, 'too-long'); if (r.pattern && !r.pattern.test(v)) return fail(k, 'bad-format'); }
    else if (r.type === 'enum') { if (!r.values.includes(v)) return fail(k, 'not-allowed'); }
    else if (r.type === 'date') { if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v + 'T00:00:00Z'))) return fail(k, 'bad-date'); }
    else if (r.type === 'datetime') { if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) return fail(k, 'bad-datetime'); }
    else if (r.type === 'bool') { if (typeof v !== 'boolean') return fail(k, 'not-boolean'); }
    out[k] = v;
  }
  const extra = Object.keys(input).filter(k => !schema[k]); if (extra.length) return { ok: false, error: 'invalid-input', field: extra[0], code: 'unknown-field' };
  return { ok: true, value: out };
}
export const S = {
  login: { identity: { type: 'string', required: true, min: 3, maxLen: 120 }, password: { type: 'string', required: true, min: 1, maxLen: 128 }, code: { type: 'string', maxLen: 12 }, remember: { type: 'bool' } },
  role: { roleAssignmentId: { type: 'string', required: true, maxLen: 80, pattern: /^[a-zA-Z0-9_-]+$/ }, code: { type: 'string', maxLen: 12 } },
  // report §13.2: minutes 1..600, tests 0..500, topic valid
  studySession: { minutes: { type: 'int', required: true, min: 1, max: 600 }, tests: { type: 'int', required: true, min: 0, max: 500 }, topic: { type: 'string', required: true, min: 1, maxLen: 120 }, subject: { type: 'string', maxLen: 60 }, subjectId: { type: 'string', maxLen: 20, pattern: /^[a-z]+$/ }, origin: { type: 'string', maxLen: 12, pattern: /^[a-z]+$/ }, correct: { type: 'int', min: 0, max: 500 }, wrong: { type: 'int', min: 0, max: 500 }, at: { type: 'datetime' }, localId: { type: 'string', maxLen: 80, pattern: /^[a-zA-Z0-9:_-]+$/ }, timed: { type: 'bool' } },
  setup: { email: { type: 'string', required: true, maxLen: 120 }, name: { type: 'string', maxLen: 80 }, password: { type: 'string', required: true, maxLen: 128 }, orgName: { type: 'string', maxLen: 80 } },
  grant: { userId: { type: 'string', required: true, maxLen: 80, pattern: /^[a-zA-Z0-9_-]+$/ }, role: { type: 'string', required: true, maxLen: 40 }, organizationId: { type: 'string', maxLen: 80, pattern: /^[a-zA-Z0-9_-]+$/ }, classIds: { type: 'string', maxLen: 400 }, subjects: { type: 'string', maxLen: 400 }, validUntil: { type: 'date' } },
};
