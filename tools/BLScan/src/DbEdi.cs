// นำเข้า EDI: เพิ่ม HB/L (SFHBL + SFMARK) ต่อท้ายใต้งาน (JOBNO) ที่มีอยู่ + ตู้ของงาน + ข้อมูลเรือ/ท่าของงาน
//   DOCNO ใหม่ = JOBNO + "/" + เลขวิ่ง 3 หลัก (ต่อจากเลขสูงสุดที่มี) · B/L No. ที่มีอยู่แล้วในงานนี้ = แก้ไข HB/L เดิม ไม่เพิ่มซ้ำ
//   ทุกอย่างอยู่ใน transaction เดียว — dryRun = ทำจริงทุกขั้นแล้ว ROLLBACK
using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;

namespace BLScan
{
    public class EdiRowResult
    {
        public const string SkipText = "ข้าม (แก้ใน SMF แล้ว)";
        public string BlNo = "", DocNo = "", Action = "";
        public List<string> Notes = new List<string>();
    }

    public class EdiResult
    {
        public string Message = "";
        public List<EdiRowResult> Rows = new List<EdiRowResult>();
        public List<string> JobLines = new List<string>();
        public List<string> Notes = new List<string>();
        public int Added { get { return Rows.Count(r => r.Action == "เพิ่มใหม่"); } }
        public int Skipped { get { return Rows.Count(r => r.Action == EdiRowResult.SkipText); } }
        public int Updated { get { return Rows.Count(r => r.Action == "แก้ไขของเดิม"); } }
    }

    public partial class Db
    {
        static readonly HashSet<string> MemoCols = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            { "S_ADD", "C_ADD", "N_ADD", "A_ADD", "PKGWORD", "CTNLIST", "MARKDESC", "GOODS", "GOODS2", "UOMDETAIL", "CTNNOLIST", "CTNALLOC", "CTNWORD" };

        static void AddParam(SqlCommand c, string name, string col, object val)
        {
            SqlParameter p;
            if (val == null || val == DBNull.Value) { p = c.Parameters.Add(name, MemoCols.Contains(col) ? SqlDbType.Text : SqlDbType.VarChar); p.Value = DBNull.Value; return; }
            if (val is string) { p = c.Parameters.Add(name, MemoCols.Contains(col) ? SqlDbType.Text : SqlDbType.VarChar); p.Value = val; return; }
            if (val is decimal) { p = c.Parameters.Add(name, SqlDbType.Decimal); p.Precision = 18; p.Scale = 5; p.Value = val; return; }
            if (val is double) { p = c.Parameters.Add(name, SqlDbType.Float); p.Value = val; return; }
            if (val is int) { p = c.Parameters.Add(name, SqlDbType.Int); p.Value = val; return; }
            if (val is DateTime) { p = c.Parameters.Add(name, SqlDbType.DateTime); p.Value = val; return; }
            p = c.Parameters.AddWithValue(name, val);
        }

        /// <summary>INSERT (keys = null) หรือ UPDATE … WHERE keys; identityTable + dryRun = INSERT ที่ไม่เพิ่มแถว (ไม่ใช้เลข identity)</summary>
        static void WriteRow(SqlConnection cn, SqlTransaction tx, string table, Dictionary<string, object> vals, Dictionary<string, object> keys, bool noRowInsert)
        {
            using (var c = Cmd(cn, "", tx))
            {
                int i = 0;
                if (keys == null)
                {
                    var cols = new List<string>(); var args = new List<string>();
                    foreach (var kv in vals) { string pn = "@p" + (i++); AddParam(c, pn, kv.Key, kv.Value); cols.Add("[" + kv.Key + "]"); args.Add(pn); }
                    c.CommandText = noRowInsert
                        ? "INSERT INTO " + table + " (" + string.Join(",", cols) + ") SELECT " + string.Join(",", args) + " WHERE 1=0"
                        : "INSERT INTO " + table + " (" + string.Join(",", cols) + ") VALUES (" + string.Join(",", args) + ")";
                    c.ExecuteNonQuery();
                }
                else
                {
                    var sets = new List<string>(); var wh = new List<string>();
                    foreach (var kv in vals) { string pn = "@p" + (i++); AddParam(c, pn, kv.Key, kv.Value); sets.Add("[" + kv.Key + "]=" + pn); }
                    foreach (var kv in keys) { string pn = "@p" + (i++); AddParam(c, pn, kv.Key, kv.Value); wh.Add("[" + kv.Key + "]=" + pn); }
                    c.CommandText = "UPDATE " + table + " SET " + string.Join(", ", sets) + " WHERE " + string.Join(" AND ", wh);
                    int n = c.ExecuteNonQuery();
                    if (n != 1) throw new InvalidOperationException("การแก้ไขข้อมูลกระทบ " + n + " รายการ (ต้องเป็น 1) — ยกเลิกทั้งหมด");
                }
            }
        }

