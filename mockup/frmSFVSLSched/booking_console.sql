/* =============================================================================
 *  Booking Usage / Console Planning — source binding for the Query screen
 *  (frmSFVSLSched index.html → detail "Booking Usage / Console Planning" panel)
 *
 *  Source table : SFBOOK (+ SFBOOKDETAIL for line goods, not needed by the panel)
 *  Link to voyage: add SFBOOK.VOYAGEID (FK -> SFVOYAGE) for a clean join.
 *                  Until back-filled, a text join on VESSEL + V_VOY is the
 *                  fallback (lossy — vessel names are dirty, e.g. 'VVVVVVVVV').
 *
 *  Run AFTER schema_voyage.sql (SFVOYAGE must exist).  Idempotent.
 *  Validated: the projection SELECT runs against the live SFBOOK.
 * ===========================================================================*/

/* ---------------------------------------------------------------------------
 * 1) LINK — add the voyage foreign key to bookings
 * -------------------------------------------------------------------------*/
IF COL_LENGTH('dbo.SFBOOK','VOYAGEID') IS NULL
    ALTER TABLE dbo.SFBOOK ADD VOYAGEID VARCHAR(20) COLLATE Thai_CI_AS NULL;   -- -> SFVOYAGE.VOYAGEID
GO
IF OBJECT_ID('dbo.SFBOOK','U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_SFBOOK_VOYAGE' AND object_id=OBJECT_ID('dbo.SFBOOK'))
   CREATE INDEX IX_SFBOOK_VOYAGE ON dbo.SFBOOK(VOYAGEID);
GO

/* ---------------------------------------------------------------------------
 * 2) BACKFILL — best-effort match existing bookings to a voyage by VESSEL+V_VOY
 *    (run once; new bookings should set VOYAGEID at entry time instead).
 * -------------------------------------------------------------------------*/
IF OBJECT_ID('dbo.SFVOYAGE','U') IS NOT NULL
UPDATE b
   SET b.VOYAGEID = v.VOYAGEID
FROM dbo.SFBOOK b
JOIN dbo.SFVOYAGE v
     ON b.VESSEL = v.VESSEL
    AND b.V_VOY  = v.VOYAGENO
WHERE (b.VOYAGEID IS NULL OR b.VOYAGEID = '')
  AND b.VESSEL <> '';
GO

/* ---------------------------------------------------------------------------
 * 3) PROJECTION view — SFBOOK -> the exact shape the panel consumes
 *    (mirror of mockup data.json `bookings[]`).
 *    NOTE: siStatus / customsStatus have NO native SFBOOK column — they are
 *    DERIVED placeholders here. Add real columns (e.g. SI_STATUS, CUSTOMS_STATUS)
 *    if the business needs authoritative tracking.
 * -------------------------------------------------------------------------*/
IF OBJECT_ID('dbo.vw_SFBOOKING_CONSOLE','V') IS NOT NULL DROP VIEW dbo.vw_SFBOOKING_CONSOLE;
GO
CREATE VIEW dbo.vw_SFBOOKING_CONSOLE AS
SELECT
      b.VOYAGEID                                                              AS voyageId
    , b.BOOKNO                                                                AS bookingNo
    , COALESCE(NULLIF(CASE WHEN b.JOBCLASS='IM' THEN b.CONSIGNEENAME
                           ELSE b.SHIPPERNAME END,''),
               NULLIF(b.CONAME,''), '')                                       AS customerName
    , CASE WHEN b.LOADTYPE LIKE '%LCL%' OR b.LOADTYPE='CONSOLE' THEN 'LCL'
           WHEN b.LOADTYPE LIKE '%FCL%'                          THEN 'FCL'
           ELSE ISNULL(b.LOADTYPE,'') END                                     AS shipmentMode
    , b.CTNSIZE                                                               AS containerType
    , b.CTNQTY                                                                AS containerQty
    , b.LOADPORT                                                              AS pol
    , b.FINALPORT                                                             AS pod
    , b.CBM                                                                   AS cbm
    , b.GW                                                                    AS grossWeightKg
    , b.DOCSTAT                                                               AS status
    , CASE WHEN b.DOCSTAT IN ('Confirm','Close') THEN 'Submitted'
           ELSE 'Pending' END                                                 AS siStatus      -- DERIVED
    , CASE WHEN b.CLEARDATE IS NOT NULL THEN 'Cleared'
           ELSE 'Pending' END                                                 AS customsStatus -- DERIVED
FROM dbo.SFBOOK b
WHERE b.DOCSTAT <> 'Deleted';
GO

/* ---------------------------------------------------------------------------
 * 4) CONSOLE summary view — per-voyage roll-up (booking count + CBM / weight),
 *    feeds the panel footer totals.
 * -------------------------------------------------------------------------*/
IF OBJECT_ID('dbo.vw_SFVOYAGE_CONSOLE','V') IS NOT NULL DROP VIEW dbo.vw_SFVOYAGE_CONSOLE;
GO
CREATE VIEW dbo.vw_SFVOYAGE_CONSOLE AS
SELECT
      voyageId
    , COUNT(*)                                                   AS bookingCount
    , SUM(ISNULL(cbm,0))                                         AS totalCbm
    , SUM(ISNULL(grossWeightKg,0))                               AS totalGrossKg
    , SUM(CASE WHEN shipmentMode='FCL' THEN ISNULL(containerQty,0) ELSE 0 END) AS totalCtnQty
    , SUM(CASE WHEN shipmentMode='LCL' THEN 1 ELSE 0 END)        AS lclBookings
FROM dbo.vw_SFBOOKING_CONSOLE
WHERE voyageId IS NOT NULL AND voyageId <> ''
GROUP BY voyageId;
GO

/* ---------------------------------------------------------------------------
 * Query the panel for one voyage:
 *   SELECT * FROM dbo.vw_SFBOOKING_CONSOLE WHERE voyageId = @voyageId;
 *   SELECT * FROM dbo.vw_SFVOYAGE_CONSOLE  WHERE voyageId = @voyageId;
 * Fallback (no VOYAGEID yet) — text join:
 *   SELECT c.* FROM dbo.vw_SFBOOKING_CONSOLE c
 *   JOIN dbo.SFVOYAGE v ON c.pol IS NOT NULL  -- use SFBOOK b JOIN on VESSEL+V_VOY
 * ---------------------------------------------------------------------------*/
