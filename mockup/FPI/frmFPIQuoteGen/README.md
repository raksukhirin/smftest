# frmFPIQuoteGen — Quotation Generator

หน้าจอที่ 2 จาก 6 ของ **FPI (Freight Pricing Intelligence)** — ดู [`../CLAUDE.md`](../CLAUDE.md)
อ้างอิงหลัก: [`../FPI_Design_v0.3_Freeze_Candidate.md`](../FPI_Design_v0.3_Freeze_Candidate.md) §5 (Pricing Engine), §8 (หน้าจอ)

> **Input Shipment → Multi-lane Options (Good/Better/Best) → ราคาแนะนำตาม PricingMode → PDF**

| | |
|---|---|
| Theme accent | 🩵 Teal (`bg-teal-700`) |
| Namespace | `window.QG` (IIFE ต่อไฟล์ — รันจาก `file://` ได้) |
| Data | `../data/*.json` เมื่อเสิร์ฟผ่าน http · fallback เป็น `data.js` (embedded) เมื่อเปิดจาก `file://` |
| Persistence | ไม่มี — หน้าจอนี้เป็น *generator* ไม่ใช่ CRUD (ต่างจาก module อื่นที่ใช้ `localStorage`) |

---

## รัน

```bash
cd D:/DEV.AI/SMP.AI/mockup/FPI
python -m http.server 8758
# → http://localhost:8758/frmFPIQuoteGen/index.html
```

หรือ double-click `index.html` (จะ fallback ไปใช้ `data.js`)

ดูสถานะที่ top bar: `Source: ../data/*.json` = อ่านจากไฟล์จริง / `data.js (embedded)` = ใช้สำเนาฝังไว้

---

## Scenario ตัวอย่าง (dropdown บน top bar)

แต่ละอันงัดข้อกำหนดคนละข้อในเอกสารออกแบบ:

| | Scenario | พิสูจน์ |
|---|---|---|
| **A** | Sea multi-lane — reproduce `QSE26080001` | Golden test (ด้านล่าง) + Override + ManualReason 2 ชั้น |
| **B** | Good / Better / Best บน lane เดียว | GBB คำนวณจากทุน/transit จริง + ⭐ อันดับ D6 |
| **C** | Superseded chain (as-of ก.ย.) | §4.3 เดิน `SupersededBy` + Δ ทุน `R-0001 → R-0003` |
| **D** | Air take-lower + กับดัก `AF/EX/FRT = PASS` | D7 + Margin 0% ทั้งใบ |
| **E** | ไม่มี Rate ใน lane → Tier 2 | D11 ประวัติจริง (Indicative) — กดปุ่ม **＋ ใช้** ในตาราง JOB_SELL เพื่อสร้างใบเสนอราคาจากประวัติ (บังคับเหตุผล + ธง "อิงประวัติ" ติดไปถึง Booking) |
| **F** | BadFx — FX = 0 | §6.2 BLOCKED ตั้งแต่ตอนเสนอราคา |

---

## Golden test — เอนจินต้อง reproduce ใบเสนอราคาจริง

Scenario **A** (C-BRAVO · as-of `2026-07-05` · THLCH → DEHAM + NLRTM · 2 × 40HQ · FX 36.5) ต้องได้ราคาขายตรงกับ
`../data/quotations.json` (`QSE26080001`) **ทุกบรรทัด**:

| ExpCode | PricingMode | เส้นทางที่มา | ทุน | ขาย | quotations.json |
|---|---|---|---|---|---|
| `FRT40H` | `MARKUP` | RateCharge `RC-R-0001-03` | 1,600 USD | ×1.12 = **1,792.00** | 1792.0 ✅ |
| `FUEL` | `MARKUP` | RateCharge `RC-R-0001-04` | 90 USD | ×1.12 = **100.80** | 100.8 ✅ |
| `THC4` | `STD_SELL` | RateCharge `RC-R-0001-07` → *ไม่มี tariff* → fallback ทุน | 4,700 | **4,700** | 4700 ✅ |
| `BLFEE` | `STD_SELL` | Tariff `LT-0002` → `StdSellAmount` | 1,200 | **1,500** | 1500 ✅ |
| `SEAL` | `STD_SELL` | RateCharge `RC-R-0001-09` → fallback ทุน | 300 | **300** | 300 ✅ |

`Sold 149,674.40 − Cost 134,570.00 + KB 0 = Margin 15,104.40 (10.09%)` — ตรงกับ Booking `BSE26070010` เป๊ะ
(seed note เขียนไว้ว่า *"Margin ~9.95–10.4%"*)

