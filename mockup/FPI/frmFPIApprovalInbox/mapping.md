# frmFPIApprovalInbox — Field Mapping

หน้านี้เป็น **view** บน engine + data เดียวกับ [Booking Margin Gate](../frmFPIBookingGate/mapping.md)
— ดู mapping หลัก (SFBOOK / SFBOOKDETAIL / vFPI_BookProfit / FPI_EvaluateBookingMargin) ที่นั่น
เอกสารนี้ระบุเฉพาะส่วนที่ **ต่าง** (การจัดคิว + action ฝั่ง Manager)

Schema: [`../FPI_DDL_v1.0.sql`](../FPI_DDL_v1.0.sql) · Design §6.2 / §8

---

## Queue — เลือก booking เข้าคิว

```sql
-- แนวคิด (mockup คำนวณ client-side จาก FPI_EvaluateBookingMargin)
SELECT b.DOCNO ...
FROM   SFBOOK b
WHERE  b.DOCSTAT = 'Wait'            -- ส่งเข้าอนุมัติแล้ว
  AND  b.ISPROAPP IS NULL           -- ยังไม่ Approve Profit
-- + ผล FPI_EvaluateBookingMargin = 'NEED_APPROVE'
```

Mockup: `evaluate() = NEED_APPROVE` และ `wf.isProApp = false` และ `wf.rejected != true`

---

## การ์ด — field ต่อ booking

| UI | ที่มา |
|---|---|
| DocNo / Lane / ลูกค้า / Tier / วันที่ / อ้างใบเสนอ | `SFBOOK` (เหมือน Booking Gate) |
| Sold / Cost / Margin / Margin% | `vFPI_BookProfit` + `FPI_EvaluateBookingMargin` |
| ห่างเกณฑ์ (จุด) | `MinMarginPct − Margin%` |
| reason chip (ขาดทุน/ตลาดขึ้น/ใกล้เกณฑ์/ราคาขายต่ำ) | คำนวณจาก Margin<0 / `FPI_BookingRateRef.QuoteDeltaTHB`+Chain / shortfall |
| margin ณ วันเสนอ (รายละเอียด) | counterfactual จาก `QuoteDeltaTHB` |

---

## Actions → เขียนกลับ

| ปุ่ม | เขียน (Cutover จริง) | mockup (localStorage) |
|---|---|---|
| **Approve Profit** | `SFBOOK.ISPROAPP=@user`, `MARGINPCN=@pct`, `DOCSTAT='Wait'` (รอ Credit) | `wf.isProApp=true`, `marginPct`, log |
| **ตีกลับ** | ส่งกลับ Sales — (สถานะ Reject/Revise ในกระบวนการเดิม) | `wf.rejected=true`, `rejectReason`, log |
| **Batch approve** | loop Approve Profit ด้วยเหตุผลเดียว | เขียนทุก docNo ที่เลือก |

ทุก action บังคับ **เหตุผล** (audit) — ลง `wf.log[]` (จริง → ตาราง audit/approval history)

---

## Integration

`localStorage['fpi_booking_gate_v1']` **แชร์กับ Booking Margin Gate** (origin เดียวกัน):
- Approve ที่นี่ → Booking Gate เห็น `isProApp` → เดินต่อขั้น **Approve Credit → Confirm**
- ตรงกับ state machine เดิมของ `SFBOOK`: `Wait → (Profit) → (Credit) → Confirmed`

---

## Quirks

- คนละ **port** = คนละ **origin** = คนละ localStorage — ต้องเสิร์ฟทั้ง 2 หน้าจาก server ตัวเดียวจึงจะแชร์สถานะ (ดู README)
- `wf.rejected` เป็น field ที่หน้านี้เพิ่มบน object เดิมของ Booking Gate — Booking Gate ยังไม่อ่าน (แสดง NEED_APPROVE ต่อ) เป็น gap ที่ตั้งใจไว้ (ดู README "ยังไม่ได้ทำ")
- เกณฑ์ "ใกล้เกณฑ์ ≤ 1.0 จุด" ใช้ค่าเดียวกับ `TolerancePP` โดยบังเอิญ — คนละความหมาย (อันนี้แค่จัดกลุ่ม UI ไม่ใช่ Tolerance ของ §6.2)
