/* ============================================================================
   FPI — Freight Pricing Intelligence : DDL Script v1.0
   ----------------------------------------------------------------------------
   อ้างอิง     : เอกสารออกแบบ v0.3 (Schema Freeze — Decision D1-D11)
   วันที่       : 8 กรกฎาคม 2026
   ฐานข้อมูล   : smfdb (SQL Server)
   คุณสมบัติ   : Idempotent — รันซ้ำได้ ไม่ทำลายข้อมูลเดิม
   หมายเหตุ    : สคริปต์นี้ "สร้างอย่างเดียว" ไม่แก้/ไม่ลบตารางเดิมของระบบ
                 Rollback อยู่ในไฟล์ FPI_DDL_Rollback_v1.0.sql
   การแก้จากเอกสาร v0.3 (Implementation Note):
     - Seed กลุ่ม MARKUP ใช้ SMITEM.ITEMDESC LIKE '%FREIGHT%'
       (ไม่ใช่ DISTCODE ตามร่าง — ตรวจแล้ว DISTCODE ซ้ำกันทั้งระบบ ใช้แยกไม่ได้)
   ============================================================================ */

SET NOCOUNT ON;
GO

/* ============================================================================
   1) FPI_ChargePolicy — นโยบายราคาต่อ Charge (D4, D5, D9)
   ============================================================================ */
IF OBJECT_ID('dbo.FPI_ChargePolicy','U') IS NULL
BEGIN
    CREATE TABLE dbo.FPI_ChargePolicy (
        SubSysName   VARCHAR(2)  NOT NULL,
        JobClass     VARCHAR(2)  NOT NULL,
        ExpCode      VARCHAR(20) NOT NULL,
        PricingMode  VARCHAR(10) NOT NULL
                     CONSTRAINT CK_FPI_CPY_Mode CHECK (PricingMode IN ('MARKUP','STD_SELL','PASS')),
        IsRebate     BIT NOT NULL CONSTRAINT DF_FPI_CPY_Reb DEFAULT 0,
        Note         NVARCHAR(300) NULL,
        UpdatedBy    VARCHAR(20) NULL,
        UpdatedAtUtc DATETIME2(0) NULL,
        CONSTRAINT PK_FPI_ChargePolicy PRIMARY KEY (SubSysName, JobClass, ExpCode)
    );
END
GO

/* Seed จาก OPITEM (498 รายการ) — Dedupe ด้วย PMKEY ล่าสุด, ไม่ทับของเดิม */
INSERT INTO dbo.FPI_ChargePolicy (SubSysName, JobClass, ExpCode, PricingMode, IsRebate, Note, UpdatedBy, UpdatedAtUtc)
SELECT o.SUB_SYSNAME, o.JOBCLASS, o.EXPCODE,
       CASE WHEN o.ITEMTYPE = 'ADV' THEN 'PASS'                      -- D5: เงินทดรองจ่าย ห้าม Markup
            WHEN UPPER(ISNULL(s.ITEMDESC,'')) LIKE '%FREIGHT%' THEN 'MARKUP'
            ELSE 'STD_SELL' END,
       CASE WHEN o.EXPCODE IN ('KB','REB') THEN 1 ELSE 0 END,        -- D9: PROS ไม่ใช่ Rebate
       N'Seed อัตโนมัติจาก OPITEM/SMITEM — ทีม Pricing ทบทวนรายตัว',
       'FPI_SETUP', SYSUTCDATETIME()
FROM (
    SELECT SUB_SYSNAME, JOBCLASS, EXPCODE, ITEMTYPE, ITEMCODE,
           ROW_NUMBER() OVER (PARTITION BY SUB_SYSNAME, JOBCLASS, EXPCODE ORDER BY PMKEY DESC) AS rn
    FROM dbo.OPITEM
) o
LEFT JOIN dbo.SMITEM s ON s.ITEMCODE = o.ITEMCODE
WHERE o.rn = 1
  AND NOT EXISTS (SELECT 1 FROM dbo.FPI_ChargePolicy p
                  WHERE p.SubSysName = o.SUB_SYSNAME
                    AND p.JobClass   = o.JOBCLASS
                    AND p.ExpCode    = o.EXPCODE);
GO

/* ============================================================================
   2) FPI_CustomerProfile — โปรไฟล์ลูกค้าเชิง Pricing
   ============================================================================ */
