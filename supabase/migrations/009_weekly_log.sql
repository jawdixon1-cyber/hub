-- ── Weekly log ─────────────────────────────────────────────────────────
-- Replaces the per-job payroll tool. One row per crew per week: money in,
-- COGS, non-production time and payroll. Logged by hand once a week.
-- Time is stored in minutes so h:mm round-trips exactly.

create table if not exists public.weekly_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  week_ending date not null,
  crew text not null default 'Crew 1',
  revenue numeric(10,2) not null default 0,              -- money that came in
  cogs numeric(10,2) not null default 0,                 -- materials, fuel, dump fees…
  non_production_minutes integer not null default 0 check (non_production_minutes >= 0),
  payroll numeric(10,2) not null default 0,              -- total wages paid for the week
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_log_week_crew_uniq unique (org_id, week_ending, crew)
);
create index if not exists idx_weekly_log_org_week on public.weekly_log (org_id, week_ending desc);

-- RLS — same shape as other org-scoped tables.
alter table public.weekly_log enable row level security;
drop policy if exists weekly_log_org_isolation on public.weekly_log;
create policy weekly_log_org_isolation on public.weekly_log
  using (org_id in (select org_id from public.org_members where user_id = auth.uid()))
  with check (org_id in (select org_id from public.org_members where user_id = auth.uid()));
