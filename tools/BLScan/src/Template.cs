// Template = ข้อกำหนดการอ่านฟอร์ม B/L ของผู้ออกหนึ่งราย (BL Owner) เก็บเป็นไฟล์ JSON ข้าง exe (หรือโฟลเดอร์กลาง)
// ตัวอ่าน (BLParser) มีตัวเดียว: Template ทั่วไป (generic) คือค่าเริ่มต้นในโค้ด ส่วน Template ของผู้ออกจะ "เพิ่มเติม" ทับ generic
//   identify   : คำที่ใช้ยืนยันว่าไฟล์นี้เป็นฟอร์มของผู้ออกรายนี้ (ชื่อบริษัทที่หัวฟอร์ม)
//   labels     : คำเรียกหัวช่องเพิ่ม/แทน เช่น "Voy. No." → VOYAGE
//   zones      : ตำแหน่งสำรองของช่อง (สัดส่วนของหน้า) เมื่อ OCR อ่านหัวช่องไม่ออก — y = ขอบบนที่ข้อความของช่องเริ่ม
//   strip      : ข้อความตัดทิ้ง (บรรทัดประกอบหัวช่อง)
//   terms      : ข้อความ → ค่า CY term  เช่น "CFS-CFS": "CFS/CFS"
//   dateFormats: รูปแบบวันที่เฉพาะฟอร์ม เช่น "yyyy/MM/dd"
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Web.Script.Serialization;

namespace BLScan
{
    public class Zone
    {
        public double X, Y, W, H;       // สัดส่วนของหน้า 0..1
    }

