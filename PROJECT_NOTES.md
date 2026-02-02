# Lawn Care Hub — Project Notes

**App name:** Hey Jude's Lawn Care HQ
**Stack:** React 19 + Vite 7 + Tailwind CSS v4 + Supabase + TipTap
**Type:** Single-page PWA (no React Router — uses tab state)
**Language:** JavaScript/JSX (no TypeScript)

Last updated: 2026-02-01

---

## Quick Start

```bash
npm install
npm run dev      # dev server
npm run build    # production build → dist/
npm run preview  # preview production build
npm run lint     # ESLint
```

Environment variables live in `.env`:
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anonymous/public key

---

## Directory Layout

```
src/
├── main.jsx                  # Entry point, wraps app in AuthProvider + ThemeProvider
├── App.jsx                   # Auth gate, data layer (useCloudState), tab navigation, shell
├── index.css                 # Tailwind v4 config, CSS custom properties, light/dark tokens
├── App.css                   # (empty)
├── data.js                   # genId(), all initial/seed data arrays
├── contexts/
│   ├── AuthContext.jsx        # Supabase auth, session, ownerMode flag
│   └── ThemeContext.jsx       # Light/Dark/Auto theme with 60s auto-check interval
├── lib/
│   └── supabase.js            # Supabase client + createSignUpClient() helper
├── pages/
│   ├── Home.jsx               # Team home — announcements, checklists, quick actions
│   ├── OwnerDashboard.jsx     # Owner home — todos, PTO approvals, repairs, checklists
│   ├── HowToGuides.jsx        # Playbooks (Service/Sales/Strategy) with rich text
│   ├── EquipmentIdeas.jsx     # Equipment inventory, repair reporting, repair log
│   ├── HRPolicies.jsx         # HR policies + time-off request system
│   ├── IdeasFeedback.jsx      # Ideas/feedback submissions with status tracking
│   ├── Settings.jsx           # Preferences (theme, timezone) + team management
│   └── Standards.jsx          # Quality/safety/professionalism standards
├── components/
│   ├── LoginForm.jsx          # Email/password login form
│   ├── Card.jsx               # Generic card for grids (guides, policies, standards)
│   ├── ViewModal.jsx          # Read-only modal — renders rich HTML content
│   ├── EditModal.jsx          # Create/edit modal — lazy-loads RichTextEditor
│   ├── RichTextEditor.jsx     # TipTap editor (bold, italic, headings, lists, images)
│   ├── ChecklistPanel.jsx     # Team daily checklist (start/end of day)
│   ├── OwnerChecklist.jsx     # Owner daily checklist (supports headers + markdown links)
│   ├── ChecklistTracker.jsx   # Weekly completion grid with color-coded dots
│   ├── ChecklistEditorModal.jsx # Full checklist editor (reorder, indent, add/remove)
│   ├── AnnouncementEditorModal.jsx # Create/edit/archive/restore announcements
│   ├── AddEquipmentModal.jsx  # Add new equipment form
│   ├── ReportRepairModal.jsx  # Report equipment issue (photo, urgency, description)
│   └── NameSelector.jsx       # (unused) hardcoded name picker
```

---

## Authentication & Authorization

Handled by **Supabase Auth** via `AuthContext.jsx`.

