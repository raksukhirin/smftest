// อ่านไฟล์ EDI (XML ของเอเจนต์ต้นทาง: seajobfile) เป็นรายการ House B/L พร้อมค่าที่จะลง SMF
//   1 <billoflading> = 1 HB/L  ·  น้ำหนัก/ปริมาตร/หีบห่อ อยู่ใน <blcontainer blid=…> ที่ชี้ไปที่ id ของ billoflading
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml.Linq;

namespace BLScan
{
    public class EdiContainer
    {
        public string Id = "", No = "", Seal = "", SizeRaw = "", Size = "", Type = "";
        /// <summary>ขนาด/ชนิดแบบที่เก็บในระบบ: 40'HC → CTNSIZE "40HC", ชนิดอื่น → CTNSIZE "40" + CTNTYPE</summary>
        public string DbSize { get { return Type == "HC" || Type == "HQ" ? Size + Type : Size; } }
        public string DbType { get { return Type == "HC" || Type == "HQ" ? "" : Type; } }
        public string Remark = "";
    }

    public class EdiBl
    {
        public string XmlId = "";
        public Dictionary<string, string> V = new Dictionary<string, string>();   // key = Fields.Key
        public Dictionary<string, string> XmlCodes = new Dictionary<string, string>();   // SHIPPER/CONSIGNEE/NOTIFY/AGENTNO → รหัสที่ XML ให้มา (ถ้ามี)
        public List<string> Notes = new List<string>();
        public string BlNo { get { return Fields.Val(V, "BLNO"); } }
    }

    public class EdiFile
    {
        public string Vessel = "", Voyage = "", LinerCode = "", LinerName = "";
        public string Etd = "", Eta = "";
        public string LoadCode = "", LoadName = "", DischCode = "", DischName = "";
        public string MasterNo = "";
        public List<EdiContainer> Containers = new List<EdiContainer>();
        public List<EdiBl> Bls = new List<EdiBl>();
        public List<string> Problems = new List<string>();     // ปัญหาที่ทำให้ import ไม่ได้
    }

    public static class EdiParser
    {
        static string T(XElement e, string path)
        {
            if (e == null) return "";
            XElement cur = e;
            foreach (var p in path.Split('/')) { cur = cur.Element(p); if (cur == null) return ""; }
            return (cur.Value ?? "").Trim();
        }

        /// <summary>ข้อความหลายบรรทัดใน XML → CRLF ตัดบรรทัดว่างหัวท้าย ไม่แตะบรรทัดตรงกลาง</summary>
        /// <summary>รหัสท่า: uncode (5 ตัว) ถ้ามี ไม่มีก็ใช้ code ตาม XML</summary>
        static string Port(XElement e, string path, List<string> order)
        {
            foreach (var o in order)
            {
                string c = T(e, path + "/" + o);
                if (c != "") return c;
            }
            return "";
        }

        static string Memo(string s)
        {
            if (s == null) return "";
            var lines = s.Replace("\r\n", "\n").Replace("\r", "\n").Split('\n').Select(l => l.TrimEnd()).ToList();
            while (lines.Count > 0 && lines[0].Trim() == "") lines.RemoveAt(0);
            while (lines.Count > 0 && lines[lines.Count - 1].Trim() == "") lines.RemoveAt(lines.Count - 1);
            return string.Join("\r\n", lines);
        }

        static string Date(string s)
        {
            s = (s ?? "").Trim().Replace("/", "-");
            if (Regex.IsMatch(s, @"^\d{8}$")) s = s.Substring(0, 4) + "-" + s.Substring(4, 2) + "-" + s.Substring(6, 2);
            DateTime dt;
            return DateTime.TryParseExact(s, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out dt) ? dt.ToString("yyyy-MM-dd") : "";
        }

        static string Num(string s)
        {
            decimal d;
            return Fields.TryDec(s, out d) ? d.ToString(CultureInfo.InvariantCulture) : "";
        }

