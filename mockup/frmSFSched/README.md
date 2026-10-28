# Vessel Schedule — Mockup (`frmSFSched`)

Interactive HTML/CSS/JS mock of the **Sea Freight → Vessel Schedules** screen,
ported from the VB6 form `frmSFSched.frm`. It renders a searchable schedule grid
(`SFVSED`) with add / edit / delete / copy on mock JSON data — for UI review and
as a module-base starting point for the production build.

> Sister mockups: `../frmSFSeaRate` (Rate Control), `../frmSFQuotation`.
> Same architecture and conventions; this one uses the **`VS`** namespace.

---

## Run it

**Option A — file:// (no server).** Open `index.html` directly. Seed data is
inlined via `data.js` (`window.SEED_DATA`), so it works with no HTTP server.

**Option B — http:// (live-edit data.json).** Serve the folder, e.g.:
```
python -m http.server 8753 --directory mockup/frmSFSched
```
Over HTTP, `state.js` falls back to `fetch('data.json')`. (A `.claude/launch.json`
config named `sf-sched-mockup` is included for the Claude preview panel.)

Edits persist to `localStorage` (`sfSched.mockup.v1`). **↺ Reset Seed** restores
the original data; **⬇ Export JSON** downloads the current working set as
`data.json`.

---

## What you can do
- **Search by Location** (origin/destination country + port code) or **by Vessel**.
- Filter by **Date** (day-of-week for departure & arrival), **Port**, **Carrier**
  via the right-hand tab panel; narrow to a date window with *Search By* +
  *Start Date* + *Weeks Out*.
- **Double-click a row** to open the detail panel; edit and **Save**.
  Departure day, arrival date and arrival day recompute automatically
  (`ETA = ETD + Transit`).
- **+ New Schedule**, **Copy**, **Delete** (with confirm).
- Carrier / Vessel / Port pickers via the 🔍 lookup modal.

Dates display in **Buddhist era** (yyyy+543) to match the legacy form
(e.g. `08/06/2569`). Stored values stay ISO (`2026-06-08`).

---

## File layout
```
frmSFSched/
├── index.html        # markup + Tailwind CDN; loads data.js then src/*.js
├── style.css         # component classes (buttons, grid, tabs, checklists…)
├── data.json         # seed data (HTTP fetch + export reference)
├── data.js           # same payload as window.SEED_DATA (file:// support)
├── mapping.md        # UI ↔ VB6 ↔ SFVSED field map  ← read before back-end work
├── README.md         # this file
└── src/              # plain scripts (NOT ES modules), each → window.VS.<name>
    ├── utils.js      # VS.utils  — DOM + date math (weekday, addDays, BE format)
    ├── state.js      # VS.state  — seed/working data, localStorage, dirty flag
    ├── ui.js         # VS.ui     — toast + confirm dialog (MsgBox parity)
    ├── grid.js       # VS.grid   — render schedule rows, selection, dbl-click
    ├── detail.js     # VS.detail — edit panel; populate/read; ETA recompute
    ├── lookup.js     # VS.lookup — Carrier/Vessel/Port modal lookup
    ├── search.js     # VS.search — mode toggle, tabs, checklists, filter pipeline
    ├── crud.js       # VS.crud   — add/save/delete/copy + validation
    └── app.js        # VS.app    — boot: load → wire → init → first search
```

## How modules talk
Each `src/*.js` is a plain IIFE attached to `window.VS.<name>` (no bundler, no ES
modules — works on `file://`). Load order in `index.html` is the dependency order:

```
utils → state → ui → grid → detail → lookup → search → crud → app
```

`app.js` boots on `DOMContentLoaded`: loads seed, wires cross-module callbacks
(e.g. `grid.onDblClick → detail.open`, `search.onAddNew → crud.addNew`), inits
each subsystem, then runs the first `search.runSearch()`. Modules reference each
other through the `VS.*` namespace, so there are no circular imports.

---

## Wiring to the real back-end
1. Read **`mapping.md`** — every field maps to a `SFVSED` column; several are
   **server-derived** (`DEPDAY`, `ARRDATE`, `ARRDAY`, `LOCK`) and must be
   recomputed on save, not trusted from the client.
2. Replace `state.loadSeed()` with your data layer:
   - list/search → `SELECT * FROM SFVSED WHERE …` (indexes exist on `LINERNO`,
     `VESSEL`, `LOADPORT`, `FINALPORT`).
   - save → `INSERT`/`UPDATE SFVSED` inside a transaction; refresh `LOCK`.
   - masters → `SFVESSEL`, shared port master, business/liner master.
3. Enforce server-side rules the mockup only simulates:
   - optimistic lock check on `LOCK`,
   - delete guard (sailing in use by Booking/Job/BL),
   - `GROUPID`/permission filtering (`ChkUserCfg`).
4. Keep the filter semantics in `search.js → runSearch()` — they match the VB6
   search behaviour and are the contract for the query/API.

---

## Source of truth
- VB6 form: `frmSFSched.frm` (grid `grdDetail`, `SaveData`/`UpdateData`/`ReloadMember`).
- Vessel master form: `frmSFVessel.frm` → `SFVESSEL`.
- DB: `SFVSED` (schedules), `SFVESSEL` (vessels). See `mapping.md` for full schema.
