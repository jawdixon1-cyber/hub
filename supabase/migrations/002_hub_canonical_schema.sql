-- Hub canonical schema: source-agnostic tables for jobs, visits, time entries
-- Jobber is one possible source; the Hub UI never reads from Jobber directly.
-- Replacing Jobber later = swap the sync layer; tables and UI keep working.
--
-- Run this in Supabase SQL Editor or via supabase db push.

-- ── hub_jobs ────────────────────────────────────────────────────────
-- A job/contract a client has booked with us. One client can have many.
create table if not exists hub_jobs (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts(id),
  title text,
  description text,
  type text not null default 'one_off',     -- one_off | recurring | assessment
  status text not null default 'active',    -- active | completed | cancelled | archived
  job_number text,
  total_amount numeric(10,2),
  source text not null default 'hub',       -- hub | jobber | (future: own software)
  source_id text,                            -- e.g. Jobber's job ID
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);
create index if not exists idx_hub_jobs_contact on hub_jobs (contact_id);
create index if not exists idx_hub_jobs_status on hub_jobs (status);
create index if not exists idx_hub_jobs_source on hub_jobs (source, source_id);

-- ── hub_visits ──────────────────────────────────────────────────────
-- One scheduled occurrence of a job. The Schedule reads from this.
create table if not exists hub_visits (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references hub_jobs(id) on delete cascade,
  contact_id uuid references contacts(id),
  title text,
  start_at timestamptz,
  end_at timestamptz,
  completed_at timestamptz,
  address text,
  status text not null default 'scheduled', -- scheduled | in_progress | completed | cancelled
  notes text,
  source text not null default 'hub',
  source_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);
create index if not exists idx_hub_visits_start on hub_visits (start_at);
create index if not exists idx_hub_visits_job on hub_visits (job_id);
create index if not exists idx_hub_visits_contact on hub_visits (contact_id);
create index if not exists idx_hub_visits_status on hub_visits (status);
create index if not exists idx_hub_visits_source on hub_visits (source, source_id);

-- ── hub_visit_assignments ───────────────────────────────────────────
-- Who's assigned to a visit. Identified by name (matches Jobber); we'll add
-- member_email when we tie users to assignments.
create table if not exists hub_visit_assignments (
  visit_id uuid not null references hub_visits(id) on delete cascade,
  assignee_name text not null,
  assignee_email text,
  primary key (visit_id, assignee_name)
);
create index if not exists idx_hub_visit_assignments_email on hub_visit_assignments (assignee_email);

-- ── hub_time_entries ────────────────────────────────────────────────
-- Future: clock in/out and job in/out. Defined now so the schema is stable.
create table if not exists hub_time_entries (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid references hub_visits(id) on delete set null,
  job_id uuid references hub_jobs(id) on delete set null,
  member_email text,
  member_name text,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds integer,
  notes text,
  source text not null default 'hub',
  source_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);
create index if not exists idx_hub_time_entries_member on hub_time_entries (member_email);
create index if not exists idx_hub_time_entries_started on hub_time_entries (started_at);
create index if not exists idx_hub_time_entries_visit on hub_time_entries (visit_id);

-- ── hub_sync_state ──────────────────────────────────────────────────
-- Track sync cursors per source. Lets the sync worker resume from last position.
create table if not exists hub_sync_state (
  key text primary key,
  value jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

insert into hub_sync_state (key, value) values
  ('jobber_visits_last_sync', '{"last_synced_at": null}'),
  ('jobber_jobs_last_sync',   '{"last_synced_at": null}'),
  ('jobber_clients_last_sync','{"last_synced_at": null}')
on conflict (key) do nothing;

-- ── Triggers: keep updated_at fresh ─────────────────────────────────
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_hub_jobs_updated on hub_jobs;
create trigger trg_hub_jobs_updated before update on hub_jobs
  for each row execute function set_updated_at();

drop trigger if exists trg_hub_visits_updated on hub_visits;
create trigger trg_hub_visits_updated before update on hub_visits
  for each row execute function set_updated_at();

drop trigger if exists trg_hub_time_entries_updated on hub_time_entries;
create trigger trg_hub_time_entries_updated before update on hub_time_entries
  for each row execute function set_updated_at();

drop trigger if exists trg_hub_sync_state_updated on hub_sync_state;
create trigger trg_hub_sync_state_updated before update on hub_sync_state
  for each row execute function set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────
alter table hub_jobs enable row level security;
alter table hub_visits enable row level security;
alter table hub_visit_assignments enable row level security;
alter table hub_time_entries enable row level security;
alter table hub_sync_state enable row level security;

-- Authenticated users: read access (policies are loose to start; tighten later
-- once we add per-user filtering for non-owners).
create policy "auth read hub_jobs" on hub_jobs for select to authenticated using (true);
create policy "auth read hub_visits" on hub_visits for select to authenticated using (true);
create policy "auth read hub_visit_assignments" on hub_visit_assignments for select to authenticated using (true);
create policy "auth read hub_time_entries" on hub_time_entries for select to authenticated using (true);
create policy "auth read hub_sync_state" on hub_sync_state for select to authenticated using (true);

-- Service role: full access (for the sync worker)
create policy "service hub_jobs" on hub_jobs for all to service_role using (true) with check (true);
create policy "service hub_visits" on hub_visits for all to service_role using (true) with check (true);
create policy "service hub_visit_assignments" on hub_visit_assignments for all to service_role using (true) with check (true);
create policy "service hub_time_entries" on hub_time_entries for all to service_role using (true) with check (true);
create policy "service hub_sync_state" on hub_sync_state for all to service_role using (true) with check (true);
