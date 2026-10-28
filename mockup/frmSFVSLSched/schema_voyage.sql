/* =============================================================================
 *  Vessel Schedule — Voyage model (SQL Server / T-SQL)
 *  Adds the relational schedule model behind frmSFVSLSched (search) and the
 *  re-worked frmSFSched (input).  Scope: schedule only (NO booking tables).
 *
 *  Reuses existing masters:
 *    • SFVESSEL                      — vessels (extended below)
 *    • SMBUSINESS (VENDCLASS='SEALINE') — carriers / liners (COMNO, SCAC, LINERCODE)
 *    • OPPORT     (PORTTYPE='SF')    — ports (PORTCODE, PORTNAME, COUNTRYCODE, COUNTRY)
 *
 *  New tables : SFSERVICELANE, SFVOYAGE, SFVOYAGEPORT, SFCUTOFF
 *  Run order  : 1) new masters  2) ALTERs  3) voyage tables  4) migration  5) view
 *  Idempotent : guarded with IF NOT EXISTS so it can be re-run safely.
 * ===========================================================================*/

/* ---------------------------------------------------------------------------
 * 0) EXTEND existing masters
 * -------------------------------------------------------------------------*/
-- SFVESSEL: add IMO / carrier link / type / status (vessel lookup must yield carrier + IMO)
IF COL_LENGTH('dbo.SFVESSEL','IMONO')      IS NULL ALTER TABLE dbo.SFVESSEL ADD IMONO      VARCHAR(20)  COLLATE Thai_CI_AS NULL;
IF COL_LENGTH('dbo.SFVESSEL','CARRIERNO')  IS NULL ALTER TABLE dbo.SFVESSEL ADD CARRIERNO  VARCHAR(20)  COLLATE Thai_CI_AS NULL;  -- -> SMBUSINESS.COMNO
IF COL_LENGTH('dbo.SFVESSEL','VESSELTYPE') IS NULL ALTER TABLE dbo.SFVESSEL ADD VESSELTYPE VARCHAR(50)  COLLATE Thai_CI_AS NULL;
IF COL_LENGTH('dbo.SFVESSEL','STATUS')     IS NULL ALTER TABLE dbo.SFVESSEL ADD STATUS     VARCHAR(20)  COLLATE Thai_CI_AS NULL;
GO

-- OPPORT: optional timezone (OPPORT has COUNTRYCODE/COUNTRY but no TIMEZONE).
-- Only needed if the UI maps port-local time from the master rather than the ISO offset.
IF COL_LENGTH('dbo.OPPORT','TIMEZONE') IS NULL ALTER TABLE dbo.OPPORT ADD TIMEZONE VARCHAR(40) COLLATE Thai_CI_AS NULL;
GO


/* ---------------------------------------------------------------------------
 * 1) SFSERVICELANE — service / string master (optional, referenced by voyage)
 * -------------------------------------------------------------------------*/
IF OBJECT_ID('dbo.SFSERVICELANE','U') IS NULL
CREATE TABLE dbo.SFSERVICELANE (
      PMKEY          INT IDENTITY(1,1) NOT NULL
    , LOCK           FLOAT             NOT NULL CONSTRAINT DF_SFSERVICELANE_LOCK DEFAULT(1)
    , SERVICELANEID  VARCHAR(20)  COLLATE Thai_CI_AS NOT NULL          -- business key
    , SERVICECODE    VARCHAR(20)  COLLATE Thai_CI_AS NOT NULL
    , SERVICENAME    VARCHAR(150) COLLATE Thai_CI_AS NOT NULL
    , TRADELANE      VARCHAR(20)  COLLATE Thai_CI_AS NULL
    , DEFAULTMODE    VARCHAR(10)  COLLATE Thai_CI_AS NULL              -- SEA / AIR
    , STATUS         VARCHAR(20)  COLLATE Thai_CI_AS NULL CONSTRAINT DF_SFSERVICELANE_ST DEFAULT('Active')
    , CONSTRAINT PK_SFSERVICELANE PRIMARY KEY (PMKEY)
    , CONSTRAINT UQ_SFSERVICELANE_ID UNIQUE (SERVICELANEID)
);
GO


/* ---------------------------------------------------------------------------
 * 2) SFVOYAGE — voyage header (replaces the flat SFVSED schedule line)
 *    Logical refs (indexed, not hard FK to keep legacy data clean):
 *      VSLCODE -> SFVESSEL.VSLCODE      LINERNO -> SMBUSINESS.COMNO
 *      POLPORT/PODPORT -> OPPORT.PORTCODE (PORTTYPE='SF')
 *      SERVICELANEID   -> SFSERVICELANE.SERVICELANEID
 * -------------------------------------------------------------------------*/
