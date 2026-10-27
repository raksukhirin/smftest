/*
  Alert views converted from D:\DEV.VB\SMP\@SQLMAIL\PILOT\*.sql  (run once by a DBA on the SMF database, after alerts_setup.sql)

    AL_OVS_SOA        <- OverseaBillNote_NoReceipt.sql   Oversea with SOA (bill note) issued, not received
    AL_DEPOSIT        <- dep_NoReceipt.sql               Deposit paid > 15 days, not refunded
    AL_DUTYTAX        <- duty_NoReceipt.sql              Duty / Tax paid > 7 days, not refunded
    AL_INV_CASH       <- Inv_NoReceipt_Cash.sql          Cash invoice unpaid > 3 days
    AL_INV_CREDIT     <- Inv_NoReceipt_Credit.sql        Credit invoice past appoint date
    AL_NOAPPOINT      <- NoAppoint.sql                   Invoice > 7 days, no appoint date
    AL_NOBILLNOTE     <- NoBillnote.sql                  Invoice > 7 days, no bill note
    AL_OVS_NORCPT     <- Oversea_NoReceipt.sql           Oversea ETD/ETA/FLT > 30 days, not received
    AL_OVS_BYAGENT    <- Oversea_NoReceipt_ByAgent.sql   same, by agent (signed amounts; no TOTAL rows - group in the app)

  Every view follows the convention in alerts_setup.sql: real column types, header = column name ('_' = space),
  DOCNO = hidden key. SMFDash lists any view named AL_* that has a DOCNO column automatically (see README),
  the SMALERTDEF rows at the end only give them a nice title / heading / mail subject.

  The WHERE clauses are copied as they are in the mail scripts (calendar-day DATEDIFF where the script uses DATEDIFF,
  elapsed time "getdate() - date > n" where it uses that), so row counts match. Only these were rewritten, same result:
    year(x) >= 2019        ->  x >= '20190101'   (can use an index)
    getdate() - x > n      ->  x < DATEADD(DAY, -n, GETDATE())
    NOT IN (subquery)      ->  NOT EXISTS        (a NULL in the sub-query made NOT IN return nothing; JOBNO IS NOT NULL
                                                  keeps the NOT IN behaviour for a NULL job number)
  NOT TESTED on a server: the SELECT parts were run read-only with TOP 0 (syntax / column names) on the demo DB only.
*/

