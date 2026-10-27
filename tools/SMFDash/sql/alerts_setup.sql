/*
  View AL_NOINV : paid job (PV issued) with no invoice, job period older than 3 days, ETD/ETA from 2017, all departments incl. CS.
  Conditions follow the query currently in use (checked: it returns CI19010001, a CS job of 2019, which the first draft excluded).
  Run once by a DBA on the SMF database. Needs AL_JOBPAID and SMALERT to exist (SMALERT is not in the demo DB).
  DOCNO = key checked against SMALERT, to be hidden by the consumer.
*/

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
WHERE   J.JOBSTAT <> 'Deleted'                              -- CS is included (same as the query in use)
  AND   J.ETDETA >= '20170101'                              -- = year(ETDETA) >= 2017, but can use an index
  AND   J.ETDETA < DATEADD(DAY, -3, GETDATE())              -- = getdate() - etdeta > 3 (elapsed time, not calendar days)
  AND   NOT EXISTS (SELECT 1 FROM dbo.ARINVHEAD H WHERE H.JOBNO = J.JOBNO AND H.SRCTYPE = 'AR' AND H.POSTENTRY <> 3)
  AND   NOT EXISTS (SELECT 1 FROM dbo.SMALERT   A WHERE A.DOCNO = J.JOBNO);
GO