> **⚠ เอกสาร v0.3 §7 เขียนว่า "THC/Seal PASS"** — policy จริงคือ `STD_SELL` ที่ *fallback ไปที่ทุน*
> ได้ตัวเลขเท่ากันแต่คนละเส้นทาง หน้าจอจึงแสดง **เส้นทาง** ไม่ใช่แค่ตัวเลข (คลิกคอลัมน์ "ที่มา")

### ส่วนต่างที่ตั้งใจให้เหลือ

**Option 2 (NLRTM):** เอนจินได้ `1540 × 1.12 = 1724.80` แต่ไฟล์เก็บ `1725.0` — **Sales ปัดเศษ**
นี่คือเคส Override ตัวจริง: แก้ช่อง "ขาย/หน่วย" → บังคับกรอกเหตุผล → บันทึกลง `FPI_QuoteRateRef.ManualReason`

**Option 2 ในไฟล์ตกบรรทัด `BLFEE`** (ซึ่ง `isMandatory = true` ใน `R-0002`) — เอนจินใส่ให้ และ `REB` ถูกกันออกจากใบเสนอราคาโดยอัตโนมัติ (เป็นบรรทัดฝั่งทุน · D9)

---

## กฎที่เอนจินบังคับ (`src/engine.js`)

### 1. เลือก Rate — §5.1 / D6

```
อันดับ 1  CONTRACT ที่ CustomerNo = ลูกค้ารายนี้
อันดับ 2  CONTRACT ของบริษัท (CustomerNo IS NULL)
อันดับ 3  SPOT / CARRIER_QUOTE  เรียงทุนต่ำสุด
อันดับ 4  CONTRACT ของลูกค้า "รายอื่น"   ← เพิ่มจากเอกสาร: บังคับ ManualReason
```

Candidate = `status = CONFIRMED` **และ** `asOf` อยู่ใน validity
ตัวที่ `SUPERSEDED / EXPIRED / NOT_YET_VALID` ซ่อนไว้ ติ๊ก *"แสดง Rate ที่…"* จึงจะเห็น — เลือกได้ แต่ต้องมีเหตุผล

> `R-0001` เป็น Contract ของ **C-ALPHA** แต่ `QSE26080001` ออกให้ **C-BRAVO** → เป็นอันดับ 4 ในระบบนี้
> (ข้อมูลจริงเป็นแบบนี้ — หน้าจอจึงต้องบอกให้รู้ ไม่ใช่ปล่อยผ่าน)

### 2. Good / Better / Best — คำนวณ ไม่ hardcode

| ป้าย | นิยาม |
|---|---|
| **Best value** | ทุน all-in (THB) ต่ำสุด |
| **Fastest** | `transitDaysMax` ต่ำสุด (tie-break: `freeTimeDest` มากสุด) — ติดป้ายก็ต่อเมื่อเร็วกว่า Best จริง |
| **Balanced** | คะแนน `0.5 × norm(cost) + 0.5 × norm(transit)` ต่ำสุด ในกลุ่มที่เหลือ |
| **⭐ แนะนำ** | อันดับ D6 สูงสุดที่ยัง Active — *แยกจาก GBB โดยตั้งใจ* |

ต้องมี Rate ที่ Active ≥ 2 ใบจึงติดป้าย

### 3. ที่มาของ "ทุน" ต่อบรรทัด

```
category ∈ {ORIGIN, DEST, CUSTOMS, TRUCKING}  →  FPI_LocalChargeTariff (ถ้า scope ตรง)  →  ถ้าไม่เจอ ใช้ FPI_RateCharge
category ∈ {FREIGHT, SURCHARGE, REBATE}       →  FPI_RateCharge เสมอ (ผูกกับ carrier)
```

Local charge เป็นค่าท่า/ค่าประเทศ ไม่ผันตาม carrier — กฎนี้คือเหตุผลที่ `BLFEE` ได้ทุน **1,200** (`LT-0002`)
ไม่ใช่ **1,500** ที่นั่งอยู่บน rate sheet ตรงกับ `rateRef` ใน `quotations.json`
เลือก tariff ที่ scope **แคบที่สุด** (`portCode > carrierNo > serviceType > mode`)

### 4. ราคาขายแนะนำ — §5.3 / D5

```
MARKUP    → ทุน × (1 + SuggestMarkupPct)          จาก MarginRule ของลูกค้า
STD_SELL  → 1. OPITEMSUB ของลูกค้า   (ยังไม่มีใน mockup dataset)
            2. LocalChargeTariff.StdSellAmount
            3. fallback = ทุน
PASS      → ทุน
```

