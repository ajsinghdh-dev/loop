-- Loop database schema (its own Supabase project).
-- Every table has row-level security: people can only read and write their own rows.

create table if not exists public.studybuddy_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.studybuddy_progress enable row level security;
create policy "sb own select" on public.studybuddy_progress for select using (auth.uid() = user_id);
create policy "sb own insert" on public.studybuddy_progress for insert with check (auth.uid() = user_id);
create policy "sb own update" on public.studybuddy_progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "sb own delete" on public.studybuddy_progress for delete using (auth.uid() = user_id);

create table if not exists public.loop_shared_courses (
  code text primary key check (char_length(code) between 5 and 10),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  university text,
  course jsonb not null,
  questions jsonb not null default '[]'::jsonb,
  imports integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.loop_shared_courses enable row level security;
create policy "loop shared read own" on public.loop_shared_courses for select to authenticated using (auth.uid() = owner);
create policy "loop shared insert" on public.loop_shared_courses for insert to authenticated with check (auth.uid() = owner);
create policy "loop shared update" on public.loop_shared_courses for update to authenticated using (auth.uid() = owner) with check (auth.uid() = owner);
create policy "loop shared delete" on public.loop_shared_courses for delete to authenticated using (auth.uid() = owner);

-- Joining by share code goes through this function instead of an open read policy.
create or replace function public.loop_get_shared(p_code text)
returns table(code text, title text, university text, course jsonb, questions jsonb)
language sql stable security definer set search_path to 'public' as $$
  select s.code, s.title, s.university, s.course, s.questions
  from public.loop_shared_courses s
  where s.code = upper(trim(p_code)) and char_length(trim(p_code)) between 5 and 10
  limit 1;
$$;
grant execute on function public.loop_get_shared(text) to anon, authenticated;

create table if not exists public.loop_ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  n integer not null default 0,
  primary key (user_id, day)
);
alter table public.loop_ai_usage enable row level security;
create policy "loop usage read own" on public.loop_ai_usage for select using (auth.uid() = user_id);

create table if not exists public.loop_push_subs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  tz text not null default 'America/Toronto',
  prefs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  last_ok timestamptz
);
create index if not exists loop_push_subs_user on public.loop_push_subs(user_id);
alter table public.loop_push_subs enable row level security;
create policy "loop push own select" on public.loop_push_subs for select to authenticated using (auth.uid() = user_id);
create policy "loop push own insert" on public.loop_push_subs for insert to authenticated with check (auth.uid() = user_id);
create policy "loop push own update" on public.loop_push_subs for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "loop push own delete" on public.loop_push_subs for delete to authenticated using (auth.uid() = user_id);

-- Server-only tables: RLS on, no policies, no grants.
create table if not exists public.loop_push_sent (
  user_id uuid not null references auth.users(id) on delete cascade,
  k text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, k)
);
alter table public.loop_push_sent enable row level security;
revoke all on public.loop_push_sent from anon, authenticated;

create table if not exists public.loop_push_keys (
  id int primary key default 1 check (id = 1),
  public_key text not null,
  vapid jsonb not null,
  cron_key text not null,
  created_at timestamptz not null default now()
);
alter table public.loop_push_keys enable row level security;
revoke all on public.loop_push_keys from anon, authenticated;
revoke all on public.loop_ai_usage from anon;