        public static EdiFile Parse(string path, EdiTemplate tpl = null)
        {
            var order = (tpl ?? EdiTemplate.Default()).PortCodeOrder;
            var doc = XDocument.Load(path);
            var root = doc.Root;
            var f = new EdiFile();
            if (root == null || root.Name.LocalName != "seajobfile") { f.Problems.Add("ไม่ใช่ไฟล์ EDI ที่รู้จัก (ต้องขึ้นต้นด้วย seajobfile)"); return f; }

            f.Vessel = T(root, "vessel"); f.Voyage = T(root, "voyage");
            f.LinerCode = T(root, "liner/code"); f.LinerName = T(root, "liner/name");
            f.Etd = Date(T(root, "etddate")); f.Eta = Date(T(root, "etadate"));
            f.LoadCode = Port(root, "loadingport", order); f.LoadName = T(root, "loadingport/name");
            f.DischCode = Port(root, "dischargeport", order); f.DischName = T(root, "dischargeport/name");

            var ctns = new Dictionary<string, EdiContainer>();
            foreach (var c in root.Elements("container"))
            {
                var ec = new EdiContainer { Id = (string)c.Attribute("id") ?? "", No = T(c, "containerno"), Seal = T(c, "sealno"), SizeRaw = T(c, "size"), Remark = T(c, "loadplanremarks") };
                var m = Regex.Match(ec.SizeRaw, @"^\s*(\d+)\s*'?\s*(.*?)\s*$");
                if (m.Success) { ec.Size = m.Groups[1].Value; ec.Type = m.Groups[2].Value.ToUpperInvariant().Replace(" ", ""); }
                else ec.Size = ec.SizeRaw;
                string typ = T(c, "type").ToUpperInvariant().Replace(" ", "");       // รูปแบบ FPS: ชนิดตู้แยกเป็น <type>
                if (typ != "") { ec.Type = typ; if (ec.SizeRaw == "") ec.SizeRaw = ec.Size + "'" + typ; }
                if (f.MasterNo == "") f.MasterNo = T(c, "masterblno");
                f.Containers.Add(ec);
                if (ec.Id != "") ctns[ec.Id] = ec;
            }

            // blcontainer: blid → รายการ (หีบห่อ/น้ำหนัก/ปริมาตร ต่อตู้)
            var allocs = root.Elements("blcontainer").GroupBy(x => (string)x.Attribute("blid") ?? "").ToDictionary(g => g.Key, g => g.ToList());

            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var b in root.Elements("billoflading"))
            {
                var bl = new EdiBl { XmlId = (string)b.Attribute("id") ?? "" };
                var v = bl.V;
                foreach (var fd in Fields.All) v[fd.Key] = "";

                v["BLNO"] = T(b, "blno");
                if (v["BLNO"] == "") f.Problems.Add("billoflading id=" + bl.XmlId + " ไม่มี blno");
                else if (!seen.Add(v["BLNO"])) f.Problems.Add("B/L No. ซ้ำในไฟล์: " + v["BLNO"]);

                v["BLTYPE"] = T(b, "releasemode").ToUpperInvariant();
                if (v["BLTYPE"] == "ORIGINALBL") v["BLTYPE"] = "ORIGINAL";       // ค่าที่ SMF ใช้
                int copies; if (int.TryParse(T(b, "noofcopies"), out copies)) v["BLCOPY"] = copies.ToString();
                v["CHGTERM"] = T(b, "ofppcc").StartsWith("C", StringComparison.OrdinalIgnoreCase) ? "CC" : "PP";
                string from = T(b, "servicemodefrom"), to = T(b, "servicemodeto");
                if (from != "" || to != "") v["CYTERM"] = from + "/" + to;
                v["ISSUPLACE"] = T(b, "issueplace");
                v["ISSUDATE"] = Date(T(b, "issuedate"));
                v["PAYABLEAT"] = T(b, "payableat");
                v["ETD"] = Date(T(b, "onboarddate")) != "" ? Date(T(b, "onboarddate")) : f.Etd;
                v["VESSEL"] = f.Vessel; v["V_VOY"] = f.Voyage;
                v["LINERNO"] = f.LinerCode; v["LINERNAME"] = f.LinerName;

                // เส้นทาง: ชื่อจาก B/L, รหัสจาก XML (ท่าต้นทาง = loadingport, ท่าปลายทาง = destination ของ B/L หรือ dischargeport) — ไม่ค้น OPPORT
                string destCode = Port(b, "destination", order); if (destCode == "") destCode = f.DischCode;
                v["RECPORTNAME"] = T(b, "receiptplace"); v["RECPORT"] = f.LoadCode;
                v["LOADPORTNAME"] = T(b, "loadingportname"); v["LOADPORT"] = f.LoadCode;
                v["DISPORTNAME"] = T(b, "dischargeportname"); v["DISPORT"] = destCode;
                v["DELPORTNAME"] = T(b, "deliveryplace"); v["DELPORT"] = destCode;
                v["FINALPORTNAME"] = T(b, "finaldestination"); v["FINALPORT"] = destCode;

                // คู่ค้า: ข้อความทั้งก้อน (ชื่อ = บรรทัดแรก) — รหัสให้ระบบหาจากชื่อ ตามกติกาเดิม; ถ้า XML ให้รหัสมาด้วยจะลองใช้ก่อน
                v["S_ADD"] = Memo(T(b, "shipper/details")); bl.XmlCodes["SHIPPER"] = T(b, "shipper/code/code");
                v["C_ADD"] = Memo(T(b, "consignee/details")); bl.XmlCodes["CONSIGNEE"] = T(b, "consignee/code/code");
                v["N_ADD"] = Memo(T(b, "notifyparty/details")); bl.XmlCodes["NOTIFY"] = T(b, "notifyparty/code/code");
                v["A_ADD"] = Memo(T(b, "handlingagent/details")); bl.XmlCodes["AGENTNO"] = T(b, "handlingagent/code/code");

                v["MARKDESC"] = Memo(T(b, "marksandnos"));
                v["GOODS"] = Memo(T(b, "descofgoods"));
                if (tpl != null)                                       // ช่องเสริมตาม Template (เช่น PKGWORD ← totalinwords)
                    foreach (var kv in tpl.Fields)
                        if (v.ContainsKey(kv.Key) && T(b, kv.Value) != "") v[kv.Key] = Memo(T(b, kv.Value));

                // หีบห่อ/น้ำหนัก/ปริมาตร = ผลรวมของ blcontainer ที่ชี้มาที่ B/L นี้ + Container List
                decimal gw = 0, cbm = 0, pk = 0; string unit = "";
                var ctnLines = new List<string>();
                List<XElement> list;
                if (!allocs.TryGetValue(bl.XmlId, out list)) { list = new List<XElement>(); bl.Notes.Add("ไม่พบรายการตู้/น้ำหนัก (blcontainer) ของ B/L นี้ — GW/CBM/จำนวนหีบห่อ = 0"); }
                foreach (var a in list)
                {
                    decimal d;
                    if (Fields.TryDec(T(a, "kgs"), out d)) gw += d;
                    if (Fields.TryDec(T(a, "cbm"), out d)) cbm += d;
                    if (Fields.TryDec(T(a, "pkgs/pkgs"), out d)) pk += d;
                    string u = T(a, "pkgs/unit"); if (u != "") unit = u;
                    EdiContainer ec;
                    if (ctns.TryGetValue((string)a.Attribute("containerid") ?? "", out ec))
                    {
                        string line = ec.No + "/" + ec.Seal + "/" + ec.Size + "'" + ec.Type;
                        if (!ctnLines.Contains(line)) ctnLines.Add(line);
                    }
                }
                v["GW"] = gw.ToString(CultureInfo.InvariantCulture);
                v["CBM"] = cbm.ToString(CultureInfo.InvariantCulture);
                v["PKGQTY"] = pk.ToString(CultureInfo.InvariantCulture);
                v["PKGUNIT"] = unit;                                  // ตาม XML ไม่ตรวจกับตารางหน่วย
                v["CTNLIST"] = string.Join("\r\n", ctnLines);
                if (unit == "" ) bl.Notes.Add("ไม่มีหน่วยหีบห่อใน XML");
                f.Bls.Add(bl);
            }
            if (f.Bls.Count == 0) f.Problems.Add("ไม่พบ billoflading ในไฟล์");
            return f;
        }
    }
}
