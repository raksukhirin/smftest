# Outbound Billing Entry — `frmARInvoice`

Mockup ของหน้า **A/R Billing (Outbound Billing Entry)** port มาจาก VB6 `frmARInvoice.frm`.

- **frm ต้นฉบับ**: `D:/DEV.AI/SMP.AI/frmARInvoice.frm` (~20,100 บรรทัด)
- **บริบท mockup นี้**: `SRCTYPE='AR'`, `SUB_SYSNAME='SF'`, `JOBCLASS='EX'` (Sea Freight Export billing)
- **Theme accent**: 🌹 Rose (`bg-rose-600` / `text-rose-700`)
- **localStorage key**: `arinv_v1`

> ⚠️ ฟอร์มจริงเป็น "ตัวเดียวทำได้หลายอย่าง" — instantiate ใช้ทั้ง **A/R (Outbound)** และ **A/P (Inbound)** แยกด้วย `SRCTYPE`, รองรับ SF/AF/CS/TS/CR และ DocType IN/CN/DN/AI/FI.
> mockup รองรับทั้ง **A/R และ A/P** แบบ mode-aware — UI สลับ title / logo / label (Customer↔Vendor) ตาม `SrcType` ของเอกสารปัจจุบัน.

### โหมด A/R vs A/P (mode-aware)

| | A/R (SrcType=AR) | A/P (SrcType=AP) |
|---|---|---|
| Title | Outbound Billing Entry | Inbound Billing Entry |
| Logo / สี | AR · rose | AP · indigo |
| คู่ค้า | **Customer** | **Vendor** |
| เลขเอกสาร | `INSE…`/`CNSE…`/… | `VISE…`/`VASE…` |

### Deep-link (เปิดจาก frmSFJob_EX)

เปิดด้วย `index.html?inv=<InvNo>` จะเด้งไปเอกสารนั้นทันที + ปรับโหมด A/R/A/P อัตโนมัติ.
หน้า **frmSFJob_EX → Pg.5 Billing & Voucher** คลิกเลขที่ A/R (billing) หรือ A/P (voucher) มาเปิดที่นี่ได้.

### Seed data (จริงจาก `smfdb`)

`data.json` เก็บเอกสารจริง **40 ใบ** = **16 A/R** + **24 A/P voucher** ดึงจาก `ARINVHEAD`/`ARINVDETAIL`/`ARINVREM` (`SUB_SYSNAME='SF'`). A/P vouchers คือใบที่ผูกกับ job เดียวกับใน frmSFJob_EX (vendor billing). ส่วน A/R แยกตาม DocType ประเภทละ 4 ใบ:

| DocType | ตัวอย่าง InvNo | สกุล | จุดเด่นที่ใช้ทดสอบ |
|---|---|---|---|
| **IN** Invoice | INSE25090001 · INSE25100001 · INSE25120002/3 | THB | หลายบรรทัด, VAT 7% |
| **DN** Debit Note | ODNSE24100001 · ODNSE25030001 · ODNSE25100001 · ODNSE25120001 | USD | multi-currency (×32/37), บรรทัด VAT-included |
| **CN** Credit Note | CNSE19090002 · CNSE20120001 · CNSE21110001/2 | THB | ยอด **ติดลบ** (DocBal −1) |
| **AI** Advance Invoice | AISE19070001 · AISE25120001 · AISI24100001 · AISI25080001 | THB | บรรทัด ItemType=`ADV` → คอลัมน์ ADVANCE |

ค่า GROSS/VAT/TOTAL (Currency + THB) คำนวณใหม่ตอน render และตรงกับ `SRCAMT`/`SRCVAT`/`SRCTOT` ใน DB ทุกใบ.
กด **↺ (Reset to seed)** เพื่อโหลดชุดนี้กลับมาหลังทดลองแก้.

---

## รัน

Double-click `index.html` เปิดใน browser ได้ทันที (ไม่ต้อง build / backend) — seed โหลดจาก `data.js` (`window.ARINV_SEED`) จึงทำงานบน `file://` ได้เลย.

