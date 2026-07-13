# FPI — Freight Pricing Intelligence / Freight Sale Knowledge Base
## เอกสารออกแบบระบบ v0.3 — Schema Freeze Candidate

วันที่จัดทำ: 6 กรกฎาคม 2026
สถานะ: Freeze Candidate — รอลงนามยืนยันครั้งสุดท้าย
แทนที่: v0.2
ฐานข้อมูลเป้าหมาย: SQL Server (smfdb)

---

## 0. ประวัติการตัดสินใจ (Decision Log)

| # | ประเด็น | ข้อสรุป | ที่มา |
|---|---|---|---|
| D1 | จุดเคาะ Margin | ตอน Confirm Booking ไม่ใช่ตอนเสนอราคา | ผู้ใช้ยืนยัน + โค้ด frmSFBooking |
| D2 | Quotation หลาย Port | 1 ใบ : N Lane/Option และจองซ้ำได้หลาย Shipment ตลอด Validity | ผู้ใช้ยืนยัน + ข้อมูล REFQTNO |
| D3 | สูตร Margin | ใช้สูตรเดิมที่พิสูจน์แล้ว (FX Fallback + KB) เกณฑ์ย้ายเป็น Config | Reverse-engineer SF_BOOK_PROFIT2 |
| D4 | มิติ Charge | Mapping กับ `OPITEM` (ไม่ใช่ SMITEM ตรง ๆ) — ได้ GL ผ่าน Chain OPITEM→SMITEM | ผู้ใช้เสนอ + ศึกษาโครงสร้างแล้ว |
| D5 | ขอบเขต Markup | PricingMode 3 แบบต่อ Charge (MARKUP / STD_SELL / PASS), `ITEMTYPE='ADV'` = PASS เสมอ | Default ที่เสนอ (ปรับได้ใน Config) |
| D6 | Contract vs Spot | Contract ของลูกค้าเป็นค่าตั้งต้น, Spot แสดงเทียบ, Override ต้องมีเหตุผล | Default ที่เสนอ (ปรับได้) |
| D7 | Air Weight Break | เปิด Take-lower ทั้งทุนและราคาขายแนะนำ (ระบบเดิมไม่ทำ — พิสูจน์จาก SeekIATARate) | Default ที่เสนอ (Flag ต่อ Rate) |
| D8 | เตือนต้นทุนเปลี่ยน | ≥ 3% หรือ ≥ 2,000 THB อย่างใดถึงก่อน (เตือนเชิงข้อมูล ไม่ใช่ Gate) | Default ที่เสนอ (Parameter) |
| D9 | Rebate | `KB`, `REB` = Rebate ฝั่งจ่าย (IsRebate=1 บวกกลับเข้าฐาน) / `PROS` = Profit Share สองทิศทาง ไม่ใช่ Rebate ให้ TRANSTYPE จัดการ | ผู้ใช้ยืนยัน |
| D10 | Quotation Revision | Booking Ref เก็บ `QuoteRevNo` ณ วันจองฝั่ง FPI เอง (REFQTNO เดิมไม่มี RevNo) | วิเคราะห์ Schema |
| D11 | Historical Intelligence | แหล่งหลัก = `OPTRANSDETAIL` (Sell/Cost จริงระดับ Job, THB สำเร็จรูป) ยกระดับเป็น `POSTED` เมื่ออ้าง AR/AP ที่ Post แล้ว — Indicative เท่านั้น ห้าม Auto-fill เป็น Cost ยืนยัน; ตัด `SALE*` (คอมมิชชั่น, Feature ปิด) และ `PL*` (Agent View) ออก | ผู้ใช้เสนอ + พิสูจน์จาก frmSFJob.frm |

---

## 1. สถาปัตยกรรมภาพรวม

