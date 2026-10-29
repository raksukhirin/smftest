# FPI — Freight Pricing Intelligence (Mockup Phase)

> ไฟล์นี้คือ Context Handoff สำหรับ Claude Code — สรุปทุกอย่างที่ตัดสินใจและพิสูจน์แล้ว
> ห้ามออกแบบขัดกับ Decision Log ด้านล่างโดยไม่บันทึกเป็น Decision ใหม่

## โปรเจกต์คืออะไร

ระบบ Pricing Intelligence สำหรับบริษัท Freight Forwarder ไทย สร้างชั้นใหม่ทับระบบ ERP เดิม
(VB6 + SQL Server ฐานข้อมูล `smfdb`) โดยไม่รื้อของเดิม — **เฟสปัจจุบัน: Mockup UI บนข้อมูล JSON**
(ยังไม่ต่อ SQL Server — Data Layer ต้องออกแบบให้สลับ JSON → SQL ได้ภายหลัง
Field ใน JSON ตั้งชื่อตรงกับ DDL แบบ camelCase 1:1)

## Workflow ธุรกิจ (พิสูจน์จากระบบจริงแล้ว)

```
Rate KB → Quotation (1 ใบหลาย Port, เก็บเฉพาะราคาขาย, ไม่มี Margin Gate)
       → ลูกค้า Approve → จองซ้ำได้หลาย Shipment ตลอด Validity
       → Booking (Bill จาก Quote / Cost Auto-fill จาก Rate KB)
       → Confirm = จุดเคาะ Margin → ผ่าน หรือ Wait → Approve Profit → Approve Credit
```

## สถานะ Legacy Map (Layer 4) — ยืนยันกับ DB จริงแล้ว

- **Join map operations↔financial ยืนยันกับ DB จริงแล้ว** (live job `SE17050002`, 2026-07-14)
  — chain `Quotation → Booking → House (SFHBL) → Job (SFJOB)` + ชั้น AR/AP ผูก house ผ่าน `SUBJOBNO`
- **Financial tables ยืนยันชื่อแล้ว:**
  - **AR/AP = `ARINVHEAD` / `ARINVDETAIL`** — อยู่ตารางเดียวกัน **แยกด้วย `SRCTYPE`** (`AR` / `AP`)
  - **GL = `GLDETAIL`** · **CB = `CBDETAIL`**
- รายละเอียดเต็ม + join key 5 อัน + allocation model (§1.1) อยู่ใน [`FPI_Legacy_Map.md`](./FPI_Legacy_Map.md)

## สูตร Margin (Reverse-engineer จาก VB6 + View จริง — ตรวจแล้ว 108/108 Booking)

```
FX ต่อบรรทัด: THB=1 | สกุลอื่นที่ Rate=1 → ใช้ DocRate | อื่น ๆ → ItemRate
Sold = Σ Bill×FX | Cost = Σ Cost×FX (รวม Rebate) | KB = Σ Cost×FX เฉพาะ isRebate
Margin  = Sold − Cost + KB
Margin% = Margin × 100 / (Sold + KB)
ผ่านเมื่อ ≥ minMarginPct (Rule) และ Margin ≥ minProfitTHB
Tolerance: เคย Approve แล้ว ลดไม่เกิน tolerancePP (1.0) → ผ่านไม่ต้องอนุมัติซ้ำ
BLOCKED เมื่อ: ไม่มีบรรทัดเลย (Fail-closed) หรือมีบรรทัดต่างสกุล Rate=0 (BadFx)
```

## Decision Log (Freeze แล้ว — v0.3)

| # | สรุป |
|---|---|
| D1 | Margin เคาะตอน Confirm Booking ไม่ใช่ตอนเสนอราคา |
| D2 | Quotation 1 ใบ : N Lane และจองซ้ำได้ตลอด Validity — Cost ดึงสด ณ วันจอง |
| D3 | ใช้สูตร Margin ด้านบน เกณฑ์เป็น Config ไม่ Hardcode |
| D4 | มิติ Charge = OPITEM (subSysName+jobClass+expCode) → GL ผ่าน Chain เดิม |
| D5 | PricingMode ต่อ Charge: MARKUP / STD_SELL / PASS (ADV = PASS เสมอ) |
| D6 | Contract ของลูกค้าเป็น Default, Spot แสดงเทียบ, Override ต้องมีเหตุผล |
| D7 | Air Weight Break ใช้ Take-lower (เทียบ W×เรทปัจจุบัน กับ Breakถัดไปขั้นต่ำxเรทถัดไป เลือกต่ำกว่า) |
| D8 | เตือน Cost เปลี่ยนจากวันเสนอ ≥3% หรือ ≥2,000 THB |
| D9 | KB/REB = Rebate ฝั่งจ่าย (isRebate) / PROS = Profit Share สองทิศ ไม่ใช่ Rebate |
| D10 | BookingRateRef เก็บ quoteRevNo ณ วันจอง |
| D11 | ประวัติจริง (Job/Invoice) ใช้ประกอบการแนะนำเท่านั้น — Tier: RateKB > POSTED > JOB_ENTRY > Booking > Quote > Legacy — ห้าม Auto-fill จากประวัติ |

