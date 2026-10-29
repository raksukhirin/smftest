/* ============================================================================
   FPI Migration · NNN — <ชื่อสั้น ๆ ว่าทำอะไร>
   ----------------------------------------------------------------------------
   ทำอะไร : <อธิบาย 1–2 บรรทัด>
   ทำไม   : <อ้าง Decision — เช่น D12 §2 · ลิงก์เอกสาร>
   ผลกระทบ: <ตารางที่แตะ · ข้อมูลที่เปลี่ยน · ต้อง downtime ไหม>

   กติกา (ดู README.md):
     • ห้ามแตะตารางระบบเดิม (SFBOOK / OPTRANSDETAIL / SFHBL / SFJOB / ARINV*) — อ่านอย่างเดียว
     • สร้างเฉพาะ object prefix FPI_ / vFPI_
     • ต้องรันซ้ำได้ (guard ทุก CREATE)
     • ต้องมีไฟล์คู่ NNN_<name>.rollback.sql เสมอ
     • ห้ามแก้ไฟล์ที่ apply ไปแล้ว — ออกเลขใหม่
   ============================================================================ */
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

DECLARE @id VARCHAR(100) = 'NNN_<name>';

IF OBJECT_ID('dbo.FPI_MigrationLog','U') IS NULL
BEGIN
    RAISERROR('ต้องรัน 000_migration_log.sql ก่อน', 16, 1);
    SET NOEXEC ON;
END

IF EXISTS (SELECT 1 FROM dbo.FPI_MigrationLog WHERE MigrationId = @id)
BEGIN
    PRINT '  [NNN] apply ไปแล้ว — ข้าม';
    SET NOEXEC ON;
END
GO

/* ------------------------------------------------------------------ */
/*  เนื้อ migration — ใส่ตรงนี้                                        */
/* ------------------------------------------------------------------ */

-- ตัวอย่าง: เพิ่มคอลัมน์ (idempotent)
-- IF COL_LENGTH('dbo.FPI_RateHeader','NewCol') IS NULL
--     ALTER TABLE dbo.FPI_RateHeader ADD NewCol VARCHAR(20) NULL;
-- GO

-- ตัวอย่าง: สร้าง view (drop-create ปลอดภัยกว่า ALTER)
-- IF OBJECT_ID('dbo.vFPI_Something','V') IS NOT NULL DROP VIEW dbo.vFPI_Something;
-- GO
-- CREATE VIEW dbo.vFPI_Something AS SELECT 1 AS x;
-- GO

/* ------------------------------------------------------------------ */
/*  ตรวจผลก่อนบันทึก log — ถ้าไม่ผ่าน ห้ามบันทึก                       */
/* ------------------------------------------------------------------ */
-- IF OBJECT_ID('dbo.vFPI_Something','V') IS NULL
-- BEGIN
--     RAISERROR('  [NNN] สร้างไม่สำเร็จ — ไม่บันทึก log', 16, 1);
--     SET NOEXEC ON;
-- END
-- GO

IF NOT EXISTS (SELECT 1 FROM dbo.FPI_MigrationLog WHERE MigrationId = 'NNN_<name>')
    INSERT dbo.FPI_MigrationLog (MigrationId, Note)
    VALUES ('NNN_<name>', N'<สรุปสั้น ๆ ว่าทำอะไร + อ้าง D#>');
GO

SET NOEXEC OFF;
GO
/* ============================== END OF SCRIPT ============================== */
