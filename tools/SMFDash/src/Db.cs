// SMF DB access for the dashboard — READ ONLY: this program only ever runs SELECT statements.
using System;
using System.Data;
using System.Data.SqlClient;

namespace SMFDash
{
    public class Db
    {
        readonly Ini _ini;
        public Db(Ini ini) { _ini = ini; }
        public Ini Ini { get { return _ini; } }

        public bool Configured
        {
            get { return _ini.Get("Database", "Server") != "" && _ini.Get("Database", "Database") != ""; }
        }

        public string ConnectionString
        {
            get
            {
                return Build(_ini.GetSecret("Database", "Server"), _ini.GetSecret("Database", "Database"), _ini.GetSecret("Database", "User"),
                             _ini.GetSecret("Database", "Password"), _ini.GetInt("Database", "Timeout", 15));
            }
        }

        public static string Build(string server, string database, string user, string password, int timeout)
        {
            var b = new SqlConnectionStringBuilder();
            b.DataSource = server;
            b.InitialCatalog = database;
            if ((user ?? "") == "") b.IntegratedSecurity = true;
            else { b.UserID = user; b.Password = password ?? ""; }
            b.ConnectTimeout = timeout;
            b.ApplicationName = "SMFDash";
            return b.ConnectionString;
        }

        public static string Test(string connectionString)
        {
            using (var cn = new SqlConnection(connectionString))
            {
                cn.Open();
                using (var c = new SqlCommand("SELECT DB_NAME()", cn))
                    return "Connected: " + c.ExecuteScalar() + " (SQL " + cn.ServerVersion + ")";
            }
        }

        /// <summary>Host / database for the status bar (no user, no password).</summary>
        public string Target
        {
            get
            {
                try
                {
                    var b = new SqlConnectionStringBuilder(ConnectionString);
                    return b.DataSource + " / " + b.InitialCatalog;
                }
                catch { return "(invalid connection settings)"; }
            }
        }

        public DataTable Query(string sql)
        {
            string head = sql.TrimStart();
            if (!head.StartsWith("SELECT", StringComparison.OrdinalIgnoreCase))
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
