import { User } from 'lucide-react';

const USERS = ['Jude Wilson', 'Ethan Brant', 'Braden Andrus'];

export default function NameSelector({ onSelect }) {
  const handleSelect = (name) => {
    localStorage.setItem('greenteam-user', name);
    onSelect(name);
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-lg border border-border-subtle p-8 max-w-sm w-full text-center">
        <img src="/favicon.png" alt="Lawn Care Hub" className="h-16 mx-auto mb-4 rounded-xl" />
        <h1 className="text-2xl font-bold text-primary mb-0.5">Lawn Care Hub</h1>
        <p className="text-secondary text-sm font-medium mb-1">Hey Jude's Lawn Care</p>
        <p className="text-tertiary text-sm mb-8">Select your name to continue</p>
        <div className="space-y-3">
          {USERS.map((name) => (
            <button
              key={name}
              onClick={() => handleSelect(name)}
              className="w-full flex items-center gap-3 px-5 py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-800 text-white font-semibold text-lg hover:opacity-90 transition-opacity cursor-pointer"
            >
              <User size={22} />
              {name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
