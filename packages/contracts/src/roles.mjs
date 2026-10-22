// SS 13 — the ten roles (v12 had nine; «ادمین مدیر» = manager_admin is new). In the product's words:
//   1 مالک=owner · 2 ادمین مالک=administrator · 3 مدیر=school_manager/institute_manager · 4 ادمین مدیر=manager_admin · 5 معلم=subject_teacher/independent_teacher · 6 ادمین معلم=teacher_admin · 7 دانش‌آموز=student.
// SS 12 — the nine roles (Blueprint §4, report §14). A role is a grant on ONE account, never a separate login.
// surface: which half of the single site the role lands on (today = student experience, workspace = organisation desk).
// legacy: the v11 hub role whose permission table (CAN) the preserved admin pages still use.
// sensitive: MFA (TOTP) is mandatory before this role can be activated.
export const ROLES = {
  student:             { fa: 'دانش‌آموز',               surface: 'today',     legacy: null,      sensitive: false, rank: 1 },
  independent_teacher: { fa: 'معلم مستقل',              surface: 'workspace', legacy: 'teacher', sensitive: false, rank: 2 },
  subject_teacher:     { fa: 'معلم درس منتخب',          surface: 'workspace', legacy: 'teacher', sensitive: false, rank: 2 },
  teacher_admin:       { fa: 'ادمین معلم',              surface: 'workspace', legacy: 'manager', sensitive: true,  rank: 3 },
  school_manager:      { fa: 'مدیر مدرسه',              surface: 'workspace', legacy: 'manager', sensitive: true,  rank: 4 },
  institute_manager:   { fa: 'مدیر آموزشگاه',           surface: 'workspace', legacy: 'manager', sensitive: true,  rank: 4 },
  manager_admin:       { fa: 'ادمین مدیر',             surface: 'workspace', legacy: 'manager', sensitive: true,  rank: 3 },
  program_manager:     { fa: 'مدیر برنامه',             surface: 'workspace', legacy: 'manager', sensitive: true,  rank: 4 },
  administrator:       { fa: 'ادمین مالک',             surface: 'workspace', legacy: 'owner',   sensitive: true,  rank: 5 },
  owner:               { fa: 'مالک',             surface: 'workspace', legacy: 'owner',   sensitive: true,  rank: 6 },
};
export const ROLE_IDS = Object.keys(ROLES);
export const isRole = r => Object.hasOwn(ROLES, r);

// Permissions: verb.object. Scope is checked separately (policy.mjs); a permission alone never grants data access.
export const PERMISSIONS = {
  student:             ['self.read', 'self.study.write', 'self.review.write', 'self.plan.decide', 'self.exam.take', 'self.content.read', 'self.proposal.create'],
  independent_teacher: ['class.read', 'class.write', 'content.own.write', 'exam.own.write', 'student.progress.read', 'books.write'],
  subject_teacher:     ['class.read', 'subject.content.write', 'student.progress.read', 'exam.subject.write', 'books.write'],
  teacher_admin:       ['class.read', 'team.manage', 'subject.content.write', 'reports.read', 'proposal.review', 'books.write'],
  school_manager:      ['org.read', 'org.members.manage', 'class.read', 'class.write', 'schedule.write', 'content.publish', 'reports.read', 'proposal.review', 'import.run', 'package.read', 'books.write'],
  institute_manager:   ['org.read', 'org.members.manage', 'class.read', 'class.write', 'schedule.write', 'content.publish', 'reports.read', 'proposal.review', 'import.run', 'package.read', 'books.write'],
  manager_admin:       ['org.read', 'org.members.manage', 'class.read', 'class.write', 'schedule.write', 'reports.read', 'proposal.review'],
  program_manager:     ['org.read', 'class.read', 'schedule.write', 'program.policy.write', 'reports.read'],
  administrator:       ['org.read', 'org.members.manage', 'users.manage', 'roles.grant', 'settings.manage', 'audit.read', 'import.run', 'events.read', 'class.read', 'reports.read', 'books.write', 'student.progress.read', 'badge.grant', 'approvals.request'],
  owner:               ['org.read', 'org.members.manage', 'users.manage', 'roles.grant', 'settings.manage', 'audit.read', 'import.run', 'events.read', 'billing.manage', 'package.manage', 'books.write', 'badge.grant', 'approvals.decide', 'class.read', 'class.write', 'schedule.write', 'content.publish', 'reports.read', 'proposal.review'],
};
export const can = (role, perm) => !!PERMISSIONS[role]?.includes(perm);
/** v13 grant matrix (explicit, not by rank). Nobody hands out a role they could not hold themselves; the owner-admin can NOT create admins. */
export const GRANT_MATRIX = {
  owner: ROLE_IDS.slice(),
  administrator: ['school_manager', 'institute_manager', 'program_manager', 'manager_admin', 'teacher_admin', 'subject_teacher', 'independent_teacher', 'student'],
  school_manager: ['manager_admin', 'teacher_admin', 'subject_teacher', 'independent_teacher', 'student'],
  institute_manager: ['manager_admin', 'teacher_admin', 'subject_teacher', 'independent_teacher', 'student'],
  manager_admin: ['subject_teacher', 'independent_teacher', 'student'],
  teacher_admin: ['subject_teacher', 'student'],
  subject_teacher: ['student'], independent_teacher: ['student'], program_manager: [], student: [],
};
export const grantable = granterRole => (GRANT_MATRIX[granterRole] || []).filter(isRole);

/** Owner-admin: these actions work only while the owner has APPROVED a capability grant (revocable at any time). */
export const APPROVAL_GATED = { administrator: ['users.manage', 'audit.read', 'reports.read', 'import.run', 'events.read', 'settings.manage', 'books.write', 'student.progress.read'] };
export const CAPABILITY_FA = { 'users.manage': 'دیدن و تغییر اطلاعات حساب کاربران', 'audit.read': 'دیدن گزارش فعالیت', 'reports.read': 'دیدن گزارش‌های سازمان', 'import.run': 'انتقال و ورود داده', 'events.read': 'دیدن رویدادها و صحت داده', 'settings.manage': 'تغییر تنظیمات سامانه', 'books.write': 'ساخت و ویرایش کتاب تست', 'student.progress.read': 'دیدن پیشرفت دانش‌آموزان' };
/** Teachers: these actions need the «golden tick» (granted by the owner or an owner-admin; more features will be attached to it later). */
export const GOLD_GATED = { subject_teacher: ['books.write'], independent_teacher: ['books.write'], teacher_admin: ['books.write'] };
export const GOLD_FEATURES_FA = { 'books.write': 'ساخت و ویرایش کتاب تست' };