IF OBJECT_ID('dbo.FPI_CustomerProfile','U') IS NULL
BEGIN
    CREATE TABLE dbo.FPI_CustomerProfile (
        CustomerNo          VARCHAR(20) NOT NULL
                            CONSTRAINT PK_FPI_CustomerProfile PRIMARY KEY,  -- อ้าง SMBUSINESS
        Tier                VARCHAR(10) NOT NULL
                            CONSTRAINT CK_FPI_CP_Tier CHECK (Tier IN ('A','B','C','NEW','STRATEGIC')),
        Industry            NVARCHAR(100) NULL,
        CreditTermDays      INT NULL,
        PreferredCurrency   VARCHAR(3) NULL,
        CommonIncoterms     VARCHAR(50) NULL,
        PreferredCarriers   NVARCHAR(200) NULL,
        SpecialRequirement  NVARCHAR(500) NULL,
        SalesOwner          VARCHAR(20) NULL,
        MarginOverridePct   DECIMAL(6,3) NULL,
        UpdatedBy           VARCHAR(20) NULL,
        UpdatedAtUtc        DATETIME2(0) NULL
    );
END
GO

/* ============================================================================
   3) FPI_MarginRule — กฎ Margin และเกณฑ์อนุมัติ (D3, D5)
   ============================================================================ */
IF OBJECT_ID('dbo.FPI_MarginRule','U') IS NULL
BEGIN
    CREATE TABLE dbo.FPI_MarginRule (
        RuleId              UNIQUEIDENTIFIER NOT NULL
                            CONSTRAINT DF_FPI_MR_Id DEFAULT NEWSEQUENTIALID()
                            CONSTRAINT PK_FPI_MarginRule PRIMARY KEY,
        RuleName            NVARCHAR(200) NOT NULL,
        Priority            INT NOT NULL,
        ScopeCustomerNo     VARCHAR(20) NULL,
        ScopeTier           VARCHAR(10) NULL,
        ScopeMode           VARCHAR(5)  NULL,
        ScopeJobClass       VARCHAR(2)  NULL,
        ScopeServiceType    VARCHAR(10) NULL,
        ScopePOL            VARCHAR(20) NULL,
        ScopePOD            VARCHAR(20) NULL,
        SuggestMarkupPct    DECIMAL(6,3) NULL,
        MinMarginPct        DECIMAL(6,3) NOT NULL,
        MinProfitTHB        DECIMAL(18,2) NOT NULL CONSTRAINT DF_FPI_MR_MinP DEFAULT 0,
        TolerancePP         DECIMAL(5,2) NOT NULL CONSTRAINT DF_FPI_MR_Tol DEFAULT 1.00,
        FailOpenIfNoData    BIT NOT NULL CONSTRAINT DF_FPI_MR_FO DEFAULT 0,
        ValidFrom           DATE NOT NULL,
        ValidTo             DATE NULL,
        IsActive            BIT NOT NULL CONSTRAINT DF_FPI_MR_Act DEFAULT 1,
        CreatedBy           VARCHAR(20) NOT NULL,
        CreatedAtUtc        DATETIME2(0) NOT NULL CONSTRAINT DF_FPI_MR_At DEFAULT SYSUTCDATETIME()
    );
END
GO

/* Seed: Rule Default ให้ระบบทำงานเทียบเท่าเกณฑ์เดิม (10%) ตั้งแต่วันแรก */
IF NOT EXISTS (SELECT 1 FROM dbo.FPI_MarginRule WHERE Priority = 99 AND ScopeTier IS NULL)
INSERT INTO dbo.FPI_MarginRule
    (RuleName, Priority, MinMarginPct, SuggestMarkupPct, MinProfitTHB, TolerancePP, ValidFrom, CreatedBy)
VALUES
    (N'เกณฑ์มาตรฐานบริษัท (แทน 10% เดิมใน License)', 99, 10.0, 12.0, 3000, 1.00, '2026-08-01', 'FPI_SETUP');
GO

/* ============================================================================
   4) FPI_RateHeader — หัว Rate (D6, D7)
   ============================================================================ */
