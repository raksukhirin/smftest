// Alerts: HTML reports produced by SQL (an <h1>/<h2> and one <table>) -> AlertDef. Also holds the DEMO reports
// (modelled on the mails provided; ported from mockup/ApprovalFlow/alerts-data.js).
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;

namespace SMFDash
{
    public class AlertSrc { public string File, Subject, Html; }
    public class AlertCol { public string Name, Kind; }

    public class AlertDef
    {
        public string File, Title, Heading, Note, Short, Icon, Html, Sev;
        public List<AlertCol> Cols = new List<AlertCol>();
        public List<string[]> Rows = new List<string[]>();
        public int Mi = -1, Ui = -1, Di = -1;       // money / user / days(age) column index
        public decimal? Total; public double MaxDays;
    }

    public static class AlertParser
    {
        static readonly Regex Tag = new Regex("<[^>]+>", RegexOptions.Compiled);
        static readonly Regex Ws = new Regex(@"\s+", RegexOptions.Compiled);
        const RegexOptions Opt = RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.Compiled;

        static readonly object[][] Cat =
        {
            new object[] { new Regex("un-?bill|วางบิล", RegexOptions.IgnoreCase), "Un-Bill", "\U0001F9FE" },
            new object[] { new Regex("appoint|นัดรับ", RegexOptions.IgnoreCase), "Un-Appoint", "\U0001F4C5" },
            new object[] { new Regex("เงินสด|cash", RegexOptions.IgnoreCase), "Cash overdue", "\U0001F4B5" },
            new object[] { new Regex("deposit", RegexOptions.IgnoreCase), "Deposit refund", "\U0001F501" },
            new object[] { new Regex(@"duty ?tax", RegexOptions.IgnoreCase), "Duty Tax refund", "\U0001F3DB" },
            new object[] { new Regex("no invoice|paid job", RegexOptions.IgnoreCase), "Paid, no invoice", "\U0001F4C4" },
            new object[] { new Regex("oversea", RegexOptions.IgnoreCase), "Overseas outstanding", "\U0001F30F" }
        };

        static string Clean(string html) { return Ws.Replace(WebUtility.HtmlDecode(Tag.Replace(html, " ")), " ").Trim(); }

        public static DateTime? DateOf(string s)
        {
            DateTime d; return DateTime.TryParseExact((s ?? "").Trim(), "dd-MM-yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out d) ? (DateTime?)d : null;
        }
        public static decimal Num(string s)
        {
            decimal v; return decimal.TryParse((s ?? "").Replace(",", ""), NumberStyles.Float, CultureInfo.InvariantCulture, out v) ? v : 0;
        }
        static bool IsNum(string s) { return Regex.IsMatch(s ?? "", @"^-?[\d,]+(\.\d+)?$"); }
        public static string Sev(double d) { return d >= 90 ? "bad" : d >= 30 ? "warn" : "info"; }

        public static AlertDef Parse(AlertSrc src)
        {
            var tm = Regex.Match(src.Html, "<table.*?</table>", Opt); if (!tm.Success) return null;
            var h1 = Regex.Match(src.Html, "<h1[^>]*>(.*?)</h1>", Opt); var h2 = Regex.Match(src.Html, "<h[23][^>]*>(.*?)</h[23]>", Opt);
            var rows = new List<List<string>>();
            foreach (Match tr in Regex.Matches(tm.Value, "<tr[^>]*>(.*?)</tr>", Opt))
            {
                var cells = Regex.Matches(tr.Groups[1].Value, "<t[hd][^>]*>(.*?)</t[hd]>", Opt).Cast<Match>().Select(c => Clean(c.Groups[1].Value)).ToList();
                if (cells.Count > 0) rows.Add(cells);
            }
            if (rows.Count == 0) return null;
            var head = rows[0]; rows.RemoveAt(0);

            // drop columns that are empty in every row (e.g. REMARK)
            var keep = Enumerable.Range(0, head.Count).Where(i => rows.Any(r => i < r.Count && r[i] != "")).ToList();
            var a = new AlertDef { File = src.File, Html = src.Html };
            var data = rows.Select(r => keep.Select(i => i < r.Count ? r[i] : "").ToList()).ToList();
            var names = keep.Select(i => head[i]).ToList();

            for (int i = 0; i < names.Count; i++)
            {
                string hu = names[i].ToUpperInvariant(), kind = "text";
                var vals = data.Select(r => r[i]).Where(v => v != "").ToList();
                if (vals.Count > 0 && vals.All(v => DateOf(v).HasValue)) kind = "date";
                else if (vals.Count > 0 && vals.All(IsNum)) kind = Regex.IsMatch(hu, "AMT|AMOUNT") ? "money" : hu.Contains("DAYS") ? "days" : "num";
                else if (hu.Contains("USER")) kind = "user";
                else if (Regex.IsMatch(hu, @"JOB ?NO|JOBNO")) kind = "job";
                else if (Regex.IsMatch(hu, @"INV\. ?(NO|NUMBER)")) kind = "inv";
                a.Cols.Add(new AlertCol { Name = names[i], Kind = kind });
            }

            // no "days" column -> derive an AGE column from the first date column
            a.Di = a.Cols.FindIndex(c => c.Kind == "days");
            if (a.Di < 0)
            {
                int di = a.Cols.FindIndex(c => c.Kind == "date");
                if (di >= 0)
                {
                    a.Cols.Add(new AlertCol { Name = "AGE", Kind = "age" });
                    foreach (var r in data) { var d = DateOf(r[di]); r.Add(d.HasValue ? Math.Max(0, (int)(ApprovalData.Now - d.Value).TotalDays).ToString() : ""); }
                    a.Di = a.Cols.Count - 1;
                }
            }
            a.Rows = data.Select(r => r.ToArray()).ToList();
            a.Mi = a.Cols.FindIndex(c => c.Kind == "money"); a.Ui = a.Cols.FindIndex(c => c.Kind == "user");

            string heading = h1.Success ? Clean(h1.Groups[1].Value) : "", subject = src.Subject ?? "";
            a.Title = subject != "" ? subject : heading; a.Heading = heading; a.Note = h2.Success ? Clean(h2.Groups[1].Value) : "";
            a.Short = a.Title; a.Icon = "\U0001F514";
            foreach (var c in Cat) if (((Regex)c[0]).IsMatch(subject + " " + heading)) { a.Short = (string)c[1]; a.Icon = (string)c[2]; break; }
            a.MaxDays = a.Di >= 0 && a.Rows.Count > 0 ? a.Rows.Max(r => (double)Num(r[a.Di])) : 0;
            a.Total = a.Mi >= 0 ? a.Rows.Sum(r => Num(r[a.Mi])) : (decimal?)null;
            a.Sev = a.Rows.Count == 0 ? "ok" : a.Di >= 0 ? Sev(a.MaxDays) : "warn";
            return a;
        }
    }

