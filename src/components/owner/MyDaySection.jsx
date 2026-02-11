import { useState } from 'react';
import { ClipboardCheck, Check, Gauge } from 'lucide-react';
import OwnerChecklist from '../OwnerChecklist';
import { useAppStore } from '../../store/AppStoreContext';
import { useAuth } from '../../contexts/AuthContext';
import { genId } from '../../data';

export default function MyDaySection() {
  const { currentUser } = useAuth();
  const ownerStartChecklist = useAppStore((s) => s.ownerStartChecklist);
  const setOwnerStartChecklist = useAppStore((s) => s.setOwnerStartChecklist);
  const ownerEndChecklist = useAppStore((s) => s.ownerEndChecklist);
  const setOwnerEndChecklist = useAppStore((s) => s.setOwnerEndChecklist);
  const checklistLog = useAppStore((s) => s.checklistLog);
  const setChecklistLog = useAppStore((s) => s.setChecklistLog);
  const vehicles = useAppStore((s) => s.vehicles);
  const mileageLog = useAppStore((s) => s.mileageLog);
  const setMileageLog = useAppStore((s) => s.setMileageLog);

  const today = new Date().toISOString().slice(0, 10);
  const [vehicleId, setVehicleId] = useState('');
  const [odometer, setOdometer] = useState('');
  const [mileageSuccess, setMileageSuccess] = useState(false);

  const handleMileageSubmit = (e) => {
    e.preventDefault();
    if (!vehicleId || !odometer) return;
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    const odometerNum = Number(odometer);
    const vehicleName = vehicle?.name || 'Unknown';

    // Find previous odometer reading for this vehicle
    const prevEntry = [...mileageLog]
      .filter((e) => e.vehicleId === vehicleId)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      [0];

    setMileageLog([
      ...mileageLog,
      {
        id: genId(),
        vehicleId,
        vehicleName,
        odometer: odometerNum,
        date: today,
        notes: '',
        loggedBy: currentUser,
        createdAt: new Date().toISOString(),
      },
    ]);

    // Push to QuickBooks (fire and forget — don't block the UI)
    fetch('/api/qb-mileage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vehicleName,
        odometer: odometerNum,
        date: today,
        notes: '',
        loggedBy: currentUser,
        previousOdometer: prevEntry?.odometer || null,
      }),
    }).catch(() => {}); // silently fail if QB not connected

    setVehicleId('');
    setOdometer('');
    setMileageSuccess(true);
    setTimeout(() => setMileageSuccess(false), 2500);
  };

  const mileageFooter = (
    <div className="mt-4 pt-4 border-t border-border-subtle">
      <div className="flex items-center gap-2 mb-3">
        <Gauge size={16} className="text-emerald-500" />
        <span className="text-sm font-bold text-primary">Log Mileage</span>
      </div>
      <form onSubmit={handleMileageSubmit}>
        {mileageSuccess ? (
          <div className="flex items-center gap-2 py-1">
            <Check size={16} className="text-emerald-600" />
            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Mileage logged!</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <select
              required
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className="w-full rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Select vehicle...</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                type="number"
                required
                min="0"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
                placeholder="Odometer reading"
                className="flex-1 rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors cursor-pointer shrink-0"
              >
                Submit
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <ClipboardCheck size={20} className="text-brand-text" />
        <h2 className="text-lg font-bold text-primary">Daily Checklists</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <OwnerChecklist title="Start of Day" items={ownerStartChecklist} setItems={setOwnerStartChecklist} checklistType="owner-start" checklistLog={checklistLog} setChecklistLog={setChecklistLog} />
        <OwnerChecklist title="End of Day" items={ownerEndChecklist} setItems={setOwnerEndChecklist} checklistType="owner-end" checklistLog={checklistLog} setChecklistLog={setChecklistLog} footer={mileageFooter} />
      </div>
    </div>
  );
}
