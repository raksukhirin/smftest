/*
  Alerts - example commands (run each block by hand in SSMS; nothing here runs on its own).
  Needs alerts_def_and_mail.sql and alerts_views.sql to have been run.
*/

/* 1. TEST send of one alert: only to the address given, subject starts with the normal subject ------------------ */
EXEC dbo.usp_AlertMail @AlertCode = 'PAID_NOINV',  @TestTo = 'you@yourdomain.com';
EXEC dbo.usp_AlertMail @AlertCode = 'NOBILLNOTE',  @TestTo = 'you@yourdomain.com';
EXEC dbo.usp_AlertMail @AlertCode = 'NOAPPOINT',   @TestTo = 'you@yourdomain.com';
EXEC dbo.usp_AlertMail @AlertCode = 'INV_CASH',    @TestTo = 'you@yourdomain.com';
EXEC dbo.usp_AlertMail @AlertCode = 'INV_CREDIT',  @TestTo = 'you@yourdomain.com';
EXEC dbo.usp_AlertMail @AlertCode = 'DEPOSIT',     @TestTo = 'you@yourdomain.com';
EXEC dbo.usp_AlertMail @AlertCode = 'DUTYTAX',     @TestTo = 'you@yourdomain.com';
EXEC dbo.usp_AlertMail @AlertCode = 'OVS_NORCPT',  @TestTo = 'you@yourdomain.com';
EXEC dbo.usp_AlertMail @AlertCode = 'OVS_AGENT',   @TestTo = 'you@yourdomain.com';
EXEC dbo.usp_AlertMail @AlertCode = 'OVS_SOA',     @TestTo = 'you@yourdomain.com';
-- an empty view sends nothing (the message "Nothing to report for ..." is printed)

/* 2. TEST send of every active alert to one address -------------------------------------------------------------- */
DECLARE @c varchar(30);
DECLARE cur CURSOR LOCAL FAST_FORWARD FOR SELECT ALERTCODE FROM dbo.SMALERTDEF WHERE ACTIVE = 1 ORDER BY SORTNO;
OPEN cur; FETCH NEXT FROM cur INTO @c;
WHILE @@FETCH_STATUS = 0
BEGIN
    EXEC dbo.usp_AlertMail @AlertCode = @c, @TestTo = 'you@yourdomain.com';
    FETCH NEXT FROM cur INTO @c;
END
CLOSE cur; DEALLOCATE cur;

/* 3. REAL send (uses RECIPIENTS / CC / BCC of SMALERTDEF) - one alert, then all (= the SQL Agent job step) ------- */
EXEC dbo.usp_AlertMail @AlertCode = 'DEPOSIT';

DECLARE @c2 varchar(30);
DECLARE cur2 CURSOR LOCAL FAST_FORWARD FOR SELECT ALERTCODE FROM dbo.SMALERTDEF WHERE ACTIVE = 1 ORDER BY SORTNO;
OPEN cur2; FETCH NEXT FROM cur2 INTO @c2;
WHILE @@FETCH_STATUS = 0
BEGIN
    EXEC dbo.usp_AlertMail @AlertCode = @c2;     -- raises an error for an alert that has no recipients, then goes on
    FETCH NEXT FROM cur2 INTO @c2;
END
CLOSE cur2; DEALLOCATE cur2;

/* 4. Recipients (';' separated). Do this before section 3 ------------------------------------------------------- */
UPDATE dbo.SMALERTDEF
SET RECIPIENTS = 'to@yourdomain.com',
    CC         = 'cc1@yourdomain.com;cc2@yourdomain.com',
    BCC        = 'bcc@yourdomain.com'
WHERE ALERTCODE = 'DEPOSIT';

/* 5. Switch an alert off / on (off = also hidden in SMFDash) ----------------------------------------------------- */
UPDATE dbo.SMALERTDEF SET ACTIVE = 0 WHERE ALERTCODE = 'OVS_AGENT';
UPDATE dbo.SMALERTDEF SET ACTIVE = 1 WHERE ALERTCODE = 'OVS_AGENT';

/* 6. Look at what an alert returns, and the current set-up ------------------------------------------------------- */
SELECT * FROM dbo.AL_DEPOSIT;
SELECT ALERTCODE, VIEWNAME, ACTIVE, SORTNO, RECIPIENTS, CC FROM dbo.SMALERTDEF ORDER BY SORTNO;

/* 7. Add a new alert later --------------------------------------------------------------------------------------
   a) CREATE VIEW dbo.AL_xxx ... with a DOCNO column (hidden key) and real column types  -> it shows up in SMFDash by itself
   b) optional title shown in SMFDash when there is no SMALERTDEF row:
        EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'My alert title',
             @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'VIEW', @level1name = N'AL_xxx';
   c) only if it must be e-mailed: add a row so usp_AlertMail can find it                                          */
INSERT dbo.SMALERTDEF (ALERTCODE, TITLE, VIEWNAME, ORDERBY, SUBJECT, RECIPIENTS, SORTNO)
VALUES ('MY_ALERT', N'My alert title', 'AL_xxx', 'DOCNO', N'My alert title', 'to@yourdomain.com', 100);
