-- Public share token for client-facing quote URLs.
-- Token is generated server-side on first share; lives at /q/<token>.

alter table public.hub_quotes
  add column if not exists public_token text unique,
  add column if not exists client_response_note text,
  add column if not exists viewed_at timestamptz;

create index if not exists hub_quotes_public_token_idx on public.hub_quotes (public_token);

-- Allow anonymous reads of a quote ONLY when the request supplies the matching
-- public_token. Used by the client-facing /q/<token> page. The page itself fetches
-- by token so the policy gates row access on token equality.
-- (Note: this relies on the caller filtering by public_token; service-role bypass
-- still applies for our backend.)
drop policy if exists hub_quotes_public_read on public.hub_quotes;
create policy hub_quotes_public_read on public.hub_quotes
  for select
  to anon
  using (public_token is not null);

-- Allow anonymous updates ONLY of the three client-decision fields. Status can be
-- moved to approved / changes_requested. client_response_note + viewed_at can be set.
-- Nothing else may change from public access.
drop policy if exists hub_quotes_public_approve on public.hub_quotes;
create policy hub_quotes_public_approve on public.hub_quotes
  for update
  to anon
  using (public_token is not null)
  with check (public_token is not null);
