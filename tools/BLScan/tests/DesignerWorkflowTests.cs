using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows.Forms;
using BLScan;

class DesignerWorkflowTests
{
    static int pass, fail;
    static void Check(string name, bool ok) { Check(name, ok, ""); }
    static void Check(string name, bool ok, string detail)
    {
        if (ok) pass++; else fail++;
        Console.WriteLine((ok ? "  PASS " : "  FAIL ") + name + (detail != "" ? "  — " + detail : ""));
    }

    static object Call(object o, string name, params object[] args)
    {
        return o.GetType().GetMethod(name, BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public).Invoke(o, args);
    }
    static T Get<T>(object o, string field)
    {
        return (T)o.GetType().GetField(field, BindingFlags.Instance | BindingFlags.NonPublic).GetValue(o);
    }

    [STAThread]
    static int Main(string[] a)
    {
        Console.OutputEncoding = new System.Text.UTF8Encoding(false);
        string work = a[0], seed = a[1], png = a[2];
        string folder = Path.Combine(work, "tpl");
        Directory.CreateDirectory(folder);
        File.Copy(Path.Combine(seed, "df-sailing.json"), Path.Combine(folder, "df-sailing.json"), true);
        File.WriteAllText(Path.Combine(work, "t6.ini"), "[OCR]\nRenderWidth=2000\nSecondScale=3000\n");
        Application.EnableVisualStyles();
        var ini = new Ini(Path.Combine(work, "t6.ini"));

        using (var d = new DesignerForm(ini, folder))
        {
            d.Show();
            Console.WriteLine("== 1) เปิด Template + ใบตัวอย่าง");
            var working = Get<Template>(d, "working");
            Check("เปิด Template df-sailing ตั้งต้นให้อัตโนมัติ", working != null && working.Id == "df-sailing");
            OcrPage o = null;
            Task.Run(() => { o = d.RunOcr(png, 1); }).Wait();
            var expect = new Dictionary<string, string> {
                { "BLNO", "DFSL2604347" }, { "VESSEL", "WAN HAI 177" }, { "V_VOY", "S057" }, { "GW", "128.00" }, { "CBM", "1.516" },
                { "NOTIFYNAME", "SAME AS CONSIGNEE" }, { "CYTERM", "CFS/CFS" }, { "ETD", "2026-05-01" }, { "ISSUPLACE", "SHENZHEN, CHINA" }
            };
            d.ApplyOcr(o, png, 1, expect);
            var values = Get<Dictionary<string, string>>(d, "values");
            Check("อ่านใบด้วย Template ที่เปิดอยู่ (BLNO)", Fields.Val(values, "BLNO") == "DFSL2604347");
            Check("ซ่อมคำที่ถูกตัดแล้ว (ISSUPLACE ครบ)", Golden.Same("ISSUPLACE", "SHENZHEN, CHINA", Fields.Val(values, "ISSUPLACE")));

            Console.WriteLine("== 2) บันทึกใบนี้เป็นตัวอย่าง + ทดสอบทุกตัวอย่าง");
            Call(d, "SaveSample");
            string sdir = Path.Combine(folder, "_samples", "df-sailing");
            Check("สร้างไฟล์ตัวอย่าง s01.png/.json", File.Exists(Path.Combine(sdir, "s01.png")) && File.Exists(Path.Combine(sdir, "s01.json")));
            string json = File.ReadAllText(Path.Combine(sdir, "s01.json"));
            Check("ไฟล์ตัวอย่างเก็บเฉลย 9 ค่า", json.Contains("DFSL2604347") && json.Contains("\"expect\""));
            int p1, f1;
            string rep = d.RunAllSamples(out p1, out f1);
            Check("ทดสอบทุกตัวอย่าง: ผ่านครบ 9 ค่า", p1 == 9 && f1 == 0, "pass=" + p1 + " fail=" + f1);
            Check("โฟลเดอร์ _samples ไม่ถูกนับเป็น Template", TemplateStore.LoadAll(folder, new List<string>()).Count(t => !t.IsGeneric) == 1);
            Check("โฟลเดอร์ _samples ไม่ถูกคัดลอกไปสำเนาสำรอง", TemplateStore.Load(folder, Path.Combine(work, "nodef"), Path.Combine(work, "cache")).Templates.Count == 2 && Directory.GetFiles(Path.Combine(work, "cache")).All(f => f.EndsWith(".json")));

            Console.WriteLine("== 3) แก้ Template แล้วทดสอบซ้ำ (ยังไม่บันทึก)");
            var w2 = Get<Template>(d, "working");
            TemplateEditor.AddLabel(w2, "BLNO", "Totally Different Label");
            TemplateEditor.SetLines(w2, "dateFormats", "dd.MM.yyyy");       // รูปแบบที่ไม่ตรงกับใบ — generic ยังต้องอ่านได้
            int p2, f2;
            d.RunAllSamples(out p2, out f2);
            Check("เพิ่มคำเรียกที่ไม่ได้ใช้ ไม่ทำให้ผลแย่ลง", p2 == 9 && f2 == 0, "pass=" + p2 + " fail=" + f2);
            TemplateEditor.SetTerms(w2, "");     // ลบคำแปลง — generic ยังต้องอ่าน CFS-CFS ได้
            TemplateEditor.RemoveZone(w2, "NOTIFY");
            int p3, f3;
            d.RunAllSamples(out p3, out f3);
            Check("ตัดโซน/คำแปลงออก generic ยังช่วยได้ (ผลไม่ตกต่ำกว่า 8/9)", p3 >= 8, "pass=" + p3 + " fail=" + f3);

            Console.WriteLine("== 4) บันทึก Template ผ่านหน้าต่าง (เวอร์ชัน + สำรอง)");
            var cur = Get<Template>(d, "working");
            int vBefore = cur.Version;
            cur.Note = "แก้ในการทดสอบ T6";
            Call(d, "SaveTemplate");
            var saved = TemplateStore.Find(TemplateStore.LoadAll(folder, new List<string>()), "df-sailing");
            Check("บันทึกแล้วเวอร์ชันเพิ่ม 1", saved.Version == vBefore + 1, vBefore + " → " + saved.Version);
            Check("สำรองเวอร์ชันเดิมใน _trash", Directory.Exists(Path.Combine(folder, "_trash")) && Directory.GetFiles(Path.Combine(folder, "_trash"), "df-sailing_*.json").Length >= 1);
            d.Close();
        }
        Console.WriteLine();
        Console.WriteLine("สรุป: ผ่าน " + pass + " · ไม่ผ่าน " + fail);
        WinRtOcr.ExitSafely(fail == 0 ? 0 : 1);
        return fail == 0 ? 0 : 1;
    }
}
