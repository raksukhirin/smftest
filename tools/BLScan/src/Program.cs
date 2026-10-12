// BLScan — Scan House B/L (PDF/รูป) เป็นข้อความด้วย Windows OCR แล้ว UPDATE record ที่สร้างรอไว้ใน SMF DB (SFHBL + SFMARK)
//
//   BLScan.exe                                   เปิดหน้าจอ
//   BLScan.exe <ไฟล์> [/docno X]                  เปิดหน้าจอพร้อมไฟล์ (และ DOCNO) แล้ว scan ทันที
//   BLScan.exe /scan <ไฟล์> /out <โฟลเดอร์> /docno X [/dryrun | /update]
//        โหมดไม่มีหน้าจอ: เขียน preview.html + fields.txt + changes.txt ลงโฟลเดอร์ แล้วจบ
//        /dryrun = UPDATE จริงแล้ว ROLLBACK   /update = UPDATE จริง (ไม่เขียน record ที่ตั้งเป็น ReferenceDocNo)
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace BLScan
{
    static class Program
    {
        [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

        [STAThread]
        static int Main(string[] args)
        {
            string exeDir = Path.GetDirectoryName(Application.ExecutablePath);
            string iniPath = Arg(args, "/ini") ?? Path.Combine(exeDir, "BLScan.ini");
            var ini = new Ini(iniPath);

            // BLScan.exe /encryptini — เข้ารหัสรหัสผ่าน/ConnectionString ที่ยังเป็นข้อความธรรมดาใน ini (ไม่มีหน้าจอ; exit 0 = สำเร็จ)
            if (Flag(args, "/encryptini"))
            {
                try
                {
                    foreach (var k in new[] { "Password", "ConnectionString" })
                        if (ini.NeedsEncrypt("Database", k)) ini.Set("Database", k, ini.Get("Database", k), true);
                    return 0;
                }
                catch { return 1; }
            }

            // BLScan.exe /testgolden <tests.json> [/out <dir>] — รันชุดเฉลย (golden) ของทุก Template เทียบค่าที่อ่านได้กับค่าที่ถูกต้อง
            if (Arg(args, "/testgolden") != null)
            {
                int grc = RunGolden(args, ini);
                WinRtOcr.ExitSafely(grc);
                return grc;
            }

            if (args.Any(a => a.Equals("/scan", StringComparison.OrdinalIgnoreCase)))
            {
                int rc = RunCli(args, ini);
                WinRtOcr.ExitSafely(rc);
                return rc;
            }

            try { SetProcessDPIAware(); } catch { }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            var form = new MainForm(ini);
            string file = args.FirstOrDefault(a => !a.StartsWith("/") && File.Exists(a));
            if (file != null)
            {
                form.SetSourceFile(Path.GetFullPath(file));
                string doc = Arg(args, "/docno");
                if (doc != null) form.SetDocNo(doc);
                form.Shown += (s, e) => form.ScanAsync();
            }
            Application.Run(form);
            WinRtOcr.ExitSafely(0);
            return 0;
        }

        static string Arg(string[] args, string name)
        {
            int i = Array.FindIndex(args, a => a.Equals(name, StringComparison.OrdinalIgnoreCase));
            return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
        }

        static bool Flag(string[] args, string name) { return args.Any(a => a.Equals(name, StringComparison.OrdinalIgnoreCase)); }

        /// <summary>โฟลเดอร์ Template: /templates &lt;dir&gt; &gt; [Templates] Path ใน ini &gt; templates ข้าง exe</summary>
        static List<Template> LoadTemplatesCli(Ini ini, string[] args, List<string> errors)
        {
            string explicitDir = Arg(args, "/templates");
            if (explicitDir != null) return TemplateStore.LoadAll(explicitDir, errors);
            var info = TemplateStore.Load(TemplateDir(ini, null), DefaultTemplateDir(), CacheTemplateDir());
            errors.AddRange(info.Errors);
            return info.Templates;
        }

        public static string DefaultTemplateDir()
        {
            return Path.Combine(Path.GetDirectoryName(Application.ExecutablePath), "templates");
        }

        public static string CacheTemplateDir() { return Path.Combine(DefaultTemplateDir(), "_cache"); }

        public static string TemplateDir(Ini ini, string[] args)
        {
            string p = (args != null ? Arg(args, "/templates") : null) ?? ini.Get("Templates", "Path");
            if (string.IsNullOrWhiteSpace(p)) p = DefaultTemplateDir();
            return p;
        }

        /// <summary>ชุดเฉลย: ทุกไฟล์ตัวอย่างต้องอ่านค่าได้ตรงกับที่ระบุ — ผลลง golden.txt, exit 0 = ผ่านทั้งหมด</summary>
        static int RunGolden(string[] args, Ini ini)
        {
            string testFile = Path.GetFullPath(Arg(args, "/testgolden"));
            string outDir = Arg(args, "/out") ?? Path.GetDirectoryName(testFile);
            Directory.CreateDirectory(outDir);
            var sb = new StringBuilder();
            int pass = 0, fail = 0;
            try
            {
                var root = new System.Web.Script.Serialization.JavaScriptSerializer().DeserializeObject(File.ReadAllText(testFile, Encoding.UTF8)) as Dictionary<string, object>;
                string baseDir = Path.GetFullPath(Path.Combine(Path.GetDirectoryName(testFile), root.ContainsKey("root") ? Convert.ToString(root["root"]) : "."));
                var errs = new List<string>();
                var list = LoadTemplatesCli(ini, args, errs);
                foreach (var e in errs) sb.AppendLine("Template: " + e);
                var cache = new Dictionary<string, OcrPage>();
                int width = ini.GetInt("OCR", "RenderWidth", 2000);
                string lang = ini.Get("OCR", "Language", "en-US");
                foreach (var item in (System.Collections.IEnumerable)root["tests"])
                {
                    var t = (Dictionary<string, object>)item;
                    string name = Convert.ToString(t["name"]), tid = Convert.ToString(t["template"]);
                    string file = Path.GetFullPath(Path.Combine(baseDir, Convert.ToString(t["file"])));
                    int pg = t.ContainsKey("page") ? Convert.ToInt32(t["page"]) : 1;
                    var tpl = TemplateStore.Find(list, tid);
                    if (tpl == null) { sb.AppendLine("== " + name + ": ไม่พบ Template " + tid); fail++; continue; }
                    string key = file + "#" + pg;
                    OcrPage ocr;
                    if (!cache.TryGetValue(key, out ocr)) { ocr = Task.Run(() => WinRtOcr.ScanFused(file, pg - 1, width, lang, ini.GetInt("OCR", "SecondScale", 3000))).Result; cache[key] = ocr; }
                    var vals = Fields.FromParse(BLParser.Parse(ocr, tpl));
                    sb.AppendLine("== " + name + "  [template " + tpl.Id + (tpl.Matches(ocr.RawText) ? ", ผู้ออกตรง" : ", ⚠ ผู้ออกไม่ตรง") + "]");
                    foreach (var kv in (Dictionary<string, object>)t["expect"])
                    {
                        string got = Golden.Flat(Fields.Val(vals, kv.Key)), exp = Convert.ToString(kv.Value);
                        bool ok = Golden.Same(kv.Key, exp, got);
                        if (ok) pass++; else fail++;
                        sb.AppendLine((ok ? "  PASS " : "  FAIL ") + kv.Key.PadRight(15) + (ok ? "= " + got : "คาดว่า [" + exp + "]  ได้ [" + got + "]"));
                    }
                }
            }
            catch (Exception ex) { sb.AppendLine("ERROR " + ex.GetBaseException().Message); fail++; }
            sb.AppendLine();
            sb.AppendLine("สรุป: ผ่าน " + pass + " · ไม่ผ่าน " + fail);
            File.WriteAllText(Path.Combine(outDir, "golden.txt"), sb.ToString(), new UTF8Encoding(true));
            return fail == 0 ? 0 : 1;
        }

        static string OneLine(string s) { return (s ?? "").TrimEnd('\r', '\n').Replace("\r\n", " | ").Replace("\n", " | "); }

        static int RunCli(string[] args, Ini ini)
        {
            string file = Arg(args, "/scan");
            string outDir = Arg(args, "/out") ?? ".";
            string doc = (Arg(args, "/docno") ?? "").Trim().ToUpperInvariant();
            bool dry = Flag(args, "/dryrun"), real = Flag(args, "/update");
            Directory.CreateDirectory(outDir);
            var log = new StringBuilder();
            int rc = 0;
            try
            {
                // Template: /template <id> (ค่าเริ่มต้น generic) จากโฟลเดอร์ [Templates] Path ใน ini หรือ /templates <dir>
                var tplErrors = new List<string>();
                var tplList = LoadTemplatesCli(ini, args, tplErrors);
                string tplId = Arg(args, "/template") ?? "generic";
                var tpl = TemplateStore.Find(tplList, tplId);
                if (tpl == null) throw new InvalidOperationException("ไม่พบ Template \"" + tplId + "\" (มี: " + string.Join(", ", tplList.Select(t => t.Id)) + ")");
                foreach (var e in tplErrors) log.AppendLine("Template: " + e);

                // OCR บน MTA thread
                var r = Task.Run(() =>
                {
                    var page = WinRtOcr.ScanFused(file, Math.Max(1, ini.GetInt("OCR", "Page", 1)) - 1, ini.GetInt("OCR", "RenderWidth", 2000), ini.Get("OCR", "Language", "en-US"), ini.GetInt("OCR", "SecondScale", 3000));
                    return Tuple.Create(page, BLParser.Parse(page, tpl));
                }).Result;
                var v = Fields.FromParse(r.Item2);
                v["DOCNO"] = doc;
                var notes = new List<string>(r.Item2.Notes);
                string status = doc == "" ? "PREVIEW — ยังไม่ระบุ DOCNO" : "PREVIEW — ยังไม่ได้บันทึก";
                if (!tpl.Matches(r.Item1.RawText))
                {
                    string better = tplList.Where(t => !t.IsGeneric).OrderByDescending(t => t.Score(r.Item1.RawText)).Select(t => new { t, s = t.Score(r.Item1.RawText) }).Where(x => x.s > 0).Select(x => x.t.Name).FirstOrDefault();
                    notes.Insert(0, "⚠ ไม่พบคำระบุผู้ออกของ Template \"" + tpl.Name + "\" ในไฟล์นี้" + (better != null ? " — ดูเหมือน \"" + better + "\"" : ""));
                    log.AppendLine("Template ไม่ตรงกับไฟล์ — ไม่ update");
                    dry = false; real = false; rc = 4;
                }
                foreach (var wn in Fields.Warnings(v)) { notes.Add("⚠ " + wn); log.AppendLine("เตือน: " + wn); }

                var db = new Db(ini);
                var chg = new StringBuilder();
                if (doc != "" && db.Configured)
                {
                    var existing = db.LoadExisting(doc);
                    if (existing == null)
                    {
                        status = "ไม่พบ HB/L Ref ในระบบ";
                        log.AppendLine("ไม่พบ HB/L Ref " + doc + " ในระบบ — ต้องสร้าง record รอไว้ก่อน");
                        rc = 3;
                    }
                    else
                    {
                        foreach (var k in new[] { "JOBNO", "MASTERNO", "JOBCLASS", "JOBTYPE", "LOADTYPE", "DOCDATE" }) v[k] = Fields.Val(existing.V, k);
                        foreach (var n in db.Enrich(v, existing.JobNo, existing.V)) notes.Add("[DB] " + n);

                        chg.AppendLine("DOCNO " + doc + "  JOBNO " + existing.JobNo + "  JOBCLASS " + existing.JobClass);
                        chg.AppendLine(existing.MarkRows == 0 ? "รายการสินค้า: ยังไม่มี → สร้างใหม่" : "รายการสินค้า: " + existing.MarkRows + " รายการ → แก้ไขรายการแรก");
                        foreach (var c in Fields.Plan(v, existing.V))
                            chg.AppendLine(string.Format("{0,-6} {1,-22} db=[{2}]  scan=[{3}]", c.Skip ? "SKIP" : c.Differs ? "CHANGE" : "SAME", c.F.DbName, OneLine(c.Old), OneLine(c.New)));

                        string refDoc = ini.Get("App", "ReferenceDocNo").Trim().ToUpperInvariant();
                        if (dry || real)
                        {
                            var errs = Fields.Validate(v);
                            if (errs.Count > 0) { log.AppendLine("Validate ไม่ผ่าน:"); foreach (var e in errs) log.AppendLine("  " + e); rc = 2; }
                            else if (real && refDoc == doc) { log.AppendLine("DOCNO " + doc + " เป็น record อ้างอิง (ReferenceDocNo) — ไม่เขียน"); rc = 2; }
                            else
                            {
                                var res = db.Update(v, doc, ini.Get("App", "UserID", "BLSCAN"), !real);
                                log.AppendLine(res.Message);
                                foreach (var c in res.HblChanges) log.AppendLine("  " + c);
                                log.AppendLine("  " + res.MarkAction);
                                foreach (var c in res.MarkChanges) log.AppendLine("  " + c);
                                if (real) status = "บันทึกแล้ว " + DateTime.Now.ToString("HH:mm");
                            }
                        }
                    }
                }
                File.WriteAllText(Path.Combine(outDir, "changes.txt"), chg.ToString(), new UTF8Encoding(true));
                File.WriteAllText(Path.Combine(outDir, "preview.html"), HtmlPreview.Build(v, Path.GetFileName(file), status, notes), new UTF8Encoding(true));
                var sb = new StringBuilder();
                foreach (var f in Fields.All) sb.AppendLine(f.DbName.PadRight(22) + " = " + Fields.Val(v, f.Key).Replace("\r\n", "|"));
                sb.AppendLine();
                foreach (var n in notes) sb.AppendLine("NOTE " + n);
                File.WriteAllText(Path.Combine(outDir, "fields.txt"), sb.ToString(), new UTF8Encoding(true));
                File.WriteAllText(Path.Combine(outDir, "ocr.txt"), r.Item1.RawText, new UTF8Encoding(true));
            }
            catch (Exception ex)
            {
                var dbForLog = new Db(ini);       // กรอง server/port/db/user ออกจาก log
                log.AppendLine("ERROR " + dbForLog.Sanitize(ex.GetBaseException().Message));
                log.AppendLine(dbForLog.Sanitize(ex.ToString()));
                rc = 1;
            }
            File.WriteAllText(Path.Combine(outDir, "log.txt"), log.ToString(), new UTF8Encoding(true));
            return rc;
        }
    }
}