### D12 — Margin Actualization `[DRAFT v0.1 — หลัง Freeze v0.3 · รีวิวรอบ 1 ผ่าน]`

| # | สรุป |
|---|---|
| D12 | **Actual margin = สูตรที่แกะจาก `SFDPFJOB01_CONSOL.rpt` (ยึดตามนั้น — §6 แผนที่สูตร)** · grain = `OPTRANSDETAIL` ต่อ house · ยอด = `(ITEMTYPE='ADV'?nDetTotal:nDetGross)×nDocBal` (`nDocBal` มาจาก `ARINVHEAD.SRCTYPE` = กลไกหัก CN) · FX ใช้ **`SALERATE` ไม่ใช่ `ITEMRATE`** · **ไม่แทนที่ D3** (estimated ยังเคาะ gate ตาม D1) → parity 108/108 ไม่กระทบ · master cost เกาะแถว `Allocated` → เฉลี่ยลง house **โดยเลือก basis จากคอลัมน์ `ALLOCBY`** (`CBM`/`KGS`/`SHP`/`D/O`) · ว่าง → fallback จาก UOM (`KG*`→KGS · `CBM*`/`M3*`→CBM · **Else→SHP**) · roll-up ผ่าน `SFHBL.BOOKREF` · **lens Sale/Consol แยกด้วย `SFHBL.SALENO = SFHBL_M.SALENO`** · **บรรทัด `DOCTYPE='N/A'` = โอน Consol→Sale** สร้าง Sale Cost + Consol Revenue พร้อมกัน · **`SALETEXTRATE` = ราคาที่ Consol ขายให้ Sale** — ว่าง = ยังไม่ตั้ง (ใช้ยอด invoice) · ตัวเลข = ใช้ com price · **`'0'` = ขายให้ 0** (Direct: ไม่เป็น Sell/Cost ของ house → ตกฝั่ง Consol · Allocated: **ไม่เฉลี่ย**) · คุมทีละบรรทัด ไม่มีสวิตช์ระดับ job → UI ต้องแสดง `เฉลี่ย n/m บรรทัด` · **`[แก้ 2026-07-22]` กรอง post ตามรายงาน** (`DETID IS NOT NULL AND POSTENTRY<>3`) **ยกเว้นบรรทัด `N/A` ที่นับเสมอ** — ใช้กับ allocation pool ด้วย · → ต้อง join `ARINVDETAIL`/`ARINVHEAD` (`[ผู้ใช้กำหนด]` ไม่ต้องไล่ว่ายอดเงินควรมาจากตารางไหน — ยึดสูตร) · **ปัดเศษ: ปล่อยต่าง** ตาม `Round(share,2)` ของรายงาน → invariant = `|Σ − master| ≤ 0.01 × จำนวน house` · **CB/GL ไม่อยู่ใน scope** |

