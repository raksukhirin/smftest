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

## ไฟล์ในโฟลเดอร์นี้

```
FPI_Design_v0.3_Freeze_Candidate.md   เอกสารออกแบบฉบับเต็ม (อ้างอิงหลัก)
FPI_DDL_v1.0.sql / _Rollback          Schema จริงสำหรับ SQL Server (เฟสถัดไป)
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
  quotations.json         1 ใบ 2 Port (Hamburg/Rotterdam) พร้อม rateRef Traceability
  bookings.json           7 ใบ: 3 เดิม (PASS / NEED_APPROVE Superseded+Delta / BLOCKED BadFx)
                          + 4 เพิ่มสำหรับ Approval Inbox (STRAT override / ลูกค้าใหม่ราคาต่ำ / ขาดทุน / ดีลใหญ่ใกล้เกณฑ์)

frmFPIQuoteGen/                       หน้าจอที่ 2 (Quotation Generator) — Mockup ใช้งานได้จริง
                                      Pricing Engine อยู่ที่ src/engine.js (ไม่แตะ DOM, ทดสอบใน Node ได้)
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
5. KB Dashboard — Rate ใกล้หมดอายุ, Quote Active ที่ Rate ตาย, Margin Average
6. AI Knowledge Search — ถามภาษาธรรมชาติ ตอบพร้อมอ้างอิง RateNo/เอกสารเสมอ