    public static class AlertSamples
    {
        static string Mk(string h1, string h2, string[] heads, string[][] rows)
        {
            var sb = new StringBuilder("<html><body><h1>" + h1 + "</h1>" + (h2 != "" ? "<h2>" + h2 + "</h2>" : "") + "<table border=\"0\" cellpadding=\"3\"><tr>");
            foreach (var h in heads) sb.Append("<th>" + h + "</th>");
            sb.Append("</tr>");
            foreach (var r in rows) { sb.Append("<tr>"); foreach (var c in r) sb.Append("<td>" + c + "</td>"); sb.Append("</tr>"); }
            return sb.Append("</table></body></html>").ToString();
        }
        static string[] R(params string[] c) { return c; }

        public static List<AlertSrc> Demo()
        {
            var inv = new[] { "TYPE", "DEPT", "JOB NO", "INV. NO", "INV. DATE", "INV. AMT.", "BY USER" };
            var unbill = new[]
            {
                R("AF", "EX", "AAE24010001", "INAAE24010011", "10-01-2024", "166,108.94", "TANAPONG"),
                R("AF", "EX", "AAE25060027", "INAAE25070008", "11-07-2025", "144,497.08", "AILADA"),
                R("AF", "EX", "PAE25090005", "INAAE25100028", "14-11-2025", "300,056.80", "KRONGKARN")
            };
            var usr = new[] { "JOBNO", "INV. NUMBER", "INV. DATE", "AMOUNT", "USER", "REMARK" };
            return new List<AlertSrc>
            {
                new AlertSrc { File = "alert_unbill.html", Subject = "Un-Bill Placement Invoice Listing",
                    Html = Mk("Invoice ที่ออกเกิน <span>7</span> วัน , สถานะ : ยังไม่วางบิล", "(เฉพาะ Invoice ที่มีเครดิต)", inv, unbill) },
                new AlertSrc { File = "alert_unappoint.html", Subject = "Un-Appoint Invoice Listing",
                    Html = Mk("Invoice ที่ออกเกิน <span>7</span> วัน , สถานะ : ยังไม่นัดรับชำระ", "(ไม่มี Appoint Date)", inv, unbill.Concat(new[]
                    {
                        R("AF", "EX", "PAE25120003", "INAAE25120017", "16-12-2025", "1,484.00", "SIRISIN"),
                        R("AF", "EX", "PAE25120002", "INAAE25120018", "16-12-2025", "1,484.00", "SIRISIN")
                    }).ToArray()) },
                new AlertSrc { File = "alert_cash.html", Subject = "Invoice เงินสด : ที่ค้างชำระเกิน 3 วัน",
                    Html = Mk("Invoice เงินสด : ที่ค้างชำระเกิน <span>3</span> วัน", "(เงินสด : คือไม่ให้ credit)",
                        new[] { "TYPE", "DEPT", "JOB NO", "INV. NO", "INV. DATE", "TOTAL DAYS", "INV. AMT.", "BY USER" }, new[]
                        {
                            R("AF", "IM", "AI26010031", "INAI26010053", "23-01-2026", "18", "18,924.78", "KAMOLCHANOK"),
                            R("SF", "EX", "ASE20120950", "INASE20121532", "31-12-2020", "1867", "3,103.00", "BOONYAPORN"),
                            R("SF", "EX", "PSE21080090", "INASE21080277", "07-08-2021", "1648", "2,925.00", "SIRADA"),
                            R("SF", "EX", "PSE21070108", "INASE21080278", "07-08-2021", "1648", "1,830.00", "SIRADA"),
                            R("SF", "EX", "PSE21070107", "INASE21080279", "07-08-2021", "1648", "1,830.00", "SIRADA"),
                            R("SF", "EX", "PSE21070106", "INASE21080280", "07-08-2021", "1648", "1,830.00", "SIRADA")
                        }) },
                new AlertSrc { File = "alert_deposit.html", Subject = "Job ค้างรับคืนค่า Deposit",
                    Html = Mk("Job ค้างรับคืนค่า <span>Deposit</span> เฉพาะที่จ่ายแล้วเกิน <span>15</span> วัน", "", usr, new[]
                    {
                        R("CI26010330", "VICI26010751", "23-01-2026", "1,500.00", "SONGPORN", ""),
                        R("CI26010267", "VICI26010680", "21-01-2026", "10,000.00", "PREEYAPORN", ""),
                        R("CI26010265", "VICI26010676", "21-01-2026", "10,000.00", "PREEYAPORN", ""),
                        R("CI26010266", "VICI26010678", "21-01-2026", "10,000.00", "PREEYAPORN", ""),
                        R("CI26010219", "VICI26010464", "16-01-2026", "2,000.00", "PREEYAPORN", ""),
                        R("CI26010118", "VICI26010367", "14-01-2026", "8,000.00", "PREEYAPORN", "")
                    }) },
                new AlertSrc { File = "alert_paid_noinv.html", Subject = "Paid job with no invoice",
                    Html = Mk("Job Period more than 3 days : PV has been issue but no billing has been issued yet.", "",
                        new[] { "TYPE", "DEPT", "JOBNO", "PERIOD", "ORIGIN", "DEST.", "USER", "PAID AMT." }, new[]
                        { R("SF", "IM", "PSI26010016", "28-01-2026", "CNDLC", "THLCH", "ANN", "6,950.00") }) },
                new AlertSrc { File = "alert_oversea.html", Subject = "Outstanding Oversea by job period",
                    Html = Mk("Oversea ค้างรับที่มี ETD/ETA/FLT เกิน<span>30</span>วัน", "(SE=ETD , SI=ETA , AIR=FLT)",
                        new[] { "AGENT", "TYPE", "DEPT", "JOB NO", "INV. NO", "JOB PERIOD", "TOTAL DAYS", "INV. AMT.", "BY USER" }, new[]
                        {
                            R("Aacier Limited", "SF", "EX", "ASE25080593", "OCNASE2500218", "22-08-2025", "170", "-6,600.00", "JUNYA"),
                            R("Aacier Limited", "SF", "EX", "ASE25090514", "OCNASE2500280", "05-10-2025", "126", "-2,237.90", "JUNYA"),
                            R("Aacier Limited", "SF", "EX", "ASE25100377", "OCNASE2500281", "20-10-2025", "111", "-1,306.00", "JUNYA"),
                            R("Aacier Private", "SF", "EX", "ASE25100379", "OCNASE2500282", "03-11-2025", "97", "-1,311.20", "JUNYA"),
                            R("Aacier Limited", "SF", "EX", "ASE25110300", "OCNASE2500306", "14-11-2025", "86", "-651.39", "JUNYA"),
                            R("Aacier Limited", "SF", "EX", "ASE25110322", "OCNASE2500307", "14-11-2025", "86", "-2,931.26", "JUNYA"),
                            R("Aacier Limited", "SF", "EX", "ASE25110423", "OCNASE2500310", "26-11-2025", "74", "-4,568.20", "JUNYA"),
                            R("Aacier Holding", "SF", "EX", "ASE25120074", "OCNASE2500315", "08-12-2025", "62", "-2,574.40", "JUNYA")
                        }) },
                new AlertSrc { File = "alert_dutytax.html", Subject = "Job ค้างรับคืนค่า Duty Tax",
                    Html = Mk("Job ค้างรับคืนค่า <span>Duty Tax</span> เฉพาะที่จ่ายแล้วเกิน <span>7</span> วัน", "", usr, new[]
                    {
                        R("CI26010271", "VICI26020045", "02-02-2026", "1,356.00", "WORANAN", ""),
                        R("CI26020047", "VICI26020080", "02-02-2026", "38,639.00", "SONGPORN", ""),
                        R("CI26010245", "VICI26020108", "02-02-2026", "29,956.00", "PAKJIRA", ""),
                        R("CI26010181", "VICI26020006", "02-02-2026", "17,961.00", "SONGPORN", "")
                    }) }
            };
        }
    }
}
