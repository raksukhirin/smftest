// อ่าน/เขียน ini แบบ [Section] Key=Value (บรรทัดที่ขึ้นต้น ; หรือ # เป็น comment) — เขียนแล้วคง comment/ลำดับเดิมไว้
// ค่าลับ (Password / ConnectionString) เก็บแบบ "enc:<base64>" เข้ารหัสด้วย Windows DPAPI (ผู้ใช้ Windows คนที่บันทึก)
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;

namespace SMFDash
{
    public static class Secret
    {
        // encm: = ผูกกับ "เครื่อง" (DPAPI LocalMachine) — ผู้ใช้ Windows คนไหนบนเครื่องนี้ก็เปิดใช้ได้ ไม่ต้อง login แต่ก๊อปไปเครื่องอื่นแล้วถอดรหัสไม่ได้
        // enc:  = รูปแบบเดิม ผูกกับ "ผู้ใช้ Windows" (CurrentUser) — ยังอ่านได้ และจะถูกแปลงเป็น encm: ตอนบันทึก/ /encryptini
        public const string Prefix = "encm:";
        const string LegacyPrefix = "enc:";
        static readonly byte[] Entropy = Encoding.UTF8.GetBytes("SMFDash.ini.v1");

        public static bool IsProtected(string s)
        {
            return s != null && (s.StartsWith(Prefix, StringComparison.Ordinal) || s.StartsWith(LegacyPrefix, StringComparison.Ordinal));
        }

        /// <summary>true = เข้ารหัสแบบเดิม (ผูกผู้ใช้) ควรแปลงเป็นแบบผูกเครื่อง</summary>
        public static bool IsLegacy(string s) { return s != null && s.StartsWith(LegacyPrefix, StringComparison.Ordinal); }

        public static string Protect(string plain)
        {
            if (string.IsNullOrEmpty(plain)) return "";
            if (s_isNew(plain)) return plain;
            if (IsLegacy(plain)) plain = Unprotect(plain);          // แปลง enc: → encm:
            var data = ProtectedData.Protect(Encoding.UTF8.GetBytes(plain), Entropy, DataProtectionScope.LocalMachine);
            return Prefix + Convert.ToBase64String(data);
        }

        static bool s_isNew(string s) { return s.StartsWith(Prefix, StringComparison.Ordinal); }

        /// <summary>ถอดรหัส — ถ้าไม่ได้เข้ารหัสไว้ (ค่าเดิมแบบข้อความธรรมดา) คืนค่าเดิม</summary>
        public static string Unprotect(string s)
        {
            if (!IsProtected(s)) return s ?? "";
            bool machine = s_isNew(s);
            try
            {
                var raw = ProtectedData.Unprotect(Convert.FromBase64String(s.Substring(machine ? Prefix.Length : LegacyPrefix.Length)), Entropy,
                                                  machine ? DataProtectionScope.LocalMachine : DataProtectionScope.CurrentUser);
                return Encoding.UTF8.GetString(raw);
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException("ถอดรหัสรหัสผ่านใน ini ไม่ได้ — ini นี้ถูกตั้งค่าไว้บนเครื่อง" + (machine ? "อื่น" : "/ผู้ใช้อื่น") +
                                                    " ต้องตั้งค่า DB ใหม่ผ่านโปรแกรมนี้ที่เครื่องนี้ (" + ex.Message + ")");
            }
        }
    }

    public class Ini
    {
        readonly Dictionary<string, string> _v = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        public string Path { get; private set; }

        public Ini(string path)
        {
            Path = path;
            if (!File.Exists(path)) return;
            string section = "";
            foreach (var raw in File.ReadAllLines(path, Encoding.UTF8))
            {
                var line = raw.Trim();
                if (line.Length == 0 || line.StartsWith(";") || line.StartsWith("#")) continue;
                if (line.StartsWith("[") && line.EndsWith("]")) { section = line.Substring(1, line.Length - 2).Trim(); continue; }
                int eq = line.IndexOf('=');
                if (eq <= 0) continue;
                _v[section + "." + line.Substring(0, eq).Trim()] = line.Substring(eq + 1).Trim();
            }
        }

        public bool Exists { get { return File.Exists(Path); } }

        public string Get(string section, string key, string def = "")
        {
            string s;
            return _v.TryGetValue(section + "." + key, out s) && s.Length > 0 ? s : def;
        }

        /// <summary>อ่านค่าลับ — ถอดรหัสให้ถ้าขึ้นต้นด้วย enc:</summary>
        public string GetSecret(string section, string key)
        {
            return Secret.Unprotect(Get(section, key));
        }

        /// <summary>true = ยังเป็นข้อความธรรมดา หรือเข้ารหัสแบบเดิม (ผูกผู้ใช้) — ต้องแปลงเป็นแบบผูกเครื่อง</summary>
        public bool NeedsEncrypt(string section, string key)
        {
            string s = Get(section, key);
            return s != "" && (!Secret.IsProtected(s) || Secret.IsLegacy(s));
        }

        public int GetInt(string section, string key, int def)
        {
            int i;
            return int.TryParse(Get(section, key), out i) ? i : def;
        }

        /// <summary>เขียนค่าลง ini (แก้บรรทัดเดิม หรือเพิ่มในหมวดนั้น) — คง comment และบรรทัดอื่นไว้ · secret=true จะเข้ารหัสก่อนเขียน</summary>
        public void Set(string section, string key, string value, bool secret = false)
        {
            if (secret) value = Secret.Protect(value);
            value = value ?? "";
            var lines = File.Exists(Path) ? File.ReadAllLines(Path, Encoding.UTF8).ToList() : new List<string>();

            int secStart = -1, secEnd = lines.Count;
            for (int i = 0; i < lines.Count; i++)
            {
                var t = lines[i].Trim();
                if (t.StartsWith("[") && t.EndsWith("]"))
                {
                    if (secStart >= 0) { secEnd = i; break; }
                    if (string.Equals(t.Substring(1, t.Length - 2).Trim(), section, StringComparison.OrdinalIgnoreCase)) secStart = i;
                }
            }
            string newLine = key + "=" + value;
            if (secStart < 0)
            {
                if (lines.Count > 0 && lines[lines.Count - 1].Trim() != "") lines.Add("");
                lines.Add("[" + section + "]");
                lines.Add(newLine);
            }
            else
            {
                int found = -1;
                for (int i = secStart + 1; i < secEnd; i++)
                {
                    var t = lines[i].Trim();
                    if (t.StartsWith(";") || t.StartsWith("#")) continue;
                    int eq = t.IndexOf('=');
                    if (eq > 0 && string.Equals(t.Substring(0, eq).Trim(), key, StringComparison.OrdinalIgnoreCase)) { found = i; break; }
                }
                if (found >= 0) lines[found] = newLine;
                else
                {
                    int at = secEnd;
                    while (at > secStart + 1 && lines[at - 1].Trim() == "") at--;     // แทรกก่อนบรรทัดว่างท้ายหมวด
                    lines.Insert(at, newLine);
                }
            }
            var tmp = Path + ".tmp";
            File.WriteAllLines(tmp, lines, new UTF8Encoding(true));
            if (File.Exists(Path)) File.Delete(Path);
            File.Move(tmp, Path);
            _v[section + "." + key] = value;
        }
    }
}