> รายละเอียด: [`FPI_D12_MarginActualization_v0.1.md`](./FPI_D12_MarginActualization_v0.1.md)
> 📐 **สูตรฉบับเต็มจาก Crystal Report → §6 "แผนที่สูตรทั้งชุด"** (4 ชั้น: ยอดต่อบรรทัด → แยกประเภท → ชั้น Saleperson/ราคาโอน → Allocation)
> D11 ไม่ต้องแก้ — `vFPI_LaneHistory` COALESCE ไป posted ได้ต่อ เพราะตอบคนละคำถาม (ราคาอ้างอิงที่ดีที่สุด vs กำไรจริงที่นิ่ง)
>
> **🧪 วิธี verify ที่ใช้อยู่ — snapshot ย้อนสถานะ `[2026-07-22]`**
> ผู้ใช้แก้ข้อมูลใน `SMF_DEMO` เพื่อทดสอบสูตร (แก้ค่าในแถวเดิม ไม่ใช่แค่เพิ่มแถว) → ทุกบรรทัดเก็บค่า
> ณ วันพิมพ์แต่ละฉบับไว้กับตัวเอง (`PRINT`/`PRINT2`) engine จึงย้อนสถานะคำนวณใหม่ได้ · **ได้ golden หลายชุด**
> **A** ฉบับ 22/07 → 6/6 · **B** หลังปิดการเฉลี่ย → 3/3 · **NOW** หลังปิด Com Rate ที่ `PROS` → รอรายงาน
> ⚠ invariant `Σ share = master` **ใช้ไม่ได้เมื่อปิดการเฉลี่ยทั้งหมด** — ต้องเช็คก่อนว่ามีบรรทัดให้เฉลี่ยไหม
>
> **✅ `[แก้ 2026-07-22]` D12 พิสูจน์ได้ทั้ง 2 ครึ่งแล้ว:**
> - **A · อ่าน ledger** → พิสูจน์ได้ (เทียบหน้าจอสรุปกำไร Job เดิม = parallel run ของ D12)
> - **B · เฉลี่ย master→house** → ~~ไม่มี ground truth~~ **มี** — สูตรอยู่ใน Crystal Report `SFDPFJOB01_CONSOL.rpt` และ**รายงาน Profit by House คือ oracle** · แกะสูตรครบแล้ว (`xBillRevThb_Alloc` / `xVchrThb_Alloc`) · mockup คำนวณเองตรงรายงาน **6/6 ช่อง** บน `SE17050002`
> - ที่เคยหาไม่เจอเพราะ **มองผิดที่** — allocation ไม่ persist เพราะ**คำนวณตอนพิมพ์รายงาน** (ไม่ใช่ proc, ไม่เกี่ยวกับ `fxnHBL` ที่ encrypt)
> - ผลต่อ design: ต้องเปิดเผย **3 ชั้นความจริงของยอด Sale** — **ของแข็ง** (ยอดใบกำกับของ house เอง) · **ของคำนวณ** (ส่วนเฉลี่ยจาก master) · **ของตั้ง** (ราคาโอน `Com Rate`/`Com Price` ที่ผู้ใช้กรอกเอง)
> - 🔒 **ตรึง `{?chgGroup1}='Saleperson'` · `{?chgGroup2}='House B/L'`** — ด่านแบ่งแผนกทำงานเสมอ และ D12 **ใช้ด่านกับทุกสูตรรวมสาย ADV** (ของเดิม `n_vchradv_thb` บวกนอกด่าน → แถว master ที่มี `Cost+ADV` จะนับสองที่) · **จุดที่ 2 ที่ D12 ตั้งใจต่างจากรายงาน** — ปิดด้วยการตัดสิน ยังไม่มีใบยืนยัน
> - ⇄ **สวิตช์ระดับ job คุมการเฉลี่ย `[ตัดสิน: ก+ค]`** — ทำได้แต่ต้องเป็น **bulk-edit `SALETEXTRATE`** เท่านั้น (ห้ามสร้าง field ใหม่ = แหล่งความจริงซ้อน) · แตะเฉพาะ `HBLREF=JOBNO` · **ห้ามล้าง `SALEPRICE`** (ย้อนกลับได้ 100%) · **FPI ไม่เป็นเจ้าของสวิตช์ — มีหน้าที่ตรวจเจอสถานะ `ผสม` แล้วเตือน** เพราะ bulk-edit เป็นคำสั่ง ไม่ใช่สถานะ (บรรทัดใหม่ไม่สืบทอด)
> - 👤 **สิทธิ์เห็นตามแผนก `[ผู้ใช้กำหนด]`** — **Sale เห็นเฉพาะ `House / Sale Dept`** (หน้าตาเหมือน Single Job · ไม่เห็นแถว `Allocated`) · **Consol เห็นเพิ่ม `Master Job / Consol Dept`** → **ส่วนเฉลี่ยต้องอธิบายได้โดยไม่อ้างแถว master**
> - 🔐 **Com Price จำกัดสิทธิ์ — ผู้มีอำนาจเท่านั้นเห็น/กรอกได้** → **ตัดสินแล้ว: explainability แบ่งชั้นตามสิทธิ์** (ทั่วไปเห็นยอด+ธง "อิงราคาโอน" · ผู้มีอำนาจเห็นตัวเลข) · ทำใน mockup แล้ว
> - ⏳ **สมมติฐานอนุรักษ์นิยมระหว่างรอคำตอบ:** Com Price **แก้ย้อนหลังได้** → ทุกยอด actual ต้องมี **as-of** และ FPI **เก็บ audit trail ราคาโอนเอง** (ผ่อนทีหลังง่ายกว่าเพิ่มทีหลัง)
> - 🔴 **กำไร Sale Dept ไม่ใช่ตัวเลข derive ล้วน ๆ — เป็น managed number** · เทียบ estimated↔actual ในมุม Sale Dept = เทียบกับตัวเลขที่มีราคาโอนปนอยู่ **ต้องเขียนกำกับ ไม่ปล่อยเงียบ**
> - ✅ Legacy Map §1.1 **อัปเกรดเป็น `[ยืนยันแล้ว]` แล้ว** (2026-07-22) พร้อมแก้ basis เป็น **`OPTRANSDETAIL.ALLOCBY`** (UOM เป็น fallback) — สองไฟล์ตรงกันแล้ว