IF OBJECT_ID('dbo.FPI_RateHeader','U') IS NULL
BEGIN
    CREATE TABLE dbo.FPI_RateHeader (
        RateId          UNIQUEIDENTIFIER NOT NULL
                        CONSTRAINT DF_FPI_RH_Id DEFAULT NEWSEQUENTIALID()
                        CONSTRAINT PK_FPI_RateHeader PRIMARY KEY,
        RateNo          VARCHAR(20)  NOT NULL CONSTRAINT UQ_FPI_RH_No UNIQUE,  -- FR-{YYMM}-{Run5}
        Mode            VARCHAR(5)   NOT NULL
                        CONSTRAINT CK_FPI_RH_Mode CHECK (Mode IN ('SEA','AIR','TRUCK','MULTI')),
        JobClass        VARCHAR(2)   NOT NULL
                        CONSTRAINT CK_FPI_RH_JC CHECK (JobClass IN ('EX','IM')),
        ServiceType     VARCHAR(10)  NOT NULL
                        CONSTRAINT CK_FPI_RH_Svc CHECK
                        (ServiceType IN ('FCL','LCL','AIRGEN','AIREXP','FTL','LTL','SEAAIR')),
        CarrierNo       VARCHAR(20)  NULL,     -- SMBUSINESS
        AgentNo         VARCHAR(20)  NULL,     -- SMBUSINESS
        POL             VARCHAR(20)  NOT NULL, -- OPPORT
        POD             VARCHAR(20)  NOT NULL, -- OPPORT
        FinalDest       VARCHAR(20)  NULL,
        Routing         NVARCHAR(200) NULL,
        TransitDaysMin  INT NULL,
        TransitDaysMax  INT NULL,
        FreeTimeOrigin  INT NULL,
        FreeTimeDest    INT NULL,
        ContractNo      VARCHAR(50)  NULL,
        CustomerNo      VARCHAR(20)  NULL,     -- Contract เฉพาะราย (D6)
        RateSource      VARCHAR(20)  NOT NULL
                        CONSTRAINT CK_FPI_RH_Src CHECK
                        (RateSource IN ('CARRIER_QUOTE','CONTRACT','SPOT','TARIFF','LEGACY_IMPORT')),
        SourceRef       NVARCHAR(300) NULL,
        TakeLowerEnabled BIT NOT NULL CONSTRAINT DF_FPI_RH_TL DEFAULT 1,       -- D7
        ValidFrom       DATE NOT NULL,
        ValidTo         DATE NOT NULL,
        Status          VARCHAR(12)  NOT NULL CONSTRAINT DF_FPI_RH_St DEFAULT 'DRAFT'
                        CONSTRAINT CK_FPI_RH_St CHECK
                        (Status IN ('DRAFT','CONFIRMED','EXPIRED','SUPERSEDED','CANCELLED')),
        SupersededBy    UNIQUEIDENTIFIER NULL,
        Remark          NVARCHAR(500) NULL,
        CreatedBy       VARCHAR(20)  NOT NULL,
        CreatedAtUtc    DATETIME2(0) NOT NULL CONSTRAINT DF_FPI_RH_At DEFAULT SYSUTCDATETIME(),
        ConfirmedBy     VARCHAR(20)  NULL,
        ConfirmedAtUtc  DATETIME2(0) NULL,
        UpdatedAtUtc    DATETIME2(0) NULL,
        CONSTRAINT CK_FPI_RH_ValidRange   CHECK (ValidTo >= ValidFrom),
        CONSTRAINT CK_FPI_RH_ValidSane    CHECK (ValidTo <= DATEADD(YEAR, 2, ValidFrom)),
        CONSTRAINT CK_FPI_RH_ConfirmAudit CHECK
            (Status <> 'CONFIRMED' OR (ConfirmedBy IS NOT NULL AND ConfirmedAtUtc IS NOT NULL))
    );
    CREATE INDEX IX_FPI_RH_Lane   ON dbo.FPI_RateHeader (Mode, POL, POD, ValidTo)
        INCLUDE (Status, CarrierNo, ServiceType);
    CREATE INDEX IX_FPI_RH_Status ON dbo.FPI_RateHeader (Status, ValidTo);
    CREATE INDEX IX_FPI_RH_Cust   ON dbo.FPI_RateHeader (CustomerNo) WHERE CustomerNo IS NOT NULL;
END
GO

/* ============================================================================
   5) FPI_RateCharge — บรรทัดราคา อ้าง OPITEM ผ่าน ChargePolicy (D4)
   ============================================================================ */
