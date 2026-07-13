/* ============================================================================
   FPI — Parallel Run Compare Pack v1.0  (Q1–Q8, Read-only ทั้งหมด)
   ----------------------------------------------------------------------------
   เงื่อนไข : รัน FPI_DDL_v1.0.sql แล้ว (มี vFPI_BookProfit, FPI_ChargePolicy ฯลฯ)
   คู่มือ   : FPI_TestPlan_ParallelRun_v1.0.md
   ============================================================================ */

/* ---------------------------------------------------------------------------
   Q1 (T1) — Reconciliation ทุก Booking : คาดหวัง ExactMatch = TotalBookings
   --------------------------------------------------------------------------- */
SELECT COUNT(*) AS TotalBookings,
    SUM(CASE WHEN ABS(n.RTSold-o.RTSold)<0.01 AND ABS(n.RTCost-o.RTCost)<0.01
              AND ABS(n.RTKB-o.RTKB)<0.01 THEN 1 ELSE 0 END) AS ExactMatch,
    SUM(CASE WHEN ABS(n.RTSold-o.RTSold)>=0.01 THEN 1 ELSE 0 END) AS SoldDiff,
    SUM(CASE WHEN ABS(n.RTCost-o.RTCost)>=0.01 THEN 1 ELSE 0 END) AS CostDiff,
    SUM(CASE WHEN ABS(n.RTKB-o.RTKB)>=0.01 THEN 1 ELSE 0 END)   AS KBDiff,
    SUM(CASE WHEN n.BadFxLines>0 THEN 1 ELSE 0 END)             AS DocsWithBadFx
FROM dbo.vFPI_BookProfit n
JOIN dbo.SF_BOOK_PROFIT2 o ON o.DOCNO = n.DOCNO;

/* Q1.1 — รายละเอียดใบที่ต่าง (ถ้ามี) */
SELECT n.DOCNO,
       n.RTSold AS NewSold, o.RTSold AS OldSold,
       n.RTCost AS NewCost, o.RTCost AS OldCost,
       n.RTKB   AS NewKB,   o.RTKB   AS OldKB,
       n.BadFxLines
FROM dbo.vFPI_BookProfit n
JOIN dbo.SF_BOOK_PROFIT2 o ON o.DOCNO = n.DOCNO
WHERE ABS(n.RTSold-o.RTSold)>=0.01 OR ABS(n.RTCost-o.RTCost)>=0.01 OR ABS(n.RTKB-o.RTKB)>=0.01
ORDER BY n.DOCNO;

/* ---------------------------------------------------------------------------
   Q2 (T2) — REB Exception Log : ใบที่ RTKB ต่างเพราะสูตรใหม่นับ REB (D9)
   ทุกใบต้องได้ Pricing Sign-off ใน Test Plan ข้อ 6
   --------------------------------------------------------------------------- */
SELECT n.DOCNO, o.RTKB AS OldKB, n.RTKB AS NewKB, n.RTKB - o.RTKB AS KBDelta,
       (SELECT COUNT(*) FROM dbo.SFBOOKDETAIL d
         WHERE d.DOCNO = n.DOCNO AND d.TRANSTYPE='Cost' AND d.EXPCODE='REB') AS REBLines
FROM dbo.vFPI_BookProfit n
JOIN dbo.SF_BOOK_PROFIT2 o ON o.DOCNO = n.DOCNO
WHERE ABS(n.RTKB - o.RTKB) >= 0.01
ORDER BY n.DOCNO;

/* ---------------------------------------------------------------------------
   Q3 (T3) — Bad FX Report : บรรทัดสกุลต่างประเทศที่ Rate = 0 (เดิมเงินหายเงียบ)
   --------------------------------------------------------------------------- */
SELECT d.DOCNO, d.SEQNO, d.TRANSTYPE, d.EXPCODE, d.ITEMCURR, d.ITEMRATE,
       d.QTY, d.UNITPRICE, d.SRCAMT,
       N'มูลค่าที่หายจากสูตรเดิม (ประมาณด้วย DOCRATE)' AS Note,
       d.SRCAMT * ISNULL(b.DOCRATE,0) AS EstLostTHB
FROM dbo.SFBOOKDETAIL d
JOIN dbo.SFBOOK b ON b.DOCNO = d.DOCNO
WHERE UPPER(ISNULL(d.ITEMCURR,'THB')) <> 'THB' AND ISNULL(d.ITEMRATE,0) = 0
ORDER BY d.DOCNO, d.SEQNO;

/* ---------------------------------------------------------------------------
   Q4 (T4) — Fail-open Audit : Booking ที่ไม่มีบรรทัด Bill/Cost เลย
   (เดิม ChkProfitOK ผ่านอัตโนมัติ / ใหม่ = BLOCKED)
   --------------------------------------------------------------------------- */