        /// <summary>
        /// ค่า LOCK ตายตัวที่นำเข้า EDI เขียนให้ HB/L และรายการสินค้า — SMF ปรับ LOCK ทุกครั้งที่บันทึก
        /// จึงใช้ตรวจตอนนำเข้าซ้ำ: LOCK ยังเป็นค่านี้ = ไม่มีใครแก้ใน SMF (เขียนทับได้) / เป็นค่าอื่น = ถูกแก้แล้ว (ข้าม)
        /// </summary>
        public const double EdiLock = 1;

        // ช่องที่ SMF เขียนเป็น "" / 0 (ไม่ใช่ NULL) เมื่อสร้าง HB/L ใหม่ — อ้างอิงจาก HB/L ที่สร้างด้วยหน้าจอ SMF
        // (ช่องนอกรายการนี้ SMF ปล่อยเป็น NULL จึงไม่ใส่)
        static readonly string[] HblTextDefaults = {
            "ACTSTAT", "BOOKREF", "BOOKNO", "FWDBLNO", "SHED", "FEEDER", "F_VOY", "CTCNAME", "FROMNAME", "REMARK", "OPTION1", "OPTION2", "OPTION3", "OPTION4", "OPTION5", "OPTION6", "OPTION7",
            "BILLDESC", "BILLREV", "BILLCC", "BILLPP", "BILLRATE", "BILLPPTOT", "BILLCCTOT", "CTNLIST", "PKGUNIT", "PKGWORD", "CTNWORD", "TRANPORT", "TRANPORTNAME", "COLOAD", "COLOADNAME",
            "BLFORMCODE", "CTN20TY", "CTN40TY", "CTN40HCTY", "CTN45TY", "INTERNALREFERENCE", "HSCODE", "JOBOWNER", "SONO", "PONO", "ITEMNO", "N_ADD2", "BLNO", "MASTERNO", "ISSUPLACE", "PAYABLEAT",
            "SHIPPER", "SHIPPERNAME", "S_ADD", "CONSIGNEE", "CONSIGNEENAME", "C_ADD", "NOTIFY", "NOTIFYNAME", "N_ADD", "AGENTNO", "AGENTNAME", "A_ADD", "EXPORTER", "EXPORTERNAME",
            "RECPORT", "RECPORTNAME", "LOADPORT", "LOADPORTNAME", "DISPORT", "DISPORTNAME", "DELPORT", "DELPORTNAME", "FINALPORT", "FINALPORTNAME", "CYTERM", "CHGTERM" };
        static readonly string[] HblNumDefaults = { "GW", "NW", "CBM", "PKGQTY", "CTN20", "CTN40", "CTN40HC", "CTN45", "REVTON" };

