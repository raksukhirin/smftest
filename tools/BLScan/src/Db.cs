// ติดต่อ SMF DB — โหมด UPDATE record ที่สร้างรอไว้แล้ว (SFHBL.DOCNO = key)
// กฎ:
//   * SFHBL  : UPDATE ... WHERE DOCNO=@d เท่านั้น (ไม่ INSERT, ไม่ DELETE) · DOCNO ว่าง = ปฏิเสธ · DOCNO ไม่เคยอยู่ใน SET
//   * SFMARK : มีแล้ว → UPDATE แถวแรก (HBLREF=DOCNO เรียง SEQNO,DETID) · ยังไม่มี → INSERT 1 แถว
//   * ช่องที่ scan ได้ค่าว่างจะไม่ไปทับค่าเดิม · ไม่ตรวจ LOCK (ตามที่กำหนด) แต่ตั้ง LOCK/EDITBY/EDITDATE ใหม่เหมือน frmSFBL
using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Linq;

namespace BLScan
{
    /// <summary>ข้อมูลเดิมใน DB ของ DOCNO หนึ่งๆ</summary>
    public class ExistingDoc
    {
        public Dictionary<string, string> V = new Dictionary<string, string>();
        public int MarkRows;          // จำนวนแถว SFMARK ของ HBLREF นี้
        public int MarkDetId;         // DETID ของแถวแรกที่จะ UPDATE (0 = ยังไม่มี)
        public string JobNo { get { return Fields.Val(V, "JOBNO"); } }
        public string JobClass { get { return Fields.Val(V, "JOBCLASS"); } }
    }

    public class UpdateResult
    {
        public string Message;
        public List<string> HblChanges = new List<string>();
        public string MarkAction = "";
        public List<string> MarkChanges = new List<string>();
    }

    public class Db
    {
        readonly Ini _ini;
        public Db(Ini ini) { _ini = ini; }

