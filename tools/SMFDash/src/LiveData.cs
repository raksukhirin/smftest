// Live queries (SELECT only). Everything else in the dashboard is still sample data — see mockup/Dashboard/mapping.md for the status of each widget.
//
// Open-item logic follows frmRPAging.frm: one "invoice" = rows of ARSUBTRANS/APSUBTRANS grouped by
//   JOINID = CASE WHEN REFINVNO='' THEN INVNO ELSE REFINVNO END,  balance = SUM(THBTOT*DOCBAL) <> 0,
//   due date = DUEDATE of the invoice row (REFINVNO=''),  rows whose BATCHID starts with 'CB' are excluded.
using System;
using System.Collections.Generic;
using System.Data;
using System.Globalization;
using System.Linq;

namespace SMFDash
{
    class OpenItem { public string Cust, Name; public decimal Bal; public DateTime? Due; public int Days; }

    public static class LiveData
    {
        const string OpenSql =
            "SELECT x.CUSTCODE, b.COMNAME, x.BAL, x.DUE FROM (" +
            "SELECT CUSTCODE, SUM(THBTOT*DOCBAL) AS BAL, MAX(CASE WHEN ISNULL(REFINVNO,'')='' THEN DUEDATE END) AS DUE FROM {0} " +
            "WHERE ISNULL(LEFT(BATCHID,2),'')<>'CB' " +
            "GROUP BY CUSTCODE, CASE WHEN ISNULL(REFINVNO,'')='' THEN INVNO ELSE REFINVNO END " +
            "HAVING SUM(THBTOT*DOCBAL)<>0) x LEFT JOIN SMBUSINESS b ON b.COMNO=x.CUSTCODE";

        static List<OpenItem> Open(Db db, string table)   // table is a constant (ARSUBTRANS / APSUBTRANS), never user input
        {
            var today = DateTime.Today;
            return db.Query(string.Format(OpenSql, table)).Rows.Cast<DataRow>().Select(r =>
            {
                var o = new OpenItem { Cust = Convert.ToString(r["CUSTCODE"]), Name = Convert.ToString(r["COMNAME"]), Bal = Convert.ToDecimal(r["BAL"]) };
                if (!(r["DUE"] is DBNull)) o.Due = (DateTime)r["DUE"];
                o.Days = o.Due.HasValue ? (int)(today - o.Due.Value.Date).TotalDays : 0;
                return o;
            }).ToList();
        }

        static int Bucket(int days) { return days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4; }

        static double[] Aging(List<OpenItem> items)
        {
            var b = new double[5];
            foreach (var i in items) b[Bucket(i.Days)] += (double)i.Bal / 1e6;
            return b;
        }

        static string Short(string s) { return string.IsNullOrEmpty(s) ? "(no name)" : s.Length > 28 ? s.Substring(0, 28) + "…" : s; }

        public static AccData LoadAcc(Db db)
        {
            var a = Sample.Acc(); var errs = new List<string>();

            try
            {
                var dt = db.Query("SELECT BANKNAME, BANKACCNO, BANKBAL FROM SMBANKACC ORDER BY BANKNAME");
                var t = new TableData(new[] { "Account", "Balance" }, -1) { Num = new[] { 1 }, Live = true };
                double sum = 0;
                foreach (DataRow r in dt.Rows)
                {
                    string no = Convert.ToString(r["BANKACCNO"]).Trim();
                    string masked = no.Length > 4 ? "xxx" + no.Substring(no.Length - 4) : no;       // show last 4 digits only
                    double bal = Convert.ToDouble(r["BANKBAL"]); sum += bal;
                    t.Rows.Add(new[] { (Convert.ToString(r["BANKNAME"]).Trim() + " " + masked).Trim(), bal.ToString("#,0.00", CultureInfo.InvariantCulture) });
                }
                a.Banks = t; a.BankLive = true;
                a.Kpis[0] = new Kpi("Cash & bank", Theme.Money(sum), "", "flat") { Live = true };
            }
            catch (Exception ex) { errs.Add("Bank: " + ex.Message); }

            try
            {
                var ar = Open(db, "ARSUBTRANS");
                a.Ar = Aging(ar); a.ArLive = true;
                a.Kpis[1] = new Kpi("AR outstanding", Theme.Money((double)ar.Sum(i => i.Bal)), "", "flat") { Live = true };
                var top = ar.GroupBy(i => i.Cust).Select(g => new { Name = g.First().Name, Sum = g.Sum(i => i.Bal), Max = g.Max(i => i.Days) })
                            .OrderByDescending(g => g.Sum).Take(4).ToList();
                a.TopAr = new TableData(new[] { "Customer", "Amount", "Aging" }, 2, top.Select(g => new[] { Short(g.Name), Theme.Money((double)g.Sum), Sample.Aging[Bucket(g.Max)] }).ToArray()) { Num = new[] { 1 }, Live = true };
            }
            catch (Exception ex) { errs.Add("AR: " + ex.Message); }

            try
            {
                var ap = Open(db, "APSUBTRANS");
                a.Ap = Aging(ap); a.ApLive = true;
                a.Kpis[2] = new Kpi("AP outstanding", Theme.Money((double)ap.Sum(i => i.Bal)), "", "flat") { Live = true };
                var today = DateTime.Today;
                var due = ap.Where(i => i.Due.HasValue && i.Due.Value.Date >= today && i.Due.Value.Date <= today.AddDays(7)).OrderBy(i => i.Due).Take(4).ToList();
                a.DueAp = new TableData(new[] { "Vendor", "Amount", "Due" }, -1, due.Select(i => new[] { Short(i.Name), Theme.Money((double)i.Bal), i.Due.Value.ToString("MMM dd", CultureInfo.InvariantCulture) }).ToArray()) { Num = new[] { 1 }, Live = true };
            }
            catch (Exception ex) { errs.Add("AP: " + ex.Message); }

            a.Error = string.Join(" | ", errs.ToArray());
            return a;
        }
    }
}
