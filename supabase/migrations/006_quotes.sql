-- Quotes table — Jobber-style quote documents (separate from the Calculators tab).
-- Quote body is mostly stored in jsonb so we can iterate on the builder without
-- migrations every time we add a section.

create table if not exists public.hub_quotes (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  client_id       uuid references public.clients(id) on delete set null,
  request_id      uuid references public.requests(id) on delete set null,
  quote_number    bigint,                 -- short human-facing number, per-org
  title           text,
  status          text not null default 'draft'
                  check (status in ('draft','awaiting_response','changes_requested','approved','converted','archived')),
  salesperson     text,

  -- Money. Total denormalized so list views can sort/filter cheaply.
  subtotal        numeric(12,2) default 0,
  discount        numeric(12,2) default 0,
  tax             numeric(12,2) default 0,
  total           numeric(12,2) default 0,

  -- Document body (intro, line_items[], images[], client_message, contract, deposit, custom_fields, notes…).
  -- Schema-less on purpose during MVP iteration.
  raw_payload     jsonb default '{}'::jsonb,

  sent_at         timestamptz,
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists quotes_org_id_idx        on public.hub_quotes (org_id);
create index if not exists quotes_client_id_idx     on public.hub_quotes (client_id);
create index if not exists quotes_request_id_idx    on public.hub_quotes (request_id);
create index if not exists quotes_status_idx        on public.hub_quotes (org_id, status);
create unique index if not exists quotes_org_number_unq on public.hub_quotes (org_id, quote_number);

-- Per-org auto-incrementing quote_number. Mirrors how clients.client_number works.
create or replace function public.assign_quote_number()
returns trigger language plpgsql as $$
begin
  if new.quote_number is null then
    select coalesce(max(quote_number), 600) + 1
      into new.quote_number
      from public.hub_quotes
     where org_id = new.org_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_quotes_assign_number on public.hub_quotes;
create trigger trg_quotes_assign_number
  before insert on public.hub_quotes
  for each row execute function public.assign_quote_number();

-- Touch updated_at on every UPDATE.
create or replace function public.touch_quotes_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_quotes_touch_updated_at on public.hub_quotes;
create trigger trg_quotes_touch_updated_at
  before update on public.hub_quotes
  for each row execute function public.touch_quotes_updated_at();

-- RLS — same shape as other org-scoped tables.
alter table public.hub_quotes enable row level security;

drop policy if exists quotes_org_isolation on public.hub_quotes;
create policy quotes_org_isolation on public.hub_quotes
  using (org_id in (select org_id from public.org_members where user_id = auth.uid()))
  with check (org_id in (select org_id from public.org_members where user_id = auth.uid()));
