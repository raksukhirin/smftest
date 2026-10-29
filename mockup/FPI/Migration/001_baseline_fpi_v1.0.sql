/* ============================================================================
   FPI Migration · 001 — Baseline FPI v1.0
   ----------------------------------------------------------------------------
   ติดตั้ง FPI schema v1.0 ทั้งชุด: 8 ตาราง · 4 view · 1 proc · index · seed MarginRule
   *** ต้องรันใน SQLCMD Mode *** (SSMS: เมนู Query → SQLCMD Mode)
       เพราะใช้ :r เรียก ../FPI_DDL_v1.0.sql ซึ่งเป็น single source of truth
       (ไม่ copy DDL มาไว้ที่นี่ — จะได้ไม่มี schema สองชุดที่ผิดกันได้)

   ทางเลือกถ้าไม่ใช้ SQLCMD Mode:
       1) รัน ../FPI_DDL_v1.0.sql เองก่อน
       2) แล้วรันเฉพาะส่วน "บันทึก log" ท้ายไฟล์นี้

   ต้องรัน 000_migration_log.sql ก่อน · รันซ้ำได้ (DDL v1.0 มี guard ครบ 14 จุด)
   ไม่แตะตารางของระบบเดิม — สร้างเฉพาะ prefix FPI_ / vFPI_
   ============================================================================ */
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

DECLARE @id VARCHAR(100) = '001_baseline_fpi_v1.0';

IF OBJECT_ID('dbo.FPI_MigrationLog','U') IS NULL
BEGIN
    RAISERROR('ต้องรัน 000_migration_log.sql ก่อน', 16, 1);
    SET NOEXEC ON;
END

IF EXISTS (SELECT 1 FROM dbo.FPI_MigrationLog WHERE MigrationId = @id)
BEGIN
    PRINT '  [001] apply ไปแล้ว — ข้าม';
    SET NOEXEC ON;
END
GO

DECLARE @t0 DATETIME2(3) = SYSUTCDATETIME();
PRINT '  [001] applying FPI_DDL_v1.0.sql ...';
GO

/* ---- ติดตั้ง schema จาก single source of truth ---- */
:r ..\FPI_DDL_v1.0.sql

/* ---- ตรวจผล: ต้องครบ 8 ตาราง / 4 view / 1 proc ---- */
GO
DECLARE @tbl INT = (SELECT COUNT(*) FROM sys.tables  WHERE name LIKE 'FPI[_]%' AND name <> 'FPI_MigrationLog');
DECLARE @vw  INT = (SELECT COUNT(*) FROM sys.views   WHERE name LIKE 'vFPI[_]%');
DECLARE @pr  INT = (SELECT COUNT(*) FROM sys.procedures WHERE name LIKE 'FPI[_]%');

PRINT '  [001] tables=' + CAST(@tbl AS VARCHAR) + ' views=' + CAST(@vw AS VARCHAR) + ' procs=' + CAST(@pr AS VARCHAR);

IF @tbl <> 8 OR @vw <> 4 OR @pr <> 1
BEGIN
    RAISERROR('  [001] ผิดคาด — ควรได้ 8 ตาราง / 4 view / 1 proc · ไม่บันทึก log', 16, 1);
    SET NOEXEC ON;
END
GO

/* ---- บันทึก log ---- */
IF NOT EXISTS (SELECT 1 FROM dbo.FPI_MigrationLog WHERE MigrationId = '001_baseline_fpi_v1.0')
    INSERT dbo.FPI_MigrationLog (MigrationId, Note)
    VALUES ('001_baseline_fpi_v1.0',
            N'ติดตั้ง FPI v1.0 (8 ตาราง/4 view/1 proc) จาก FPI_DDL_v1.0.sql — frozen schema');
GO

SET NOEXEC OFF;
GO

SELECT MigrationId, AppliedAtUtc, AppliedBy, Note
FROM dbo.FPI_MigrationLog ORDER BY MigrationId;
GO
/* ============================== END OF SCRIPT ============================== */
