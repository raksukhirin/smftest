/* ============================================================================
   FPI Migration · 000 — Migration Log
   ----------------------------------------------------------------------------
   สร้างตารางบันทึกว่า migration ไหน apply ไปแล้ว — ต้องรันเป็นตัวแรกสุด
   รันซ้ำได้ (idempotent) · ไม่แตะตารางของระบบเดิม
   ============================================================================ */
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

IF OBJECT_ID('dbo.FPI_MigrationLog','U') IS NULL
BEGIN
    CREATE TABLE dbo.FPI_MigrationLog (
        MigrationId   VARCHAR(100)  NOT NULL
                      CONSTRAINT PK_FPI_MigrationLog PRIMARY KEY,   -- '001_baseline_fpi_v1.0'
        AppliedAtUtc  DATETIME2(0)  NOT NULL
                      CONSTRAINT DF_FPI_ML_At DEFAULT SYSUTCDATETIME(),
        AppliedBy     NVARCHAR(128) NOT NULL
                      CONSTRAINT DF_FPI_ML_By DEFAULT SUSER_SNAME(),
        DurationMs    INT           NULL,
        Note          NVARCHAR(400) NULL
    );
    PRINT '  [000] created dbo.FPI_MigrationLog';
END
ELSE
    PRINT '  [000] dbo.FPI_MigrationLog already exists — skipped';
GO

/* บันทึกตัวเอง */
IF NOT EXISTS (SELECT 1 FROM dbo.FPI_MigrationLog WHERE MigrationId = '000_migration_log')
    INSERT dbo.FPI_MigrationLog (MigrationId, Note)
    VALUES ('000_migration_log', N'สร้างตารางบันทึก migration');
GO

SELECT MigrationId, AppliedAtUtc, AppliedBy, Note
FROM dbo.FPI_MigrationLog ORDER BY MigrationId;
GO
/* ============================== END OF SCRIPT ============================== */