IF OBJECT_ID('dbo.FPI_RateCharge','U') IS NULL
BEGIN
    CREATE TABLE dbo.FPI_RateCharge (
        RateChargeId    UNIQUEIDENTIFIER NOT NULL
                        CONSTRAINT DF_FPI_RC_Id DEFAULT NEWSEQUENTIALID()
                        CONSTRAINT PK_FPI_RateCharge PRIMARY KEY,
        RateId          UNIQUEIDENTIFIER NOT NULL
                        CONSTRAINT FK_FPI_RC_Rate REFERENCES dbo.FPI_RateHeader(RateId),
        SeqNo           INT NOT NULL,
        SubSysName      VARCHAR(2)  NOT NULL,
        JobClass        VARCHAR(2)  NOT NULL,
        ExpCode         VARCHAR(20) NOT NULL,
        ChargeName      NVARCHAR(200) NOT NULL,
        Category        VARCHAR(12) NOT NULL
                        CONSTRAINT CK_FPI_RC_Cat CHECK
                        (Category IN ('FREIGHT','SURCHARGE','ORIGIN','DEST',
                                      'CUSTOMS','TRUCKING','REBATE','OTHER')),
        Basis           VARCHAR(15) NOT NULL
                        CONSTRAINT CK_FPI_RC_Basis CHECK
                        (Basis IN ('PER_CNTR','PER_KG','PER_CBM','PER_WM','PER_SHPT',
                                   'PER_BL','PER_SET','PCT_OF_FREIGHT')),
        ContainerType   VARCHAR(10) NULL,
        WeightBreakKg   DECIMAL(10,2) NULL,
        CurrencyCode    VARCHAR(3)  NOT NULL,
        Amount          DECIMAL(18,4) NOT NULL CONSTRAINT CK_FPI_RC_Amt CHECK (Amount >= 0),
        MinAmount       DECIMAL(18,4) NULL,
        PayCollect      CHAR(2) NOT NULL CONSTRAINT DF_FPI_RC_PC DEFAULT 'PP'
                        CONSTRAINT CK_FPI_RC_PC CHECK (PayCollect IN ('PP','CC')),
        IsMandatory     BIT NOT NULL CONSTRAINT DF_FPI_RC_Mand DEFAULT 1,
        Remark          NVARCHAR(300) NULL,
        CONSTRAINT UQ_FPI_RC UNIQUE (RateId, SeqNo),
        CONSTRAINT FK_FPI_RC_Policy FOREIGN KEY (SubSysName, JobClass, ExpCode)
            REFERENCES dbo.FPI_ChargePolicy (SubSysName, JobClass, ExpCode)
    );
    CREATE INDEX IX_FPI_RC_Rate   ON dbo.FPI_RateCharge (RateId) INCLUDE (Category, ContainerType);
    CREATE INDEX IX_FPI_RC_Charge ON dbo.FPI_RateCharge (SubSysName, JobClass, ExpCode);
END
GO

/* ============================================================================
   6) FPI_LocalChargeTariff — Local Charge มาตรฐาน (D5)
   ============================================================================ */
IF OBJECT_ID('dbo.FPI_LocalChargeTariff','U') IS NULL
BEGIN
    CREATE TABLE dbo.FPI_LocalChargeTariff (
        TariffId        UNIQUEIDENTIFIER NOT NULL
                        CONSTRAINT DF_FPI_LT_Id DEFAULT NEWSEQUENTIALID()
                        CONSTRAINT PK_FPI_LocalChargeTariff PRIMARY KEY,
        CountryCode     VARCHAR(2)   NOT NULL,
        PortCode        VARCHAR(20)  NULL,
        Side            VARCHAR(6)   NOT NULL
                        CONSTRAINT CK_FPI_LT_Side CHECK (Side IN ('ORIGIN','DEST')),
        Mode            VARCHAR(5)   NOT NULL
                        CONSTRAINT CK_FPI_LT_Mode CHECK (Mode IN ('SEA','AIR','TRUCK','ALL')),
        ServiceType     VARCHAR(10)  NULL,
        CarrierNo       VARCHAR(20)  NULL,
        AgentNo         VARCHAR(20)  NULL,
        SubSysName      VARCHAR(2)   NOT NULL,
        JobClass        VARCHAR(2)   NOT NULL,
        ExpCode         VARCHAR(20)  NOT NULL,
        ChargeName      NVARCHAR(200) NOT NULL,
        Basis           VARCHAR(15)  NOT NULL
                        CONSTRAINT CK_FPI_LT_Basis CHECK
                        (Basis IN ('PER_CNTR','PER_KG','PER_CBM','PER_WM','PER_SHPT',
                                   'PER_BL','PER_SET','PCT_OF_FREIGHT')),
        ContainerType   VARCHAR(10)  NULL,
        CurrencyCode    VARCHAR(3)   NOT NULL,
        Amount          DECIMAL(18,4) NOT NULL CONSTRAINT CK_FPI_LT_Amt CHECK (Amount >= 0),
        MinAmount       DECIMAL(18,4) NULL,
        StdSellAmount   DECIMAL(18,4) NULL,            -- ราคาขายมาตรฐาน (STD_SELL)
        ValidFrom       DATE NOT NULL,
        ValidTo         DATE NOT NULL,
        Status          VARCHAR(12)  NOT NULL CONSTRAINT DF_FPI_LT_St DEFAULT 'DRAFT'
                        CONSTRAINT CK_FPI_LT_St CHECK
                        (Status IN ('DRAFT','CONFIRMED','EXPIRED','CANCELLED')),
        SourceRef       NVARCHAR(300) NULL,
        Remark          NVARCHAR(300) NULL,
        CreatedBy       VARCHAR(20)  NOT NULL,
        CreatedAtUtc    DATETIME2(0) NOT NULL CONSTRAINT DF_FPI_LT_At DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_FPI_LT_ValidRange CHECK (ValidTo >= ValidFrom AND ValidTo <= DATEADD(YEAR,2,ValidFrom)),
        CONSTRAINT FK_FPI_LT_Policy FOREIGN KEY (SubSysName, JobClass, ExpCode)
            REFERENCES dbo.FPI_ChargePolicy (SubSysName, JobClass, ExpCode)
    );
    CREATE INDEX IX_FPI_LT_Lookup ON dbo.FPI_LocalChargeTariff
        (CountryCode, PortCode, Side, Mode, Status, ValidTo);
