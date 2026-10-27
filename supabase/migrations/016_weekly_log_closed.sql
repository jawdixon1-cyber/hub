-- A week is "closed" once payroll for it is done. The weekly log opens on the
-- oldest week that isn't closed yet. Null = still open.
alter table public.weekly_log add column if not exists closed_at timestamptz;