IF OBJECT_ID('dbo.SFVOYAGE','U') IS NULL
CREATE TABLE dbo.SFVOYAGE (
      PMKEY          INT IDENTITY(1,1) NOT NULL
    , LOCK           FLOAT             NOT NULL CONSTRAINT DF_SFVOYAGE_LOCK DEFAULT(1)
    , VOYAGEID       VARCHAR(20)  COLLATE Thai_CI_AS NOT NULL          -- business key (zero-padded running)
    , VSLCODE        VARCHAR(20)  COLLATE Thai_CI_AS NULL
    , VESSEL         VARCHAR(100) COLLATE Thai_CI_AS NOT NULL          -- cached vessel name
    , LINERNO        VARCHAR(20)  COLLATE Thai_CI_AS NULL
    , LINERNAME      VARCHAR(150) COLLATE Thai_CI_AS NOT NULL          -- cached carrier name
    , SERVICELANEID  VARCHAR(20)  COLLATE Thai_CI_AS NULL
    , VOYAGENO       VARCHAR(20)  COLLATE Thai_CI_AS NOT NULL
    , DIRECTION      VARCHAR(10)  COLLATE Thai_CI_AS NULL              -- Export / Import
    , POLPORT        VARCHAR(20)  COLLATE Thai_CI_AS NOT NULL          -- derived: first Load
    , POLPORTNAME    VARCHAR(150) COLLATE Thai_CI_AS NULL
    , PODPORT        VARCHAR(20)  COLLATE Thai_CI_AS NOT NULL          -- derived: last Discharge
    , PODPORTNAME    VARCHAR(150) COLLATE Thai_CI_AS NULL
    , ETD            DATETIME     NOT NULL                             -- departure POL (date+time)
    , ETA            DATETIME     NOT NULL                             -- arrival POD
    , TRANSITDAYS    INT          NOT NULL CONSTRAINT DF_SFVOYAGE_TT DEFAULT(0)
    , SCHEDULESTATUS VARCHAR(20)  COLLATE Thai_CI_AS NULL CONSTRAINT DF_SFVOYAGE_SS DEFAULT('On Schedule')
    , REMARK         TEXT         COLLATE Thai_CI_AS NULL
    , USERID         VARCHAR(20)  COLLATE Thai_CI_AS NULL
    , GROUPID        VARCHAR(20)  COLLATE Thai_CI_AS NULL
    , LASTUPD        DATETIME     NULL
    , CONSTRAINT PK_SFVOYAGE PRIMARY KEY (PMKEY)
    , CONSTRAINT UQ_SFVOYAGE_ID UNIQUE (VOYAGEID)
);
GO
IF OBJECT_ID('dbo.SFVOYAGE','U') IS NOT NULL BEGIN
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_SFVOYAGE_VESSEL'  AND object_id=OBJECT_ID('dbo.SFVOYAGE')) CREATE INDEX IX_SFVOYAGE_VESSEL  ON dbo.SFVOYAGE(VESSEL);
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_SFVOYAGE_LINERNO' AND object_id=OBJECT_ID('dbo.SFVOYAGE')) CREATE INDEX IX_SFVOYAGE_LINERNO ON dbo.SFVOYAGE(LINERNO);
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_SFVOYAGE_POL'     AND object_id=OBJECT_ID('dbo.SFVOYAGE')) CREATE INDEX IX_SFVOYAGE_POL     ON dbo.SFVOYAGE(POLPORT);
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_SFVOYAGE_POD'     AND object_id=OBJECT_ID('dbo.SFVOYAGE')) CREATE INDEX IX_SFVOYAGE_POD     ON dbo.SFVOYAGE(PODPORT);
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_SFVOYAGE_ETD'     AND object_id=OBJECT_ID('dbo.SFVOYAGE')) CREATE INDEX IX_SFVOYAGE_ETD     ON dbo.SFVOYAGE(ETD);
END
GO


/* ---------------------------------------------------------------------------
 * 3) SFVOYAGEPORT — port rotation per voyage (Load / Transship / Discharge)
 * -------------------------------------------------------------------------*/