END
GO

/* ============================================================================
   7) FPI_QuoteRateRef — Traceability ชั้น Quotation (D1, D2)
   ============================================================================ */
IF OBJECT_ID('dbo.FPI_QuoteRateRef','U') IS NULL
BEGIN
    CREATE TABLE dbo.FPI_QuoteRateRef (
        QuoteRefId      UNIQUEIDENTIFIER NOT NULL
                        CONSTRAINT DF_FPI_QR_Id DEFAULT NEWSEQUENTIALID()
                        CONSTRAINT PK_FPI_QuoteRateRef PRIMARY KEY,
        DocNo           VARCHAR(20) NOT NULL,          -- AFQHEAD.DOCNO
        RevNo           INT NOT NULL CONSTRAINT DF_FPI_QR_Rev DEFAULT 0,
        RefKind         VARCHAR(10) NOT NULL
                        CONSTRAINT CK_FPI_QR_Kind CHECK (RefKind IN ('CHARGE','FREIGHT')),
        QtDetId         INT NULL,                      -- AFQDETAIL.DETID
        QtRatePmKey     INT NULL,                      -- SFQRATE/AFQRATE.PMKEY
        RateChargeId    UNIQUEIDENTIFIER NULL
                        CONSTRAINT FK_FPI_QR_RC REFERENCES dbo.FPI_RateCharge(RateChargeId),
        TariffId        UNIQUEIDENTIFIER NULL
                        CONSTRAINT FK_FPI_QR_LT REFERENCES dbo.FPI_LocalChargeTariff(TariffId),
        ManualReason    NVARCHAR(300) NULL,
        CostRefCurrency VARCHAR(3) NULL,
        CostRefAmount   DECIMAL(18,4) NULL,
        CostRefFxToTHB  DECIMAL(18,6) NULL,
        CreatedBy       VARCHAR(20) NOT NULL,
        CreatedAtUtc    DATETIME2(0) NOT NULL CONSTRAINT DF_FPI_QR_At DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_FPI_QR_SourceOne CHECK (RateChargeId IS NULL OR TariffId IS NULL)
    );
    CREATE INDEX IX_FPI_QR_Doc ON dbo.FPI_QuoteRateRef (DocNo, RevNo);
END
GO

/* ============================================================================
   8) FPI_BookingRateRef — Traceability + Snapshot ชั้น Booking (D2, D8, D10)
   ============================================================================ */
IF OBJECT_ID('dbo.FPI_BookingRateRef','U') IS NULL
BEGIN
    CREATE TABLE dbo.FPI_BookingRateRef (
        BookRefId       UNIQUEIDENTIFIER NOT NULL
                        CONSTRAINT DF_FPI_BR_Id DEFAULT NEWSEQUENTIALID()
                        CONSTRAINT PK_FPI_BookingRateRef PRIMARY KEY,
        BookDocNo       VARCHAR(20) NOT NULL,          -- SFBOOK.DOCNO
        BookDetId       INT NOT NULL,                  -- SFBOOKDETAIL.DETID (บรรทัด Cost)
        QuoteDocNo      VARCHAR(20) NULL,              -- Snapshot REFQTNO ณ วันจอง (D10)
        QuoteRevNo      INT NULL,                      -- AFQHEAD.REVNO ณ วันจอง (D10)
        RateChargeId    UNIQUEIDENTIFIER NULL
                        CONSTRAINT FK_FPI_BR_RC REFERENCES dbo.FPI_RateCharge(RateChargeId),
        TariffId        UNIQUEIDENTIFIER NULL
                        CONSTRAINT FK_FPI_BR_LT REFERENCES dbo.FPI_LocalChargeTariff(TariffId),
        ManualReason    NVARCHAR(300) NULL,
        SnapCurrency    VARCHAR(3) NOT NULL,
        SnapAmount      DECIMAL(18,4) NOT NULL,
        SnapFxToTHB     DECIMAL(18,6) NOT NULL,
        QuoteDeltaTHB   DECIMAL(18,2) NULL,            -- ส่วนต่างทุนจากวันเสนอ (D8)
        CreatedBy       VARCHAR(20) NOT NULL,
        CreatedAtUtc    DATETIME2(0) NOT NULL CONSTRAINT DF_FPI_BR_At DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_FPI_BR_SourceOne CHECK (RateChargeId IS NULL OR TariffId IS NULL)
    );
    CREATE INDEX IX_FPI_BR_Doc ON dbo.FPI_BookingRateRef (BookDocNo);