```text
[Rate KB]  FPI_RateHeader / FPI_RateCharge / FPI_LocalChargeTariff / FPI_ChargePolicy
    │       Master เดิม: OPITEM(+OPITEMSUB), SMITEM, OPPORT, SMBUSINESS, SMEXCHANGE
    │
    │  [History]  ◄── vFPI_LaneHistory (D11)
    │   ประวัติจริง: SFBOOK/SFBOOKDETAIL (Bill/Cost ที่เคยตกลง),
    │   ARINVHEAD/ARINVDETAIL (ขายจริงที่วางบิล), APSUBTRANS (จ่ายจริง),
    │   AFQDETAIL/SFQRATE (ประวัติการเสนอ), Legacy Rate Import
    │
    ▼  Sales ค้นหา + AI แนะนำ Good/Better/Best (Contract ก่อน Spot + อ้างอิงประวัติ)
[Quotation]  AFQHEAD + AFQDETAIL + SFQRATE/AFQRATE  (ของเดิม)
    │        1 ใบ : หลาย Port/Option — เก็บเฉพาะราคาขาย + FPI_QuoteRateRef
    │        ไม่มี Margin Gate (แสดง Margin ประมาณการให้เห็นเท่านั้น)
    │
    ▼  ลูกค้า Approve → จองได้หลาย Shipment ตลอด Validity
[Booking]   SFBOOK + SFBOOKDETAIL  (ของเดิม)
    │        Bill ← จาก Quote (REFQTNO/REFQTDETID เดิม)
    │        Cost ← FPI Auto-fill จาก Rate KB ราคา ณ วันจอง (FPI_BookingRateRef)
    │        เตือนเมื่อทุนเปลี่ยนจากวันเสนอ ≥ 3% หรือ 2,000 THB
    │
    ▼  Confirm
[Margin Gate]  FPI_EvaluateBookingMargin → MARGINPCN / ISPROAPP / Wait → Approve
    ▼
[Job / Invoice]  ไหลตาม GL ผ่าน OPITEM → SMITEM ตามเดิม
```

---

## 2. มิติ Charge: OPITEM เป็นแกนกลาง (D4)

ผลการศึกษา `OPITEM` (498 รายการ, คีย์ธรรมชาติ `SUB_SYSNAME + JOBCLASS + EXPCODE`):

- รหัสทั้งหมดที่ใช้จริงในเอกสาร (`THC2`, `BLFEE`, `FRT`, `SEAL`, `KB`, `REB`, `PROS`...) อยู่ครบ
- `ITEMCODE` ชี้ `SMITEM` → GL/บัญชีเชื่อมอยู่แล้ว FPI ไม่ต้องทำเอง
- `UNIT`, `SRCCURR` = Default หน่วย/สกุลเงิน; VAT/WHT แยกฝั่งขาย (`VATRATE`,`WTRATE`) และฝั่งทุน (`VATRATE2`,`WTRATE2`)
- `ITEMTYPE`: `CHG` = ค่าบริการ / `ADV` = เงินทดรองจ่าย (เช่น `DUTY`, `INPR`) → PASS เสมอ
- `TEMPLATE`/`TEMPLATE2` = ธง Auto-add ลงกริด Bill/Cost — FPI จะเคารพธงนี้ตอนเปิดเอกสาร
- `OPITEMSUB` = ชั้นราคาเฉพาะลูกค้า (`XCUSTCODE`, `XPRICE` ขาย, `XPRICE2` ทุน, Scope Mode/Service) — ฟื้นใช้เป็น Customer Override Layer

ทุกตาราง FPI ที่อ้าง Charge จะใช้สามคอลัมน์ `(SubSysName, JobClass, ExpCode)` และบังคับผ่าน FK ไปยัง `FPI_ChargePolicy` (ตารางที่เราควบคุมเอง ไม่แตะตาราง Vendor) เพื่อรับประกันว่า Charge ทุกตัวที่ใช้มีนโยบายราคากำกับเสมอ

### 2.1 FPI_ChargePolicy — นโยบายราคาต่อ Charge (D5, D9)

```sql
CREATE TABLE dbo.FPI_ChargePolicy (
    SubSysName   VARCHAR(2)  NOT NULL,      -- SF / AF / CS / TS (ตาม OPITEM)
    JobClass     VARCHAR(2)  NOT NULL,      -- EX / IM
    ExpCode      VARCHAR(20) NOT NULL,      -- OPITEM.EXPCODE
    PricingMode  VARCHAR(10) NOT NULL
                 CONSTRAINT CK_FPI_CPY_Mode CHECK (PricingMode IN ('MARKUP','STD_SELL','PASS')),
    IsRebate     BIT NOT NULL CONSTRAINT DF_FPI_CPY_Reb DEFAULT 0,
                 -- 1 = Rebate ฝั่งจ่าย (KB, REB): สูตร Margin บวกกลับเข้าฐาน Gross Selling
                 -- PROS ไม่ใช่ Rebate (D9) — เดินตาม TRANSTYPE ปกติ
    Note         NVARCHAR(300) NULL,
    UpdatedBy    VARCHAR(20) NULL,
    UpdatedAtUtc DATETIME2(0) NULL,
    CONSTRAINT PK_FPI_ChargePolicy PRIMARY KEY (SubSysName, JobClass, ExpCode)
);
```

