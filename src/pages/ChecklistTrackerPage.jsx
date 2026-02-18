import ChecklistTracker from '../components/ChecklistTracker';
import { useAppStore } from '../store/AppStoreContext';

export default function ChecklistTrackerPage() {
  const checklistLog = useAppStore((s) => s.checklistLog);

  return (
    <div>
      <ChecklistTracker checklistLog={checklistLog} />
    </div>
  );
}
