# Sea Freight Rate Control — `frmSFSeaRate`

Modern web UI mockup for the legacy VB6 form `frmSFSeaRate.frm`. Vanilla JavaScript modular pattern (no ES modules, no build step, no backend). **Works on both `file://` and HTTP server — just double-click `index.html`**.

> **Status**: Reference implementation for the React/Inertia port. UI mirrors the original form's two states (master-only / master + detail edit).

---

## 🚀 Run locally

**Easiest** — double-click `index.html`. That's it. (Works via `file://` because the seed is inlined in `data.js`.)

**Or run an HTTP server** (recommended for development — enables `fetch` on the canonical `data.json` and reload-on-save):

```bash
# Python (built-in)
cd D:/DEV.AI/SMP.AI/mockup
python -m http.server 8765

# Node
npx http-server . -p 8765
```

แล้วเปิด http://localhost:8765/frmSFSeaRate/

---

## 📂 File layout

```
frmSFSeaRate/
├── index.html              ← UI shell (loads data.js + 10 src/*.js scripts in order)
├── style.css               ← Tailwind CDN + custom utility classes
├── data.json               ← canonical seed (edit this for "real" data changes)
├── data.js                 ← window.SEED_DATA wrap of data.json (loaded synchronously for file://)
├── mapping.md              ← UI field ↔ SFRATE/SFRATED columns
├── README.md               ← this file
└── src/
    ├── app.js              ← entry: boot + cross-module wiring
    ├── state.js            ← global state + localStorage persistence
    ├── utils.js            ← DOM shortcuts + formatters (pure)
    ├── ui.js               ← toast + confirm dialog (MsgBoxXP equiv.)
    ├── search.js           ← top filter bar + tabs + populate lists
    ├── master-grid.js      ← Rate List render + selection + keyboard nav
    ├── sub-rate.js         ← SUB-RATE cost grid (SFRATED) + cell editors
    ├── detail.js           ← Rate Detail pane + form binding
    ├── lookup.js           ← Lookup modal (Agent / Carrier / Port)
    └── crud.js             ← Add / Copy / Save / Delete actions
```

---

## 🧩 How modules talk (IIFE + RC namespace)

Each file under `src/` is a plain `<script>` (NOT an ES module) wrapped in an
IIFE and attached to a single global namespace `window.RC.<name>`:

```js
// src/utils.js
window.RC = window.RC || {};
window.RC.utils = (function () {
    function $(sel) { return document.querySelector(sel); }
    // ...
    return { $, $$, escapeHtml, fmtDate, num, newRateId, nextPmKey };
}());
```

Other modules consume it by destructuring:

```js
// src/state.js
window.RC.state = (function () {
    const { $ } = RC.utils;           // ← pull from namespace
    // ...
}());
```

**Why not ES modules?** They don't load on `file://` due to CORS, which
breaks zero-config preview (a hard requirement here). The IIFE pattern
gives the same separation-of-concerns + private scope without that
restriction, at the cost of caring about `<script>` order.

### Dependency graph

```
                            ┌──────────┐
                            │  app.js  │   ← boots, wires callbacks
                            └────┬─────┘
            ┌──────────┬─────────┼─────────┬──────────┬────────────┐
            ▼          ▼         ▼         ▼          ▼            ▼
        search.js  detail.js  lookup.js  crud.js  master-grid  sub-rate
            │          │         │         │          │            │
            └──────┬───┴────┬────┴──────┬──┴─────┬────┘            │
                   ▼        ▼           ▼        ▼                 ▼
                state.js  ui.js                utils.js (foundational)
```

Load order in `index.html` (mirrors the graph bottom-up):

