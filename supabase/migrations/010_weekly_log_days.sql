-- ── Weekly log: per-day detail ─────────────────────────────────────────
-- Revenue, COGS and non-production time are entered per day (any day may be
-- blank). The weekly totals stay on the row, recomputed from `days` on every
-- save, so history queries never have to unpack JSON.
--   days = { "2026-09-14": { "revenue": 0, "cogs": 0, "np_minutes": 0 }, … }

alter table public.weekly_log add column if not exists days jsonb not null default '{}'::jsonb;
