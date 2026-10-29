# frmFPIRateMgmt — Rate Management

หน้าจอที่ 1 จาก 6 ของ **FPI (Freight Pricing Intelligence)** — ดู [`../CLAUDE.md`](../CLAUDE.md)
อ้างอิงหลัก: [`../FPI_Design_v0.3_Freeze_Candidate.md`](../FPI_Design_v0.3_Freeze_Candidate.md) §3 (Rate KB) · §8 · DDL: [`../FPI_DDL_v1.0.sql`](../FPI_DDL_v1.0.sql)

> **ต้นน้ำของทั้งระบบ** — Rate Knowledge Base ที่ Quotation / Booking ดึงไปใช้
> **Search / Compare / Confirm + Expiry Alert**

| | |
|---|---|
| Theme accent | 🩵 Cyan (`bg-cyan-700`) |
| Namespace | `window.RM` (IIFE ต่อไฟล์ — รันจาก `file://` ได้) |
| Data | `../data/*.json` เมื่อเสิร์ฟผ่าน http · fallback `data.js` (embedded) |
| Persistence | `localStorage['fpi_rate_mgmt_v1']` — override สถานะจาก Confirm/Cancel |

---

## รัน

```bash
cd D:/DEV.AI/SMP.AI/mockup/FPI
python -m http.server 8761
# → http://localhost:8761/frmFPIRateMgmt/index.html
```

หรือ double-click `index.html` (fallback ไป `data.js`)

> **as-of ตั้งต้น = 2026-07-13** (เพื่อให้ Alert มีข้อมูลเดโม) — เปลี่ยนได้ที่ top bar

---

## Expiry Alert (`vFPI_RateAlert` — `src/alerts.js`)

Port ตรงจาก DDL (เกณฑ์ + predicate เหมือน view):

| Alert | เงื่อนไข | seed (as-of 2026-07-13) |
|---|---|---|
| **EXPIRING_7D** | `CONFIRMED` และ `ValidTo` ภายใน 7 วัน | `FR-2607-00002` (NLRTM, เหลือ 2 วัน) |
| **EXPIRED** | `CONFIRMED` และ `ValidTo < today` *(แยกจาก EXPIRING เพื่อ UI ชัด — มาจาก predicate เดียวกัน)* | — |
| **STALE_DRAFT_30D** | `DRAFT` และ `CreatedAtUtc` เก่ากว่า 30 วัน | `FR-2605-00008` (JPYOK) |
| **NO_SOURCE_REF** | `SourceRef IS NULL` และ `RateSource <> 'LEGACY_IMPORT'` | `FR-2607-00009` (AUMEL) |

การ์ด Alert คลิกได้ → กรองรายการเฉพาะประเภทนั้น
`vFPI_ActiveRate`: `CONFIRMED` และ as-of อยู่ใน validity → แสดง `DaysToExpiry` ต่อบรรทัด

---

## Features

- **Search** — mode / class / POL / POD / carrier / source / status / rate no. / เฉพาะ Active ณ as-of
- **Results** — ตารางเรียง Alert ก่อน (Expired → Expiring → Stale → No-source) แล้วตาม lane; status pill + alert badge + เหลือ/หมดกี่วัน
- **Rate Detail** — header ครบ + charges + **Superseded chain** (§4.3, ไล่ทั้งสาย) + SourceRef + Created/Confirmed
- **Confirm Rate** — `DRAFT → CONFIRMED` (บันทึก ConfirmedBy/At ตาม CHECK ใน DDL); เตือนถ้าไม่มี SourceRef
- **Cancel** — `→ CANCELLED`
- **Compare** — ติ๊ก ≥2 rate → เทียบ Freight / Surcharge / Transit / Free time / Source / Validity ต่อ container, ไฮไลต์ **ถูกสุด**
- **Upload (Excel + AI Parse)** — stub (§8, ยังไม่ทำในเฟส mockup)

Confirm/Cancel เก็บใน `localStorage` (override บน seed) — Reset ล้างกลับ

---

## Superseded chain

`R-0001 (FR-2607-00001)` → `R-0003 (FR-2609-00003)` — Rate KB จริงในชุดข้อมูล
Detail ของ rate ใด ๆ ในสายจะไล่ตั้งแต่หัวสายถึงตัวปัจจุบัน (ตัวที่เลือกไฮไลต์)

---

## ไฟล์

```
frmFPIRateMgmt/
├── index.html   alert strip · search+results · detail/compare
├── style.css    theme cyan + status pills + alert cards
├── data.js      สำเนาฝังของ ../data/*.json (auto-generated)
├── mapping.md   UI ↔ DB column / view
└── src/
    ├── utils.js   helpers
    ├── state.js   loader + as-of + Confirm/Cancel overrides (localStorage)
    ├── alerts.js  ⭐ vFPI_RateAlert + vFPI_ActiveRate + charge rollup (ไม่แตะ DOM)
    ├── ui.js      render alert strip / results / detail / compare
    └── app.js     search pipeline + selection + confirm/cancel + boot
```

`alerts.js` ไม่พึ่ง DOM — โหลดใน Node ทดสอบได้ (verify EXPIRING/STALE/NO_SOURCE)

---

## การแก้ `../data/` ที่ทำเพื่อหน้านี้

| ไฟล์ | เปลี่ยน | เหตุผล |
|---|---|---|
| `rate_headers.json` | +`createdAtUtc` / `confirmedAtUtc` ทุกใบ | `vFPI_RateAlert` STALE_DRAFT ต้องใช้ CreatedAtUtc |
| `rate_headers.json` | +`R-0008` DRAFT (สร้าง พ.ค., lane JPYOK) | เดโม STALE_DRAFT_30D |
| `rate_headers.json` | +`R-0009` CONFIRMED `sourceRef=null` (lane AUMEL) | เดโม NO_SOURCE_REF |
| `rate_charges.json` | +charges ของ R-0008/R-0009 | ให้ detail/compare มีข้อมูล |

Rate ใหม่อยู่บน lane ใหม่ (JPYOK/AUMEL) → **ไม่กระทบ** scenario ของ Quotation/Booking
(golden test ของ QuoteGen ยังผ่าน) · `data.js` ของ QuoteGen/BookingGate regenerate ให้ตรง `../data`

---

## ยังไม่ได้ทำ

- **Upload (Excel Template + AI Parse)** — §8, stub เฉย ๆ
- **Supersede action** — สร้าง rate ใหม่แล้วตั้ง `SupersededBy` ของตัวเก่า (ตอนนี้ chain มาจาก seed)
- **Create / Edit rate** — หน้านี้ค้นหา/ยืนยันเท่านั้น ยังไม่มีฟอร์มสร้าง rate + charges
- **Legacy Import migration** (§9 ระยะ 1) — `SFRATE/AFRATED → EXPIRED/LEGACY_IMPORT`
- **Compare ใช้ FX จริง** — ตอนนี้เทียบ freight เป็น THB โดยสมมติ USD×36.5 เพื่อจัดอันดับ
