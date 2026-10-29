// Template ของไฟล์ EDI (ต่อผู้ส่ง): บอกว่าไฟล์ของผู้ส่งนี้หน้าตาอย่างไร (จับคู่ไฟล์), ต้องมี/ควรมีฟิลด์อะไร (ตรวจรูปแบบ), รหัสท่าใช้ฟิลด์ไหนก่อน
// เก็บเป็น JSON: templates\edi\*.json
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Web.Script.Serialization;
using System.Xml.Linq;

namespace BLScan
{
    public class EdiTemplate
    {
        public string Id = "", Name = "", Description = "";
        public List<string> Markers = new List<string>();                 // path ที่พบเฉพาะในไฟล์ของผู้ส่งนี้ (ใช้เดาว่าไฟล์เป็นของใคร)
        public List<string> PortCodeOrder = new List<string> { "uncode", "code" };
        public Dictionary<string, string> Fields = new Dictionary<string, string>();   // ช่องในระบบ ← path ใน billoflading (เสริมจากที่โปรแกรมอ่านอยู่แล้ว)
        public Dictionary<string, List<string>> Required = new Dictionary<string, List<string>>();       // job / container / bl / alloc
        public Dictionary<string, List<string>> Recommended = new Dictionary<string, List<string>>();
        public string FileName = "";

        /// <summary>โฟลเดอร์ Template EDI: [Templates] Path ใน ini + "\\edi" ถ้ามี ไม่งั้นใช้ templates\\edi ข้างโปรแกรม</summary>
        public static string Folder(Ini ini)
        {
            string shared = Path.Combine(Program.TemplateDir(ini, null), "edi");
            return Directory.Exists(shared) ? shared : Path.Combine(Program.DefaultTemplateDir(), "edi");
        }

        public static EdiTemplate Default()
        {
            var t = new EdiTemplate { Id = "generic", Name = "ทั่วไป (ไม่ระบุผู้ส่ง)", Description = "ตรวจเฉพาะโครงสร้างพื้นฐาน" };
            t.Required["job"] = new List<string> { "vessel", "voyage", "loadingport/name", "dischargeport/name" };
            t.Required["container"] = new List<string> { "containerno" };
            t.Required["bl"] = new List<string> { "blno" };
            t.Required["alloc"] = new List<string> { "kgs", "cbm" };
            return t;
        }

        static List<string> L(object o)
        {
            var r = new List<string>();
            var e = o as IEnumerable;
            if (e != null && !(o is string)) foreach (var x in e) r.Add(Convert.ToString(x));
            return r;
        }

        static Dictionary<string, List<string>> Groups(object o)
        {
            var r = new Dictionary<string, List<string>>();
            var d = o as Dictionary<string, object>;
            if (d != null) foreach (var kv in d) r[kv.Key] = L(kv.Value);
            return r;
        }

        public static EdiTemplate Load(string path)
        {
            var d = new JavaScriptSerializer().DeserializeObject(File.ReadAllText(path, Encoding.UTF8)) as Dictionary<string, object>;
            if (d == null) throw new InvalidDataException("ไม่ใช่ไฟล์ Template EDI");
            Func<string, string> s = k => d.ContainsKey(k) ? Convert.ToString(d[k]) : "";
            var t = new EdiTemplate { Id = s("id"), Name = s("name"), Description = s("description"), FileName = Path.GetFileName(path) };
            if (t.Id == "") throw new InvalidDataException("Template ไม่มี id");
            if (d.ContainsKey("markers")) t.Markers = L(d["markers"]);
            if (d.ContainsKey("portCodeOrder")) t.PortCodeOrder = L(d["portCodeOrder"]);
            if (d.ContainsKey("fields") && d["fields"] is Dictionary<string, object>)
                foreach (var kv in (Dictionary<string, object>)d["fields"]) t.Fields[kv.Key] = Convert.ToString(kv.Value);
            if (d.ContainsKey("required")) t.Required = Groups(d["required"]);
            if (d.ContainsKey("recommended")) t.Recommended = Groups(d["recommended"]);
            return t;
        }

        /// <summary>โหลดทุก Template ในโฟลเดอร์ (ไฟล์ที่เสียถูกข้ามและรายงานใน errors)</summary>
        public static List<EdiTemplate> LoadAll(string folder, List<string> errors)
        {
            var list = new List<EdiTemplate>();
            if (string.IsNullOrEmpty(folder) || !Directory.Exists(folder)) return list;
            foreach (var f in Directory.GetFiles(folder, "*.json").OrderBy(x => x))
            {
                try { list.Add(Load(f)); }
                catch (Exception ex) { if (errors != null) errors.Add(Path.GetFileName(f) + ": " + ex.Message); }
            }
            return list;
        }

        public override string ToString() { return Name; }
    }

    public class EdiIssue
    {
        public string Level;      // ผิดพลาด / เตือน / ข้อมูล
        public string Message;
        public bool IsError { get { return Level == "ผิดพลาด"; } }
    }

