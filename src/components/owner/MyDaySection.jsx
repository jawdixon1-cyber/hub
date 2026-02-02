import { ClipboardCheck } from 'lucide-react';
import OwnerChecklist from '../OwnerChecklist';
import { useAppStore } from '../../store/AppStoreContext';

export default function MyDaySection() {
  const ownerStartChecklist = useAppStore((s) => s.ownerStartChecklist);
  const setOwnerStartChecklist = useAppStore((s) => s.setOwnerStartChecklist);
  const ownerEndChecklist = useAppStore((s) => s.ownerEndChecklist);
  const setOwnerEndChecklist = useAppStore((s) => s.setOwnerEndChecklist);
  const checklistLog = useAppStore((s) => s.checklistLog);
  const setChecklistLog = useAppStore((s) => s.setChecklistLog);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <ClipboardCheck size={20} className="text-brand-text" />
        <h2 className="text-lg font-bold text-primary">Daily Checklists</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <OwnerChecklist title="Start of Day" items={ownerStartChecklist} setItems={setOwnerStartChecklist} checklistType="owner-start" checklistLog={checklistLog} setChecklistLog={setChecklistLog} />
        <OwnerChecklist title="End of Day" items={ownerEndChecklist} setItems={setOwnerEndChecklist} checklistType="owner-end" checklistLog={checklistLog} setChecklistLog={setChecklistLog} />
      </div>
    </div>
  );
}
