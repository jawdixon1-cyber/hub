import { useState } from 'react';
import { X, Upload } from 'lucide-react';
import { EQUIPMENT_TYPES } from '../data';

export default function ReportRepairModal({ equipment, currentUser, onSubmit, onClose, equipmentCategories = [] }) {
  const allTypes = equipmentCategories.length > 0 ? equipmentCategories : EQUIPMENT_TYPES;

  const [form, setForm] = useState({
    typeFilter: '',
    equipmentId: '',
    problemDescription: '',
    photo: null,
    reportedBy: currentUser,
  });
  const [photoPreview, setPhotoPreview] = useState(null);

  // Equipment filtered by selected type
  const filteredEquipment = form.typeFilter
    ? equipment.filter((eq) => eq.type === form.typeFilter)
    : [];

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setForm((prev) => ({ ...prev, photo: reader.result }));
        setPhotoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        className="bg-card rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="bg-gradient-to-r from-orange-500 to-red-500 px-8 py-6 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X size={24} />
          </button>
          <h2 className="text-2xl font-bold text-white">Report Repair</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-8 overflow-y-auto space-y-5">
          <div>
            <label className="block text-sm font-semibold text-secondary mb-1">Equipment Type</label>
            <select
              required
              value={form.typeFilter}
              onChange={(e) => setForm({ ...form, typeFilter: e.target.value, equipmentId: '' })}
              className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition"
            >
              <option value="">Select type...</option>
              {allTypes.map((t) => {
                const count = equipment.filter((eq) => eq.type === t.value).length;
                return count > 0 ? (
                  <option key={t.value} value={t.value}>{t.label} ({count})</option>
                ) : null;
              })}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-secondary mb-1">Equipment</label>
            <select
              required
              value={form.equipmentId}
              onChange={(e) => setForm({ ...form, equipmentId: e.target.value })}
              disabled={!form.typeFilter}
              className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">{form.typeFilter ? 'Select equipment...' : 'Select a type first'}</option>
              {filteredEquipment.map((eq) => (
                <option key={eq.id} value={eq.id}>{eq.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-secondary mb-1">Problem Description</label>
            <textarea
              required
              rows={4}
              value={form.problemDescription}
              onChange={(e) => setForm({ ...form, problemDescription: e.target.value })}
              className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition resize-y"
              placeholder="Describe what's wrong..."
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-secondary mb-1">Photo</label>
            <label className="flex items-center gap-3 px-4 py-3 rounded-lg border border-dashed border-border-strong cursor-pointer hover:border-orange-400 hover:bg-orange-50/50 transition-colors">
              <Upload size={20} className="text-muted" />
              <span className="text-sm text-tertiary">
                {photoPreview ? 'Photo attached — click to change' : 'Upload a photo of the issue'}
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="hidden"
              />
            </label>
            {photoPreview && (
              <img
                src={photoPreview}
                alt="Preview"
                className="mt-2 rounded-lg max-h-32 object-cover"
              />
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-secondary mb-1">Reported by</label>
            <input
              type="text"
              value={form.reportedBy}
              readOnly
              className="w-full rounded-lg border border-border-default px-4 py-2.5 text-tertiary bg-surface cursor-not-allowed"
            />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-lg border border-border-strong text-secondary font-medium hover:bg-surface transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-orange-500 to-red-500 text-white font-medium hover:opacity-90 transition-opacity cursor-pointer"
            >
              Submit Report
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
