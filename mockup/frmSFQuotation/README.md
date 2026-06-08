# Sea Freight Quotation — `frmSFQuotation`

Modern web UI mockup for the legacy VB6 form `frmSFQuotation.frm`. Vanilla JavaScript modular pattern (IIFE + `window.SFQ` namespace, no ES modules, no build step, no backend). **Works on both `file://` and HTTP server — just double-click `index.html`**.

> **Status**: Reference implementation. Hand-off target for the React/Inertia port in `laravel-smp/`.

---

## 🚀 Run locally

**Easiest** — double-click `index.html`. The app boots from inlined seed + masters JS files (~9.4MB total, slight first-load delay while large customer/port lists parse).

**Or run an HTTP server** (recommended for active development — `fetch('data.json')` becomes the canonical source and large customers.json no longer has to live in JS):

```bash
# Python (built-in)
cd D:/DEV.AI/SMP.AI/mockup
python -m http.server 8765

# Node
npx http-server . -p 8765
```

แล้วเปิด http://localhost:8765/frmSFQuotation/

> **Note**: The IIFE conversion (2026-06-08) replaced ES modules. If you prefer the old `import/export` style, check the git history at `bb60684`.

---

## 📂 File layout

```
frmSFQuotation/
├── index.html              ← UI shell (loads ~22 plain scripts in dep order)
├── style.css               ← Tailwind CDN + suggest dropdown + status pills
├── data.json               ← canonical seed (edit this for "real" data changes)
├── data.js                 ← window.SEED wrap of data.json (file:// loader)
├── mapping.md              ← UI field ↔ AFQHEAD/SFQRATE/AFQDETAIL columns
├── validation-spec.md      ← port of `Sub ChkValidate` from frm
│
├── print.html              ← print preview shell (loads src/print/*.js)
├── print.css               ← A4 layout + Crystal-report-style tables
│
├── masters/                ← external master extracts (paired JSON + JS wrap)
│   ├── customers.json      ← 15,503 rows from SMBUSINESS (6.3 MB canonical)
│   ├── customers.js        ← window.SFQ_MASTERS_RAW.customers wrap (file:// loader)
│   ├── employees.json/.js  ← 116 rows from SMEMPL (23 KB)
│   ├── items.json/.js      ← 201 rows from OPItem (36 KB, split by JobClass)
│   └── ports.json/.js      ← 34,237 rows from OPPort (2.9 MB)
│
└── src/                    ← IIFE modules (window.SFQ.* namespace) — entry: app.js
    ├── app.js              ← boot: load → bind → paint
    ├── events.js           ← DOM event wiring (one-time, on boot)
    ├── actions.js          ← Save / Delete / Approve / New / Reset / Print / Navigate
    ├── validation.js       ← validate() — port of ChkValidate + ChkValidDetailCell
    │
    ├── core/
    │   ├── state.js        ← state, persist(), current(), setDirty()
    │   ├── factories.js    ← blankQuotation, blankFcl, blankDetail, GRIDS config
    │   ├── messages.js     ← MSG / msg() bilingual error strings
    │   └── utils.js        ← $, $$, escapeHtml, formatDate
    │
    ├── data/
    │   └── masters.js      ← loadInitial, loadExternalMasters, lookup*, select*
    │
    ├── grids/
    │   ├── fcl.js          ← paintFcl, fclRowEl (26-col SFQRATE grid)
    │   └── detail.js       ← paintDetail, detailRowEl, captureGridRow,
    │                          captureAllGrids — drives 3 LCL-style grids
    │
    ├── suggest/
    │   ├── field.js        ← installSmartSuggest — header lookup inputs
    │   ├── item-cell.js    ← installItemCellSuggest — ExpCode/ExpDesc1 cells
    │   └── port-cell.js    ← installPortCellSuggest — FCL port cells
    │
    ├── ui/
    │   ├── paint.js        ← paintAll, paintHeaderForm, paintBanner, …
    │   ├── toast.js        ← showToast, confirmDialog
    │   └── errors.js       ← clearErrors, applyErrors, showErrorModal
    │
    └── print/
        ├── main.js         ← print entry: load + paint
        ├── render.js       ← paint() — Crystal-report-style page renderer
        └── utils.js        ← escapeHtml / fmtDate / fmtMoney
```

