// The approval tables (TCMENU, TCSTEP, TCDETAIL ...) live in the database named by SMCOMPANY.TIMELINECFG (4th part of the '|' list).
// The connection string is read from SMCOMPANY with the normal SMFDash connection and stays inside this process (never sent to the page).
// READ ONLY: only SELECT statements are accepted.
using System;
using System.Data;
using System.Data.SqlClient;

namespace SMFDash
{
    public class TimelineDb
    {
        readonly Db _main;
        string _cs;
        public TimelineDb(Db main) { _main = main; }

        /// <summary>Forget the cached connection (after the Settings dialog changed the main connection).</summary>
        public void Reset() { _cs = null; }

        string ConnectionString
        {
            get
            {
                if (_cs != null) return _cs;
                var t = _main.Query("SELECT TOP 1 TIMELINECFG FROM SMCOMPANY");
                string cfg = t.Rows.Count == 0 ? "" : Convert.ToString(t.Rows[0][0]);
                string[] p = cfg.Split('|');
                if (p.Length < 4 || p[3].Trim() == "") throw new InvalidOperationException("SMCOMPANY.TIMELINECFG has no database connection (4th part)");
                var b = new SqlConnectionStringBuilder(p[3].Trim());
                b.ConnectTimeout = 15;
                b.ApplicationName = "SMFDash";
                return _cs = b.ConnectionString;
            }
        }

        /// <summary>Base of the attachment links: 3rd part (site) + 2nd part (folder) of SMCOMPANY.TIMELINECFG, with a trailing '/'. Empty when not configured.</summary>
        public string FileBase()
        {
            var t = _main.Query("SELECT TOP 1 TIMELINECFG FROM SMCOMPANY");
            string[] p = (t.Rows.Count == 0 ? "" : Convert.ToString(t.Rows[0][0])).Split('|');
            if (p.Length < 3 || p[1].Trim() == "" || p[2].Trim() == "") return "";
            return p[2].Trim().TrimEnd('/') + "/" + p[1].Trim().Trim('/') + "/";
        }

        /// <summary>Server / database for display (no user, no password).</summary>
        public string Target
        {
            get
            {
                try { var b = new SqlConnectionStringBuilder(ConnectionString); return b.DataSource + " / " + b.InitialCatalog; }
                catch { return ""; }
            }
        }

        public DataTable Query(string sql)
        {
            if (!sql.TrimStart().StartsWith("SELECT", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("SMFDash is read-only: only SELECT is allowed");
            using (var cn = new SqlConnection(ConnectionString))
            using (var cmd = new SqlCommand(sql, cn))
            {
                cmd.CommandTimeout = 30;
                var dt = new DataTable();
                cn.Open();
                using (var rd = cmd.ExecuteReader()) dt.Load(rd);
                return dt;
            }
        }
    }
}
