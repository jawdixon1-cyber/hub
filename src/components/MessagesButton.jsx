import { MessageSquare } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function MessagesButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const active = location.pathname === '/messages';

  return (
    <button
      onClick={() => navigate('/messages')}
      className={`fixed top-4 right-20 z-50 w-11 h-11 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 cursor-pointer ${
        active ? 'bg-brand text-on-brand' : 'bg-blue-500 hover:bg-blue-600 text-white'
      }`}
      title="Messages"
    >
      <MessageSquare size={20} />
    </button>
  );
}
