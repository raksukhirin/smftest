# Sea Freight Rate Control — `frmSFSeaRate`

Modern web UI mockup for the legacy VB6 form `frmSFSeaRate.frm`. Vanilla ES modules, no build step, no backend — open `index.html` through any HTTP server and start clicking.

> **Status**: Reference implementation for the React/Inertia port. UI mirrors the original form's two states (master-only / master + detail edit).

---

## 🚀 Run locally

Required: any HTTP server (ES modules ไม่ทำงานผ่าน `file://`).

```bash
# Python (built-in)
cd D:/DEV.AI/SMP.AI/mockup
python -m http.server 8765

# Node
npx http-server . -p 8765
```

เปิด http://localhost:8765/frmSFSeaRate/

> หากต้องเปิดผ่าน `file://` ให้ลบ `<script type="module">` ใน `index.html` แล้วใช้ `data.js` + รวม src ไฟล์เป็น script เดียวเอง — แนะนำให้รัน server แทน ใช้งานสะดวกกว่ามาก

---

## 📂 File layout

```
frmSFSeaRate/
├── index.html              ← UI shell (loads src/app.js as ES module)
├── style.css               ← Tailwind CDN + custom utility classes
├── data.json               ← seed rates + masters (canonical source)
├── data.js                 ← window.SEED_DATA wrap of data.json (file:// fallback, optional)
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

## 🧩 Module dependency graph

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

- **utils.js** has no deps (pure helpers).
- **state.js / ui.js** depend only on `utils`.
- **master-grid.js → sub-rate.js** (re-render cost grid on row select).
- **detail.js → master-grid.js** (call `selectRate` when opening pane).
  - Avoided the reverse via `setHandlers({ onDblClick, onSelect })` injected from `app.js`.
- **crud.js** depends on most things (it orchestrates Save/Copy/Delete flows).
- **app.js** at the top — registers all cross-module callbacks before any UI event fires.

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

### Hook to a real backend

Replace `state.persist()` (localStorage write) and the `state.data.rates` mutations in `crud.js` with `fetch('/api/rates', { method: 'POST', ... })` calls. The rest of the UI doesn't care where the data lives.

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