END
GO

/* ============================================================================
   VIEW: vFPI_ActiveRate — Rate ที่ใช้งานได้ปัจจุบัน
   ============================================================================ */
IF OBJECT_ID('dbo.vFPI_ActiveRate','V') IS NOT NULL DROP VIEW dbo.vFPI_ActiveRate;
GO
CREATE VIEW dbo.vFPI_ActiveRate AS
SELECT h.*, DATEDIFF(DAY, CAST(GETDATE() AS DATE), h.ValidTo) AS DaysToExpiry
FROM dbo.FPI_RateHeader h
WHERE h.Status = 'CONFIRMED'
  AND CAST(GETDATE() AS DATE) BETWEEN h.ValidFrom AND h.ValidTo;
GO

/* ============================================================================
   VIEW: vFPI_RateAlert — แจ้งเตือน Rate (7 วัน / Draft ค้าง / ไม่มี Source)
   ============================================================================ */
IF OBJECT_ID('dbo.vFPI_RateAlert','V') IS NOT NULL DROP VIEW dbo.vFPI_RateAlert;
GO
CREATE VIEW dbo.vFPI_RateAlert AS
SELECT RateId, RateNo, Mode, POL, POD, Status, ValidTo,
       CASE
         WHEN Status = 'CONFIRMED'
              AND ValidTo BETWEEN CAST(GETDATE() AS DATE) AND DATEADD(DAY,7,CAST(GETDATE() AS DATE))
              THEN 'EXPIRING_7D'
         WHEN Status = 'DRAFT' AND CreatedAtUtc < DATEADD(DAY,-30,SYSUTCDATETIME())
              THEN 'STALE_DRAFT_30D'
         WHEN SourceRef IS NULL AND RateSource <> 'LEGACY_IMPORT'
              THEN 'NO_SOURCE_REF'
       END AS AlertType
FROM dbo.FPI_RateHeader
WHERE (Status = 'CONFIRMED' AND ValidTo <= DATEADD(DAY,7,CAST(GETDATE() AS DATE)))
   OR (Status = 'DRAFT' AND CreatedAtUtc < DATEADD(DAY,-30,SYSUTCDATETIME()))
   OR (SourceRef IS NULL AND RateSource <> 'LEGACY_IMPORT');
GO

/* ============================================================================
   VIEW: vFPI_BookProfit — สูตรกำไร Booking (D3, D9)
   เทียบเท่า SF_BOOK_PROFIT2 + ปิดช่องโหว่: BadFxLines, Rebate ครอบ KB+REB
   ============================================================================ */
IF OBJECT_ID('dbo.vFPI_BookProfit','V') IS NOT NULL DROP VIEW dbo.vFPI_BookProfit;
GO
CREATE VIEW dbo.vFPI_BookProfit AS
WITH L AS (
    SELECT d.DOCNO, d.TRANSTYPE, d.SRCAMT,
           CASE WHEN UPPER(ISNULL(d.ITEMCURR,'THB')) = 'THB' THEN 1
                WHEN ISNULL(d.ITEMRATE,0) = 1 THEN ISNULL(b.DOCRATE,1)
                ELSE ISNULL(d.ITEMRATE,0) END AS FX,
           CASE WHEN UPPER(ISNULL(d.ITEMCURR,'THB')) <> 'THB'
                 AND ISNULL(d.ITEMRATE,0) = 0 THEN 1 ELSE 0 END AS BadFxFlag,
           ISNULL(p.IsRebate,0) AS IsRebate
    FROM dbo.SFBOOKDETAIL d
    JOIN dbo.SFBOOK b ON b.DOCNO = d.DOCNO
    LEFT JOIN dbo.FPI_ChargePolicy p
           ON p.SubSysName = d.SUB_SYSNAME AND p.JobClass = d.JOBCLASS
          AND p.ExpCode    = d.EXPCODE
)
SELECT DOCNO,
    SUM(CASE WHEN TRANSTYPE='Bill' THEN SRCAMT*FX ELSE 0 END)                AS RTSold,
    SUM(CASE WHEN TRANSTYPE='Cost' THEN SRCAMT*FX ELSE 0 END)                AS RTCost,
    SUM(CASE WHEN TRANSTYPE='Cost' AND IsRebate=1 THEN SRCAMT*FX ELSE 0 END) AS RTKB,
    SUM(BadFxFlag)                                                           AS BadFxLines
