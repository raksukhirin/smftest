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
                // OCR บน MTA thread
                var r = Task.Run(() =>
                {
                    var page = WinRtOcr.Scan(file, Math.Max(1, ini.GetInt("OCR", "Page", 1)) - 1, ini.GetInt("OCR", "RenderWidth", 2000), ini.Get("OCR", "Language", "en-US"));
                    return Tuple.Create(page, BLParser.Parse(page));
                }).Result;
                var v = Fields.FromParse(r.Item2);
                v["DOCNO"] = doc;
                var notes = new List<string>(r.Item2.Notes);
                string status = doc == "" ? "PREVIEW — ยังไม่ระบุ DOCNO" : "PREVIEW — ยังไม่ได้บันทึก";

                var db = new Db(ini);
                var chg = new StringBuilder();
                if (doc != "" && db.Configured)
                {
                    var existing = db.LoadExisting(doc);
                    if (existing == null)
                    {
                        status = "ไม่พบ DOCNO ใน SFHBL";
                        log.AppendLine("ไม่พบ DOCNO " + doc + " ใน SFHBL — ต้องสร้าง record รอไว้ก่อน");
                        rc = 3;
                    }
                    else
                    {
                        foreach (var k in new[] { "JOBNO", "MASTERNO", "JOBCLASS", "JOBTYPE", "LOADTYPE", "DOCDATE" }) v[k] = Fields.Val(existing.V, k);
                        foreach (var n in db.Enrich(v, existing.JobNo, existing.V)) notes.Add("[DB] " + n);

                        chg.AppendLine("DOCNO " + doc + "  JOBNO " + existing.JobNo + "  JOBCLASS " + existing.JobClass);
                        chg.AppendLine(existing.MarkRows == 0 ? "SFMARK: ยังไม่มี → INSERT" : "SFMARK: " + existing.MarkRows + " แถว → UPDATE DETID " + existing.MarkDetId);
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
                                foreach (var c in res.HblChanges) log.AppendLine("  SFHBL " + c);
                                log.AppendLine("  " + res.MarkAction);
                                foreach (var c in res.MarkChanges) log.AppendLine("  SFMARK " + c);
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
                log.AppendLine("ERROR " + ex.GetBaseException().Message);
                log.AppendLine(ex.ToString());
                rc = 1;
            }
            File.WriteAllText(Path.Combine(outDir, "log.txt"), log.ToString(), new UTF8Encoding(true));
            return rc;
        }
    }
}
