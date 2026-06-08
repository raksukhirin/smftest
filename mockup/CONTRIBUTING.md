# Adding a new mockup module

แนวทางการเพิ่ม mockup สำหรับฟอร์ม VB6 ใหม่ (เช่น `frmHBL`, `frmBooking`, `frmInvoice`, ฯลฯ).

---

## TL;DR — Quick start

```bash
# 1. Copy template
cp -r mockup/_template mockup/frmYourForm

# 2. ตั้งชื่อ + theme + storage key
#    - แก้ <title>, banner, theme color ใน index.html + style.css
#    - แก้ STORAGE_KEY ใน script.js

# 3. กรอก field schema
#    - data.json:    state shape + sample rows + masters
#    - mapping.md:   UI ↔ DB columns
#    - script.js:    blank* factories, paint/capture, validation

# 4. ทดสอบ — เปิด index.html ใน browser
#    - กด + New / Save / Delete / Approve  (ทุกปุ่มต้องทำงาน)
#    - กด Reset (↺) เพื่อ re-seed จาก data.json
```

---

## 1. ก่อนเริ่ม — เก็บข้อมูลจาก VB6 frm

ก่อนเริ่ม code ต้องอ่าน frm ต้นฉบับเพื่อ extract:

| สิ่งที่ต้องรู้ | หาที่ไหนใน frm |
|---|---|
| **Field list** | `Sub UpdateData(rstUpdate)` — ดู `.Fields("XXX") = cTxt(YYY)` แต่ละบรรทัด |
| **Detail tables** | `Sub UpdateDataHBL`, `Sub UpdateDetailCont`, `Sub UpdateDetailBillPay` |
| **Validation rules** | `Sub ChkValidate` + `Sub ChkValidDetailCell` |
| **Save orchestration** | `Sub SaveData` — ลำดับ insert/update + lock check + cascade tables |
| **Approve/Delete flow** | `Sub cmdApp_Click`, `Sub cmdDelete_Click` |
| **Doc number generation** | search `SFOption` table, `SFQNUM`/`SFQRUN` fields |
| **Status values** | `DOCSTAT` / `JOBSTAT` ใน UPDATE statements (Open/Approved/...) |
| **IM/EX behaviour** | `mstrJobClass = "IM"` vs `"EX"` branches |

จดบันทึกลง `mapping.md` + `validation-spec.md` ของ module — **ต้องเขียนก่อน** code ไม่ใช่ทีหลัง.

---

## 2. โครงสร้างไฟล์ที่ต้องมี

```
frmYourForm/
├── README.md           ← อธิบาย business purpose + link ไป VB6 frm + screenshots
├── index.html          ← UI structure (ตาม template)
├── style.css           ← theme accent + utilities
├── script.js           ← logic ทั้งหมด (state + CRUD + validation)
├── data.json           ← seed data + masters
├── mapping.md          ← Required — UI ↔ DB columns
└── validation-spec.md  ← Required ถ้า frm มี Sub ChkValidate
```

Optional:
```
├── print.html          ← Required ถ้าต้อง print PDF / รายงาน
├── print.css
├── print.js
└── screenshots/        ← Optional — capture จาก VB6 form ต้นฉบับ
    ├── frm-original.png
    └── new-mockup.png
```

---

## 3. ส่วนประกอบของ `index.html`

ต้องมี element id เหล่านี้ (`script.js` ใช้ทุกตัว):

### Top bar
```html
<header>
  <input id="searchInput">                  <!-- search docs -->
  <div id="searchDropdown"></div>           <!-- autocomplete -->
  <button id="navFirst">«</button>          <!-- nav between docs -->
  <button id="navPrev">‹</button>
  <span id="navCounter">1 / 1</span>
  <button id="navNext">›</button>
  <button id="navLast">»</button>
  <button id="newBtn">+ New</button>        <!-- create new doc -->
  <button id="resetSeedBtn">↺</button>      <!-- reset to data.json -->
  <button id="saveBtn">Save</button>
</header>
```

### Banner (status + key fields)
```html
<section class="banner">
  <span id="bannerDocNo">—</span>           <!-- or bannerJobNo -->
  <span id="statusPill">● Open</span>
  <span id="dirtyFlag" class="hidden">● Unsaved</span>
  <span id="lastModified">—</span>
</section>
```