- `signIn(email, password)` / `signOut()`
- User metadata stores `display_name` and `role` ('owner' or 'member')
- `ownerMode` is true when `user.user_metadata.role === 'owner'`
- Non-owners are checked against a permissions map (`greenteam-permissions` in Supabase). If the user's email isn't in the map, they see "Access Denied."
- Team members are created from Settings page using `createSignUpClient()` (a separate Supabase client that doesn't persist the new session).

---

## Data Layer

### Cloud + Local Cache

All app data lives in a single Supabase table called `app_state` (key-value store: `key` text, `value` jsonb). The custom `useCloudState` hook in `App.jsx` handles sync:

1. On load: fetch all rows from `app_state`, merge into state
2. On change: debounced upsert to `app_state` (500ms) + write to localStorage cache
3. On failure: fall back to `localStorage` cache (key: `greenteam-data-cache`)

### Data Keys

| Key | Type | Description |
|-----|------|-------------|
| `greenteam-permissions` | `{ [email]: { name, playbooks[] } }` | Team access control |
| `greenteam-announcements` | `Announcement[]` | Active announcements |
| `greenteam-archivedAnnouncements` | `Announcement[]` | Archived announcements |
| `greenteam-guides` | `Guide[]` | Playbooks/how-to guides |
| `greenteam-equipment` | `Equipment[]` | Equipment inventory |
| `greenteam-policies` | `Policy[]` | HR policies |
| `greenteam-timeOffRequests` | `TimeOffRequest[]` | PTO requests |
| `greenteam-suggestions` | `Idea[]` | Ideas and feedback |
| `greenteam-ownerTodos` | `Todo[]` | Owner task list |
| `greenteam-ownerStartChecklist` | `ChecklistItem[]` | Owner AM checklist |
| `greenteam-ownerEndChecklist` | `ChecklistItem[]` | Owner PM checklist |
| `greenteam-teamChecklist` | `ChecklistItem[]` | Team AM checklist |
| `greenteam-teamEndChecklist` | `ChecklistItem[]` | Team PM checklist |
| `greenteam-checklistLog` | `ChecklistLogEntry[]` | Daily completion records |
| `greenteam-equipmentRepairLog` | `RepairEntry[]` | Repair history |
| `greenteam-theme` | `'light'\|'dark'\|'auto'` | Theme preference (localStorage only) |
| `greenteam-timezone` | `string` | Timezone override (localStorage only) |

---

## Data Structures

```
Announcement { id, title, message, priority('normal'|'high'), date, postedBy, expiresAt? }
Guide        { id, title, category('Field Team'|'Sales'|'Strategy'), type('field-team'|'sales'|'strategy'), content(HTML) }
Equipment    { id, name, type, serialNumber, manualUrl, status('operational'|'needs-repair'), lastMaintenance, reportedIssue?, reportedBy?, reportedDate?, urgency?, photo?(base64) }
TimeOffReq   { id, name, startDate(MM/DD/YYYY), endDate(MM/DD/YYYY), days, reason, requestedDate, status('pending'|'approved'|'denied') }
ChecklistItem{ id, text, type('item'|'header'), indent(0-3), done }
ChecklistLog { id, date(YYYY-MM-DD), checklistType('team-start'|'team-end'|'owner-start'|'owner-end'), totalItems, completedItems, updatedAt(ISO) }
Policy       { id, title, category, summary, content(plain text) }
Idea         { id, type('idea'|'feedback'), title, description, submittedBy, date, status('New'|'Reviewing'|'Approved'|'Implemented'|'Rejected') }
```

---

## Navigation

No router library. `App.jsx` holds a `tab` state and renders pages conditionally:

- **Home tab** → `Home.jsx` (team) or `OwnerDashboard.jsx` (owner)
- **Playbooks tab** → `HowToGuides.jsx`
- **HR tab** → `HRPolicies.jsx`
- **Ideas tab** → `IdeasFeedback.jsx`
- **Settings tab** → `Settings.jsx`
- **Equipment** and **Standards** are accessible from within other pages or direct tab state changes

Desktop has a top tab bar. Mobile has a bottom navigation bar with 4 icons + settings gear.

---

## Theme System

`ThemeContext.jsx` manages appearance:

- Three modes: `light`, `dark`, `auto`
- Auto computes from time of day: light if hour 7-19, dark otherwise
- A `setInterval` (60s) re-evaluates auto mode so it transitions live
- Persisted in `localStorage` under `greenteam-theme`
- CSS custom properties in `index.css` define light and dark palettes
- Dark mode applied via `dark` class on `<html>` element
- Brand color: emerald (#059669 light, #10b981 dark)

---

## Styling

**Tailwind CSS v4** with custom design tokens defined in `index.css` via `@theme`:

- Surface colors: `--color-surface`, `--color-card`, `--color-surface-alt`, `--color-surface-strong`
- Text: `--color-primary`, `--color-secondary`, `--color-tertiary`, `--color-muted`
- Borders: `--color-border-subtle`, `--color-border-default`, `--color-border-strong`
- Brand: `--color-brand`, `--color-brand-hover`, `--color-brand-text`, `--color-on-brand`
- Ring: `--color-ring-brand`, `--color-ring-focus`

Typography plugin (`@tailwindcss/typography`) used for rich text rendering in modals.

Common patterns: `rounded-2xl`, `shadow-lg`, `border border-border-subtle`, `bg-card`.

---

## Features by Page

### Home (team view)
- Welcome hero banner
- Active announcements (auto-archives expired ones)
- Team start-of-day and end-of-day checklists
- Quick action buttons: Open Jobber, Report Issue, Submit Idea

### Owner Dashboard
- Time-based greeting
- Editable owner todo list
- Collapsible sections for: announcements, PTO requests (approve/deny), equipment repairs (mark repaired), new suggestions (update status), team availability calendar, owner checklists, checklist tracker
- Buttons to open checklist editor and announcement editor modals

### Playbooks (HowToGuides)
- Three categories with access control per user
- Search and category filter
- Card grid with view/edit/delete
- Rich text content via TipTap editor
- ~22 seed guides covering mowing, equipment, sales, operations

### Equipment
- Inventory list with search and type filter
- Add equipment, report repairs (with photo + urgency), mark repaired, delete
- Repair history log
- Types: mower, blower, string-trimmer, hedge-trimmer, truck

### HR & Policies
- Policy cards with category badges
- Time-off request form (date range picker, reason)
- PTO dashboard: pending/approved counts, approve/deny workflow
- 4 seed policies: pay/benefits, time off, onboarding, code of conduct

### Ideas & Feedback
- Submit ideas or feedback
- Status tracking: New → Reviewing → Approved → Implemented (or Rejected)
- Owner can update statuses, delete entries

### Settings
- Theme selector: Light | Dark | Auto (pill buttons)
- Timezone selector dropdown (US time zones)
- Team management (owner only): add members with Supabase auth, assign playbook access, edit permissions, remove members

### Standards
- Quality/safety/professionalism/conduct standards
- Card grid with search, view/edit/delete (owner)

---

## PWA Configuration

Configured in `vite.config.js` via `vite-plugin-pwa`:
- Strategy: `generateSW` with auto-update
- App name: "Hey Jude's Lawn Care"
- Theme color: `#059669`
- Icons: `logo.png` at 192x192 and 512x512

---

## Deployment Playbook (GitHub → Vercel)

### 1. Push to GitHub
```bash
git add <files>
git commit -m "your message"
git push origin master
```

### 2. First-time Vercel setup
1. Go to [vercel.com/new](https://vercel.com/new)
2. Import `jawdixon1-cyber/ClaudeCodeRepo`
3. Application Preset: **Vite** (should auto-detect)
4. Root Directory: leave as `./` (repo root is the app)
5. Open **Environment Variables** and add:
   - `VITE_SUPABASE_URL` = `https://onnytrkhbnsmstgywcrw.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `sb_publishable_-gY5o6zmS6TQU-8U-RueUA_7G1b13Ts`
6. Click **Deploy**

### 3. Future deploys
Just push to `master` — Vercel auto-deploys on every push. No manual steps needed.

### 4. If something breaks
- Check the **Deployments** tab in Vercel for build logs
- Most common issue: missing env vars → white screen
- To redeploy manually: Deployments → three dots on latest → Redeploy

---

## Known Quirks / Technical Debt

1. **No React Router** — navigation is tab state in App.jsx
2. **Base64 images** — equipment repair photos stored as data URLs in the JSON (doesn't scale)
3. **Single Supabase table** — all data in `app_state` key-value store, not relational
4. **Date formats mixed** — time-off uses MM/DD/YYYY strings, checklists use YYYY-MM-DD
5. **No TypeScript** — entire codebase is plain JSX
6. **NameSelector.jsx unused** — component exists but isn't rendered anywhere
7. **Hardcoded Jobber URL** — external link in Home.jsx
8. **No tests** — no test files or test framework configured
9. **No CI/CD** — no GitHub Actions or deployment pipeline config
10. **Not a git repo** — no `.git` directory initialized yet
