-- ── Weekly log: people, bonus, unfinished jobs ─────────────────────────
-- Bonus rule: production wages ÷ (revenue − COGS) vs a target %. Under the
-- target, the difference is a pool split by production hours per person.
-- Hours are entered per person per week; rates are snapshotted onto the week
-- row so old weeks never move when a rate changes.

create table if not exists public.weekly_log_settings (
  org_id uuid primary key,
  target_pct numeric(5,2) not null default 30.00,
  updated_at timestamptz not null default now()
);

create table if not exists public.weekly_log_people (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  name text not null,
  hourly_rate numeric(10,2) not null default 0,
  active boolean not null default true,
  sort smallint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_weekly_log_people_org on public.weekly_log_people (org_id, active, sort);

-- people = { "<person id>": { "prod_minutes": 0, "np_minutes": 0, "rate": 22.5 }, … }
alter table public.weekly_log add column if not exists people jsonb not null default '{}'::jsonb;

-- Unfinished jobs. Hours + COGS spent on them are held out of the bonus math
-- each week (holds), and released together in the week the job is done.
--   holds = { "<week_ending>": { "minutes": 0, "cogs": 0 }, … }
create table if not exists public.weekly_log_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  crew text not null default 'Crew 1',
  name text not null,
  opened_week date not null,
  done_week date,                                         -- null while open
  holds jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_weekly_log_jobs_org on public.weekly_log_jobs (org_id, done_week);

do $$
declare t text;
begin
  foreach t in array array['weekly_log_settings','weekly_log_people','weekly_log_jobs'] loop
    execute format('alter table public.%s enable row level security', t);
    execute format('drop policy if exists %s_org_isolation on public.%s', t, t);
    execute format($p$create policy %s_org_isolation on public.%s
      using (org_id in (select org_id from public.org_members where user_id = auth.uid()))
      with check (org_id in (select org_id from public.org_members where user_id = auth.uid()))$p$, t, t);
  end loop;
end $$;