/* helper views (only created when they do not exist yet - an existing definition is never replaced) ------------- */
IF OBJECT_ID('dbo.AL_APPLY_PR') IS NULL EXEC('
CREATE VIEW dbo.AL_APPLY_PR AS
SELECT D.REFINVNO, H.DOCDATE, SUM(D.THBTOT) AS APPLYAMT
FROM dbo.CBSUBDETAIL D JOIN dbo.CBDETAIL H ON D.DETIDH = H.DETID
WHERE D.DETTYPE = ''AP'' AND D.BATCHID + STR(D.ENTRYNO) NOT IN (SELECT BATCHID + STR(ENTRYNO) FROM dbo.CBHEAD WHERE POSTENTRY = 3)
GROUP BY D.REFINVNO, H.DOCDATE');
GO
IF OBJECT_ID('dbo.AL_JOBCOLLECT_DEP') IS NULL EXEC('
CREATE VIEW dbo.AL_JOBCOLLECT_DEP AS
SELECT D.JOBNO, SUM(D.THBTOT) AS COLLECTAMT
FROM dbo.CBSUBDETAIL D JOIN dbo.CBDETAIL H ON D.DETIDH = H.DETID
WHERE H.DETTYPE = ''AR'' AND (H.DOCTYPE = ''RC'' OR H.DOCTYPE = ''OR'')
  AND D.BATCHID + STR(D.ENTRYNO) NOT IN (SELECT BATCHID + STR(ENTRYNO) FROM dbo.CBHEAD WHERE POSTENTRY = 3)
  AND D.REFINVNO IN (SELECT I.INVNO FROM dbo.ARINVHEAD A JOIN dbo.ARINVDETAIL I ON A.INVNO = I.INVNO
                     WHERE A.SRCTYPE = ''AR'' AND A.POSTENTRY <> 3 AND I.EXPCODE = ''DEP'')
GROUP BY D.JOBNO');
GO
IF OBJECT_ID('dbo.AL_JOBCOLLECT_TAX') IS NULL EXEC('
CREATE VIEW dbo.AL_JOBCOLLECT_TAX AS
SELECT D.JOBNO, SUM(D.THBTOT) AS COLLECTAMT
FROM dbo.CBSUBDETAIL D JOIN dbo.CBDETAIL H ON D.DETIDH = H.DETID
WHERE H.DETTYPE = ''AR'' AND (H.DOCTYPE = ''RC'' OR H.DOCTYPE = ''OR'')
  AND D.BATCHID + STR(D.ENTRYNO) NOT IN (SELECT BATCHID + STR(ENTRYNO) FROM dbo.CBHEAD WHERE POSTENTRY = 3)
  AND D.REFINVNO IN (SELECT I.INVNO FROM dbo.ARINVHEAD A JOIN dbo.ARINVDETAIL I ON A.INVNO = I.INVNO
                     WHERE A.SRCTYPE = ''AR'' AND A.POSTENTRY <> 3
                       AND I.EXPCODE IN (''DUTY & TAX'',''DUTY & TAX CI'',''DUTY & TAX SI'',''S00001'',''S00002'',''S00003'',''S00004'',''S00005'',''S00006'',''S00009''))
GROUP BY D.JOBNO');
GO

/* 1. Oversea with SOA issued, not received ----------------------------------------------------------------------- */
CREATE OR ALTER VIEW dbo.AL_OVS_SOA AS
SELECT  H.SUB_SYSNAME AS [TYPE], H.JOBCLASS AS DEPT, H.JOBNO, H.INVNO AS INV_NO,
        H.BILLNOTEDATE AS SOA_DATE, DATEDIFF(DAY, H.BILLNOTEDATE, GETDATE()) AS TOTAL_DAYS,
        H.THBTOT AS INV_AMT, H.USERID, S.COMNAME AS AGENT, H.INVNO AS DOCNO
FROM    dbo.ARINVHEAD H
LEFT JOIN dbo.SFJOB T ON H.JOBNO = T.JOBNO
LEFT JOIN dbo.SMBUSINESS S ON H.CUSTCODE = S.COMNO
WHERE   H.POSTENTRY <> 3 AND H.LOCOVER = 2 AND H.DOCTYPE = 'DN' AND H.SRCTYPE = 'AR' AND H.BILLNOTEDATE IS NOT NULL
  AND   H.INVDATE >= '20190101'
  AND   DATEDIFF(DAY, H.BILLNOTEDATE, GETDATE()) > 0
  AND   NOT EXISTS (SELECT 1 FROM dbo.AL_APPLYINV A WHERE A.REFINVNO = H.INVNO);
GO

/* 2. Deposit paid > 15 days, not refunded ------------------------------------------------------------------------ */
CREATE OR ALTER VIEW dbo.AL_DEPOSIT AS
SELECT  H.JOBNO, H.INVNO AS INV_NUMBER, H.INVDATE AS INV_DATE, D.THBTOT AS AMOUNT, H.USERID, H.INVDESC AS REMARK,
        H.INVNO AS DOCNO
FROM    dbo.ARINVHEAD H JOIN dbo.ARINVDETAIL D ON H.INVNO = D.INVNO
WHERE   H.SRCTYPE = 'AP' AND H.POSTENTRY <> 3 AND D.EXPCODE = 'DEP'
  AND   H.INVNO IN (SELECT P.REFINVNO FROM dbo.AL_APPLY_PR P WHERE P.DOCDATE >= '20200101' AND DATEDIFF(DAY, P.DOCDATE, GETDATE()) > 15)
  AND   H.JOBNO IS NOT NULL
  AND   NOT EXISTS (SELECT 1 FROM dbo.AL_JOBCOLLECT_DEP C WHERE C.JOBNO = H.JOBNO);
GO

/* 3. Duty / Tax paid > 7 days, not refunded ---------------------------------------------------------------------- */
CREATE OR ALTER VIEW dbo.AL_DUTYTAX AS
SELECT  H.JOBNO, H.INVNO AS INV_NUMBER, H.INVDATE AS INV_DATE, D.THBTOT AS AMOUNT, H.USERID, H.INVDESC AS REMARK,
        H.JOBNO AS DOCNO                                   -- SMALERT is keyed by job number
FROM    dbo.ARINVHEAD H JOIN dbo.ARINVDETAIL D ON H.INVNO = D.INVNO
WHERE   H.SRCTYPE = 'AP' AND H.POSTENTRY <> 3 AND D.EXPCODE IN ('TAX', 'DUTY')
  AND   H.INVNO IN (SELECT P.REFINVNO FROM dbo.AL_APPLY_PR P WHERE P.DOCDATE >= '20200101' AND DATEDIFF(DAY, P.DOCDATE, GETDATE()) > 7)
  AND   H.JOBNO IS NOT NULL
  AND   NOT EXISTS (SELECT 1 FROM dbo.AL_JOBCOLLECT_TAX C WHERE C.JOBNO = H.JOBNO)
  AND   NOT EXISTS (SELECT 1 FROM dbo.SMALERT A WHERE A.DOCNO = H.JOBNO);
GO

/* 4. Cash invoice unpaid > 3 days -------------------------------------------------------------------------------- */
CREATE OR ALTER VIEW dbo.AL_INV_CASH AS
SELECT  H.SUB_SYSNAME AS [TYPE], H.JOBCLASS AS DEPT, H.JOBNO, H.INVNO AS INV_NO,
        H.INVDATE AS INV_DATE, DATEDIFF(DAY, H.INVDATE, GETDATE()) AS TOTAL_DAYS, H.THBTOT AS INV_AMT, H.USERID,
        H.INVNO AS DOCNO
FROM    dbo.ARINVHEAD H LEFT JOIN dbo.SMTERM T ON H.TERMCODE = T.TERMCODE
WHERE   H.POSTENTRY <> 3 AND H.DOCTYPE = 'IN' AND H.SRCTYPE = 'AR'
  AND   H.INVDATE >= '20200101'
  AND   DATEDIFF(DAY, H.INVDATE, GETDATE()) > 3
  AND   T.TOTALDAY <= 0
  AND   NOT EXISTS (SELECT 1 FROM dbo.AL_APPLYINV A WHERE A.REFINVNO = H.INVNO);
GO

/* 5. Credit invoice past appoint date ---------------------------------------------------------------------------- */
CREATE OR ALTER VIEW dbo.AL_INV_CREDIT AS
SELECT  H.SUB_SYSNAME AS [TYPE], H.JOBCLASS AS DEPT, H.JOBNO, H.INVNO AS INV_NO,
        H.APPOINTDATE AS APPOINT_DATE, DATEDIFF(DAY, H.APPOINTDATE, GETDATE()) AS TOTAL_DAYS, H.THBTOT AS INV_AMT, H.USERID,
        H.INVNO AS DOCNO
FROM    dbo.ARINVHEAD H LEFT JOIN dbo.SMTERM T ON H.TERMCODE = T.TERMCODE
WHERE   H.POSTENTRY <> 3 AND H.DOCTYPE = 'IN' AND H.SRCTYPE = 'AR' AND H.APPOINTDATE IS NOT NULL
  AND   H.INVDATE >= '20200101'
  AND   DATEDIFF(DAY, H.APPOINTDATE, GETDATE()) > 0
  AND   T.TOTALDAY > 0
  AND   NOT EXISTS (SELECT 1 FROM dbo.AL_APPLYINV A WHERE A.REFINVNO = H.INVNO);
GO

/* 6. Invoice > 7 days, no appoint date --------------------------------------------------------------------------- */
CREATE OR ALTER VIEW dbo.AL_NOAPPOINT AS
SELECT  H.SUB_SYSNAME AS [TYPE], H.JOBCLASS AS DEPT, H.JOBNO, H.INVNO AS INV_NO,
        H.INVDATE AS INV_DATE, H.THBTOT AS INV_AMT, H.USERID, H.INVNO AS DOCNO
FROM    dbo.ARINVHEAD H LEFT JOIN dbo.SMTERM T ON H.TERMCODE = T.TERMCODE
WHERE   H.POSTENTRY <> 3 AND H.DOCTYPE = 'IN' AND H.SRCTYPE = 'AR' AND H.APPOINTDATE IS NULL
  AND   H.INVDATE >= '20200101'
  AND   H.INVDATE < DATEADD(DAY, -7, GETDATE())            -- = getdate() - INVDATE > 7
  AND   T.TOTALDAY > 0
  AND   NOT EXISTS (SELECT 1 FROM dbo.AL_APPLYINV A WHERE A.REFINVNO = H.INVNO);
GO

/* 7. Invoice > 7 days, no bill note ------------------------------------------------------------------------------ */
CREATE OR ALTER VIEW dbo.AL_NOBILLNOTE AS
SELECT  H.SUB_SYSNAME AS [TYPE], H.JOBCLASS AS DEPT, H.JOBNO, H.INVNO AS INV_NO,
        H.INVDATE AS INV_DATE, H.THBTOT AS INV_AMT, H.USERID, H.INVNO AS DOCNO
FROM    dbo.ARINVHEAD H LEFT JOIN dbo.SMTERM T ON H.TERMCODE = T.TERMCODE
WHERE   H.POSTENTRY <> 3 AND H.DOCTYPE = 'IN' AND H.SRCTYPE = 'AR' AND H.BILLNOTEDATE IS NULL AND H.APPOINTDATE IS NULL
  AND   H.INVDATE >= '20200101'
  AND   DATEDIFF(DAY, H.INVDATE, GETDATE()) > 7
  AND   T.TOTALDAY > 0
  AND   NOT EXISTS (SELECT 1 FROM dbo.AL_APPLYINV A WHERE A.REFINVNO = H.INVNO);
GO

/* 8. Oversea ETD/ETA/FLT > 30 days, not received ------------------------------------------------------------------ */
CREATE OR ALTER VIEW dbo.AL_OVS_NORCPT AS
SELECT  H.SUB_SYSNAME AS [TYPE], H.JOBCLASS AS DEPT, H.JOBNO, H.INVNO AS INV_NO,
        T.ETDETA AS JOB_PERIOD, DATEDIFF(DAY, T.ETDETA, GETDATE()) AS TOTAL_DAYS, H.THBTOT AS INV_AMT, H.USERID,
        S.COMNAME AS AGENT, H.INVNO AS DOCNO
FROM    dbo.ARINVHEAD H
LEFT JOIN dbo.SFJOB T ON H.JOBNO = T.JOBNO
LEFT JOIN dbo.SMBUSINESS S ON H.CUSTCODE = S.COMNO
WHERE   H.POSTENTRY <> 3 AND H.LOCOVER = 2 AND H.DOCTYPE = 'DN' AND H.SRCTYPE = 'AR'
  AND   H.INVDATE >= '20190101'
  AND   DATEDIFF(DAY, T.ETDETA, GETDATE()) > 30
  AND   NOT EXISTS (SELECT 1 FROM dbo.AL_APPLYINV A WHERE A.REFINVNO = H.INVNO);
GO

/* 9. Same, by agent: all LOCOVER = 2 documents (not only DN / AR), AP counts negative ----------------------------- */
CREATE OR ALTER VIEW dbo.AL_OVS_BYAGENT AS
SELECT  M.COMNAME AS AGENT, H.SUB_SYSNAME AS [TYPE], H.JOBCLASS AS DEPT, H.JOBNO, H.INVNO AS INV_NO,
        T.ETDETA AS JOB_PERIOD, DATEDIFF(DAY, T.ETDETA, GETDATE()) AS TOTAL_DAYS,
        H.THBTOT * CASE WHEN H.SRCTYPE = 'AP' THEN -1 ELSE 1 END AS INV_AMT, H.USERID, H.INVNO AS DOCNO
FROM    dbo.ARINVHEAD H
LEFT JOIN dbo.SFJOB T ON H.JOBNO = T.JOBNO
LEFT JOIN dbo.SMBUSINESS M ON H.CUSTCODE = M.COMNO
WHERE   H.POSTENTRY <> 3 AND H.LOCOVER = 2
  AND   H.INVDATE >= '20190101'
  AND   DATEDIFF(DAY, T.ETDETA, GETDATE()) > 30
  AND   NOT EXISTS (SELECT 1 FROM dbo.AL_APPLYINV A WHERE A.REFINVNO = H.INVNO);
GO

/* SMALERTDEF rows: title / heading / mail subject. Recipients are NOT copied - fill RECIPIENTS / CC / BCC
   from the old scripts before scheduling dbo.usp_AlertMail (until then the old jobs keep sending). ------------- */
IF OBJECT_ID('dbo.SMALERTDEF') IS NOT NULL
BEGIN
    DECLARE @d TABLE (CODE varchar(30), TITLE nvarchar(200), SHORTNAME nvarchar(40), HEADING nvarchar(400), NOTE nvarchar(400),
                      VIEWNAME nvarchar(128), ORDERBY nvarchar(200), SUBJECT nvarchar(200), SORTNO int);
    INSERT @d VALUES
     ('NOBILLNOTE', N'Un-Bill Placement Invoice Listing',  N'Un-Bill',      N'[ACCORD] Invoice ที่ออกเกิน 7 วัน , สถานะ : ยังไม่วางบิล', N'(เฉพาะ Invoice ที่มีเครดิต)', 'AL_NOBILLNOTE', 'INV_NO', N'[ACCORD] Un-Bill Placement Invoice Listing', 10),
     ('NOAPPOINT',  N'Un-Appoint Invoice Listing',         N'Un-Appoint',   N'[ACCORD] Invoice ที่ออกเกิน 7 วัน , สถานะ : ยังไม่นัดรับชำระ', N'(ไม่มี Appoint Date)', 'AL_NOAPPOINT', 'INV_NO', N'[ACCORD] Un-Appoint Invoice Listing', 20),
     ('INV_CASH',   N'Outstanding Invoice : Cash',         N'Cash overdue', N'[ACCORD] Invoice เงินสด : ที่ค้างชำระเกิน 3 วัน', N'(เงินสด : คือไม่ให้ credit)', 'AL_INV_CASH', 'INV_NO', N'[ACCORD] Oustanding Invoice : Cash', 30),
     ('INV_CREDIT', N'Outstanding Invoice : Credit',       N'Over appoint', N'[ACCORD] Invoice มีเครดิต ที่เกินกำหนดนัดรับชำระ', N'(Over Appoint Date)', 'AL_INV_CREDIT', 'INV_NO', N'[ACCORD] Outstanding Invoice : Credit', 40),
     ('DEPOSIT',    N'Job ค้างรับคืนค่า Deposit',           N'Deposit refund', N'[ACCORD] Job ค้างรับคืนค่า Deposit เฉพาะที่จ่ายแล้วเกิน 15 วัน', NULL, 'AL_DEPOSIT', 'INV_DATE DESC', N'[ACCORD] Job ค้างรับคืนค่า Deposit', 60),
     ('DUTYTAX',    N'Job ค้างรับคืนค่า Duty Tax',          N'Duty Tax refund', N'[ACCORD] Job ค้างรับคืนค่า Duty Tax เฉพาะที่จ่ายแล้วเกิน 7 วัน', NULL, 'AL_DUTYTAX', 'INV_DATE DESC', N'[ACCORD] Job ค้างรับคืนค่า Duty Tax', 70),
     ('OVS_NORCPT', N'Outstanding Oversea by job period',  N'Oversea outstanding', N'[ACCORD] Oversea ค้างรับที่มี ETD/ETA/FLT เกิน30วัน', N'(SE=ETD , SI=ETA , AIR=FLT)', 'AL_OVS_NORCPT', 'INV_NO', N'[ACCORD] Outstanding Oversea by job period', 80),
     ('OVS_AGENT',  N'Outstanding Oversea by agent',       N'Oversea by agent', N'[ACCORD] Oversea ค้างรับที่มี ETD/ETA/FLT เกิน30วัน (แยกตาม Agent)', N'(SE=ETD , SI=ETA , AIR=FLT)', 'AL_OVS_BYAGENT', 'AGENT, INV_NO', N'[ACCORD] Outstanding Oversea by agent', 85),
     ('OVS_SOA',    N'Outstanding Oversea with SOA confirmed', N'Oversea SOA', N'[ACCORD] Oversea ค้างรับที่มีการออก SOA แล้ว', N'(SOA = Oversea Statement)', 'AL_OVS_SOA', 'INV_NO', N'[ACCORD] Outstanding Oversea with SOA confirmed', 90);
    INSERT dbo.SMALERTDEF (ALERTCODE, TITLE, SHORTNAME, HEADING, NOTE, VIEWNAME, ORDERBY, SUBJECT, SORTNO)
    SELECT d.CODE, d.TITLE, d.SHORTNAME, d.HEADING, d.NOTE, d.VIEWNAME, d.ORDERBY, d.SUBJECT, d.SORTNO
    FROM @d d WHERE NOT EXISTS (SELECT 1 FROM dbo.SMALERTDEF x WHERE x.ALERTCODE = d.CODE OR x.VIEWNAME = d.VIEWNAME);
END
GO
