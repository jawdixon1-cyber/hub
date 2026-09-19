-- ── Payroll ────────────────────────────────────────────────────────────
-- Weekly payroll calculation + review. Base pay follows the week the hours
-- were worked; bonus accounting follows the job until it is complete.
-- Money is numeric(10,2) here and integer cents in the app. Every finalized
-- run stores a full snapshot so later rate/target/job edits never rewrite
-- history.

create table if not exists public.payroll_settings (
  org_id uuid primary key,
  target_pct numeric(5,2) not null default 30.00,        -- production labor target, % of adjusted revenue
  default_hourly_rate numeric(10,2) not null default 0,
  week_ending_day smallint not null default 0,           -- 0=Sunday … 6=Saturday
  allocation_method text not null default 'production_hours_share',
  updated_at timestamptz not null default now()
);

create table if not exists public.payroll_employees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  name text not null,
  active boolean not null default true,
  hourly_rate numeric(10,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_payroll_employees_org on public.payroll_employees (org_id, active);

create table if not exists public.payroll_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  name text not null,
  description text,
  revenue numeric(10,2) not null default 0,
  cog numeric(10,2) not null default 0,                  -- direct non-labor costs
  status text not null default 'wip',                    -- wip | complete
  started_on date,
  completed_on date,
  bonus_week_ending date,                                -- payroll week the bonus is recognized in
  bonus_processed_run_id uuid,                           -- set when a finalized run consumed this job's bonus
  hub_job_id uuid references public.hub_jobs(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_jobs_status_chk check (status in ('wip','complete'))
);
create index if not exists idx_payroll_jobs_org_status on public.payroll_jobs (org_id, status);
create index if not exists idx_payroll_jobs_bonus_week on public.payroll_jobs (org_id, bonus_week_ending);

create table if not exists public.payroll_time_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  employee_id uuid not null references public.payroll_employees(id) on delete restrict,
  job_id uuid references public.payroll_jobs(id) on delete set null,
  worked_on date not null,
  week_ending date not null,
  hours numeric(6,2) not null check (hours > 0),
  kind text not null,                                    -- production | non_production
  hourly_rate_snapshot numeric(10,2) not null,           -- employee rate at entry time; base pay uses this
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_time_entries_kind_chk check (kind in ('production','non_production'))
);
create index if not exists idx_payroll_time_week on public.payroll_time_entries (org_id, week_ending);
create index if not exists idx_payroll_time_job on public.payroll_time_entries (job_id);
create index if not exists idx_payroll_time_employee on public.payroll_time_entries (employee_id);

create table if not exists public.payroll_pay_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  employee_id uuid not null references public.payroll_employees(id) on delete restrict,
  type text not null,   -- review_bonus | referral_bonus | performance_bonus | other_bonus | reimbursement | correction
  amount numeric(10,2) not null,
  description text not null,
  item_date date not null,
  week_ending date not null,
  reference text,
  paid_run_id uuid,                                      -- set when a finalized run paid this item
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_pay_items_type_chk check (type in
    ('review_bonus','referral_bonus','performance_bonus','other_bonus','reimbursement','correction'))
);
create index if not exists idx_payroll_pay_items_week on public.payroll_pay_items (org_id, week_ending);

create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  week_ending date not null,
  status text not null default 'draft',                  -- draft | finalized
  target_pct numeric(5,2) not null,
  allocation_method text not null,
  checklist jsonb not null default '{}',
  snapshot jsonb,                                        -- full engine result at finalize time
  finalized_at timestamptz,
  reopened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, week_ending),
  constraint payroll_runs_status_chk check (status in ('draft','finalized'))
);

create table if not exists public.payroll_run_employees (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payroll_runs(id) on delete cascade,
  org_id uuid not null,
  employee_id uuid not null,
  employee_name text not null,
  hourly_rate numeric(10,2) not null,
  production_hours numeric(8,2) not null default 0,
  non_production_hours numeric(8,2) not null default 0,
  base_wages numeric(10,2) not null default 0,
  production_bonus numeric(10,2) not null default 0,
  other_bonuses numeric(10,2) not null default 0,
  corrections numeric(10,2) not null default 0,
  reimbursements numeric(10,2) not null default 0,
  gross_compensation numeric(10,2) not null default 0,
  total_payout numeric(10,2) not null default 0,
  detail jsonb not null default '{}'
);
create index if not exists idx_payroll_run_employees_run on public.payroll_run_employees (run_id);

alter table public.payroll_jobs
  add constraint payroll_jobs_processed_run_fk
  foreign key (bonus_processed_run_id) references public.payroll_runs(id) on delete set null;
alter table public.payroll_pay_items
  add constraint payroll_pay_items_paid_run_fk
  foreign key (paid_run_id) references public.payroll_runs(id) on delete set null;

-- updated_at touch
create or replace function public.touch_payroll_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
do $$
declare t text;
begin
  foreach t in array array['payroll_employees','payroll_jobs','payroll_time_entries','payroll_pay_items','payroll_runs','payroll_settings'] loop
    execute format('drop trigger if exists trg_%s_touch on public.%s', t, t);
    execute format('create trigger trg_%s_touch before update on public.%s for each row execute function public.touch_payroll_updated_at()', t, t);
  end loop;
end $$;

-- RLS — same shape as hub_quotes
do $$
declare t text;
begin
  foreach t in array array['payroll_settings','payroll_employees','payroll_jobs','payroll_time_entries','payroll_pay_items','payroll_runs','payroll_run_employees'] loop
    execute format('alter table public.%s enable row level security', t);
    execute format('drop policy if exists %s_org_isolation on public.%s', t, t);
    execute format($p$create policy %s_org_isolation on public.%s
      using (org_id in (select org_id from public.org_members where user_id = auth.uid()))
      with check (org_id in (select org_id from public.org_members where user_id = auth.uid()))$p$, t, t);
  end loop;
end $$;