> 🔁 **แก้ข้อมูล seed**: แก้ `data.json` แล้ว regenerate `data.js`:
> ```bash
> cd mockup/frmARInvoice
> node -e "const d=require('fs').readFileSync('data.json','utf8');require('fs').writeFileSync('data.js','window.ARINV_SEED =\n'+d+';\n')"
> ```

ถ้าจะรันผ่าน HTTP server (script.js จะ fallback ไป `fetch('data.json')` เองถ้าไม่มี `window.ARINV_SEED`):

```bash
cd D:/DEV.AI/SMP.AI/mockup
python -m http.server 8080
# เปิด http://localhost:8080/frmARInvoice/index.html
```

---

## โครงสร้างหน้า (จาก screenshot จริง)

| ส่วน | ที่มาใน frm |
|---|---|
| **Banner** — Book No / Doc No + status pill + posting pill + customer | header controls |
| **Page rail Pg.1–Pg.5** | TabStrip2 (ปุ่ม Pg แนวตั้งซ้ายมือใน VB6) |
| Pg.1 **General** + sub-tabs (General / Other option / Tax invoice / Withholding tax) | TabStrip1 |
| Pg.2 **Invoice address** & tax payer | Frame Index 1 |
| Pg.3 **Descriptions** (Descrip 1–3) | Frame Index 2 + grdDesc1 |
| Pg.4 **Sales / agent** | Frame Index 1 (sale person / ADV to agent) |
| Pg.5 **Attachments** | Frame Index 4 (FTP/HTTP upload — placeholder) |
| **Line items grid** (always visible) | grdDetail (VSFlexGrid) |
| **Totals matrix 2×4** (Currency / THB × Advance / Gross / Vat / Total) | totals labels |
| **Footer** — Confirm · Approve · Post G/L · Update Sub-Transactions · Cancel · Print · Save · Close | command buttons |

---

## สิ่งที่ทำงานได้จริงใน mockup

- ✅ CRUD line items (เพิ่ม/ลบ/แก้) + คำนวณ **VAT 7% และแปลง THB** ตาม `ExcRate` แบบ live
- ✅ **Totals matrix** อัปเดตอัตโนมัติ (Gross / Vat / Total, แยก Currency vs THB, แยก Advance)
- ✅ **Status workflow**: Confirm ↔ UnConfirm · Approve ↔ UnApprove · Post G/L ↔ UnPost · Cancel
- ✅ **Read-only** อัตโนมัติเมื่อ Approved / Posted / Canceled (banner + lock fields)
- ✅ **Doc numbering** ต่อ DocType (`INSE1706xxxx`) + Entry No auto
- ✅ **Customer lookup** (modal + พิมพ์ code แล้ว auto-fill ชื่อ/ที่อยู่/term)
- ✅ **Validation** port จาก `ChkValidHead` (Doc No, Customer, Currency, ExcRate=1 สำหรับ THB, ≥1 line, CN ต้องติดลบ) → error modal
- ✅ persistence (`localStorage`), navigation (first/prev/next/last + Ctrl+←/→), search, reset to seed

## ยังไม่ทำ (backend only)

- Print (Crystal report), Export to interface, FTP/HTTP attachment upload
- G/L posting จริง (GLHEAD/GLDETAIL/GLTAX), Update Sub-Transactions (OPTransDetail)
- Ref. job charges (ดึงจาก OPTransDetail), Batch/ARINVBAT totals, fiscal period lock check

---

## ไฟล์

```
frmARInvoice/
├── index.html     UI หลัก (Tailwind CDN)
├── style.css      Rose accent + page-tab / sub-tab / totals-matrix
├── script.js      state + CRUD + VAT/THB calc + workflow + validation (IIFE, file:// safe)
├── data.json      seed 16 ใบจริงจาก smfdb (IN/DN/CN/AI ประเภทละ 4) + masters
├── data.js        = data.json ห่อด้วย window.ARINV_SEED (ให้เปิดผ่าน file:// ได้)
├── mapping.md     UI ↔ ARINVHEAD / ARINVDETAIL / ARINVREM (verify กับ smfdb แล้ว)
└── README.md
```

อ้างอิง field mapping เต็ม → [`mapping.md`](./mapping.md).