Seed อัตโนมัติครั้งแรกจาก OPITEM (ทีม Pricing ทบทวนรายตัวภายหลังได้):

```sql
INSERT INTO dbo.FPI_ChargePolicy (SubSysName, JobClass, ExpCode, PricingMode, IsRebate, Note, UpdatedBy)
SELECT o.SUB_SYSNAME, o.JOBCLASS, o.EXPCODE,
    CASE WHEN o.ITEMTYPE = 'ADV' THEN 'PASS'                    -- เงินทดรองจ่าย ห้าม Markup
         WHEN s.DISTCODE LIKE '%FRT%' THEN 'MARKUP'             -- กลุ่ม Freight
         ELSE 'STD_SELL' END,
    CASE WHEN o.EXPCODE IN ('KB','REB') THEN 1 ELSE 0 END,      -- D9
    N'Seed อัตโนมัติจาก OPITEM/SMITEM', 'FPI_SETUP'
FROM dbo.OPITEM o
LEFT JOIN dbo.SMITEM s ON s.ITEMCODE = o.ITEMCODE;
```

---

## 3. Rate Knowledge Base

### 3.1 FPI_RateHeader

DDL ตาม v0.1/v0.2 ทุกประการ (Validity CHECK ≤ 2 ปี กันข้อมูลขยะ, Status DRAFT→CONFIRMED→EXPIRED/SUPERSEDED, RateSource + SourceRef, `SupersededBy` Chain, `CustomerNo` สำหรับ Contract เฉพาะราย) และเพิ่ม 1 คอลัมน์ตาม D7:

```sql
    TakeLowerEnabled BIT NOT NULL CONSTRAINT DF_FPI_RH_TL DEFAULT 1,
    -- Air: ใช้กติกา Take-lower ในการคำนวณ (ปิดได้สำหรับ Contract แบบ Flat/All-in)
```

### 3.2 FPI_RateCharge — เปลี่ยนมิติ Charge เป็น OPITEM

```sql
CREATE TABLE dbo.FPI_RateCharge (
    RateChargeId    UNIQUEIDENTIFIER NOT NULL
                    CONSTRAINT DF_FPI_RC_Id DEFAULT NEWSEQUENTIALID()
                    CONSTRAINT PK_FPI_RateCharge PRIMARY KEY,
    RateId          UNIQUEIDENTIFIER NOT NULL
                    CONSTRAINT FK_FPI_RC_Rate REFERENCES dbo.FPI_RateHeader(RateId),
    SeqNo           INT NOT NULL,

    SubSysName      VARCHAR(2)  NOT NULL,   -- ┐
    JobClass        VARCHAR(2)  NOT NULL,   -- ├ อ้าง OPITEM ผ่าน FPI_ChargePolicy (D4)
    ExpCode         VARCHAR(20) NOT NULL,   -- ┘
    ChargeName      NVARCHAR(200) NOT NULL, -- ชื่อบนเอกสาร (Default = OPITEM.EXPDESC1)
    Category        VARCHAR(12) NOT NULL
                    CONSTRAINT CK_FPI_RC_Cat CHECK
                    (Category IN ('FREIGHT','SURCHARGE','ORIGIN','DEST',
                                  'CUSTOMS','TRUCKING','REBATE','OTHER')),

    Basis           VARCHAR(15) NOT NULL
                    CONSTRAINT CK_FPI_RC_Basis CHECK
                    (Basis IN ('PER_CNTR','PER_KG','PER_CBM','PER_WM','PER_SHPT',
                               'PER_BL','PER_SET','PCT_OF_FREIGHT')),
    ContainerType   VARCHAR(10) NULL,       -- 20GP/40GP/40HQ/45G1/RF20/RF40/OT/FR
    WeightBreakKg   DECIMAL(10,2) NULL,     -- Air: 0 = MIN(เหมา), 45, 100, 300, 500, 1000...

    CurrencyCode    VARCHAR(3)  NOT NULL,
    Amount          DECIMAL(18,4) NOT NULL CONSTRAINT CK_FPI_RC_Amt CHECK (Amount >= 0),
    MinAmount       DECIMAL(18,4) NULL,
    PayCollect      CHAR(2) NOT NULL CONSTRAINT DF_FPI_RC_PC DEFAULT 'PP'
                    CONSTRAINT CK_FPI_RC_PC CHECK (PayCollect IN ('PP','CC')),
    IsMandatory     BIT NOT NULL CONSTRAINT DF_FPI_RC_Mand DEFAULT 1,
    Remark          NVARCHAR(300) NULL,     -- ข้อความอิสระอยู่ที่นี่เท่านั้น

    CONSTRAINT UQ_FPI_RC UNIQUE (RateId, SeqNo),
    CONSTRAINT FK_FPI_RC_Policy FOREIGN KEY (SubSysName, JobClass, ExpCode)
        REFERENCES dbo.FPI_ChargePolicy (SubSysName, JobClass, ExpCode)
);
CREATE INDEX IX_FPI_RC_Rate   ON dbo.FPI_RateCharge (RateId) INCLUDE (Category, ContainerType);
CREATE INDEX IX_FPI_RC_Charge ON dbo.FPI_RateCharge (SubSysName, JobClass, ExpCode);
```