### 🔻 รอบตรวจ `2026-07-17` — จาก ER diagram + ฟอร์ม Job จริง

> **โครงหลักของ D12 ยืนทั้งหมด** · ของใหม่มาจากฟอร์ม *Outbound Master Job* (`SE17050002`) ไม่ใช่จากการนับแถวใน demo

| # | สิ่งที่พบ | ต้องตัดสิน |
|---|---|---|
| 2 | ✅ **กฎเฉลี่ยแคบกว่าที่คิด** — จำเป็นเฉพาะ **job ที่มีหลาย booking** · booking เดียว = Σ ทั้ง job ไม่ต้องเฉลี่ย | ลดเดิมพัน sign-off · **D12-lite ถูกลง** |

> **กติกา 4 กรณี `[ผู้ใช้กำหนด 2026-07-22]`** (รายละเอียด: D12 §4)
>
> | กรณี | เฉลี่ย | Booking | แผนก |
> |---|---|---|---|
> | ไม่มี House | ❌ | `SFHBL_M.BOOKREF` | Sale = Consol (โครงสร้างบังคับ) |
> | 1 House | ❌ (1 House = 1 Book) | `SFHBL.BOOKREF` | Sale = Consol (SALENO ตรงกับ master) |
> | >1 House · เฉลี่ย | ✅ **ไม่นับแถว `Allocated`** | `SFHBL.BOOKREF` | **Sale แยก Consol** |
> | >1 House · ไม่เฉลี่ย | ❌ (master ติดธง `'0'`) | `SFHBL.BOOKREF` | **Sale แยก Consol** |
>
> - **Booking = กฎเดียว:** `SFHBL.BOOKREF` ของแถวที่ถือเงิน · แถว master ถูกอ่านก็ต่อเมื่อเป็นแถวเดียวที่มี
> - **"Sale = Consol" เป็นผลของสูตรเดิม ไม่ใช่กฎทับ** → D12 ไม่ต่างจากรายงานในกรณี 1–2
> - 🎯 **D12 ต่างจากรายงานเดิมที่เดียว: ตัดแถว `Allocated` ออกจากผู้รับส่วนเฉลี่ย** (กรณี >1 House · เฉลี่ย)
> - ⚠ แยกให้ชัด: **"ไม่เฉลี่ย" ≠ "เงินไม่ถึง booking"** — ยัง roll-up `Σ → booking` ตามปกติ
| 3 | ⚠ **`SFJOB.TOTBL`** เป็น counter ที่ไม่มี FK บังคับให้ตรง | → เสนอ `COUNT(Direct)` |
| 4 | 🔲 **`CSJOB`** (พิธีการศุลกากร) มี `DUTYCHG`/`VATCHG`/... **นอก `OPTRANSDETAIL`** | D12 มองไม่เห็น — อยู่ใน scope ไหม? |

> ### 🚫 กฎการใช้ `SMF_DEMO` `[ผู้ใช้กำหนด]` — สำคัญ
>
> MCP `smfdb` ต่อ DB ชื่อ **`SMF_DEMO`** ไม่ใช่ production · job `SE17050002` ที่อ้างว่า "verified live job" อยู่ใน DB นั้น
> → **parallel run 108/108 ของ D3 ก็ทำบน demo DB** · golden job มี CBM ราย house = 10/20/30/40/50 พอดีเป๊ะ (= seed)
>
> **ผู้ใช้ระบุ: "SMF_DEMO ไม่ได้เน้นความสมบูรณ์" → ห้ามสรุปสถิติจาก DB นี้ · ดูได้เฉพาะ job ที่ระบุเจาะจง**
>
> - ✅ **โครงสร้าง** (คีย์ join, ความหมายคอลัมน์, cardinality, object มีอยู่ไหม) — เชื่อได้
> - ❌ **สถิติ** (%, การกระจาย, ความถี่ edge case) — **ต้องวัดบน production เท่านั้น**
> - ❌ **ข้อสรุปจาก job นอกเหนือจากที่ผู้ใช้สั่ง** — **ถอนออกทันที** `[2026-07-22]`
> - 📋 **ฟอร์ม VB6 จริงของผู้ใช้ = แหล่งที่ดีกว่า demo aggregate** สำหรับพฤติกรรมระบบ

## ไฟล์ในโฟลเดอร์นี้