    public class EdiCheckResult
    {
        public List<EdiIssue> Issues = new List<EdiIssue>();
        public int Errors { get { return Issues.Count(i => i.IsError); } }
        public int Warnings { get { return Issues.Count(i => i.Level == "เตือน"); } }
        public bool Ok { get { return Errors == 0; } }
        public EdiTemplate Detected;                                     // Template ที่ตรงกับไฟล์มากที่สุด (null = ไม่มีตัวบ่งชี้เลย)
        public List<KeyValuePair<EdiTemplate, double>> Scores = new List<KeyValuePair<EdiTemplate, double>>();
        public int BlCount, ContainerCount;
        void Add(string level, string msg) { Issues.Add(new EdiIssue { Level = level, Message = msg }); }
        public void Error(string m) { Add("ผิดพลาด", m); }
        public void Warn(string m) { Add("เตือน", m); }
        public void Info(string m) { Add("ข้อมูล", m); }
    }

    public static class EdiValidator
    {
        static string V(XElement e, string path)
        {
            XElement cur = e;
            foreach (var p in path.Split('/')) { if (cur == null) return ""; cur = cur.Element(p); }
            return cur == null ? "" : (cur.Value ?? "").Trim();
        }

        static bool Exists(XElement e, string path)
        {
            XElement cur = e;
            foreach (var p in path.Split('/')) { if (cur == null) return false; cur = cur.Element(p); }
            return cur != null;
        }

        static double Score(XElement root, EdiTemplate t)
        {
            if (t.Markers.Count == 0) return 0;
            int hit = 0;
            foreach (var m in t.Markers)
            {
                // marker แบบ "billoflading/x" = มีอย่างน้อย 1 รายการ
                var parts = m.Split('/');
                IEnumerable<XElement> level = new[] { root };
                foreach (var p in parts) level = level.SelectMany(x => x.Elements(p)).ToList();
                if (level.Any(x => x.HasElements || (x.Value ?? "").Trim() != "")) hit++;
            }
            return (double)hit / t.Markers.Count;
        }

        public static EdiTemplate Detect(string path, List<EdiTemplate> all)
        {
            try { return Check(path, null, all).Detected; } catch { return null; }
        }