### 3.3 FPI_LocalChargeTariff

ตาม v0.1 แต่เปลี่ยนมิติ Charge เป็น `(SubSysName, JobClass, ExpCode)` + FK ไป `FPI_ChargePolicy` เช่นเดียวกับ 3.2 และเพิ่มคอลัมน์ราคาขายมาตรฐานสำหรับโหมด STD_SELL:

```sql
    StdSellAmount   DECIMAL(18,4) NULL,   -- ราคาขายมาตรฐาน (PricingMode = STD_SELL)
                                          -- NULL = ใช้ Amount (ทุน) ตาม PricingMode
```

**ลำดับการหาราคาขายของ Local Charge (D5):**

```text
1. OPITEMSUB ของลูกค้า (XCUSTCODE + Scope ตรง)  → ขาย = XPRICE, ทุนอ้างอิง = XPRICE2
2. FPI_LocalChargeTariff.StdSellAmount            → ขายมาตรฐานกลาง
3. ตาม PricingMode: MARKUP → ทุน × (1+%) / PASS → ทุน
```

### 3.4 FPI_CustomerProfile และ FPI_MarginRule

DDL ตาม v0.2 (MarginRule มี `SuggestMarkupPct`, `MinMarginPct`, `MinProfitTHB`, `TolerancePP`, `FailOpenIfNoData`, Scope ครบมิติ, Priority Resolution) — ไม่เปลี่ยน

---

## 4. Traceability: Quote และ Booking

### 4.1 FPI_QuoteRateRef

ตาม v0.2 (RefKind CHARGE/FREIGHT, อ้าง `AFQDETAIL.DETID` และ `SFQRATE/AFQRATE.PMKEY`, Cost อ้างอิง Snapshot สำหรับแสดง Margin ประมาณการ, ManualReason บังคับเมื่อกรอกมือ) — รองรับหลาย Port ต่อใบโดยธรรมชาติ

### 4.2 FPI_BookingRateRef — เพิ่ม QuoteRevNo (D10)

ตาม v0.2 และเพิ่ม:

```sql
    QuoteDocNo      VARCHAR(20) NULL,    -- Snapshot จาก SFBOOK.REFQTNO ณ วันจอง
    QuoteRevNo      INT NULL,            -- AFQHEAD.REVNO ณ วันจอง (ระบบเดิมไม่เก็บ)
```

### 4.3 การเดิน Superseded Chain ตอน Auto-fill (D2)

เพราะ Quotation จองซ้ำได้ตลอด Validity ขณะที่ Carrier Rate อายุสั้นกว่า:

```text
1. อ่าน FPI_QuoteRateRef → RateChargeId → RateHeader
2. ถ้า Status = 'CONFIRMED' และวันนี้อยู่ใน Validity → ใช้เลย
3. ถ้า SUPERSEDED/EXPIRED → เดิน SupersededBy จนเจอตัว CONFIRMED ที่ Valid
   (จำกัดความลึก 10 ชั้น กัน Loop; Lane+Carrier+ServiceType ต้องตรงเดิม)
4. เดินแล้วไม่เจอ → บรรทัดนั้นสถานะ "Cost ไม่ยืนยัน" → Confirm Booking ไม่ได้ (BLOCKED)
   Sales/Pricing ต้องเลือก Rate ใหม่หรือกรอกมือพร้อมเหตุผล
5. คำนวณ QuoteDeltaTHB เทียบทุนวันเสนอ → เตือนเมื่อ |Δ| ≥ 3% หรือ ≥ 2,000 THB (D8)
```

