-- SS 11 logical relational schema. PostgreSQL target.
create table users (id uuid primary key, email text unique, phone text unique, name text not null, status text not null default 'active', created_at timestamptz not null default now());
create table roles (id text primary key, title text not null);
create table organizations (id uuid primary key, kind text not null check (kind in ('school','institute','publisher')), name text not null, owner_user_id uuid references users(id));
create table organization_members (organization_id uuid references organizations(id), user_id uuid references users(id), role_id text references roles(id), status text not null default 'active', primary key (organization_id,user_id,role_id));
create table academic_classes (id uuid primary key, organization_id uuid references organizations(id), academic_year text, name text not null, grade int, stream text);
create table class_members (class_id uuid references academic_classes(id), user_id uuid references users(id), kind text not null check (kind in ('student','teacher')), status text not null default 'active', primary key (class_id,user_id));
create table subjects (id text primary key, title text not null);
create table test_books (id uuid primary key, owner_organization_id uuid references organizations(id), subject_id text references subjects(id), title text not null, status text not null default 'draft');
create table test_book_versions (id uuid primary key, book_id uuid references test_books(id), version int not null, payload jsonb not null, created_by uuid references users(id), created_at timestamptz not null default now(), unique(book_id,version));
create table exams (id uuid primary key, creator_id uuid references users(id), class_id uuid references academic_classes(id), title text not null, starts_at timestamptz, duration_seconds int, status text not null default 'draft');
create table exam_attempts (id uuid primary key, exam_id uuid references exams(id), student_id uuid references users(id), started_at timestamptz, submitted_at timestamptz, score numeric, unique(exam_id,student_id));
create table exam_answers (attempt_id uuid references exam_attempts(id), question_id text, answer jsonb, is_correct boolean, time_ms int, primary key(attempt_id,question_id));
create table videos (id uuid primary key, teacher_id uuid references users(id), subject_id text references subjects(id), title text not null, storage_key text not null, visibility text not null default 'assigned');
create table subscriptions (id uuid primary key, user_id uuid references users(id), organization_id uuid references organizations(id), plan_code text not null, starts_at timestamptz not null, ends_at timestamptz, status text not null default 'active');
create table audit_logs (id bigserial primary key, actor_id uuid references users(id), action text not null, entity_type text not null, entity_id text, metadata jsonb, created_at timestamptz not null default now());