---

## 🧩 How modules talk (IIFE + SFQ namespace)

Each file under `src/` is a plain `<script>` (NOT an ES module) wrapped in an
IIFE and attached to a single global namespace `window.SFQ.<name>`. Print
modules use a separate `window.SFQ_PRINT.<name>` to keep print.html lean:

```js
// src/grids/fcl.js
window.SFQ = window.SFQ || {};
window.SFQ.gridFcl = (function () {
    const { $, escapeHtml } = SFQ.utils;     // pull deps
    const { current }       = SFQ.state;
    function paintFcl() { /* ... */ }
    return { paintFcl };                     // expose public API
}());
```

**Why not ES modules?** They don't load on `file://` due to browser CORS,
which breaks zero-config double-click preview (a hard requirement here).
IIFE keeps the separation-of-concerns + private scope without that
restriction — at the cost of caring about `<script>` load order.

### Script load order (index.html)

```html
<!-- 1. Seed + masters (5 files, ~9.4MB total) -->
<script src="data.js"></script>
<script src="masters/customers.js"></script>
<script src="masters/employees.js"></script>
<script src="masters/items.js"></script>
<script src="masters/ports.js"></script>

<!-- 2. Foundation: no deps -->
<script src="src/core/utils.js"></script>
<script src="src/core/messages.js"></script>

<!-- 3. State + factories (need utils) -->
<script src="src/core/state.js"></script>
<script src="src/core/factories.js"></script>

<!-- 4. UI primitives (need state) -->
<script src="src/ui/toast.js"></script>
<script src="src/ui/errors.js"></script>

<!-- 5. Grids (need state + factories) -->
<script src="src/grids/fcl.js"></script>
<script src="src/grids/detail.js"></script>

<!-- 6. Paint (needs grids — paintAll calls paintFcl/paintDetail) -->
<script src="src/ui/paint.js"></script>

<!-- 7. Masters loader (needs paint for paintHeaderForm side-effect) -->
<script src="src/data/masters.js"></script>

<!-- 8. Validation (needs masters for lookup*) -->
<script src="src/validation.js"></script>

<!-- 9. Suggest (need toast, grids, masters) -->
<script src="src/suggest/field.js"></script>
<script src="src/suggest/item-cell.js"></script>
<script src="src/suggest/port-cell.js"></script>

<!-- 10. Orchestration -->
<script src="src/actions.js"></script>
<script src="src/events.js"></script>
<script src="src/app.js"></script>   <!-- DOMContentLoaded → boot() -->
```

---

## 🧠 Mental model

### Single source of truth: `state`

```js
// src/core/state.js
state = {
    quotations: [...],
    currentIndex: 0,
    company: {...},
    masters: {                       // NOT persisted (too large)
        customers, salesPeople, approvers, agents,  // from data + employees.json
        items, itemsByClass: {IM, EX},              // from items.json
        ports,                                       // from ports.json
    },
}
```

`state.masters` is rebuilt from `masters/*.json` on every boot via `loadExternalMasters()`. `state.quotations` + `currentIndex` + `company` are persisted to `localStorage` under key `sf_quotation_v1`.

### Render flow

```
boot()                           ← src/app.js
  └─ loadInitial()               ← src/data/masters.js
  └─ bindEvents()                ← src/events.js (one-time)
  └─ paintAll()                  ← src/ui/paint.js
       ├─ paintHeaderForm()      ← reads `[name]` inputs from current()
       ├─ paintBanner()
       ├─ paintFcl()             ← src/grids/fcl.js
       ├─ paintDetail(GRIDS.lcl) ← src/grids/detail.js
       ├─ paintDetail(GRIDS.shipping)
       ├─ paintDetail(GRIDS.transport)
       └─ paintNav() / paintTab() / paintApproveBtn() / applyReadOnly()
```

### Capture flow (form → state)

```
doSave()                         ← src/actions.js
  ├─ captureForm()               ← walks every [name] input
  ├─ captureAllGrids()           ← src/grids/detail.js (FCL + 3 detail tbodies)
  ├─ validate()                  ← src/validation.js
  ├─ persist()                   ← localStorage
  └─ paintBanner()
```