---

## 5. Pricing Engine

### 5.1 การเลือก Rate (D6)

```text
เมื่อ Lane + ServiceType + วันที่ตรงกัน หลาย Rate:
  อันดับ 1  CONTRACT ที่ CustomerNo = ลูกค้ารายนี้
  อันดับ 2  CONTRACT ของบริษัท (CustomerNo IS NULL)
  อันดับ 3  CARRIER_QUOTE / SPOT เรียงทุนต่ำสุด
แสดงทางเลือกอื่นพร้อมส่วนต่างเสมอ — เลือกข้ามอันดับได้ แต่บันทึก ManualReason
```

### 5.2 Air Take-lower (D7)

```text
ให้ W = Chargeable Weight = max(Gross, Volumetric)
ราคาปกติ   = W × Rate(Break ที่ W ตกอยู่)        เทียบกับ MIN (เหมาขั้นต่ำ)
Take-lower = min เพิ่มเติมกับ  B.From × Rate(B)  สำหรับทุก Break B ที่ B.From > W
ใช้ราคาที่ต่ำสุด ทั้งฝั่งทุนและราคาขายแนะนำ เมื่อ RateHeader.TakeLowerEnabled = 1
ตัวอย่าง: W = 480 kg → เทียบ 480×Rate(+300) กับ 500×Rate(+500) เลือกต่ำกว่า
```

### 5.3 ราคาขายแนะนำต่อบรรทัด (D5)

```text
ตาม FPI_ChargePolicy.PricingMode:
  MARKUP   → ทุน × (1 + SuggestMarkupPct จาก MarginRule ของลูกค้า)
  STD_SELL → OPITEMSUB ลูกค้า → StdSellAmount กลาง → Fallback = ทุน
  PASS     → ทุน
Sales ปรับแก้ได้อิสระ — Gate จริงอยู่ที่ Booking (D1)
```

### 5.4 Historical Intelligence — ประวัติจริงประกอบการแนะนำ (D11)

ลำดับความน่าเชื่อถือของแหล่งข้อมูล (Source Hierarchy):

```text
Tier 1  AUTHORITATIVE — Rate KB (CONFIRMED + อยู่ใน Validity)
        ใช้ Auto-fill Cost ใน Booking ได้ / เป็นฐานราคาขายแนะนำ
Tier 2  INDICATIVE — ประวัติจริง (vFPI_LaneHistory)
        2a POSTED    : OPTRANSDETAIL ที่อ้าง AR/AP Post บัญชีแล้ว (ตัด POSTENTRY=3)
        2b JOB_ENTRY : OPTRANSDETAIL ระดับ Job (THBAMT สำเร็จรูป × DOCBAL หัก CN ในตัว)
        2c BOOKING   : Bill/Cost จาก Booking ที่ Confirm แล้ว (ตกลงแล้ว ยังไม่เกิดจริง)
        2d QUOTE     : ราคาที่เคยเสนอ (AFQDETAIL/SFQRATE)
        ใช้ "ประกอบการแนะนำ" — แสดงชั้นความเชื่อถือ วันที่ จำนวนครั้ง และแหล่งเสมอ
Tier 3  TREND — Legacy Rate Import (SFRATE/AFRATED เดิม)
        ใช้ดูแนวโน้มระยะยาวเท่านั้น
```

View กลางสำหรับค้นประวัติ (แหล่งหลัก = OPTRANSDETAIL ระดับ Job — พิสูจน์ความหมาย Field จาก frmSFJob.frm แล้ว):