```
FPI_Design_v0.3_Freeze_Candidate.md   เอกสารออกแบบฉบับเต็ม (อ้างอิงหลัก)
FPI_DDL_v1.0.sql / _Rollback          Schema จริงสำหรับ SQL Server (เฟสถัดไป)
FPI_Legacy_Map.md                     Layer 4 — Legacy Map (operations↔financial join map, verified)
                                      mapping legacy smfdb object → หน้าที่เดิม → FPI ใช้/แทนที่ตรงไหน → D#
FPI_SystemMap.html                    ★ แผนที่ระบบ 7 หน้าจอ + คู่มือ (ซอร์สของ Artifact)
FPI_D12_MarginActualization_v0.1.md   D12 (DRAFT) — actual margin + allocation master→house
                                      §6 = แผนที่สูตร 4 ชั้นที่แกะจาก Crystal Report
reference/                            ★ ของแกะจากระบบเดิม — อ่านที่นี่ ไม่ต้องเปิด .rpt ใหม่
  SFDPFJOB01_CONSOL.formulas.md         สูตรที่ D12 ใช้ 41 ตัว จัดกลุ่มตาม 4 ชั้น (verbatim)
  SFDPFJOB01_CONSOL.dump.txt            dump เต็ม 3,461 บรรทัด (236 สูตร + subreport + links)
                                      สร้างใหม่: tools/dump-crystal-rpt.ps1 (ต้อง PowerShell 32-bit)
FPI_TestPlan_ParallelRun_v1.0.md      แผนทดสอบ + ผล Round 0 (108/108 ผ่าน)
FPI_ParallelRun_Compare_v1.0.sql      Query เทียบ Q1-Q8
data/                                 ชุด JSON สำหรับ Mockup:
  charge_policy.json      329 รายการ — ข้อมูลจริงจาก OPITEM (SF+AF)
  lane_history.json       31 รายการ — ตัวแทนข้อมูลจริงจาก OPTRANSDETAIL
  margin_rules.json       4 Rules (Default 10% + Tier A/B/NEW)
  customer_profiles.json  4 ลูกค้า (สังเคราะห์)
  rate_headers.json       9 Rates: Sea Contract+Spot, Superseded Chain (R-0001→R-0003), Air Weight Break
                          + R-0005/6/7 (THLCH→DEHAM เทียบ GBB) + R-0008 DRAFT ค้าง / R-0009 no-source (Rate Mgmt alerts)
                          ทุกใบมี createdAtUtc/confirmedAtUtc (vFPI_RateAlert)
  rate_charges.json       57 บรรทัด ครบทุก Basis รวม REBATE และ Air Break
  local_charge_tariff.json 3 Tariff ครบ 3 PricingMode
  quotations.json         4 ใบ: QSE26080001 (2 Port, golden) + healthy/at-risk/expired สำหรับ KB Dashboard (D2)
  bookings.json           7 ใบ: 3 เดิม (PASS / NEED_APPROVE Superseded+Delta / BLOCKED BadFx)
                          + 4 เพิ่มสำหรับ Approval Inbox (STRAT override / ลูกค้าใหม่ราคาต่ำ / ขาดทุน / ดีลใหญ่ใกล้เกณฑ์)

frmFPIQuoteGen/                       หน้าจอที่ 2 (Quotation Generator) — Mockup ใช้งานได้จริง
                                      Pricing Engine อยู่ที่ src/engine.js (ไม่แตะ DOM, ทดสอบใน Node ได้)
frmFPIMarginActual/                   ★ หน้าจอที่ 7 (D12 · Margin Actualization)
                                      index.html = data(smfdb จริง) + engine(สูตร Crystal) + UI ในไฟล์เดียว
                                      verify.js  = golden test ฝั่ง node — ต้องได้ A 6/6 · B 3/3 · C 3/3
```

## การแก้ไขข้อมูลที่บันทึกไว้ (จาก frmFPIQuoteGen)

- `rate_headers.json` 4→7 ใบ, `rate_charges.json` 27→51 บรรทัด — Lane THLCH→DEHAM เดิมมี Rate ใช้ได้ ≤1 ใบ จึงโชว์ Good/Better/Best ไม่ได้
- `margin_rules.json` `validFrom` `2026-08-01` → `2026-01-01` — **data bug**: Rule ทุกตัวเริ่ม ส.ค. แต่ `QSE26080001` ลง 5 ก.ค. และ `BSE26070010` (10 ก.ค.) มี note ว่า "ผ่านเกณฑ์ Tier B 8%" → ณ วันเสนอราคาไม่มี Rule ใดอยู่ใน Validity การ resolve ตกไป `MR-DEFAULT` (10%) เงียบ ๆ (ตอนนี้ Engine ติดธง `_outOfValidity` แทนที่จะเงียบ)

## ข้อควรระวังในข้อมูลจริง (จงใจคงไว้ให้ Mockup เจอ)

- `charge_policy.json`: `AF/EX/FRT` เป็น PASS (ระบบเดิมตั้ง ITEMTYPE=ADV) ขณะ `AF/IM/FRT` เป็น MARKUP — รายการที่ทีม Pricing ต้องทบทวน UI ควรมีหน้าจอ Review/แก้ PricingMode
- `lane_history.json`: มี Lane ว่าง (Job เก่าไม่กรอก Port), มีข้อมูลผิดปกติ (Air 11,133 kg) — UI ต้อง Handle
- Booking `BSE26090004` คือเคสสำคัญที่สุดของระบบ: Superseded Chain + Cost Delta + Margin ต่ำกว่าเกณฑ์ — หน้าจอ Approve ต้องแสดงให้ Manager เห็นว่า Margin ตกเพราะตลาดขึ้น ไม่ใช่ Sales ตั้งราคาต่ำ

