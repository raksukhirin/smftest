// Alerts straight from the database: SMALERTDEF lists the alerts, each one points at a view (AL_xxx) that is SELECTed here.
// See sql\alerts_setup.sql. Read-only (Db.Query only allows SELECT). Rows are turned into the same table the HTML parser produces,
// so the page does not care where an alert came from.
using System;
using System.Collections.Generic;
using System.Data;
using System.Globalization;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;

namespace SMFDash
{
    public static class LiveAlerts
    {
        const int MaxRows = 5000;
        static readonly Regex SafeName = new Regex(@"^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)?$", RegexOptions.Compiled);

        /// <summary>Active alerts from SMALERTDEF, in SORTNO order. Throws when the table does not exist yet.</summary>
        public static List<AlertSrc> Load(Db db, out string warning)
        {
            warning = "";
            var list = new List<AlertSrc>();
            var defs = db.Query("SELECT ALERTCODE, TITLE, SHORTNAME, HEADING, NOTE, VIEWNAME FROM SMALERTDEF WHERE ACTIVE = 1 ORDER BY SORTNO, ALERTCODE");
            foreach (DataRow d in defs.Rows)
            {
                string code = S(d["ALERTCODE"]), view = S(d["VIEWNAME"]);
                if (!SafeName.IsMatch(view)) { warning += code + ": bad view name; "; continue; }
                try
                {
                    var dt = db.Query("SELECT TOP " + MaxRows + " * FROM " + view);
                    string title = S(d["TITLE"]);
                    list.Add(new AlertSrc
                    {
                        File = code, Subject = title, Short = S(d["SHORTNAME"]),
                        Html = Html(S(d["HEADING"]) != "" ? S(d["HEADING"]) : title, S(d["NOTE"]), dt)
                    });
                }
                catch (Exception ex) { warning += code + ": " + ex.GetBaseException().Message + "; "; }
            }
            return list;
        }

        static string S(object o) { return o == null || o is DBNull ? "" : Convert.ToString(o, CultureInfo.InvariantCulture).Trim(); }
        static string E(string s) { return WebUtility.HtmlEncode(s); }

        // DOCNO is only the de-duplication key for SMALERT; it is not shown
        static string Html(string heading, string note, DataTable dt)
        {
            var cols = new List<DataColumn>();
            foreach (DataColumn c in dt.Columns) if (!c.ColumnName.Equals("DOCNO", StringComparison.OrdinalIgnoreCase)) cols.Add(c);
            var sb = new StringBuilder("<html><body><h1>" + E(heading) + "</h1>" + (note != "" ? "<h2>" + E(note) + "</h2>" : "") + "<table><tr>");
            foreach (var c in cols) sb.Append("<th>" + E(c.ColumnName.Replace('_', ' ')) + "</th>");
            sb.Append("</tr>");
            foreach (DataRow r in dt.Rows)
            {
                sb.Append("<tr>");
                foreach (var c in cols) sb.Append("<td>" + E(Fmt(r[c], c.DataType)) + "</td>");
                sb.Append("</tr>");
            }
            return sb.Append("</table></body></html>").ToString();
        }

        // same text shapes as the mail (dd-MM-yyyy, 1,234.00) so AlertParser detects the column kinds the same way
        static string Fmt(object v, Type t)
        {
            if (v == null || v is DBNull) return "";
            if (v is DateTime) return ((DateTime)v).ToString("dd-MM-yyyy", CultureInfo.InvariantCulture);
            if (v is decimal || v is double || v is float) return Convert.ToDecimal(v, CultureInfo.InvariantCulture).ToString("#,0.00", CultureInfo.InvariantCulture);
            return Convert.ToString(v, CultureInfo.InvariantCulture).Trim();
        }
    }
}