```sql
CREATE VIEW dbo.vFPI_LaneHistory AS
SELECT
    CASE WHEN t.TRANSTYPE = 'Bill' THEN 'JOB_SELL' ELSE 'JOB_COST' END AS SourceKind,
    CASE WHEN i.DETID IS NOT NULL THEN 'POSTED' ELSE 'JOB_ENTRY' END  AS Reliability,
    t.JOBNO, t.HBLREF, t.REFBOOK AS BookDocNo, j.ETD AS RefDate,
    j.LOADPORT, j.DISPORT, j.FINALPORT, j.LINERNO, j.LINERNAME, j.AGENTNO,
    t.SUB_SYSNAME, t.JOBCLASS, t.EXPCODE, t.PCTYPE,
    t.QTY, t.UNITPRICE, t.ITEMCURR,
    COALESCE(
        -- 2a ยอด Post บัญชีแล้ว: เครื่องหมายตาม SrcType (ตรรกะเดียวกับหน้าสรุปกำไรของ Job)
        i.THBAMT * CASE WHEN t.TRANSTYPE = 'Bill'
                        THEN CASE WHEN h.SRCTYPE = 'AR' THEN 1 ELSE -1 END
                        ELSE CASE WHEN h.SRCTYPE = 'AP' THEN 1 ELSE -1 END END,
        -- 2b ยอดระดับ Job: THBAMT แปลงบาทสำเร็จรูป × DOCBAL (CN = -1 หักใบลดหนี้ในตัว)
        t.THBAMT * ISNULL(NULLIF(t.DOCBAL, 0), 1)
    ) AS AmtTHB
FROM dbo.OPTRANSDETAIL t
LEFT JOIN dbo.ARINVDETAIL i ON i.DETID = t.REFINVDETID
LEFT JOIN dbo.ARINVHEAD  h ON h.INVNO = i.INVNO
LEFT JOIN dbo.SFJOB      j ON j.JOBNO = t.JOBNO
WHERE (h.POSTENTRY IS NULL OR h.POSTENTRY <> 3);   -- ตัดใบที่ยกเลิกการ Post
-- DDL ฉบับรัน: UNION หัว Job ฝั่ง CS/AF (CSJOB/AFJOB) แบบเดียวกัน
-- และ UNION ชั้น 2c (Booking Confirm แล้ว) / 2d (ประวัติ Quotation) ตาม Hierarchy
```

Field ที่จงใจตัดออก (พิสูจน์จาก frmSFJob.frm):

- `SALEPRICE`/`SALERATE`/`SALEAMT`/`SALEADJ` — ระบบค่าคอมมิชชั่น Sales เปิดเฉพาะ License ที่มี Feature `COM` (ระบบนี้ปิด ค่าเป็น 0 ทั้งหมด)
- `PLRATE`/`PLAMT` — ตัวเลขมุมมอง "Agent View" สำหรับแบ่ง Handling/Incentive/Profit Share (ExpCode `HAN`/`INC`/`PRO`) — ไม่ใช่ราคาฐานของ Charge
- โซ่ Traceability ในระบบเดิมใช้งานจริง: ฟอร์ม Job เอง Query `OPTRANSDETAIL → SFBOOKDETAIL → SFQRATE/AFQDETAIL` และ Sync ยอดจาก Job กลับ Booking ผ่าน `REFBOOKDETID` — vFPI_LaneHistory จึงเทียบ "เสนอ → จอง → เกิดจริง" ต่อบรรทัดได้ทันที

การใช้งานใน Pricing Engine / AI:

1. **ไม่มี Rate Active ใน Lane ที่ขอ** → แสดง "ราคาอ้างอิงจากประวัติ" (ครั้งล่าสุด + Median 6 เดือน + จำนวนครั้ง) ให้ Sales ตัดสินใจ — ถ้าใช้ = Manual + เหตุผล ธง "อิงประวัติ" ติดไปถึง Booking
2. **Sanity Check ตอน Auto-fill** → ถ้า Cost จาก Rate KB ต่างจากที่จ่ายจริงล่าสุด (AP/Booking) ของ Lane เดียวกันเกิน Delta Alert (D8) → เตือนว่า Rate ในระบบอาจไม่ตรงความจริง
3. **แนะนำราคาขาย** → อ้างราคาที่ลูกค้ารายนี้เคยยอมรับ (Booking Bill ล่าสุดของ Lane นั้น) ประกอบกับ SuggestMarkupPct
4. **Benchmark Carrier** → เปรียบเทียบจ่ายจริงย้อนหลังต่อ Carrier ใน Lane เดียวกัน สำหรับ Good/Better/Best

Guardrail สำคัญ: Tier 2 ไม่มีวันถูกใช้ Auto-fill เป็น Cost ยืนยันโดยอัตโนมัติ และทุกการแนะนำที่อิงประวัติต้องแสดงแหล่ง + วันที่กำกับเสมอ (Traceability เดียวกับ Rate)

