// เทียบค่าที่อ่านได้กับ "เฉลย" (ค่าที่ถูกต้อง) — ใช้ร่วมกันทั้งชุดเฉลยบน CLI (/testgolden) และ Template Designer
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace BLScan
{
    public class GoldenResult
    {
        public string Key, Expected, Got;
        public bool Ok;
    }

    public static class Golden
    {
        /// <summary>
        /// ตัวเลข/จำนวนเทียบเป็นค่า (128.00 = 128.000), อื่นๆ เทียบแบบไม่สนช่องว่างและตัวพิมพ์ (OCR มักเว้นวรรคต่างจากต้นฉบับ)
        /// </summary>
        public static bool Same(string key, string expected, string got)
        {
            var f = Fields.All.FirstOrDefault(x => x.Key == key);
            if (f != null && (f.Kind == FieldKind.Decimal || f.Kind == FieldKind.Int))
            {
                decimal a, b;
                if (Fields.TryDec(expected, out a) && Fields.TryDec(got, out b)) return a == b;
            }
            Func<string, string> n = s => Regex.Replace(s ?? "", @"\s+", "").ToUpperInvariant();
            return n(expected) == n(got);
        }

        /// <summary>ค่าหลายบรรทัด → บรรทัดเดียวคั่นด้วย " | " (ตัดบรรทัดว่างท้ายที่ memo ของระบบเดิมมีเสมอ)</summary>
        public static string Flat(string s)
        {
            return (s ?? "").TrimEnd('\r', '\n', ' ').Replace("\r\n", " | ").Replace("\n", " | ").Trim();
        }

        public static List<GoldenResult> Compare(Dictionary<string, string> values, Dictionary<string, string> expect)
        {
            var list = new List<GoldenResult>();
            foreach (var kv in expect)
            {
                if (string.IsNullOrWhiteSpace(kv.Value)) continue;
                string got = Flat(Fields.Val(values, kv.Key));
                list.Add(new GoldenResult { Key = kv.Key, Expected = kv.Value, Got = got, Ok = Same(kv.Key, kv.Value, got) });
            }
            return list;
        }
    }
}