IF OBJECT_ID('dbo.SFVOYAGEPORT','U') IS NULL
CREATE TABLE dbo.SFVOYAGEPORT (
      PMKEY          INT IDENTITY(1,1) NOT NULL
    , LOCK           FLOAT             NOT NULL CONSTRAINT DF_SFVOYAGEPORT_LOCK DEFAULT(1)
    , VOYAGEPORTID   VARCHAR(24)  COLLATE Thai_CI_AS NOT NULL          -- business key
    , VOYAGEID       VARCHAR(20)  COLLATE Thai_CI_AS NOT NULL          -- FK -> SFVOYAGE
    , SEQNO          INT          NOT NULL
    , PORTCODE       VARCHAR(20)  COLLATE Thai_CI_AS NOT NULL          -- -> OPPORT (PORTTYPE='SF')
    , PORTNAME       VARCHAR(150) COLLATE Thai_CI_AS NULL
    , MOVETYPE       VARCHAR(20)  COLLATE Thai_CI_AS NOT NULL          -- Load / Transshipment / Discharge
    , ETA            DATETIME     NULL
    , ETD            DATETIME     NULL
    , TERMINAL       VARCHAR(150) COLLATE Thai_CI_AS NULL
    , BERTH          VARCHAR(20)  COLLATE Thai_CI_AS NULL
    , STATUS         VARCHAR(20)  COLLATE Thai_CI_AS NULL CONSTRAINT DF_SFVOYAGEPORT_ST DEFAULT('Scheduled')
    , CONSTRAINT PK_SFVOYAGEPORT PRIMARY KEY (PMKEY)
    , CONSTRAINT UQ_SFVOYAGEPORT_ID UNIQUE (VOYAGEPORTID)
    , CONSTRAINT FK_SFVOYAGEPORT_VOYAGE FOREIGN KEY (VOYAGEID) REFERENCES dbo.SFVOYAGE(VOYAGEID)
);
GO
IF OBJECT_ID('dbo.SFVOYAGEPORT','U') IS NOT NULL BEGIN
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_SFVOYAGEPORT_VOYAGE' AND object_id=OBJECT_ID('dbo.SFVOYAGEPORT')) CREATE INDEX IX_SFVOYAGEPORT_VOYAGE ON dbo.SFVOYAGEPORT(VOYAGEID, SEQNO);
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_SFVOYAGEPORT_PORT'   AND object_id=OBJECT_ID('dbo.SFVOYAGEPORT')) CREATE INDEX IX_SFVOYAGEPORT_PORT   ON dbo.SFVOYAGEPORT(PORTCODE);
END
GO


/* ---------------------------------------------------------------------------
 * 4) SFCUTOFF — cut-off deadlines per voyage (SI / VGM / CY / Customs)
 * -------------------------------------------------------------------------*/
IF OBJECT_ID('dbo.SFCUTOFF','U') IS NULL
CREATE TABLE dbo.SFCUTOFF (
      PMKEY           INT IDENTITY(1,1) NOT NULL
    , LOCK            FLOAT             NOT NULL CONSTRAINT DF_SFCUTOFF_LOCK DEFAULT(1)
    , CUTOFFID        VARCHAR(24)  COLLATE Thai_CI_AS NOT NULL         -- business key
    , VOYAGEID        VARCHAR(20)  COLLATE Thai_CI_AS NOT NULL         -- FK -> SFVOYAGE
    , VOYAGEPORTID    VARCHAR(24)  COLLATE Thai_CI_AS NULL             -- FK -> SFVOYAGEPORT (usually the Load call)
    , CUTOFFTYPE      VARCHAR(20)  COLLATE Thai_CI_AS NOT NULL         -- SI / VGM / CY / Customs
    , CUTOFFDATETIME  DATETIME     NOT NULL
    , STATUS          VARCHAR(20)  COLLATE Thai_CI_AS NULL CONSTRAINT DF_SFCUTOFF_ST DEFAULT('Open')  -- Open / Today / Closed
    , REMARK          VARCHAR(255) COLLATE Thai_CI_AS NULL
    , CONSTRAINT PK_SFCUTOFF PRIMARY KEY (PMKEY)
    , CONSTRAINT UQ_SFCUTOFF_ID UNIQUE (CUTOFFID)
    , CONSTRAINT FK_SFCUTOFF_VOYAGE FOREIGN KEY (VOYAGEID) REFERENCES dbo.SFVOYAGE(VOYAGEID)
);
GO
IF OBJECT_ID('dbo.SFCUTOFF','U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_SFCUTOFF_VOYAGE' AND object_id=OBJECT_ID('dbo.SFCUTOFF'))
   CREATE INDEX IX_SFCUTOFF_VOYAGE ON dbo.SFCUTOFF(VOYAGEID, CUTOFFDATETIME);
GO


