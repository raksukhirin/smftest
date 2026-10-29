# frmFPIKBDashboard — KB Dashboard

หน้าจอที่ 5 จาก 6 ของ **FPI (Freight Pricing Intelligence)** — ดู [`../CLAUDE.md`](../CLAUDE.md)
อ้างอิงหลัก: [`../FPI_Design_v0.3_Freeze_Candidate.md`](../FPI_Design_v0.3_Freeze_Candidate.md) §8 · D2

> **ภาพรวม Executive** ของ Rate KB · Quotation · Booking — รวมทุก engine ที่ทำมา
> Rate ใกล้หมดอายุ · **Quote Active ที่ Rate ต้นทางตาย + ส่วนต่างทุน (D2)** · Margin Average · Top Lane · Win Rate

| | |
|---|---|
| Theme | ⬛ Slate (executive) + KPI สี semantic |
| Namespace | `window.KB` (view) — **reuse engine** จาก `RM` + `BG` |
| Data | `../data/*.json` ผ่าน `BG.state.load()` · fallback `../frmFPIBookingGate/data.js` |
| Persistence | ไม่มี — read-only dashboard |

---

## รัน

```bash
cd D:/DEV.AI/SMP.AI/mockup/FPI
python -m http.server 8762
# → http://localhost:8762/frmFPIKBDashboard/index.html
```

> **as-of ตั้งต้น = 2026-09-15** — วันที่ที่ show เคส D2 ที่มีส่วนต่างทุนชัด (R-0001 → R-0003 +120 USD)
> เลื่อน as-of ได้: 07-13 (1 at-risk), 08-15 (3 at-risk, ไม่มีตัวแทน), 09-15 (2 at-risk, มี Δ ทุน)

---

## Reuse — ไม่มี logic ซ้ำ

Dashboard = **view ใหม่** บน engine ของหน้าอื่น (ตอบ finding "ไม่ทำ engine ซ้ำ"):

```html
<script src="../frmFPIBookingGate/{data,src/utils,src/state,src/profit,src/autofill}.js"></script>
<script src="../frmFPIRateMgmt/src/{utils,alerts}.js"></script>
```

| ใช้จาก | ทำอะไร |
|---|---|
| `RM.alerts` (Rate Mgmt) | vFPI_RateAlert / vFPI_ActiveRate — Rate health + expiry |
| `BG.profit` (Booking Gate) | vFPI_BookProfit + evaluate — Margin health |
| `BG.autofill` (Booking Gate) | Superseded Chain walk (§4.3) — หา Rate ปัจจุบันของ Quote ที่ Rate ตาย |
| `BG.state` | dataset + marginRule + rate/quote |

`src/dashboard.js` (namespace `KB`) แค่ **aggregate** ผลจาก engine เหล่านี้ ไม่คำนวณ margin/alert/chain เอง

---

## Panels

### KPI row
Active Rates · ใกล้หมดอายุ ≤7ว. · **Quotes at Risk (D2)** · Avg Booking Margin · รออนุมัติ · Win Rate

### ⚠ Quotes at Risk (D2) — headline
Quotation ที่ยัง Active (as-of อยู่ใน validity) แต่ **Rate ต้นทาง EXPIRED/SUPERSEDED**:
- เดิน Superseded Chain (§4.3) หา Rate ปัจจุบัน
- ถ้าเจอ → แสดง **Δ ทุน/ตู้** (ทุนใหม่ − ทุนที่ Quote lock ไว้) เช่น `R-0001 → R-0003 +120 USD (+4,380 THB/ตู้)`
- ถ้าไม่เจอ (chain ตัน) → **"ไม่มีตัวแทน"** = Confirm Booking ไม่ได้ (BLOCKED §4.3)

> ราคาขาย Lock ตามใบเสนอราคา — Δ ทุนบวก = Margin จะถูกบีบตอน Booking (ต่อยอดเรื่องเดียวกับ Booking Gate)

### Rate Health
สัดส่วนสถานะ (CONFIRMED/DRAFT/SUPERSEDED/EXPIRED) + alert (EXPIRED / EXPIRING_7D / STALE_DRAFT_30D / NO_SOURCE_REF)

### Margin Health
กระจาย verdict ของ booking (PASS/NEED_APPROVE/BLOCKED) + Avg/Min/Max margin% · ลิงก์ไป Approval Inbox

### Top Lanes
Rates / Active / Bookings ต่อ lane

### Win Rate
Quotes ที่มี Booking อ้างถึง / Quotes ทั้งหมด

---

## ไฟล์

```
frmFPIKBDashboard/
├── index.html   KPI row + 4 panels (reuse RM + BG engines)
├── style.css    slate exec theme + semantic KPI tiles + bars
├── mapping.md   view/field ที่ dashboard รวม
└── src/
    ├── dashboard.js  ⭐ KB.build(asOf) — aggregate (ไม่แตะ DOM, ไม่ทำ logic ซ้ำ)
    └── app.js        render KPI/panels + boot
```

ไม่มี `data.js` / `utils.js` / engine เป็นของตัวเอง — reuse ทั้งหมด

---

## Data ที่เพิ่มเพื่อหน้านี้

`quotations.json` 1→4 ใบ:
- `QSE26080002` — healthy (R-0007 active)
- `QSE26080003` — at-risk (R-0002 expired, ไม่มีตัวแทน)
- `QSE26060010` — quote หมดอายุ (สำหรับ Win Rate)

Quote ใหม่ไม่กระทบ golden ของ QuoteGen (ใช้ `quotations[0] = QSE26080001` เดิม) · regenerate `data.js` ของ QuoteGen + BookingGate ให้ตรง `../data`

---

## ยังไม่ได้ทำ

- **Trend ตามเวลา** — dashboard เป็น snapshot ณ as-of เดียว ยังไม่มีกราฟย้อนหลัง
- **Drill-through** — คลิก KPI/แถวแล้วกระโดดไปหน้าที่เกี่ยว (ตอนนี้เป็น static view)
- **Win Rate จริง** — ตอนนี้นับ Quote ที่มี Booking อ้างถึงแบบหยาบ (ไม่รวม lost/พิจารณาอยู่แยกชั้น)
- **Cost delta หลาย container** — แสดง Δ ของ freight ตู้แรกที่เจอเท่านั้น