## หน้าจอที่ต้องออกแบบ (ตาม Concept + v0.3 ข้อ 8)

1. ✅ Rate Management — [`frmFPIRateMgmt/`](./frmFPIRateMgmt/) — Search/Compare/Confirm + Expiry Alert (vFPI_RateAlert: EXPIRING_7D/STALE_DRAFT_30D/NO_SOURCE_REF) + Superseded chain
2. ✅ Quotation Generator — [`frmFPIQuoteGen/`](./frmFPIQuoteGen/) — Engine reproduce `QSE26080001` ได้ครบทุกบรรทัด (golden test ใน README)
3. ✅ Booking Margin Gate — [`frmFPIBookingGate/`](./frmFPIBookingGate/) — vFPI_BookProfit + FPI_EvaluateBookingMargin reproduce `bookings.json` (PASS/NEED_APPROVE/BLOCKED) + Cost Auto-fill/Delta/Workflow
4. ✅ Approval Inbox — [`frmFPIApprovalInbox/`](./frmFPIApprovalInbox/) — คิว NEED_APPROVE ฝั่ง Manager (reuse engine ของ Booking Gate), จัดกลุ่มสาเหตุ (ตลาดขึ้น/ราคาต่ำ/ขาดทุน) + Approve/Reject/Batch, แชร์ localStorage กับหน้า 3
5. ✅ KB Dashboard — [`frmFPIKBDashboard/`](./frmFPIKBDashboard/) — reuse ทุก engine (RM.alerts + BG.profit + BG.autofill); Rate health, **Quote at Risk D2 (Rate ตาย + Δ ทุน)**, Margin average, Top lane, Win rate
6. ✅ AI Knowledge Search — [`frmFPIKnowledgeSearch/`](./frmFPIKnowledgeSearch/) — rule-based intent matcher ตอบพร้อม citation เสมอ (Tier 1 Rate KB / Tier 2 ประวัติ D11), reuse ทุก engine, เว้น hook ต่อ LLM/MCP ที่ KB.engine.query()

7. ✅ Margin Actualization — [`frmFPIMarginActual/`](./frmFPIMarginActual/) — **D12 · ชั้น actual** · สูตร reverse-engineer จาก Crystal Report · เทียบรายงานจริง 3 ฉบับ (golden A/B/C) · สิทธิ์ 2 แกน + สวิตช์เฉลี่ย + ตัวตรวจสถานะผสม

> **ครบ 7 หน้าจอ** — estimated: Rate(1) → Quote(2) → Booking Gate(3) → Approve(4) + Dashboard(5) + AI Search(6) · **actual: Margin Actualization(7) ปิดวงจรกลับไปหา (3)**
> Engine เขียนครั้งเดียว reuse ข้ามหน้า: RM.alerts (Rate Mgmt) · BG.profit/autofill (Booking Gate) · QG.engine (Quotation)

---

## คู่มือใช้งาน

### ความสัมพันธ์ 7 หน้าจอ

```
── ชั้น ESTIMATED (ก่อนงานเดิน · ราคาที่ "สัญญาไว้") ────────────────────────────────
  Rate KB (1) ──rateRef──▶ Quotation (2) ──cost auto-fill + chain──▶ Booking Gate (3) ──NEED_APPROVE──▶ Approval Inbox (4)
       │                                                                  ▲                                  │
       └─── D2: Rate ตาย → Quote เสี่ยง (Δ ทุน) ───┐                      └──── แชร์ localStorage ───────────┘
                                                    ▼
                                    KB Dashboard (5) + AI Search (6)  ◀── อ่านจากทุกหน้า (read-only)

                              ── Confirm แล้ว · งานเดิน · วางบิล/ตั้งหนี้ ──
                                                    │
── ชั้น ACTUAL (หลังงานจบ · เงินที่ "เกิดขึ้นจริง") ─────────────────────────────────
                                                    ▼
                          Margin Actualization (7) ── D12 · OPTRANSDETAIL + ARINVDETAIL
                                                    │
                                                    └──▶ เทียบกับที่ Booking Gate (3) เคาะไว้
                                                         = ปิดวงจร estimated ↔ actual
```

