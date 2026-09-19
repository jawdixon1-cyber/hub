/* One loader for all payroll data. Every screen reads from here and calls
 * refresh() after a write, so numbers are always computed from the same
 * dataset the DB has. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import * as data from '../../lib/payroll/data.js';
import { computeWeek, weekEndingFor } from '../../lib/payroll/engine.js';

const Ctx = createContext(null);

export function PayrollProvider({ children }) {
  const { orgId } = useAuth();
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    try { setState(await data.loadAll(orgId)); setError(null); }
    catch (e) { setError(e.message); }
  }, [orgId]);
  useEffect(() => { refresh(); }, [refresh]);

  const api = useMemo(() => ({
    orgId, ...(state || {}), loading: !state, error, refresh,
    weekEndingDay: state?.settings?.week_ending_day ?? 0,
    currentWeekEnding: weekEndingFor(new Date().toISOString().slice(0, 10), state?.settings?.week_ending_day ?? 0),
    compute: (weekEnding, runId = null) => state && computeWeek({ weekEnding, runId, employees: state.employees, jobs: state.jobs, timeEntries: state.timeEntries, payItems: state.payItems, settings: state.settings }),
    save: {
      settings: (patch) => data.saveSettings(orgId, patch).then(refresh),
      employee: (e) => data.upsertEmployee(orgId, e).then(refresh),
      job: (j) => data.upsertJob(orgId, j).then(refresh),
      deleteJob: (id) => data.deleteJob(id).then(refresh),
      time: (t) => data.upsertTimeEntry(orgId, t).then(refresh),
      deleteTime: (id) => data.deleteTimeEntry(id).then(refresh),
      item: (p) => data.upsertPayItem(orgId, p).then(refresh),
      deleteItem: (id) => data.deletePayItem(id).then(refresh),
      run: (r) => data.upsertRun(orgId, r).then(async (row) => { await refresh(); return row; }),
      finalize: (run, result, checklist) => data.finalizeRun(orgId, run, result, checklist).then(async (row) => { await refresh(); return row; }),
      reopen: (run) => data.reopenRun(run).then(refresh),
    },
  }), [orgId, state, error, refresh]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
export const usePayroll = () => useContext(Ctx);