        /// <summary>ตรวจไฟล์ EDI กับ Template (null = ใช้ Template ที่ตรวจพบเอง/ทั่วไป)</summary>
        public static EdiCheckResult Check(string path, EdiTemplate t, List<EdiTemplate> all)
        {
            var res = new EdiCheckResult();
            XDocument doc;
            try { doc = XDocument.Load(path); }
            catch (Exception ex) { res.Error("อ่านไฟล์ XML ไม่ได้ (รูปแบบ XML ไม่ถูกต้อง): " + ex.Message); return res; }
            var root = doc.Root;
            if (root == null || root.Name.LocalName != "seajobfile") { res.Error("ไม่ใช่ไฟล์ EDI ที่รู้จัก — ต้องขึ้นต้นด้วย <seajobfile>"); return res; }

            foreach (var x in all ?? new List<EdiTemplate>()) res.Scores.Add(new KeyValuePair<EdiTemplate, double>(x, Score(root, x)));
            var best = res.Scores.OrderByDescending(k => k.Value).FirstOrDefault();
            if (best.Key != null && best.Value > 0) res.Detected = best.Key;
            if (t == null) t = res.Detected ?? EdiTemplate.Default();
            double mine = Score(root, t);
            if (t.Markers.Count > 0)
            {
                if (mine >= 0.99) res.Info("ไฟล์ตรงกับ Template \"" + t.Name + "\" ครบทุกตัวบ่งชี้");
                else if (res.Detected != null && res.Detected != t && best.Value > mine)
                    res.Warn("ไฟล์นี้ดูเหมือนของ \"" + res.Detected.Name + "\" (" + (int)(best.Value * 100) + "%) มากกว่า \"" + t.Name + "\" (" + (int)(mine * 100) + "%) — ตรวจสอบว่าเลือก Template ถูก");
                else if (mine < 0.5) res.Warn("ไฟล์ตรงกับตัวบ่งชี้ของ \"" + t.Name + "\" เพียง " + (int)(mine * 100) + "%");
            }

            Action<string, string, XElement, string> need = (level, label, el, path1) =>
            {
                if (V(el, path1) != "") return;
                string m = label + ": ไม่มีค่า <" + path1.Replace("/", "/") + ">";
                if (level == "e") res.Error(m); else res.Warn(m);
            };
            List<string> g;
            Func<Dictionary<string, List<string>>, string, List<string>> grp = (d, k) => d.TryGetValue(k, out g) ? g : new List<string>();

            // งาน
            foreach (var p in grp(t.Required, "job")) need("e", "ข้อมูลงาน", root, p);
            foreach (var p in grp(t.Recommended, "job")) need("w", "ข้อมูลงาน", root, p);
            foreach (var d in new[] { "etddate", "etadate" })
            {
                string s = V(root, d); DateTime dt;
                if (s != "" && !DateTime.TryParseExact(s.Replace("/", "-"), "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out dt)) res.Error("<" + d + "> วันที่ไม่ถูกต้อง \"" + s + "\" (ต้องเป็น yyyy-MM-dd)");
            }
            string etd = V(root, "etddate"), eta = V(root, "etadate"); DateTime d1, d2;
            if (DateTime.TryParse(etd, out d1) && DateTime.TryParse(eta, out d2) && d2 < d1) res.Warn("ETA (" + eta + ") ก่อน ETD (" + etd + ")");

            // ตู้
            var ctns = root.Elements("container").ToList();
            res.ContainerCount = ctns.Count;
            if (ctns.Count == 0) res.Error("ไม่พบตู้ (<container>) ในไฟล์");
            var ctnIds = new HashSet<string>(ctns.Select(c => (string)c.Attribute("id") ?? ""));
            foreach (var c in ctns)
            {
                string label = "ตู้ " + V(c, "containerno");
                foreach (var p in grp(t.Required, "container")) need("e", label, c, p);
                foreach (var p in grp(t.Recommended, "container")) need("w", label, c, p);
                string no = V(c, "containerno");
                if (no != "" && !System.Text.RegularExpressions.Regex.IsMatch(no.Replace(" ", ""), @"^[A-Z]{4}\d{7}$")) res.Warn(label + ": เลขตู้ไม่ตรงรูปแบบมาตรฐาน (AAAA1234567)");
                if ((string)c.Attribute("id") == null) res.Warn(label + ": ไม่มี id ของตู้ (ใช้จับคู่กับรายการ blcontainer)");
            }

            // B/L
            var bls = root.Elements("billoflading").ToList();
            res.BlCount = bls.Count;
            if (bls.Count == 0) res.Error("ไม่พบ House B/L (<billoflading>) ในไฟล์");
            var allocs = root.Elements("blcontainer").ToList();
            var blIds = new HashSet<string>(bls.Select(b => (string)b.Attribute("id") ?? ""));
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var b in bls)
            {
                string blno = V(b, "blno"), id = (string)b.Attribute("id") ?? "";
                string label = "B/L " + (blno != "" ? blno : "(id " + id + ")");
                foreach (var p in grp(t.Required, "bl")) need("e", label, b, p);
                foreach (var p in grp(t.Recommended, "bl")) need("w", label, b, p);
                if (id == "") res.Error(label + ": ไม่มี id (ใช้จับคู่กับ blcontainer)");
                if (blno != "" && !seen.Add(blno)) res.Error(label + ": B/L No. ซ้ำในไฟล์");
                foreach (var kv in t.Fields) if (V(b, kv.Value) == "") res.Warn(label + ": ไม่มี <" + kv.Value + "> (ใช้กับช่อง " + kv.Key + ")");
                var mine2 = allocs.Where(a => (string)a.Attribute("blid") == id).ToList();
                if (mine2.Count == 0) res.Warn(label + ": ไม่มีรายการตู้/น้ำหนัก (<blcontainer blid=\"" + id + "\">) — GW/CBM/จำนวนหีบห่อจะเป็น 0");
            }

            // blcontainer
            foreach (var a in allocs)
            {
                string bid = (string)a.Attribute("blid") ?? "", cid = (string)a.Attribute("containerid") ?? "";
                string label = "blcontainer (blid " + bid + ")";
                if (!blIds.Contains(bid)) res.Error(label + ": ไม่มี B/L ที่ id นี้");
                if (!ctnIds.Contains(cid)) res.Error(label + ": ไม่มีตู้ที่ id " + cid);
                foreach (var p in grp(t.Required, "alloc")) need("e", label, a, p);
                foreach (var p in grp(t.Recommended, "alloc")) need("w", label, a, p);
                foreach (var n in new[] { "kgs", "cbm", "pkgs/pkgs" })
                {
                    string s = V(a, n); decimal dv;
                    if (s != "" && (!Fields.TryDec(s, out dv) || dv < 0)) res.Error(label + ": <" + n + "> ไม่ใช่ตัวเลข \"" + s + "\"");
                }
            }

            // รหัสท่า
            string first = t.PortCodeOrder.FirstOrDefault() ?? "code";
            foreach (var pe in new[] { "loadingport", "dischargeport" })
                if (V(root, pe + "/" + first) == "")
                    res.Warn("<" + pe + "> ไม่มี <" + first + "> ตามที่ Template กำหนด" + (t.PortCodeOrder.Skip(1).Any(o => V(root, pe + "/" + o) != "") ? " — ใช้ <" + t.PortCodeOrder.Skip(1).First(o => V(root, pe + "/" + o) != "") + "> แทน" : " — จะไม่มีรหัสท่า"));

            if (res.Ok) res.Info("รูปแบบไฟล์ผ่าน: " + bls.Count + " B/L, " + ctns.Count + " ตู้" + (res.Warnings > 0 ? " (มีคำเตือน " + res.Warnings + " รายการ)" : ""));
            return res;
        }
    }
}
