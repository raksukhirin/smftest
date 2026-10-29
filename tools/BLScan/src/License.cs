// ลิขสิทธิ์ของ SMF บนเครื่องนี้: Smart.ini (ShareFile=…) → โฟลเดอร์ → APP.LIC → ถอดด้วย CryptText.clsMain (DLL ตัวเดียวกับที่ SMF ใช้)
// ข้อความที่ถอดได้ 7 บรรทัด (CRLF): 0 ชื่อบริษัท, 1 License Key ID, 2 Serial, 3-5 จำนวนเครื่อง/วันหมดอายุ/จำนวนเรคคอร์ด, 6 รายการโมดูล
// สิทธิ์ใช้งาน EDI = serial อยู่ในรายการที่ซื้อ (EdiLicensed.cs เก็บเป็นค่าแฮช) — เพิ่มลูกค้าใหม่ = เพิ่มแฮชแล้ว build ใหม่
// หมายเหตุ: CryptText.dll เป็น 32-bit (VB6) โปรแกรมจึงต้อง build เป็น x86
using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace BLScan
{
    public class LicenseInfo
    {
        public static string SmartIniPath = @"C:\SMARTPRO\SUPPORT\Smart.ini";
        const string DecryptKey = "517B2A7CE63A4D58988F98DE04A128F2";

        public bool SmfInstalled, Valid;
        public string Company = "", KeyId = "", Serial = "", Modules = "", Problem = "", LicFile = "";
        public bool EdiAllowed;

        static LicenseInfo _cur;
        public static LicenseInfo Current { get { if (_cur == null) _cur = Load(null); return _cur; } }
        public static void Reload() { _cur = null; }

        /// <summary>แฮชของ serial สำหรับเก็บในรายการลูกค้า (ใส่คำนำเพื่อไม่ให้เทียบกับตารางแฮชทั่วไปได้)</summary>
        public static string HashSerial(string serial)
        {
            using (var sha = SHA256.Create())
                return string.Concat(sha.ComputeHash(Encoding.UTF8.GetBytes("SMF-EDI|" + (serial ?? "").Trim().ToUpperInvariant())).Select(b => b.ToString("x2")));
        }

        /// <summary>licFile = null → หาจาก Smart.ini (ShareFile) ตามที่ SMF ใช้</summary>
        public static LicenseInfo Load(string licFile)
        {
            var r = new LicenseInfo();
            try
            {
                if (licFile == null)
                {
                    if (!File.Exists(SmartIniPath)) { r.Problem = "ไม่พบ SMF บนเครื่องนี้ (ไม่มี Smart.ini)"; return r; }
                    r.SmfInstalled = true;
                    string share = null;
                    foreach (var line in File.ReadAllLines(SmartIniPath, Encoding.Default))
                    {
                        var m = Regex.Match(line, @"^\s*ShareFile\s*=\s*(.*?)\s*$", RegexOptions.IgnoreCase);
                        if (m.Success) { share = m.Groups[1].Value.Trim('"'); break; }
                    }
                    if (string.IsNullOrEmpty(share)) { r.Problem = "ไม่พบ ShareFile ใน Smart.ini"; return r; }
                    string folder = Directory.Exists(share) ? share : Path.GetDirectoryName(share);
                    licFile = Path.Combine(folder ?? "", "APP.LIC");
                }
                else r.SmfInstalled = true;
                r.LicFile = licFile;
                if (!File.Exists(licFile)) { r.Problem = "ไม่พบไฟล์ลิขสิทธิ์ APP.LIC"; return r; }
                if (Environment.Is64BitProcess) { r.Problem = "โปรแกรมนี้ต้องรันแบบ 32-bit เพื่ออ่านลิขสิทธิ์ SMF (build ผิดชนิด)"; return r; }

                string text = File.ReadLines(licFile).FirstOrDefault() ?? "";
                string plain = Decrypt(text);
                var rows = plain.Replace("\r\n", "\n").Split('\n');
                if (rows.Length < 7) { r.Problem = "รูปแบบ APP.LIC ไม่ถูกต้อง"; return r; }
                r.Company = rows[0].Trim(); r.KeyId = rows[1].Trim(); r.Serial = rows[2].Trim(); r.Modules = rows[6].Trim();
                r.Valid = r.Serial != "";
                if (!r.Valid) { r.Problem = "APP.LIC ไม่มี Serial"; return r; }
                string h = HashSerial(r.Serial);
                r.EdiAllowed = EdiLicensed.Hashes.Contains(h);
                if (!r.EdiAllowed) r.Problem = "ลิขสิทธิ์นี้ยังไม่มีสิทธิ์ใช้งาน EDI";
            }
            catch (Exception ex)
            {
                var e = ex is TargetInvocationException && ex.InnerException != null ? ex.InnerException : ex;
                r.Problem = "อ่านลิขสิทธิ์ SMF ไม่ได้: " + e.Message;
                r.Valid = false; r.EdiAllowed = false;
            }
            return r;
        }

        /// <summary>เรียก CryptText.clsMain.DecryptStringData (COM, late binding) — ต้องลงทะเบียน CryptText.dll ไว้ (SMF ติดตั้งให้)</summary>
        static string Decrypt(string text)
        {
            Type t = Type.GetTypeFromProgID("CryptText.clsMain");
            if (t == null) throw new InvalidOperationException("ไม่พบ CryptText.dll ที่ลงทะเบียนไว้ (ต้องติดตั้ง SMF บนเครื่องนี้)");
            object o = Activator.CreateInstance(t);
            try { return Convert.ToString(t.InvokeMember("DecryptStringData", BindingFlags.InvokeMethod, null, o, new object[] { text, DecryptKey })); }
            finally { try { System.Runtime.InteropServices.Marshal.ReleaseComObject(o); } catch { } }
        }
    }
}
