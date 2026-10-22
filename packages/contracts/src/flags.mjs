// Feature flags. Sensitive capabilities stay OFF until their gates pass (report §17, §20).
export const FLAGS = {
  onlineExam: false,        // §17: 9 gates (server clock, autosave, reconnect, unique submit, load test…) not passed → prototype only
  onlineAI: false,          // opt-in only; offline rule-based assistant is the core
  contentPublication: false,// official book/key publication workflow (milestone D) not built yet
  packageChanges: false,    // entitlement/package edits (manual subscriptions) — milestone D
  legacyAdminLogin: false,  // v11 admin cookie login; v12 uses the single /api/auth/login
  legacyStudentApi: true,   // keep old installed student clients syncing (Bearer / Student id:secret) during transition
};
export function flagsFrom(env = {}) {
  const f = { ...FLAGS };
  for (const k of Object.keys(f)) { const e = env['SS_FLAG_' + k.replace(/[A-Z]/g, c => '_' + c).toUpperCase()]; if (e === '1' || e === 'true') f[k] = true; if (e === '0' || e === 'false') f[k] = false; }
  if (f.onlineExam) f.onlineExam = env.SS_ONLINE_EXAM_GATES_PASSED === 'yes'; // cannot be switched on by a flag alone
  return f;
}