        /// <summary>เติมค่า default ของ HB/L ใหม่ให้เหมือนที่ SMF สร้าง (เฉพาะช่องที่ยังไม่มีค่า และมีอยู่จริงในตาราง)</summary>
        static void FillHblDefaults(Dictionary<string, object> ins, HashSet<string> cols, string userId)
        {
            Action<string, object> put = (k, val) => { if (cols.Contains(k) && (!ins.ContainsKey(k) || ins[k] == null)) ins[k] = val; };
            foreach (var k in HblTextDefaults) put(k, "");
            foreach (var k in HblNumDefaults) put(k, 0m);
            put("DOCSTAT", "Open"); put("CHKOPT", "00"); put("SUB_SYSNAME", "SF"); put("TOTDO", 1m);
            put("USERID", userId); put("GROUPID", userId); put("COMMODITY", "N/M");
        }

        bool CodeExists(SqlConnection cn, SqlTransaction tx, string code)
        {
            if (string.IsNullOrWhiteSpace(code)) return false;
            using (var c = Cmd(cn, "SELECT COUNT(*) FROM SMBUSINESS WHERE COMNO=@c", tx))
            {
                c.Parameters.Add("@c", SqlDbType.VarChar, 20).Value = code.Trim();
                return (int)c.ExecuteScalar() > 0;
            }
        }

        /// <summary>HB/L นี้ถูกแก้ใน SMF หลังนำเข้าหรือไม่ — คืนเหตุผล ("" = ยังเหมือนที่นำเข้า)</summary>
        static string EditedInSmf(SqlConnection cn, SqlTransaction tx, string docNo)
        {
            using (var c = Cmd(cn, "SELECT LOCK FROM SFHBL WITH (UPDLOCK, ROWLOCK) WHERE DOCNO=@d", tx))
            {
                c.Parameters.Add("@d", SqlDbType.VarChar, 20).Value = docNo;
                var o = c.ExecuteScalar();
                if (o == null || o == DBNull.Value || Math.Abs(Convert.ToDouble(o) - EdiLock) > 1e-9) return "HB/L ถูกบันทึกจาก SMF แล้ว";
            }
            using (var c = Cmd(cn, "SELECT COUNT(*), MIN(LOCK), MAX(LOCK) FROM SFMARK WHERE HBLREF=@d", tx))
            {
                c.Parameters.Add("@d", SqlDbType.VarChar, 20).Value = docNo;
                using (var r = c.ExecuteReader())
                {
                    r.Read();
                    int n = r.GetInt32(0);
                    if (n > 1) return "รายการสินค้ามีหลายแถว (มีการเพิ่มใน SMF)";
                    if (n == 1 && (Math.Abs(Convert.ToDouble(r.GetValue(1)) - EdiLock) > 1e-9)) return "รายการสินค้าถูกบันทึกจาก SMF แล้ว";
                }
            }
            return "";
        }

        public bool JobExists(string jobNo)
        {
            using (var cn = Open())
            using (var c = Cmd(cn, "SELECT COUNT(*) FROM SFJOB WHERE JOBNO=@j"))
            {
                c.Parameters.Add("@j", SqlDbType.VarChar, 20).Value = (jobNo ?? "").Trim();
                return (int)c.ExecuteScalar() > 0;
            }
        }

        static DateTime? D(string s)
        {
            DateTime dt;
            return DateTime.TryParseExact(s ?? "", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out dt) ? (DateTime?)dt : null;
        }

