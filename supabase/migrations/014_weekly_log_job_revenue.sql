-- Revenue for an unfinished job is entered on the job (not in the day grid)
-- the week it's done, so the job's own bonus calc has everything it needs.
alter table public.weekly_log_jobs add column if not exists revenue numeric(10,2) not null default 0;
