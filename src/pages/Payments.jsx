import { CreditCard, Plus } from 'lucide-react';

export default function Payments() {
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex items-end justify-between pt-8">
        <div>
          <h1 className="text-3xl font-bold text-primary tracking-tight">Payments</h1>
          <p className="text-sm text-muted mt-1">Money collected from clients across all invoices</p>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border-subtle p-6">
        <button
          className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-brand text-on-brand font-semibold hover:bg-brand-hover transition-colors cursor-pointer"
        >
          <Plus size={18} />
          Record Payment
        </button>
      </div>

      <div className="bg-card rounded-2xl border border-border-subtle p-12 text-center">
        <CreditCard size={36} className="mx-auto text-muted/40 mb-3" />
        <p className="text-sm text-muted">No payments yet</p>
        <p className="text-[11px] text-muted/60 mt-1">Payments will appear here once invoices are paid</p>
      </div>
    </div>
  );
}
