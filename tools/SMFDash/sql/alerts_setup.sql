/*
  Alerts setup  -  run once by a DBA on the SMF database (SMFDash itself never writes to the database).

  Idea: one alert = one view (AL_xxx) + one row in SMALERTDEF.
    - SMFDash reads SMALERTDEF and SELECTs each view  -> Alerts tab, live.
    - dbo.usp_AlertMail builds the HTML mail from the same view  -> no HTML / sp_send_dbmail copy-paste per alert.

  View convention (AL_xxx):
    - real column types (date / decimal), not text; the column name is the header (underscore = space)
    - JOBNO, INV_NO ... as the names; money columns end with AMT ; an AGE_DAYS column if you have one
    - DOCNO = the key checked against SMALERT; it is NOT shown (neither in the mail nor in SMFDash)
    - no ORDER BY in the view (use SMALERTDEF.ORDERBY)
    - use NOT EXISTS, not NOT IN (a single NULL in the sub-query makes NOT IN return nothing)

  NOT TESTED on a server yet: written against SQL Server 2012+ syntax, the demo DB has no SMALERT table.
  Try first with:  EXEC dbo.usp_AlertMail @AlertCode = 'PAID_NOINV', @TestTo = 'you@yourdomain.com';
*/

/* 1. definition table ------------------------------------------------------------------------------------------ */
IF OBJECT_ID('dbo.SMALERTDEF') IS NULL
CREATE TABLE dbo.SMALERTDEF
(
    ALERTCODE  varchar(30)   NOT NULL PRIMARY KEY,
    TITLE      nvarchar(200) NOT NULL,              -- card title in SMFDash
    SHORTNAME  nvarchar(40)  NULL,                  -- short name on the card (optional)
    HEADING    nvarchar(400) NULL,                  -- <h1> of the mail / page heading (default TITLE)
    NOTE       nvarchar(400) NULL,                  -- small line under the heading
    VIEWNAME   sysname       NOT NULL,              -- e.g. AL_NOINV
    ORDERBY    nvarchar(200) NULL,                  -- e.g. 'DEPT, JOBNO'  (mail only; SMFDash sorts itself)
    SUBJECT    nvarchar(200) NULL,                  -- mail subject (default TITLE)
    RECIPIENTS nvarchar(max) NULL,                  -- ';' separated
    CC         nvarchar(max) NULL,
    BCC        nvarchar(max) NULL,
    PROFILE    sysname       NOT NULL DEFAULT 'SMF Public Profile',
    ACTIVE     bit           NOT NULL DEFAULT 1,
    SORTNO     int           NOT NULL DEFAULT 100
);
GO

/* 2. example: the "paid job with no invoice" script as a view ------------------------------------------------- */
CREATE OR ALTER VIEW dbo.AL_NOINV AS
SELECT  J.SUB_SYSNAME AS [TYPE],
        J.JOBCLASS    AS DEPT,
        J.JOBNO,
        J.ETDETA      AS PERIOD,
        J.RECPORT     AS ORIGIN,
        J.DELPORT     AS DEST,
        J.USERID,
        P.PAIDAMT     AS PAID_AMT,
        J.JOBNO       AS DOCNO
FROM    dbo.SFJOB J
JOIN    dbo.AL_JOBPAID P ON J.JOBNO = P.JOBNO
WHERE   J.SUB_SYSNAME <> 'CS' AND J.JOBSTAT <> 'Deleted'
  AND   DATEDIFF(DAY, J.ETDETA, GETDATE()) > 3
  AND   J.ETDETA >= '20200101'
  AND   NOT EXISTS (SELECT 1 FROM dbo.ARINVHEAD H WHERE H.JOBNO = J.JOBNO AND H.SRCTYPE = 'AR' AND H.POSTENTRY <> 3)
  AND   NOT EXISTS (SELECT 1 FROM dbo.SMALERT   A WHERE A.DOCNO = J.JOBNO);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.SMALERTDEF WHERE ALERTCODE = 'PAID_NOINV')
INSERT dbo.SMALERTDEF (ALERTCODE, TITLE, SHORTNAME, HEADING, VIEWNAME, ORDERBY, SUBJECT, RECIPIENTS, CC, SORTNO)
VALUES ('PAID_NOINV', N'Paid job with no invoice', N'Paid, no invoice',
        N'[ACCORD] Job Period เกิน 3 วัน : ทำ PV จ่ายแล้ว แต่ยังไม่ออก Invoice',
        'AL_NOINV', 'DEPT, JOBNO', N'[ACCORD] Paid job with no invoice',
        'to@yourdomain.com', 'cc1@yourdomain.com;cc2@yourdomain.com', 50);   -- <- put the real addresses here
GO