FROM L GROUP BY DOCNO;
GO

/* ============================================================================
   VIEW: vFPI_LaneHistory — Historical Intelligence (D11)
   แหล่งหลัก OPTRANSDETAIL — Reliability: POSTED > JOB_ENTRY
   ตัด SALE* (คอมมิชชั่น) และ PL* (Agent View) โดยเจตนา
   ============================================================================ */
IF OBJECT_ID('dbo.vFPI_LaneHistory','V') IS NOT NULL DROP VIEW dbo.vFPI_LaneHistory;
GO
CREATE VIEW dbo.vFPI_LaneHistory AS
SELECT
    CASE WHEN t.TRANSTYPE = 'Bill' THEN 'JOB_SELL' ELSE 'JOB_COST' END AS SourceKind,
    CASE WHEN i.DETID IS NOT NULL THEN 'POSTED' ELSE 'JOB_ENTRY' END  AS Reliability,
    t.JOBNO, t.HBLREF, t.REFBOOK AS BookDocNo, j.ETD AS RefDate,
    j.LOADPORT, j.DISPORT, j.FINALPORT, j.LINERNO, j.LINERNAME, j.AGENTNO,
    t.SUB_SYSNAME, t.JOBCLASS, t.EXPCODE, t.PCTYPE,
    t.QTY, t.UNITPRICE, t.ITEMCURR,
    COALESCE(
        i.THBAMT * CASE WHEN t.TRANSTYPE = 'Bill'
                        THEN CASE WHEN h.SRCTYPE = 'AR' THEN 1 ELSE -1 END
                        ELSE CASE WHEN h.SRCTYPE = 'AP' THEN 1 ELSE -1 END END,
        t.THBAMT * ISNULL(NULLIF(t.DOCBAL, 0), 1)
    ) AS AmtTHB
FROM dbo.OPTRANSDETAIL t
LEFT JOIN dbo.ARINVDETAIL i ON i.DETID = t.REFINVDETID
LEFT JOIN dbo.ARINVHEAD  h ON h.INVNO = i.INVNO
LEFT JOIN dbo.SFJOB      j ON j.JOBNO = t.JOBNO
WHERE (h.POSTENTRY IS NULL OR h.POSTENTRY <> 3);
GO

/* ============================================================================
   PROC: FPI_EvaluateBookingMargin — จุดประเมิน Margin กลาง (D1, D3)
   ============================================================================ */
