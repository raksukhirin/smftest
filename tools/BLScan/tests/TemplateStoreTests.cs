using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using BLScan;

class T
{
    static int pass, fail;
    static void Check(string name, bool ok, string detail = "")
    {
        if (ok) pass++; else fail++;
        Console.WriteLine((ok ? "  PASS " : "  FAIL ") + name + (detail != "" ? "  — " + detail : ""));
    }
    static bool Throws(Action a, string contains = null)
    {
        try { a(); return false; } catch (Exception ex) { return contains == null || ex.Message.Contains(contains); }
    }

    static int Main(string[] args)
    {
        Console.OutputEncoding = new System.Text.UTF8Encoding(false);
        string root = args[0], seed = args[1];
        string shared = Path.Combine(root, "shared"), cache = Path.Combine(root, "cache"), def = Path.Combine(root, "default_none");
        Directory.CreateDirectory(shared);
        int N = Directory.GetFiles(seed, "*.json").Length;          // จำนวน Template ตั้งต้น (ไม่ฝังตัวเลข)
        foreach (var f in Directory.GetFiles(seed, "*.json")) File.Copy(f, Path.Combine(shared, Path.GetFileName(f)), true);

        Console.WriteLine("== 1) โหลดจากโฟลเดอร์กลาง + ทำสำเนาสำรอง");
        var info = TemplateStore.Load(shared, def, cache);
        Check("แหล่ง = shared", info.Source == "shared");
        Check("พบ Template ครบ + generic", info.Templates.Count == N + 1, info.Templates.Count + "");
        Check("มีสำเนาสำรองครบทุกไฟล์", Directory.GetFiles(cache, "*.json").Length == N);

        Console.WriteLine("== 2) รหัสผ่าน admin");
        Check("ยังไม่มี admin.json", !AdminAuth.Exists(shared));
        Check("รหัสสั้นเกิน 8 ตัว ถูกปฏิเสธ", Throws(() => AdminAuth.SetPassword(shared, "short")));
        AdminAuth.SetPassword(shared, "Passw0rd!x");
        Check("สร้าง admin.json แล้ว", AdminAuth.Exists(shared));
        string adminText = File.ReadAllText(AdminAuth.FileFor(shared));
        Check("ไฟล์ไม่มีรหัสผ่านตัวจริง (เก็บ hash)", !adminText.Contains("Passw0rd") && adminText.Contains("\"hash\""));
        int ls;
        Check("รหัสผิด → WrongPassword", AdminAuth.Verify(shared, "wrong-1", out ls) == AdminResult.WrongPassword);
        Check("ยังไม่ล็อกอิน", !AdminAuth.LoggedIn);
        Check("รหัสถูก → Ok", AdminAuth.Verify(shared, "Passw0rd!x", out ls) == AdminResult.Ok);
        Check("ล็อกอินแล้ว", AdminAuth.LoggedIn);
        AdminAuth.Logout();
        Check("Logout แล้วหมดสิทธิ์", !AdminAuth.LoggedIn);
        var again = TemplateStore.Load(shared, def, cache);
        Check("admin.json ไม่ถูกนับเป็น Template", again.Templates.Count == N + 1 && again.Errors.Count == 0, string.Join("; ", again.Errors));
        Check("admin.json ไม่ถูกคัดลอกไปสำเนาสำรอง", !File.Exists(Path.Combine(cache, AdminAuth.FileName)));

        Console.WriteLine("== 3) โฟลเดอร์กลางเปิดไม่ได้ → ใช้สำเนาสำรอง");
        string off = shared + "_off";
        Directory.Move(shared, off);
        var offline = TemplateStore.Load(shared, def, cache);
        Check("แหล่ง = cache", offline.Source == "cache");
        Check("ยังมี Template ครบจากสำเนา", offline.Templates.Count == N + 1, offline.Templates.Count + "");
        Check("มีข้อความแจ้งสาเหตุ", offline.Errors.Count > 0 && offline.Errors[0].Contains("สำเนาสำรอง"));
        Directory.Move(off, shared);

        Console.WriteLine("== 4) ลบไฟล์ในโฟลเดอร์กลาง → สำเนาสำรองตามไปด้วย");
        File.Delete(Path.Combine(shared, "vision-line.json"));
        var del = TemplateStore.Load(shared, def, cache);
        Check("เหลือ Template น้อยลง 1", del.Templates.Count == N);
        Check("สำเนาสำรองเหลือน้อยลง 1 ไฟล์", Directory.GetFiles(cache, "*.json").Length == N - 1);
        File.Copy(Path.Combine(seed, "vision-line.json"), Path.Combine(shared, "vision-line.json"));

        Console.WriteLine("== 5) นำเข้า Template");
        string impDir = Path.Combine(root, "imp"); Directory.CreateDirectory(impDir);
        string good = Path.Combine(impDir, "shine.json");
        File.WriteAllText(good, "{ \"id\": \"shine\", \"name\": \"Shine Logistics\", \"version\": 1, \"identify\": { \"keywords\": [\"SHINE LOGISTICS\"], \"minScore\": 1 } }");
        Template t; bool need; string msg;
        msg = TemplateStore.Import(shared, good, false, out t, out need);
        Check("นำเข้า id ใหม่สำเร็จ", !need && File.Exists(Path.Combine(shared, "shine.json")), msg);
        msg = TemplateStore.Import(shared, good, false, out t, out need);
        Check("id ซ้ำ → ขอยืนยันก่อน", need, msg);
        msg = TemplateStore.Import(shared, good, true, out t, out need);
        Check("ยืนยันแล้วทับได้ และสำรองไฟล์เดิมไว้ _trash", !need && Directory.Exists(Path.Combine(shared, "_trash")) && Directory.GetFiles(Path.Combine(shared, "_trash"), "shine_*.json").Length == 1);
        string bad = Path.Combine(impDir, "bad.json"); File.WriteAllText(bad, "{ not json");
        Check("JSON เสียถูกปฏิเสธ ไม่เขียนอะไร", Throws(() => { Template x; bool n; TemplateStore.Import(shared, bad, true, out x, out n); }) && !File.Exists(Path.Combine(shared, "bad.json")));
        string gen = Path.Combine(impDir, "gen.json"); File.WriteAllText(gen, "{ \"id\": \"generic\", \"name\": \"x\" }");
        Check("id generic ถูกปฏิเสธ", Throws(() => { Template x; bool n; TemplateStore.Import(shared, gen, true, out x, out n); }, "generic"));
        string noid = Path.Combine(impDir, "noid.json"); File.WriteAllText(noid, "{ \"name\": \"x\" }");
        Check("ไม่มี id ถูกปฏิเสธ", Throws(() => { Template x; bool n; TemplateStore.Import(shared, noid, true, out x, out n); }, "id"));

        Console.WriteLine("== 6) ลบ Template (ย้ายไป _trash)");
        TemplateStore.Trash(shared, "shine");
        Check("shine.json หายจากโฟลเดอร์หลัก", !File.Exists(Path.Combine(shared, "shine.json")));
        Check("อยู่ใน _trash (กู้คืนได้)", Directory.GetFiles(Path.Combine(shared, "_trash"), "shine_*.json").Length >= 2);
        Check("ลบ id ที่ไม่มี → error", Throws(() => TemplateStore.Trash(shared, "nope")));

        Console.WriteLine("== 7) admin สองคนแก้พร้อมกัน (ตรวจเวอร์ชัน)");
        var cur = TemplateStore.Find(TemplateStore.LoadAll(shared, new List<string>()), "df-sailing");
        int v0 = cur.Version;
        var a = TemplateStore.Find(TemplateStore.LoadAll(shared, new List<string>()), "df-sailing");
        var b = TemplateStore.Find(TemplateStore.LoadAll(shared, new List<string>()), "df-sailing");
        a.Note = "แก้โดย A"; TemplateStore.Save(shared, a, v0);
        Check("A บันทึกสำเร็จ เวอร์ชันเพิ่ม 1", a.Version == v0 + 1);
        b.Note = "แก้โดย B";
        Check("B บันทึกทับไม่ได้ (มีคนแก้ไปแล้ว)", Throws(() => TemplateStore.Save(shared, b, v0), "ถูกแก้ไขโดยคนอื่น"));
        var final = TemplateStore.Find(TemplateStore.LoadAll(shared, new List<string>()), "df-sailing");
        Check("ในไฟล์ยังเป็นของ A", final.Note == "แก้โดย A" && final.Version == v0 + 1);

        Console.WriteLine("== 8) ล็อกหลังใส่ผิดหลายครั้ง");
        AdminAuth.Verify(shared, "x1", out ls); AdminAuth.Verify(shared, "x2", out ls);
        var third = AdminAuth.Verify(shared, "x3", out ls);
        Check("ผิดครั้งที่ 3 ถูกล็อก 30 วินาที", third == AdminResult.WrongPassword && ls == 30, "ls=" + ls);
        Check("ระหว่างล็อก แม้รหัสถูกก็เข้าไม่ได้", AdminAuth.Verify(shared, "Passw0rd!x", out ls) == AdminResult.Locked && !AdminAuth.LoggedIn);

        Console.WriteLine();
        Console.WriteLine("สรุป: ผ่าน " + pass + " · ไม่ผ่าน " + fail);
        return fail == 0 ? 0 : 1;
    }
}
