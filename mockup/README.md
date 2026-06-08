# SMP Mockups

UI mockups + data-mapping specs สำหรับการ port ฟอร์ม VB6 ของระบบ **SmartPro / SMF (Sea & Air Freight Management)** ไปเป็น web application สมัยใหม่.

แต่ละ mockup เป็น **standalone static site** (HTML + CSS + Vanilla JS + JSON) — เปิดด้วย browser ได้ทันทีไม่ต้อง build, ไม่ต้อง backend, ใช้ `localStorage` เป็น data store เพื่อทดลอง CRUD จริง.

วัตถุประสงค์:
1. เป็น **single source of truth** ของหน้าตา UI ที่จะใช้จริง — ก่อน hand-off ให้ frontend ทีม implement ใน framework จริง (Inertia/React/Vue)
2. เก็บ **field mapping** จาก VB6 frm → DB tables → JSON shape — ให้ backend ทีมรู้ว่าต้อง save อะไรลง column ไหน
3. เก็บ **validation spec** ที่ port มาจาก `Sub ChkValidate` ของแต่ละ frm — ให้ทุกทีมเห็นกฎเดียวกัน

---

## 📂 Modules

| Module | สถานะ | คำอธิบาย | Theme |
|---|---|---|---|
| [`frmSFJob_IM/`](./frmSFJob_IM/) | ✅ Complete | Inbound Master Reference (SF Job — Import) | 🟢 Emerald |
| [`frmSFQuotation/`](./frmSFQuotation/) | ✅ Complete | Sea Freight Quotation (Import + Export) — มี validation, lookup, print preview | 🟣 Violet |
| [`_template/`](./_template/) | 📋 Starter | Skeleton สำหรับ copy ไปสร้าง module ใหม่ | 🔵 Indigo |

> เพิ่ม module ใหม่ → ดู [**CONTRIBUTING.md**](./CONTRIBUTING.md)

---

## 🚀 รัน mockup

ไม่ต้อง build, ไม่ต้องลง dependencies — **double-click `index.html`** ของ module ใด ๆ ใน browser ก็ใช้ได้ทันที.

ถ้าจะรันผ่าน HTTP server (จำเป็นเฉพาะกรณีบาง browser block `fetch('data.json')` ผ่าน `file://`):

```bash
# Python
cd D:/DEV.AI/SMP.AI/mockup
python -m http.server 8080

# Node
npx http-server . -p 8080

# PHP
php -S localhost:8080
```

แล้วเปิด <http://localhost:8080/frmSFQuotation/index.html>

---

## 🧱 องค์ประกอบของแต่ละ module

ทุก module ต้องมีไฟล์เหล่านี้ขั้นต่ำ:

```
<moduleName>/
├── README.md           ← อธิบาย module (ที่มา, frm ต้นฉบับ, fields หลัก)
├── index.html          ← UI หลัก
├── style.css           ← Tailwind CDN + custom utilities (theme accent)
├── script.js           ← state mgmt + CRUD + persistence + validation
├── data.json           ← seed data + masters (สำหรับ lookups)
└── mapping.md          ← UI field ↔ DB table.column mapping (จาก frm)
```

Optional (เพิ่มเมื่อจำเป็น):

```
<moduleName>/
├── validation-spec.md  ← port จาก Sub ChkValidate ของ frm (ถ้ามี)
├── print.html          ← print preview (ถ้าต้อง print เอกสาร)
├── print.css
└── print.js
```

---

## 🎨 Conventions

### Theme accent

แต่ละ module เลือกสีหลักไม่ให้ซ้ำกัน เพื่อแยกได้ทันทีใน browser tabs:

| Module | Accent | Tailwind class |
|---|---|---|
| Outbound (EX) | Indigo | `bg-indigo-600` / `text-indigo-700` |
| Inbound (IM) | Emerald | `bg-emerald-600` / `text-emerald-700` |
| Quotation | Violet | `bg-violet-600` / `text-violet-700` |
| HBL (TBD) | Sky | `bg-sky-600` |
| Booking (TBD) | Amber | `bg-amber-600` |

### localStorage keys

ใช้ pattern `<module_snake_case>_v<schema_version>`:

```
sfjob_im_v1
sf_quotation_v1
```

**Bump version** เมื่อแก้ JSON shape แบบ breaking — เพื่อไม่ให้ data เก่าจาก localStorage ทำให้ UI พัง.

### Status pills

ใช้ class set เดียวกันทั่วทุก module (`status-open` / `status-approved` / `status-close` / `status-complete` / `status-deleted` / `status-rejected`).

### Data shape

- ใช้ **PascalCase** keys ที่ตรงกับ column ใน DB (e.g. `DocNo`, `JobNo`, `CustNo`) — backend จะได้ map กลับไปได้ตรง ๆ
- Detail rows ทุก row ต้องมี `DETID` (uuid string) เพื่อให้ diff sync (insert/update/delete) ทำงานได้
- ใส่ `_isNew: true` flag บน record ที่ยังไม่เคย save — ใช้สำหรับ logic `Delete` ที่จะลบทิ้งจริง vs. soft-delete

### Field mapping doc (`mapping.md`)

เป็น **mandatory** สำหรับทุก module. ต้องระบุ:
- Table หลัก + Detail tables ที่เกี่ยวข้อง
- ทุก UI field map ไป column ไหน
- Quirks (label vs column mismatch — เช่น `frmSFJob` "Closing Date" จริง ๆ คือ column `LOADDATE`)
- Save flow (transaction, optimistic lock token)

ดู [`frmSFQuotation/mapping.md`](./frmSFQuotation/mapping.md) เป็นตัวอย่าง.

---

## 📐 Tech Stack

- **Tailwind CSS** via CDN (`<script src="https://cdn.tailwindcss.com">`) — ไม่ต้อง build
- **Vanilla JS** — ใช้ `localStorage` + `fetch('data.json')` + DOM API ปกติ
- **Inter** font จาก Google Fonts
- **No backend** — เก็บ state ใน browser

> Hand-off ไป production ค่อยใช้ Inertia + React/Vue ใน folder `laravel-smp/` (refer to [outbound port docs](../laravel-smp/docs/outbound-ui-mapping.md)).

---

## 🔗 Cross-references

- VB6 source forms: `D:/DEV.AI/SMP.AI/frmXXX.frm` (ไม่ commit ใน repo นี้ — เป็น read-only reference)
- Backend port (Laravel + Inertia + React): `D:/DEV.AI/SMP.AI/laravel-smp/`
- DB schema (live): MS SQL Server `smfdb` — query ได้ผ่าน `mcp__smfdb__execute-readonly-sql`

---

## 📝 License

Internal use only — H.I.T. Intercon Co., Ltd.
