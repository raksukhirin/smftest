# frmFPIBookingGate — Booking Margin Gate

หน้าจอที่ 3 จาก 6 ของ **FPI (Freight Pricing Intelligence)** — ดู [`../CLAUDE.md`](../CLAUDE.md)
อ้างอิงหลัก: [`../FPI_Design_v0.3_Freeze_Candidate.md`](../FPI_Design_v0.3_Freeze_Candidate.md) §6 (Margin Gate) · DDL: [`../FPI_DDL_v1.0.sql`](../FPI_DDL_v1.0.sql)

> **จุดเคาะ Margin จริง (D1)** — ต่างจากหน้า [Quotation Generator](../frmFPIQuoteGen/) ที่แสดง Margin *ประมาณการ*
> ที่นี่คือจุดที่ระบบตัดสิน **PASS / NEED_APPROVE / BLOCKED** ตอน Confirm Booking

| | |
|---|---|
| Theme accent | 🟠 Amber (`bg-amber-600`) |
| Namespace | `window.BG` (IIFE ต่อไฟล์ — รันจาก `file://` ได้) |
| Data | `../data/*.json` เมื่อเสิร์ฟผ่าน http · fallback `data.js` (embedded) |
| Persistence | `localStorage['fpi_booking_gate_v1']` — เก็บผล workflow (Confirm/Approve) ต่อ booking |

---

## รัน

```bash
cd D:/DEV.AI/SMP.AI/mockup/FPI
python -m http.server 8759
# → http://localhost:8759/frmFPIBookingGate/index.html
```

หรือ double-click `index.html` (fallback ไป `data.js`)

---

## 3 Booking ในชุดข้อมูล (`../data/bookings.json`) — คือ 3 ผลลัพธ์ของ Gate

| DocNo | ผล | เรื่อง |
|---|---|---|
| `BSE26070010` | **PASS** | จองครั้งที่ 1 · R-0001 ยัง Active · Margin 10.09% ≥ 8% (Tier B) |
| `BSE26090004` | **NEED_APPROVE** | จองครั้งที่ 4 (ก.ย.) · R-0001 ถูกแทนที่ → เดิน Chain ไป R-0003 · ทุน +9,125 · Margin ตกเหลือ 3.99% |
| `BSE26070015` | **BLOCKED** | บรรทัด Cost สกุล USD ที่ `ItemRate = 0` (BadFx) — ระบบเดิมเงินหายเงียบ |

`BSE26090004` คือเคสสำคัญที่สุดของระบบ (CLAUDE.md) — หน้าจอต้องทำให้ Manager เห็นว่า
**Margin ตกเพราะตลาดขึ้น ไม่ใช่ Sales ตั้งราคาต่ำ**

---

## สูตร (port ตรงจาก DDL — `src/profit.js`)

### `vFPI_BookProfit` §6.1 — FX ต่อบรรทัด

```
THB                      → 1
foreign & ItemRate = 1   → DocRate     (บรรทัดรับเรทจากหัวเอกสาร)
foreign & ItemRate > 0   → ItemRate
foreign & ItemRate = 0   → BadFx  (FX = 0 → บรรทัด "เงินหาย")

SRCAMT = Qty × UnitPrice
Sold = Σ Bill × FX | Cost = Σ Cost × FX (รวม Rebate) | KB = Σ Cost × FX เฉพาะ IsRebate
```

### `FPI_EvaluateBookingMargin` §6.2 — verdict

```
BLOCKED       : ไม่มีบรรทัด (เว้น FailOpen) | BadFxLines > 0
Margin        = Sold − Cost + KB
Margin%       = Margin × 100 / (Sold + KB)
PASS          : Margin% ≥ MinMarginPct และ Margin ≥ MinProfitTHB
PASS(Tol)     : เคยอนุมัติแล้ว และ (Margin%ปัจจุบัน − Margin%ที่อนุมัติ) > −TolerancePP
NEED_APPROVE  : นอกจากนั้น → DOCSTAT = 'Wait' → Approve Profit → Approve Credit
```

**Golden check** (`src/profit.js` reproduce `bookings.json` ครบ 3 ใบ):

| DocNo | Sold | Cost | Margin | % | verdict |
|---|---|---|---|---|---|
| BSE26070010 | 149,674.40 | 134,570.00 | 15,104.40 | 10.09% | PASS |
| BSE26090004 | 149,674.40 | 143,695.00 | 5,979.40 | 3.99% | NEED_APPROVE |
| BSE26070015 | — | — | — | — | BLOCKED (BadFx 1) |

---

## Cost Auto-fill + Delta Alert (`src/autofill.js` · §4.3 / D8)

แต่ละบรรทัด Cost มี `bookingRateRef` ที่บันทึกไว้ **ณ วันจอง**:
- `rateChargeId` / `tariffId` — ที่มาต้นทุน
- `supersededChain` — ถ้า Rate ที่เสนอถูกแทนที่ ระบบเดิน Chain (§4.3) ไปตัวที่ Valid ณ วันจอง
- `quoteDeltaTHB` — ส่วนต่างทุนจากวันเสนอราคา