---

## 6. Margin Gate ที่ Booking (D1, D3, D9)

### 6.1 vFPI_BookProfit

```sql
CREATE VIEW dbo.vFPI_BookProfit AS
WITH L AS (
    SELECT d.DOCNO, d.TRANSTYPE, d.SRCAMT,
           CASE WHEN UPPER(ISNULL(d.ITEMCURR,'THB')) = 'THB' THEN 1
                WHEN ISNULL(d.ITEMRATE,0) = 1 THEN ISNULL(b.DOCRATE,1)
                ELSE ISNULL(d.ITEMRATE,0) END AS FX,
           CASE WHEN UPPER(ISNULL(d.ITEMCURR,'THB')) <> 'THB'
                 AND ISNULL(d.ITEMRATE,0) = 0 THEN 1 ELSE 0 END AS BadFxFlag,
           ISNULL(p.IsRebate,0) AS IsRebate          -- D9: ครอบ KB + REB (เดิมจับแค่ 'KB')
    FROM dbo.SFBOOKDETAIL d
    JOIN dbo.SFBOOK b ON b.DOCNO = d.DOCNO
    LEFT JOIN dbo.FPI_ChargePolicy p
           ON p.SubSysName = d.SUB_SYSNAME AND p.JobClass = d.JOBCLASS
          AND p.ExpCode = d.EXPCODE
)
SELECT DOCNO,
    SUM(CASE WHEN TRANSTYPE='Bill' THEN SRCAMT*FX ELSE 0 END)                AS RTSold,
    SUM(CASE WHEN TRANSTYPE='Cost' THEN SRCAMT*FX ELSE 0 END)                AS RTCost,
    SUM(CASE WHEN TRANSTYPE='Cost' AND IsRebate=1 THEN SRCAMT*FX ELSE 0 END) AS RTKB,
    SUM(BadFxFlag)                                                           AS BadFxLines
FROM L GROUP BY DOCNO;
```

หมายเหตุ D9: `PROS` มี IsRebate=0 → ฝั่ง Bill เข้า `RTSold` (Profit Share ที่เราได้), ฝั่ง Cost เข้า `RTCost` เต็ม (Profit Share ที่เราจ่าย กด Margin ตามจริง)

### 6.2 FPI_EvaluateBookingMargin

ตาม v0.2 ทุกประการ:

```text
Margin  = Sold − Cost + KB
Margin% = Margin × 100 / (Sold + KB)
PASS         : Margin% ≥ MinMarginPct และ Margin ≥ MinProfitTHB (Rule ที่เฉพาะเจาะจงสุด)
PASS(Tol)    : เคย Approve แล้ว และ Margin% ลดไม่เกิน TolerancePP (Default 1.00)
NEED_APPROVE : ต่ำกว่าเกณฑ์ → DOCSTAT='Wait' → Approve Profit → Credit (ลำดับเดิม)
BLOCKED      : ไม่มีบรรทัด Bill/Cost (เว้น FailOpen) หรือ BadFxLines > 0
               หรือมีบรรทัด "Cost ไม่ยืนยัน" จาก Superseded Chain (ข้อ 4.3)
```

ผล PASS → เขียน `MARGINPCN` แล้วเดิน State Machine เดิมของ `SFBOOK` (Confirm/Close, UnApprove ย้อน Wait) โดยไม่แก้พฤติกรรมที่ทีมคุ้น

---

## 7. ตัวอย่างครบวงจร

Quotation `QSE26080001` ลูกค้า Tier B — 2 ปลายทางในใบเดียว (THLCH→DEHAM ผ่าน Hapag-Lloyd Contract, THLCH→NLRTM ผ่าน ONE Spot) ราคาขายแนะนำจาก PricingMode: Freight MARKUP +12%, THC/Seal PASS, B/L Fee STD_SELL 1,500 (ทุน 1,200)

ลูกค้า Approve แล้วจองครั้งที่ 1 (ก.ค.) เส้น Hamburg 2×40HQ → Cost Auto-fill จาก `FR-2607-00001` → Margin 10.4% ≥ 10% → Confirm ทันที