**เส้นเชื่อมที่ต้องเข้าใจ:**
1. **Data flow** — `rateRef` (1→2) → `bookingRateRef`/cost auto-fill (2→3) → `NEED_APPROVE` (3→4)
2. **Engine reuse** — `RM.alerts` (1→5,6) · `BG.profit`/`BG.autofill` (3→4,5,6) · `QG.engine` (หน้า 2)
3. **Shared state** — หน้า 3↔4 แชร์ `localStorage['fpi_booking_gate_v1']`
4. **⭐ วงจรปิด (ใหม่)** — หน้า 7 อ่าน ledger จริงแล้วเทียบกลับหน้า 3 ผ่าน `SFHBL.BOOKREF`
   → ตอบคำถามที่ 6 หน้าแรกตอบไม่ได้: **"ใบที่อนุมัติไปที่ 4% จริง ๆ จบที่เท่าไหร่"**

**หน้า 7 ต่างจาก 1–6 ตรงไหน**

| | หน้า 1–6 | หน้า 7 (D12) |
|---|---|---|
| ข้อมูล | `data/*.json` (สังเคราะห์/ตัวแทน) | **ข้อมูลจริงจาก `smfdb`** ฝังในไฟล์ |
| สูตร | ออกแบบใหม่ตาม Decision Log | **reverse-engineer จาก Crystal Report** |
| ตรวจถูกไหม | golden test ในโค้ด | **เทียบกับรายงานที่พิมพ์จริง 3 ฉบับ** |
| ชั้นเวลา | ก่อนงานเดิน | หลังงานจบ + วางบิล

### ตารางหน้าจอ

| # | หน้าจอ | โฟลเดอร์ | Port (dev) | Theme | Engine | Persist |
|---|---|---|---|---|---|---|
| 1 | Rate Management | `frmFPIRateMgmt` | 8761 | Cyan | `RM.alerts` | Confirm/Cancel → LS |
| 2 | Quotation Generator | `frmFPIQuoteGen` | 8758 | Teal | `QG.engine` | — (generate) |
| 3 | Booking Margin Gate | `frmFPIBookingGate` | 8759 | Amber | `BG.profit`/`autofill` | workflow → LS |
| 4 | Approval Inbox | `frmFPIApprovalInbox` | 8760 | Indigo | reuse `BG.*` | แชร์ LS กับหน้า 3 |
| 5 | KB Dashboard | `frmFPIKBDashboard` | 8762 | Slate | reuse `RM`+`BG` | — (read-only) |
| 6 | AI Knowledge Search | `frmFPIKnowledgeSearch` | 8763 | Purple | reuse ทุก engine | — · hook LLM/MCP ที่ `KB.engine.query()` |
| **7** | **Margin Actualization** | **`frmFPIMarginActual`** | — (`file://` ได้) | Sand | ในไฟล์เดียว | — (read-only) |

> หน้า 7 ไม่ต้องใช้เซิร์ฟเวอร์ — data + engine + UI อยู่ในไฟล์เดียว · มี `verify.js` รัน golden ฝั่ง node

### วิธีรัน

```bash
# แนะนำ: เซิร์ฟเวอร์ตัวเดียวสำหรับทุกหน้า (จำเป็นเพื่อให้หน้า 3↔4 แชร์ localStorage)
cd D:/DEV.AI/SMP.AI/mockup/FPI
python -m http.server 8080
# → เปิดทุกหน้าใต้ localhost:8080/frmFPIxxx/index.html
```

