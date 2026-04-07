import { useState, useRef, useEffect } from 'react';
import {
  Search, Plus, Send, ArrowLeft, Phone, User, MoreVertical,
  MessageSquare, Clock, Check, CheckCheck, Trash2, Edit3,
} from 'lucide-react';

const STORAGE_KEY = 'hub-messages';

/* ─── Demo / local data helpers ─── */

function loadData() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { conversations: [], contacts: [] };
  } catch {
    return { conversations: [], contacts: [] };
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatPhone(phone) {
  const d = phone.replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === '1') return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return phone;
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMsgTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatMsgDate(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

/* ─── New Conversation Modal ─── */

function NewConvoModal({ onClose, onCreate }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const ref = useRef(null);

  useEffect(() => { ref.current?.focus(); }, []);

  const submit = () => {
    if (!phone.trim()) return;
    onCreate({ name: name.trim() || null, phone: phone.replace(/\D/g, '') });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card rounded-2xl shadow-2xl border border-border-subtle w-full max-w-sm p-5 space-y-4">
        <h2 className="text-lg font-bold text-primary">New Message</h2>
        <div>
          <label className="block text-xs font-medium text-secondary mb-1">Name (optional)</label>
          <input
            ref={ref}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="John Smith"
            className="w-full px-3 py-2.5 rounded-xl border border-border-subtle bg-surface text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand placeholder:text-muted"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-secondary mb-1">Phone number</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder="(803) 555-1234"
            className="w-full px-3 py-2.5 rounded-xl border border-border-subtle bg-surface text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand placeholder:text-muted"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border-subtle text-secondary text-sm font-medium hover:bg-surface-alt cursor-pointer">Cancel</button>
          <button onClick={submit} disabled={!phone.trim()} className="flex-1 py-2.5 rounded-xl bg-brand text-on-brand text-sm font-semibold hover:bg-brand-hover disabled:opacity-40 cursor-pointer">Start Chat</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Conversation List Item ─── */

function ConvoItem({ convo, active, onClick }) {
  const initials = convo.name
    ? convo.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '#';

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors cursor-pointer ${
        active ? 'bg-brand-light' : 'hover:bg-surface-alt'
      }`}
    >
      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
        active ? 'bg-brand text-on-brand' : 'bg-surface-alt text-secondary'
      }`}>
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className={`text-sm font-semibold truncate ${active ? 'text-brand-text-strong' : 'text-primary'}`}>
            {convo.name || formatPhone(convo.phone)}
          </span>
          <span className="text-[10px] text-muted shrink-0 ml-2">{timeAgo(convo.lastMessageAt)}</span>
        </div>
        <p className="text-xs text-muted truncate mt-0.5">{convo.lastMessage || 'No messages yet'}</p>
      </div>
      {convo.unread > 0 && (
        <span className="w-5 h-5 rounded-full bg-brand text-on-brand text-[10px] font-bold flex items-center justify-center shrink-0">
          {convo.unread}
        </span>
      )}
    </button>
  );
}

/* ─── Chat View ─── */

function ChatView({ convo, messages, onSend, onBack }) {
  const [text, setText] = useState('');
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [convo?.id]);

  const send = () => {
    if (!text.trim()) return;
    onSend(text.trim());
    setText('');
  };

  if (!convo) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted">
        <div className="text-center">
          <MessageSquare size={48} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">Select a conversation or start a new one</p>
        </div>
      </div>
    );
  }

  // Group messages by date
  const grouped = [];
  let lastDate = null;
  for (const msg of messages) {
    const d = formatMsgDate(msg.createdAt);
    if (d !== lastDate) {
      grouped.push({ type: 'date', label: d });
      lastDate = d;
    }
    grouped.push({ type: 'msg', ...msg });
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Chat header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle shrink-0">
        <button onClick={onBack} className="lg:hidden p-1 text-muted hover:text-primary cursor-pointer">
          <ArrowLeft size={20} />
        </button>
        <div className="w-9 h-9 rounded-full bg-surface-alt flex items-center justify-center text-xs font-bold text-secondary shrink-0">
          {convo.name ? convo.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) : '#'}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-primary truncate">{convo.name || formatPhone(convo.phone)}</h3>
          <p className="text-[11px] text-muted">{formatPhone(convo.phone)}</p>
        </div>
        <a
          href={`tel:${convo.phone}`}
          className="p-2 rounded-xl text-muted hover:text-primary hover:bg-surface-alt transition-colors"
          title="Call"
        >
          <Phone size={18} />
        </a>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages.length === 0 && (
          <div className="text-center text-muted text-sm py-12">
            <p>No messages yet. Say hello!</p>
          </div>
        )}
        {grouped.map((item, i) => {
          if (item.type === 'date') {
            return (
              <div key={`d-${i}`} className="flex justify-center py-3">
                <span className="text-[10px] font-semibold text-muted bg-surface-alt px-3 py-1 rounded-full">{item.label}</span>
              </div>
            );
          }
          const isMe = item.direction === 'outbound';
          return (
            <div key={item.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] sm:max-w-[70%] px-3.5 py-2 rounded-2xl ${
                isMe
                  ? 'bg-brand text-on-brand rounded-br-md'
                  : 'bg-surface-alt text-primary rounded-bl-md'
              }`}>
                <p className="text-sm whitespace-pre-wrap break-words">{item.body}</p>
                <div className={`flex items-center justify-end gap-1 mt-0.5 ${isMe ? 'text-on-brand/60' : 'text-muted'}`}>
                  <span className="text-[10px]">{formatMsgTime(item.createdAt)}</span>
                  {isMe && (
                    item.status === 'delivered' ? <CheckCheck size={12} /> :
                    item.status === 'sent' ? <Check size={12} /> :
                    <Clock size={10} />
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Compose */}
      <div className="shrink-0 border-t border-border-subtle px-4 py-3">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              placeholder="Type a message..."
              rows={1}
              className="w-full px-4 py-2.5 rounded-2xl border border-border-subtle bg-surface text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none placeholder:text-muted overflow-hidden"
              style={{ minHeight: '42px' }}
            />
          </div>
          <button
            onClick={send}
            disabled={!text.trim()}
            className="w-10 h-10 rounded-full bg-brand text-on-brand flex items-center justify-center hover:bg-brand-hover disabled:opacity-30 transition-colors cursor-pointer shrink-0"
          >
            <Send size={18} className="ml-0.5" />
          </button>
        </div>
        <p className="text-[10px] text-muted mt-1.5 text-center">
          Connect Twilio to send real SMS. Messages are local-only for now.
        </p>
      </div>
    </div>
  );
}

/* ─── Main Messages Page ─── */

export default function Messages() {
  const [data, setData] = useState(loadData);
  const [activeId, setActiveId] = useState(null);
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);

  useEffect(() => { saveData(data); }, [data]);

  const activeConvo = data.conversations.find((c) => c.id === activeId) || null;
  const activeMessages = activeConvo?.messages || [];

  const filteredConvos = data.conversations.filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (c.name || '').toLowerCase().includes(s) || c.phone.includes(s) || (c.lastMessage || '').toLowerCase().includes(s);
  }).sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));

  const createConvo = ({ name, phone }) => {
    // Check if convo with this phone exists
    const existing = data.conversations.find((c) => c.phone === phone);
    if (existing) {
      setActiveId(existing.id);
      return;
    }
    const convo = {
      id: genId(),
      name,
      phone,
      messages: [],
      lastMessage: null,
      lastMessageAt: new Date().toISOString(),
      unread: 0,
    };
    setData((prev) => ({ ...prev, conversations: [convo, ...prev.conversations] }));
    setActiveId(convo.id);
  };

  const sendMessage = (body) => {
    const msg = {
      id: genId(),
      body,
      direction: 'outbound',
      status: 'sent',
      createdAt: new Date().toISOString(),
    };
    setData((prev) => ({
      ...prev,
      conversations: prev.conversations.map((c) =>
        c.id === activeId
          ? { ...c, messages: [...c.messages, msg], lastMessage: body, lastMessageAt: msg.createdAt }
          : c
      ),
    }));
  };

  const deleteConvo = (id) => {
    setData((prev) => ({ ...prev, conversations: prev.conversations.filter((c) => c.id !== id) }));
    if (activeId === id) setActiveId(null);
  };

  // Mobile: show chat or list
  const showingChat = activeId !== null;

  return (
    <div className="bg-card overflow-hidden h-[calc(100vh-3.5rem)] lg:h-screen">
      <div className="flex h-full">
        {/* ─── Conversation List ─── */}
        <div className={`w-full lg:w-80 xl:w-96 border-r border-border-subtle flex flex-col shrink-0 ${showingChat ? 'hidden lg:flex' : 'flex'}`}>
          {/* Header */}
          <div className="px-4 py-3 border-b border-border-subtle shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-lg font-bold text-primary">Messages</h1>
              <button
                onClick={() => setShowNew(true)}
                className="w-8 h-8 rounded-full bg-brand text-on-brand flex items-center justify-center hover:bg-brand-hover cursor-pointer"
                title="New message"
              >
                <Plus size={18} />
              </button>
            </div>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-border-subtle bg-surface text-sm text-primary focus:outline-none focus:ring-2 focus:ring-brand placeholder:text-muted"
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {filteredConvos.length === 0 ? (
              <div className="text-center py-12 text-muted">
                <MessageSquare size={32} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm">{search ? 'No matches' : 'No conversations yet'}</p>
                {!search && (
                  <button onClick={() => setShowNew(true)} className="mt-3 text-xs text-brand font-semibold hover:underline cursor-pointer">
                    Start your first conversation
                  </button>
                )}
              </div>
            ) : (
              filteredConvos.map((c) => (
                <div key={c.id} className="relative group">
                  <ConvoItem convo={c} active={activeId === c.id} onClick={() => setActiveId(c.id)} />
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteConvo(c.id); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-muted/0 group-hover:text-muted/40 hover:!text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all cursor-pointer"
                    title="Delete conversation"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ─── Chat View ─── */}
        <div className={`flex-1 flex flex-col min-w-0 ${!showingChat ? 'hidden lg:flex' : 'flex'}`}>
          <ChatView
            convo={activeConvo}
            messages={activeMessages}
            onSend={sendMessage}
            onBack={() => setActiveId(null)}
          />
        </div>
      </div>

      {showNew && <NewConvoModal onClose={() => setShowNew(false)} onCreate={createConvo} />}
    </div>
  );
}