Live edits are also captured by the global `input` listener in `events.js` → `captureGridRow(tr)` for grid cells, `setDirty(true)` for header inputs.

---

## 🔌 Extension points

### Add a new master (e.g. ports → routes)

1. Create `masters/<name>.json` (server-side script that dumps your DB query).
2. Generate the JS wrapper for `file://` loading:
   ```bash
   { echo "window.SFQ_MASTERS_RAW = window.SFQ_MASTERS_RAW || {};"; \
     echo "window.SFQ_MASTERS_RAW.<name> ="; \
     cat masters/<name>.json; echo ";"; } > masters/<name>.js
   ```
3. Add `<script src="masters/<name>.js">` to `index.html`.
4. Wire it in `src/data/masters.js` → `loadExternalMasters()`:
   ```js
   if (raw.<name>) state.masters.<key> = raw.<name>.<arrayKey> || [];
   ```
5. (Optional) Add `lookup<X>(code)` and `select<X>(record)` in the same module.

### Add a new validation rule

Edit `src/validation.js` → `validate()`. Each error has shape:
- Header-field error: `{ field, loc, msg }`
- Grid-cell error: `{ gridKind, gridIdx, col, loc, msg }`

UI rendering (`applyErrors`) is fully data-driven; no UI code change needed.

### Add a new suggest dropdown

Pick the right primitive:

| Primitive | Use when | Example |
|---|---|---|
| `installSmartSuggest(input, opts)` | One header input with a sibling name input | CustNo / SaleNo |
| `installItemCellSuggest()` | Many cells in detail-style grids, all sharing the same dataset filter rule | ExpCode/ExpDesc1 across LCL/Shipping/Transport |
| `installPortCellSuggest()` | Many cells in one grid that map to different (name, code) pairs | FCL port-of-* + paired *Code |

Each takes a `source: () => array` callback, so the dropdown always sees the latest masters even before they finish loading.

### Add a new detail grid

The existing pattern is in `src/core/factories.js`:

```js
export const GRIDS = {
    lcl:       { kind: 'lcl',       arrayKey: 'localCharges',    tbodyId: 'lclTbody',       totalId: 'lclTotal',       /* … */ },
    shipping:  { kind: 'shipping',  arrayKey: 'shippingCharges', tbodyId: 'shippingTbody',  totalId: 'shippingTotal',  /* … */ },
    transport: { kind: 'transport', arrayKey: 'transportCharges',tbodyId: 'transportTbody', totalId: 'transportTotal', /* … */ },
};
```

To add a new grid:
1. Add a `<table>` block in `index.html` (matching `id`s).
2. Add an entry to `GRIDS`. `paintDetail`, `detailRowEl`, `captureGridRow`, `recalcDetailTotal` all become available for free.
3. Add the new key (e.g. `customsCharges: []`) to `blankQuotation()` in `factories.js` so new docs initialize correctly.
4. The detail.js empty-state renders automatically; validation in `validate()` already loops `Object.values(GRIDS)`.

---

## 📐 Conventions

- **Field naming**: PascalCase (`DocNo`, `CustNo`) matches DB columns 1:1. Backend can `INSERT … VALUES (?, ?)` straight from JSON keys.
- **DETID**: every detail row carries a `DETID` UUID-ish string (`lcl-…`, `shp-…`, `trp-…`, `fcl-…`). Used for diff sync at save time (insert/update/delete based on DETID presence).
- **Status pills**: `status-open` / `status-approved` / `status-deleted` (CSS in `style.css`).
- **localStorage key**: `sf_quotation_v1` — bump the version suffix when JSON shape changes in a breaking way.

---

## 🔗 References

- VB6 source form: `D:/DEV.AI/SMP.AI/frmSFQuotation.frm`
- Field mapping: [mapping.md](./mapping.md)
- Validation spec: [validation-spec.md](./validation-spec.md)
- DB schema: SQL Server `smfdb` — tables `AFQHEAD`, `SFQRATE`, `AFQDETAIL`, `SMBUSINESS`, `SMEMPL`, `OPItem`, `OPPort`
