import { useState, useEffect, useRef, useMemo } from 'react';
import { Megaphone, ChevronRight, AlertCircle, Lightbulb, Check, ClipboardCheck, FlagTriangleRight, PartyPopper, ArrowLeft, ShieldCheck, BookOpen, Receipt, Gauge, Wrench, X, MessageSquare, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ChecklistPanel from '../components/ChecklistPanel';
import ReportRepairModal from '../components/ReportRepairModal';
import MileageModal from '../components/MileageModal';
import ReceiptScanModal from '../components/ReceiptScanModal';
import { useAppStore } from '../store/AppStoreContext';
import { useAuth } from '../contexts/AuthContext';
import { genId, getActiveRepairs } from '../data';
import { getTodayInTimezone } from '../utils/timezone';


export default function Home() {
  const navigate = useNavigate();
  const { user, currentUser } = useAuth();
  const userEmail = user?.email;

  const announcements = useAppStore((s) => s.announcements);
  const setAnnouncements = useAppStore((s) => s.setAnnouncements);
  const teamChecklist = useAppStore((s) => s.teamChecklist);
  const teamEndChecklist = useAppStore((s) => s.teamEndChecklist);
  const checklistLog = useAppStore((s) => s.checklistLog);
  const setChecklistLog = useAppStore((s) => s.setChecklistLog);
  const vehicles = useAppStore((s) => s.vehicles);
  const mileageLog = useAppStore((s) => s.mileageLog);
  const setMileageLog = useAppStore((s) => s.setMileageLog);
  const equipment = useAppStore((s) => s.equipment);
  const setEquipment = useAppStore((s) => s.setEquipment);
  const equipmentCategories = useAppStore((s) => s.equipmentCategories);
  const receiptLog = useAppStore((s) => s.receiptLog);
  const setReceiptLog = useAppStore((s) => s.setReceiptLog);
  const suggestions = useAppStore((s) => s.suggestions);
  const setSuggestions = useAppStore((s) => s.setSuggestions);

  // Modal states for quick actions
  const [showRepairModal, setShowRepairModal] = useState(false);
  const [showMileageModal, setShowMileageModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showIdeaModal, setShowIdeaModal] = useState(false);
  const [successToast, setSuccessToast] = useState(null);
  const [ideaForm, setIdeaForm] = useState({ type: 'idea', title: '', description: '' });

  const [closingMode, setClosingMode] = useState(false);
  const [startedDay, setStartedDay] = useState(false);

  const weeklyVerse = useMemo(() => {
    // ESV — curated for work ethic & personal growth
    const verses = [
      // Work & diligence
      { text: 'Whatever you do, work heartily, as for the Lord and not for men.', ref: 'Colossians 3:23' },
      { text: 'Commit your work to the Lord, and your plans will be established.', ref: 'Proverbs 16:3' },
      { text: 'The hand of the diligent will rule, while the slothful will be put to forced labor.', ref: 'Proverbs 12:24' },
      { text: 'The plans of the diligent lead surely to abundance, but everyone who is hasty comes only to want.', ref: 'Proverbs 21:5' },
      { text: 'In all toil there is profit, but mere talk tends only to poverty.', ref: 'Proverbs 14:23' },
      { text: 'Whatever your hand finds to do, do it with your might.', ref: 'Ecclesiastes 9:10' },
      { text: 'Do your best to present yourself to God as one approved, a worker who has no need to be ashamed.', ref: '2 Timothy 2:15' },
      { text: 'Let the favor of the Lord our God be upon us, and establish the work of our hands upon us; yes, establish the work of our hands!', ref: 'Psalm 90:17' },
      { text: 'A slack hand causes poverty, but the hand of the diligent makes rich.', ref: 'Proverbs 10:4' },
      { text: 'He who gathers in summer is a prudent son, but he who sleeps in harvest is a son who brings shame.', ref: 'Proverbs 10:5' },
      // Teamwork & serving others
      { text: 'Two are better than one, because they have a good reward for their toil.', ref: 'Ecclesiastes 4:9' },
      { text: 'Iron sharpens iron, and one man sharpens another.', ref: 'Proverbs 27:17' },
      { text: 'As each has received a gift, use it to serve one another, as good stewards of God\u2019s varied grace.', ref: '1 Peter 4:10' },
      { text: 'And let us consider how to stir up one another to love and good works.', ref: 'Hebrews 10:24' },
      { text: 'Let all that you do be done in love.', ref: '1 Corinthians 16:14' },
      { text: 'Let your light shine before others, so that they may see your good works and give glory to your Father who is in heaven.', ref: 'Matthew 5:16' },
      // Perseverance & growth
      { text: 'And let us not grow weary of doing good, for in due season we will reap, if we do not give up.', ref: 'Galatians 6:9' },
      { text: 'I can do all things through him who strengthens me.', ref: 'Philippians 4:13' },
      { text: 'He gives power to the faint, and to him who has no might he increases strength.', ref: 'Isaiah 40:29' },
      { text: 'Be steadfast, immovable, always abounding in the work of the Lord, knowing that in the Lord your labor is not in vain.', ref: '1 Corinthians 15:58' },
      { text: 'Not only that, but we rejoice in our sufferings, knowing that suffering produces endurance, and endurance produces character, and character produces hope.', ref: 'Romans 5:3\u20134' },
      // Courage & trust
      { text: 'Be strong and courageous. Do not be frightened, and do not be dismayed, for the Lord your God is with you wherever you go.', ref: 'Joshua 1:9' },
      { text: 'Trust in the Lord with all your heart, and do not lean on your own understanding.', ref: 'Proverbs 3:5' },
      { text: 'For we are his workmanship, created in Christ Jesus for good works, which God prepared beforehand, that we should walk in them.', ref: 'Ephesians 2:10' },
      { text: 'Do not be slothful in zeal, be fervent in spirit, serve the Lord.', ref: 'Romans 12:11' },
      { text: 'Well done, good and faithful servant. You have been faithful over a little; I will set you over much.', ref: 'Matthew 25:21' },
      // Purpose & character
      { text: 'One thing I do: forgetting what lies behind and straining forward to what lies ahead, I press on toward the goal.', ref: 'Philippians 3:13\u201314' },
      { text: 'The Lord will fulfill his purpose for me; your steadfast love, O Lord, endures forever.', ref: 'Psalm 138:8' },
      { text: 'And God is able to make all grace abound to you, so that having all sufficiency in all things at all times, you may abound in every good work.', ref: '2 Corinthians 9:8' },
      { text: 'Whoever gathers little by little will increase it.', ref: 'Proverbs 13:11' },
      { text: 'For God gave us a spirit not of fear but of power and love and self-control.', ref: '2 Timothy 1:7' },
      { text: 'A generous man will prosper; whoever refreshes others will himself be refreshed.', ref: 'Proverbs 11:25' },
      { text: 'Blessed is the man who remains steadfast under trial, for when he has stood the test he will receive the crown of life.', ref: 'James 1:12' },
      { text: 'The Lord is my strength and my shield; in him my heart trusts, and I am helped.', ref: 'Psalm 28:7' },
      { text: 'Whatever is true, whatever is honorable, whatever is just, whatever is pure, whatever is lovely, whatever is commendable — think about these things.', ref: 'Philippians 4:8' },
      { text: 'But they who wait for the Lord shall renew their strength; they shall mount up with wings like eagles; they shall run and not be weary; they shall walk and not faint.', ref: 'Isaiah 40:31' },
      { text: 'The Lord your God is in your midst, a mighty one who will save; he will rejoice over you with gladness; he will quiet you by his love.', ref: 'Zephaniah 3:17' },
      { text: 'For I know the plans I have for you, declares the Lord, plans for welfare and not for evil, to give you a future and a hope.', ref: 'Jeremiah 29:11' },
      { text: 'He who began a good work in you will bring it to completion at the day of Jesus Christ.', ref: 'Philippians 1:6' },
      { text: 'The Lord is my shepherd; I shall not want.', ref: 'Psalm 23:1' },
      { text: 'Have I not commanded you? Be strong and courageous. Do not be frightened, and do not be dismayed, for the Lord your God is with you wherever you go.', ref: 'Joshua 1:9' },
      { text: 'Unless the Lord builds the house, those who build it labor in vain.', ref: 'Psalm 127:1' },
      { text: 'The Lord is near to all who call on him, to all who call on him in truth.', ref: 'Psalm 145:18' },
      { text: 'For God is not unjust so as to overlook your work and the love that you have shown for his name in serving the saints.', ref: 'Hebrews 6:10' },
      { text: 'I perceived that there is nothing better for them than to be joyful and to do good as long as they live; also that everyone should eat and drink and take pleasure in all his toil — this is God\u2019s gift to man.', ref: 'Ecclesiastes 3:12\u201313' },
      { text: 'The Lord will fight for you, and you have only to be silent.', ref: 'Exodus 14:14' },
      { text: 'Be watchful, stand firm in the faith, act like men, be strong. Let all that you do be done in love.', ref: '1 Corinthians 16:13\u201314' },
      { text: 'But the fruit of the Spirit is love, joy, peace, patience, kindness, goodness, faithfulness, gentleness, self-control.', ref: 'Galatians 5:22\u201323' },
      { text: 'Therefore, having put away falsehood, let each one of you speak the truth with his neighbor, for we are members one of another.', ref: 'Ephesians 4:25' },
      { text: 'Whoever walks in integrity walks securely, but he who makes his ways crooked will be found out.', ref: 'Proverbs 10:9' },
      { text: 'The heart of man plans his way, but the Lord establishes his steps.', ref: 'Proverbs 16:9' },
      { text: 'Teach us to number our days that we may get a heart of wisdom.', ref: 'Psalm 90:12' },
    ];
    // Rotate weekly — one verse per week
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const weekNum = Math.floor(((now - start) / 86400000 + start.getDay()) / 7);
    return verses[weekNum % verses.length];
  }, []);

  // Derive flow state from checklistLog
  const today = getTodayInTimezone();
  const openingLog = checklistLog.find((e) => e.date === today && e.checklistType === 'team-start');
  const closingLog = checklistLog.find((e) => e.date === today && e.checklistType === 'team-end');
  const openingDone = openingLog && openingLog.completedItems === openingLog.totalItems;
  const closingDone = closingLog && closingLog.completedItems === closingLog.totalItems;

  let flowState;
  if (!openingDone) {
    flowState = 'needs-opening';
  } else if (closingDone) {
    flowState = 'done';
  } else if (closingMode) {
    flowState = 'needs-closing';
  } else {
    flowState = 'working';
  }

  const containerRef = useRef(null);

  // Scroll to top on flow state changes
  useEffect(() => {
    // Immediate + delayed to handle mobile Safari quirks
    const scrollTop = () => {
      if (containerRef.current) containerRef.current.scrollTop = 0;
      window.scrollTo(0, 0);
    };
    scrollTop();
    const t = setTimeout(scrollTop, 50);
    return () => clearTimeout(t);
  }, [flowState, startedDay, closingMode]);

  const firstName = currentUser?.split(' ')[0] || 'Team Member';

  const unacknowledged = announcements.filter((a) => !a.acknowledgedBy?.[userEmail]);

  const handleAcknowledge = (id) => {
    setAnnouncements(
      announcements.map((a) =>
        a.id === id
          ? {
              ...a,
              acknowledgedBy: {
                ...a.acknowledgedBy,
                [userEmail]: { name: currentUser, at: new Date().toISOString() },
              },
            }
          : a
      )
    );
  };

  // --- Modal submit handlers ---
  const handleRepairSubmit = (form) => {
    const today = new Date().toLocaleDateString('en-US');
    setEquipment(
      equipment.map((eq) => {
        if (eq.id !== form.equipmentId) return eq;
        const existing = getActiveRepairs(eq);
        return {
          ...eq,
          status: 'needs-repair',
          activeRepairs: [
            ...existing,
            {
              id: genId(),
              issue: form.problemDescription,
              reportedBy: form.reportedBy,
              reportedDate: today,
              urgency: 'critical',
              photo: form.photo,
            },
          ],
          reportedIssue: undefined,
          reportedBy: undefined,
          reportedDate: undefined,
          urgency: undefined,
          photo: undefined,
        };
      })
    );
    setShowRepairModal(false);
    setSuccessToast('Repair reported! The general manager has been notified.');
    setTimeout(() => setSuccessToast(null), 4000);
  };

  const handleMileageSubmit = (form) => {
    const vehicle = vehicles.find((v) => v.id === form.vehicleId);
    const odometerNum = Number(form.odometer);
    const vehicleName = vehicle ? (vehicle.nickname || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.name || 'Unknown') : 'Unknown';

    const prevEntry = [...mileageLog]
      .filter((e) => e.vehicleId === form.vehicleId)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      [0];

    setMileageLog([
      ...mileageLog,
      {
        id: genId(),
        vehicleId: form.vehicleId,
        vehicleName,
        odometer: odometerNum,
        date: form.date,
        notes: form.notes,
        loggedBy: form.loggedBy,
        createdAt: new Date().toISOString(),
      },
    ]);

    setShowMileageModal(false);
    setSuccessToast('Mileage logged successfully!');
    setTimeout(() => setSuccessToast(null), 4000);
  };

  const handleReceiptSubmit = (form) => {
    setReceiptLog([
      ...receiptLog,
      {
        id: genId(),
        imageUrl: form.imageUrl || null,
        imageData: form.imageData || null,
        payee: form.payee,
        description: form.description,
        items: form.items || [],
        amount: form.amount,
        date: form.date,
        loggedBy: form.loggedBy,
        createdAt: new Date().toISOString(),
        status: 'pending',
      },
    ]);
    setShowReceiptModal(false);
    setSuccessToast('Receipt saved!');
    setTimeout(() => setSuccessToast(null), 4000);
  };

  const handleIdeaSubmit = (e) => {
    e.preventDefault();
    const today = new Date().toLocaleDateString('en-US');
    setSuggestions([
      {
        id: genId(),
        type: ideaForm.type,
        title: ideaForm.title.trim(),
        description: ideaForm.description.trim(),
        submittedBy: currentUser,
        submittedByEmail: user?.email?.toLowerCase(),
        date: today,
        status: 'New',
      },
      ...suggestions,
    ]);
    setShowIdeaModal(false);
    setIdeaForm({ type: 'idea', title: '', description: '' });
    setSuccessToast('Thanks for your submission! It\'s been sent to the general manager.');
    setTimeout(() => setSuccessToast(null), 4000);
  };

  const handleInlineMileage = ({ vehicleId, odometer }) => {
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    const odometerNum = Number(odometer);
    const vehicleName = vehicle ? (vehicle.nickname || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.name || 'Unknown') : 'Unknown';
    const todayISO = new Date().toISOString().slice(0, 10);

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
        date: todayISO,
        notes: '',
        loggedBy: currentUser,
        createdAt: new Date().toISOString(),
      },
    ]);
  };

  const quickLinks = (
    <div className="space-y-3">
      {/* Jobs */}
      <div className="bg-card rounded-2xl border border-border-subtle shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-border-subtle">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted">Jobs</h3>
        </div>
        <div className="p-2 space-y-1">
          <a
            href="jobber://"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-alt transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
              <ChevronRight size={16} className="text-blue-500" />
            </div>
            <span className="text-sm font-semibold text-primary">Open Jobber</span>
          </a>
          <button
            onClick={() => navigate('/guides')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-alt transition-colors text-left cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0">
              <BookOpen size={16} className="text-purple-500" />
            </div>
            <span className="text-sm font-semibold text-primary">Playbooks</span>
          </button>
        </div>
      </div>

      {/* Log & Track */}
      <div className="bg-card rounded-2xl border border-border-subtle shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-border-subtle">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted">Log & Track</h3>
        </div>
        <div className="p-2 space-y-1">
          <button
            onClick={() => setShowMileageModal(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-alt transition-colors text-left cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
              <Gauge size={16} className="text-emerald-500" />
            </div>
            <span className="text-sm font-semibold text-primary">Mileage</span>
          </button>
          <button
            onClick={() => setShowReceiptModal(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-alt transition-colors text-left cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center shrink-0">
              <Receipt size={16} className="text-violet-500" />
            </div>
            <span className="text-sm font-semibold text-primary">Receipts</span>
          </button>
        </div>
      </div>

      {/* Report */}
      <div className="bg-card rounded-2xl border border-border-subtle shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-border-subtle">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted">Report</h3>
        </div>
        <div className="p-2 space-y-1">
          <button
            onClick={() => setShowRepairModal(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-alt transition-colors text-left cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-orange-500/15 flex items-center justify-center shrink-0">
              <Wrench size={16} className="text-orange-500" />
            </div>
            <span className="text-sm font-semibold text-primary">Report Repair</span>
          </button>
          <button
            onClick={() => { setShowIdeaModal(true); setIdeaForm({ type: 'idea', title: '', description: '' }); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-alt transition-colors text-left cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
              <Lightbulb size={16} className="text-amber-500" />
            </div>
            <span className="text-sm font-semibold text-primary">Submit Idea</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className="flex flex-col h-[calc(100svh-9rem)] overflow-y-auto md:h-auto md:overflow-visible">
      {/* Blocking announcement modal */}
      {unacknowledged.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-border-subtle shrink-0">
              <Megaphone size={18} className="text-brand-text" />
              <h2 className="text-lg font-bold text-primary">New Announcements</h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                {unacknowledged.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {unacknowledged.map((a) => (
                <div
                  key={a.id}
                  className={`rounded-xl border p-5 ${
                    a.priority === 'high'
                      ? 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/40'
                      : 'border-border-subtle bg-surface'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="text-base font-bold text-primary">{a.title}</h3>
                    {a.priority === 'high' && (
                      <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                        HIGH
                      </span>
                    )}
                    {a.priority === 'normal' && (
                      <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-surface-alt text-secondary">
                        NORMAL
                      </span>
                    )}
                  </div>
                  <p className="text-secondary text-sm leading-relaxed mb-4">{a.message}</p>
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted">
                      <span>Posted by {a.postedBy}</span>
                      <span className="ml-3">{a.date}</span>
                    </div>
                    <button
                      onClick={() => handleAcknowledge(a.id)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-on-brand text-xs font-semibold hover:bg-brand-hover transition-colors cursor-pointer"
                    >
                      <Check size={14} />
                      Got it
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Day progress bar — hidden on initial splash and done state */}
      {!(flowState === 'needs-opening' && !startedDay) && flowState !== 'done' && (
        <div className="flex items-center gap-1.5 mb-4">
          {[
            { label: 'Opening', done: openingDone, active: flowState === 'needs-opening' },
            { label: 'Working', done: flowState === 'needs-closing' || closingDone, active: flowState === 'working' },
            { label: 'Wrap Up', done: closingDone, active: flowState === 'needs-closing' },
          ].map((step, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className={`w-full h-1.5 rounded-full transition-colors ${
                step.done
                  ? 'bg-brand'
                  : step.active
                    ? 'bg-brand/50'
                    : 'bg-border-subtle'
              }`} />
              <span className={`text-[10px] font-semibold transition-colors ${
                step.done
                  ? 'text-brand-text'
                  : step.active
                    ? 'text-primary'
                    : 'text-muted'
              }`}>{step.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Flow State: needs-opening */}
      {flowState === 'needs-opening' && !startedDay && (
        <div className="flex flex-col items-center justify-center text-center flex-1 py-12 sm:py-20">
          <ClipboardCheck size={56} className="text-brand-text mb-4" />
          <h2 className="text-2xl sm:text-3xl font-bold text-primary mb-3">Good morning, {firstName}!</h2>
          <p className="text-sm italic text-secondary max-w-xs mb-1">"{weeklyVerse.text}"</p>
          <p className="text-xs text-muted mb-8">— {weeklyVerse.ref}</p>
          <button
            onClick={() => setStartedDay(true)}
            className="px-10 py-4 rounded-2xl bg-brand text-on-brand font-bold text-lg hover:bg-brand-hover transition-colors cursor-pointer shadow-lg"
          >
            Start My Day
          </button>
        </div>
      )}

      {/* Flow State: needs-opening — checklist */}
      {flowState === 'needs-opening' && startedDay && (
        <ChecklistPanel title="Opening" items={teamChecklist} checklistType="team-start" checklistLog={checklistLog} setChecklistLog={setChecklistLog} />
      )}

      {/* Flow State: working */}
      {flowState === 'working' && (
        <>
          <button
            onClick={() => navigate('/standards')}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-500/20 hover:border-violet-500/40 transition-colors cursor-pointer mb-4 text-left"
          >
            <div className="w-9 h-9 rounded-lg bg-violet-500/15 flex items-center justify-center shrink-0">
              <ShieldCheck size={18} className="text-violet-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-primary">What&apos;s Expected</p>
              <p className="text-xs text-muted">The standard. No exceptions.</p>
            </div>
            <ChevronRight size={16} className="text-muted shrink-0" />
          </button>

          {quickLinks}

          <button
            onClick={() => setClosingMode(true)}
            className="mt-4 flex items-center justify-center gap-2 w-full py-4 rounded-2xl bg-brand-light text-brand-text font-bold text-base hover:bg-brand-light/80 transition-colors cursor-pointer border border-brand/20 shadow-sm"
          >
            <FlagTriangleRight size={18} />
            <span className="flex flex-col items-start leading-tight">
              <span>Done for the day? Wrap Up</span>
              <span className="text-xs font-normal opacity-70">Complete your closing checklist</span>
            </span>
          </button>
        </>
      )}

      {/* Flow State: needs-closing */}
      {flowState === 'needs-closing' && (
        <>
          <div className="flex items-center gap-3 mb-4 sm:mb-6">
            <FlagTriangleRight size={24} className="text-indigo-500" />
            <h2 className="text-xl sm:text-2xl font-bold text-primary">Closing Checklist</h2>
          </div>
          <button
            onClick={() => setClosingMode(false)}
            className="inline-flex items-center gap-1.5 text-sm text-secondary hover:text-primary mb-3 cursor-pointer"
          >
            <ArrowLeft size={16} />
            Back to dashboard
          </button>
          <ChecklistPanel title="Closing" items={teamEndChecklist} checklistType="team-end" checklistLog={checklistLog} setChecklistLog={setChecklistLog} mileage={{ vehicles, onSubmit: handleInlineMileage }} />
        </>
      )}

      {/* Flow State: done */}
      {flowState === 'done' && (
        <>
          <div className="flex flex-col items-center text-center py-6 sm:py-10 mb-4 sm:mb-6">
            <PartyPopper size={48} className="text-amber-500 mb-3" />
            <h2 className="text-2xl sm:text-3xl font-bold text-primary mb-2">Great work today!</h2>
          </div>
          {quickLinks}
        </>
      )}

      {/* DEV: Reset daily flow for testing */}
      <button
        onClick={() => {
          setChecklistLog(checklistLog.filter((e) => e.date !== today));
          setClosingMode(false);
          setStartedDay(false);
        }}
        className="mt-6 self-center text-xs text-muted hover:text-secondary underline cursor-pointer"
      >
        Reset daily flow (testing)
      </button>

      {/* Report Repair Modal */}
      {showRepairModal && (
        <ReportRepairModal
          equipment={equipment}
          equipmentCategories={equipmentCategories}
          currentUser={currentUser}
          onSubmit={handleRepairSubmit}
          onClose={() => setShowRepairModal(false)}
        />
      )}

      {/* Mileage Modal */}
      {showMileageModal && (
        <MileageModal
          vehicles={vehicles}
          currentUser={currentUser}
          onSubmit={handleMileageSubmit}
          onClose={() => setShowMileageModal(false)}
        />
      )}

      {/* Receipt Scan Modal */}
      {showReceiptModal && (
        <ReceiptScanModal
          currentUser={currentUser}
          onSubmit={handleReceiptSubmit}
          onClose={() => setShowReceiptModal(false)}
        />
      )}

      {/* Submit Idea Modal */}
      {showIdeaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowIdeaModal(false)}>
          <div className="bg-card rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-amber-500 to-yellow-500 px-8 py-6 relative">
              <button
                onClick={() => setShowIdeaModal(false)}
                className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <X size={24} />
              </button>
              <h2 className="text-2xl font-bold text-white">Submit Idea</h2>
            </div>
            <form onSubmit={handleIdeaSubmit} className="p-8 overflow-y-auto space-y-5">
              <div>
                <label className="block text-sm font-semibold text-secondary mb-2">What type?</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setIdeaForm({ ...ideaForm, type: 'idea' })}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                      ideaForm.type === 'idea'
                        ? 'bg-amber-500 text-white'
                        : 'bg-surface-alt text-secondary hover:bg-surface-strong'
                    }`}
                  >
                    <Lightbulb size={16} />
                    Business Idea
                  </button>
                  <button
                    type="button"
                    onClick={() => setIdeaForm({ ...ideaForm, type: 'feedback' })}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                      ideaForm.type === 'feedback'
                        ? 'bg-blue-500 text-white'
                        : 'bg-surface-alt text-secondary hover:bg-surface-strong'
                    }`}
                  >
                    <MessageSquare size={16} />
                    Software Idea
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-secondary mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={ideaForm.title}
                  onChange={(e) => setIdeaForm({ ...ideaForm, title: e.target.value })}
                  className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition"
                  placeholder={ideaForm.type === 'idea' ? "What's your idea?" : 'What could be better?'}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-secondary mb-1">Description</label>
                <textarea
                  required
                  rows={4}
                  value={ideaForm.description}
                  onChange={(e) => setIdeaForm({ ...ideaForm, description: e.target.value })}
                  className="w-full rounded-lg border border-border-strong px-4 py-2.5 text-primary focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition resize-y"
                  placeholder={ideaForm.type === 'idea' ? 'Describe your idea and how it helps the business...' : "Describe the issue or what you'd like to see improved..."}
                />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowIdeaModal(false)}
                  className="px-5 py-2.5 rounded-lg border border-border-strong text-secondary font-medium hover:bg-surface transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 transition-colors cursor-pointer"
                >
                  Submit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Success toast */}
      {successToast && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-[fadeIn_0.2s_ease-out]" onClick={() => setSuccessToast(null)}>
          <div className="bg-card rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="text-lg font-bold text-primary mb-2">Done!</h3>
            <p className="text-sm text-secondary">{successToast}</p>
            <button onClick={() => setSuccessToast(null)} className="mt-5 px-6 py-2.5 rounded-xl bg-brand text-on-brand text-sm font-semibold hover:bg-brand-hover transition-colors cursor-pointer">
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
