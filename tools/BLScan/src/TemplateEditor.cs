// ตรรกะแก้ Template (ไม่มีหน้าจอ) — Template Designer เรียกใช้ และทดสอบแยกได้
// การแก้ทั้งหมดทำกับสำเนาทำงาน (working copy) แล้วค่อยบันทึกลงไฟล์ผ่าน TemplateStore.Save
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace BLScan
{
    public static class TemplateEditor
    {
        /// <summary>สำเนาลึกของ Template (ผ่าน JSON) — แก้สำเนาได้โดยไม่กระทบต้นฉบับ</summary>
        public static Template Clone(Template t)
        {
            var c = Template.FromJson(t.ToJson());
            c.SourceFile = t.SourceFile;
            return c;
        }

        public static Template NewEmpty(string id, string name)
        {
            return new Template { Id = id.Trim().ToLowerInvariant(), Name = name.Trim(), Version = 0 };
        }

        /// <summary>id ใช้ได้: a-z 0-9 - _ ยาว 2-40 ตัว ไม่ซ้ำกับ generic</summary>
        public static string ValidateId(string id)
        {
            id = (id ?? "").Trim().ToLowerInvariant();
            if (id.Length < 2 || id.Length > 40) return "id ต้องยาว 2-40 ตัวอักษร";
            if (!Regex.IsMatch(id, @"^[a-z0-9][a-z0-9_-]*$")) return "id ใช้ได้เฉพาะ a-z 0-9 - _ (ขึ้นต้นด้วยตัวอักษรหรือตัวเลข)";
            if (id == "generic") return "id \"generic\" สงวนไว้";
            return "";
        }

        static string Collapse(string s) { return Regex.Replace((s ?? "").Trim(), @"\s+", " "); }

        static bool SamePhrase(string a, string b)
        {
            return string.Equals(Regex.Replace(a ?? "", @"[^A-Za-z0-9]", ""), Regex.Replace(b ?? "", @"[^A-Za-z0-9]", ""), StringComparison.OrdinalIgnoreCase);
        }

        // ---------------- หัวช่อง ----------------
        /// <summary>เพิ่มคำเรียกหัวช่องของช่อง key (คำใหม่อยู่หน้าสุด = ชนะก่อน) — ซ้ำกับที่มีอยู่จะไม่เพิ่ม; คืน true ถ้าเพิ่มจริง</summary>
        public static bool AddLabel(Template t, string key, string phrase)
        {
            phrase = Collapse(phrase);
            if (phrase.Length == 0) return false;
            string[] cur;
            if (!t.Labels.TryGetValue(key, out cur)) cur = new string[0];
            if (cur.Any(x => SamePhrase(x, phrase))) return false;
            t.Labels[key] = new[] { phrase }.Concat(cur).ToArray();
            return true;
        }

        public static void SetLabels(Template t, string key, IEnumerable<string> phrases)
        {
            var list = phrases.Select(Collapse).Where(x => x.Length > 0).ToArray();
            if (list.Length == 0) t.Labels.Remove(key); else t.Labels[key] = list;
        }

        // ---------------- โซนสำรอง ----------------
        /// <summary>โซนเป็นสัดส่วนของหน้า (0..1): y = ขอบบนที่ข้อความของช่องเริ่ม</summary>
        public static void SetZone(Template t, string key, double x, double y, double w, double h)
        {
            Func<double, double> c = v => Math.Max(0, Math.Min(1, Math.Round(v, 3)));
            t.Zones[key] = new Zone { X = c(x), Y = c(y), W = c(w), H = c(h) };
        }

        public static bool RemoveZone(Template t, string key) { return t.Zones.Remove(key); }

        // ---------------- รายการข้อความ ----------------
        public static bool AddIdentify(Template t, string text)
        {
            text = Collapse(text);
            if (text.Length < 3) return false;
            if (t.Identify.Any(x => SamePhrase(x, text))) return false;
            t.Identify = t.Identify.Concat(new[] { text }).ToArray();
            return true;
        }

        public static bool AddStrip(Template t, string text)
        {
            text = Collapse(text);
            if (text.Length < 2) return false;
            if (t.Strip.Any(x => SamePhrase(x, text))) return false;
            t.Strip = t.Strip.Concat(new[] { text }).ToArray();
            return true;
        }

        public static void SetLines(Template t, string which, string multiline)
        {
            var lines = (multiline ?? "").Replace("\r\n", "\n").Split('\n').Select(Collapse).Where(x => x.Length > 0).ToArray();
            switch (which)
            {
                case "identify": t.Identify = lines; break;
                case "strip": t.Strip = lines; break;
                case "dateFormats": t.DateFormats = lines; break;
                case "inline": t.Inline = lines.Select(x => x.ToUpperInvariant()).ToArray(); break;
                case "stop": t.Stop = lines; break;
                default: throw new ArgumentException(which);
            }
        }

        /// <summary>แปลงข้อความ "ข้อความ => ค่า" (บรรทัดละคู่) เป็น terms; คืนบรรทัดที่อ่านไม่ได้เพื่อแจ้งผู้ใช้</summary>
        public static List<string> SetTerms(Template t, string multiline)
        {
            var bad = new List<string>();
            var d = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var raw in (multiline ?? "").Replace("\r\n", "\n").Split('\n'))
            {
                string line = raw.Trim();
                if (line == "") continue;
                int i = line.IndexOf("=>", StringComparison.Ordinal);
                if (i <= 0 || i + 2 >= line.Length) { bad.Add(line); continue; }
                string k = Collapse(line.Substring(0, i)), v = Collapse(line.Substring(i + 2));
                if (k.Length == 0 || v.Length == 0) { bad.Add(line); continue; }
                d[k] = v;
            }
            t.Terms = d;
            return bad;
        }

        /// <summary>แปลงข้อความ "ปลายทาง = ต้นทาง" (บรรทัดละคู่, รหัสช่องผลลัพธ์ เช่น FINALPORTNAME = DELPORTNAME) เป็นกติกาคัดลอก; คืนบรรทัดที่ใช้ไม่ได้</summary>
        public static List<string> SetCopy(Template t, string multiline)
        {
            var bad = new List<string>();
            var d = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var raw in (multiline ?? "").Replace("\r\n", "\n").Split('\n'))
            {
                string line = raw.Trim();
                if (line == "") continue;
                var p = line.Split(new[] { '=' }, 2);
                string k = p.Length == 2 ? p[0].Trim().ToUpperInvariant() : "", v = p.Length == 2 ? p[1].Trim().Trim('>').Trim().ToUpperInvariant() : "";
                if (k == "" || v == "" || k == v || !Fields.All.Any(f => f.Key == k) || !Fields.All.Any(f => f.Key == v)) { bad.Add(line); continue; }
                d[k] = v;
            }
            t.Copy = d;
            return bad;
        }

        public static string CopyText(Template t)
        {
            return string.Join("\r\n", t.Copy.Select(kv => kv.Key + " = " + kv.Value));
        }

        public static string TermsText(Template t)
        {
            return string.Join("\r\n", t.Terms.Select(kv => kv.Key + " => " + kv.Value));
        }

        // ---------------- ข้อความจากคำที่เลือกบนภาพ ----------------
        /// <summary>ต่อคำที่เลือกตามลำดับการอ่าน (บนลงล่าง ซ้ายไปขวา) เป็นข้อความเดียว</summary>
        public static string TextOf(IEnumerable<OcrWord> words)
        {
            var list = words.ToList();
            if (list.Count == 0) return "";
            var rows = new List<List<OcrWord>>();
            foreach (var w in list.OrderBy(w => w.CY))
            {
                var row = rows.LastOrDefault(r => Math.Abs(r.Average(x => x.CY) - w.CY) < Math.Max(w.H, 0.004) * 0.6);
                if (row == null) { row = new List<OcrWord>(); rows.Add(row); }
                row.Add(w);
            }
            return Collapse(string.Join(" ", rows.Select(r => string.Join(" ", r.OrderBy(w => w.X).Select(w => w.Text)))));
        }

        /// <summary>ตรวจ Template ก่อนบันทึก — คืนรายการปัญหา (error) และคำเตือน</summary>
        public static List<string> Validate(Template t, out List<string> warnings)
        {
            var errors = new List<string>(); warnings = new List<string>();
            string e = ValidateId(t.Id);
            if (e != "") errors.Add(e);
            if (string.IsNullOrWhiteSpace(t.Name)) errors.Add("ยังไม่ได้ตั้งชื่อ Template");
            if (t.Identify.Length == 0) warnings.Add("ยังไม่มีคำระบุผู้ออก (identify) — ระบบจะตรวจไม่ได้ว่าไฟล์เป็นฟอร์มของผู้ออกนี้จริงไหม");
            foreach (var kv in t.Zones)
                if (kv.Value.W <= 0 || kv.Value.H <= 0) errors.Add("โซน " + kv.Key + " ขนาดเป็นศูนย์");
            foreach (var kv in t.DateFormats)
                try { DateTime.Now.ToString(kv, System.Globalization.CultureInfo.InvariantCulture); } catch { errors.Add("รูปแบบวันที่ไม่ถูกต้อง: " + kv); }
            return errors;
        }
    }
}