Panel แสดง **ทุนวันเสนอ → ทุนวันจอง → Δ** ต่อบรรทัด และเตือนเมื่อรวม `≥ 3%` หรือ `≥ 2,000 THB` (D8)

> **⚠ จุดสำคัญด้านการออกแบบ:** ไม่ re-walk `SupersededBy` แบบสด — `status` เป็นค่าปัจจุบัน
> (R-0001 ตอนนี้ = SUPERSEDED) แต่ ณ วันที่จอง 10 ก.ค. มันยัง CONFIRMED. การ walk สดจะ
> ตอบผิดทุก booking ย้อนหลัง จึง **เชื่อ snapshot ที่ booking บันทึกไว้** (`bookingRateRef`)
> `walkChain()` ยังมีไว้สำหรับ path ของ booking ที่สร้างสด (real-time)

### แผง "ทำไม Margin ตก" (`src/gate.js`)

เมื่อมี Cost Delta + Superseded → เทียบ 2 ตัวเลข:
- **ณ วันเสนอราคา** = `(Sold − (Cost − Δ) + KB) / (Sold+KB)` = 10.09% (ผ่าน)
- **ณ วันจอง** = 3.99% (ไม่ผ่าน)

ราคาขาย Lock ตามใบเสนอราคา ต้นทุนตลาดขึ้น → Margin compression มาจากตลาด ไม่ใช่ Sales

---

## Workflow (state machine — `localStorage`)

```
PASS          → [Confirm Booking] → DOCSTAT=Confirmed, เขียน MARGINPCN
NEED_APPROVE  → [ส่งเข้าอนุมัติ] → Wait → [Approve Profit*] → [Approve Credit*] → [Confirm]
BLOCKED       → ปุ่มปิดทั้งหมด (แก้สาเหตุก่อน)
```
`*` = บังคับกรอกเหตุผล (ลง log ต่อ booking)

**Tolerance simulator (D3):** ในเคส NEED_APPROVE มี control จำลอง "เคยอนุมัติ booking นี้ไว้ที่ __%"
→ ถ้า margin ปัจจุบันลดจากนั้นไม่เกิน `TolerancePP` (1.0 จุด) → เด้งเป็น **PASS(Tolerance)** อัตโนมัติ
(เช่น เคยอนุมัติ 4.5% ตอนนี้ 3.99% ลด 0.51 ≤ 1.0 → ผ่าน / แต่เคย 8.0% ลด 4.0 > 1.0 → ยัง NEED_APPROVE)

> Tolerance เทียบกับ **รอบอนุมัติก่อนหน้า** — การกด Approve Profit ในรอบนี้จะ *ไม่* พลิก verdict
> เป็น PASS เอง (เป็นขั้นตอนใน flow ไม่ใช่รอบก่อน)

---

## ไฟล์

```
frmFPIBookingGate/
├── index.html        3 panel: Bookings · Bill/Cost Lines · Gate/Margin/Workflow
├── style.css         theme amber + verdict banners + workflow steps
├── data.js           สำเนาฝังของ ../data/*.json (auto-generated — regenerate เหมือน QuoteGen)
├── mapping.md        UI field ↔ DB column / view / proc
└── src/
    ├── utils.js      helpers (เหมือน QuoteGen)
    ├── state.js      dataset loader + marginRule + workflow state (localStorage)
    ├── profit.js     ⭐ vFPI_BookProfit + FPI_EvaluateBookingMargin (ไม่แตะ DOM)
    ├── autofill.js   Cost Auto-fill traceability + Superseded Chain + Delta Alert
    ├── grid.js       booking list, header, Bill/Cost grid, autofill panel
    ├── gate.js       verdict banner, margin math, "why margin", workflow
    └── app.js        evaluate pipeline + workflow actions + reason modal
```

`profit.js` / `autofill.js` ไม่พึ่ง DOM — โหลดใน Node ทดสอบ golden ได้ตรง ๆ

---

## ยังไม่ได้ทำ

- **Cost ไม่ยืนยันจาก Superseded Chain → BLOCKED** (§6.2/§4.3 ข้อ 4) — DDL proc จริงไม่ได้ implement
  (เช็คแค่ BadFx + ไม่มีบรรทัด) และไม่มี booking ตัวอย่างที่ chain ตัน จึงยังไม่ทำในหน้านี้
- **UnApprove / ย้อน Wait** — state machine เดิมของ SFBOOK มี แต่ mockup ยังไม่ใส่
- **Approval Inbox** (หน้าจอ 4) — รายการ Wait รวมหลาย booking + Timeline
- Booking ยังเลือกจากชุด seed 3 ใบ — ยังไม่มีหน้าสร้าง booking ใหม่ (Bill จาก Quote + Cost Auto-fill สด)
