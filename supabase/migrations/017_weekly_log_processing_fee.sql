-- Card/processing fees are built into our prices, so part of every dollar that comes in goes to
-- the processor. Payroll counts them in COGS as a % of finished revenue, so margin and the crew
-- bonus pool aren't figured on money we never keep.
-- settings.fee_pct is the default for new weeks; weekly_log.fee_pct is the rate a week was saved
-- with, so changing the default later never changes weeks that are already done.
alter table public.weekly_log_settings add column if not exists fee_pct numeric(5,2) not null default 0;
alter table public.weekly_log add column if not exists fee_pct numeric(5,2);