    public class Template
    {
        public string Id = "", Name = "", Note = "";
        public int Version = 1;
        public string[] Identify = new string[0];
        public int MinScore = 1;
        public bool ReplaceLabels;
        public Dictionary<string, string[]> Labels = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);
        public Dictionary<string, Zone> Zones = new Dictionary<string, Zone>(StringComparer.OrdinalIgnoreCase);
        public string[] Strip = new string[0];
        public string[] Inline = new string[0];      // ช่องที่ค่าอยู่ "ขวามือ" หัวช่อง (แทนที่จะอยู่ใต้หัวช่อง) เช่น B/L No. ของ Shine
        public string[] Stop = new string[0];        // หัวตาราง/ข้อความที่ไม่ใช่ช่องของเรา แต่ต้องกั้นไม่ให้ข้อความใต้มันถูกดึงไปเป็นค่าของช่องอื่น
        public Dictionary<string, string> Terms = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        public string[] DateFormats = new string[0];
        public Dictionary<string, string> Copy = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);   // ช่องปลายทาง -> ช่องต้นทาง: ถ้าปลายทางอ่านไม่ได้ (ว่าง) ให้คัดลอกค่าจากต้นทาง เช่น FINALPORTNAME -> DELPORTNAME
        public string SourceFile = "";

        public bool IsGeneric { get { return string.Equals(Id, "generic", StringComparison.OrdinalIgnoreCase); } }

        public override string ToString() { return IsGeneric ? Name : Name + "  (v" + Version + ")"; }

        public static Template Generic()
        {
            return new Template { Id = "generic", Name = "ทั่วไป (ไม่ได้จูนกับผู้ออกรายใด)", Note = "อ่านด้วยหัวช่องมาตรฐาน — ฟอร์มที่ยังไม่มี Template" };
        }

        static string Key(string s)
        {
            var sb = new StringBuilder();
            foreach (char c in (s ?? "").ToLowerInvariant()) if (char.IsLetterOrDigit(c)) sb.Append(c);
            return sb.ToString();
        }

        /// <summary>จำนวนคำระบุผู้ออก (identify) ที่พบในข้อความ OCR ของหน้า</summary>
        public int Score(string ocrText)
        {
            string flat = Key(ocrText);
            return Identify.Select(Key).Where(k => k.Length > 0).Distinct().Count(k => flat.Contains(k));
        }

        public bool Matches(string ocrText) { return IsGeneric || Identify.Length == 0 || Score(ocrText) >= MinScore; }

        // ---------------------------------------------------------------- JSON

        static string[] Strs(object o)
        {
            var e = o as System.Collections.IEnumerable;
            if (e == null || o is string) return o is string ? new[] { (string)o } : new string[0];
            return e.Cast<object>().Select(x => Convert.ToString(x)).ToArray();
        }

        static double Dbl(object o) { return o == null ? 0 : Convert.ToDouble(o, System.Globalization.CultureInfo.InvariantCulture); }

        public static Template FromJson(string json)
        {
            var root = new JavaScriptSerializer().DeserializeObject(json) as Dictionary<string, object>;
            if (root == null) throw new FormatException("ไม่ใช่ JSON object");
            var t = new Template();
            Func<string, object> g = k => root.ContainsKey(k) ? root[k] : null;
            t.Id = Convert.ToString(g("id") ?? "").Trim();
            t.Name = Convert.ToString(g("name") ?? t.Id);
            t.Note = Convert.ToString(g("note") ?? "");
            if (g("version") != null) t.Version = Convert.ToInt32(g("version"));
            if (t.Id == "") throw new FormatException("ไม่มี id");
            var ident = g("identify") as Dictionary<string, object>;
            if (ident != null)
            {
                t.Identify = Strs(ident.ContainsKey("keywords") ? ident["keywords"] : null);
                if (ident.ContainsKey("minScore")) t.MinScore = Math.Max(1, Convert.ToInt32(ident["minScore"]));
            }
            var labels = g("labels") as Dictionary<string, object>;
            if (labels != null) foreach (var kv in labels) t.Labels[kv.Key] = Strs(kv.Value);
            t.ReplaceLabels = g("replaceLabels") != null && Convert.ToBoolean(g("replaceLabels"));
            var zones = g("zones") as Dictionary<string, object>;
            if (zones != null)
                foreach (var kv in zones)
                {
                    var z = kv.Value as Dictionary<string, object>;
                    if (z == null) continue;
                    t.Zones[kv.Key] = new Zone { X = Dbl(z.ContainsKey("x") ? z["x"] : null), Y = Dbl(z.ContainsKey("y") ? z["y"] : null),
                                                 W = Dbl(z.ContainsKey("w") ? z["w"] : null), H = Dbl(z.ContainsKey("h") ? z["h"] : null) };
                }
            t.Strip = Strs(g("strip"));
            t.Inline = Strs(g("inline"));
            t.Stop = Strs(g("stop"));
            var terms = g("terms") as Dictionary<string, object>;
            if (terms != null) foreach (var kv in terms) t.Terms[kv.Key] = Convert.ToString(kv.Value);
            t.DateFormats = Strs(g("dateFormats"));
            var copy = g("copy") as Dictionary<string, object>;
            if (copy != null) foreach (var kv in copy) t.Copy[kv.Key] = Convert.ToString(kv.Value);
            return t;
        }

        static string Q(string s)
        {
            var sb = new StringBuilder("\"");
            foreach (char c in s ?? "")
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': break;
                    case '\t': sb.Append("\\t"); break;
                    default: sb.Append(c); break;
                }
            }
            return sb.Append('"').ToString();
        }

        static string Arr(IEnumerable<string> xs) { return "[" + string.Join(", ", xs.Select(Q)) + "]"; }

        public string ToJson()
        {
            var sb = new StringBuilder();
            var ci = System.Globalization.CultureInfo.InvariantCulture;
            sb.Append("{\n");
            sb.Append("  \"id\": " + Q(Id) + ",\n  \"name\": " + Q(Name) + ",\n  \"version\": " + Version + ",\n");
            if (Note != "") sb.Append("  \"note\": " + Q(Note) + ",\n");
            sb.Append("  \"identify\": { \"keywords\": " + Arr(Identify) + ", \"minScore\": " + MinScore + " },\n");
            if (ReplaceLabels) sb.Append("  \"replaceLabels\": true,\n");
            sb.Append("  \"labels\": {" + (Labels.Count == 0 ? "" : "\n" + string.Join(",\n", Labels.Select(kv => "    " + Q(kv.Key) + ": " + Arr(kv.Value))) + "\n  ") + "},\n");
            sb.Append("  \"zones\": {" + (Zones.Count == 0 ? "" : "\n" + string.Join(",\n", Zones.Select(kv =>
                "    " + Q(kv.Key) + ": { \"x\": " + kv.Value.X.ToString("0.###", ci) + ", \"y\": " + kv.Value.Y.ToString("0.###", ci) +
                ", \"w\": " + kv.Value.W.ToString("0.###", ci) + ", \"h\": " + kv.Value.H.ToString("0.###", ci) + " }")) + "\n  ") + "},\n");
            sb.Append("  \"strip\": " + Arr(Strip) + ",\n");
            sb.Append("  \"inline\": " + Arr(Inline) + ",\n");
            sb.Append("  \"stop\": " + Arr(Stop) + ",\n");
            sb.Append("  \"terms\": {" + (Terms.Count == 0 ? "" : "\n" + string.Join(",\n", Terms.Select(kv => "    " + Q(kv.Key) + ": " + Q(kv.Value))) + "\n  ") + "},\n");
            if (Copy.Count > 0) sb.Append("  \"copy\": {\n" + string.Join(",\n", Copy.Select(kv => "    " + Q(kv.Key) + ": " + Q(kv.Value))) + "\n  },\n");
            sb.Append("  \"dateFormats\": " + Arr(DateFormats) + "\n}\n");
            return sb.ToString();
        }
    }

    public static class TemplateStore
    {
        /// <summary>โหลด *.json ทั้งหมดในโฟลเดอร์ — Generic มาก่อนเสมอ ไฟล์ที่เสีย/id ซ้ำจะรายงานใน errors แล้วข้าม</summary>
        public static List<Template> LoadAll(string folder, List<string> errors)
        {
            var list = new List<Template> { Template.Generic() };
            if (string.IsNullOrEmpty(folder) || !Directory.Exists(folder)) { errors.Add("ไม่พบโฟลเดอร์ Template: " + folder); return list; }
            foreach (var f in Directory.GetFiles(folder, "*.json").Where(x => !string.Equals(Path.GetFileName(x), AdminAuth.FileName, StringComparison.OrdinalIgnoreCase))
                                                              .OrderBy(x => x, StringComparer.OrdinalIgnoreCase))
            {
                try
                {
                    var t = Template.FromJson(File.ReadAllText(f, Encoding.UTF8));
                    t.SourceFile = f;
                    if (t.IsGeneric) { errors.Add(Path.GetFileName(f) + ": id \"generic\" สงวนไว้ ข้าม"); continue; }
                    if (list.Any(x => string.Equals(x.Id, t.Id, StringComparison.OrdinalIgnoreCase))) { errors.Add(Path.GetFileName(f) + ": id ซ้ำ \"" + t.Id + "\" ข้าม"); continue; }
                    list.Add(t);
                }
                catch (Exception ex) { errors.Add(Path.GetFileName(f) + ": อ่านไม่ได้ — " + ex.Message); }
            }
            return list;
        }

        public class LoadInfo
        {
            public List<Template> Templates = new List<Template>();
            public string Source = "local";      // local = โฟลเดอร์ข้าง exe · shared = โฟลเดอร์กลาง · cache = สำเนาสำรอง (โฟลเดอร์กลางเปิดไม่ได้)
            public string Folder = "";
            public List<string> Errors = new List<string>();
        }

        public static string SamePath(string p)
        {
            try { return Path.GetFullPath(p).TrimEnd('\\', '/').ToLowerInvariant(); } catch { return (p ?? "").ToLowerInvariant(); }
        }

        /// <summary>
        /// โหลด Template: โฟลเดอร์ที่ตั้งไว้ (กลาง) ก่อน — สำเร็จแล้วทำสำเนาสำรองไว้ในเครื่อง, เปิดไม่ได้ก็ใช้สำเนาสำรองล่าสุด
        /// ถ้าเป็นโฟลเดอร์ข้าง exe (ค่าเริ่มต้น) ไม่ต้องมีสำเนาสำรอง
        /// </summary>
        public static LoadInfo Load(string path, string defaultDir, string cacheDir)
        {
            var info = new LoadInfo { Folder = path };
            if (SamePath(path) == SamePath(defaultDir))
            {
                info.Source = "local";
                info.Templates = LoadAll(path, info.Errors);
                return info;
            }
            try
            {
                if (!Directory.Exists(path)) throw new DirectoryNotFoundException("ไม่พบโฟลเดอร์");
                Directory.GetFiles(path, "*.json");                       // ทดสอบว่าอ่านได้
                info.Source = "shared";
                info.Templates = LoadAll(path, info.Errors);
                try { MirrorToCache(path, cacheDir); } catch (Exception ex) { info.Errors.Add("ทำสำเนาสำรองไม่ได้: " + ex.Message); }
            }
            catch (Exception ex)
            {
                info.Source = "cache";
                info.Errors.Add("เปิดโฟลเดอร์กลางไม่ได้ (" + ex.Message + ") — ใช้สำเนาสำรองล่าสุดในเครื่อง");
                info.Templates = LoadAll(cacheDir, info.Errors);
            }
            return info;
        }

        /// <summary>ทำสำเนา Template (ไม่รวม admin.json) ไปไว้ในเครื่องแบบกระจกเงา — ไฟล์ที่ถูกลบจากโฟลเดอร์กลางจะถูกลบออกจากสำเนาด้วย</summary>
        public static void MirrorToCache(string src, string cacheDir)
        {
            Directory.CreateDirectory(cacheDir);
            var want = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var f in Directory.GetFiles(src, "*.json"))
            {
                string name = Path.GetFileName(f);
                if (string.Equals(name, AdminAuth.FileName, StringComparison.OrdinalIgnoreCase)) continue;
                want.Add(name);
                string dst = Path.Combine(cacheDir, name);
                var a = new FileInfo(f);
                if (!File.Exists(dst) || new FileInfo(dst).Length != a.Length || new FileInfo(dst).LastWriteTimeUtc != a.LastWriteTimeUtc)
                {
                    File.Copy(f, dst, true);
                    File.SetLastWriteTimeUtc(dst, a.LastWriteTimeUtc);
                }
            }
            foreach (var f in Directory.GetFiles(cacheDir, "*.json"))
                if (!want.Contains(Path.GetFileName(f))) File.Delete(f);
        }

        static string SafeName(string id)
        {
            var sb = new StringBuilder();
            foreach (char c in id.ToLowerInvariant()) sb.Append(char.IsLetterOrDigit(c) || c == '-' || c == '_' ? c : '-');
            return sb.ToString();
        }

        /// <summary>
        /// นำเข้า Template จากไฟล์ — ตรวจรูปแบบก่อน (throw ถ้าไม่ถูกต้อง). ถ้า id ซ้ำกับที่มีอยู่และยังไม่ยืนยัน คืน needConfirm = true
        /// ไฟล์เดิมที่ถูกทับจะสำรองไว้ใน _trash เสมอ
        /// </summary>
        public static string Import(string folder, string sourceFile, bool overwriteConfirmed, out Template imported, out bool needConfirm)
        {
            imported = null; needConfirm = false;
            string json = File.ReadAllText(sourceFile, Encoding.UTF8);
            var t = Template.FromJson(json);
            if (t.IsGeneric) throw new FormatException("id \"generic\" สงวนไว้");
            string dst = Path.Combine(folder, SafeName(t.Id) + ".json");
            var existing = LoadAll(folder, new List<string>()).FirstOrDefault(x => string.Equals(x.Id, t.Id, StringComparison.OrdinalIgnoreCase));
            imported = t;
            if (existing != null && !overwriteConfirmed)
            {
                needConfirm = true;
                return "มี Template id \"" + t.Id + "\" อยู่แล้ว (v" + existing.Version + ") — ไฟล์ที่นำเข้าเป็น v" + t.Version + (t.Version <= existing.Version ? " ⚠ ไม่ใหม่กว่า" : "");
            }
            if (existing != null && !string.IsNullOrEmpty(existing.SourceFile) &&
                !string.Equals(Path.GetFullPath(existing.SourceFile), Path.GetFullPath(dst), StringComparison.OrdinalIgnoreCase))
                Trash(folder, existing.Id);                          // id เดิมอยู่ในไฟล์ชื่ออื่น → ย้ายไฟล์เก่าไป _trash กัน id ซ้ำ
            else if (existing != null) BackupToTrash(dst);
            Directory.CreateDirectory(folder);
            AdminAuth.AtomicWrite(dst, json);
            return "นำเข้า \"" + t.Name + "\" (v" + t.Version + ") แล้ว";
        }

        /// <summary>ชื่อไฟล์ใน _trash ที่ไม่ซ้ำเสมอ (วันเวลา + เลขลำดับถ้าชนกันในวินาทีเดียวกัน) — ไม่ทับไฟล์สำรองเดิม</summary>
        static string TrashPath(string dir, string baseName)
        {
            Directory.CreateDirectory(dir);
            string stem = baseName + "_" + DateTime.Now.ToString("yyyyMMdd_HHmmss");
            string path = Path.Combine(dir, stem + ".json");
            for (int i = 2; File.Exists(path); i++) path = Path.Combine(dir, stem + "_" + i + ".json");
            return path;
        }

        static void BackupToTrash(string file)
        {
            File.Copy(file, TrashPath(Path.Combine(Path.GetDirectoryName(file), "_trash"), Path.GetFileNameWithoutExtension(file)), false);
        }

        /// <summary>"ลบ" Template = ย้ายไป _trash พร้อมวันเวลา (กู้คืนได้ด้วยการย้ายกลับ)</summary>
        public static void Trash(string folder, string id)
        {
            var t = LoadAll(folder, new List<string>()).FirstOrDefault(x => string.Equals(x.Id, id, StringComparison.OrdinalIgnoreCase));
            if (t == null || string.IsNullOrEmpty(t.SourceFile)) throw new FileNotFoundException("ไม่พบ Template " + id);
            File.Move(t.SourceFile, TrashPath(Path.Combine(folder, "_trash"), Path.GetFileNameWithoutExtension(t.SourceFile)));
        }

        /// <summary>
        /// บันทึก Template (ใช้โดย Designer): ถ้าไฟล์เดิมมีอยู่และเวอร์ชันในไฟล์ไม่ตรงกับ expectedVersion แปลว่ามี admin คนอื่นแก้ไปแล้ว → ปฏิเสธ
        /// สำเร็จแล้วเลขเวอร์ชันเพิ่มขึ้น 1 และสำรองไฟล์เดิมไว้ใน _trash
        /// </summary>
        public static void Save(string folder, Template t, int expectedVersion)
        {
            string dst = Path.Combine(folder, SafeName(t.Id) + ".json");
            if (File.Exists(dst))
            {
                var cur = Template.FromJson(File.ReadAllText(dst, Encoding.UTF8));
                if (cur.Version != expectedVersion)
                    throw new InvalidOperationException("Template \"" + t.Id + "\" ถูกแก้ไขโดยคนอื่นแล้ว (ตอนนี้ v" + cur.Version + " แต่คุณแก้จาก v" + expectedVersion + ") — โหลดใหม่ก่อนบันทึก");
                BackupToTrash(dst);
            }
            t.Version = expectedVersion + 1;
            Directory.CreateDirectory(folder);
            AdminAuth.AtomicWrite(dst, t.ToJson());
            t.SourceFile = dst;
        }

        public static Template Find(List<Template> list, string id)
        {
            return list.FirstOrDefault(t => string.Equals(t.Id, id, StringComparison.OrdinalIgnoreCase));
        }
    }
}
