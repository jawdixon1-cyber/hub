-- Employer-side payroll taxes (FICA match, FUTA/SUTA…) so labor can be seen
-- both as base wages and fully loaded (wages + employer taxes).
alter table public.weekly_log add column if not exists employer_taxes numeric(10,2) not null default 0;
