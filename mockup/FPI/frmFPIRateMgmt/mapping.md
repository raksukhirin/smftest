# frmFPIRateMgmt — Field Mapping

UI field ↔ DB column / view. Schema: [`../FPI_DDL_v1.0.sql`](../FPI_DDL_v1.0.sql) §3 / §Views

> JSON ใช้ camelCase 1:1 กับ DDL (ตาม [`../CLAUDE.md`](../CLAUDE.md))

---

## ตาราง / View

| Object | บทบาท | อ่าน/เขียน |
|---|---|---|
| `FPI_RateHeader` | หัว rate (Status, Validity, RateSource, SourceRef, SupersededBy, Created/Confirmed) | R + **W** (Confirm/Cancel) |
| `FPI_RateCharge` | บรรทัด charge ของ rate | R |
| `FPI_CustomerProfile` | Contract-specific rate → ชื่อลูกค้า | R |
| `vFPI_ActiveRate` | rate ที่ Active ณ วันนี้ + DaysToExpiry | R (view — คำนวณ client-side) |
| `vFPI_RateAlert` | แจ้งเตือน (EXPIRING_7D / STALE_DRAFT_30D / NO_SOURCE_REF) | R (view) |

---

## Search / Results

| UI | column |
|---|---|
| Mode / Class / POL / POD | `FPI_RateHeader.Mode / JobClass / POL / POD` |
| Carrier | `FPI_RateHeader.CarrierName` (`CarrierNo` = key จริง) |
| Source | `FPI_RateHeader.RateSource` (CARRIER_QUOTE/CONTRACT/SPOT/TARIFF/LEGACY_IMPORT) |
| Status | `FPI_RateHeader.Status` (DRAFT/CONFIRMED/EXPIRED/SUPERSEDED/CANCELLED) |
| Rate No. | `FPI_RateHeader.RateNo` |
| เฉพาะ Active ณ as-of | `vFPI_ActiveRate` predicate |
| Validity + เหลือ N วัน | `ValidFrom`/`ValidTo` + `vFPI_ActiveRate.DaysToExpiry` |
| Alert badge | `vFPI_RateAlert.AlertType` |

---

## vFPI_RateAlert (as-of = `GETDATE()`; mockup ใช้ช่อง as-of)

```
EXPIRING_7D     : Status='CONFIRMED' AND ValidTo BETWEEN today AND today+7
                  (mockup แยก EXPIRED เมื่อ ValidTo < today)
STALE_DRAFT_30D : Status='DRAFT' AND CreatedAtUtc < today-30
NO_SOURCE_REF   : SourceRef IS NULL AND RateSource <> 'LEGACY_IMPORT'
```

---

## Rate Detail

| UI | column |
|---|---|
| Mode/Service/Class · Transit · Free time | `Mode`/`ServiceType`/`JobClass` · `TransitDaysMin/Max` · `FreeTimeDest` |
| Validity + DaysToExpiry | `ValidFrom`/`ValidTo` |
| Source / SourceRef | `RateSource` / `SourceRef` |
| Contract | `ContractNo` + `FPI_CustomerProfile.CustomerName` (ผ่าน `CustomerNo`) |
| Take-lower | `TakeLowerEnabled` (D7) |
| Created / Confirmed | `CreatedAtUtc`/`CreatedBy` · `ConfirmedAtUtc`/`ConfirmedBy` |
| Superseded chain | ไล่ `SupersededBy` ทั้งสาย (§4.3) |
| Charges | `FPI_RateCharge.*` (SeqNo, ChargeName, Category, Basis, ContainerType, WeightBreakKg, Amount, CurrencyCode) |

---

## Actions → เขียนกลับ

| ปุ่ม | เขียน (Cutover จริง) | mockup (localStorage) |
|---|---|---|
| **Confirm Rate** | `Status='CONFIRMED'`, `ConfirmedBy=@user`, `ConfirmedAtUtc=SYSUTCDATETIME()` (CHECK บังคับทั้งคู่ non-null) | override `{status, confirmedBy, confirmedAtUtc}` |
| **Cancel** | `Status='CANCELLED'` | override `{status}` |

> DDL CHECK `CK_FPI_RH_Confirm`: `Status <> 'CONFIRMED' OR (ConfirmedBy IS NOT NULL AND ConfirmedAtUtc IS NOT NULL)` — Confirm จึงต้องเซ็ตทั้งคู่

---

## Quirks

- **as-of** เป็นตัวขับ Alert/Active ทั้งหมด — DDL ใช้ `GETDATE()`; mockup เปิดให้เลื่อนวันเพื่อดู alert เปลี่ยน (ตั้งต้น 2026-07-13)
- Confirm rate ที่ validity ผ่านไปแล้ว (เช่น R-0008 พ.ค.) → กลายเป็น **EXPIRED ทันที** (พฤติกรรมถูกต้อง — CONFIRMED + ValidTo < today)
- Compare เทียบ freight เป็น THB โดยสมมติ `USD×36.5` เพื่อ **จัดอันดับเท่านั้น** — ราคาจริงใช้ FX ณ วันจอง (Booking)
- `CarrierNo` เป็น key จริง แต่ UI แสดง/กรองด้วย `CarrierName` (mockup ไม่มีตาราง carrier master แยก)
