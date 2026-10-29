/* ============================================================================
   FPI Migration · VERIFY (read-only)
   ----------------------------------------------------------------------------
   รายงานสถานะ schema ปัจจุบัน — ไม่เปลี่ยนอะไร รันได้ทุกเมื่อ
   ============================================================================ */
SET NOCOUNT ON;

/* ---- 1. migration ที่ apply แล้ว ---- */
IF OBJECT_ID('dbo.FPI_MigrationLog','U') IS NULL
    SELECT 'FPI_MigrationLog ยังไม่มี — ยังไม่เคยรัน 000' AS MigrationStatus;
ELSE
    SELECT MigrationId, AppliedAtUtc, AppliedBy, Note
    FROM dbo.FPI_MigrationLog ORDER BY MigrationId;

/* ---- 2. object ที่มีจริง เทียบกับที่ v1.0 ควรมี (MISSING ขึ้นก่อน) ---- */
SELECT v.kind, v.nm AS ObjectName,
       CASE WHEN OBJECT_ID('dbo.' + v.nm) IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS Status
FROM (VALUES
    ('TABLE','FPI_ChargePolicy'),   ('TABLE','FPI_CustomerProfile'), ('TABLE','FPI_MarginRule'),
    ('TABLE','FPI_RateHeader'),     ('TABLE','FPI_RateCharge'),      ('TABLE','FPI_LocalChargeTariff'),
    ('TABLE','FPI_QuoteRateRef'),   ('TABLE','FPI_BookingRateRef'),
    ('VIEW' ,'vFPI_ActiveRate'),    ('VIEW' ,'vFPI_RateAlert'),
    ('VIEW' ,'vFPI_BookProfit'),    ('VIEW' ,'vFPI_LaneHistory'),
    ('PROC' ,'FPI_EvaluateBookingMargin')
) v(kind, nm)
ORDER BY CASE WHEN OBJECT_ID('dbo.' + v.nm) IS NULL THEN 0 ELSE 1 END, v.kind, v.nm;

/* ---- 3. สรุปจำนวน ---- */
SELECT
    (SELECT COUNT(*) FROM sys.tables     WHERE name LIKE 'FPI[_]%' AND name <> 'FPI_MigrationLog') AS Tables_have,
    8  AS Tables_expect,
    (SELECT COUNT(*) FROM sys.views      WHERE name LIKE 'vFPI[_]%') AS Views_have,
    4  AS Views_expect,
    (SELECT COUNT(*) FROM sys.procedures WHERE name LIKE 'FPI[_]%')  AS Procs_have,
    1  AS Procs_expect;

/* ---- 4. seed MarginRule (v1.0 ใส่ Default Rule มาให้) ---- */
IF OBJECT_ID('dbo.FPI_MarginRule','U') IS NOT NULL
    SELECT RuleName, Priority, MinMarginPct, SuggestMarkupPct, MinProfitTHB, TolerancePP, ValidFrom
    FROM dbo.FPI_MarginRule ORDER BY Priority;

/* ---- 5. ตารางระบบเดิมที่ FPI อ้างถึง — ต้องมีอยู่ (FPI อ่านอย่างเดียว ห้ามแก้) ---- */
SELECT v.nm AS LegacyTable,
       CASE WHEN OBJECT_ID('dbo.' + v.nm) IS NOT NULL THEN 'OK' ELSE 'MISSING!' END AS Status
FROM (VALUES ('OPITEM'),('SMITEM'),('SFBOOK'),('SFBOOKDETAIL'),('SFJOB'),('SFHBL'),
             ('OPTRANSDETAIL'),('ARINVHEAD'),('ARINVDETAIL')) v(nm)
ORDER BY CASE WHEN OBJECT_ID('dbo.' + v.nm) IS NULL THEN 0 ELSE 1 END, v.nm;
/* ============================== END OF SCRIPT ============================== */
