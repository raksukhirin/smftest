# frmFPIKnowledgeSearch — Field Mapping

หน้านี้เป็น **read-only search** เหนือข้อมูลเดียวกับหน้าอื่น — ดู mapping หลักที่แต่ละหน้า
เอกสารนี้ระบุว่าแต่ละ **intent** ดึงจาก object ใด และ **citation** มาจาก field ไหน

Schema: [`../FPI_DDL_v1.0.sql`](../FPI_DDL_v1.0.sql) · Design §5.4 (Historical Intelligence) / §8

---

## Intent → data source → citation

| Intent | อ่านจาก | Citation (field) |
|---|---|---|
| `rate_availability` / `compare` / `rate_lookup` | `FPI_RateHeader` + `FPI_RateCharge` | `RateNo` · `ValidFrom→ValidTo` · `RateSource`/`SourceRef` |
| `expiry` | `vFPI_RateAlert` | `RateNo` · `ValidTo` · `AlertType` |
| `margin_reco` | `FPI_MarginRule` + `FPI_CustomerProfile` | `RuleId`/`RuleName` · `CustomerNo`/`Tier` |
| `history` | `vFPI_LaneHistory` (Tier 2) | `JobNo` · `RefDate` · `Reliability` (POSTED/JOB_ENTRY/...) |
| `at_risk` (D2) | `AFQHEAD`/`FPI_QuoteRateRef` + `FPI_RateHeader.SupersededBy` | `DocNo` · `RateNo` · `Status` |
| `booking_lookup` | `SFBOOK` + `vFPI_BookProfit` + `FPI_EvaluateBookingMargin` | `DocNo` · `DocDate` · `RefQtNo` |
| `quote_lookup` | `AFQHEAD` + `AFQDETAIL` | `DocNo` · `ValidTo` |

---

## Tier (Source Hierarchy §5.4 / D11)

```
TIER1  Rate KB (FPI_RateHeader/Charge), MarginRule, Booking/Quote จริง — authoritative
TIER2  vFPI_LaneHistory — Indicative เท่านั้น
       ห้าม Auto-fill เป็น Cost ยืนยัน · UI ติดป้าย ⚠ + reliability + วันที่เสมอ
```

ทุกคำตอบต้องมี `citations[]` (ถ้าไม่มี = intent `unknown` หรือ "ไม่พบข้อมูล")

---

## Entity extraction

| Entity | map เป็น |
|---|---|
| ชื่อเมือง/รหัสท่า | Port code (Laem Chabang→THLCH, Hamburg→DEHAM, Singapore→SGSIN, ...) |
| ชื่อ carrier | `CarrierNo` (Hapag→HLC001, ONE→ONE001, Maersk→MSK001, ...) |
| ชื่อลูกค้า | `CustomerNo` (Alpha→C-ALPHA, Bravo→C-BRAVO, ...) |
| เลขเอกสาร | regex `FR-\d{4}-\d{5}` / `QSE\d+` / `BSE\d+` / `R-\d{4}` |
| mode/service | AIR/SEA · FCL/LCL |

---

## จุดต่อ backend จริง (Cutover)

```
KB.engine.query(q, asOf)   ← swap เป็น:
  1. LLM เข้าใจคำถาม → เลือก tool
  2. tool = mcp__smfdb__execute-readonly-sql (query FPI_* / vFPI_*)
  3. LLM เรียบเรียงคำตอบ + แนบ citations[] (RateNo/DocNo/วันที่) จากผล query
  4. คืน shape เดิม { title, html, citations, tier, followups } → UI ไม่แก้
```

`as-of` ส่งเข้า handler เพื่อคุม expiry/active/at-risk (เทียบเท่า `GETDATE()` ใน view)

---

## Quirks

- Rule matcher เป็น **single-intent** — คำถาม multi-hop ("ลูกค้านี้ lane ไหนกำไรดีสุด") ยังไม่รองรับ (รอ LLM)
- Entity match แบบ substring — ไม่มี fuzzy/สะกดผิด
- Tier-2 history ตัด outlier (qty>5000 หรือ |amt|>1e6) และบรรทัดไม่มี Port ออก แล้ว**บอกว่าตัดกี่บรรทัด** (ตรงกับ QuoteGen)
- คำตอบ margin ใช้ `BG.state.marginRule` โดยสังเคราะห์ booking-like `{jobClass:'EX', shipper: custNo}` เพื่อ resolve rule