บรรทัด `IsRebate` (`KB`, `REB`) **ไม่ขึ้นใบเสนอราคา** — ไปอยู่กล่อง "ฝั่งทุน" และบวกกลับเข้าฐาน Margin (D9)

### 5. Air weight break + Take-lower — §5.2 / D7

```
normal = max(MIN, W × rate(break ที่ W ตกอยู่))       ← MIN เป็น "พื้น" ไม่ใช่ทางเลือก
take-lower เพิ่ม: B.from × rate(B)  สำหรับทุก break B ที่ B.from > W
ใช้ค่าต่ำสุด  (เมื่อ RateHeader.TakeLowerEnabled = 1)
```

`R-0004`: `MIN 3,500 | +45:185 | +100:165 | +300:150 | +500:138 | +1000:125`

| W | normal | take-lower | ใช้ |
|---|---|---|---|
| 30 | MIN 3,500 | 45×185 = 8,325 | **3,500** |
| 50 | 50×185 = 9,250 | 100×165 = 16,500 | **9,250** |
| 290 | 290×165 = 47,850 | **300×150 = 45,000** | **45,000** |
| 480 | 480×150 = 72,000 | **500×138 = 69,000** | **69,000** |
| 999 | 999×138 = 137,862 | **1000×125 = 125,000** | **125,000** |
| 1200 | 1200×125 = 150,000 | *(ไม่มี break สูงกว่า)* | **150,000** |

Surcharge ที่คิด `PER_KG` (`FUEL`, `CS`) ใช้น้ำหนักจริง (480) ไม่ใช่น้ำหนักที่ดันขึ้น (500)
แถว "working" ใต้บรรทัดค่าระวางแสดงตัวเลือกทั้งหมด ขีดฆ่าตัวที่แพ้

### 6. Margin ประมาณการ — §6.2 (informational เท่านั้น · D1)

```
Sold   = Σ sellTHB  (ไม่รวมบรรทัด IsRebate)
Cost   = Σ costTHB  (รวมบรรทัด IsRebate)
KB     = Σ costTHB  เฉพาะ IsRebate
Margin = Sold − Cost + KB          Margin% = Margin × 100 / (Sold + KB)

BLOCKED เมื่อ: ไม่มีบรรทัดเลย (fail-closed) | มีบรรทัดสกุลต่างประเทศที่ FX = 0 (BadFx)
```

**Margin จริงเคาะตอน Confirm Booking (D1)** — แถบล่างเขียนกำกับไว้ตลอด
เมื่อ BLOCKED เพราะ BadFx ตัวเลข Sold/Cost/Margin จะถูก **ขีดฆ่า** และ Margin% แสดง `—` เพราะบรรทัด USD หายไปทั้งดุ้น (คูณด้วย 0) — ตัวเลขไม่ได้แค่ "ต่ำ" แต่ **ผิด** ซึ่งคือพฤติกรรมที่ FPI มีไว้เพื่อดักโดยเฉพาะ

---

## กับดักในข้อมูลจริงที่หน้าจอจงใจเปิดโปง

1. **`AF/EX/FRT` = `PASS`** (seed มาจาก `ITEMTYPE = 'ADV'`) → ใบเสนอราคา Air ขายเท่าทุนทุกบรรทัด **Margin = 0%**
   → banner สีเหลืองบอกว่าต้องทบทวน `FPI_ChargePolicy` (scenario **D**)
2. **`R-0001` = Contract ของ `C-ALPHA`** แต่ใบจริงออกให้ `C-BRAVO` → อันดับ 4 บังคับ ManualReason (scenario **A**)
3. **as-of เปลี่ยนคำตอบ** — ที่ `2026-07-05` DEHAM มี 3 rate active; ที่ `2026-09-12` เหลือ 2 และ `R-0001`
   เดิน chain ไป `R-0003` ทุนขึ้น **+9,125 THB** (scenario **C**)
4. **`lane_history.json` มีขยะ** — Lane ว่าง (`loadPort: null`) 6 บรรทัด และ Air `11,133 kg` (outlier)
   → panel Tier 2 **ตัดออกและบอกว่าตัดกี่บรรทัด** ไม่เฉลี่ยเงียบ ๆ (scenario **E**)
5. **`THC2` เป็นค่าตู้ 20GP** — ไม่ถูกเสนอเป็น add-on เมื่อ shipment มีแต่ 40HQ (qty จะเป็น 0)

---

## การแก้ไข `../data/` ที่ทำไปเพื่อหน้าจอนี้

