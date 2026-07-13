# frmFPIBookingGate — Field Mapping

UI field ↔ DB column / view / stored procedure.
Schema: [`../FPI_DDL_v1.0.sql`](../FPI_DDL_v1.0.sql) · Design: [`../FPI_Design_v0.3_Freeze_Candidate.md`](../FPI_Design_v0.3_Freeze_Candidate.md) §6

> JSON ใช้ camelCase 1:1 กับ DDL (ตาม [`../CLAUDE.md`](../CLAUDE.md))

---

## ตาราง / View / Proc ที่เกี่ยวข้อง

| Object | บทบาท | อ่าน/เขียน |
|---|---|---|
| `SFBOOK` | หัว booking (DocNo, DocDate, RefQtNo, DocCurr, DocRate, Shipper/Consignee, DOCSTAT, MARGINPCN, ISPROAPP) | R + **W** (Confirm/Approve) |
| `SFBOOKDETAIL` | บรรทัด Bill/Cost (TransType, ExpCode, ItemCurr, ItemRate, Qty, SrcAmt) | R |
| `FPI_BookingRateRef` | โยงบรรทัด Cost → RateChargeId/TariffId + snapshot ทุน ณ วันจอง + QuoteDeltaTHB + QuoteRevNo | R |
| `FPI_ChargePolicy` | `IsRebate` (KB/REB) สำหรับสูตร KB | R |
| `FPI_MarginRule` | MinMarginPct / MinProfitTHB / TolerancePP / FailOpenIfNoData | R |
| `FPI_CustomerProfile` | Tier → resolve MarginRule; MarginOverridePct | R |
| `FPI_RateHeader` | เดิน SupersededBy (แสดง chain) | R |
| `vFPI_BookProfit` | คำนวณ RTSold / RTCost / RTKB / BadFxLines (§6.1) | R (view) |
| `FPI_EvaluateBookingMargin` | verdict PASS / NEED_APPROVE / BLOCKED (§6.2) | proc |

---

## Panel 1 · Bookings / Header

| UI | ที่มา |
|---|---|
| รายการ booking (dot สี) | `SFBOOK` · dot = expectedScenario (mockup metadata) |
| DOCSTAT pill | `SFBOOK.DOCSTAT` (mockup: localStorage) |
| DocNo / วันที่จอง | `SFBOOK.DOCNO` / `DOCDATE` |
| อ้างใบเสนอราคา | `SFBOOK.REFQTNO` + `FPI_BookingRateRef.QuoteRevNo` (D10) |
| Lane | `SFBOOK.LOADPORT` → `FINALPORT` |
| ลูกค้า / Tier | `SFBOOK.SHIPPER` (EX) หรือ `CONSIGNEE` (IM) → `FPI_CustomerProfile.Tier` |
| สกุล/เรท | `SFBOOK.DOCCURR` @ `DOCRATE` |
| เกณฑ์ | `FPI_MarginRule` (resolve as-of วันนี้, priority น้อยสุดชนะ) |

---

## Panel 2 · Bill / Cost Lines (`vFPI_BookProfit` §6.1)

| คอลัมน์ | ที่มา |
|---|---|
| Type | `SFBOOKDETAIL.TRANSTYPE` (Bill/Cost) · pill KB เมื่อ `FPI_ChargePolicy.IsRebate=1` |
| Charge | `SFBOOKDETAIL.EXPCODE` |
| Qty / Unit | `SFBOOKDETAIL.QTY` / `UNITPRICE` (SRCAMT = Qty × UnitPrice) |
| Cur | `SFBOOKDETAIL.ITEMCURR` |
| FX | คำนวณ: THB=1 / ItemRate=1 → `SFBOOK.DOCRATE` / else `SFBOOKDETAIL.ITEMRATE` |
| THB | SRCAMT × FX (BadFx → 0 + ⚠) |
| แถวรวม | `RTSold` − `RTCost` (+ `RTKB`) จาก `vFPI_BookProfit` |

**BadFx** = ItemCurr ≠ THB และ ItemRate = 0 → `vFPI_BookProfit.BadFxLines` → BLOCKED (§6.2)

---

## Panel 2b · Cost Auto-fill (`FPI_BookingRateRef` · §4.3 / D8)

| UI | ที่มา |
|---|---|
| ที่มา (Rate KB) | `FPI_BookingRateRef.RateChargeId` → `FPI_RateCharge.RateId` → `FPI_RateHeader.RateNo` |
| Superseded chain | `FPI_BookingRateRef` (snapshot ณ วันจอง) — chain[0]=Rate ที่เสนอ, chain[last]=Rate ที่ใช้จริง |
| ทุนวันเสนอ | ทุนวันจอง − `QuoteDeltaTHB` |
| ทุนวันจอง | SRCAMT × FX ของบรรทัด Cost |
| Δ THB | `FPI_BookingRateRef.QuoteDeltaTHB` |
| Delta Alert | รวม \|Δ\| ≥ 2,000 THB หรือ \|%\| ≥ 3% (D8, System Parameter) |

---

## Panel 3 · Gate / Workflow

| UI | ที่มา / เขียนกลับ |
|---|---|
| Verdict (PASS/NEED_APPROVE/BLOCKED) | `FPI_EvaluateBookingMargin` §6.2 |
| Margin math | `Sold − Cost + KB` · `× 100 / (Sold+KB)` |
| "ทำไม Margin ตก" | counterfactual จาก `QuoteDeltaTHB` (margin ณ วันเสนอ vs วันจอง) |
| Confirm Booking | → `SFBOOK.DOCSTAT='Confirmed'`, `MARGINPCN` = Margin% |
| ส่งเข้าอนุมัติ | → `SFBOOK.DOCSTAT='Wait'` |
| Approve Profit | → `SFBOOK.ISPROAPP` (บังคับเหตุผล) |
| Approve Credit | → (credit approval flag) |
| Tolerance | `FPI_MarginRule.TolerancePP` เทียบ `SFBOOK.MARGINPCN` เดิม vs Margin% ปัจจุบัน |

### State machine (เขียนกลับตอน Cutover จริง)

```
Open → [ประเมิน] → PASS      → Confirm  : SET DOCSTAT='Confirmed', MARGINPCN=@pct
                 → NEED_APPROVE:
                     Wait     : SET DOCSTAT='Wait'
                     Profit   : SET ISPROAPP=@user, MARGINPCN=@pct   (+ เหตุผล → audit)
                     Credit   : (credit approval)
                     Confirm  : SET DOCSTAT='Confirmed'
                 → BLOCKED   → (no write — แก้ BadFx/บรรทัดก่อน)
```

---

## Quirks

- `SFBOOK` เดิม**ไม่มี** `MARGINPCN`/`ISPROAPP` เป็นชั้น FPI — proc เขียนหลังผ่าน Gate; state machine เดิมของ SFBOOK (Confirm/Close/UnApprove) ไม่แก้พฤติกรรม
- `bookings.json` line **ไม่มี** `SUB_SYSNAME` (SFBOOKDETAIL จริงมี) — mockup lookup `IsRebate` ด้วย (JobClass, ExpCode) เพราะค่า IsRebate ของ KB/REB เท่ากันทุก subsystem
- FX rule `ItemRate=1 → DocRate` เป็นกติกาเดิม: บางบรรทัดกรอก ItemRate=1 แล้วตั้งใจให้รับเรทหัวเอกสาร — ห้ามตีความเป็น "เรท 1 บาท"
- `SRCAMT` ในระบบจริงเก็บเป็น field (`SFBOOKDETAIL.SRCAMT`) — mockup คำนวณ `Qty × UnitPrice` ให้เท่ากัน