### Form fields
ทุก input ต้องมี `name="<KeyInDataJson>"` ให้ตรงกับ key ใน data.json:
```html
<input name="DocNo">
<input name="DocDate" type="date">
<select name="DocStat">…</select>
```

### Detail grids
```html
<table id="<kind>Table">
  <tbody id="<kind>Tbody"></tbody>          <!-- รับ rows จาก script.js -->
</table>
<button id="add<Kind>Btn">+ Add Row</button>
<button id="clear<Kind>Btn">Clear All</button>
```

แต่ละ row render โดย script.js ใส่ `data-idx`, `data-detid`, `data-kind` + cells `data-col="<KeyInRow>"`.

### Sticky bottom action bar
```html
<footer>
  <button id="deleteBtn">🗑 Delete</button>
  <button id="approveBtn">✓ Approve</button>     <!-- ถ้า module มี approve -->
  <button id="saveBtn2">💾 Save</button>
</footer>
```

### Toast + dialog (mandatory infra)
```html
<div id="toast" class="hidden"><div><span id="toastIcon">✓</span><span id="toastMsg"></span></div></div>

<div id="dialog" class="hidden">
  <h3 id="dlgTitle"></h3>
  <p id="dlgMsg"></p>
  <button id="dlgCancel">Cancel</button>
  <button id="dlgConfirm">OK</button>
</div>
```

### Error summary modal (ถ้ามี validation)
```html
<div id="errorModal" class="hidden">
  <span id="errCount">0</span>
  <ul id="errorList"></ul>
  <button id="errOk">OK</button>
</div>
```

### Read-only banner (ถ้ามี read-only mode)
```html
<div id="readonlyBanner" class="readonly-banner">🔒 <span id="readonlyText"></span></div>
```

---

## 4. ส่วนประกอบของ `style.css`

ต้องมี class set เหล่านี้:

```css
/* Buttons */
.btn-primary, .btn-secondary, .btn-ghost, .btn-danger { ... }

/* Form */
.input, .label, .field, .field-with-lookup, .lookup-row, .lookup-code, .lookup-btn, .lookup-name { ... }

/* Card */
.card, .card-head, .card-title { ... }

/* Status pills */
.status-pill, .status-open, .status-approved, .status-close, .status-complete, .status-deleted, .status-rejected { ... }

/* Tabs (ถ้ามี) */
.tab, .tab.is-active, .tab-num { ... }

/* Grid cells */
.cell-input, .row-del { ... }

/* Validation states */
.input.is-error, .field-error, .cell-error { ... }

/* Read-only */
body.is-readonly .input { pointer-events: none; opacity: .65; }
.readonly-banner, .readonly-banner.is-approved, .readonly-banner.is-deleted { ... }

/* Error modal */
.error-modal-list, .error-modal-list li, .err-loc { ... }
```

ดู `frmSFQuotation/style.css` หรือ `_template/style.css` เป็นตัวอย่าง — copy แล้วเปลี่ยน accent color เท่านั้น.

---

## 5. ส่วนประกอบของ `script.js`

โครงสร้างหลัก (IIFE wrapper):