```html
<script src="data.js"></script>           <!-- window.SEED_DATA -->
<script src="src/utils.js"></script>      <!-- no deps -->
<script src="src/state.js"></script>      <!-- needs utils -->
<script src="src/ui.js"></script>         <!-- needs utils -->
<script src="src/sub-rate.js"></script>   <!-- needs utils, state, ui -->
<script src="src/master-grid.js"></script><!-- needs utils, state, sub-rate -->
<script src="src/detail.js"></script>     <!-- needs utils, state, master-grid, sub-rate -->
<script src="src/lookup.js"></script>     <!-- needs utils, state, detail -->
<script src="src/search.js"></script>     <!-- needs utils, state, master-grid, detail, sub-rate -->
<script src="src/crud.js"></script>       <!-- needs ui, state, search, master-grid, detail, sub-rate -->
<script src="src/app.js"></script>        <!-- boots everything -->
```

- **utils** has no deps (pure helpers).
- **state / ui** depend only on `utils`.
- **master-grid → sub-rate** (re-render cost grid on row select).
- **detail → master-grid** (call `selectRate` when opening pane).
  - The reverse direction (master-grid → detail) is avoided via
    `setHandlers({ onDblClick, onSelect })` injected from `app.js`.
- **crud** depends on most things (it orchestrates Save/Copy/Delete flows).
- **app.js** at the top — registers all cross-module callbacks before any
  UI event fires.

---

## 🗺 Data model

JSON shape mirrors three DB tables. See [`mapping.md`](mapping.md) for the full field-by-field map.

```
data.json
├── company                  → company-level settings (DEMO mode here)
├── masters
│   ├── ports[]              → OPPORT (PortType='SF')
│   ├── businesses[]         → SMBUSINESS (FORWARDER/SEALINE/SEA-AIR)
│   ├── currencies[]         → fixed combo (USD/THB/EUR/...)
│   ├── containerTypes[]     → fixed combo (Dry/DC/OT/FR/RF/Tank/...)
│   ├── cyTerms[]            → CYTERM combo (CY/CY, CFS/CFS, ...)
│   ├── jobClasses[]         → EX | IM
│   └── services[]           → OPItem + hardcoded (FRT/AMS/CAF/BAF)
└── rates[]                  → SFRATE (header)
    ├── ...header fields     → RATEID, JOBCLASS, AGENTNO/NAME, ports, validity, totals, remarks
    ├── costs[]              → SFRATED (cost lines)
    └── sellings[]           → SFRATED2 (selling lines — hidden for DEMO company)
```

---

## ⚙️ How to extend

### Add a new field to the header

1. Add column to `SFRATE` create-table SQL (if backing real DB).
2. Add `<input data-field="MYFIELD">` inside `#detailPane` in `index.html`.
3. Append to the rate object in `data.json` seed.
4. (Optional) Update `mapping.md`.

`detail.js` auto-binds any element with `[data-field]` — no code change needed.

### Add a new column to the master grid

1. Add `<th>` in `<thead>` of `#masterTable` (use class `hide-when-detail` if it should collapse when the pane opens).
2. Add `<td>${escapeHtml(r.MYFIELD || '')}</td>` to the template in `master-grid.js → render()`.
3. Bump the `colspan` of `.row-empty` / `.add-new-row` if you added a visible column.

### Add a new search filter

In `search.js`:
- `populateFilterList()` — push the new options to the datalist.
- `runSearch()` — append a `rows = rows.filter(...)` block.

### Add a new lookup type

In `lookup.js → open(kind, target)`, add a new `else if` branch with `rows` + `cols`. Then put a button in `index.html` with `data-lookup="MYKIND"`.

### Add a new module

1. Create `src/myFeature.js` using the IIFE pattern:
   ```js
   window.RC = window.RC || {};
   window.RC.myFeature = (function () {
       'use strict';
       const { $ } = RC.utils;             // pull deps
       const { state } = RC.state;
       function doSomething() { /* … */ }
       return { doSomething };             // public API
   }());
   ```
2. Add `<script src="src/myFeature.js">` to `index.html` **after** every dep it imports from `RC.*`.
3. Call `RC.myFeature.doSomething()` from `app.js` (or wherever).

