# frmFPIKBDashboard — Field Mapping

Dashboard เป็น **read-only view** ที่ aggregate จากหลาย object — ดู mapping เต็มของแต่ละส่วนที่:
[Rate Mgmt](../frmFPIRateMgmt/mapping.md) · [Booking Gate](../frmFPIBookingGate/mapping.md) · [Quotation](../frmFPIQuoteGen/mapping.md)

Schema: [`../FPI_DDL_v1.0.sql`](../FPI_DDL_v1.0.sql) · Design §8 / D2

---

## แหล่งข้อมูลต่อ Panel

| Panel | Object / View | คำนวณ |
|---|---|---|
| Active Rates / Rate Health | `FPI_RateHeader` + `vFPI_ActiveRate` + `vFPI_RateAlert` | นับ status + alert as-of |
| **Quotes at Risk (D2)** | `AFQHEAD`/`AFQDETAIL` + `FPI_QuoteRateRef` + `FPI_RateHeader.SupersededBy` | quote active ∧ rate ตาย → เดิน chain → Δ ทุน |
| Margin Health | `SFBOOK`/`SFBOOKDETAIL` + `vFPI_BookProfit` + `FPI_EvaluateBookingMargin` | verdict distribution + avg margin% |
| Top Lanes | `FPI_RateHeader` + `SFBOOK` | group by (POL, POD) |
| Win Rate | `AFQHEAD` + `SFBOOK.REFQTNO` | quotes ที่มี booking อ้างถึง / total |

---

## Quotes at Risk (D2) — logic

```
สำหรับแต่ละ quotation ที่ as-of ∈ [ValidFrom, ValidTo]:
  สำหรับแต่ละ option:
    rate = FPI_RateHeader[option.rateId]
    ถ้า rate ไม่ Active as-of (SUPERSEDED/EXPIRED/...):
      walk FPI_RateHeader.SupersededBy → currentRate (§4.3, ลึกสุด 10)
      ถ้าเจอ currentRate ที่ Valid:
        Δ = currentRate.FRT[container].Amount − QuoteRateRef.CostRefAmount    (native)
        ΔTHB = Δ × CostRefFxToTHB
      ถ้าไม่เจอ: "ไม่มีตัวแทน" → Booking BLOCKED (§4.3 ข้อ 4)
```

Field:
- quote validity → `AFQHEAD.ValidFrom/ValidTo`
- option rate → `AFQDETAIL` option group → `FPI_QuoteRateRef.RateChargeId` → `FPI_RateCharge.RateId`
- quote-time cost → `FPI_QuoteRateRef.CostRefAmount` / `CostRefFxToTHB`
- current cost → `FPI_RateCharge.Amount` ของ rate ปลาย chain

---

## Quirks

- **as-of** ขับทุก panel (Active/Alert/at-risk) — DDL ใช้ `GETDATE()`; dashboard เปิดให้เลื่อนวัน (ตั้งต้น 2026-09-15 เพื่อให้ R-0003 active แล้ว Δ ทุนคำนวณได้)
- ที่ as-of ก่อน R-0003 มีผล (เช่น 08-15) chain ตัน → "ไม่มีตัวแทน" (ถูกต้อง — ยังไม่มี rate แทน)
- Win Rate นับหยาบ (quote ที่มี booking อ้าง) — ระบบจริงต้องแยก lost/pending/expired ให้ชัด
- Δ ทุนแสดงเฉพาะ freight ตู้แรกที่พบใน option (ไม่รวม surcharge)
- Dashboard ไม่เขียนอะไร — action ทั้งหมดอยู่ที่หน้าต้นทาง (Rate Mgmt / Booking Gate / Approval Inbox)
