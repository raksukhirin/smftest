/* ============================================================================
   FPI Migration · 000 — ROLLBACK  (Migration Log)
   ----------------------------------------------------------------------------
   ลบตาราง FPI_MigrationLog — รันเป็นตัว "สุดท้าย" ของการถอนทั้งระบบเท่านั้น
   ⚠ ถ้ายังมี FPI objects ค้างอยู่ จะเตือนและไม่ลบ (กันสถานะ DB ที่ตามรอยไม่ได้)
   ============================================================================ */
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

DECLARE @left INT = (SELECT COUNT(*) FROM sys.tables WHERE name LIKE 'FPI[_]%' AND name <> 'FPI_MigrationLog')
                  + (SELECT COUNT(*) FROM sys.views  WHERE name LIKE 'vFPI[_]%')
                  + (SELECT COUNT(*) FROM sys.procedures WHERE name LIKE 'FPI[_]%');

IF @left > 0
BEGIN
    RAISERROR('  [000-rb] ยังมี FPI objects เหลืออยู่ %d ตัว — รัน 001_baseline_fpi_v1.0.rollback.sql ก่อน · ยกเลิก', 16, 1, @left);
    RETURN;
END

IF OBJECT_ID('dbo.FPI_MigrationLog','U') IS NOT NULL
BEGIN
    DROP TABLE dbo.FPI_MigrationLog;
    PRINT '  [000-rb] dropped dbo.FPI_MigrationLog';
END
ELSE
    PRINT '  [000-rb] dbo.FPI_MigrationLog ไม่มีอยู่แล้ว — ข้าม';
GO
/* ============================== END OF SCRIPT ============================== */
