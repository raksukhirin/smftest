# frmFPIQuoteGen — Field Mapping

UI field ↔ DB column. ตารางเดิม (`AFQHEAD`/`AFQDETAIL`) ไม่แก้ — FPI เพิ่มชั้น traceability ทับ
Schema: [`../FPI_DDL_v1.0.sql`](../FPI_DDL_v1.0.sql) · Design: [`../FPI_Design_v0.3_Freeze_Candidate.md`](../FPI_Design_v0.3_Freeze_Candidate.md) §4.1

> JSON ใน mockup ใช้ **camelCase 1:1 กับชื่อคอลัมน์ใน DDL** (ต่างจาก module `frmSF*` ที่ใช้ PascalCase
> ของตาราง VB6 เดิม) — ตั้งใจให้สลับ JSON → SQL ได้โดยไม่ต้อง rename

---

## ตารางที่เกี่ยวข้อง

| ตาราง | บทบาทในหน้าจอนี้ | อ่าน/เขียน |
|---|---|---|
| `FPI_RateHeader` | candidate rate ต่อ lane | R |
| `FPI_RateCharge` | บรรทัด charge ของ rate (ทุน) | R |
| `FPI_LocalChargeTariff` | ทุน + `StdSellAmount` ของ local charge | R |
| `FPI_ChargePolicy` | `PricingMode` / `IsRebate` ต่อ charge | R |
| `FPI_MarginRule` | `SuggestMarkupPct` (ใช้จริง), `MinMarginPct`/`MinProfitTHB` (แสดงประกอบ) | R |
| `FPI_CustomerProfile` | Tier → resolve MarginRule, `MarginOverridePct` | R |
| `vFPI_LaneHistory` | Tier 2 ราคาอ้างอิง (D11) | R |
| `AFQHEAD` | หัวใบเสนอราคา | **W** (on save) |
| `AFQDETAIL` | บรรทัดใบเสนอราคา (ราคาขาย) | **W** (on save) |
| `FPI_QuoteRateRef` | โยงบรรทัด → `RateChargeId`/`TariffId` + cost snapshot + `ManualReason` | **W** (on save) |

หน้าจอนี้ **ไม่เขียน** `SFBOOK*` และไม่แตะ `SF_BOOK_PROFIT2` — Margin ที่แสดงเป็น *ประมาณการ* (D1)

---

## Panel 1 · Shipment

| UI | ที่มา / ปลายทาง | หมายเหตุ |
|---|---|---|
| Customer | `FPI_CustomerProfile.CustomerNo` → `AFQHEAD.CUSTNO` | chip แสดง `Tier`, `Industry`, `CreditTermDays`, `SpecialRequirement` |
| (chip เกณฑ์) | resolve `FPI_MarginRule` | priority น้อยสุดชนะ; `CustomerProfile.MarginOverridePct` ทับ `MinMarginPct` |
| As-of date | *ไม่เก็บ* — ตัวกรอง validity ของ rate | default = `AFQHEAD.DOCDATE` |
| Incoterm | `AFQHEAD.INCOTERM` | |
| Mode / Class / Service | filter `FPI_RateHeader.Mode/JobClass/ServiceType` | ไม่ได้เก็บบนหัวใบ (อยู่ที่ rate) |
| POL | `FPI_RateHeader.POL` | |
| POD (N แถว) | 1 POD = 1 `AFQDETAIL` option group (D2) | `optionNo` เรียงตามลำดับแถว |
| Container mix | *ไม่เก็บบน quote* — ใช้ resolve `Qty` ต่อ `Basis` | `PER_CNTR` + `ContainerType` |
| Gross kg / CBM | ใช้คำนวณ `ChargeableWeight = max(gross, cbm × 10⁶ / 6000)` | AIR เท่านั้น |
| Quote valid from/to | `AFQHEAD.VALIDFROM` / `VALIDTO` | จองซ้ำได้ตลอดช่วงนี้ (D2) |
| FX → THB | `SMEXCHANGE` (ระบบจริง) | mockup แก้ได้เพื่อทดสอบ BadFx |
| แสดง Rate ที่ SUPERSEDED… | *UI only* | |

---

## Panel 2 · Lane Options

| UI | ที่มา |
|---|---|
| `#1`…`#4` (rank stripe) | คำนวณ — §5.1: Contract ลูกค้า → Contract บริษัท → Spot → Contract รายอื่น |
| ชื่อ carrier | `FPI_RateHeader.CarrierName` |
| RateNo · validity | `RateNo`, `ValidFrom`, `ValidTo` |
| ⭐ แนะนำ | คำนวณ — rank สูงสุดที่ยัง Active |
| Best / Fastest / Balanced | คำนวณจากทุน all-in + `TransitDaysMax` + `FreeTimeDest` |
| ป้าย ถูกแทนที่/หมดอายุ | `Status` + `asOf` เทียบ validity |
| ⛓ Superseded chain | เดิน `FPI_RateHeader.SupersededBy` (§4.3, ลึกสุด 10 ชั้น) |
| Δ ทุน จาก chain | `margin(successor).cost − margin(this).cost` |
| ทุน all-in / ขายแนะนำ / Margin | คำนวณจาก charge grid |
| Transit · FT | `TransitDaysMin`–`Max`, `FreeTimeDest` |

**เลือกข้ามลำดับ** (rank 4 / rate ไม่ Active / ไม่ใช่ตัวที่แนะนำ) → modal บังคับกรอกเหตุผล
→ `FPI_QuoteRateRef.ManualReason` (ระดับ option) — ขั้นต่ำ 5 ตัวอักษร

---

## Panel 3 · Charge Grid