/* 3. mail sender ------------------------------------------------------------------------------------------------ */
CREATE OR ALTER PROCEDURE dbo.usp_AlertMail
    @AlertCode varchar(30),
    @TestTo    nvarchar(max) = NULL         -- when given: send only to this address, subject starts with [TEST]
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @view sysname, @title nvarchar(200), @heading nvarchar(400), @note nvarchar(400), @orderby nvarchar(200),
            @subject nvarchar(200), @to nvarchar(max), @cc nvarchar(max), @bcc nvarchar(max), @profile sysname;

    SELECT @view = VIEWNAME, @title = TITLE, @heading = ISNULL(HEADING, TITLE), @note = NOTE, @orderby = ORDERBY,
           @subject = ISNULL(SUBJECT, TITLE), @to = RECIPIENTS, @cc = CC, @bcc = BCC, @profile = PROFILE
    FROM dbo.SMALERTDEF WHERE ALERTCODE = @AlertCode AND ACTIVE = 1;

    IF @view IS NULL BEGIN RAISERROR('Alert %s not found or not active', 16, 1, @AlertCode); RETURN; END
    IF OBJECT_ID(@view, 'V') IS NULL BEGIN RAISERROR('View %s not found', 16, 1, @view); RETURN; END

    -- header cells and select list built from the view's columns (DOCNO is hidden)
    DECLARE @th nvarchar(max), @cols nvarchar(max);
    SELECT @th = (SELECT N'<th>' + REPLACE(c.name, '_', ' ') + N'</th>'
                  FROM sys.columns c WHERE c.object_id = OBJECT_ID(@view) AND c.name <> 'DOCNO' ORDER BY c.column_id
                  FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)');
    SELECT @cols = (SELECT
                        CASE WHEN c.system_type_id IN (48,52,56,127,106,108,60,122,62,59) THEN N'''right'' AS [td/@align], ' ELSE N'''left'' AS [td/@align], ' END
                      + N'td = ' +
                        CASE WHEN c.system_type_id IN (40,42,58,61)               THEN N'CONVERT(varchar(10), ' + QUOTENAME(c.name) + N', 105)'
                             WHEN c.system_type_id IN (106,108,60,122,62,59)      THEN N'CONVERT(varchar(50), CAST(' + QUOTENAME(c.name) + N' AS money), 1)'
                             ELSE N'CAST(' + QUOTENAME(c.name) + N' AS nvarchar(400))' END
                      + N', '''', '
                    FROM sys.columns c WHERE c.object_id = OBJECT_ID(@view) AND c.name <> 'DOCNO' ORDER BY c.column_id
                    FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)');
    SET @cols = LEFT(@cols, LEN(@cols) - 1);   -- trailing comma

    DECLARE @sql nvarchar(max), @rows nvarchar(max);
    SET @sql = N'SELECT @r = CAST((SELECT TOP 5000 ' + @cols + N' FROM ' + @view
             + ISNULL(N' ORDER BY ' + @orderby, N'') + N' FOR XML PATH(''tr''), TYPE) AS nvarchar(max));';
    EXEC sp_executesql @sql, N'@r nvarchar(max) OUTPUT', @r = @rows OUTPUT;

    IF @rows IS NULL BEGIN PRINT 'Nothing to report for ' + @AlertCode; RETURN; END     -- empty view -> no mail

    DECLARE @html nvarchar(max) =
        N'<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8" /></head><body>'
      + N'<h1>' + @heading + N'</h1>' + ISNULL(N'<h2>' + @note + N'</h2>', N'')
      + N'<table border="0"><tr>' + @th + N'</tr>' + @rows + N'</table></body></html>';

    IF @TestTo IS NOT NULL
        EXEC msdb.dbo.sp_send_dbmail @profile_name = @profile, @recipients = @TestTo,
             @subject = @subject, @body = @html, @body_format = 'HTML';
    ELSE
        EXEC msdb.dbo.sp_send_dbmail @profile_name = @profile, @recipients = @to, @copy_recipients = @cc,
             @blind_copy_recipients = @bcc, @subject = @subject, @body = @html, @body_format = 'HTML';
END
GO

/* 4. schedule: one job step that sends every active alert --------------------------------------------------------
DECLARE @c varchar(30);
DECLARE cur CURSOR LOCAL FAST_FORWARD FOR SELECT ALERTCODE FROM dbo.SMALERTDEF WHERE ACTIVE = 1 ORDER BY SORTNO;
OPEN cur; FETCH NEXT FROM cur INTO @c;
WHILE @@FETCH_STATUS = 0 BEGIN EXEC dbo.usp_AlertMail @c; FETCH NEXT FROM cur INTO @c; END
CLOSE cur; DEALLOCATE cur;
*/