จองครั้งที่ 4 (ก.ย. — Quote ยังไม่หมดอายุ) → Rate ก.ค. ถูก Supersede สองชั้น → ระบบเดินไป `FR-2609-00003` (OF ขึ้น 120 USD/ตู้) → เตือน "ทุนเปลี่ยน +7,900 THB (+5.6%)" (เกิน 3%/2,000) → Margin เหลือ 6.8% < 10% → Wait → Manager เห็นครบ: Margin ปัจจุบัน, ส่วนต่างทุนจากวันเสนอ, ต้นเหตุ (Rate ตลาดขึ้น ไม่ใช่ Sales ตั้งราคาต่ำ) → ตัดสินใจ Approve หรือสั่ง Revise Quotation ก่อนรอบถัดไป

---

## 8. หน้าจอ / Dashboard (ตาม Concept ข้อ 7)

Rate Management: Upload (Excel Template + AI Parse), Search/Compare, Confirm Rate, Expiry Alert (7 วัน / Stale Draft 30 วัน / No Source — จาก `vFPI_RateAlert`)
KB Dashboard: Rate ใกล้หมดอายุ, **Quotation Active ที่ Rate ต้นทางหมดอายุ/ถูกแทนที่ + ส่วนต่างทุนเก่า-ใหม่** (D2), Top Lane, Margin Average, Win Rate
Quotation Generator: Input Shipment → Multi-lane Option → Auto Price → PDF → Send
AI Knowledge Search: ถามภาษาธรรมชาติ ("มี Rate FCL Laem Chabang ไป Hamburg ไหม", "ลูกค้ารายนี้ควรบวก Margin เท่าไหร่", "Lane นี้เคยจ่ายจริงเท่าไหร่") — ตอบจาก Rate KB + vFPI_LaneHistory พร้อมอ้างอิง RateNo/เลขเอกสาร/วันที่เสมอ (Traceability ทั้ง Tier 1 และ Tier 2)
Approval Inbox: รายการ Wait พร้อม Sold/Cost/Margin/สาเหตุ — ต่อกับ Timeline เดิม

---

## 9. แผน Implement 4 ระยะ

1. **Foundation** — สร้างตาราง FPI + Seed ChargePolicy จาก OPITEM + Migrate SFRATE/AFRATED เป็น Legacy History (`Status='EXPIRED'`, `RateSource='LEGACY_IMPORT'`; แถวที่ Parse ไม่ได้เก็บ Log ไม่เดา)
2. **Parallel Run** — `vFPI_BookProfit` เทียบ `SF_BOOK_PROFIT2` ทุก Booking จริง จนส่วนต่าง = 0 (ยกเว้นเคส REB ที่ตั้งใจแก้ — บันทึกแยก)
3. **Cutover** — จุด Confirm/Approve เรียก `FPI_EvaluateBookingMargin`, เปิด Booking Cost Auto-fill + Superseded Chain + Delta Alert
4. **Intelligence** — AI Search, Good/Better/Best, Dashboard, Customs & Regulation KB (Concept ข้อ E — Phase แยก เป็น Knowledge Document + AI ไม่กระทบ Schema ชุดนี้)

---

## 10. สรุปค่า Configuration ตั้งต้นทั้งหมด (แก้ได้โดยไม่แตะโค้ด)

| ค่า | ตั้งต้น | ที่เก็บ |
|---|---|---|
| MinMarginPct | 10% | FPI_MarginRule (Default Rule) |
| SuggestMarkupPct | 12% | FPI_MarginRule |
| MinProfitTHB | 3,000 | FPI_MarginRule |
| TolerancePP | 1.00 จุด | FPI_MarginRule |
| FailOpenIfNoData | 0 (ปิด) | FPI_MarginRule |
| PricingMode ต่อ Charge | ADV=PASS, Freight=MARKUP, อื่น=STD_SELL | FPI_ChargePolicy |
| IsRebate | KB, REB = 1 / PROS = 0 | FPI_ChargePolicy |
| TakeLowerEnabled | 1 (เปิด) | FPI_RateHeader |
| Contract-first Selection | เปิด | Pricing Engine Config |
| Cost Delta Alert | 3% หรือ 2,000 THB | System Parameter |
| Rate Validity สูงสุด | 2 ปี (CHECK) | Schema |

---

*v0.3 Freeze Candidate — เมื่อยืนยัน จะออก DDL Script ฉบับรันจริง (ครบทุกตาราง + Seed + Index) และ Test Plan สำหรับ Parallel Run ระยะที่ 2*