| คอลัมน์ | ที่มา | เขียนกลับ |
|---|---|---|
| `#` | ลำดับที่สร้างขึ้น | `AFQDETAIL.SEQNO` |
| Charge | `FPI_RateCharge.ChargeName` (default = `OPITEM.EXPDESC1`) | `AFQDETAIL.DESCRIPTION` |
| *(บรรทัดที่ 2)* | `SubSysName / JobClass / ExpCode` + `ContainerType` | `AFQDETAIL.SUB_SYSNAME`, `JOBCLASS`, `EXPCODE` |
| Basis | `FPI_RateCharge.Basis` | — |
| Qty | คำนวณจาก Basis × shipment | `AFQDETAIL.QTY` |
| ทุน/หน่วย | `FPI_RateCharge.Amount` **หรือ** `FPI_LocalChargeTariff.Amount` | `FPI_QuoteRateRef.CostRefAmount` |
| Mode (pill) | `FPI_ChargePolicy.PricingMode` | — |
| ขาย/หน่วย ✎ | คำนวณ (§5.3) หรือกรอกเอง | `AFQDETAIL.UNITPRICE` |
| ขาย THB | `Qty × SellUnit × FX` | `AFQDETAIL.THBAMT` |
| ที่มา | `RateChargeId` \| `TariffId` | `FPI_QuoteRateRef.RateChargeId` \| `TariffId` |

### การเลือกที่มาของทุน

```
Category ∈ {ORIGIN, DEST, CUSTOMS, TRUCKING}
    → FPI_LocalChargeTariff  (scope แคบสุด: PortCode > CarrierNo > ServiceType > Mode)
    → ถ้าไม่มี tariff ที่ scope ตรง  ใช้ FPI_RateCharge
Category ∈ {FREIGHT, SURCHARGE, REBATE}
    → FPI_RateCharge เสมอ  (ผูกกับ carrier)
```

### Override ราคาขาย

แก้ช่อง "ขาย/หน่วย" → modal เหตุผล → `FPI_QuoteRateRef.ManualReason` (ระดับบรรทัด) + pill `●`
Override รอดจากการ recompute (เก็บใน `state.overrides[pod|rateId|lineKey]`)

### บรรทัดที่ไม่ขึ้นใบเสนอราคา

`FPI_ChargePolicy.IsRebate = 1` (`KB`, `REB`) → กล่อง "ฝั่งทุน" · `AFQDETAIL` ไม่มีบรรทัดนี้
เข้าสูตร Margin ฝั่ง `Cost` และบวกกลับที่ `KB` (D9) · `PROS` **ไม่ใช่** rebate (`IsRebate = 0`)

### Local charge เพิ่มเติม (add-on)

`FPI_LocalChargeTariff` ที่ scope ตรง, ยังไม่อยู่ในบรรทัด, และ `Qty > 0` → ติ๊กเพื่อเพิ่ม
เช่น `LT-0003` `CUS` (ทุน 1,500 / `StdSellAmount` 3,000)

---

## Sticky margin strip

```
Sold   = Σ AFQDETAIL.THBAMT                         (ไม่รวม IsRebate)
Cost   = Σ FPI_QuoteRateRef.CostRefAmount × FX      (รวม IsRebate)
KB     = Σ เฉพาะ IsRebate
Margin = Sold − Cost + KB       Margin% = Margin × 100 / (Sold + KB)
```

เป็น **ประมาณการ** — ตัวเลขที่มีผลจริงคือ `vFPI_BookProfit` ตอน Confirm Booking (D1)
`BLOCKED` เมื่อไม่มีบรรทัด หรือมีบรรทัดสกุลต่างประเทศที่ FX = 0 (BadFx) → ตัวเลขถูกขีดฆ่า

---

## Save flow (เมื่อต่อ backend จริง)

```
BEGIN TRAN
  1. AFQHEAD           INSERT (DocNo จาก sequence, RevNo = 0, DocStat = 'Open')
  2. AFQDETAIL         INSERT ทุกบรรทัดที่ !IsRebate  (1 option = 1 กลุ่ม)
  3. FPI_QuoteRateRef  INSERT 1:1 กับ AFQDETAIL.DETID
                       - RefKind = 'CHARGE' | 'FREIGHT'
                       - RateChargeId | TariffId (อย่างใดอย่างหนึ่ง)
                       - CostRefAmount / CostRefCurrency / CostRefFxToTHB  ← snapshot
                       - ManualReason  (NOT NULL เมื่อ override หรือข้ามลำดับ)
COMMIT
```

`QG.print.toQuotationJson()` คืน payload รูปนี้แล้ว — กดปุ่ม **⬇ Export JSON** เพื่อดู

**Optimistic lock:** ใช้ `AFQHEAD.ROWVER` (ระบบเดิม) — mockup ยังไม่ implement

---

## Quirks

- `AFQHEAD` **ไม่มี** `RevNo` ในระบบเดิม — FPI เก็บเองที่ `FPI_BookingRateRef.QuoteRevNo` ณ วันจอง (D10)
- `REFQTNO` บน `SFBOOK` เก็บแค่เลขใบ ไม่มี revision → ต้องอ่านคู่กับ `FPI_BookingRateRef`
- `AFQDETAIL.QTY` ในระบบเดิมบางใบเป็น 1 เสมอ แล้วคูณจำนวนตู้ที่ `UNITPRICE` — FPI แยก `Qty` × `UnitPrice` ตาม `Basis` ให้ถูกต้อง
- ชื่อคอลัมน์ `THBAMT` เป็นยอด **หลังคูณ FX** แล้ว (ไม่ใช่ยอดสกุลต้นทาง) — ตรงกับ `OPTRANSDETAIL.THBAMT`