```js
(() => {
    const STORAGE_KEY = 'your_module_v1';

    // ===== State =====
    let state = { docs: [], currentIndex: 0, masters: null };
    let dirty = false;
    let suppressDirty = false;

    // ===== Bilingual messages =====
    const MSG = {
        fieldXBlank: { th: 'ห้ามว่าง', en: 'Cannot be blank' },
        // …
    };
    function msg(key) { /* return MSG[key][locale] */ }

    // ===== Boot =====
    boot();
    async function boot() {
        await loadInitial();
        bindEvents();
        paintAll();
    }

    // ===== Persistence (load/seed/save) =====
    async function loadInitial() { /* localStorage → state, fallback fetch data.json */ }
    async function seedFromJson() { /* fetch + parse */ }
    function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

    // ===== Factories =====
    function blankDoc() { /* return new record with default values */ }
    function blankDetailRow() { /* return new grid row with DETID */ }

    // ===== Render =====
    function paintAll() { /* paintBanner + paintHeaderForm + paintGrids + paintNav + applyReadOnly */ }
    function paintHeaderForm() { /* loop $$('[name]') → set value from current() */ }
    function paintBanner() { /* status pill, dates, dirty flag */ }
    function paintGrid() { /* render <tr> for each row, with data-idx/data-col */ }

    // ===== Capture (DOM → state) =====
    function captureForm() { /* loop $$('[name]') → write into current() */ }
    function captureGridRow(tr) { /* read data-col cells back into row */ }

    // ===== Lookups (ถ้ามี master data) =====
    function lookupCustomer(code) { /* search state.masters.customers */ }
    function applyCustomerSideEffects(record) { /* auto-fill fields */ }

    // ===== Validation =====
    function validate() {
        const errors = [];
        // Port from Sub ChkValidate
        if (!current().DocNo) errors.push({ field: 'DocNo', msg: msg('docNoBlank') });
        // …
        return errors;
    }
    function applyErrors(errors) { /* mark .is-error + show modal */ }

    // ===== Read-only =====
    function applyReadOnly() {
        document.body.classList.toggle('is-readonly', isLocked());
    }

    // ===== Actions =====
    function doSave() { /* validate → captureForm → persist */ }
    async function doDelete() { /* confirm → DocStat='Deleted' */ }
    async function doApprove() { /* toggle DocStat */ }
    async function doNew() { /* push blankDoc, switch to it */ }

    // ===== Bind =====
    function bindEvents() {
        document.addEventListener('input', onInput);  // dirty tracking
        $('#saveBtn').addEventListener('click', doSave);
        $('#deleteBtn').addEventListener('click', doDelete);
        // …
    }
})();
```

**Patterns สำคัญ:**

1. **`captureForm` ก่อน `persist`** — DOM เป็น source of truth ระหว่าง user พิมพ์, แต่ state เป็น source of truth ตอน save
2. **`suppressDirty = true` ตอน `paintHeaderForm`** — กัน input listener ตั้ง dirty flag ตอน programmatic populate
3. **Optimistic lock** — เก็บ `lock: Date.now()` ใน record; เช็คก่อน save ว่า DB.lock = state.lock มั้ย
4. **Re-index `SeqNo`** ก่อน save — `q.detail.forEach((r, i) => { r.SeqNo = i + 1; })`
5. **Soft delete** — `DocStat = 'Deleted'` ไม่ลบ record จริง (ยกเว้น `_isNew` ที่ยังไม่เคย save)

---

## 6. ส่วนประกอบของ `data.json`

```json
{
    "_note": "อธิบาย shape สั้น ๆ + reference ไป frm + tables",

    "company": {
        "Name": "...",  "Address": "...", ...
    },

    "masters": {
        "salesPeople":  [{ "SaleNo": "...", "SaleName": "..." }, ...],
        "approvers":    [{ "AppByNo": "...", "AppByName": "..." }],
        "customers":    [{ "CustNo": "...", "CustName": "...", "Address": "...", "Tel": "...", "Email": "...", "CrTerm": 30 }],
        "agents":       [{ "AgentNo": "...", "AgentName": "...", "Address": "..." }]
    },

    "docs": [
        { "DocNo": "...", "DocStat": "Open", ..., "details": [...] }
    ]
}
```

**Sample size:** อย่างน้อย **3 ตัวอย่าง** ที่ครอบคลุม: 1 Open, 1 Approved (read-only), 1 edge case (Rejected/Close/Deleted, IM vs EX, ฯลฯ).

**Master data:** ต้องมีพอให้ lookup ที่ใช้ใน sample docs สำเร็จ — กดปุ่ม lookup (`⌘`) แล้วต้องเจอจริงทุก code ใน sample.

---

## 7. ส่วนประกอบของ `mapping.md`

โครงสร้างมาตรฐาน:

```markdown
# <ModuleName> — UI ↔ DB Field Mapping

อ้างอิง: `frmXXX.frm`
- `Sub UpdateData` — line NNN-NNN
- `Sub UpdateDataHBL` — line NNN-NNN

Save 1 ครั้งเขียน X ตาราง: `TableA` (header) + `TableB` (detail) + ...

## 1. Banner
| UI | JSON key | TableA column | Notes |
| --- | --- | --- | --- |
| Doc Number | `DocNo` | `DOCNO` (PK) | format `XXX...` |
| Date | `DocDate` | `DOCDATE` | |
| Status | `DocStat` | `DOCSTAT` | Open/Approved/... |

## 2. <Section>
...

## N. Save flow
```
BEGIN TRAN
  UPSERT TableA WHERE DocNo=?
  DELETE TableB rows not in request
  UPSERT TableB rows