| ไฟล์ | เปลี่ยน | เหตุผล |
|---|---|---|
| `rate_headers.json` | 4 → **7** ใบ (`R-0005` Maersk SPOT, `R-0006` Evergreen CARRIER_QUOTE, `R-0007` ONE CONTRACT บริษัท) | Lane THLCH→DEHAM เดิมมี Rate ใช้ได้ ≤ 1 ใบ → โชว์ Good/Better/Best ไม่ได้ |
| `rate_charges.json` | 27 → **51** บรรทัด | charge ของ 3 rate ใหม่ (20GP + 40HQ ครบ) |
| `margin_rules.json` | `validFrom` `2026-08-01` → **`2026-01-01`** (ทั้ง 4 rule) | 🐛 **data bug**: Rule ทุกตัวเริ่ม ส.ค. แต่ `QSE26080001` ลง ก.ค. และ `BSE26070010` (10 ก.ค.) มี note ว่า *"ผ่านเกณฑ์ Tier B 8%"* — ณ วันเสนอราคาไม่มี Rule ใดอยู่ใน validity เลย การ resolve จึงตกไป `MR-DEFAULT` (10%) เงียบ ๆ |

`QG.state.marginRule()` ตอนนี้ติดธง `_outOfValidity` เมื่อไม่มี Rule ใดอยู่ในช่วง แทนที่จะ fallback เงียบ ๆ — แถบล่างจะขึ้น pill แดง

### Regenerate `data.js`

`data.js` เป็นสำเนาฝังของ `../data/*.json` (สำหรับ `file://`) — **อย่าแก้ด้วยมือ** แก้ JSON แล้วรัน:

```bash
cd D:/DEV.AI/SMP.AI/mockup/FPI
node -e "
const fs=require('fs');
const files=['charge_policy','customer_profiles','lane_history','local_charge_tariff','margin_rules','rate_charges','rate_headers','quotations','bookings'];
const camel=s=>s.replace(/_([a-z])/g,(_,c)=>c.toUpperCase());
let out='/* data.js — Embedded copy of ../data/*.json so the mockup runs from file://\n';
out+='   AUTO-GENERATED. Do not edit by hand: regenerate from ../data/ (see README.md \"Regenerate data.js\").\n';
out+='   Field names are camelCase 1:1 with FPI_DDL_v1.0.sql. */\n';
out+='window.QG = window.QG || {};\n';
out+='window.QG.seed = (function () {\n    \'use strict\';\n    return {\n';
out+=files.map(f=>'        '+camel(f)+': '+JSON.stringify(JSON.parse(fs.readFileSync('data/'+f+'.json','utf8')))).join(',\n')+'\n';
out+='    };\n})();\n';
fs.writeFileSync('frmFPIQuoteGen/data.js',out);
"
```

---

## ไฟล์

```
frmFPIQuoteGen/
├── index.html        3 panel: Shipment · Lane Options · Charge Grid + sticky margin strip
├── style.css         theme teal + pills (PricingMode / GBB / rank stripe)
├── data.js           สำเนาฝังของ ../data/*.json (auto-generated)
├── print.css         ใบเสนอราคาสำหรับลูกค้า — ราคาขายเท่านั้น
├── mapping.md        UI field ↔ DB column
└── src/
    ├── utils.js      $ $$ el esc round money qty inRange median download
    ├── state.js      dataset loader + demo scenarios + marginRule resolution
    ├── engine.js     ⭐ pricing engine (§5, §6.2) — ไม่แตะ DOM เลย
    ├── history.js    Tier 2 lane history (§5.4 / D11) + outlier filter
    ├── input.js      panel 1
    ├── options.js    panel 2 (lane cards, GBB, rank stripe, chain)
    ├── grid.js       panel 3 (charge grid, take-lower working, source popover, override)
    ├── margin.js     alert stack + sticky strip
    ├── print.js      ใบเสนอราคา + export FPI_QuoteRateRef JSON
    └── app.js        recompute pipeline + reason modal
```

`engine.js` ไม่พึ่ง DOM — โหลดใน Node ได้ตรง ๆ เพื่อรัน golden test / unit test

---

## ยังไม่ได้ทำ

- **OPITEMSUB customer price layer** (ขั้นที่ 1 ของ STD_SELL) — ไม่มีใน mockup dataset จึงข้ามไปขั้นที่ 2 เสมอ (แสดงใน popover ว่า "ไม่มี StdSellAmount")
- **PCT_OF_FREIGHT** — implement แล้วแต่ไม่มีข้อมูลทดสอบ
- **LCL / AIRCON** — เลือกได้แต่ไม่มี rate ในชุดข้อมูล
- **Save / DocNo generation** — หน้าจอนี้ generate อย่างเดียว ยังไม่ persist
