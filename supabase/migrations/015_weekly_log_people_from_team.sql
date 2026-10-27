-- People now come from the Team roster (app_state greenteam-permissions),
-- keyed by email, with rates snapshotted onto each week row. The separate
-- people table was never populated.
drop table if exists public.weekly_log_people;
