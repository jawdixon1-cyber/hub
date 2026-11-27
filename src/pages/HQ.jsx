import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/AppStoreContext';
import { useJobberList } from '../lib/jobberLights';

// Hey Jude's HQ: a 3D globe with one glowing building per part of the business.
// Every building is live from Hub: green = all good, yellow = needs you soon, red = needs you now.
// Tap a building to open that page.

const COLORS = { green: '#00DF00', yellow: '#FACC15', red: '#FF4D4D', blue: '#38BDF8' };
const DAY = 864e5;
const COUNTRIES = [
  { key: 'sales', name: 'Sales' },
  { key: 'field', name: 'Field' },
  { key: 'team', name: 'Team' },
];
const RANK = { red: 3, yellow: 2, green: 1, blue: 0 };
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isLights = (t) => /\b(lights?|lites?|lighting)\b|christmas|holiday|\bc9\b/i.test(t || '');

export default function HQ({ progress = {} }) {
  const navigate = useNavigate();
  const { session } = useAuth();
  const token = session?.access_token || '';
  const mount = useRef(null);
  const labelsRef = useRef(null);
  const [globe, setGlobeState] = useState(() => { try { return localStorage.getItem('hq-globe') === '1'; } catch { return false; } });
  const setGlobe = (on) => { setGlobeState(on); try { localStorage.setItem('hq-globe', on ? '1' : '0'); } catch { /* ignore */ } };
  const [focus, setFocus] = useState(null); // zoomed-in country key, or null = whole globe
  const focusRef = useRef(null);
  useEffect(() => { focusRef.current = focus; }, [focus]);
  const [leads, setLeads] = useState(null);
  const [today, setToday] = useState(null);
  const quotes = useJobberList('lights-quotes', 'quotes', true).quotes;
  const jobs = useJobberList('recent-jobs', 'jobs', true).jobs;
  const orders = useAppStore((s) => s.lightsOrders) || [];
  const applications = useAppStore((s) => s.applications) || [];
  const [openQuotes, setOpenQuotes] = useState(null);
  const [plansData, setPlansData] = useState(null);
  const planNotes = useAppStore((s) => s.planNotes);
  const recurring = useMemo(() => {
    if (!plansData) return null;
    const onPlan = (plansData.clients || []).filter((c) => c.kind === 'plan' && !planNotes?.[c.clientId]?.hidden);
    const mrr = onPlan.reduce((sum, c) => sum + c.jobs.filter((j) => j.recurring && j.active).reduce((n, j) => n + (j.monthly || 0), 0), 0);
    return { monthlyRecurringRevenue: Math.round(mrr), activeRecurringCount: onPlan.length };
  }, [plansData, planNotes]);
  const [labor, setLabor] = useState(null);

  useEffect(() => {
    if (!token) return;
    fetch('/api/jobber-data?action=leads', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).then(setLeads).catch(() => setLeads({}));
    fetch('/api/jobber-data?action=today-visits').then((r) => r.json()).then(setToday).catch(() => setToday({}));
    fetch('/api/jobber-data?action=open-quotes').then((r) => r.json()).then(setOpenQuotes).catch(() => setOpenQuotes({}));
    // Same source + math as Client Base (on a plan = active recurring job in Jobber).
    fetch('/api/jobber-data?action=plans').then((r) => r.json()).then(setPlansData).catch(() => setPlansData({}));
    const d = new Date();
    fetch(`/api/jobber-data?action=labor&start=${ymd(new Date(d.getFullYear(), d.getMonth(), 1))}&end=${ymd(d)}`).then((r) => r.json()).then(setLabor).catch(() => setLabor({}));
  }, [token]);

  // One entry per building: label, big number, a short line, status color, where it goes.
  const buildings = useMemo(() => {
    const now = Date.now();
    const reqs = (leads?.requests || []);
    const newReqs = reqs.filter((r) => r.status === 'new');
    const waiting2d = newReqs.filter((r) => now - new Date(r.createdAt) > 2 * DAY).length;
    const overdue = reqs.filter((r) => r.status === 'overdue').length;
    const sent = (quotes || []).filter((q) => q.status === 'awaiting_response');
    const follow = sent.filter((q) => q.sentAt && now - new Date(q.sentAt) >= 3 * DAY).length;
    const changes = (quotes || []).filter((q) => q.status === 'changes_requested').length;
    const upcoming = (jobs || []).filter((j) => j.status !== 'archived' && isLights(j.title) && j.visitAt && new Date(j.visitAt) > now - DAY && new Date(j.visitAt) < now + 7 * DAY);
    const late = (jobs || []).filter((j) => j.status === 'late' && isLights(j.title)).length;
    const otw = orders.filter((o) => o.status === 'otw');
    const visits = (today?.visits || []);
    const doneToday = visits.filter((v) => v.completedAt).length;
    const lightsIds = new Set((quotes || []).map((q) => q.id));
    const landOpen = (openQuotes?.quotes || []).filter((q) => q.status === 'awaiting_response' && !lightsIds.has(q.id));
    const landFollow = landOpen.filter((q) => q.sentAt && now - new Date(q.sentAt) >= 3 * DAY).length;
    const newApps = applications.filter((x) => x.status === 'new').length;
    return [
      // Sales
      { key: 'installs', country: 'field', label: '🎄 Installs', big: upcoming.length, line: late ? `${late} late in Jobber` : 'next 7 days', status: late ? 'red' : upcoming.length ? 'green' : 'blue', path: '/lights-quoter?view=jobs' },
      { key: 'lquotes', country: 'sales', label: '🎄 Lights quotes', big: sent.length, line: changes ? `${changes} want changes` : follow ? `${follow} need a follow-up` : 'waiting on them', status: changes ? 'red' : follow ? 'yellow' : 'green', path: '/lights-quoter?view=quotes' },
      { key: 'materials', country: 'field', label: '🎄 Materials', big: otw.length, line: otw.length ? 'orders on the way' : 'nothing on the way', status: 'blue', path: '/lights-quoter?view=supplies' },
      { key: 'land', country: 'sales', label: '🌿 Landscape quotes', big: landOpen.length, line: landFollow ? `${landFollow} need a follow-up` : 'quotes out', status: landFollow ? 'yellow' : 'green', path: '/landscaping?tab=quoter' },
      // CRM
      { key: 'requests', country: 'sales', label: 'Requests', big: newReqs.length, line: overdue ? `${overdue} overdue` : waiting2d ? `${waiting2d} waiting 2d+` : 'new requests', status: overdue ? 'red' : waiting2d ? 'yellow' : 'green', path: '/leads' },
      { key: 'today', country: 'field', label: 'Jobs today', big: visits.length, line: visits.length ? `${doneToday} done` : 'no visits', status: visits.length && doneToday < visits.length ? 'yellow' : 'green', path: '/schedule' },
      // Money
      // Team
      { key: 'hiring', country: 'team', label: 'Hiring', big: newApps, line: 'new applicants', status: newApps ? 'yellow' : 'blue', path: '/hiring' },
    ];
  }, [leads, today, quotes, jobs, orders, openQuotes, recurring, applications]);

  const buildingsRef = useRef(buildings);
  useEffect(() => { buildingsRef.current = buildings; }, [buildings]);

  // ---- 3D scene (built once; colors follow the live data) ----
  useEffect(() => {
    const el = mount.current;
    if (!el) return undefined;
    const W = () => el.clientWidth; const H = () => el.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(W(), H());
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W() / H(), 0.1, 100);
    camera.position.set(0, 2.2, 7.2);
    const farPos = new THREE.Vector3(0, 2.2, 7.2); const zoomPos = new THREE.Vector3(0, 1.5, 5.2);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.PointLight(0x7dff7d, 30, 30); sun.position.set(4, 5, 6); scene.add(sun);

    const world = new THREE.Group(); scene.add(world);
    // Planet: dark core + green wireframe + star dust
    world.add(new THREE.Mesh(new THREE.SphereGeometry(2, 48, 48), new THREE.MeshStandardMaterial({ color: 0x062a12, emissive: 0x03140a, roughness: 0.8 })));
    world.add(new THREE.Mesh(new THREE.SphereGeometry(2.01, 24, 24), new THREE.MeshBasicMaterial({ color: 0x00df00, wireframe: true, transparent: true, opacity: 0.12 })));
    const dust = new THREE.BufferGeometry(); const pts = [];
    for (let i = 0; i < 900; i += 1) { const v = new THREE.Vector3().randomDirection().multiplyScalar(2.05 + Math.random() * 0.02); pts.push(v.x, v.y, v.z); }
    dust.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    world.add(new THREE.Points(dust, new THREE.PointsMaterial({ color: 0x7dff7d, size: 0.02, transparent: true, opacity: 0.7 })));

    // Buildings: placed around the planet, each a glowing tower + light beam
    const towers = []; const countryPatches = [];
    const cIdx = (k) => COUNTRIES.findIndex((c) => c.key === k);
    const lonOf = (k) => (cIdx(k) / COUNTRIES.length) * Math.PI * 2;
    const countryAnchors = COUNTRIES.map((c) => {
      const lon = lonOf(c.key); const lat = 0.62;
      return new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)).multiplyScalar(2.15);
    });
    COUNTRIES.forEach((c, ci) => {
      // a soft glowing "land" patch under each country
      const patch = new THREE.Mesh(new THREE.CircleGeometry(0.5, 40), new THREE.MeshBasicMaterial({ color: 0x00df00, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
      const lat = 0.25; const lon = lonOf(c.key);
      const dir = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)).normalize();
      patch.position.copy(dir.clone().multiplyScalar(2.015)); patch.lookAt(dir.clone().multiplyScalar(4));
      patch.userData.country = c.key; world.add(patch); countryPatches[ci] = patch;
    });
    buildingsRef.current.forEach((bd, i) => {
      const mates = buildingsRef.current.filter((x) => x.country === bd.country);
      const j = mates.indexOf(bd); const m = mates.length;
      const lon = lonOf(bd.country) + (j - (m - 1) / 2) * 0.4;
      const lat = 0.25 + (j % 2 ? 0.16 : -0.06);
      const dir = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)).normalize();
      const g = new THREE.Group();
      const h = 0.22 + (i % 3) * 0.07;
      const mat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: new THREE.Color(COLORS.green), emissiveIntensity: 0.9 });
      const tower = new THREE.Mesh(new THREE.BoxGeometry(0.11, h, 0.11), mat); tower.position.y = h / 2; g.add(tower);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.09, 4), mat); cap.position.y = h + 0.045; cap.rotation.y = Math.PI / 4; g.add(cap);
      const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.green), transparent: true, opacity: 0.25, depthWrite: false });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.04, 0.7, 12, 1, true), beamMat); beam.position.y = h + 0.4; g.add(beam);
      g.position.copy(dir.clone().multiplyScalar(2));
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      world.add(g);
      towers.push({ g, mat, beamMat, tower, key: bd.key, anchor: new THREE.Vector3(0, h + 0.15, 0) });
    });

    // Drag to spin, tap a building to open it
    let drag = null; let velo = 0.0025; let moved = 0;
    const ray = new THREE.Raycaster(); const mouse = new THREE.Vector2();
    const down = (e) => { drag = e.clientX; moved = 0; };
    const move = (e) => { if (drag == null) return; const dx = e.clientX - drag; drag = e.clientX; moved += Math.abs(dx); world.rotation.y += dx * 0.006; velo = dx * 0.0006; };
    const up = (e) => {
      if (drag != null && moved < 6) {
        const r = renderer.domElement.getBoundingClientRect();
        mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(mouse, camera);
        const hit = ray.intersectObjects(towers.flatMap((t) => t.g.children), false)[0];
        const t = hit && towers.find((x) => x.g.children.includes(hit.object));
        const bd = t && buildingsRef.current.find((x) => x.key === t.key);
        if (bd) { if (focusRef.current === bd.country) navigate(bd.path); else setFocus(bd.country); }
      }
      drag = null;
    };
    renderer.domElement.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    const resize = () => { renderer.setSize(W(), H()); camera.aspect = W() / H(); camera.updateProjectionMatrix(); };
    window.addEventListener('resize', resize);

    let raf; const t0 = performance.now(); const v = new THREE.Vector3();
    const loop = (t) => {
      const s = (t - t0) / 1000;
      const f = focusRef.current;
      if (f && drag == null) {
        // turn the focused country to face us, then hold still
        const target = (COUNTRIES.findIndex((c) => c.key === f) / COUNTRIES.length) * Math.PI * 2 - Math.PI / 2;
        let d = target - world.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
        world.rotation.y += d * 0.08; velo = 0;
      } else if (drag == null) { world.rotation.y += velo; velo += (0.0025 - velo) * 0.02; }
      camera.position.lerp(f ? zoomPos : farPos, 0.06); camera.lookAt(0, f ? 0.75 : 0, 0);
      // Live colors + labels that follow each tower
      const labels = labelsRef.current?.children || [];
      const nB = towers.length;
      COUNTRIES.forEach((c, ci) => {
        const worst = buildingsRef.current.filter((b) => b.country === c.key).reduce((w, b) => (RANK[b.status] > RANK[w] ? b.status : w), 'blue');
        const patch = countryPatches[ci];
        if (patch) { patch.material.color.set(COLORS[worst]); patch.material.opacity = 0.1 + (worst === 'red' ? 0.08 * (0.5 + 0.5 * Math.sin(s * 6)) : 0); }
        world.localToWorld(v.copy(countryAnchors[ci])); const facing = v.clone().normalize().dot(camera.position.clone().normalize());
        v.project(camera);
        const lab = labels[nB + ci]; if (!lab) return;
        lab.style.color = COLORS[worst];
        lab.style.transform = `translate(-50%,-100%) translate(${(v.x * 0.5 + 0.5) * W()}px,${(-v.y * 0.5 + 0.5) * H()}px)`;
        const showC = !f ? facing > 0.15 : false;
        lab.style.opacity = showC ? '1' : '0'; lab.style.pointerEvents = showC ? 'auto' : 'none';
      });
      towers.forEach((tw, i) => {
        const bd = buildingsRef.current.find((x) => x.key === tw.key);
        const c = new THREE.Color(COLORS[bd?.status || 'green']);
        tw.mat.emissive.copy(c); tw.beamMat.color.copy(c);
        tw.mat.emissiveIntensity = 0.7 + (bd?.status === 'red' ? 0.6 * (0.5 + 0.5 * Math.sin(s * 6)) : 0.2);
        tw.g.localToWorld(v.copy(tw.anchor)); const facing = v.clone().normalize().dot(camera.position.clone().normalize());
        v.project(camera);
        const lab = labels[i]; if (!lab) return;
        lab.style.transform = `translate(-50%,-100%) translate(${(v.x * 0.5 + 0.5) * W()}px,${(-v.y * 0.5 + 0.5) * H()}px)`;
        const showB = f === bd?.country && facing > 0.05;
        lab.style.opacity = showB ? '1' : '0'; lab.style.pointerEvents = showB ? 'auto' : 'none';
      });
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('resize', resize);
      renderer.dispose(); el.removeChild(renderer.domElement);
    };
  }, [navigate, globe]);

  // Dashboard panel: my day + lights pipeline (Jobber quotes): sold, close rate, open quotes, recent wins.
  const pipe = useMemo(() => {
    const qs = quotes || [];
    const won = qs.filter((q) => q.status === 'approved' || q.status === 'converted');
    const sent = qs.filter((q) => q.status !== 'draft');
    const open = qs.filter((q) => q.status === 'awaiting_response' || q.status === 'changes_requested');
    const sum = (a) => a.reduce((t, q) => t + (Number(q.total) || 0), 0);
    return {
      sold: sum(won), wonN: won.length, sentN: sent.length,
      rate: sent.length ? Math.round((won.length / sent.length) * 1000) / 10 : 0,
      open: sum(open), openN: open.length,
      wins: [...won].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)).slice(0, 8),
    };
  }, [quotes]);
  const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
  // This month's work done (same Jobber visit data as Payroll): recurring vs one-time vs lights.
  // Sold this month = jobs created in Jobber this month. Landscaping = one-time (not lights); maintenance = new recurring plans.
  const { landSold, newPlans } = useMemo(() => {
    const recById = new Map();
    for (const c of plansData?.clients || []) for (const j of c.jobs) recById.set(j.id, j.recurring);
    const start = ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const fresh = (jobs || []).filter((j) => (j.createdAt || '').slice(0, 10) >= start && j.total > 0 && !isLights(`${j.title} ${(j.visits || []).map((v) => v.title).join(' ')}`));
    const one = fresh.filter((j) => recById.get(j.id) === false);
    return { landSold: { n: one.length, total: one.reduce((t, j) => t + j.total, 0) }, newPlans: fresh.filter((j) => recById.get(j.id) === true).length };
  }, [jobs, plansData]);
  const mix = useMemo(() => {
    const m = { rec: 0, one: 0, lights: 0, ready: !!labor };
    Object.values(labor || {}).forEach((dayData) => (dayData?.visits || []).forEach((v) => {
      const amt = Number(v.jobTotal) || 0;
      if (isLights(v.title)) m.lights += amt; else if (v.jobType === 'RECURRING') m.rec += amt; else m.one += amt;
    }));
    return m;
  }, [labor]);
  const landOpen = useMemo(() => {
    const ids = new Set((quotes || []).map((q) => q.id));
    const list = (openQuotes?.quotes || []).filter((q) => q.status === 'awaiting_response' && !ids.has(q.id));
    return { n: list.length, total: list.reduce((t, q) => t + (Number(q.total) || 0), 0) };
  }, [openQuotes, quotes]);
  const monthName = new Date().toLocaleDateString('en-US', { month: 'long' });
  const day = [
    { label: 'Start · 8 AM', path: '/workflow/start', done: progress.startDone, total: progress.startTotal },
    { label: 'End · 5 PM', path: '/workflow/end', done: progress.endDone, total: progress.endTotal },
    { label: 'Plan', path: '/plan' },
    { label: 'Leads', path: '/work-leads', count: (leads?.requests || []).filter((r) => r.status === 'new').length },
  ];

  const red = buildings.filter((b) => b.status === 'red').length;
  const yellow = buildings.filter((b) => b.status === 'yellow').length;

  const panelBody = (
    <>
        <div className="p-4 border-b border-white/10">
          <p className="text-[10px] font-black tracking-widest text-[#00DF00]">MY DAY</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
            {day.map((d) => {
              const allDone = d.total > 0 && d.done === d.total;
              return (
                <button key={d.path} onClick={() => navigate(d.path)} className="rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-2 py-2 text-left cursor-pointer">
                  <span className="block text-[11px] font-bold text-white/70">{d.label}</span>
                  {d.count != null
                    ? <span className="block text-lg font-black" style={{ color: d.count ? '#FACC15' : '#00DF00' }}>{leads ? `${d.count} new` : '…'}</span>
                    : <span className="block text-lg font-black" style={{ color: d.total == null ? '#fff' : allDone ? '#00DF00' : '#FACC15' }}>{d.total == null ? 'Open →' : `${d.done || 0}/${d.total}`}</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="p-4 border-b border-white/10">
          <p className="text-[10px] font-black tracking-widest text-[#00DF00]">WHERE THE MONEY IS · {monthName.toUpperCase()}</p>
          <div className="grid gap-2 mt-2 sm:grid-cols-3">
            {[
              { name: '🔁 Maintenance', color: '#38BDF8', big: recurring ? `${money(recurring.monthlyRecurringRevenue)}/mo` : '…', bigLabel: 'on plans', rows: [[recurring?.activeRecurringCount ?? '…', 'clients on a plan'], [newPlans, `new plan${newPlans === 1 ? '' : 's'} this month`], [mix.ready ? money(mix.rec) : '…', 'done this month']], path: '/landscaping?tab=clients' },
              { name: '🌿 Landscaping', color: '#A3E635', big: plansData ? money(landSold.total) : '…', bigLabel: `sold this month · ${landSold.n} job${landSold.n === 1 ? '' : 's'}`, rows: [[money(landOpen.total), `quotes out · ${landOpen.n} waiting`], [mix.ready ? money(mix.one) : '…', 'done this month']], path: '/landscaping' },
              { name: '🎄 Christmas Lights', color: '#00DF00', big: money(pipe.sold), bigLabel: `sold this season · ${pipe.wonN} clients`, rows: [[`${pipe.rate}%`, `close rate · ${money(pipe.open)} open`], [mix.ready ? money(mix.lights) : '…', 'done this month']], path: '/lights-quoter?view=sales' },
            ].map((x) => (
              <button key={x.name} onClick={() => navigate(x.path)} className="rounded-xl border border-white/10 bg-white/[.03] hover:bg-white/[.07] p-3 text-left cursor-pointer" style={{ borderTop: `2px solid ${x.color}` }}>
                <p className="text-sm font-black text-white">{x.name}</p>
                <p className="text-2xl font-black mt-1" style={{ color: x.color }}>{x.big}</p>
                <p className="text-[10px] text-white/50">{x.bigLabel}</p>
                {x.rows.map(([v, l]) => (
                  <p key={l} className="text-xs text-white/60 mt-1.5"><b className="text-white">{v}</b> {l}</p>
                ))}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-white/45 mt-2">Total work done this month (all 3): <b className="text-white">{mix.ready ? money(mix.rec + mix.one + mix.lights) : '…'}</b></p>
        </div>
        <div className="p-4">
          <p className="text-[10px] font-black tracking-widest text-[#00DF00]">🎄 LIGHTS WON ({pipe.wonN})</p>
          <div className="mt-2 space-y-2.5">
            {pipe.wins.map((q) => (
              <button key={q.id} onClick={() => navigate('/lights-quoter?view=quotes')} className="block w-full text-left cursor-pointer group">
                <p className="text-sm font-bold text-white group-hover:underline">{q.clientName} <span className="text-[#00DF00]">{money(q.total)}</span></p>
                <p className="text-[11px] text-white/45 truncate">{q.updatedAt ? `Closed ${new Date(q.updatedAt).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}` : 'Closed'}{q.title ? ` · ${q.title}` : ''}</p>
              </button>
            ))}
            {!pipe.wins.length && <p className="text-xs text-white/40">Loading…</p>}
          </div>
        </div>
    </>
  );

  if (!globe) {
    return (
      <div className="-m-4 sm:-m-6 min-h-[calc(100vh-56px)] p-4 sm:p-8 bg-surface">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end justify-between gap-3 mb-4">
            <div>
              <p className="text-[11px] font-black tracking-[0.25em] text-[#00DF00]">HEY JUDE&#8217;S HQ</p>
              <p className="text-2xl font-black text-white">{red ? `${red} need you now` : yellow ? `${yellow} need you soon` : 'All good 🎄'}</p>
            </div>
            <button onClick={() => setGlobe(true)} className="text-xs text-white/40 hover:text-white/70 cursor-pointer">Show globe</button>
          </div>
          <div className="rounded-2xl border border-white/10 bg-card overflow-hidden">{panelBody}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="-m-4 sm:-m-6 min-h-[calc(100vh-56px)] relative overflow-hidden" style={{ background: 'radial-gradient(ellipse at 50% 40%, #0b2a14 0%, #050806 60%, #000 100%)' }}>
      <aside className="flex flex-col absolute top-0 right-0 bottom-0 w-full sm:w-[340px] max-lg:top-auto max-lg:h-[45%] z-20 border-l border-white/10 bg-black/75 backdrop-blur-md overflow-y-auto">
        {panelBody}
      </aside>
      <div className="absolute top-4 left-5 z-10">
        <p className="text-[11px] font-black tracking-[0.25em] text-[#00DF00]">HEY JUDE&#8217;S HQ</p>
        <p className="text-2xl font-black text-white">{red ? `${red} need you now` : yellow ? `${yellow} need you soon` : 'All good 🎄'}</p>
        {focus
          ? <button onClick={() => setFocus(null)} className="mt-1 text-sm font-bold text-[#00DF00] hover:underline cursor-pointer">← Whole globe</button>
          : <p className="text-xs text-white/50">Live from Hub · tap a country to zoom in · <button onClick={() => setGlobe(false)} className="underline cursor-pointer">hide globe</button></p>}
      </div>
      <div ref={mount} className="absolute inset-0 lg:right-[340px]" />
      <div ref={labelsRef} className="absolute inset-0 lg:right-[340px] pointer-events-none overflow-hidden">
        {buildings.map((b) => (
          <button key={b.key} onClick={() => navigate(b.path)}
            className="absolute left-0 top-0 rounded-lg border px-2 py-1 text-left backdrop-blur-md cursor-pointer transition-opacity"
            style={{ borderColor: `${COLORS[b.status]}88`, background: 'rgba(0,0,0,.55)', boxShadow: `0 0 18px ${COLORS[b.status]}55` }}>
            <span className="block text-[10px] font-black tracking-widest uppercase" style={{ color: COLORS[b.status] }}>{b.label}</span>
            <span className="block text-sm font-black text-white leading-tight">{b.big}</span>
            <span className="block text-[10px] text-white/70 whitespace-nowrap">{b.line}</span>
          </button>
        ))}
        {COUNTRIES.map((c) => {
          const todo = buildings.filter((b) => b.country === c.key && (b.status === 'red' || b.status === 'yellow'));
          return (
            <button key={c.key} onClick={() => setFocus(c.key)} className="absolute left-0 top-0 text-center cursor-pointer transition-opacity">
              <span className="block text-3xl font-black uppercase tracking-[0.3em]" style={{ textShadow: '0 0 18px currentColor' }}>{c.name}</span>
              <span className="block text-xs font-bold text-white/80 mt-1">{todo.length ? todo.map((b) => (/\d/.test(b.line) ? b.line : `${b.big} ${b.line}`)).join(' · ') : 'All good'}</span>
            </button>
          );
        })}
      </div>
      <div className="absolute bottom-4 left-0 right-0 lg:right-[340px] z-10 flex justify-center gap-4 text-[11px] font-bold text-white/70">
        {[['green', 'All good'], ['yellow', 'Needs you soon'], ['red', 'Needs you now'], ['blue', 'FYI']].map(([k, l]) => (
          <span key={k} className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: COLORS[k], boxShadow: `0 0 8px ${COLORS[k]}` }} />{l}</span>
        ))}
      </div>
    </div>
  );
}
