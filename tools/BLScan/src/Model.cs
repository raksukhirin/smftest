// นิยาม field ที่ได้จากการ scan และปลายทางใน SMF DB (SFHBL / SFMARK)
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace BLScan
{
    public enum FieldKind { Text, Memo, Decimal, Int, Date }

    public class FieldDef
    {
        public string Key;        // ชื่อภายใน = ชื่อคอลัมน์
        public string Table;      // SFHBL / SFMARK / "" (แสดงใน preview เท่านั้น)
        public string Caption;
        public FieldKind Kind;
        public int MaxLen;        // 0 = ไม่จำกัด (TEXT)
        public string Group;
        public bool System;       // ค่าจากระบบ/งาน ไม่ได้มาจาก OCR

        public FieldDef(string group, string key, string table, string caption, FieldKind kind, int maxLen, bool system = false)
        {
            Group = group; Key = key; Table = table; Caption = caption; Kind = kind; MaxLen = maxLen; System = system;
        }

        public string DbName { get { return string.IsNullOrEmpty(Table) ? "(preview)" : Table + "." + Key; } }
    }

    public static class Fields
    {
        public const string GDoc = "เอกสาร / งาน";
        public const string GBL = "B/L";
        public const string GParty = "คู่ค้า";
        public const string GRoute = "เส้นทาง";
        public const string GCargo = "สินค้า";

        public static readonly List<FieldDef> All = new List<FieldDef>
        {
            new FieldDef(GDoc, "DOCNO", "SFHBL", "HBL Doc No.", FieldKind.Text, 20, true),
            new FieldDef(GDoc, "JOBNO", "SFHBL", "Job No.", FieldKind.Text, 20, true),
            new FieldDef(GDoc, "DOCDATE", "SFHBL", "Doc Date", FieldKind.Date, 0, true),
            new FieldDef(GDoc, "MASTERNO", "SFHBL", "Master B/L No.", FieldKind.Text, 50, true),
            new FieldDef(GDoc, "JOBCLASS", "SFHBL", "Job Class (IM/EX)", FieldKind.Text, 2, true),
            new FieldDef(GDoc, "JOBTYPE", "SFHBL", "Job Type", FieldKind.Text, 20, true),
            new FieldDef(GDoc, "LOADTYPE", "SFHBL", "Load Type", FieldKind.Text, 20, true),

            new FieldDef(GBL, "BLNO", "SFHBL", "B/L No.", FieldKind.Text, 50),
            new FieldDef(GBL, "BLTYPE", "SFHBL", "B/L Type", FieldKind.Text, 20),
            new FieldDef(GBL, "BLCOPY", "SFHBL", "No. of Original B/L", FieldKind.Int, 0),
            new FieldDef(GBL, "CHGTERM", "SFHBL", "Freight Term (PP/CC)", FieldKind.Text, 10),
            new FieldDef(GBL, "CYTERM", "SFHBL", "Service (CY/CY)", FieldKind.Text, 20),
            new FieldDef(GBL, "ETD", "SFHBL", "On Board Date (ETD)", FieldKind.Date, 0),
            new FieldDef(GBL, "ISSUPLACE", "SFHBL", "Place of Issue", FieldKind.Text, 150),
            new FieldDef(GBL, "ISSUDATE", "SFHBL", "Date of Issue", FieldKind.Date, 0),
            new FieldDef(GBL, "PAYABLEAT", "SFHBL", "Freight Payable at", FieldKind.Text, 100),
            new FieldDef(GBL, "FREIGHTTEXT", "", "Freight & Charges (ข้อความ)", FieldKind.Text, 0),
            new FieldDef(GBL, "SIGNEDBY", "", "Signed for the Carrier", FieldKind.Text, 0),

            new FieldDef(GParty, "SHIPPER", "SFHBL", "Shipper code (SMBUSINESS)", FieldKind.Text, 20),
            new FieldDef(GParty, "SHIPPERNAME", "SFHBL", "Shipper", FieldKind.Text, 150),
            new FieldDef(GParty, "S_ADD", "SFHBL", "Shipper (ชื่อ+ที่อยู่)", FieldKind.Memo, 0),
            new FieldDef(GParty, "CONSIGNEE", "SFHBL", "Consignee code (SMBUSINESS)", FieldKind.Text, 20),
            new FieldDef(GParty, "CONSIGNEENAME", "SFHBL", "Consignee", FieldKind.Text, 150),
            new FieldDef(GParty, "C_ADD", "SFHBL", "Consignee (ชื่อ+ที่อยู่)", FieldKind.Memo, 0),
            new FieldDef(GParty, "NOTIFY", "SFHBL", "Notify code (SMBUSINESS)", FieldKind.Text, 20),
            new FieldDef(GParty, "NOTIFYNAME", "SFHBL", "Notify Party", FieldKind.Text, 150),
            new FieldDef(GParty, "N_ADD", "SFHBL", "Notify (ชื่อ+ที่อยู่)", FieldKind.Memo, 0),
            new FieldDef(GParty, "AGENTNO", "SFHBL", "Agent code (SMBUSINESS)", FieldKind.Text, 20),
            new FieldDef(GParty, "AGENTNAME", "SFHBL", "Delivery Agent", FieldKind.Text, 150),
            new FieldDef(GParty, "A_ADD", "SFHBL", "Agent (ที่อยู่)", FieldKind.Memo, 0),

            new FieldDef(GRoute, "FEEDER", "SFHBL", "Feeder / Pre-carriage", FieldKind.Text, 100),
            new FieldDef(GRoute, "F_VOY", "SFHBL", "Feeder Voy.", FieldKind.Text, 100),
            new FieldDef(GRoute, "VESSEL", "SFHBL", "Ocean Vessel", FieldKind.Text, 100),
            new FieldDef(GRoute, "V_VOY", "SFHBL", "Vessel Voy.", FieldKind.Text, 100),
            new FieldDef(GRoute, "RECPORT", "SFHBL", "Place of Receipt (code)", FieldKind.Text, 20),
            new FieldDef(GRoute, "RECPORTNAME", "SFHBL", "Place of Receipt", FieldKind.Text, 150),
            new FieldDef(GRoute, "LOADPORT", "SFHBL", "Port of Loading (code)", FieldKind.Text, 20),
            new FieldDef(GRoute, "LOADPORTNAME", "SFHBL", "Port of Loading", FieldKind.Text, 150),
            new FieldDef(GRoute, "DISPORT", "SFHBL", "Port of Discharge (code)", FieldKind.Text, 20),
            new FieldDef(GRoute, "DISPORTNAME", "SFHBL", "Port of Discharge", FieldKind.Text, 150),
            new FieldDef(GRoute, "DELPORT", "SFHBL", "Place of Delivery (code)", FieldKind.Text, 20),
            new FieldDef(GRoute, "DELPORTNAME", "SFHBL", "Place of Delivery", FieldKind.Text, 150),
            new FieldDef(GRoute, "FINALPORT", "SFHBL", "Final Destination (code)", FieldKind.Text, 20),
            new FieldDef(GRoute, "FINALPORTNAME", "SFHBL", "Final Destination", FieldKind.Text, 150),

            new FieldDef(GCargo, "MARKDESC", "SFMARK", "Marks & Numbers", FieldKind.Memo, 0),
            new FieldDef(GCargo, "GOODS", "SFMARK", "Description of Goods", FieldKind.Memo, 0),
            new FieldDef(GCargo, "PKGQTY", "SFHBL", "No. of Packages", FieldKind.Decimal, 0),
            new FieldDef(GCargo, "PKGUNIT", "SFHBL", "Package Unit", FieldKind.Text, 20),
            new FieldDef(GCargo, "UNITCODE", "SFMARK", "Unit Code (SMUOM)", FieldKind.Text, 5),
            new FieldDef(GCargo, "GW", "SFHBL", "Gross Weight (KGS)", FieldKind.Decimal, 0),
            new FieldDef(GCargo, "CBM", "SFHBL", "Measurement (CBM)", FieldKind.Decimal, 0),
            new FieldDef(GCargo, "PKGWORD", "SFHBL", "Total Packages (in words)", FieldKind.Memo, 0),
        };

        public static FieldDef Get(string key) { return All.First(f => f.Key == key); }

        /// <summary>แปลงค่าจาก parser → ชุด field ของโปรแกรม</summary>
        public static Dictionary<string, string> FromParse(ParseResult r)
        {
            var d = All.ToDictionary(f => f.Key, f => "");
            foreach (var kv in r.Values)
            {
                if (kv.Key == "BILLDESC") d["FREIGHTTEXT"] = kv.Value;
                else if (d.ContainsKey(kv.Key)) d[kv.Key] = kv.Value;
            }
            return d;
        }

        static readonly string[] DateFormats = { "yyyy-MM-dd", "d/M/yyyy", "d-M-yyyy", "d MMM yyyy", "d MMMM yyyy", "MMM d yyyy", "MMMM d yyyy", "d/M/yy" };

        public static bool TryDate(string s, out DateTime dt)
        {
            return DateTime.TryParseExact((s ?? "").Trim().Replace(",", ""), DateFormats, CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, out dt);
        }

        public static bool TryDec(string s, out decimal v)
        {
            return decimal.TryParse((s ?? "").Replace(",", "").Trim(), NumberStyles.Number, CultureInfo.InvariantCulture, out v);
        }

        /// <summary>ตรวจค่าก่อนบันทึก — คืนรายการปัญหา (ว่าง = ผ่าน)</summary>
        public static List<string> Validate(Dictionary<string, string> v)
        {
            var errs = new List<string>();
            foreach (var f in All.Where(f => f.Table != ""))
            {
                string s = v.ContainsKey(f.Key) ? (v[f.Key] ?? "") : "";
                if (s.Trim() == "") continue;
                DateTime dt; decimal dv; int iv;
                if (f.Kind == FieldKind.Date && !TryDate(s, out dt)) errs.Add(f.DbName + ": วันที่ไม่ถูกต้อง \"" + s + "\" (ใช้ yyyy-MM-dd)");
                if (f.Kind == FieldKind.Decimal && !TryDec(s, out dv)) errs.Add(f.DbName + ": ตัวเลขไม่ถูกต้อง \"" + s + "\"");
                if (f.Kind == FieldKind.Int && !int.TryParse(s.Trim(), out iv)) errs.Add(f.DbName + ": ต้องเป็นจำนวนเต็ม \"" + s + "\"");
                if (f.MaxLen > 0 && s.Length > f.MaxLen) errs.Add(f.DbName + ": ยาว " + s.Length + " ตัวอักษร เกินขนาดคอลัมน์ " + f.MaxLen);
            }
            if (string.IsNullOrWhiteSpace(Val(v, "DOCNO"))) errs.Add("ยังไม่ได้ใส่ SFHBL.DOCNO");
            if (string.IsNullOrWhiteSpace(Val(v, "JOBNO"))) errs.Add("ยังไม่มี JOBNO");
            if (Val(v, "DOCNO").Contains(" ")) errs.Add("DOCNO ห้ามมีช่องว่าง");
            if (string.IsNullOrWhiteSpace(Val(v, "DOCNO"))) errs.Add("DOCNO ว่าง — ห้าม update");
            return errs;
        }

        public static bool Same(FieldDef f, string a, string b)
        {
            a = (a ?? "").Trim(); b = (b ?? "").Trim();
            if (f.Kind == FieldKind.Decimal || f.Kind == FieldKind.Int)
            {
                decimal x, y;
                if (TryDec(a, out x) && TryDec(b, out y)) return x == y;
            }
            if (f.Kind == FieldKind.Date)
            {
                DateTime d1, d2;
                if (TryDate(a, out d1) && TryDate(b, out d2)) return d1.Date == d2.Date;
            }
            return Lines(a) == Lines(b);
        }

        static string Lines(string s)
        {
            var parts = s.Split(new[] { Environment.NewLine, "\r", "\n" }, StringSplitOptions.RemoveEmptyEntries);
            return string.Join("|", parts.Select(l => l.Trim()).Where(l => l != "")).ToUpperInvariant();
        }

        /// <summary>ผลเทียบ 1 ช่อง — Skip = scan ได้ค่าว่าง (ไม่ไปทับค่าเดิม), Differs = จะเปลี่ยนค่าใน DB</summary>
        public class Change
        {
            public FieldDef F;
            public string Old, New;
            public bool Skip, Differs;
        }

        /// <summary>ช่องที่โปรแกรมเขียนลง SFHBL/SFMARK: ทุกช่องที่ไม่ใช่ค่าระบบ (DOCNO/JOBNO/MASTERNO ฯลฯ ไม่เคยถูกเขียน)</summary>
        public static List<Change> Plan(Dictionary<string, string> scan, Dictionary<string, string> existing)
        {
            var list = new List<Change>();
            foreach (var f in All.Where(x => x.Table != "" && !x.System))
            {
                string nv = Val(scan, f.Key).Trim(), ov = Val(existing ?? new Dictionary<string, string>(), f.Key);
                bool skip = nv == "";
                list.Add(new Change { F = f, Old = ov, New = nv, Skip = skip, Differs = !skip && !Same(f, nv, ov) });
            }
            return list;
        }

        /// <summary>
        /// ค่าที่ "น่าสงสัย" — ไม่ใช่ error (ยังบันทึกได้) แต่ต้องให้ผู้ใช้เห็นและยืนยันก่อน Update
        /// จุดที่เคยพลาดจริง: วันที่ผิดปี, ทศนิยมหาย (1.516 → 516), หัวช่องหลุดเป็นค่า, ข้อความยาวผิดปกติปนเข้ามา
        /// </summary>
        public static List<string> Warnings(Dictionary<string, string> v)
        {
            var w = new List<string>();
            Func<string, string> g = k => Val(v, k).Trim();
            if (g("PKGWORD").Length > 100) w.Add("PKGWORD ยาว " + g("PKGWORD").Length + " ตัวอักษร — อาจมีข้อความอื่นปนมา");
            if (g("ISSUPLACE").Length > 60 || System.Text.RegularExpressions.Regex.IsMatch(g("ISSUPLACE"), @"\b(FOR|AS CARRIER)\b", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
                w.Add("Place of issue ดูผิดปกติ: \"" + g("ISSUPLACE") + "\"");
            foreach (var k in new[] { "FEEDER", "VESSEL" })
                if (System.Text.RegularExpressions.Regex.IsMatch(g(k), @"^(No\.?|Voy\.? ?No\.?|Voyage|Vessel|Port|Place)\b", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
                    w.Add(Get(k).Caption + " เป็นคำของหัวช่อง: \"" + g(k) + "\"");
            foreach (var k in new[] { "ETD", "ISSUDATE" })
            {
                DateTime dt;
                if (g(k) != "" && TryDate(g(k), out dt) && (dt.Year < 2000 || dt.Year > DateTime.Today.Year + 1))
                    w.Add(Get(k).Caption + " ปี " + dt.Year + " ผิดปกติ (" + g(k) + ")");
            }
            decimal cbm, gw;
            if (g("CBM") != "" && TryDec(g("CBM"), out cbm) && !g("CBM").Contains(".") && cbm >= 100)
                w.Add("CBM = " + g("CBM") + " ไม่มีทศนิยม — อาจตกจุดทศนิยม (เช่น 1.516 เป็น 516)");
            if (g("GW") != "" && TryDec(g("GW"), out gw) && gw <= 0) w.Add("GW เป็นศูนย์/ติดลบ");
            if (g("BLNO") != "" && g("BLNO").Length < 6) w.Add("B/L No. สั้นผิดปกติ: \"" + g("BLNO") + "\"");
            return w;
        }

        public static string Val(Dictionary<string, string> v, string key)
        {
            string s;
            return v.TryGetValue(key, out s) && s != null ? s : "";
        }
    }
}