        /// <summary>
        /// นำเข้าไฟล์ EDI เข้างาน jobNo — ดูหัวไฟล์; updateJob = เขียนเรือ/เที่ยว/สายเรือ/ETD/ETA/ท่า ลงงานด้วย (เหมือน import เดิมใน frmSFxxx)
        /// </summary>
        public EdiResult ImportEdi(EdiFile file, string jobNo, string userId, bool updateJob, bool dryRun, bool overwriteEdited = false)
        {
            if (!LicenseInfo.Current.EdiAllowed) throw new InvalidOperationException("ไม่มีสิทธิ์ใช้งาน EDI — " + LicenseInfo.Current.Problem);
            jobNo = (jobNo ?? "").Trim();
            if (jobNo == "") throw new InvalidOperationException("ยังไม่ได้ระบุเลขงาน (JOBNO)");
            if (file.Problems.Count > 0) throw new InvalidOperationException("ไฟล์ EDI มีปัญหา: " + string.Join("; ", file.Problems));
            var res = new EdiResult();
            double lockVal = DateTime.Now.ToOADate();       // ใช้กับตู้เท่านั้น — HB/L และรายการสินค้าใช้ค่าคงที่ EdiLock (ดูด้านล่าง)

            using (var cn = Open())
            using (var tx = cn.BeginTransaction(IsolationLevel.ReadCommitted))
            {
                try
                {
                    // ---- งาน ----
                    string jobClass = "", jobType = "", loadType = "", jobMaster = "";
                    using (var c = Cmd(cn, "SELECT JOBCLASS,JOBTYPE,LOADTYPE,MASTERNO FROM SFJOB WITH (UPDLOCK, ROWLOCK) WHERE JOBNO=@j", tx))
                    {
                        c.Parameters.Add("@j", SqlDbType.VarChar, 20).Value = jobNo;
                        using (var r = c.ExecuteReader())
                        {
                            if (!r.Read()) throw new InvalidOperationException("ไม่พบเลขงาน " + jobNo + " ในระบบ — ต้องสร้างงานรอไว้ก่อน (โปรแกรมนี้ไม่สร้างงานใหม่)");
                            jobClass = S(r, 0); jobType = S(r, 1); loadType = S(r, 2); jobMaster = S(r, 3);
                        }
                    }

                    // ---- HB/L ต้นแบบของงาน (DOCNO = JOBNO) ถ้ามี: ใช้เป็นค่าเริ่มต้นของ HB/L ใหม่ ----
                    Dictionary<string, object> tpl = null;
                    using (var c = Cmd(cn, "SELECT * FROM SFHBL WHERE DOCNO=@j", tx))
                    {
                        c.Parameters.Add("@j", SqlDbType.VarChar, 20).Value = jobNo;
                        using (var r = c.ExecuteReader())
                            if (r.Read())
                            {
                                tpl = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                                for (int i = 0; i < r.FieldCount; i++) tpl[r.GetName(i)] = r.GetValue(i);
                            }
                    }
                    res.Notes.Add(tpl != null ? "ใช้ HB/L ต้นแบบของงาน (" + jobNo + ") เป็นค่าเริ่มต้นของ HB/L ใหม่" : "งานนี้ไม่มี HB/L ต้นแบบ — HB/L ใหม่ใช้ค่าจากงานและไฟล์ EDI เท่านั้น");

                    var hblCols = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    using (var c = Cmd(cn, "SELECT name FROM sys.columns WHERE object_id=OBJECT_ID('SFHBL') AND is_computed=0 AND system_type_id<>189", tx))
                    using (var r = c.ExecuteReader())
                        while (r.Read()) hblCols.Add(S(r, 0));

                    // ---- HB/L ที่มีอยู่ในงาน ----
                    var byBl = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    int maxRun = 0;
                    using (var c = Cmd(cn, "SELECT DOCNO,BLNO FROM SFHBL WITH (UPDLOCK, HOLDLOCK) WHERE JOBNO=@j", tx))
                    {
                        c.Parameters.Add("@j", SqlDbType.VarChar, 20).Value = jobNo;
                        using (var r = c.ExecuteReader())
                            while (r.Read())
                            {
                                string doc = S(r, 0), bl = S(r, 1);
                                if (bl != "" && !byBl.ContainsKey(bl)) byBl[bl] = doc;
                                var m = Regex.Match(doc, @"^" + Regex.Escape(jobNo) + @"/(\d+)$");
                                int n; if (m.Success && int.TryParse(m.Groups[1].Value, out n) && n > maxRun) maxRun = n;
                            }
                    }

                    // ---- รหัสท่าที่ไม่พบในตารางท่า: เตือนอย่างเดียว (ตาม XML ไม่แก้) ผู้ใช้ต้องเพิ่มท่าในระบบเอง ----
                    var portCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    portCodes.Add(file.LoadCode); portCodes.Add(file.DischCode);
                    foreach (var b in file.Bls) foreach (var k in new[] { "RECPORT", "LOADPORT", "DISPORT", "DELPORT", "FINALPORT" }) portCodes.Add(Fields.Val(b.V, k));
                    foreach (var pc in portCodes.Where(x => x.Trim() != ""))
                        using (var c = Cmd(cn, "SELECT COUNT(*) FROM OPPORT WHERE PORTTYPE='SF' AND PORTCODE=@p", tx))
                        {
                            c.Parameters.Add("@p", SqlDbType.VarChar, 20).Value = pc;
                            if ((int)c.ExecuteScalar() == 0) res.Notes.Add("⚠ รหัสท่า \"" + pc + "\" ตาม XML ไม่พบในตารางท่าของระบบ — นำเข้าตามที่ XML ให้ ผู้ใช้ต้องเพิ่มท่านี้ในระบบเอง");
                        }

                    // ---- ข้อมูลงาน ----
                    bool linerOk = CodeExists(cn, tx, file.LinerCode);
                    if (file.LinerCode != "" && !linerOk) res.Notes.Add("สายเรือ \"" + file.LinerName + "\" (รหัสในไฟล์ " + file.LinerCode + ") ไม่ตรงรหัสในระบบ → ไม่ใส่รหัสสายเรือ ใส่เฉพาะชื่อ");
                    if (updateJob)
                    {
                        var jv = new Dictionary<string, object>();
                        if (file.Vessel != "") jv["VESSEL"] = file.Vessel;
                        if (file.Voyage != "") jv["V_VOY"] = file.Voyage;
                        if (file.LinerName != "") jv["LINERNAME"] = file.LinerName;
                        if (linerOk) jv["LINERNO"] = file.LinerCode;
                        if (D(file.Etd) != null) jv["ETD"] = D(file.Etd).Value;
                        if (D(file.Eta) != null) jv["ETA"] = D(file.Eta).Value;
                        if (file.LoadCode != "") { jv["RECPORT"] = file.LoadCode; jv["LOADPORT"] = file.LoadCode; }
                        if (file.DischCode != "") { jv["DISPORT"] = file.DischCode; jv["DELPORT"] = file.DischCode; jv["FINALPORT"] = file.DischCode; }
                        if (jv.Count > 0)
                        {
                            WriteRow(cn, tx, "SFJOB", jv, new Dictionary<string, object> { { "JOBNO", jobNo } }, false);
                            foreach (var kv in jv) res.JobLines.Add(kv.Key + " = " + (kv.Value is DateTime ? ((DateTime)kv.Value).ToString("yyyy-MM-dd") : kv.Value.ToString()));
                        }
                    }
                    else res.JobLines.Add("(ไม่แก้ข้อมูลงาน)");

                    // ---- ตู้ของงาน ----
                    int seq = 0;
                    using (var c = Cmd(cn, "SELECT ISNULL(MAX(SEQNO),0) FROM SFCONT WHERE JOBNO=@j", tx))
                    {
                        c.Parameters.Add("@j", SqlDbType.VarChar, 20).Value = jobNo;
                        seq = Convert.ToInt32(c.ExecuteScalar());
                    }
                    foreach (var ec in file.Containers)
                    {
                        if (ec.No == "") continue;
                        bool exists;
                        using (var c = Cmd(cn, "SELECT COUNT(*) FROM SFCONT WHERE JOBNO=@j AND CTNNO=@n", tx))
                        {
                            c.Parameters.Add("@j", SqlDbType.VarChar, 20).Value = jobNo;
                            c.Parameters.Add("@n", SqlDbType.VarChar, 50).Value = ec.No;
                            exists = (int)c.ExecuteScalar() > 0;
                        }
                        var cv = new Dictionary<string, object>();
                        cv["CTNSIZE"] = ec.DbSize; cv["CTNTYPE"] = ec.DbType; cv["SEALNO"] = ec.Seal;
                        if (exists)
                        {
                            WriteRow(cn, tx, "SFCONT", cv, new Dictionary<string, object> { { "JOBNO", jobNo }, { "CTNNO", ec.No } }, false);
                            res.JobLines.Add("ตู้ " + ec.No + " มีอยู่แล้ว → แก้ขนาด/ชนิด/ซีล");
                        }
                        else
                        {
                            cv["LOCK"] = lockVal; cv["SEQNO"] = ++seq; cv["JOBNO"] = jobNo; cv["CTNNO"] = ec.No;
                            cv["GW"] = 0m; cv["CBM"] = 0m; cv["PKGUNIT"] = ""; cv["PKGQTY"] = 0m; cv["CARGOTYPE"] = ""; cv["IMOCLASS"] = ""; cv["UNNO"] = "";
                            cv["CTNStat"] = ""; cv["CTNRACK"] = ""; cv["CTNSTOWAGE"] = ""; cv["VGM"] = 0m; cv["TARE"] = 0m; cv["TEMP"] = ""; cv["VENT"] = "";
                            cv["CTNSIZEISO"] = ""; cv["CTNTYPECODE"] = ""; cv["CTNMATERIAL"] = "";
                            WriteRow(cn, tx, "SFCONT", cv, null, dryRun);
                            res.JobLines.Add("ตู้ " + ec.No + " (" + ec.SizeRaw + ", ซีล " + ec.Seal + ") → เพิ่มใหม่");
                        }
                    }

                    // ---- HB/L ----
                    string master = jobMaster != "" ? jobMaster : file.MasterNo;
                    int nextRun = maxRun + 1;
                    foreach (var bl in file.Bls)
                    {
                        var row = new EdiRowResult { BlNo = bl.BlNo };
                        row.Notes.AddRange(bl.Notes);
                        var v = new Dictionary<string, string>(bl.V);

                        string docNo; bool isNew = !byBl.TryGetValue(bl.BlNo, out docNo);
                        if (isNew)
                        {
                            docNo = jobNo + "/" + nextRun.ToString("000"); nextRun++;
                            if (docNo.Length > 20) throw new InvalidOperationException("HB/L Ref \"" + docNo + "\" ยาวเกิน 20 ตัวอักษร — เลขงานยาวเกินไป");
                        }
                        row.DocNo = docNo; row.Action = isNew ? "เพิ่มใหม่" : "แก้ไขของเดิม";
                        v["DOCNO"] = docNo; v["JOBNO"] = jobNo;

                        // นำเข้าซ้ำ: HB/L เดิมที่ LOCK ไม่ใช่ค่าตายตัวของเรา (หรือรายการสินค้าถูกแก้/เพิ่ม) = มีการแก้ใน SMF แล้ว → ข้าม ไม่เขียนทับ
                        if (!isNew)
                        {
                            string why = EditedInSmf(cn, tx, docNo);
                            if (why != "")
                            {
                                if (!overwriteEdited) { row.Action = EdiRowResult.SkipText; row.Notes.Add("ข้าม: " + why + " — ไม่เขียนทับ"); res.Rows.Add(row); continue; }
                                row.Notes.Add("⚠ " + why + " — เขียนทับตามที่สั่ง");
                            }
                        }

                        // คู่ค้า: ตามกติกาเดียวกับ scan (ชื่อ = บรรทัดแรก → หารหัสตามชื่อ ไม่พบ = N/A) ไม่ค้นท่า/หน่วย (ใช้ตาม XML)
                        // Notify = "SAME AS CONSIGNEE" ไม่ใช่ชื่อบริษัท: ไม่ค้นรหัสตามชื่อ ใช้รหัสเดียวกับ Consignee
                        string notifyText = Fields.Val(v, "N_ADD");
                        string notifyFirst = notifyText.Replace("\r\n", "\n").Split('\n').Select(x => x.Trim()).FirstOrDefault(x => x != "") ?? "";
                        bool sameAsCons = Regex.IsMatch(notifyFirst, @"^SAME\s+AS\s+CONSIGNEE", RegexOptions.IgnoreCase);
                        if (sameAsCons) v["N_ADD"] = "";
                        foreach (var n in Enrich(v, jobNo, null, false, false)) row.Notes.Add(n);
                        foreach (var kv in bl.XmlCodes)
                            if (kv.Value != "" && CodeExists(cn, tx, kv.Value)) v[kv.Key] = kv.Value;
                        if (sameAsCons)
                        {
                            v["N_ADD"] = notifyText; v["NOTIFYNAME"] = notifyFirst; v["NOTIFY"] = Fields.Val(v, "CONSIGNEE");
                            row.Notes.Add("Notify = SAME AS CONSIGNEE → ใช้รหัสเดียวกับ Consignee (" + Fields.Val(v, "CONSIGNEE") + ")");
                        }
                        if (v["NOTIFY"].Trim() == "" && v["NOTIFYNAME"].Trim() == "") row.Notes.Add("ไม่มี Notify Party ในไฟล์");

                        foreach (var e in Fields.Validate(v)) row.Notes.Add("⚠ " + e);
                        foreach (var w in Fields.Warnings(v)) row.Notes.Add("⚠ " + w);
                        if (Fields.Validate(v).Count > 0) throw new InvalidOperationException("B/L " + bl.BlNo + " ข้อมูลไม่ผ่านการตรวจ: " + string.Join("; ", Fields.Validate(v)));

                        // ค่าที่มาจาก EDI (เขียนทั้งเพิ่มใหม่และแก้ไข) — เฉพาะช่องที่มีค่า
                        var ov = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                        foreach (var f in Fields.All.Where(x => x.Table == "SFHBL" && !x.System))
                        {
                            string s = Fields.Val(v, f.Key);
                            if (s.Trim() == "" && f.Kind != FieldKind.Decimal) continue;
                            if (s.Trim() == "") s = "0";
                            ov[f.Key] = ToDb(f, s);
                        }
                        if (linerOk) ov["LINERNO"] = file.LinerCode;
                        if (file.LinerName != "") ov["LINERNAME"] = file.LinerName;
                        ov["EXPORTER"] = ""; ov["EXPORTERNAME"] = "";
                        var etd = D(Fields.Val(v, "ETD")) ?? D(file.Etd); var eta = D(file.Eta);
                        if (eta != null) ov["ETA"] = eta.Value;
                        var etdeta = jobClass == "EX" ? etd : (eta ?? etd);
                        if (etdeta != null) ov["ETDETA"] = etdeta.Value;
                        decimal gw = Convert.ToDecimal(ov["GW"]), cbm = Convert.ToDecimal(ov["CBM"]);
                        decimal rev = gw > cbm * 1000m ? Math.Round(gw / 1000m, 3) : cbm;
                        ov["REVTON"] = rev < 1m ? 1m : Math.Round(rev, 3);
                        ov["LOCK"] = EdiLock; ov["EDITBY"] = userId; ov["EDITDATE"] = DateTime.Now;

                        if (isNew)
                        {
                            var ins = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                            if (tpl != null)
                                foreach (var kv in tpl)
                                {
                                    if (kv.Key == "DOCNO" || kv.Key == "BLNO" || kv.Key == "DOCTYPE") continue;
                                    ins[kv.Key] = kv.Value is DBNull ? null : kv.Value;
                                }
                            else
                            {
                                ins["JOBCLASS"] = jobClass; ins["JOBTYPE"] = jobType; ins["LOADTYPE"] = loadType; ins["MASTERNO"] = master;
                                ins["DOCDATE"] = DateTime.Today;
                            }
                            foreach (var kv in ov) ins[kv.Key] = kv.Value;
                            ins["DOCNO"] = docNo; ins["JOBNO"] = jobNo; ins["DOCTYPE"] = "Direct";
                            FillHblDefaults(ins, hblCols, userId);
                            WriteRow(cn, tx, "SFHBL", ins, null, false);
                        }
                        else
                            WriteRow(cn, tx, "SFHBL", ov, new Dictionary<string, object> { { "DOCNO", docNo } }, false);

                        // ---- รายการสินค้า ----
                        var mk = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                        mk["LOCK"] = EdiLock; mk["MARKSTAT"] = ""; mk["MARKDESC"] = Fields.Val(v, "MARKDESC"); mk["GOODS"] = Fields.Val(v, "GOODS"); mk["GOODS2"] = "";
                        mk["SEQNO"] = 1; mk["NEWHBLNO"] = ""; mk["CONSIGNEENAME"] = Fields.Val(v, "CONSIGNEENAME");
                        mk["GW"] = gw; mk["NW"] = 0m; mk["CBM"] = cbm; mk["PKGWORD"] = Fields.Val(v, "PKGWORD");
                        mk["PKGQTY"] = Convert.ToDecimal(ov["PKGQTY"]); mk["PKGUNIT"] = Fields.Val(v, "PKGUNIT"); mk["UNITCODE"] = "";
                        mk["PKGUNIT2"] = ""; mk["PKGQTY2"] = 0m; mk["PKGUNIT3"] = ""; mk["PKGQTY3"] = 0m;
                        mk["UOMDETAIL"] = ""; mk["CTNNOLIST"] = ""; mk["CTNALLOC"] = ""; mk["CTNLIST"] = Fields.Val(v, "CTNLIST");
                        int detId = 0;
                        using (var c = Cmd(cn, "SELECT TOP 1 DETID FROM SFMARK WITH (UPDLOCK, ROWLOCK) WHERE HBLREF=@d ORDER BY ISNULL(SEQNO,2147483647), DETID", tx))
                        {
                            c.Parameters.Add("@d", SqlDbType.VarChar, 20).Value = docNo;
                            var o = c.ExecuteScalar();
                            if (o != null && o != DBNull.Value) detId = Convert.ToInt32(o);
                        }
                        if (detId > 0)
                        {
                            mk.Remove("SEQNO");
                            WriteRow(cn, tx, "SFMARK", mk, new Dictionary<string, object> { { "DETID", detId }, { "HBLREF", docNo } }, false);
                        }
                        else
                        {
                            mk["JOBNO"] = jobNo; mk["HBLREF"] = docNo; mk["DOCTYPE"] = "Direct"; mk["TEMPMKEY"] = docNo + ".1";
                            WriteRow(cn, tx, "SFMARK", mk, null, dryRun);       // SFMARK มี identity: dry run ไม่ใช้เลข
                        }
                        res.Rows.Add(row);
                    }

                    if (dryRun)
                    {
                        tx.Rollback();
                        res.Message = "DRY RUN ผ่าน — เพิ่ม HB/L " + res.Added + " ใบ, แก้ไขของเดิม " + res.Updated + " ใบ, ข้าม " + res.Skipped + " ใบ (แก้ใน SMF แล้ว) แล้ว ROLLBACK (ไม่มีข้อมูลเปลี่ยนใน DB)";
                    }
                    else
                    {
                        tx.Commit();
                        res.Message = "นำเข้าแล้ว: เพิ่ม HB/L " + res.Added + " ใบ, แก้ไขของเดิม " + res.Updated + " ใบ, ข้าม " + res.Skipped + " ใบ (แก้ใน SMF แล้ว) (งาน " + jobNo + ")";
                    }
                    return res;
                }
                catch
                {
                    try { tx.Rollback(); } catch { }
                    throw;
                }
            }
        }
    }
}
