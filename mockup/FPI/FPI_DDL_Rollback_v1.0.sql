/* ============================================================================
   FPI — Freight Pricing Intelligence : Rollback Script v1.0
   ----------------------------------------------------------------------------
   ลบเฉพาะ Object ของ FPI (Prefix FPI_ / vFPI_) — ไม่แตะตารางเดิมของระบบใด ๆ
   ลำดับการลบเรียงตาม Foreign Key (ลูกก่อนแม่)
   คำเตือน: ข้อมูลในตาราง FPI ทั้งหมดจะหายถาวร — สำรองก่อนรันหากจำเป็น
   ============================================================================ */
SET NOCOUNT ON;
GO

/* Stored Procedure */
IF OBJECT_ID('dbo.FPI_EvaluateBookingMargin','P') IS NOT NULL DROP PROCEDURE dbo.FPI_EvaluateBookingMargin;
GO

/* Views */
IF OBJECT_ID('dbo.vFPI_LaneHistory','V') IS NOT NULL DROP VIEW dbo.vFPI_LaneHistory;
IF OBJECT_ID('dbo.vFPI_BookProfit','V')  IS NOT NULL DROP VIEW dbo.vFPI_BookProfit;
IF OBJECT_ID('dbo.vFPI_RateAlert','V')   IS NOT NULL DROP VIEW dbo.vFPI_RateAlert;
IF OBJECT_ID('dbo.vFPI_ActiveRate','V')  IS NOT NULL DROP VIEW dbo.vFPI_ActiveRate;
GO

/* Tables — ลูกก่อนแม่ */
IF OBJECT_ID('dbo.FPI_BookingRateRef','U')    IS NOT NULL DROP TABLE dbo.FPI_BookingRateRef;
IF OBJECT_ID('dbo.FPI_QuoteRateRef','U')      IS NOT NULL DROP TABLE dbo.FPI_QuoteRateRef;
IF OBJECT_ID('dbo.FPI_RateCharge','U')        IS NOT NULL DROP TABLE dbo.FPI_RateCharge;
IF OBJECT_ID('dbo.FPI_LocalChargeTariff','U') IS NOT NULL DROP TABLE dbo.FPI_LocalChargeTariff;
IF OBJECT_ID('dbo.FPI_RateHeader','U')        IS NOT NULL DROP TABLE dbo.FPI_RateHeader;
IF OBJECT_ID('dbo.FPI_MarginRule','U')        IS NOT NULL DROP TABLE dbo.FPI_MarginRule;
IF OBJECT_ID('dbo.FPI_CustomerProfile','U')   IS NOT NULL DROP TABLE dbo.FPI_CustomerProfile;
IF OBJECT_ID('dbo.FPI_ChargePolicy','U')      IS NOT NULL DROP TABLE dbo.FPI_ChargePolicy;
GO

SELECT 'FPI objects removed' AS Result;
GO
/* ============================== END OF SCRIPT ============================== */
