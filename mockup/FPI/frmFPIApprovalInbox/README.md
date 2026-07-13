# frmFPIApprovalInbox — Approval Inbox

หน้าจอที่ 4 จาก 6 ของ **FPI (Freight Pricing Intelligence)** — ดู [`../CLAUDE.md`](../CLAUDE.md)
อ้างอิงหลัก: [`../FPI_Design_v0.3_Freeze_Candidate.md`](../FPI_Design_v0.3_Freeze_Candidate.md) §8 · §6.2

> มุมมอง **Manager** — คิวของ booking ที่ผล Gate เป็น **NEED_APPROVE** (จาก [Booking Margin Gate](../frmFPIBookingGate/))
> พร้อม **Sold / Cost / Margin / สาเหตุ ครบในหน้าเดียว** ตัดสิน Approve Profit / ตีกลับ

| | |
|---|---|
| Theme accent | 🔵 Indigo (`bg-indigo-600`) |
| Namespace | `window.IB` (view) — **reuse engine** จาก `window.BG` (Booking Gate) |
| Data | `../data/*.json` เมื่อเสิร์ฟผ่าน http · fallback `../frmFPIBookingGate/data.js` |
| Persistence | `localStorage['fpi_booking_gate_v1']` — **แชร์กับ Booking Margin Gate** |

---

## รัน

```bash
cd D:/DEV.AI/SMP.AI/mockup/FPI
python -m http.server 8760
# → http://localhost:8760/frmFPIApprovalInbox/index.html
```

> **ต่อกับ Booking Gate:** เปิดทั้งสองหน้าจาก **origin เดียวกัน** (เสิร์ฟเวอร์ตัวเดียว) เพื่อให้แชร์
> `localStorage` — Approve ในหน้านี้จะไปโผล่ที่ Booking Gate (ขึ้นขั้น Approve Credit) และกลับกัน
> `http://localhost:8760/frmFPIApprovalInbox/` + `http://localhost:8760/frmFPIBookingGate/`
> (คนละ port = คนละ origin = คนละ localStorage)

---

## Reuse — ไม่มี engine ซ้ำ

หน้านี้ **ไม่มีสำเนา margin engine** — โหลดของ Booking Gate มาใช้ตรง ๆ ผ่าน relative `<script>`:

```html
<script src="../frmFPIBookingGate/data.js"></script>       <!-- BG.seed -->
<script src="../frmFPIBookingGate/src/utils.js"></script>   <!-- BG.utils -->
<script src="../frmFPIBookingGate/src/state.js"></script>   <!-- BG.state: loader + marginRule + wf() -->
<script src="../frmFPIBookingGate/src/profit.js"></script>  <!-- BG.profit: vFPI_BookProfit + evaluate -->
<script src="../frmFPIBookingGate/src/autofill.js"></script><!-- BG.autofill: chain + delta -->
```

Approval Inbox = **view ใหม่บน engine + state เดิม** (ตอบโจทย์ finding "ไม่ทำ engine ซ้ำ 3 ที่")

---

## Queue / lifecycle

booking เข้าคิวเมื่อ `evaluate() = NEED_APPROVE` และยังไม่ถูก Approve/Reject

```
NEED_APPROVE ──▶ [Approve Profit] → wf.isProApp=true, docStat=Wait  → Booking Gate เดินต่อ Approve Credit
             └─▶ [ตีกลับ]         → wf.rejected=true               → ส่งกลับ Sales แก้/Revise
```

แท็บ: **รออนุมัติ / อนุมัติแล้ว / ตีกลับ / ทั้งหมด** · เรียงตาม Margin แย่สุด / มูลค่าดีล / ห่างเกณฑ์

---

## การจัดกลุ่มสาเหตุ (ขับ recommendation)

ระบบจัดเหตุผลที่ margin ต่ำ แล้วแนะนำการตัดสินใจ:

| สาเหตุ | เงื่อนไข | แนะนำ | ตัวอย่าง (seed) |
|---|---|---|---|
| **ขาดทุน** | Margin < 0 | ตีกลับ | `BSE26100003` (−9.67%) |
| **ต้นทุนตลาดขึ้น** | Cost Delta เตือน + Superseded Chain | อนุมัติ | `BSE26090004` (+9,125, ตลาดขึ้น) |
| **ใกล้เกณฑ์** | ห่างเกณฑ์ ≤ 1.0 จุด | อนุมัติ | `BSE26100001` (5.24%<6% STRAT), `BSE26100004` (7.64%<8% ดีลใหญ่) |
| **ราคาขายต่ำ** | ห่างเกณฑ์ > 1.0 จุด, ไม่มี cost delta | ทบทวน | `BSE26100002` (7.16%<10% ลูกค้าใหม่) |

> **จุดสำคัญ:** แยก **"ตลาดขึ้น"** (ราคาขาย Lock, ต้นทุนขึ้นจริง → อนุมัติได้) ออกจาก
> **"ราคาขายต่ำ"** (Sales กดราคาเอง → ควร Revise) — ตรงกับหลักของ `BSE26090004`
> (เคสสำคัญสุดของระบบ) การ์ดกาง "รายละเอียด" จะเทียบ margin ณ วันเสนอ vs วันจอง

---

## Features

- **Summary strip** — จำนวนรออนุมัติ, มูลค่าดีลรวม (Sold), จำนวน "ตลาดขึ้น" / "ขาดทุน"
- **การ์ดต่อ booking** — Sold / Cost / Margin / Margin% (เทียบเกณฑ์ + ห่างกี่จุด) + reason chip + lean
- **รายละเอียด (กางได้)** — Bill/Cost lines + narrative "ทำไม margin ตก" (เคสตลาดขึ้น)
- **Approve Profit / ตีกลับ** — บังคับเหตุผล, log ต่อ booking
- **Batch approve** — เลือกหลายรายการ อนุมัติด้วยเหตุผลเดียว

---

## ไฟล์

```
frmFPIApprovalInbox/
├── index.html   โหลด engine ../frmFPIBookingGate/* + view ของตัวเอง
├── style.css    theme indigo
├── mapping.md   UI ↔ DB (ส่วนที่ต่างจาก Booking Gate)
└── src/
    ├── inbox.js  build/classify/sort + render summary/cards/detail
    └── app.js    bootstrap + tabs/sort + approve/reject/batch + reason modal
```

ไม่มี `data.js` / `utils.js` / `profit.js` / `autofill.js` เป็นของตัวเอง — reuse จาก Booking Gate

---

## ยังไม่ได้ทำ

- **Timeline เดิม (§8)** — เชื่อมประวัติ approve/reject กับ Timeline ของ SFBOOK
- **แยกบทบาท Approve Profit vs Approve Credit** — หน้านี้โฟกัส Profit (margin gate); Credit ยังอยู่ที่ Booking Gate
- **แจ้งเตือน / SLA** — booking รออนุมัติเกิน N วัน (ต้องมี field เวลาที่ส่งเข้า Wait)
- Reject ยังไม่ผูกกลับไปหน้า Quotation เพื่อ Revise (หน้า 2) — เป็นแค่ธง `rejected`