SELECT b.DOCNO, b.DOCDATE, b.DOCSTAT, b.REFQTNO, b.SALENAME
FROM dbo.SFBOOK b
LEFT JOIN dbo.SFBOOKDETAIL d ON d.DOCNO = b.DOCNO
WHERE d.DOCNO IS NULL
ORDER BY b.DOCDATE DESC;

/* ---------------------------------------------------------------------------
   Q5 (T5) — Proc Smoke Test : รันกับเอกสารตัวแทน (ดูตารางคาดหวังใน Test Plan ข้อ 4)
   --------------------------------------------------------------------------- */
DECLARE @Result VARCHAR(12), @MarginPct DECIMAL(9,2), @Detail NVARCHAR(500);

EXEC dbo.FPI_EvaluateBookingMargin @DocNo='BSE18100003',
     @Result=@Result OUTPUT, @MarginPct=@MarginPct OUTPUT, @Detail=@Detail OUTPUT;
SELECT 'BSE18100003 (คาด PASS 12.21%)' AS Scenario, @Result AS Result, @MarginPct AS MarginPct, @Detail AS Detail;

EXEC dbo.FPI_EvaluateBookingMargin @DocNo='BSI20030001',
     @Result=@Result OUTPUT, @MarginPct=@MarginPct OUTPUT, @Detail=@Detail OUTPUT;
SELECT 'BSI20030001 (คาด BLOCKED — BadFx)' AS Scenario, @Result AS Result, @MarginPct AS MarginPct, @Detail AS Detail;

EXEC dbo.FPI_EvaluateBookingMargin @DocNo='BSE20020002',
     @Result=@Result OUTPUT, @MarginPct=@MarginPct OUTPUT, @Detail=@Detail OUTPUT;
SELECT 'BSE20020002 (เคส KB — ดู % ที่คำนวณ)' AS Scenario, @Result AS Result, @MarginPct AS MarginPct, @Detail AS Detail;

/* ---------------------------------------------------------------------------
   Q6 (T6) — Known-value Regression : ค่าที่พิสูจน์ด้วยมือแล้ว
   คาดหวัง: BSE18100003 = 53000 / 46530 / 0
            BSE20020002 = 33100 / 41800 / 36500
            BSE26060002 = 10900 / 10860 / 0
   --------------------------------------------------------------------------- */
SELECT DOCNO, RTSold, RTCost, RTKB, BadFxLines
FROM dbo.vFPI_BookProfit
WHERE DOCNO IN ('BSE18100003','BSE20020002','BSE26060002')
ORDER BY DOCNO;

/* ---------------------------------------------------------------------------
   Q7 (T7) — Seed Validation : คาดหวังรวม 498
   MARKUP 20 / PASS 16 / STD_SELL 462 (ในนั้น IsRebate 9)
   --------------------------------------------------------------------------- */
SELECT PricingMode, IsRebate, COUNT(*) AS N
FROM dbo.FPI_ChargePolicy
GROUP BY PricingMode, IsRebate
ORDER BY PricingMode, IsRebate;

/* ---------------------------------------------------------------------------
   Q8 (T8) — LaneHistory Sanity
   --------------------------------------------------------------------------- */
/* 8.1 จำนวนแถวรวม แยกชั้นความเชื่อถือ */
SELECT SourceKind, Reliability, COUNT(*) AS N, SUM(AmtTHB) AS SumTHB
FROM dbo.vFPI_LaneHistory
GROUP BY SourceKind, Reliability
ORDER BY SourceKind, Reliability;

/* 8.2 Orphan Job ต้อง = 0 (ทุก JOBNO ใน OPTRANSDETAIL อยู่ใน SFJOB) */
SELECT COUNT(DISTINCT t.JOBNO) AS OrphanJobs
FROM dbo.OPTRANSDETAIL t
LEFT JOIN dbo.SFJOB j ON j.JOBNO = t.JOBNO
WHERE j.JOBNO IS NULL;

/* 8.3 การหัก Credit Note : บรรทัด CN ต้องให้ AmtTHB ติดลบ (เมื่อยอดตั้งต้นเป็นบวก) */
SELECT TOP 20 t.DOCNO, t.DOCTYPE, t.DOCBAL, t.THBAMT, h.AmtTHB
FROM dbo.OPTRANSDETAIL t
JOIN dbo.vFPI_LaneHistory h ON h.JOBNO = t.JOBNO AND h.EXPCODE = t.EXPCODE
WHERE t.DOCTYPE = 'CN'
ORDER BY t.DETID DESC;

/* ============================== END OF PACK ============================== */
