# FPI — Test Plan: Parallel Run (ระยะที่ 2)
## เทียบสูตรกำไร FPI กับระบบเดิมบนข้อมูลจริง ก่อน Cutover

เวอร์ชัน: 1.0
วันที่จัดทำ: 8 กรกฎาคม 2026
อ้างอิง: เอกสารออกแบบ v0.3 (Freeze) + FPI_DDL_v1.0.sql
ไฟล์คู่กัน: `FPI_ParallelRun_Compare_v1.0.sql` (ชุด Query ทั้งหมด Read-only)

---

## 1. วัตถุประสงค์และเกณฑ์ผ่านรวม

พิสูจน์ว่า `vFPI_BookProfit` + `FPI_EvaluateBookingMargin` ให้ผลเทียบเท่ากลไกเดิม (`SF_BOOK_PROFIT2` + `ChkProfitOK`) บน Booking จริงทุกใบ ก่อนสลับจุด Confirm/Approve ไปใช้ของใหม่ (ระยะที่ 3)

เกณฑ์ผ่านเพื่อเข้าสู่ Cutover:

1. T1 ตรงกัน 100% ติดต่อกันอย่างน้อย 10 วันทำการ (นับเฉพาะส่วนต่างที่ไม่อยู่ใน Exception Log)
2. ทุกรายการใน Exception Log (T2) มีลายเซ็นทีม Pricing รับทราบว่าเป็นการแก้ที่ตั้งใจ
3. T5 Smoke Test ครบทุก Scenario และผลตรงตามคาด
4. รายการ Data Quality (T3, T4) ได้รับการแก้ไขหรือรับทราบครบ

## 2. เงื่อนไขเริ่มและความถี่

- `FPI_DDL_v1.0.sql` รันสำเร็จ (ตรวจด้วย Query ท้ายไฟล์: ChargePolicy = 498)
- ทุก Query เป็น Read-only — รันบนฐานข้อมูลจริงได้โดยไม่กระทบระบบ
- ความถี่: รัน Q1–Q4 ทุกสิ้นวันทำการตลอดช่วง Parallel (แนะนำ 2–4 สัปดาห์) และบันทึกผลในตารางข้อ 5

## 3. รายการทดสอบ

| รหัส | ชื่อ | วิธี | เกณฑ์ผ่าน |
|---|---|---|---|
| T1 | Reconciliation ทุก Booking | Q1: Join สูตรใหม่กับ `SF_BOOK_PROFIT2` เทียบ RTSold/RTCost/RTKB (Tolerance 0.01) | ExactMatch = TotalBookings (ยกเว้นรายการใน T2) |
| T2 | REB Exception Log | Q2: รายการที่ RTKB ต่าง เพราะสูตรใหม่นับ `REB` เป็น Rebate (การแก้ที่ตั้งใจ — D9) | ทุกใบมี Pricing Sign-off |
| T3 | Bad FX Report | Q3: เอกสารที่มีบรรทัดสกุลต่างประเทศ Rate = 0 (เดิมเงินหายเงียบ ใหม่ = BLOCKED) | รายการถูกส่งทีม Ops แก้ไข/รับทราบครบ |
| T4 | Fail-open Audit | Q4: Booking ที่ไม่มีบรรทัด Bill/Cost เลย (เดิมผ่านอัตโนมัติ ใหม่ = BLOCKED) | รายการถูกทบทวนครบ |
| T5 | Proc Smoke Test | Q5: `EXEC FPI_EvaluateBookingMargin` กับเอกสารตัวแทน 4 Scenario | ผลตรงตารางคาดหวังข้อ 4 |
| T6 | Known-value Regression | Q6: เอกสารที่พิสูจน์ค่าด้วยมือแล้ว 3 ใบ | ค่าตรงทุกหลัก |
| T7 | Seed Validation | Q7: การกระจาย PricingMode/IsRebate ใน ChargePolicy | 498 รวม: MARKUP 20 / PASS 16 / STD_SELL 462 / IsRebate 9 |
| T8 | LaneHistory Sanity | Q8: จำนวนแถว, Orphan Job = 0, เครื่องหมาย CN ติดลบถูกต้อง | ทุกเงื่อนไขจริง |

## 4. T5 — ตารางคาดหวัง Smoke Test

| Scenario | เอกสารตัวอย่าง | คาดหวัง Result | เหตุผล |
|---|---|---|---|
| ผ่านเกณฑ์ | `BSE18100003` | PASS | Margin 12.21% ≥ 10% |
| ต่ำกว่าเกณฑ์ | เลือกใบที่ Margin < 10% จากผล Q1 | NEED_APPROVE | ข้อความระบุ % จริง + ชื่อ Rule |
| Tolerance | ใบที่ ISPROAPP=1 แล้วแก้ยอดเล็กน้อย (ทดสอบบน Dev) | PASS | ลดไม่เกิน 1 จุดจากที่อนุมัติ |
| Blocked | `BSI20030001` | BLOCKED | BadFxLines = 1 (CLE 2,400 USD Rate 0) |

## 5. บันทึกผลรายรอบ

| Round | วันที่ | Total | ExactMatch | REB Diff | BadFx | Fail-open | ผู้รัน | หมายเหตุ |
|---|---|---|---|---|---|---|---|---|
| 0 (Pre-DDL) | 8 ก.ค. 2026 | 108 | **108 (100%)** | 0 | 1 (`BSI20030001`) | ยังไม่วัด (รอ Q4 หลัง DDL) | Claude (จำลองสูตรแบบ Inline) | สูตรตรงกับระบบเดิมทุกใบตั้งแต่ก่อนติดตั้ง |
| 1 | | | | | | | | |
| 2 | | | | | | | | |

หมายเหตุ Round 0: รันด้วยสูตร Inline (แทน `vFPI_BookProfit` ที่ยังไม่ติดตั้ง และแทน ChargePolicy ด้วย `EXPCODE IN ('KB','REB')`) ผลคือส่วนต่าง = 0 ทั้ง 108 ใบ รวมทั้ง RTKB — แปลว่า ณ วันนี้ยังไม่มี Booking ในอดีตที่ใช้รหัส `REB` ฝั่ง Cost การแก้ D9 จึงไม่สร้างส่วนต่างย้อนหลังแม้แต่ใบเดียว (Exception Log เริ่มที่ศูนย์)

## 6. Exception Log (T2)

| วันที่พบ | DOCNO | RTKB เดิม | RTKB ใหม่ | สาเหตุ | Pricing Sign-off | วันที่ |
|---|---|---|---|---|---|---|
| | | | | | | |

## 7. การอนุมัติเข้าสู่ระยะ Cutover

| บทบาท | ชื่อ | ลายเซ็น | วันที่ |
|---|---|---|---|
| เจ้าของระบบ (SMFDeveloper) | | | |
| หัวหน้าทีม Pricing | | | |
| หัวหน้าบัญชี (รับทราบสูตร Margin) | | | |