        public string ConnectionString
        {
            get
            {
                string cs = _ini.GetSecret("Database", "ConnectionString");
                if (cs != "") return cs;
                return Build(_ini.Get("Database", "Server"), _ini.Get("Database", "Database"), _ini.Get("Database", "User"),
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
            b.ApplicationName = "BLScan";
            return b.ConnectionString;
        }

        /// <summary>ทดสอบ connection string ที่ยังไม่ได้บันทึก (ใช้ในหน้าตั้งค่า)</summary>
        public static string TestConnectionString(string connectionString)
        {
            using (var cn = new SqlConnection(connectionString))
            {
                cn.Open();
                using (var c = new SqlCommand("SELECT DB_NAME()", cn))
                    return "เชื่อมต่อได้: " + c.ExecuteScalar() + " (SQL " + cn.ServerVersion + ")";
            }
        }

        /// <summary>ชื่อ server/database สำหรับแสดง (ไม่แสดงรหัสผ่าน)</summary>
        public string Target
        {
            get
            {
                try
                {
                    var b = new SqlConnectionStringBuilder(ConnectionString);
                    return b.DataSource + " / " + b.InitialCatalog + (b.IntegratedSecurity ? " (Windows auth)" : " (user " + b.UserID + ")");
                }
                catch (Exception ex) { return "ConnectionString ผิด: " + ex.Message; }
            }
        }

        public bool Configured
        {
            get { return _ini.Get("Database", "ConnectionString") != "" || _ini.Get("Database", "Server") != ""; }
        }

        public Ini Ini { get { return _ini; } }

        /// <summary>ถอดรหัสผ่านใน ini ไม่ได้ (ไฟล์ถูกเข้ารหัสโดยผู้ใช้/เครื่องอื่น)</summary>
        public string SecretProblem
        {
            get
            {
                try { _ini.GetSecret("Database", "Password"); _ini.GetSecret("Database", "ConnectionString"); return ""; }
                catch (Exception ex) { return ex.Message; }
            }
        }

        SqlConnection Open()
        {
            var cn = new SqlConnection(ConnectionString);
            cn.Open();
            return cn;
        }

        static SqlCommand Cmd(SqlConnection cn, string sql, SqlTransaction tx = null)
        {
            var c = new SqlCommand(sql, cn, tx);
            c.CommandTimeout = 30;
            return c;
        }

        public string TestConnection()
        {
            using (var cn = Open())
            using (var c = Cmd(cn, "SELECT DB_NAME()"))
                return "เชื่อมต่อได้: " + c.ExecuteScalar() + " (SQL " + cn.ServerVersion + ")";
        }

        static string S(IDataRecord r, int i) { return r.IsDBNull(i) ? "" : r.GetValue(i).ToString().Trim(); }

        static string Fmt(object o)
        {
            if (o == null || o == DBNull.Value) return "";
            if (o is DateTime) return ((DateTime)o).ToString("yyyy-MM-dd");
            if (o is decimal) return ((decimal)o).ToString("0.#####", System.Globalization.CultureInfo.InvariantCulture);
            return o.ToString();
        }

        // ---------------------------------------------------------------- อ่าน record เดิม

        /// <summary>โหลด SFHBL (ตาม DOCNO) + แถวแรกของ SFMARK — คืน null ถ้า DOCNO ไม่มีใน SFHBL</summary>
        public ExistingDoc LoadExisting(string docNo)
        {
            if (string.IsNullOrWhiteSpace(docNo)) return null;
            var hblCols = Fields.All.Where(f => f.Table == "SFHBL").Select(f => f.Key).Concat(new[] { "DOCTYPE" }).Distinct().ToList();
            var markCols = Fields.All.Where(f => f.Table == "SFMARK").Select(f => f.Key).ToList();
            var doc = new ExistingDoc();
            using (var cn = Open())
            {
                using (var c = Cmd(cn, "SELECT TOP 1 " + string.Join(",", hblCols) + " FROM SFHBL WHERE DOCNO=@d"))
                {
                    c.Parameters.Add("@d", SqlDbType.VarChar, 20).Value = docNo;
                    using (var r = c.ExecuteReader())
                    {
                        if (!r.Read()) return null;
                        for (int i = 0; i < hblCols.Count; i++) doc.V[hblCols[i]] = Fmt(r.GetValue(i));
                    }
                }
                using (var c = Cmd(cn, "SELECT COUNT(*) FROM SFMARK WHERE HBLREF=@d"))
                {
                    c.Parameters.Add("@d", SqlDbType.VarChar, 20).Value = docNo;
                    doc.MarkRows = (int)c.ExecuteScalar();
                }
                if (doc.MarkRows > 0)
                    using (var c = Cmd(cn, "SELECT TOP 1 DETID," + string.Join(",", markCols) + " FROM SFMARK WHERE HBLREF=@d ORDER BY ISNULL(SEQNO,2147483647), DETID"))
                    {
                        c.Parameters.Add("@d", SqlDbType.VarChar, 20).Value = docNo;
                        using (var r = c.ExecuteReader())
                            if (r.Read())
                            {
                                doc.MarkDetId = Convert.ToInt32(r.GetValue(0));
                                for (int i = 0; i < markCols.Count; i++) doc.V[markCols[i]] = Fmt(r.GetValue(i + 1));
                            }
                    }
            }
            return doc;
        }

        // ---------------------------------------------------------------- เติมรหัสจากตารางหลัก

        /// <summary>
        /// เติมรหัสที่ OCR ไม่มี: ท่า (จาก HBL อื่นของงานเดียวกัน → OPPORT), หน่วย (SMUOM), คู่ค้า (SMBUSINESS ตามชื่อ ไม่เจอ = N/A)
        /// คืนข้อความอธิบายสิ่งที่เติม/ที่เติมไม่ได้
        /// </summary>
        public List<string> Enrich(Dictionary<string, string> v, string jobNo, Dictionary<string, string> existing)
        {
            existing = existing ?? new Dictionary<string, string>();
            var notes = new List<string>();
            using (var cn = Open())
            {
                // ท่า
                var jobPorts = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                if (!string.IsNullOrWhiteSpace(jobNo))
                    using (var c = Cmd(cn, @"SELECT RECPORT,RECPORTNAME,LOADPORT,LOADPORTNAME,DISPORT,DISPORTNAME,DELPORT,DELPORTNAME,FINALPORT,FINALPORTNAME
                                              FROM SFHBL WHERE JOBNO=@j ORDER BY CASE WHEN DOCTYPE='Allocated' THEN 0 ELSE 1 END, DOCNO"))
                    {
                        c.Parameters.Add("@j", SqlDbType.VarChar, 20).Value = jobNo;
                        using (var r = c.ExecuteReader())
                            while (r.Read())
                                for (int i = 0; i < 10; i += 2)
                                {
                                    string code = S(r, i), name = S(r, i + 1), cur;
                                    if (code == "" || name == "") continue;
                                    if (!jobPorts.TryGetValue(name, out cur) || (cur.Length != 5 && code.Length == 5)) jobPorts[name] = code;
                                }
                    }
                foreach (var p in new[] { "RECPORT", "LOADPORT", "DISPORT", "DELPORT", "FINALPORT" })
                {
                    string name = Fields.Val(v, p + "NAME").Trim();
                    if (Fields.Val(v, p).Trim() != "" || name == "") continue;
                    string code;
                    if (!jobPorts.TryGetValue(name, out code))
                    {
                        var cands = new List<string>();
                        // ชื่อบนใบ B/L มักสั้นกว่าใน OPPORT ("BANGKOK" vs "BANGKOK, THAILAND") → ตรงเป๊ะ หรือขึ้นต้นด้วยชื่อ + ","
                        using (var c = Cmd(cn, "SELECT DISTINCT PORTCODE FROM OPPORT WHERE PORTTYPE='SF' AND (UPPER(LTRIM(RTRIM(PORTNAME)))=UPPER(@n) OR PORTNAME LIKE @like ESCAPE '\\') ORDER BY PORTCODE"))
                        {
                            c.Parameters.Add("@n", SqlDbType.VarChar, 150).Value = name;
                            c.Parameters.Add("@like", SqlDbType.VarChar, 160).Value =
                                name.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_").Replace("[", "\\[") + ",%";
                            using (var r = c.ExecuteReader()) while (r.Read()) cands.Add(S(r, 0));
                        }
                        var five = cands.Where(x => x.Length == 5).ToList();
                        code = cands.Count == 1 ? cands[0] : (five.Count == 1 ? five[0] : "");
                        if (code == "") notes.Add(cands.Count == 0 ? "ท่า \"" + name + "\" ไม่พบใน OPPORT" : "ท่า \"" + name + "\" มีหลายรหัส (" + string.Join(", ", cands) + ") — ไม่เดา กรุณาใส่เอง");
                    }
                    if (code != "") v[p] = code;
                }

                // หน่วยบรรจุ
                if (Fields.Val(v, "UNITCODE").Trim() == "" && Fields.Val(v, "PKGUNIT").Trim() != "")
                    using (var c = Cmd(cn, "SELECT TOP 1 UOMCODE FROM SMUOM WHERE UOMNAME=@n OR UOMCODE=@n ORDER BY CASE WHEN UOMNAME=@n THEN 0 ELSE 1 END"))
                    {
                        c.Parameters.Add("@n", SqlDbType.VarChar, 100).Value = Fields.Val(v, "PKGUNIT").Trim();
                        var o = c.ExecuteScalar();
                        if (o != null && o != DBNull.Value) v["UNITCODE"] = o.ToString().Trim();
                        else notes.Add("หน่วย \"" + Fields.Val(v, "PKGUNIT") + "\" ไม่พบใน SMUOM");
                    }

                // คู่ค้า: ชื่อ = บรรทัดแรกที่ scan ได้ → หารหัสใน SMBUSINESS.COMNAME
                //   พบ        → รหัสที่พบ, ชื่อ = บรรทัดแรก, ที่อยู่ = ที่ scan ได้
                //   ไม่พบ + record เดิมว่าง (รหัสและชื่อว่างทั้งคู่) → รหัส N/A, ชื่อ = บรรทัดแรก, ที่อยู่ = ที่ scan ได้
                //   ไม่พบ + record เดิมไม่ว่าง                      → คงรหัสเดิม, ชื่อ = บรรทัดแรก, ที่อยู่ = ที่ scan ได้
                //   บรรทัดแรกเป็นที่อยู่ → ถือว่าไม่มีชื่อ ใช้ N/A เป็นชื่อ
                foreach (var p in new[] { new[] { "SHIPPER", "SHIPPERNAME", "S_ADD" }, new[] { "CONSIGNEE", "CONSIGNEENAME", "C_ADD" },
                                          new[] { "NOTIFY", "NOTIFYNAME", "N_ADD" }, new[] { "AGENTNO", "AGENTNAME", "A_ADD" } })
                {
                    string label = p[1].Replace("NAME", "");
                    // ชื่อ = บรรทัดแรกของข้อความที่ scan ได้ (อ่านจากช่องที่อยู่ ซึ่งไม่ถูกแก้ จึงเรียกซ้ำกี่ครั้งก็ได้ผลเดิม)
                    string firstLine = Fields.Val(v, p[2]).Replace("\r\n", "\n").Split('\n').Select(l => l.Trim()).FirstOrDefault(l => l != "") ?? "";
                    // บรรทัดแรกหน้าตาเป็นที่อยู่ = ไม่มีชื่อ → ใช้ N/A เป็นชื่อ (แล้วหารหัสด้วยชื่อ N/A ตามปกติ)
                    if (firstLine != "" && p[0] == "AGENTNO" && BLParser.LooksLikeAddress(firstLine))
                    {
                        // Agent มีข้อความบนใบ แต่ไม่มีชื่อ (บรรทัดแรกเป็นที่อยู่) → ไม่แตะรหัส/ชื่อ agent เดิม (ว่าง = ไม่เขียนทับ) update เฉพาะ A_ADD
                        // (ถ้าไม่มีข้อความ agent บนใบเลย A_ADD ว่างอยู่แล้ว → ข้ามทั้งชุดโดยอัตโนมัติ)
                        v["AGENTNO"] = ""; v["AGENTNAME"] = "";
                        notes.Add("Agent: บรรทัดแรก \"" + firstLine + "\" เป็นที่อยู่ ไม่มีชื่อ agent บนใบ B/L → ไม่แตะรหัส/ชื่อ update เฉพาะ A_ADD");
                        continue;
                    }
                    if (firstLine != "" && BLParser.LooksLikeAddress(firstLine))
                    {
                        notes.Add(label + " บรรทัดแรก \"" + firstLine + "\" เป็นที่อยู่ ไม่ใช่ชื่อ → ชื่อ = N/A");
                        firstLine = "N/A";
                    }
                    if (firstLine != "") v[p[1]] = firstLine;
                    string name = Fields.Val(v, p[1]).Trim();
                    if (name == "") { v[p[0]] = ""; continue; }       // scan ไม่ได้ = ไม่แตะอะไรเลย
                    var cands = new List<string>();
                    using (var c = Cmd(cn, "SELECT COMNO FROM SMBUSINESS WHERE UPPER(LTRIM(RTRIM(COMNAME)))=UPPER(@n) ORDER BY INACTIVE, COMNO"))
                    {
                        c.Parameters.Add("@n", SqlDbType.VarChar, 255).Value = name;
                        using (var r = c.ExecuteReader()) while (r.Read()) cands.Add(S(r, 0));
                    }
                    if (cands.Count > 0)
                    {
                        v[p[0]] = cands[0];
                        if (cands.Count > 1) notes.Add(label + " \"" + name + "\" พบหลายรหัส (" + string.Join(", ", cands) + ") → ใช้ " + cands[0]);
                        continue;
                    }
                    string oldCode = Fields.Val(existing, p[0]).Trim(), oldName = Fields.Val(existing, p[1]).Trim();
                    if (oldCode == "" && oldName == "")
                    {
                        v[p[0]] = "N/A";
                        notes.Add(label + " \"" + name + "\" ไม่พบใน SMBUSINESS, record เดิมว่าง → รหัส N/A ชื่อ = บรรทัดแรกที่ scan ได้");
                    }
                    else
                    {
                        v[p[0]] = oldCode;     // คงรหัสเดิม — ชื่อ = บรรทัดแรกที่ scan ได้ (อยู่ใน v อยู่แล้ว) ที่อยู่ = ที่ scan ได้
                        notes.Add(label + " \"" + name + "\" ไม่พบใน SMBUSINESS, record เดิมไม่ว่าง → คงรหัส " + oldCode + " ชื่อ/ที่อยู่ = ที่ scan ได้ (ชื่อเดิม \"" + oldName + "\")");
                    }
                }
            }
            return notes;
        }

        // ---------------------------------------------------------------- UPDATE

        static SqlDbType SqlType(FieldDef f)
        {
            switch (f.Kind)
            {
                case FieldKind.Date: return SqlDbType.DateTime;
                case FieldKind.Decimal: return SqlDbType.Decimal;
                case FieldKind.Int: return SqlDbType.Int;
                case FieldKind.Memo: return SqlDbType.Text;
                default: return SqlDbType.VarChar;
            }
        }

        static object ToDb(FieldDef f, string s)
        {
            s = s ?? "";
            DateTime dt; decimal d;
            switch (f.Kind)
            {
                case FieldKind.Date: return Fields.TryDate(s, out dt) ? (object)dt.Date : DBNull.Value;
                case FieldKind.Decimal: return Fields.TryDec(s, out d) ? (object)d : DBNull.Value;
                case FieldKind.Int: return int.Parse(s.Trim());
                case FieldKind.Memo: return s.Replace("\r\n", "\n").Replace("\n", "\r\n");   // เก็บแบบ frmSFBL: CRLF
                default: return s.Trim();
            }
        }

        /// <summary>
        /// UPDATE SFHBL (WHERE DOCNO) + UPDATE/INSERT SFMARK ใน transaction เดียว
        /// dryRun = ทำจริงทุกขั้นแล้ว ROLLBACK
        /// </summary>
        public UpdateResult Update(Dictionary<string, string> scan, string docNo, string userId, bool dryRun)
        {
            docNo = (docNo ?? "").Trim();
            if (docNo == "") throw new InvalidOperationException("DOCNO ว่าง — ห้าม update");
            var res = new UpdateResult();
            double lockVal = DateTime.Now.ToOADate();     // VB: .Fields("Lock") = CDbl(Now)

            using (var cn = Open())
            using (var tx = cn.BeginTransaction(IsolationLevel.ReadCommitted))
            {
                // ---- อ่านค่าเดิมใน transaction (ล็อกแถว) ----
                var cur = new Dictionary<string, string>();
                var hblCols = Fields.All.Where(f => f.Table == "SFHBL").Select(f => f.Key).Concat(new[] { "DOCTYPE" }).Distinct().ToList();
                using (var c = Cmd(cn, "SELECT TOP 1 " + string.Join(",", hblCols) + " FROM SFHBL WITH (UPDLOCK, ROWLOCK) WHERE DOCNO=@d", tx))
                {
                    c.Parameters.Add("@d", SqlDbType.VarChar, 20).Value = docNo;
                    using (var r = c.ExecuteReader())
                    {
                        if (!r.Read()) { r.Close(); tx.Rollback(); throw new InvalidOperationException("ไม่พบ DOCNO " + docNo + " ใน SFHBL — ต้องสร้าง record รอไว้ก่อน (โปรแกรมนี้ไม่ INSERT SFHBL)"); }
                        for (int i = 0; i < hblCols.Count; i++) cur[hblCols[i]] = Fmt(r.GetValue(i));
                    }
                }
                string jobNo = Fields.Val(cur, "JOBNO"), jobClass = Fields.Val(cur, "JOBCLASS");

                // ---- SFHBL ----
                var changes = Fields.Plan(scan, cur).Where(x => x.F.Table == "SFHBL" && x.Differs).ToList();
                if (changes.Count > 0)
                {
                    var cmd = Cmd(cn, "", tx);
                    var sets = new List<string>();
                    foreach (var ch in changes)
                    {
                        sets.Add(ch.F.Key + "=@" + ch.F.Key);
                        var p = ch.F.MaxLen > 0 ? cmd.Parameters.Add("@" + ch.F.Key, SqlType(ch.F), ch.F.MaxLen) : cmd.Parameters.Add("@" + ch.F.Key, SqlType(ch.F));
                        p.Value = ToDb(ch.F, ch.New);
                        if (p.SqlDbType == SqlDbType.Decimal) { p.Precision = 18; p.Scale = 5; }
                        res.HblChanges.Add(ch.F.Key + ": [" + Short(ch.Old) + "] → [" + Short(ch.New) + "]");
                    }
                    // งานขาออก: ETDETA = ETD (เหมือน frmSFBL.UpdateData) — งานขาเข้าไม่แตะ เพราะ ETA ไม่อยู่บนใบ B/L
                    if (jobClass == "EX" && changes.Any(x => x.F.Key == "ETD"))
                    {
                        sets.Add("ETDETA=@ETD");
                        res.HblChanges.Add("ETDETA: = ETD (งาน EX)");
                    }
                    sets.Add("LOCK=@LOCK"); cmd.Parameters.Add("@LOCK", SqlDbType.Float).Value = lockVal;
                    sets.Add("EDITBY=@EDITBY"); cmd.Parameters.Add("@EDITBY", SqlDbType.VarChar, 20).Value = userId;
                    sets.Add("EDITDATE=@EDITDATE"); cmd.Parameters.Add("@EDITDATE", SqlDbType.DateTime).Value = DateTime.Now;
                    cmd.Parameters.Add("@DOCNO", SqlDbType.VarChar, 20).Value = docNo;
                    cmd.CommandText = "UPDATE SFHBL SET " + string.Join(", ", sets) + " WHERE DOCNO=@DOCNO";
                    int n = cmd.ExecuteNonQuery();
                    if (n != 1) { tx.Rollback(); throw new InvalidOperationException("UPDATE SFHBL กระทบ " + n + " แถว (ต้องเป็น 1) — ยกเลิก"); }
                }

                // ---- SFMARK ----
                int rows; int detId = 0;
                using (var c = Cmd(cn, "SELECT COUNT(*) FROM SFMARK WITH (UPDLOCK, ROWLOCK) WHERE HBLREF=@d", tx))
                {
                    c.Parameters.Add("@d", SqlDbType.VarChar, 20).Value = docNo;
                    rows = (int)c.ExecuteScalar();
                }
                var mark = new Dictionary<string, string>();       // ชื่อคอลัมน์ SFMARK → ค่าใหม่ (เฉพาะที่ไม่ว่าง)
                Action<string, string> m = (col, key) => { string s = Fields.Val(scan, key).Trim(); if (s != "") mark[col] = Fields.Val(scan, key); };
                m("MARKDESC", "MARKDESC"); m("GOODS", "GOODS"); m("UNITCODE", "UNITCODE"); m("PKGUNIT", "PKGUNIT"); m("PKGQTY", "PKGQTY");
                m("GW", "GW"); m("CBM", "CBM"); m("PKGWORD", "PKGWORD"); m("CONSIGNEENAME", "CONSIGNEENAME");
                string master = Fields.Val(cur, "MASTERNO").Trim();
                if (master != "") mark["NEWHBLNO"] = master;

                if (rows > 0)
                {
                    using (var c = Cmd(cn, "SELECT TOP 1 DETID FROM SFMARK WHERE HBLREF=@d ORDER BY ISNULL(SEQNO,2147483647), DETID", tx))
                    {
                        c.Parameters.Add("@d", SqlDbType.VarChar, 20).Value = docNo;
                        detId = Convert.ToInt32(c.ExecuteScalar());
                    }
                    res.MarkAction = "UPDATE SFMARK DETID " + detId + (rows > 1 ? " (แถวแรก จากทั้งหมด " + rows + " แถว)" : "");
                    var cmd = Cmd(cn, "", tx);
                    var sets = new List<string>();
                    foreach (var kv in mark)
                    {
                        var f = MarkField(kv.Key);
                        sets.Add(kv.Key + "=@" + kv.Key);
                        var mp = cmd.Parameters.Add("@" + kv.Key, f.Item1, f.Item2);
                        mp.Value = f.Item3(kv.Value);
                        if (f.Item1 == SqlDbType.Decimal) { mp.Precision = 18; mp.Scale = 5; }
                        res.MarkChanges.Add(kv.Key + " = [" + Short(kv.Value) + "]");
                    }
                    sets.Add("LOCK=@LOCK"); cmd.Parameters.Add("@LOCK", SqlDbType.Float).Value = lockVal;
                    cmd.Parameters.Add("@DETID", SqlDbType.Int).Value = detId;
                    cmd.CommandText = "UPDATE SFMARK SET " + string.Join(", ", sets) + " WHERE DETID=@DETID AND HBLREF=@HBLREF";
                    cmd.Parameters.Add("@HBLREF", SqlDbType.VarChar, 20).Value = docNo;
                    int n = cmd.ExecuteNonQuery();
                    if (n != 1) { tx.Rollback(); throw new InvalidOperationException("UPDATE SFMARK กระทบ " + n + " แถว (ต้องเป็น 1) — ยกเลิก"); }
                }
                else
                {
                    res.MarkAction = "INSERT SFMARK ใหม่ 1 แถว";
                    var vals = new Dictionary<string, object>();
                    vals["LOCK"] = lockVal; vals["JOBNO"] = jobNo; vals["MARKSTAT"] = ""; vals["HBLREF"] = docNo;
                    vals["DOCTYPE"] = Fields.Val(cur, "DOCTYPE") == "" ? "Direct" : Fields.Val(cur, "DOCTYPE");
                    vals["SEQNO"] = 1; vals["GOODS2"] = ""; vals["NEWHBLNO"] = master; vals["NW"] = 0m;
                    vals["CTNLIST"] = ""; vals["PKGUNIT2"] = ""; vals["PKGQTY2"] = 0m; vals["PKGUNIT3"] = ""; vals["PKGQTY3"] = 0m;
                    vals["UOMDETAIL"] = ""; vals["CTNNOLIST"] = ""; vals["CTNALLOC"] = ""; vals["TEMPMKEY"] = docNo + ".1";
                    foreach (var col in new[] { "MARKDESC", "GOODS", "UNITCODE", "PKGUNIT", "PKGWORD", "CONSIGNEENAME" }) vals[col] = "";
                    foreach (var col in new[] { "PKGQTY", "GW", "CBM" }) vals[col] = 0m;
                    foreach (var kv in mark) { vals[kv.Key] = MarkField(kv.Key).Item3(kv.Value); res.MarkChanges.Add(kv.Key + " = [" + Short(kv.Value) + "]"); }
                    var cmd = Cmd(cn, "", tx);
                    foreach (var kv in vals)
                    {
                        var p = cmd.Parameters.Add("@" + kv.Key, kv.Value is double ? SqlDbType.Float : kv.Value is decimal ? SqlDbType.Decimal : kv.Value is int ? SqlDbType.Int
                                  : (kv.Key == "MARKDESC" || kv.Key == "GOODS" || kv.Key == "GOODS2" || kv.Key == "PKGWORD" || kv.Key == "CTNLIST" || kv.Key == "UOMDETAIL" || kv.Key == "CTNNOLIST") ? SqlDbType.Text : SqlDbType.VarChar);
                        p.Value = kv.Value;
                        if (kv.Value is decimal) { p.Precision = 18; p.Scale = 5; }
                    }
                    // DETID เป็น identity (PK) — ไม่ใส่ในคำสั่ง ให้ DB รันเลขเอง
                    string cols = string.Join(",", vals.Keys), args = string.Join(",", vals.Keys.Select(k => "@" + k));
                    if (dryRun)
                    {
                        // INSERT ที่ไม่เพิ่มแถว (WHERE 1=0) — ตรวจชื่อคอลัมน์/ชนิดข้อมูลได้ แต่ไม่ใช้เลข identity (rollback ไม่คืนเลข DETID)
                        cmd.CommandText = "INSERT INTO SFMARK (" + cols + ") SELECT " + args + " WHERE 1=0";
                        cmd.ExecuteNonQuery();
                        res.MarkAction = "INSERT SFMARK ใหม่ 1 แถว (dry run ตรวจ SQL แบบไม่เพิ่มแถว — DETID ไม่ถูกใช้)";
                    }
                    else
                    {
                        cmd.CommandText = "INSERT INTO SFMARK (" + cols + ") VALUES (" + args + "); SELECT CAST(SCOPE_IDENTITY() AS int)";
                        int newId = Convert.ToInt32(cmd.ExecuteScalar());
                        res.MarkAction = "INSERT SFMARK ใหม่ 1 แถว DETID " + newId;
                    }
                }

                if (dryRun)
                {
                    tx.Rollback();
                    res.Message = "DRY RUN ผ่าน — SFHBL เปลี่ยน " + res.HblChanges.Count + " ช่อง, " + res.MarkAction + " แล้ว ROLLBACK (ไม่มีข้อมูลเปลี่ยนใน DB)";
                }
                else
                {
                    tx.Commit();
                    res.Message = "บันทึกแล้ว: SFHBL.DOCNO=" + docNo + " (" + res.HblChanges.Count + " ช่อง) + " + res.MarkAction;
                }
                return res;
            }
        }

        static string Short(string s)
        {
            s = (s ?? "").Replace("\r\n", " ⏎ ").Replace("\n", " ⏎ ");
            return s.Length > 70 ? s.Substring(0, 67) + "…" : s;
        }

        /// <summary>ชนิด/ขนาด/ตัวแปลงค่าของคอลัมน์ SFMARK ที่โปรแกรมเขียน</summary>
        static Tuple<SqlDbType, int, Func<string, object>> MarkField(string col)
        {
            Func<string, object> memo = s => s.Replace("\r\n", "\n").Replace("\n", "\r\n");
            Func<string, object> dec = s => { decimal d; return Fields.TryDec(s, out d) ? (object)d : 0m; };
            Func<string, object> txt = s => s.Trim();
            switch (col)
            {
                case "MARKDESC": case "GOODS": case "PKGWORD": return Tuple.Create(SqlDbType.Text, 0, memo);
                case "GW": case "CBM": case "PKGQTY": return Tuple.Create(SqlDbType.Decimal, 0, dec);
                case "PKGUNIT": return Tuple.Create(SqlDbType.VarChar, 20, txt);
                case "UNITCODE": return Tuple.Create(SqlDbType.VarChar, 5, txt);
                case "CONSIGNEENAME": return Tuple.Create(SqlDbType.VarChar, 1000, txt);
                default: return Tuple.Create(SqlDbType.VarChar, 50, txt);       // NEWHBLNO
            }
        }
    }
}
