// สิทธิ์ admin สำหรับจัดการ Template: ผู้ใช้ตายตัวชื่อ "admin" รหัสผ่านเก็บเป็น hash+salt (PBKDF2) ในไฟล์ admin.json
// ในโฟลเดอร์เดียวกับ Template (โฟลเดอร์กลางที่หลายเครื่องใช้ร่วมกัน → ใช้รหัสเดียวกันทุกเครื่อง)
//
// ข้อจำกัดที่ต้องรู้: รหัสผ่านนี้กันได้เฉพาะ "ผ่านหน้าจอโปรแกรม" ผู้ที่มีสิทธิ์เขียนโฟลเดอร์กลางยังแก้ไฟล์ JSON หรือลบ admin.json ด้วยมือได้
// การกันจริงต้องตั้งสิทธิ์โฟลเดอร์กลางเป็น "อ่านอย่างเดียว" สำหรับผู้ใช้ทั่วไป และเขียนได้เฉพาะ admin
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;

namespace BLScan
{
    public enum AdminResult { Ok, WrongPassword, Missing, Locked, Error }

    public static class AdminAuth
    {
        public const string User = "admin";
        public const string FileName = "admin.json";
        const int Iterations = 100000;
        public const int MinLength = 8;

        static int _fails;
        static DateTime _lockedUntil = DateTime.MinValue;

        /// <summary>เข้าสู่ระบบ admin แล้วหรือยัง (เฉพาะรอบที่เปิดหน้าตั้งค่า — ปิดหน้าตั้งค่าแล้วหมดสิทธิ์)</summary>
        public static bool LoggedIn;

        public static string FileFor(string folder) { return Path.Combine(folder, FileName); }

        public static bool Exists(string folder) { return !string.IsNullOrEmpty(folder) && File.Exists(FileFor(folder)); }

        static byte[] Derive(string password, byte[] salt, int iterations)
        {
            using (var kdf = new Rfc2898DeriveBytes(password, salt, iterations)) return kdf.GetBytes(32);
        }

        static bool SameBytes(byte[] a, byte[] b)
        {
            if (a.Length != b.Length) return false;
            int diff = 0;
            for (int i = 0; i < a.Length; i++) diff |= a[i] ^ b[i];
            return diff == 0;
        }

        /// <summary>ตั้ง/เปลี่ยนรหัสผ่าน (ผู้เรียกต้องตรวจสิทธิ์เอง: ครั้งแรก หรือยืนยันรหัสเดิมแล้ว)</summary>
        public static void SetPassword(string folder, string password)
        {
            if (string.IsNullOrEmpty(password) || password.Length < MinLength) throw new ArgumentException("รหัสผ่านต้องยาวอย่างน้อย " + MinLength + " ตัวอักษร");
            Directory.CreateDirectory(folder);
            var salt = new byte[16];
            using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(salt);
            var hash = Derive(password, salt, Iterations);
            string json = "{\n  \"user\": \"" + User + "\",\n  \"algo\": \"PBKDF2-SHA1\",\n  \"iterations\": " + Iterations +
                          ",\n  \"salt\": \"" + Convert.ToBase64String(salt) + "\",\n  \"hash\": \"" + Convert.ToBase64String(hash) +
                          "\",\n  \"updated\": \"" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "\"\n}\n";
            AtomicWrite(FileFor(folder), json);
        }

        /// <summary>ตรวจรหัสผ่าน — ใส่ผิดซ้ำจะถูกหน่วงเวลา (3 ครั้งแรกไม่หน่วง จากนั้น 30 วินาที เพิ่มเป็นสองเท่าสูงสุด 10 นาที)</summary>
        public static AdminResult Verify(string folder, string password, out int lockSeconds)
        {
            lockSeconds = 0;
            if (DateTime.Now < _lockedUntil) { lockSeconds = (int)Math.Ceiling((_lockedUntil - DateTime.Now).TotalSeconds); return AdminResult.Locked; }
            if (!Exists(folder)) return AdminResult.Missing;
            try
            {
                var root = new JavaScriptSerializer().DeserializeObject(File.ReadAllText(FileFor(folder), Encoding.UTF8)) as Dictionary<string, object>;
                var salt = Convert.FromBase64String(Convert.ToString(root["salt"]));
                var expect = Convert.FromBase64String(Convert.ToString(root["hash"]));
                int it = Convert.ToInt32(root["iterations"]);
                if (SameBytes(Derive(password ?? "", salt, it), expect))
                {
                    _fails = 0; LoggedIn = true;
                    return AdminResult.Ok;
                }
            }
            catch { return AdminResult.Error; }
            _fails++;
            if (_fails >= 3)
            {
                int secs = (int)Math.Min(600, 30 * Math.Pow(2, _fails - 3));
                _lockedUntil = DateTime.Now.AddSeconds(secs);
                lockSeconds = secs;
            }
            return AdminResult.WrongPassword;
        }

        public static void Logout() { LoggedIn = false; }

        /// <summary>เขียนไฟล์แบบอะตอมมิก (เขียนไฟล์ชั่วคราวแล้วสลับ) — ไม่ทิ้งไฟล์ครึ่งๆ กลางๆ ถ้าเขียนไม่จบ</summary>
        public static void AtomicWrite(string path, string content)
        {
            string tmp = path + "." + Guid.NewGuid().ToString("N").Substring(0, 8) + ".tmp";
            try
            {
                File.WriteAllText(tmp, content, new UTF8Encoding(true));
                if (File.Exists(path)) File.Replace(tmp, path, null);
                else File.Move(tmp, path);
            }
            finally { try { if (File.Exists(tmp)) File.Delete(tmp); } catch { } }
        }
    }
}
