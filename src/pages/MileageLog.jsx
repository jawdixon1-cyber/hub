import { useState, useMemo, useEffect } from 'react';
import {
  Gauge, Plus, Search, ChevronDown, ChevronLeft, ChevronRight,
  Trash2, X, Check, ArrowLeft, Settings, Pencil, GripVertical,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/AppStoreContext';
import MileageModal from '../components/MileageModal';
import { genId } from '../data';
import { getTodayInTimezone, toDateStringInTimezone } from '../utils/timezone';

const IRS_RATE = 0.725;
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function MileageLog() {
  const navigate = useNavigate();
  const { currentUser, ownerMode } = useAuth();

  const vehicles = useAppStore((s) => s.vehicles);
  const setVehicles = useAppStore((s) => s.setVehicles);
  const mileageLog = useAppStore((s) => s.mileageLog);
  const setMileageLog = useAppStore((s) => s.setMileageLog);

  const [showModal, setShowModal] = useState(false);
  const [mileageSuccess, setMileageSuccess] = useState(false);
  const [search, setSearch] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState('all');
  const [perPage, setPerPage] = useState(20);
  const [page, setPage] = useState(1);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [entryEditForm, setEntryEditForm] = useState({ vehicleId: '', odometer: '', date: '', notes: '' });
  const [dateRange, setDateRange] = useState('today');
  const [showEntries, setShowEntries] = useState(false);

  // Vehicle management (owner only)
  const [showManage, setShowManage] = useState(false);
  const [newVehicleName, setNewVehicleName] = useState('');
  const [editingVehicleId, setEditingVehicleId] = useState(null);
  const [editForm, setEditForm] = useState({ nickname: '', year: '', make: '', model: '' });
  const [confirmDeleteVehicleId, setConfirmDeleteVehicleId] = useState(null);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  // Display name: nickname first, then "year make model", then legacy name
  const displayName = (v) => v.nickname || [v.year, v.make, v.model].filter(Boolean).join(' ') || v.name || 'Unknown';

  // QB vehicle definitions — maps QB CSV name to app details
  const qbVehicleDefs = useMemo(() => [
    { qbName: 'Toyota 4Runner', nickname: 'The Tank!', year: '2007', make: 'Toyota', model: '4Runner' },
    { qbName: 'Jeep Wrangler', nickname: "Braden's Jeep", year: '2020', make: 'Jeep', model: 'Wrangler' },
    { qbName: 'Lexus', nickname: "Pat's Lexus", year: '2020', make: 'Lexus', model: '' },
    { qbName: '2016 Ford F150', nickname: 'Company Truck', year: '2016', make: 'Ford', model: 'F-150' },
    { qbName: 'Honda Civic', nickname: "Luke's Honda", year: '2017', make: 'Honda', model: 'Civic' },
    { qbName: 'Kia Sportage', nickname: "Sara's Kia", year: '2021', make: 'Kia', model: 'Sportage' },
    { qbName: 'Mercedez', nickname: "Michele's Mercedes", year: '2010', make: 'Mercedes', model: '' },
    { qbName: '2022 Ford F-150', nickname: "Gene's Ford", year: '2022', make: 'Ford', model: 'F-150' },
  ], []);

  // One-time data rectification: sync vehicles, fix entries, import CSV, remove dupes
  useEffect(() => {
    if (localStorage.getItem('qb-rectified-v6')) return;
    const lower = (s) => (s || '').toLowerCase();

    // Vehicle matcher — requires year match when make+model overlap (prevents F-150 merge)
    const matchVehicle = (v, def) =>
      lower(v.name) === lower(def.qbName) ||
      lower(v.nickname) === lower(def.nickname) ||
      lower(v.name) === lower(def.nickname) ||
      lower(v.nickname) === lower(def.qbName) ||
      (v.make && v.model && lower(v.make) === lower(def.make) && lower(v.model) === lower(def.model) && v.year === def.year) ||
      (v.make && lower(v.make) === lower(def.make) && v.year === def.year);

    // ── Step 1: Build canonical vehicle list ──
    let finalVehicles = [...vehicles];
    for (const def of qbVehicleDefs) {
      const match = finalVehicles.find((v) => matchVehicle(v, def));
      if (match) {
        finalVehicles = finalVehicles.map((v) => v.id === match.id ? {
          ...v,
          nickname: def.nickname,
          year: def.year,
          make: def.make,
          model: def.model,
          name: v.name || def.qbName,
        } : v);
      } else {
        finalVehicles.push({ id: genId(), name: def.qbName, nickname: def.nickname, year: def.year, make: def.make, model: def.model });
      }
    }

    // Deduplicate vehicles: if multiple vehicles map to the same QB def, keep only the first
    const canonicalIds = new Map(); // qbName → winning vehicle id
    for (const def of qbVehicleDefs) {
      const matches = finalVehicles.filter((v) => matchVehicle(v, def));
      if (matches.length > 0) {
        const winner = matches[0];
        canonicalIds.set(lower(def.qbName), winner.id);
        canonicalIds.set(lower(def.nickname), winner.id);
        for (const m of matches) {
          canonicalIds.set(m.id, winner.id);
        }
      }
    }

    // Remove duplicate vehicle objects — keep only one per QB def
    const keepIds = new Set();
    for (const def of qbVehicleDefs) {
      const winnerId = canonicalIds.get(lower(def.qbName));
      if (winnerId) keepIds.add(winnerId);
    }
    finalVehicles = finalVehicles.filter((v) => {
      if (keepIds.has(v.id)) return true;
      const isDupe = canonicalIds.has(v.id) && canonicalIds.get(v.id) !== v.id;
      return !isDupe;
    });

    // Build a lookup: any name/nickname/old-id → canonical vehicle id
    const nameToId = {};
    for (const def of qbVehicleDefs) {
      const winnerId = canonicalIds.get(lower(def.qbName));
      if (winnerId) {
        nameToId[lower(def.qbName)] = winnerId;
        nameToId[lower(def.nickname)] = winnerId;
      }
    }
    for (const v of finalVehicles) {
      if (v.name) nameToId[lower(v.name)] = v.id;
      if (v.nickname) nameToId[lower(v.nickname)] = v.id;
    }

    const resolveVehicleId = (entry) => {
      const remapped = canonicalIds.get(entry.vehicleId);
      if (remapped && finalVehicles.find((v) => v.id === remapped)) return remapped;
      if (finalVehicles.find((v) => v.id === entry.vehicleId)) return entry.vehicleId;
      const byName = nameToId[lower(entry.vehicleName)];
      if (byName) return byName;
      return entry.vehicleId;
    };

    // ── Step 2: Fix ALL existing entries — correct vehicleIds and names ──
    let fixedLog = mileageLog.map((e) => {
      const correctId = resolveVehicleId(e);
      const v = finalVehicles.find((fv) => fv.id === correctId);
      return { ...e, vehicleId: correctId, vehicleName: v ? displayName(v) : e.vehicleName };
    });

    // ── Step 3: Remove all old qb-import entries ──
    fixedLog = fixedLog.filter((e) => e.source !== 'qb-import');

    // ── Step 4: F-150 cross-reference ──
    // QB source of truth for Gene's 2022 F-150 entries (date + miles)
    const qb2022F150 = new Set([
      '2026-02-20|40', '2026-02-19|30', '2026-02-06|22', '2026-02-05|26',
      '2026-01-22|16', '2026-01-20|28', '2026-01-19|45', '2026-01-15|42',
      '2026-01-14|55', '2026-01-13|50', '2026-01-01|36',
    ]);
    const f150_2022_id = nameToId[lower('2022 Ford F-150')] || nameToId[lower("Gene's Ford")];
    const f150_2016_id = nameToId[lower('2016 Ford F150')] || nameToId[lower('Company Truck')];

    if (f150_2022_id && f150_2016_id) {
      fixedLog = fixedLog.map((e) => {
        if (e.vehicleId !== f150_2022_id) return e;
        const qbKey = `${e.date}|${Number(e.odometer)}`;
        if (qb2022F150.has(qbKey)) return e; // confirmed 2022 entry
        // Not in QB as 2022 → team logged 2016 under wrong truck
        const v2016 = finalVehicles.find((fv) => fv.id === f150_2016_id);
        return { ...e, vehicleId: f150_2016_id, vehicleName: v2016 ? displayName(v2016) : '2016 Ford F150' };
      });
    }

    // ── Step 5: Deduplicate (same date + vehicleId + miles = keep one) ──
    const seenKeys = new Set();
    fixedLog = fixedLog.filter((e) => {
      const key = `${e.date}|${e.vehicleId}|${Number(e.odometer)}`;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });

    // ── Step 6: Import CSV rows, skipping any that match existing entries ──
    const csvRows = [
      { date: '2026-03-04', vehicle: 'Toyota 4Runner', miles: 39, notes: 'Servicing Clients' },
      { date: '2026-03-04', vehicle: 'Jeep Wrangler', miles: 8, notes: 'Servicing Clients' },
      { date: '2026-03-03', vehicle: 'Jeep Wrangler', miles: 8, notes: 'Servicing Clients' },
      { date: '2026-03-03', vehicle: 'Toyota 4Runner', miles: 29, notes: 'Servicing Clients' },
      { date: '2026-03-02', vehicle: 'Mercedez', miles: 55, notes: 'Servicing Clients' },
      { date: '2026-03-02', vehicle: '2016 Ford F150', miles: 45, notes: 'Servicing Clients' },
      { date: '2026-02-26', vehicle: 'Toyota 4Runner', miles: 25, notes: 'Delivery/drop-off' },
      { date: '2026-02-26', vehicle: '2016 Ford F150', miles: 22, notes: 'Delivery/drop-off' },
      { date: '2026-02-25', vehicle: 'Toyota 4Runner', miles: 43, notes: 'Servicing Clients' },
      { date: '2026-02-23', vehicle: 'Toyota 4Runner', miles: 43, notes: 'Servicing Clients' },
      { date: '2026-02-20', vehicle: 'Toyota 4Runner', miles: 24, notes: 'Servicing Clients' },
      { date: '2026-02-20', vehicle: '2016 Ford F150', miles: 33, notes: 'Delivery/drop-off' },
      { date: '2026-02-20', vehicle: '2022 Ford F-150', miles: 40, notes: 'Servicing Clients' },
      { date: '2026-02-19', vehicle: '2022 Ford F-150', miles: 30, notes: 'Servicing Clients' },
      { date: '2026-02-19', vehicle: 'Toyota 4Runner', miles: 43, notes: 'Servicing Clients' },
      { date: '2026-02-18', vehicle: '2016 Ford F150', miles: 39, notes: 'Servicing Clients' },
      { date: '2026-02-18', vehicle: 'Toyota 4Runner', miles: 55, notes: 'Servicing Clients' },
      { date: '2026-02-17', vehicle: '2016 Ford F150', miles: 30, notes: 'Servicing Clients' },
      { date: '2026-02-16', vehicle: '2016 Ford F150', miles: 27, notes: 'Servicing Clients' },
      { date: '2026-02-13', vehicle: '2016 Ford F150', miles: 26, notes: 'Servicing Clients' },
      { date: '2026-02-13', vehicle: 'Toyota 4Runner', miles: 40, notes: 'Servicing Clients' },
      { date: '2026-02-12', vehicle: '2016 Ford F150', miles: 73, notes: 'Servicing Clients' },
      { date: '2026-02-12', vehicle: 'Toyota 4Runner', miles: 60, notes: 'Servicing Clients' },
      { date: '2026-02-11', vehicle: '2016 Ford F150', miles: 50, notes: 'Servicing Clients' },
      { date: '2026-02-11', vehicle: 'Toyota 4Runner', miles: 33, notes: 'Servicing Clients' },
      { date: '2026-02-10', vehicle: 'Toyota 4Runner', miles: 30, notes: 'Servicing Clients' },
      { date: '2026-02-10', vehicle: '2016 Ford F150', miles: 35, notes: 'Servicing Clients' },
      { date: '2026-02-09', vehicle: 'Toyota 4Runner', miles: 45, notes: 'Servicing Clients' },
      { date: '2026-02-09', vehicle: 'Kia Sportage', miles: 27, notes: 'Delivery/drop-off' },
      { date: '2026-02-09', vehicle: '2016 Ford F150', miles: 27, notes: 'Delivery/drop-off' },
      { date: '2026-02-07', vehicle: 'Kia Sportage', miles: 29, notes: 'Servicing Clients' },
      { date: '2026-02-06', vehicle: 'Toyota 4Runner', miles: 56, notes: 'Servicing Clients' },
      { date: '2026-02-06', vehicle: '2022 Ford F-150', miles: 22, notes: 'Servicing Clients' },
      { date: '2026-02-06', vehicle: '2016 Ford F150', miles: 33, notes: 'Servicing Clients' },
      { date: '2026-02-05', vehicle: 'Toyota 4Runner', miles: 32, notes: 'Servicing Clients' },
      { date: '2026-02-05', vehicle: '2022 Ford F-150', miles: 26, notes: 'Delivery/drop-off' },
      { date: '2026-02-04', vehicle: '2016 Ford F150', miles: 16, notes: 'Delivery/drop-off' },
      { date: '2026-02-03', vehicle: '2016 Ford F150', miles: 6, notes: 'Servicing Clients' },
      { date: '2026-01-28', vehicle: 'Toyota 4Runner', miles: 28, notes: 'Servicing Clients' },
      { date: '2026-01-28', vehicle: '2016 Ford F150', miles: 15, notes: 'Servicing Clients' },
      { date: '2026-01-27', vehicle: 'Toyota 4Runner', miles: 15, notes: 'Servicing Clients' },
      { date: '2026-01-23', vehicle: 'Toyota 4Runner', miles: 19, notes: 'Servicing Clients' },
      { date: '2026-01-23', vehicle: '2016 Ford F150', miles: 29, notes: 'Servicing Clients' },
      { date: '2026-01-22', vehicle: 'Toyota 4Runner', miles: 44, notes: 'Servicing Clients' },
      { date: '2026-01-22', vehicle: 'Lexus', miles: 19, notes: 'Servicing Clients' },
      { date: '2026-01-22', vehicle: '2022 Ford F-150', miles: 16, notes: 'Servicing Clients' },
      { date: '2026-01-21', vehicle: 'Mercedez', miles: 58, notes: 'Servicing Clients' },
      { date: '2026-01-21', vehicle: 'Toyota 4Runner', miles: 17, notes: 'Servicing Clients' },
      { date: '2026-01-20', vehicle: '2022 Ford F-150', miles: 28, notes: 'Servicing Clients' },
      { date: '2026-01-20', vehicle: 'Toyota 4Runner', miles: 11, notes: 'Servicing Clients' },
      { date: '2026-01-19', vehicle: '2022 Ford F-150', miles: 45, notes: 'Servicing Clients' },
      { date: '2026-01-19', vehicle: 'Toyota 4Runner', miles: 15, notes: 'Servicing Clients' },
      { date: '2026-01-16', vehicle: 'Toyota 4Runner', miles: 57, notes: 'Servicing Clients' },
      { date: '2026-01-15', vehicle: 'Toyota 4Runner', miles: 21, notes: 'Servicing Clients' },
      { date: '2026-01-15', vehicle: '2022 Ford F-150', miles: 42, notes: 'Servicing Clients' },
      { date: '2026-01-14', vehicle: '2022 Ford F-150', miles: 55, notes: 'Servicing Clients' },
      { date: '2026-01-14', vehicle: 'Toyota 4Runner', miles: 19, notes: 'Servicing Clients' },
      { date: '2026-01-13', vehicle: '2022 Ford F-150', miles: 50, notes: 'Servicing Clients' },
      { date: '2026-01-12', vehicle: 'Lexus', miles: 30, notes: 'Servicing Clients' },
      { date: '2026-01-10', vehicle: 'Kia Sportage', miles: 26, notes: 'Servicing Clients' },
      { date: '2026-01-10', vehicle: '2016 Ford F150', miles: 11, notes: 'Picking up goods/supplies' },
      { date: '2026-01-09', vehicle: 'Toyota 4Runner', miles: 13, notes: 'Servicing Clients' },
      { date: '2026-01-09', vehicle: '2016 Ford F150', miles: 26, notes: 'Servicing Clients' },
      { date: '2026-01-08', vehicle: 'Kia Sportage', miles: 12, notes: 'Delivery/drop-off' },
      { date: '2026-01-08', vehicle: 'Toyota 4Runner', miles: 37, notes: 'Servicing Clients' },
      { date: '2026-01-07', vehicle: 'Toyota 4Runner', miles: 26, notes: 'Servicing Clients' },
      { date: '2026-01-07', vehicle: 'Kia Sportage', miles: 35, notes: 'Servicing Clients' },
      { date: '2026-01-06', vehicle: 'Kia Sportage', miles: 33, notes: 'Servicing Clients' },
      { date: '2026-01-06', vehicle: 'Toyota 4Runner', miles: 71, notes: 'Servicing Clients' },
      { date: '2026-01-05', vehicle: 'Toyota 4Runner', miles: 22, notes: 'Servicing Clients' },
      { date: '2026-01-03', vehicle: '2016 Ford F150', miles: 24, notes: 'Servicing Clients' },
      { date: '2026-01-02', vehicle: 'Toyota 4Runner', miles: 75, notes: 'Servicing Clients' },
      { date: '2026-01-01', vehicle: '2022 Ford F-150', miles: 36, notes: 'Servicing Clients' },
    ];

    const newEntries = [];
    for (const row of csvRows) {
      const vid = nameToId[lower(row.vehicle)];
      if (!vid) continue;
      const key = `${row.date}|${vid}|${row.miles}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      const v = finalVehicles.find((fv) => fv.id === vid);
      newEntries.push({
        id: genId(),
        vehicleId: vid,
        vehicleName: v ? displayName(v) : row.vehicle,
        odometer: row.miles,
        date: row.date,
        notes: row.notes,
        loggedBy: 'Jude',
        createdAt: new Date(row.date + 'T12:00:00').toISOString(),
        source: 'qb-import',
      });
    }

    // ── Step 7: Save everything ──
    setVehicles(finalVehicles);
    setMileageLog([...fixedLog, ...newEntries]);
    localStorage.setItem('qb-rectified-v6', '1');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Runtime vehicle dedup: merge duplicate vehicles (e.g. "Lexus" + "Pat's Lexus" → keep the one with nickname)
  useEffect(() => {
    const lower = (s) => (s || '').toLowerCase();
    const dupeMap = new Map(); // key → winner vehicle
    const idRemap = new Map(); // loser id → winner id

    for (const def of qbVehicleDefs) {
      const matches = vehicles.filter((v) =>
        lower(v.name) === lower(def.qbName) ||
        lower(v.nickname) === lower(def.nickname) ||
        lower(v.name) === lower(def.nickname) ||
        lower(v.nickname) === lower(def.qbName) ||
        (v.make && v.model && lower(v.make) === lower(def.make) && lower(v.model) === lower(def.model) && v.year === def.year) ||
        (v.make && lower(v.make) === lower(def.make) && v.year === def.year)
      );
      if (matches.length > 1) {
        // Prefer the one with a nickname
        const winner = matches.find((m) => m.nickname) || matches[0];
        for (const m of matches) {
          if (m.id !== winner.id) {
            idRemap.set(m.id, winner.id);
          }
        }
        dupeMap.set(lower(def.qbName), winner);
      }
    }

    if (idRemap.size === 0) return;

    // Remove duplicate vehicles, remap entries
    const cleanedVehicles = vehicles.filter((v) => !idRemap.has(v.id));
    const cleanedLog = mileageLog.map((e) => {
      const newId = idRemap.get(e.vehicleId);
      if (newId) {
        const v = cleanedVehicles.find((vh) => vh.id === newId);
        return { ...e, vehicleId: newId, vehicleName: v ? displayName(v) : e.vehicleName };
      }
      return e;
    });

    setVehicles(cleanedVehicles);
    setMileageLog(cleanedLog);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Build a name→vehicleId lookup so orphaned entries can be resolved at runtime
  const nameToVehicleId = useMemo(() => {
    const map = {};
    const lower = (s) => (s || '').toLowerCase();
    for (const def of qbVehicleDefs) {
      const match = vehicles.find((v) =>
        lower(v.nickname) === lower(def.nickname) ||
        lower(v.name) === lower(def.qbName) ||
        lower(v.nickname) === lower(def.qbName) ||
        (v.make && lower(v.make) === lower(def.make) && v.year === def.year)
      );
      if (match) {
        map[lower(def.qbName)] = match.id;
        map[lower(def.nickname)] = match.id;
      }
    }
    for (const v of vehicles) {
      if (v.name) map[lower(v.name)] = v.id;
      if (v.nickname) map[lower(v.nickname)] = v.id;
    }
    return map;
  }, [vehicles, qbVehicleDefs]);

  // Resolve every entry's vehicleId — remap duplicates and orphans to the canonical vehicle
  const resolvedLog = useMemo(() => {
    const lower = (s) => (s || '').toLowerCase();
    return mileageLog.map((entry) => {
      // Try name-based resolution first to merge duplicates (e.g. "Lexus" → "Pat's Lexus")
      const byName = nameToVehicleId[lower(entry.vehicleName)];
      if (byName) return { ...entry, vehicleId: byName };
      // If vehicleId is valid, keep it
      if (vehicles.find((v) => v.id === entry.vehicleId)) return entry;
      return entry;
    });
  }, [mileageLog, vehicles, nameToVehicleId]);

  // --- Deduction dashboard data (owner only) ---
  const deductionData = useMemo(() => {
    if (!ownerMode) return null;
    const currentYear = new Date().getFullYear();
    // Deduplicate before calculating
    const seen = new Set();
    const yearEntries = resolvedLog.filter((e) => {
      if (!e.date || !e.date.startsWith(String(currentYear))) return false;
      const v = vehicles.find((vh) => vh.id === e.vehicleId);
      const name = v ? displayName(v) : e.vehicleName;
      const key = `${e.date}|${name}|${Number(e.odometer)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Each entry's odometer field stores trip miles directly
    const monthly = new Array(12).fill(0);
    let totalMiles = 0;
    for (const entry of yearEntries) {
      const miles = Number(entry.odometer) || 0;
      const month = parseInt(entry.date.split('-')[1], 10) - 1;
      monthly[month] += miles;
      totalMiles += miles;
    }

    const monthlyDeductions = monthly.map((m) => m * IRS_RATE);
    const totalDeduction = totalMiles * IRS_RATE;

    return { monthly, monthlyDeductions, totalMiles, totalDeduction, currentYear };
  }, [ownerMode, resolvedLog, vehicles]);

  // --- Date range bounds ---
  const dateFilter = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const pad = (n) => String(n).padStart(2, '0');
    switch (dateRange) {
      case 'today': {
        const today = getTodayInTimezone();
        return { from: today, to: today };
      }
      case 'this-month':
        return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(new Date(y, m + 1, 0).getDate())}` };
      case 'last-month': {
        const d = new Date(y, m - 1, 1);
        return { from: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`, to: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())}` };
      }
      case 'this-year':
        return { from: `${y}-01-01`, to: `${y}-12-31` };
      case 'last-30':
        return { from: toDateStringInTimezone(new Date(now - 30 * 86400000)), to: getTodayInTimezone() };
      case 'last-90':
        return { from: toDateStringInTimezone(new Date(now - 90 * 86400000)), to: getTodayInTimezone() };
      default:
        return { from: '', to: '' };
    }
  }, [dateRange]);

  // --- Filter entries ---
  const visibleEntries = useMemo(() => {
    const seen = new Set();
    return resolvedLog.filter((entry) => {
      const v = vehicles.find((vh) => vh.id === entry.vehicleId);
      const name = v ? displayName(v) : entry.vehicleName;
      const key = `${entry.date}|${name}|${Number(entry.odometer)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [resolvedLog, vehicles]);

  const filtered = visibleEntries.filter((entry) => {
    if (vehicleFilter !== 'all' && entry.vehicleId !== vehicleFilter) return false;
    if (dateFilter.from && entry.date < dateFilter.from) return false;
    if (dateFilter.to && entry.date > dateFilter.to) return false;
    if (search) {
      const q = search.toLowerCase();
      const v = vehicles.find((vh) => vh.id === entry.vehicleId);
      const vName = v ? displayName(v) : entry.vehicleName;
      const matchName = (vName || '').toLowerCase().includes(q);
      const matchNotes = (entry.notes || '').toLowerCase().includes(q);
      const matchBy = (entry.loggedBy || '').toLowerCase().includes(q);
      if (!matchName && !matchNotes && !matchBy) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  const safePage = Math.min(page, totalPages);
  const paginated = sorted.slice((safePage - 1) * perPage, safePage * perPage);

  // Reset page when filters change
  const updateSearch = (v) => { setSearch(v); setPage(1); };
  const updateVehicleFilter = (v) => { setVehicleFilter(v); setPage(1); };
  const updatePerPage = (v) => { setPerPage(v); setPage(1); };

  // --- Mileage submit (same logic as Home.jsx) ---
  const handleMileageSubmit = (form) => {
    const vehicle = vehicles.find((v) => v.id === form.vehicleId);
    const odometerNum = Number(form.odometer);
    const vehicleName = vehicle ? displayName(vehicle) : 'Unknown';

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

    setShowModal(false);
    setMileageSuccess(true);
    setTimeout(() => setMileageSuccess(false), 2000);
  };

  // --- Vehicle management ---
  const handleAddVehicle = () => {
    const nickname = newVehicleName.trim();
    if (!nickname) return;
    setVehicles([...vehicles, { id: genId(), name: nickname, nickname }]);
    setNewVehicleName('');
  };

  const handleRemoveVehicle = (id) => {
    setVehicles(vehicles.filter((v) => v.id !== id));
    setConfirmDeleteVehicleId(null);
  };

  const handleSaveVehicle = (id) => {
    const nickname = editForm.nickname.trim();
    if (!nickname) return;
    setVehicles(vehicles.map((v) => v.id === id ? {
      ...v,
      nickname,
      year: editForm.year.trim(),
      make: editForm.make.trim(),
      model: editForm.model.trim(),
      name: nickname,
    } : v));
    setEditingVehicleId(null);
  };

  const startEditing = (v) => {
    setEditingVehicleId(v.id);
    setEditForm({
      nickname: v.nickname || v.name || '',
      year: v.year || '',
      make: v.make || '',
      model: v.model || '',
    });
  };

  const handleDeleteEntry = (id) => {
    setMileageLog(mileageLog.filter((e) => e.id !== id));
    setConfirmDeleteId(null);
  };

  const startEditingEntry = (entry) => {
    setEditingEntryId(entry.id);
    setEntryEditForm({
      vehicleId: entry.vehicleId || '',
      odometer: String(entry.odometer || ''),
      date: entry.date || '',
      notes: entry.notes || '',
    });
  };

  const handleSaveEntry = (id) => {
    const vehicle = vehicles.find((v) => v.id === entryEditForm.vehicleId);
    setMileageLog(mileageLog.map((e) => e.id === id ? {
      ...e,
      vehicleId: entryEditForm.vehicleId,
      vehicleName: vehicle ? displayName(vehicle) : e.vehicleName,
      odometer: Number(entryEditForm.odometer) || 0,
      date: entryEditForm.date,
      notes: entryEditForm.notes,
    } : e));
    setEditingEntryId(null);
  };

  // --- Page numbers to display ---
  const pageNumbers = [];
  const maxVisible = 5;
  let start = Math.max(1, safePage - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
  for (let i = start; i <= end; i++) pageNumbers.push(i);

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/')} className="inline-flex items-center gap-1.5 text-sm text-secondary hover:text-primary cursor-pointer">
        <ArrowLeft size={16} /> Home
      </button>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
            <Gauge size={20} className="text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary">Mileage Log</h1>
            <p className="text-sm text-tertiary">
              {sorted.length} {sorted.length === 1 ? 'entry' : 'entries'}
            </p>
          </div>
        </div>
        <div className="relative flex items-center">
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-l-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Plus size={16} />
            Log Mileage
          </button>
          {ownerMode && (
            <>
              <button
                onClick={() => setShowActionMenu((v) => !v)}
                className="inline-flex items-center px-2.5 py-2.5 rounded-r-xl bg-emerald-700 text-white hover:bg-emerald-800 transition-colors cursor-pointer border-l border-emerald-400/30 self-stretch"
              >
                <ChevronDown size={16} className={`transition-transform ${showActionMenu ? 'rotate-180' : ''}`} />
              </button>
              {showActionMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowActionMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 z-50 bg-card rounded-xl shadow-xl border border-border-subtle py-1 min-w-[160px]">
                    <button
                      onClick={() => { setShowManage(true); setShowActionMenu(false); }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-primary hover:bg-surface-alt transition-colors cursor-pointer"
                    >
                      <Settings size={14} />
                      Manage Vehicles
                    </button>
                  </div>
                </>
              )}
            </>
          )}
          {!ownerMode && (
            <div className="rounded-r-xl bg-emerald-700 px-1 self-stretch" />
          )}
        </div>
      </div>

      {/* Deduction Dashboard (owner only) */}
      {ownerMode && deductionData && (
        <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-5">
          <div className="mb-4">
            <p className="text-xs font-medium text-tertiary uppercase tracking-wide">Potential deduction for {deductionData.currentYear}</p>
            <p className="text-3xl font-bold text-primary mt-1">
              ${deductionData.totalDeduction.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>

          {/* Bar chart with Y-axis */}
          <div className="flex mb-3">
            <div className="flex flex-col justify-between h-[120px] pr-2 shrink-0">
              {[1000, 750, 500, 250, 0].map((v) => (
                <span key={v} className="text-[10px] text-muted leading-none">${v}</span>
              ))}
            </div>
            <div className="relative flex items-end gap-1.5 h-[120px] flex-1">
              {[25, 50, 75, 100].map((pct) => (
                <div key={pct} className="absolute left-0 right-0 border-t border-border-subtle" style={{ bottom: `${pct}%` }} />
              ))}
              {deductionData.monthlyDeductions.map((amount, i) => {
                const heightPct = (amount / 1000) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative z-10">
                    <div className="relative w-full flex justify-center">
                      <span className="absolute -top-5 text-[10px] font-medium text-secondary opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        ${amount.toFixed(0)}
                      </span>
                    </div>
                    <div
                      className="w-full rounded-t-md bg-emerald-500 dark:bg-emerald-600 transition-all duration-300 min-h-[2px]"
                      style={{ height: amount > 0 ? `${Math.min(Math.max(heightPct, 1), 100)}%` : '2px' }}
                      title={`${MONTH_LABELS[i]}: ${deductionData.monthly[i].toLocaleString()} mi / $${amount.toFixed(2)}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex mb-4" style={{ paddingLeft: '2rem' }}>
            <div className="flex gap-1.5 flex-1">
              {MONTH_LABELS.map((label, i) => (
                <div key={i} className="flex-1 text-center text-[10px] text-muted">{label}</div>
              ))}
            </div>
          </div>

          {/* Stats row */}
          <div className="flex items-center justify-between text-xs text-secondary border-t border-border-subtle pt-3">
            <span>Total business miles: <span className="font-semibold text-primary">{deductionData.totalMiles.toLocaleString()}</span></span>
            <span>IRS rate: <span className="font-semibold text-primary">${IRS_RATE}/mile</span></span>
          </div>
        </div>
      )}

      {/* Entries panel (collapsible for owner, always open for field team) */}
      <div className="bg-card rounded-2xl shadow-sm border border-border-subtle">
        {ownerMode ? (
          <button
            onClick={() => setShowEntries((v) => !v)}
            className="w-full flex items-center justify-between p-5 cursor-pointer"
          >
            <span className="text-sm font-bold text-primary">Mileage Entries ({sorted.length})</span>
            <ChevronDown size={16} className={`text-muted transition-transform ${showEntries ? 'rotate-180' : ''}`} />
          </button>
        ) : (
          <div className="p-5 pb-0">
            <span className="text-sm font-bold text-primary">Mileage Entries ({sorted.length})</span>
          </div>
        )}
      {(showEntries || !ownerMode) && (
      <div className="px-5 pb-5 space-y-4">

      {/* Filters row — 2 dropdowns */}
      <div className="flex items-center gap-3">
        <select
          value={dateRange}
          onChange={(e) => { setDateRange(e.target.value); setPage(1); }}
          className="flex-1 min-w-0 rounded-xl border border-border-strong bg-card px-3 py-2 text-xs font-medium text-primary outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
        >
          <option value="today">Today</option>
          <option value="this-month">This Month</option>
          <option value="last-month">Last Month</option>
          <option value="last-30">Last 30 Days</option>
          <option value="last-90">Last 90 Days</option>
          <option value="this-year">This Year</option>
          <option value="all">All Time</option>
        </select>

        <select
          value={vehicleFilter}
          onChange={(e) => updateVehicleFilter(e.target.value)}
          className="flex-1 min-w-0 rounded-xl border border-border-strong bg-card px-3 py-2 text-xs font-medium text-primary outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
        >
          <option value="all">All Vehicles</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>{displayName(v)}</option>
          ))}
        </select>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => updateSearch(e.target.value)}
          placeholder="Search by vehicle, notes, or name..."
          className="w-full rounded-xl border border-border-strong bg-card pl-10 pr-4 py-2.5 text-sm text-primary outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-placeholder-muted"
        />
      </div>

      {/* Entry list */}
      {paginated.length === 0 ? (
        <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-8 text-center">
          <Gauge size={32} className="text-muted mx-auto mb-3" />
          <p className="text-sm font-semibold text-secondary mb-1">No entries found</p>
          <p className="text-xs text-muted">
            {search || vehicleFilter !== 'all'
              ? 'Try adjusting your search or filters.'
              : 'Tap "Log Mileage" to add your first entry.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {paginated.map((entry) => {
            const entryVehicle = vehicles.find((v) => v.id === entry.vehicleId);
            const entryDisplayName = entryVehicle ? displayName(entryVehicle) : entry.vehicleName;
            return (
            <div key={entry.id} className="bg-card rounded-xl shadow-sm border border-border-subtle p-4">
              {ownerMode && editingEntryId === entry.id ? (
                <div className="space-y-2 overflow-hidden">
                  <select
                    value={entryEditForm.vehicleId}
                    onChange={(e) => setEntryEditForm({ ...entryEditForm, vehicleId: e.target.value })}
                    className="w-full rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="">Select vehicle...</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>{displayName(v)}</option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      min="0"
                      value={entryEditForm.odometer}
                      onChange={(e) => setEntryEditForm({ ...entryEditForm, odometer: e.target.value })}
                      placeholder="Miles"
                      className="min-w-0 rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <input
                      type="date"
                      value={entryEditForm.date}
                      onChange={(e) => setEntryEditForm({ ...entryEditForm, date: e.target.value })}
                      className="min-w-0 rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <input
                    type="text"
                    value={entryEditForm.notes}
                    onChange={(e) => setEntryEditForm({ ...entryEditForm, notes: e.target.value })}
                    placeholder="Notes (optional)"
                    className="w-full rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSaveEntry(entry.id)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors cursor-pointer"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingEntryId(null)}
                      className="px-3 py-1.5 rounded-lg border border-border-strong text-secondary text-xs font-medium hover:bg-surface-alt transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-primary">
                    {entryDisplayName}
                    {entryVehicle && entryVehicle.nickname && (entryVehicle.year || entryVehicle.make || entryVehicle.model) && (
                      <span className="text-xs font-normal text-muted ml-2">{[entryVehicle.year, entryVehicle.make, entryVehicle.model].filter(Boolean).join(' ')}</span>
                    )}
                  </h3>
                  <p className="text-xs text-secondary mt-1">
                    Miles: <span className="font-semibold">{Number(entry.odometer).toLocaleString()}</span>
                  </p>
                  {entry.notes && (
                    <p className="text-xs text-tertiary mt-1 line-clamp-2">{entry.notes}</p>
                  )}
                  <p className="text-xs text-muted mt-1.5">
                    {entry.date ? `${Number(entry.date.split('-')[1])}/${Number(entry.date.split('-')[2])}/${entry.date.split('-')[0]}` : ''} &middot; Logged by {entry.loggedBy}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {ownerMode && (
                    <>
                      <button
                        onClick={() => startEditingEntry(entry)}
                        className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-surface-alt transition-colors cursor-pointer"
                        title="Edit entry"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(entry.id)}
                        className="p-1.5 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors cursor-pointer"
                        title="Delete entry"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      {/* Per-page selector */}
      <div className="flex items-center justify-center gap-2 pt-2">
        <span className="text-xs text-muted">Per page:</span>
        <select
          value={perPage}
          onChange={(e) => updatePerPage(Number(e.target.value))}
          className="rounded-lg border border-border-strong bg-card px-2 py-1 text-xs font-medium text-primary outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
        >
          {[10, 20, 50, 100].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="p-2 rounded-lg text-secondary hover:bg-surface-alt transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={16} />
          </button>
          {pageNumbers.map((n) => (
            <button
              key={n}
              onClick={() => setPage(n)}
              className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                n === safePage
                  ? 'bg-brand text-on-brand'
                  : 'text-secondary hover:bg-surface-alt'
              }`}
            >
              {n}
            </button>
          ))}
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className="p-2 rounded-lg text-secondary hover:bg-surface-alt transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      </div>
      )}
      </div>{/* End entries panel */}

      {/* Vehicle management slide-in panel (owner only) */}
      {ownerMode && showManage && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onMouseDown={() => setShowManage(false)} />
          <div
            className="relative w-full max-w-sm bg-card shadow-2xl h-full overflow-y-auto animate-slide-in-right"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-border-subtle">
              <h2 className="text-lg font-bold text-primary">Manage Vehicles</h2>
              <button
                onClick={() => setShowManage(false)}
                className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-surface-alt transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="px-5 pt-4 pb-1 text-[11px] text-muted">Drag to reorder — top = highest priority in dropdowns</p>
            <div className="p-5 pt-2 space-y-0">
              {vehicles.map((v, vi) => (
                <div key={v.id}>
                  {/* Drop indicator line — shows above this item when dragging */}
                  <div className={`h-0.5 rounded-full mx-2 transition-all duration-150 ${
                    dragFrom !== null && dragOver === vi && dragFrom !== vi && dragFrom !== vi - 1
                      ? 'bg-emerald-500 my-1.5'
                      : 'bg-transparent my-0'
                  }`} />
                <div
                  draggable={editingVehicleId !== v.id}
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', vi); setDragFrom(vi); }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(vi); }}
                  onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
                  onDrop={(e) => { e.preventDefault(); const from = Number(e.dataTransfer.getData('text/plain')); setDragFrom(null); setDragOver(null); if (from !== vi) { const updated = [...vehicles]; const [item] = updated.splice(from, 1); updated.splice(vi, 0, item); setVehicles(updated); } }}
                  className={`rounded-xl border p-3 mb-2 transition-all duration-150 ${
                    dragFrom === vi ? 'opacity-40 border-border-subtle' :
                    dragFrom !== null && dragOver === vi ? 'border-emerald-500/50' :
                    'border-border-subtle hover:border-border-strong'
                  }`}
                >
                  {editingVehicleId === v.id ? (
                    <div className="space-y-2">
                      <div>
                        <label className="text-[10px] font-medium text-tertiary uppercase">Nickname *</label>
                        <input
                          type="text"
                          value={editForm.nickname}
                          onChange={(e) => setEditForm({ ...editForm, nickname: e.target.value })}
                          autoFocus
                          className="w-full rounded-lg border border-border-strong bg-card px-3 py-1.5 text-sm text-primary outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] font-medium text-tertiary uppercase">Year</label>
                          <input
                            type="text"
                            value={editForm.year}
                            onChange={(e) => setEditForm({ ...editForm, year: e.target.value })}
                            placeholder="2016"
                            className="w-full rounded-lg border border-border-strong bg-card px-3 py-1.5 text-sm text-primary outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-medium text-tertiary uppercase">Make</label>
                          <input
                            type="text"
                            value={editForm.make}
                            onChange={(e) => setEditForm({ ...editForm, make: e.target.value })}
                            placeholder="Ford"
                            className="w-full rounded-lg border border-border-strong bg-card px-3 py-1.5 text-sm text-primary outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-medium text-tertiary uppercase">Model</label>
                          <input
                            type="text"
                            value={editForm.model}
                            onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
                            placeholder="F150"
                            className="w-full rounded-lg border border-border-strong bg-card px-3 py-1.5 text-sm text-primary outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => handleSaveVehicle(v.id)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors cursor-pointer"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingVehicleId(null)}
                          className="px-3 py-1.5 rounded-lg border border-border-strong text-secondary text-xs font-medium hover:bg-surface-alt transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="cursor-grab active:cursor-grabbing text-muted hover:text-secondary shrink-0">
                        <GripVertical size={16} />
                      </div>
                      <div className="flex-1 min-w-0 flex items-baseline gap-2">
                        <span className="text-sm font-medium text-primary">
                          {[v.year, v.make, v.model].filter(Boolean).join(' ') || v.name || 'Unknown'}
                        </span>
                        {v.nickname && (
                          <span className="text-[11px] text-muted">{v.nickname}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => startEditing(v)}
                          className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-surface-alt transition-colors cursor-pointer"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteVehicleId(v.id)}
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors cursor-pointer"
                          title="Remove vehicle"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                </div>
              ))}
              {/* Drop indicator at the very bottom */}
              <div className={`h-0.5 rounded-full mx-2 transition-all duration-150 ${
                dragFrom !== null && dragOver === vehicles.length
                  ? 'bg-emerald-500 my-1.5'
                  : 'bg-transparent my-0'
              }`} />
            </div>

            {/* Add vehicle */}
            <div className="p-5 border-t border-border-subtle">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newVehicleName}
                  onChange={(e) => setNewVehicleName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddVehicle()}
                  placeholder="New vehicle name..."
                  className="flex-1 rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  onClick={handleAddVehicle}
                  className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors cursor-pointer"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {/* Delete vehicle confirmation */}
            {confirmDeleteVehicleId && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-5">
                <div className="bg-card rounded-2xl shadow-2xl w-full max-w-xs p-5" onClick={(e) => e.stopPropagation()}>
                  <h3 className="text-base font-bold text-primary mb-2">Remove Vehicle?</h3>
                  <p className="text-sm text-secondary mb-4">
                    Are you sure you want to remove <span className="font-semibold">{(() => { const veh = vehicles.find((v) => v.id === confirmDeleteVehicleId); return veh ? displayName(veh) : ''; })()}</span>? This cannot be undone.
                  </p>
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => setConfirmDeleteVehicleId(null)}
                      className="px-4 py-2 rounded-lg border border-border-strong text-secondary text-sm font-medium hover:bg-surface transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleRemoveVehicle(confirmDeleteVehicleId)}
                      className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mileage Modal */}
      {showModal && (
        <MileageModal
          vehicles={vehicles}
          currentUser={currentUser}
          onSubmit={handleMileageSubmit}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* Success toast */}
      {mileageSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mx-auto mb-4">
              <Check size={32} className="text-emerald-600" />
            </div>
            <h3 className="text-lg font-bold text-primary mb-1">Mileage Logged!</h3>
            <p className="text-sm text-secondary">Your entry has been saved.</p>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmDeleteId(null)}>
          <div className="bg-card rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-primary mb-2">Delete Entry?</h3>
            <p className="text-sm text-secondary mb-5">This will permanently remove this mileage entry. This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 rounded-lg border border-border-strong text-secondary text-sm font-medium hover:bg-surface transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteEntry(confirmDeleteId)}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