COMMIT
```

## Quirks ⚠
- Label "Closing Date" ใน UI = column `LOADDATE` (frm caption rename)
- ...
```

---

## 8. `validation-spec.md` (เมื่อ frm มี `Sub ChkValidate`)

โครงสร้าง:

```markdown
# <Module> — Validation Spec

อ้างอิง: `Sub ChkValidate` (line NNN), `Sub ChkValidDetailCell` (line NNN), `Sub SaveData` (line NNN)

## 1. กฎจาก ChkValidate
### 1.1 FIELD_X
| เงื่อนไข | ผลลัพธ์ |
| --- | --- |
| value = "" + !blnAllowBlank | ❌ "Field X cannot be blank" |
| value <> "" | lookup → set FIELD_X_NAME |

### 1.2 ...

## 2. กฎจาก ChkValidDetailCell
| Grid Index | Column | กฎ | Error |
| --- | --- | --- | --- |
| 0 | colExpDesc | ห้ามว่าง | "Description cannot be blank" |

## 3. กฎจาก SaveData
- Optimistic lock
- ...

## 4. Mapping → UI ใหม่
| Field | Required? | กฎ |

## 5. Error messages (bilingual)

## 6. Open questions / กฎที่อาจอยากเพิ่ม
- ...
```

---

## 9. Conventions (recap)

- **Theme accent:** เลือกสีไม่ซ้ำกับ module อื่น (ดู [README.md](./README.md) ตาราง)
- **localStorage key:** `<module_snake_case>_v1` (bump เมื่อ shape break)
- **PascalCase keys** ใน data.json + `name=` attributes (ตรงกับ DB columns)
- **DETID** ทุก detail row (uuid string, ใช้ `'<prefix>-' + Math.random().toString(36).slice(2,10)`)
- **Status pills:** ใช้ class `.status-<lowercase>`
- **Bilingual messages:** ใช้ pattern `{ th: '...', en: '...' }` ใน `MSG` object
- **อย่า hardcode** doc numbers — ใช้ generator pattern เดียวกับ `blankDoc()`

---

## 10. Smoke test — ก่อน commit

ตรวจ checklist ทุกข้อก่อน push:

- [ ] เปิด `index.html` ใน browser ตรง ๆ ได้ (ไม่ error ใน console)
- [ ] กด **+ New** → สร้าง record ใหม่ได้
- [ ] กรอก field + กด **Save** → toast "Saved" + dirty flag หาย
- [ ] รีเฟรชหน้า → ข้อมูลที่ save ยังอยู่ (จาก localStorage)
- [ ] กด **« ‹ › »** หรือ **Ctrl+←/→** → ย้ายระหว่าง records
- [ ] กด **🗑 Delete** → confirm → DocStat = 'Deleted'
- [ ] ถ้ามี Approve: กด **✓ Approve** → DocStat = 'Approved' + form อ่าน-only
- [ ] กด **↺ Reset** → ยืนยัน → กลับมาเหมือนเปิดครั้งแรก
- [ ] **Search** หา doc no / customer name → dropdown แสดงผล
- [ ] กรอก lookup code (`SaleNo`/`CustNo`/...) + กด `⌘` → auto-populate name + side-effects
- [ ] ทดสอบ validation: เว้น required field + กด Save → error modal โผล่
- [ ] (ถ้ามี print) กด **🖨 Print** → หน้า print preview render ถูก

---

## 11. ตัวอย่าง — ดูโค้ดจริง

| Module | จุดเด่นที่ลอกได้ |
|---|---|
| [`frmSFJob_IM/`](./frmSFJob_IM/) | IM-specific routing logic (3-node), bilingual mapping |
| [`frmSFQuotation/`](./frmSFQuotation/) | **Most complete** — มี validation, lookup, read-only, print preview, error modal, IM/EX toggle |
| [`_template/`](./_template/) | Skeleton เปล่า — copy ไปเริ่มต้น |
