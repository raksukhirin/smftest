/* ============================================================================
   FPI Migration · 001 — ROLLBACK  (Baseline FPI v1.0)
   ----------------------------------------------------------------------------
   ลบ FPI objects ทั้งหมด (prefix FPI_ / vFPI_) แล้วถอน log ของ 001
   *** ต้องรันใน SQLCMD Mode *** — ใช้ :r เรียก ../FPI_DDL_Rollback_v1.0.sql

   ⚠ คำเตือน: ข้อมูลในตาราง FPI ทั้งหมดจะหายถาวร — สำรองก่อนรัน
   ไม่แตะตารางของระบบเดิม · ไม่ลบ FPI_MigrationLog (ใช้ 000_...rollback.sql ถ้าต้องการ)
   ============================================================================ */
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.FPI_MigrationLog WHERE MigrationId = '001_baseline_fpi_v1.0')
    PRINT '  [001-rb] 001 ยังไม่เคย apply — จะลบ object ที่ค้างอยู่ (ถ้ามี) ต่อไป';
GO

PRINT '  [001-rb] dropping FPI objects ...';
GO

/* ---- ลบตาม rollback ต้นฉบับ (เรียงตาม FK ลูกก่อนแม่) ---- */
:r ..\FPI_DDL_Rollback_v1.0.sql

GO
/* ---- ถอน log ---- */
IF OBJECT_ID('dbo.FPI_MigrationLog','U') IS NOT NULL
    DELETE FROM dbo.FPI_MigrationLog WHERE MigrationId = '001_baseline_fpi_v1.0';
GO

DECLARE @left INT = (SELECT COUNT(*) FROM sys.tables WHERE name LIKE 'FPI[_]%' AND name <> 'FPI_MigrationLog')
                  + (SELECT COUNT(*) FROM sys.views  WHERE name LIKE 'vFPI[_]%')
                  + (SELECT COUNT(*) FROM sys.procedures WHERE name LIKE 'FPI[_]%');
PRINT '  [001-rb] FPI objects เหลือ: ' + CAST(@left AS VARCHAR) + ' (ควรเป็น 0)';
GO
/* ============================== END OF SCRIPT ============================== */