/* ---------------------------------------------------------------------------
 * 5) MIGRATION — SFVSED (flat) -> SFVOYAGE + 2 x SFVOYAGEPORT
 *    1 legacy schedule line becomes a voyage with a 2-call rotation
 *    (Load = LOADPORT @ DEPDATE, Discharge = FINALPORT @ ARRDATE).
 *    VOYAGEID reuses DETID to preserve any existing linkage.
 *    Re-runnable: only inserts rows not already migrated.
 * -------------------------------------------------------------------------*/
IF OBJECT_ID('dbo.SFVSED','U') IS NOT NULL
BEGIN
    -- 5.1 voyage header
    INSERT INTO dbo.SFVOYAGE
        (LOCK, VOYAGEID, VSLCODE, VESSEL, LINERNO, LINERNAME, SERVICELANEID, VOYAGENO,
         DIRECTION, POLPORT, POLPORTNAME, PODPORT, PODPORTNAME, ETD, ETA, TRANSITDAYS,
         SCHEDULESTATUS, REMARK, USERID, GROUPID, LASTUPD)
    SELECT
         ISNULL(s.LOCK,1), s.DETID, NULL, s.VESSEL, s.LINERNO, s.LINERNAME, NULL, s.V_VOY,
         'Export', s.LOADPORT, s.LOADPORTNAME, s.FINALPORT, s.FINALPORTNAME,
         s.DEPDATE, s.ARRDATE, s.TRANSIT,
         'On Schedule', s.REMARK, s.USERID, s.GROUPID, s.LASTUPD
    FROM dbo.SFVSED s
    WHERE NOT EXISTS (SELECT 1 FROM dbo.SFVOYAGE v WHERE v.VOYAGEID = s.DETID);

    -- 5.2 Load call (seq 1)
    INSERT INTO dbo.SFVOYAGEPORT
        (LOCK, VOYAGEPORTID, VOYAGEID, SEQNO, PORTCODE, PORTNAME, MOVETYPE, ETA, ETD, STATUS)
    SELECT 1, s.DETID + '-L', s.DETID, 1, s.LOADPORT, s.LOADPORTNAME, 'Load', NULL, s.DEPDATE, 'Scheduled'
    FROM dbo.SFVSED s
    WHERE NOT EXISTS (SELECT 1 FROM dbo.SFVOYAGEPORT p WHERE p.VOYAGEPORTID = s.DETID + '-L');

    -- 5.3 Discharge call (seq 2)
    INSERT INTO dbo.SFVOYAGEPORT
        (LOCK, VOYAGEPORTID, VOYAGEID, SEQNO, PORTCODE, PORTNAME, MOVETYPE, ETA, ETD, STATUS)
    SELECT 1, s.DETID + '-D', s.DETID, 2, s.FINALPORT, s.FINALPORTNAME, 'Discharge', s.ARRDATE, NULL, 'Scheduled'
    FROM dbo.SFVSED s
    WHERE NOT EXISTS (SELECT 1 FROM dbo.SFVOYAGEPORT p WHERE p.VOYAGEPORTID = s.DETID + '-D');
END
GO


/* ---------------------------------------------------------------------------
 * 6) BACKWARD-COMPAT view — legacy READERS of SFVSED keep working.
 *    Strategy:
 *      a) rename the physical table  : EXEC sp_rename 'dbo.SFVSED','SFVSED_OLD';
 *      b) create the view below as dbo.SFVSED
 *    NOTE: a view over a join is NOT directly updatable, so any code that
 *    WRITES SFVSED must move to SFVOYAGE/SFVOYAGEPORT (new frmSFSched), or be
 *    fronted by INSTEAD OF triggers. Until then, keep SFVSED as a real table
 *    and let the new screen maintain both. The definition is provided for the
 *    final read-only cut-over.
 * -------------------------------------------------------------------------*/
-- CREATE VIEW dbo.SFVSED AS
-- SELECT
--       v.PMKEY, v.LOCK, v.VOYAGEID AS DETID, v.LINERNO, v.LINERNAME,
--       v.ETD AS DEPDATE, UPPER(LEFT(DATENAME(weekday, v.ETD),3)) AS DEPDAY,
--       v.TRANSITDAYS AS TRANSIT,
--       v.ETA AS ARRDATE, UPPER(LEFT(DATENAME(weekday, v.ETA),3)) AS ARRDAY,
--       v.VESSEL, v.VOYAGENO AS V_VOY,
--       v.POLPORT AS LOADPORT, v.POLPORTNAME AS LOADPORTNAME,
--       v.PODPORT AS FINALPORT, v.PODPORTNAME AS FINALPORTNAME,
--       v.REMARK, v.USERID, v.GROUPID, v.LASTUPD
-- FROM dbo.SFVOYAGE v;
-- GO
