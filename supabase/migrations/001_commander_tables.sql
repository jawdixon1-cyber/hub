-- Commander: contacts, leads, quotes, recurring_contracts, sync state
-- Run this in Supabase SQL Editor or via supabase db push

-- Contacts (unified across GHL + Jobber)
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text,
  email text,
  address_line1 text,
  address_city text,
  address_state text,
  address_zip text,
  lat double precision,
  lng double precision,
  jobber_client_id text unique,
  ghl_contact_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contacts_phone on contacts (phone);
create index if not exists idx_contacts_email on contacts (email);
create index if not exists idx_contacts_ghl on contacts (ghl_contact_id);
create index if not exists idx_contacts_jobber on contacts (jobber_client_id);

-- Leads
create type lead_source as enum (
  'Google Business Profile',
  'Website',
  'Yard Sign',
  'Door Hanger',
  'Referral (Client)',
  'Reactivation',
  'Facebook',
  'Other'
);

create type lead_status as enum (
  'Lead',
  'Quoted',
  'Won',
  'Lost',
  'Follow-Up'
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  contact_id uuid references contacts(id),
  source lead_source not null default 'Other',
  source_detail text,
  ghl_opportunity_id text,
  ghl_contact_id text,
  jobber_request_id text unique,
  status lead_status not null default 'Lead',
  quoted_at timestamptz,
  won_at timestamptz,
  lost_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_leads_created on leads (created_at);
create index if not exists idx_leads_contact on leads (contact_id);
create index if not exists idx_leads_source on leads (source);
create index if not exists idx_leads_status on leads (status);
create index if not exists idx_leads_ghl_contact on leads (ghl_contact_id);
create index if not exists idx_leads_jobber_request on leads (jobber_request_id);

-- Quotes
create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id),
  jobber_quote_id text unique not null,
  sent_at timestamptz,
  approved_at timestamptz,
  total_value numeric(10,2),
  is_recurring boolean not null default false,
  est_monthly_value numeric(10,2),
  updated_at timestamptz not null default now()
);

create index if not exists idx_quotes_lead on quotes (lead_id);
create index if not exists idx_quotes_sent on quotes (sent_at);
create index if not exists idx_quotes_approved on quotes (approved_at);

-- Recurring contracts
create table if not exists recurring_contracts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id),
  jobber_recurring_id text unique not null,
  start_date timestamptz,
  canceled_date timestamptz,
  monthly_value numeric(10,2),
  updated_at timestamptz not null default now()
);

create index if not exists idx_rc_lead on recurring_contracts (lead_id);
create index if not exists idx_rc_start on recurring_contracts (start_date);
create index if not exists idx_rc_canceled on recurring_contracts (canceled_date);

-- Sync state (cursor tracking for Jobber polling)
create table if not exists commander_sync_state (
  key text primary key,
  value jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- Seed initial sync cursor
insert into commander_sync_state (key, value)
values ('jobber_last_sync', '{"last_synced_at": null}')
on conflict (key) do nothing;

-- Enable RLS but allow service role full access
alter table contacts enable row level security;
alter table leads enable row level security;
alter table quotes enable row level security;
alter table recurring_contracts enable row level security;
alter table commander_sync_state enable row level security;

-- Policies: authenticated users can read, service role can do everything
create policy "Authenticated users can read contacts" on contacts for select to authenticated using (true);
create policy "Authenticated users can read leads" on leads for select to authenticated using (true);
create policy "Authenticated users can read quotes" on quotes for select to authenticated using (true);
create policy "Authenticated users can read recurring_contracts" on recurring_contracts for select to authenticated using (true);
create policy "Authenticated users can read sync_state" on commander_sync_state for select to authenticated using (true);

-- Service role bypass (for webhook + sync server)
create policy "Service role full access contacts" on contacts for all to service_role using (true) with check (true);
create policy "Service role full access leads" on leads for all to service_role using (true) with check (true);
create policy "Service role full access quotes" on quotes for all to service_role using (true) with check (true);
create policy "Service role full access recurring_contracts" on recurring_contracts for all to service_role using (true) with check (true);
create policy "Service role full access sync_state" on commander_sync_state for all to service_role using (true) with check (true);