IF OBJECT_ID('dbo.FPI_EvaluateBookingMargin','P') IS NOT NULL DROP PROCEDURE dbo.FPI_EvaluateBookingMargin;
GO
CREATE PROCEDURE dbo.FPI_EvaluateBookingMargin
    @DocNo     VARCHAR(20),
    @Result    VARCHAR(12)   OUTPUT,   -- PASS / NEED_APPROVE / BLOCKED
    @MarginPct DECIMAL(9,2)  OUTPUT,
    @Detail    NVARCHAR(500) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Sold DECIMAL(18,2), @Cost DECIMAL(18,2), @KB DECIMAL(18,2), @Bad INT;
    DECLARE @Margin DECIMAL(18,2), @MinPct DECIMAL(6,3), @MinProfit DECIMAL(18,2),
            @TolPP DECIMAL(5,2), @FailOpen BIT, @RuleName NVARCHAR(200),
            @PrevPct DECIMAL(9,2), @IsApproved INT;

    SELECT @Sold=RTSold, @Cost=RTCost, @KB=RTKB, @Bad=BadFxLines
    FROM dbo.vFPI_BookProfit WHERE DOCNO=@DocNo;

    SELECT @PrevPct=ISNULL(MARGINPCN,0), @IsApproved=ISPROAPP
    FROM dbo.SFBOOK WHERE DOCNO=@DocNo;

    /* เลือก Rule ที่เฉพาะเจาะจงที่สุด (ลูกค้า = SHIPPER เมื่อ EX / CONSIGNEE เมื่อ IM) */
    SELECT TOP 1 @MinPct=r.MinMarginPct, @MinProfit=r.MinProfitTHB,
                 @TolPP=r.TolerancePP, @FailOpen=r.FailOpenIfNoData, @RuleName=r.RuleName
    FROM dbo.FPI_MarginRule r
    JOIN dbo.SFBOOK b ON b.DOCNO=@DocNo
    LEFT JOIN dbo.FPI_CustomerProfile cp
           ON cp.CustomerNo = CASE WHEN b.JOBCLASS='IM' THEN b.CONSIGNEE ELSE b.SHIPPER END
    WHERE r.IsActive=1
      AND CAST(GETDATE() AS DATE) >= r.ValidFrom
      AND (r.ValidTo IS NULL OR CAST(GETDATE() AS DATE) <= r.ValidTo)
      AND (r.ScopeCustomerNo IS NULL OR r.ScopeCustomerNo = CASE WHEN b.JOBCLASS='IM' THEN b.CONSIGNEE ELSE b.SHIPPER END)
      AND (r.ScopeTier     IS NULL OR r.ScopeTier     = cp.Tier)
      AND (r.ScopeJobClass IS NULL OR r.ScopeJobClass = b.JOBCLASS)
      AND (r.ScopePOL      IS NULL OR r.ScopePOL      = b.LOADPORT)
      AND (r.ScopePOD      IS NULL OR r.ScopePOD      = b.FINALPORT)
    ORDER BY r.Priority;

    IF @MinPct IS NULL
    BEGIN
        SELECT @Result='BLOCKED', @MarginPct=0,
               @Detail=N'ไม่พบ Margin Rule ที่ใช้ได้ — ตรวจสอบ FPI_MarginRule';
        RETURN;
    END

    IF @Sold IS NULL   /* ไม่มีข้อมูล Bill/Cost เลย */
    BEGIN
        IF ISNULL(@FailOpen,0)=1
            SELECT @Result='PASS', @MarginPct=0, @Detail=N'ไม่มีข้อมูล (FailOpen เปิดอยู่)';
        ELSE
            SELECT @Result='BLOCKED', @MarginPct=0,
                   @Detail=N'ไม่มีบรรทัด Bill/Cost — กรุณากรอกก่อน Confirm';
        RETURN;
    END

    IF ISNULL(@Bad,0) > 0
    BEGIN
        SELECT @Result='BLOCKED', @MarginPct=0,
               @Detail=N'มีบรรทัดสกุลต่างประเทศที่ FX Rate = 0 จำนวน '
                     + CAST(@Bad AS NVARCHAR(10)) + N' บรรทัด — แก้ไขก่อน Confirm';
        RETURN;
    END

    SET @Margin = @Sold - @Cost + @KB;                       /* D3: สูตรเดิมที่พิสูจน์แล้ว */
    SET @MarginPct = CASE WHEN (@Sold + @KB) = 0 THEN 0
                          ELSE ROUND(@Margin * 100.0 / (@Sold + @KB), 2) END;

    IF @MarginPct >= @MinPct AND @Margin >= @MinProfit
        SELECT @Result='PASS', @Detail=N'ผ่านเกณฑ์: ' + @RuleName;
    ELSE IF @IsApproved IS NOT NULL AND (@MarginPct - @PrevPct) > -@TolPP
        SELECT @Result='PASS',
               @Detail=N'ต่ำกว่าเกณฑ์ แต่เปลี่ยนจากที่อนุมัติไว้ (' + CAST(@PrevPct AS NVARCHAR(12))
                     + N'%) ไม่เกิน ' + CAST(@TolPP AS NVARCHAR(8)) + N' จุด';
    ELSE
        SELECT @Result='NEED_APPROVE',
               @Detail=N'Margin ' + CAST(@MarginPct AS NVARCHAR(12)) + N'% ต่ำกว่าเกณฑ์ '
                     + CAST(@MinPct AS NVARCHAR(12)) + N'% (' + @RuleName + N')'
                     + CASE WHEN @Margin < @MinProfit
                            THEN N' และกำไร ' + CONVERT(NVARCHAR(24), @Margin)
                               + N' < ขั้นต่ำ ' + CONVERT(NVARCHAR(24), @MinProfit) + N' บาท'
                            ELSE N'' END;
END
GO

/* ============================================================================
   ตรวจสอบผลการติดตั้ง
   ============================================================================ */
SELECT 'FPI_ChargePolicy'      AS ObjectName, COUNT(*) AS Rows_ FROM dbo.FPI_ChargePolicy
UNION ALL SELECT 'FPI_MarginRule',        COUNT(*) FROM dbo.FPI_MarginRule
UNION ALL SELECT 'FPI_RateHeader',        COUNT(*) FROM dbo.FPI_RateHeader
UNION ALL SELECT 'FPI_RateCharge',        COUNT(*) FROM dbo.FPI_RateCharge
UNION ALL SELECT 'FPI_LocalChargeTariff', COUNT(*) FROM dbo.FPI_LocalChargeTariff
UNION ALL SELECT 'FPI_CustomerProfile',   COUNT(*) FROM dbo.FPI_CustomerProfile
UNION ALL SELECT 'FPI_QuoteRateRef',      COUNT(*) FROM dbo.FPI_QuoteRateRef
UNION ALL SELECT 'FPI_BookingRateRef',    COUNT(*) FROM dbo.FPI_BookingRateRef;
GO
/* ============================== END OF SCRIPT ============================== */