### Hook to a real backend

Replace `state.persist()` (localStorage write) and the `state.data.rates` mutations in `crud.js` with `fetch('/api/rates', { method: 'POST', ... })` calls. The rest of the UI doesn't care where the data lives.

### Sync `data.json` ↔ `data.js`

`data.json` is the canonical seed (Git diffs nicely). `data.js` is just `window.SEED_DATA = <data.json>;` so the file:// path works without `fetch`. After editing `data.json`, regenerate:

```bash
{ echo "window.SEED_DATA ="; cat data.json; echo ";"; } > data.js
```

Or in PowerShell:
```powershell
"window.SEED_DATA =`n$(Get-Content data.json -Raw)`n;" | Set-Content data.js -Encoding utf8
```

---

## 🔑 Key behaviors (matches VB6)

| VB6                                     | Mockup                                                |
|-----------------------------------------|-------------------------------------------------------|
| `TabStrip2_Click` (Carrier/Agent/Dest)  | `.tab` buttons → `search.switchTab()`                 |
| `cmdSearch_Click`                       | `searchBtn` → `search.runSearch()`                    |
| `cmdCLR_Click` (Rows=1 → Rows=2)        | `clearBtn` → `search.clearSearch()` + blank add row   |
| `grdDetail_DblClick`                    | row dblclick → `detail.open()` (slide-in pane)        |
| `cmdSave_Click` / SaveData              | `saveBtn` → `crud.saveDetail()` (FINAL PORT required) |
| `cmdDelete_Click`                       | `deleteBtn` → `crud.deleteDetail()` (focus row above) |
| `cmdCopy_Click`                         | `copyBtn` → `crud.copyDetail()` (mark `__addMode`)    |
| `cmdSum_Click` (Apply to total)         | `applyTotalBtn` → `subRate.applyToTotal()`            |
| `Frame(0).Visible = True`               | `body.detail-open` class (hides extra grid columns)   |
| `xPopup1_Click` (frmSMBusiness / OPPort)| `.lookup-btn` → `lookup.open(kind, target)`           |
| `Lock = CDbl(Now)`                      | `rate.LOCK = Date.now()` on every save                |

---

## 💾 Persistence

- All edits go to `localStorage` key `sfSeaRate.mockup.v1`.
- **⬇ Export JSON** in the top bar downloads the working copy as `data.json` — replace the file on disk to make the change "permanent" in the seed.
- **↺ Reset Seed** clears localStorage + reloads from `data.json`.

---

## 🧪 Validation rules (from `ChkValidate`)

| Field         | Rule                          |
|---------------|-------------------------------|
| `AGENTNO`     | required + must exist in SMBUSINESS |
| `LINERNO`     | optional, but if set must exist     |
| `LOADPORT`    | optional, if set must exist (PortType='SF') |
| `DISPORT`     | optional, if set must exist                  |
| `TRANPORT`    | optional, if set must exist                  |
| `FINALPORT`   | **required** + must exist                    |

Currently only `FINALPORT required` is enforced in the mockup (`crud.saveDetail`). Add more checks in that function as needed.

---

## 📋 Quick command cheatsheet

| Action                | Shortcut / Trigger                          |
|-----------------------|---------------------------------------------|
| Open Detail pane      | DblClick a master row                       |
| Move selection        | ↑ / ↓ on the document (when not in input)   |
| Add new rate          | `+ Add Line` (Rate List) / `+ New Rate` / DblClick blank row after `CLEAR SCR` |
| Copy current rate     | `📋 Copy` in detail footer                  |
| Apply totals to header| `Apply to total >>>` in SUB-RATE toolbar    |
| Lookup Port/Agent/etc | 🔍 button next to the field                 |
| Export data           | `⬇ Export JSON` (top bar)                   |
| Reset to seed         | `↺ Reset Seed` (top bar)                    |

---

## 📜 License

Internal mockup — same license as the parent SMP project.
