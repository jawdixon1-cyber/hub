-- Stripe card-on-file storage for clients. We never store raw card data —
-- the actual card lives in Stripe; we keep the payment_method ID + display
-- metadata (brand, last 4, expiry) so the UI can render it cleanly.
create table if not exists payment_methods (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  stripe_payment_method_id text not null,
  brand text,                 -- 'visa', 'mastercard', 'amex', etc.
  last4 text,
  exp_month int,
  exp_year int,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (stripe_payment_method_id)
);
create index if not exists idx_payment_methods_client on payment_methods (client_id);

-- One default per client. Trigger demotes others when a new default is set.
create or replace function payment_methods_one_default() returns trigger as $$
begin
  if NEW.is_default = true then
    update payment_methods
      set is_default = false
      where client_id = NEW.client_id and id <> NEW.id;
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists payment_methods_default_trg on payment_methods;
create trigger payment_methods_default_trg
  before insert or update on payment_methods
  for each row execute function payment_methods_one_default();
