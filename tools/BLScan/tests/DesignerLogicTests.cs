using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using BLScan;

class DesignerLogicTests
{
    static int pass, fail;
    static void Check(string name, bool ok) { Check(name, ok, ""); }
    static void Check(string name, bool ok, string detail)
    {
        if (ok) pass++; else fail++;
        Console.WriteLine((ok ? "  PASS " : "  FAIL ") + name + (detail != "" ? "  — " + detail : ""));
    }

    static Dictionary<string, string> DfExpect()
    {
        return new Dictionary<string, string> {
            { "BLNO", "DFSL2604347" }, { "NOTIFYNAME", "SAME AS CONSIGNEE" }, { "VESSEL", "WAN HAI 177" }, { "V_VOY", "S057" },
            { "LOADPORTNAME", "SHENZHEN, CHINA" }, { "PKGQTY", "1" }, { "PKGUNIT", "PALLET" }, { "GW", "128.00" }, { "CBM", "1.516" },
            { "CHGTERM", "PP" }, { "CYTERM", "CFS/CFS" }, { "ETD", "2026-05-01" }, { "ISSUPLACE", "SHENZHEN, CHINA" }
        };
    }

    static int Main(string[] a)
    {
        Console.OutputEncoding = new System.Text.UTF8Encoding(false);
        string png = a[0], work = a[1];
        Directory.CreateDirectory(work);

        Console.WriteLine("== 1) ตรรกะแก้ Template");
        var t = TemplateEditor.NewEmpty("Test-Id", "ทดสอบ");
        Check("NewEmpty: id เป็นตัวพิมพ์เล็ก เวอร์ชัน 0", t.Id == "test-id" && t.Version == 0, t.Id);
        Check("ValidateId: id ดี", TemplateEditor.ValidateId("df-sailing") == "");
        Check("ValidateId: generic ถูกปฏิเสธ", TemplateEditor.ValidateId("generic") != "");
        Check("ValidateId: อักขระแปลกถูกปฏิเสธ", TemplateEditor.ValidateId("a b") != "" && TemplateEditor.ValidateId("A/B") != "" && TemplateEditor.ValidateId("x") != "");
        Check("AddLabel: เพิ่มใหม่ได้", TemplateEditor.AddLabel(t, "VOYAGE", "  Voy.   No.  "));
        Check("AddLabel: ซ้ำ (ต่างช่องว่าง/เครื่องหมาย) ไม่เพิ่ม", !TemplateEditor.AddLabel(t, "VOYAGE", "VOY NO"));
        Check("AddLabel: คำใหม่อยู่หน้าสุด", TemplateEditor.AddLabel(t, "VOYAGE", "Voyage Number") && t.Labels["VOYAGE"][0] == "Voyage Number");
        TemplateEditor.SetLabels(t, "VOYAGE", new[] { "", "  " });
        Check("SetLabels: ว่างหมด = ลบคีย์", !t.Labels.ContainsKey("VOYAGE"));
        Check("AddIdentify: สั้นเกินไปถูกปฏิเสธ", !TemplateEditor.AddIdentify(t, "ab"));
        Check("AddIdentify: เพิ่มได้ ซ้ำไม่ได้", TemplateEditor.AddIdentify(t, "DEFOND SAILING") && !TemplateEditor.AddIdentify(t, "defond  sailing"));
        var badCopy = TemplateEditor.SetCopy(t, "finalportname = DELPORTNAME\r\nไม่มีเครื่องหมาย\r\nNOSUCH = DELPORTNAME\r\nGW = GW");
        Check("SetCopy: รับคู่ที่ถูกต้อง (ตัวพิมพ์เล็กก็ได้) ปฏิเสธ 3 บรรทัดที่ใช้ไม่ได้", badCopy.Count == 3 && t.Copy.Count == 1 && t.Copy["FINALPORTNAME"] == "DELPORTNAME", string.Join("|", badCopy));
        var rtCopy = Template.FromJson(t.ToJson());
        Check("Copy: เขียน/อ่าน JSON แล้วคงเดิม", rtCopy.Copy.Count == 1 && rtCopy.Copy["FINALPORTNAME"] == "DELPORTNAME" && TemplateEditor.CopyText(rtCopy) == "FINALPORTNAME = DELPORTNAME");
        TemplateEditor.SetCopy(t, "");
        Check("SetCopy: ว่าง = ล้างกติกา และไม่เขียน copy ลง JSON", t.Copy.Count == 0 && !t.ToJson().Contains("\"copy\""));
        var bad = TemplateEditor.SetTerms(t, "CFS-CFS => CFS/CFS\r\nไม่มีลูกศร\r\n => x");
        Check("SetTerms: อ่านได้ 1 คู่ รายงานบรรทัดเสีย 2", t.Terms.Count == 1 && bad.Count == 2, bad.Count + "");
        TemplateEditor.SetZone(t, "NOTIFY", 1.4, -0.2, 0.123456, 0.07);
        var z = t.Zones["NOTIFY"];
        Check("SetZone: ค่าถูกจำกัดช่วง 0..1 และปัดเศษ", z.X == 1 && z.Y == 0 && z.W == 0.123, z.X + "," + z.Y + "," + z.W);
        var clone = TemplateEditor.Clone(t);
        clone.Identify = new string[0];
        Check("Clone: แก้สำเนาไม่กระทบต้นฉบับ", t.Identify.Length == 1);
        List<string> warn;
        Check("Validate: id ถูก ไม่มี error", TemplateEditor.Validate(t, out warn).Count == 0);
        Check("Validate: ไม่มี identify = คำเตือน", TemplateEditor.Validate(clone, out warn).Count == 0 && warn.Count == 1);
        string rt = TemplateEditor.Clone(t).ToJson();
        Check("JSON: ไป-กลับได้ค่าเดิม", Template.FromJson(rt).ToJson() == rt);

        Console.WriteLine("== 2) บันทึก/โหลด + เวอร์ชัน");
        string folder = Path.Combine(work, "tpl");
        TemplateStore.Save(folder, t, 0);
        Check("Save ครั้งแรก = v1", t.Version == 1 && File.Exists(Path.Combine(folder, "test-id.json")));
        var again = TemplateStore.Find(TemplateStore.LoadAll(folder, new List<string>()), "test-id");
        Check("โหลดกลับมาได้ ค่าครบ", again != null && again.Version == 1 && again.Zones.ContainsKey("NOTIFY") && again.Terms.Count == 1);
        TemplateStore.Save(folder, t, 1);
        Check("Save ครั้งที่สอง = v2 และสำรองเวอร์ชันเดิมใน _trash", t.Version == 2 && Directory.GetFiles(Path.Combine(folder, "_trash"), "test-id_*.json").Length == 1);

        Console.WriteLine("== 3) จำลองงาน admin: สร้าง Template DF-Sailing จากศูนย์บนใบจริง");
        OcrPage page = null;
        Task.Run(() => { page = WinRtOcr.ScanFused(png, 0, 2000, "en-US", 3000); }).Wait();
        var empty = TemplateEditor.NewEmpty("df-built", "DF built by designer logic");
        var expect = DfExpect();
        Func<Template, int> failures = tpl =>
        {
            var vals = Fields.FromParse(BLParser.Parse(page, tpl));
            return Golden.Compare(vals, expect).Count(r => !r.Ok);
        };
        int baseline = failures(empty);
        Console.WriteLine("    ก่อนแก้ (Template ว่าง = generic): ไม่ผ่าน " + baseline + " จาก " + expect.Count + " ช่อง");
        Check("ข้อสังเกต: Template ว่าง (generic) อ่านใบ DF ได้ครบอยู่แล้ว", baseline == 0, baseline + "");

        // ขั้น 1: เลือกคำ "DEFOND SAILING" บนภาพ แล้วเพิ่มเป็นคำระบุผู้ออก
        var defond = page.Words.Where(w => w.Text.ToUpperInvariant() == "DEFOND").OrderBy(w => w.Y).First();
        var sailing = page.Words.Where(w => w.Text.ToUpperInvariant().StartsWith("SAILING") && Math.Abs(w.CY - defond.CY) < 0.01).OrderBy(w => w.X).First();
        string ident = TemplateEditor.TextOf(new[] { defond, sailing });
        Check("TextOf เรียงคำตามการอ่านและต่อกันถูก", ident.ToUpperInvariant() == "DEFOND SAILING", ident);
        TemplateEditor.AddIdentify(empty, ident);
        Check("ใบนี้ตรงกับ Template หลังเพิ่มคำระบุผู้ออก", empty.Matches(page.RawText));

        // ขั้น 2: ลากกรอบโซนรอบข้อความ "SAME AS CONSIGNEE" (ขอบบนของกรอบ = ที่ข้อความเริ่ม)
        var same = page.Words.Where(w => w.Text.ToUpperInvariant() == "SAME").OrderByDescending(w => w.Y).First();
        var consignee = page.Words.Where(w => w.Text.ToUpperInvariant().StartsWith("CONS") && Math.Abs(w.CY - same.CY) < 0.01).OrderByDescending(w => w.X).First();
        double left = same.X - 0.004, top = same.Y - 0.004;
        TemplateEditor.SetZone(empty, "NOTIFY", left, top, consignee.R - same.X + 0.008, same.H + 0.01);
        int afterZone = failures(empty);
        Console.WriteLine("    หลังเพิ่มคำระบุผู้ออก + โซน Notify: ไม่ผ่าน " + afterZone);
        Check("เพิ่มโซน Notify แล้วไม่ทำให้ผลแย่ลง", afterZone <= baseline, baseline + " → " + afterZone);

        // ขั้น 3: คำแปลง CY และรูปแบบวันที่
        TemplateEditor.SetTerms(empty, "CFS-CFS => CFS/CFS");
        TemplateEditor.SetLines(empty, "dateFormats", "yyyy/MM/dd");
        int final = failures(empty);
        Console.WriteLine("    หลังเพิ่มคำแปลงและรูปแบบวันที่: ไม่ผ่าน " + final);
        Check("ตัวที่สร้างด้วยตรรกะ Designer อ่านใบนี้ผ่านครบเฉลย", final == 0, final + " ช่องไม่ผ่าน");

        // เทียบกับ Template ที่เขียนมือ
        var hand = TemplateStore.Find(TemplateStore.LoadAll(a[2], new List<string>()), "df-sailing");
        var v1 = Fields.FromParse(BLParser.Parse(page, empty));
        var v2 = Fields.FromParse(BLParser.Parse(page, hand));
        int diffs = Fields.All.Count(f => Fields.Val(v1, f.Key) != Fields.Val(v2, f.Key));
        Check("ผลเหมือน Template ที่เขียนมือทุกช่อง", diffs == 0, diffs + " ช่องต่างกัน");


        Console.WriteLine("== 4) กรณีที่ generic อ่านไม่ได้จริง (แก้ข้อความ OCR ของใบจริงให้เหมือนฟอร์มที่ใช้คำเรียกอื่น)");
        Func<OcrPage> cloneAll = () =>
        {
            var c = new OcrPage { PixelWidth = page.PixelWidth, PixelHeight = page.PixelHeight, RawText = page.RawText };
            foreach (var w in page.Words)
                c.Words.Add(new OcrWord { Text = w.Text, X = w.X, Y = w.Y, W = w.W, H = w.H, LineNo = w.LineNo });
            return c;
        };

        // A) หัวช่อง "On Board Date" ถูกพิมพ์เป็น "Loaded Aboard" (คำเรียกที่ตัวอ่านไม่รู้จัก)
        var pa = cloneAll();
        var ob = pa.Words.Where(w => w.Text.ToLowerInvariant() == "on" && pa.Words.Any(x => x.LineNo == w.LineNo && x.Text.ToLowerInvariant() == "board")).OrderByDescending(w => w.Y).First();
        var lineWords = pa.Words.Where(w => w.LineNo == ob.LineNo && w.X >= ob.X - 0.001).OrderBy(w => w.X).Take(3).ToList();   // On Board Date
        string[] repl = { "Loaded", "Aboard", "" };
        for (int i = 0; i < lineWords.Count; i++) lineWords[i].Text = repl[i] == "" ? "." : repl[i];
        Func<OcrPage, Template, string> etd = (pg, tp) => Fields.Val(Fields.FromParse(BLParser.Parse(pg, tp)), "ETD");
        var tA = TemplateEditor.NewEmpty("df-a", "A");
        Check("A) ก่อนแก้: คำเรียกที่ไม่รู้จัก → อ่านวันที่ขึ้นเรือไม่ได้", etd(pa, tA) == "", "ETD=[" + etd(pa, tA) + "]");
        var sel = pa.Words.Where(w => w.Text == "Loaded" || w.Text == "Aboard").ToList();
        string phrase = TemplateEditor.TextOf(sel);
        Check("A) เลือกคำบนภาพได้ข้อความหัวช่อง", phrase == "Loaded Aboard", phrase);
        TemplateEditor.AddLabel(tA, "ONBOARD", phrase);
        TemplateEditor.SetLines(tA, "dateFormats", "yyyy/MM/dd");
        Check("A) หลังเพิ่มคำเรียกหัวช่อง: อ่าน ETD ได้ถูก", etd(pa, tA) == "2026-05-01", "ETD=[" + etd(pa, tA) + "]");

        // B) หัวช่อง "Final Destination" อ่านไม่ออกเลย (OCR ไม่มีคำ) → ใช้โซนที่ลากรอบรอบค่า
        var pb = cloneAll();
        var fin = pb.Words.Where(w => w.Text.ToLowerInvariant().StartsWith("destination")).OrderByDescending(w => w.Y).First();
        foreach (var w in pb.Words.Where(w => Math.Abs(w.CY - fin.CY) < 0.012 && w.X > 0.45).ToList()) w.Text = " ";
        Func<OcrPage, Template, string> fp = (pg, tp) => Fields.Val(Fields.FromParse(BLParser.Parse(pg, tp)), "FINALPORTNAME");
        var tB = TemplateEditor.NewEmpty("df-b", "B");
        Check("B) ก่อนแก้: หัวช่องอ่านไม่ออก → Final Destination ว่าง", fp(pb, tB) == "", "[" + fp(pb, tB) + "]");
        var val = pb.Words.Where(w => w.X > 0.7 && w.Y > fin.Y && w.Y < fin.Y + 0.05).OrderBy(w => w.X).ToList();   // คำของค่า "BANGKOK, THAILAND" ใต้หัวช่อง
        Check("B) พบคำของค่าใต้หัวช่อง", val.Count > 0, val.Count + " คำ");
        TemplateEditor.SetZone(tB, "FINALDEST", val.Min(w => w.X) - 0.005, val.Min(w => w.Y) - 0.004, val.Max(w => w.R) - val.Min(w => w.X) + 0.01, val.Max(w => w.B) - val.Min(w => w.Y) + 0.008);
        string got = fp(pb, tB).Replace(" ", "").ToUpperInvariant();
        Check("B) หลังลากโซนรอบค่า: อ่านค่าได้ถูก", got == "BANGKOK,THAILAND", "[" + fp(pb, tB) + "]");
        var vb = BLParser.Parse(pb, tB);
        Check("B) ตัวอ่านแจ้งว่าใช้โซนสำรอง (ติดธง Synthetic)", vb.Labels.Any(l => l.Key == "FINALDEST" && l.Synthetic));

        Console.WriteLine();
        Console.WriteLine("สรุป: ผ่าน " + pass + " · ไม่ผ่าน " + fail);
        WinRtOcr.ExitSafely(fail == 0 ? 0 : 1);
        return fail == 0 ? 0 : 1;
    }
}
