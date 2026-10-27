-- Total hours worked per week (sum of per-day `days[*].total_minutes`).
-- Production time = total − non-production; not stored, always derived.
alter table public.weekly_log add column if not exists total_minutes integer not null default 0 check (total_minutes >= 0);