> ⚠ **คนละ port = คนละ origin = คนละ localStorage** — `.claude/launch.json` แยก port ต่อหน้า (8758–8763) สะดวก dev
> แต่**หน้า 3↔4 จะไม่แชร์สถานะ** ถ้าเปิดคนละ port ต้องเสิร์ฟทั้งสองหน้าจาก origin เดียวจึงจะต่อเนื่องกัน
> Double-click `index.html` (file://) รันได้เช่นกัน — จะ fallback ไป `data.js` (สำเนาฝัง)

### เดโมทั้งวงจร (6 ขั้น ต้นน้ำ→ปลายน้ำ)

1. **Rate Mgmt** — ดู Alert 3 แบบ; ลอง Confirm `FR-2605-00008` (Draft) → หมดอายุทันทีเพราะ validity ผ่านแล้ว; เทียบ 3 rate บน DEHAM
2. **Quotation** — dropdown scenario: `A` (reproduce ใบจริง/golden) · `B` (Good/Better/Best) · `D` (กับดัก Air ขายเท่าทุน) · `F` (BadFx → BLOCKED)
3. **Booking Gate** — เลือก `BSE26090004`: ต้นทุนตลาดขึ้นผ่าน Superseded Chain → Margin ตก 10%→4%; ดู panel "ทำไม Margin ตก" → เดิน workflow ส่งอนุมัติ→Approve Profit→Credit→Confirm
4. **Approval Inbox** — คิว 5 ใบ จัดกลุ่มสาเหตุ (ขาดทุน/ตลาดขึ้น/ราคาต่ำ); Approve `BSE26090004` → **กลับหน้า 3 (origin เดียวกัน) เห็นขั้น Approve Credit โผล่ต่อ**
5. **KB Dashboard** — ตั้ง as-of `2026-09-15` → Quote-at-risk (D2): `QSE26080001 · R-0001→R-0003 · Δ +120 USD (+4,380 THB/ตู้)`
6. **AI Search** — พิมพ์/กด chip: "มี rate FCL Laem Chabang ไป Hamburg ไหม" · "C-BRAVO ควรบวก margin เท่าไหร่" · "THLCH SGSIN เคยจ่ายเท่าไหร่" — ทุกคำตอบมี citation
7. **Margin Actualization** — เปิด `frmFPIMarginActual/index.html` (double-click ได้เลย)
   §01 สลับ **แผนก Sale ↔ Consol** ดูว่าฝั่ง Sale ไม่เห็นคอลัมน์ Consol เลย ·
   สลับ **ผู้ใช้ทั่วไป** ดูว่า Com Price ถูกปิดแต่ธงยังอยู่ ·
   §03 กด **ไม่เฉลี่ยเลย → เฉลี่ยทั้งหมด** ดูยอดขยับ 12,934.60 แล้วกลับมาเป๊ะ ·
   ทำให้เป็นสถานะ **ผสม** แล้วดูแถบเตือน · §05 ดู golden 3 ชุด

### การตัดสินใจสำคัญที่เห็นในเดโม (Decision Log v0.3)

| # | หลัก | เห็นที่หน้า |
|---|---|---|
| D1 | เคาะ Margin ที่ Booking ไม่ใช่ตอนเสนอราคา | 3 |
| D2 | Quote 1:N + จองซ้ำได้ · Rate ตายแต่ Quote ยังใช้ได้ | 5 |
| D6 | Contract-first เลือก Rate · ข้ามลำดับต้องมีเหตุผล | 2 |
| D7 | Air take-lower (ดันน้ำหนักถ้าถูกกว่า) | 2 |
| D8 | เตือนต้นทุนเปลี่ยน ≥3% หรือ ≥2,000 THB | 3, 5 |
| D9 | Rebate (KB) บวกกลับเข้าฐาน Margin | 2, 3 |
| D11 | ประวัติ = Indicative ห้าม Auto-fill | 2, 6 |
| **D12** | **Actual อ่านจาก ledger จริง — ไม่ใช่ cost ที่กรอกใน booking** | **7** |
| D12 | **แถว `Allocated` ไม่รับส่วนเฉลี่ย** (ต่างจากรายงานเดิมโดยตั้งใจ) | 7 · §03 |
| D12 | **`SALETEXTRATE` = ราคาโอน** — ว่าง / ตัวเลข / `'0'` คุมทีละบรรทัด | 7 · §01 |
| D12 | **สิทธิ์ 2 แกน** — แผนก (เห็นคอลัมน์ไหน) · Com Price (เห็นตัวเลขไหม) | 7 · §01 |

### ⚠ อ่านหน้า 7 อย่างไรให้ไม่หลงทาง

หน้า 7 **ดูน่าเชื่อกว่าหน้า 1–6** เพราะเทียบกับรายงานจริงได้ — แต่ขอบเขตแคบกว่าที่เห็น

| ✅ เชื่อได้ | ❌ ยังเชื่อไม่ได้ |
|---|---|
| สูตร 4 ชั้น + basis `SHP`/`CBM` | basis `KGS` / `D/O` — ยังไม่เคยรัน |
| การแบ่งแผนก Sale/Consol | **roll-up → booking** — golden ทั้ง 3 ชุดเป็น job **booking เดียว** |
| ราคาโอนและธง `'0'` | ตัวเลขใน §04 Booking Gate — ประมาณการในใบสาธิตแทบว่าง (`AMFE` 10/5) |

> **ข้อที่สำคัญที่สุด:** roll-up คือเหตุผลที่ D12 มีอยู่ แต่**ยังไม่เคยผลิตตัวเลขที่ถูกตรวจ**
> ต้องหา job หลาย booking จาก production มายืนยันก่อน จึงจะเขียนชั้นนั้นเป็นโค้ดได้

> **หน้าอ้างอิงแบบ visual (ผัง + คู่มือ + เดโม 7 ขั้น) — แชร์ทีมได้**
> ซอร์ส: [`FPI_SystemMap.html`](./FPI_SystemMap.html) · Artifact: https://claude.ai/code/artifact/a5151961-bbc4-4b08-8101-303bd89ced41
> อัปเดต **2026-07-22** — เพิ่มหน้า 7 (D12) · ผังแบ่ง 2 ชั้นเวลา estimated↔actual · กล่องเตือน "อ่านหน้า 7 อย่างไรให้ไม่หลงทาง"