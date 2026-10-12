// แปลงคำจาก OCR (พร้อมตำแหน่ง) เป็น field ของ House B/L — ทำงานตาม Template (ดู Template.cs)
// หลักการ: หา "หัวช่อง" (label) ที่พิมพ์บนฟอร์ม เช่น Shipper / Port of Loading แล้วจับข้อความที่อยู่ใต้ (หรือขวา) label นั้น
// Template ทั่วไป (generic) = หัวช่องมาตรฐานด้านล่าง; Template ของผู้ออกเพิ่มคำเรียก/โซนสำรอง/กติกาเฉพาะฟอร์มทับลงไป
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace BLScan
{
    public class LabelDef
    {
        public string Key;
        public bool Inline;          // ค่าอยู่ขวามือบรรทัดเดียวกับ label (เช่น Place and date of issue)
        public string[] Phrases;
        public LabelDef(string key, bool inline, params string[] phrases) { Key = key; Inline = inline; Phrases = phrases; }
    }

    public class FoundLabel
    {
        public LabelDef Def;
        public double X, Y, R, B;
        public bool Synthetic;       // ไม่ได้มาจากข้อความหัวช่องบนภาพ (โซนสำรองของ Template หรืออนุมานจากช่องข้างเคียง)
        public string Key { get { return Def.Key; } }
        public double CX { get { return (X + R) / 2; } }
    }

    public class Chunk
    {
        public List<OcrWord> Words = new List<OcrWord>();
        public string Text;
        public bool Mono;            // แถวนี้เป็นฟอนต์ตัวอักษรกว้างเท่ากัน (monospace)
        public double X { get { return Words.Min(w => w.X); } }
        public double R { get { return Words.Max(w => w.R); } }
        public double Y { get { return Words.Min(w => w.Y); } }
        public double B { get { return Words.Max(w => w.B); } }
        public double CY { get { return (Y + B) / 2; } }
        public FoundLabel Owner;
    }

    public class ParseResult
    {
        public Dictionary<string, string> Values = new Dictionary<string, string>();
        public List<FoundLabel> Labels = new List<FoundLabel>();
        public Dictionary<string, List<Chunk>> ByLabel = new Dictionary<string, List<Chunk>>();
        public List<Chunk> AllChunks = new List<Chunk>();
        public List<string> Notes = new List<string>();
        public Template Template;
    }

    public static class BLParser
    {
        public static readonly LabelDef[] Labels =
        {
            new LabelDef("BLNO", false, "B/L No", "BL No", "B/L Number", "Bill of Lading No", "HB/L No", "HBL No"),
            new LabelDef("SHIPPER", false, "Shipper/Exporter", "Shipper"),
            new LabelDef("CONSIGNEE", false, "Consignee"),
            new LabelDef("NOTIFY", false, "Notify Party", "Notify Address", "Notify"),
            new LabelDef("FEEDER", false, "Pre-carriage by", "Pre carriage by", "Feeder Vessel", "Feeder"),
            new LabelDef("RECEIPT", false, "Place of Receipt"),
            new LabelDef("VESSEL", false, "Ocean Vessel", "Vessel / Voyage", "Vessel/Voy", "Vessel"),
            new LabelDef("VOYAGE", false, "Voy. No", "Voyage No", "Voy No"),
            new LabelDef("LOADPORT", false, "Port of Loading"),
            new LabelDef("DISPORT", false, "Port of Discharge"),
            new LabelDef("DELIVERY", false, "Place of Delivery"),
            new LabelDef("FINALDEST", false, "Final Destination"),
            new LabelDef("NOOFORIG", false, "No. of original", "No.of original", "Number of original"),
            new LabelDef("MARKS", false, "Marks and numbers", "Marks and Nos", "Marks & Nos", "Marks & Numbers", "Container No./Seal No"),
            new LabelDef("PKGS", false, "Number and Type", "Number and kind of packages", "Quantity and Kind of packages", "No. of Containers or Pkgs", "No. of Pkgs", "No. of packages", "Containers or Pkgs"),
            new LabelDef("DESC", false, "Kind of Packages Description of Goods", "Description of Packages and Goods", "Description of Goods", "Description"),
            new LabelDef("GW", false, "Gross Weight"),
            new LabelDef("MEAS", false, "Measurement"),
            new LabelDef("CTNNO", false, "Container No"),
            new LabelDef("ONBOARD", false, "Shipped on Board Date", "On Board Date", "Laden on Board"),
            new LabelDef("TOTALPKG", true, "Total Number of Containers", "Total No. of Containers", "Total number of packages"),
            new LabelDef("PAYABLEAT", true, "Freight and Charges Payable at", "Freight Payable at", "Payable at"),
            new LabelDef("FREIGHT", false, "Freight and Charges", "Freight & Charges"),
            new LabelDef("AGENT", false, "Carrier's Agent as Destination", "Carrier's Agent at Destination", "Carrier's Agent", "Delivery Agent", "Delivery of Agent", "For delivery of goods please apply to", "For delivery please apply to"),
            new LabelDef("ISSUE", true, "Place and date of issue", "Place & date of issue"),
            new LabelDef("EXCESS", false, "Excess value declaration"),
            new LabelDef("SIGNED", true, "Signed on behalf of the Carrier", "Signed for the carrier", "Signed as agent", "Signed on behalf"),
            new LabelDef("ASAGENT", true, "As agents for the carrier", "As agent for the carrier", "As carrier"),
        };

        // หัวช่องที่ไม่บังคับ — ไม่แจ้ง "ไม่พบหัวช่อง" ถ้าฟอร์มไม่มี
        static readonly HashSet<string> OptionalLabels = new HashSet<string> { "CTNNO", "EXCESS", "VOYAGE", "ONBOARD", "ASAGENT", "SIGNED", "FEEDER", "AGENT" };

        // ข้อความที่พิมพ์ประกอบหัวช่อง (บรรทัดที่ 2 ของ label) — ตัดทิ้งเมื่ออยู่ใกล้ label
        static readonly string[] BaseNoise =
        {
            "(For The Merchants Reference Only)", "For The Merchants Reference Only", "(for the Merchant's reference)", "for the Merchant's reference",
            "of Packages (In Words)", "of Packages", "Metric Tons", "M 3", "SAID TO CONTAIN", "SAID TO CONTAIN:-",
            "Particulars as declared by shipper", "Particulars furnished by shipper",
            "Container No. Seal No", "Marks & Numbers", "Marks and Numbers", "No. of Containers or Pkgs", "Containers or Pkgs", "Kind of Packages",
            "SHIPPER'S LOAD COUNT & SEAL SAID TO CONTAIN", "SHIPPERS LOAD COUNT AND SEAL SAID TO CONTAIN",
        };

        static readonly string[] BLTypeWords = { "ORIGINAL", "COPY", "NON-NEGOTIABLE", "NON NEGOTIABLE", "DUPLICATE", "TRIPLICATE", "SURRENDERED", "TELEX RELEASE", "EXPRESS RELEASE", "SEAWAY BILL" };

        static string Norm(string s)
        {
            var sb = new StringBuilder();
            foreach (char c in s.ToLowerInvariant())
                if (char.IsLetterOrDigit(c)) sb.Append(c);
            return sb.ToString();
        }

        static string[] Tokens(string phrase)
        {
            return phrase.Split(new[] { ' ', '/', '&' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(Norm).Where(t => t.Length > 0).ToArray();
        }

        static int Lev(string a, string b)
        {
            var d = new int[a.Length + 1, b.Length + 1];
            for (int i = 0; i <= a.Length; i++) d[i, 0] = i;
            for (int j = 0; j <= b.Length; j++) d[0, j] = j;
            for (int i = 1; i <= a.Length; i++)
                for (int j = 1; j <= b.Length; j++)
                    d[i, j] = Math.Min(Math.Min(d[i - 1, j] + 1, d[i, j - 1] + 1), d[i - 1, j - 1] + (a[i - 1] == b[j - 1] ? 0 : 1));
            return d[a.Length, b.Length];
        }

        static bool TokEq(string ocr, string want)
        {
            if (ocr == want) return true;
            return want.Length >= 5 && Lev(ocr, want) <= 1;
        }

        /// <summary>
        /// หา phrase ในคำของบรรทัด OCR — คำ OCR หนึ่งคำอาจแตกเป็นหลาย token ("B/L" = "b","l")
        /// คืน index ของคำที่ match (ช่วง [start, end))
        /// </summary>
        static List<int[]> FindPhrase(List<OcrWord> line, string[] want, HashSet<OcrWord> used)
        {
            var hits = new List<int[]>();
            // แตกคำ OCR เป็น token พร้อมจำว่ามาจากคำไหน
            var toks = new List<string>();
            var owner = new List<int>();
            for (int i = 0; i < line.Count; i++)
                foreach (var t in Tokens(line[i].Text)) { toks.Add(t); owner.Add(i); }
            for (int s = 0; s + want.Length <= toks.Count; s++)
            {
                if (s > 0 && owner[s] == owner[s - 1]) continue;   // ต้องเริ่มที่ต้นคำ
                bool ok = true;
                for (int k = 0; k < want.Length && ok; k++) ok = TokEq(toks[s + k], want[k]);
                if (!ok) continue;
                AddHit(hits, line, used, owner[s], owner[s + want.Length - 1] + 1);
            }
            // OCR บางทีกินช่องว่าง ("ofissue") หรือแตกคำ — เทียบแบบต่อตัวอักษรทั้งบรรทัดอีกรอบ
            var sb = new StringBuilder();
            var charOwner = new List<int>();
            for (int i = 0; i < toks.Count; i++)
                foreach (char ch in toks[i]) { sb.Append(ch); charOwner.Add(owner[i]); }
            string flat = sb.ToString(), target = string.Concat(want);
            for (int at = flat.IndexOf(target, StringComparison.Ordinal); at >= 0; at = flat.IndexOf(target, at + 1, StringComparison.Ordinal))
            {
                int end = at + target.Length - 1;
                bool startOk = at == 0 || charOwner[at - 1] != charOwner[at];
                bool endOk = end == flat.Length - 1 || charOwner[end + 1] != charOwner[end];
                if (startOk && endOk) AddHit(hits, line, used, charOwner[at], charOwner[end] + 1);
            }
            return hits;
        }

        static void AddHit(List<int[]> hits, List<OcrWord> line, HashSet<OcrWord> used, int a, int b)
        {
            for (int i = a; i < b; i++) if (used.Contains(line[i])) return;
            if (!hits.Any(h => h[0] == a && h[1] == b)) hits.Add(new[] { a, b });
        }

        /// <summary>หัวช่องที่พิมพ์แตกเป็นหลายบรรทัดซ้อนกัน (เช่น "No. of / Containers / or Pkgs.") → บรรทัดเสมือนที่ต่อกันจากบนลงล่าง</summary>
        static List<List<OcrWord>> StackLines(List<List<OcrWord>> lines)
        {
            var result = new List<List<OcrWord>>();
            var shortLines = lines.Where(l => l.Count > 0 && l.Count <= 5).ToList();
            Func<List<OcrWord>, double> top = l => l.Min(w => w.Y), bot = l => l.Max(w => w.B), cx = l => (l.Min(w => w.X) + l.Max(w => w.R)) / 2;
            foreach (var a in shortLines)
                foreach (var b in shortLines)
                {
                    if (ReferenceEquals(a, b)) continue;
                    if (top(b) < bot(a) - 0.003 || top(b) - bot(a) > 0.012 || Math.Abs(cx(a) - cx(b)) > 0.07) continue;
                    var v2 = new List<OcrWord>(a); v2.AddRange(b);
                    result.Add(v2);
                    foreach (var c in shortLines)
                    {
                        if (ReferenceEquals(c, a) || ReferenceEquals(c, b)) continue;
                        if (top(c) < bot(b) - 0.003 || top(c) - bot(b) > 0.012 || Math.Abs(cx(b) - cx(c)) > 0.07) continue;
                        var v3 = new List<OcrWord>(v2); v3.AddRange(c);
                        result.Add(v3);
                    }
                }
            return result;
        }

        /// <summary>ย่อหน้าข้อความยาว (เงื่อนไขการขนส่ง ฯลฯ): ≥3 บรรทัดติดกัน ชิดซ้ายเดียวกัน บรรทัดละ ≥9 คำ — ไม่ใช่หัวช่อง/ค่าใดๆ</summary>
        static HashSet<OcrWord> BodyBlockWords(List<List<OcrWord>> lines)
        {
            var res = new HashSet<OcrWord>();
            var cand = lines.Where(l => l.Count >= 9).ToList();
            foreach (var l in cand)
            {
                double x0 = l.Min(w => w.X), y0 = l.Min(w => w.Y);
                int near = cand.Count(o => !ReferenceEquals(o, l) && Math.Abs(o.Min(w => w.X) - x0) < 0.02 && Math.Abs(o.Min(w => w.Y) - y0) < 0.045);
                if (near >= 2) foreach (var w in l) res.Add(w);
            }
            return res;
        }

        static List<LabelDef> BuildDefs(Template t)
        {
            var defs = Labels.Select(d => new LabelDef(d.Key, d.Inline, (string[])d.Phrases.Clone())).ToList();
            foreach (var kv in t.Labels)
            {
                var d = defs.FirstOrDefault(x => string.Equals(x.Key, kv.Key, StringComparison.OrdinalIgnoreCase));
                if (d == null) { defs.Add(new LabelDef(kv.Key.ToUpperInvariant(), false, kv.Value)); continue; }
                d.Phrases = t.ReplaceLabels ? kv.Value : kv.Value.Concat(d.Phrases).ToArray();
            }
            foreach (var k in t.Inline)
            {
                var d = defs.FirstOrDefault(x => string.Equals(x.Key, k, StringComparison.OrdinalIgnoreCase));
                if (d != null) d.Inline = true;
            }
            // หัวช่องกั้น: ทุกวลีเป็น label ของตัวเอง (key ขึ้นต้น "_") ไม่ให้ค่า แต่ทำให้ข้อความใต้มันไม่ไหลไปเป็นค่าของช่องอื่น
            int n = 0;
            foreach (var phrase in t.Stop) defs.Add(new LabelDef("_stop" + (++n), false, phrase));
            return defs;
        }

        public static ParseResult Parse(OcrPage page) { return Parse(page, null); }

        public static ParseResult Parse(OcrPage page, Template tpl)
        {
            tpl = tpl ?? Template.Generic();
            var defs = BuildDefs(tpl);
            var noise = BaseNoise.Concat(tpl.Strip).ToArray();
            var res = new ParseResult { Template = tpl };
            var words = page.Words.Where(w => w.Text.Trim().Length > 0).ToList();

            // ย่อหน้าข้อความยาวไม่ใช่ข้อมูลของช่องใด (กันไม่ให้ "total number of containers..." ในเงื่อนไขกลายเป็นหัวช่อง)
            var body = BodyBlockWords(words.GroupBy(w => w.LineNo).Select(g => g.OrderBy(w => w.X).ToList()).ToList());
            if (body.Count > 0) words = words.Where(w => !body.Contains(w)).ToList();

            double medH = Median(words.Select(w => w.H));
            double aspect = page.PixelHeight > 0 ? (double)page.PixelHeight / page.PixelWidth : 1.414;

            // ---------- 1) หา label ----------
            var lines = words.GroupBy(w => w.LineNo).Select(g => g.OrderBy(w => w.X).ToList()).ToList();
            var searchLines = new List<List<OcrWord>>(lines);
            searchLines.AddRange(StackLines(lines));
            var used = new HashSet<OcrWord>();
            // phrase ยาวก่อน — "Freight and Charges Payable at" ต้องได้ก่อน "Freight and Charges"
            var order = defs.SelectMany(d => d.Phrases.Select(p => new { Def = d, Phrase = p, Tok = Tokens(p) }))
                            .Where(x => x.Tok.Length > 0)
                            .OrderByDescending(x => x.Tok.Length).ThenByDescending(x => x.Phrase.Length).ToList();
            // จัดลำดับ key ตาม phrase ที่ยาวที่สุดของ key นั้น แต่ภายใน key ให้ทุก phrase แข่งกัน
            // (ไม่งั้น "number of Original" ในข้อความเงื่อนไขจะชนะ "No. of original" ที่เป็นหัวช่องจริง)
            var keyOrder = order.Select(x => x.Def).Distinct().ToList();
            foreach (var def in keyOrder)
            {
                FoundLabel best = null; bool bestStart = false; int[] bestRange = null; List<OcrWord> bestLine = null;
                foreach (var item in order.Where(x => x.Def == def))
                foreach (var line in searchLines)
                {
                    foreach (var hit in FindPhrase(line, item.Tok, used))
                    {
                        bool atStart = hit[0] == 0;
                        double y = line[hit[0]].Y;
                        // label จริงมักขึ้นต้นบรรทัด และอยู่บนสุด (ข้อความเดียวกันในเนื้อหาจะอยู่ต่ำกว่า เช่น "SAME AS CONSIGNEE")
                        if (best == null || (atStart && !bestStart) || (atStart == bestStart && y < best.Y))
                        {
                            var seg = line.GetRange(hit[0], hit[1] - hit[0]);
                            best = new FoundLabel { Def = item.Def, X = seg.Min(w => w.X), Y = seg.Min(w => w.Y), R = seg.Max(w => w.R), B = seg.Max(w => w.B) };
                            bestStart = atStart; bestRange = hit; bestLine = line;
                        }
                    }
                }
                if (best == null) continue;
                for (int i = bestRange[0]; i < bestRange[1]; i++) used.Add(bestLine[i]);
                // ตัด ":" หรือ "*" ที่ OCR แยกเป็นคำต่อท้าย label
                int nx = bestRange[1];
                while (nx < bestLine.Count && Regex.IsMatch(bestLine[nx].Text, @"^[:*.\-]+$")) { used.Add(bestLine[nx]); best.R = Math.Max(best.R, bestLine[nx].R); nx++; }
                res.Labels.Add(best);
            }

            // ---------- 1b) label ที่ OCR อ่านไม่ออก → โซนสำรองของ Template หรืออนุมานจากช่องข้างเคียง ----------
            foreach (var kv in tpl.Zones)
            {
                if (res.Labels.Any(l => string.Equals(l.Key, kv.Key, StringComparison.OrdinalIgnoreCase))) continue;
                var def = defs.FirstOrDefault(d => string.Equals(d.Key, kv.Key, StringComparison.OrdinalIgnoreCase));
                if (def == null) continue;
                var z = kv.Value;
                // โซน: y = ขอบบนที่ข้อความของช่องเริ่ม → ข้อความที่อยู่เหนือขอบนี้ไม่ถูกดึงเข้าช่องนี้
                res.Labels.Add(new FoundLabel { Def = def, X = z.X, R = z.X + Math.Max(0.04, z.W), Y = z.Y - 0.002, B = z.Y - 0.001, Synthetic = true });
                res.Notes.Add("OCR อ่านหัวช่อง \"" + def.Phrases[0] + "\" ไม่ออก — ใช้โซนสำรองของ Template");
            }
            InferMissing(res, defs);

            // ---------- 2) ตัดคำประกอบหัวช่อง (noise) ที่อยู่ติดใต้ label ----------
            foreach (var np in noise.OrderByDescending(p => p.Length))
            {
                var tok = Tokens(np);
                if (tok.Length == 0) continue;
                bool always = tpl.Strip.Contains(np);      // ข้อความที่ admin ระบุเอง: ตัดทุกตำแหน่ง ไม่ต้องอยู่ใกล้หัวช่อง
                foreach (var line in searchLines)
                    foreach (var hit in FindPhrase(line, tok, used))
                    {
                        var w0 = line[hit[0]];
                        bool nearLabel = res.Labels.Any(l => w0.Y - l.B < 0.03 && w0.Y >= l.Y - 0.005 && w0.X < l.R + 0.05 && w0.R > l.X - 0.12);
                        if (always || nearLabel || tok.Length >= 4)
                            for (int i = hit[0]; i < hit[1]; i++) used.Add(line[i]);
                    }
            }

            var pool = words.Where(w => !used.Contains(w)).ToList();
            // ตัวอักษรเศษที่อยู่ซ้ายกว่าหัวช่องทุกอัน = ข้อความแนวตั้งขอบฟอร์ม ("Particulars as declared by shipper")
            if (res.Labels.Count > 0)
            {
                double minX = res.Labels.Min(l => l.X);
                pool.RemoveAll(w => w.R < minX + 0.005 && w.Text.Trim().Length <= 2 && !w.Text.Any(char.IsDigit));
            }

            // ---------- 3) จัดคำเป็นแถว แล้วแบ่งแถวเป็นก้อน (chunk) ตามช่องว่าง/ขอบคอลัมน์ ----------
            var rows = new List<List<OcrWord>>();
            foreach (var w in pool.OrderBy(w => w.CY))
            {
                var row = rows.LastOrDefault(r => Math.Abs(r.Average(x => x.CY) - w.CY) < medH * 0.55);
                if (row == null) { row = new List<OcrWord>(); rows.Add(row); }
                row.Add(w);
            }
            var monoRows = DetectMonoRows(rows);
            double gapSplit = 0.035;

            // ตารางสินค้า: หัวตาราง = label ≥3 อัน แถวเดียวกัน. หัวตารางมักจัดกึ่งกลาง แต่ข้อมูลชิดซ้าย จึงหาขอบคอลัมน์จาก
            // "ตำแหน่งที่ ≥3 แถวขึ้นต้นก้อนตรงกัน" แล้วแยกคำที่ขึ้นต้นตรงขอบนั้น (เช่น "1 PKGS" | "AUTOMATIC UNLOADER")
            var bands = new List<double[]>();
            foreach (var grp in res.Labels.Where(l => !l.Def.Inline).GroupBy(l => Math.Round(l.Y / 0.006)))
            {
                var hdr0 = res.Labels.Where(l => !l.Def.Inline && Math.Abs(l.Y - grp.First().Y) < 0.006).ToList();
                if (hdr0.Count < 3) continue;
                double top = hdr0.Max(l => l.B);
                double bottom = res.Labels.Where(l => l.Y > top + 0.02).Select(l => l.Y).DefaultIfEmpty(1.0).Min();
                bands.Add(new[] { top, bottom });
            }
            Func<List<OcrWord>, bool> inBand = rw => { double y = rw.Min(w => w.Y); return bands.Any(b => y > b[0] && y < b[1]); };
            var edgeXs = new List<double>();
            if (bands.Count > 0)
            {
                var starts = new List<double>();
                foreach (var row in rows.Where(inBand))
                {
                    var ows = row.OrderBy(w => w.X).ToList();
                    starts.Add(ows[0].X);
                    for (int i = 1; i < ows.Count; i++) if (ows[i].X - ows[i - 1].R > gapSplit) starts.Add(ows[i].X);
                }
                foreach (var grpX in starts.OrderBy(x => x).Aggregate(new List<List<double>>(), (acc, x) =>
                         { if (acc.Count > 0 && x - acc[acc.Count - 1][0] < 0.004) acc[acc.Count - 1].Add(x); else acc.Add(new List<double> { x }); return acc; }))
                    if (grpX.Count >= 3) edgeXs.Add(grpX.Average());
            }

            var chunks = new List<Chunk>();
            foreach (var row in rows)
            {
                bool rowMono = monoRows.Contains(row);
                bool rowInBand = edgeXs.Count > 0 && inBand(row);
                var ws = row.OrderBy(w => w.X).ToList();
                double rowY = ws.Min(w => w.Y);
                Chunk cur = null;
                for (int i = 0; i < ws.Count; i++)
                {
                    bool split = cur == null;
                    if (!split)
                    {
                        var a = ws[i - 1]; var b = ws[i];
                        if (b.X - a.R > gapSplit) split = true;
                        else if (rowInBand && b.X - a.R > 0.008 && edgeXs.Any(e => Math.Abs(b.X - e) < 0.004)) split = true;
                        // ขอบซ้ายของ label ที่อยู่เหนือแถวนี้ = ขอบคอลัมน์ (ต้องมีช่องว่างมากกว่าเว้นวรรคปกติด้วย
                        // เพราะ label บางช่องจัดกึ่งกลาง เช่น "Marks and numbers" ขอบซ้ายตกกลางข้อความ)
                        else if (b.X - a.R > 0.015 && res.Labels.Any(l => !l.Def.Inline && l.X > a.R - 0.002 && l.X <= b.X + 0.01 && rowY - l.B > -0.002 && rowY - l.B < 0.08))
                            split = true;
                        // label บนแถวเดียวกัน (inline) ก็เป็นขอบ
                        else if (res.Labels.Any(l => l.X > a.R - 0.002 && l.X <= b.X && Math.Abs(l.Y - a.Y) < medH))
                            split = true;
                    }
                    if (split) { cur = new Chunk { Mono = rowMono }; chunks.Add(cur); }
                    cur.Words.Add(ws[i]);
                }
            }
            // แถวที่ถูกตีว่า monospace ต้องมีความกว้างตัวอักษรสม่ำเสมอ "ในก้อนข้อความนั้น" ด้วย (ฟอนต์ Arial ที่เว้นช่องว่างกว้างๆ
            // เช่น ", LTD." จะผ่านเกณฑ์ช่องว่างจริงแต่ความกว้างตัวอักษรไม่สม่ำเสมอ — วัดจริง: monospace ≤ 0.09, Arial ≥ 0.17)
            foreach (var c in chunks) if (c.Mono && !RegularCellWidth(c.Words)) c.Mono = false;
            foreach (var c in chunks) c.Text = JoinWords(c.Words, c.Mono);

            // ตัดเศษตัวอักษรเดี่ยว (มักเป็นข้อความแนวตั้งข้างฟอร์ม เช่น "Particulars as declared by shipper")
            chunks.RemoveAll(c => c.Words.Count == 1 && c.Text.Length == 1 && !char.IsDigit(c.Text[0]));

            // ลายน้ำ ORIGINAL / COPY → BLTYPE
            foreach (var c in chunks.ToList())
            {
                string t = c.Text.Trim().ToUpperInvariant();
                var bt = BLTypeWords.FirstOrDefault(x => t == x);
                if (bt != null) { res.Values["BLTYPE"] = bt; chunks.Remove(c); }
            }
            res.AllChunks = chunks;

            // ---------- 4) ผูก chunk เข้ากับ label ----------
            foreach (var c in chunks)
            {
                // 4a) inline: อยู่ขวามือบรรทัดเดียวกับ label
                var inl = res.Labels.Where(l => l.Def.Inline && c.X >= l.R - 0.005 && c.X - l.R < 0.6
                                                && c.CY >= l.Y - medH * 0.6 && c.CY <= l.B + medH * 1.6
                                                // มีหัวช่องอื่นคั่นอยู่ระหว่าง label กับก้อนนี้ = ก้อนนี้เป็นของหัวช่องคอลัมน์นั้น (อยู่ใต้มัน) ไม่ใช่ค่า inline
                                                && !res.Labels.Any(o => !ReferenceEquals(o, l) && o.X > l.R + 0.005 && o.X <= c.X + 0.003 && Math.Abs(o.Y - l.Y) < medH * 3))
                                    .OrderBy(l => c.X - l.R).FirstOrDefault();
                if (inl != null) { c.Owner = inl; continue; }

                // 4b) label ที่อยู่เหนือ chunk ใกล้ที่สุด (แนวตั้ง) และไม่ห่างแนวนอนเกินไป
                // ข้อความที่อยู่ซ้ายของ label ทั้งก้อน → ยอมห่างได้น้อย (label จัดกึ่งกลางเท่านั้นที่ค่าเริ่มซ้ายกว่า)
                var cands = res.Labels.Where(l => l.Y < c.Y && HDist(c.X, c.R, l.X, l.R) <= (c.R < l.X ? 0.04 : 0.12)).ToList();
                if (cands.Count == 0) continue;
                double vmin = cands.Min(l => c.Y - l.B);
                c.Owner = cands.Where(l => c.Y - l.B <= vmin + 0.015)
                               .OrderBy(l => HDist(c.X, c.R, l.X, l.R))
                               .ThenBy(l => Math.Abs((c.X + c.R) / 2 - l.CX))
                               .First();
            }

            // 4c) แถวหัวตาราง (หลาย label บรรทัดเดียวกัน เช่น Marks | Packages | Description | Weight | Measure)
            //     ข้อความในตารางพิมพ์ชิดซ้ายของคอลัมน์ → จับกลุ่มตามขอบซ้าย แล้วโหวตว่ากลุ่มนั้นเป็นของ label ไหน
            foreach (var grp in res.Labels.Where(l => !l.Def.Inline).GroupBy(l => Math.Round(l.Y / 0.006)))
            {
                var hdr = res.Labels.Where(l => !l.Def.Inline && Math.Abs(l.Y - grp.First().Y) < 0.006).ToList();
                if (hdr.Count < 3) continue;
                var members = chunks.Where(c => c.Owner != null && hdr.Contains(c.Owner)).ToList();
                var clusters = new List<List<Chunk>>();
                foreach (var c in members.OrderBy(c => c.X))
                {
                    var cl = clusters.FirstOrDefault(k => Math.Abs(k[0].X - c.X) < 0.012);
                    if (cl == null) { cl = new List<Chunk>(); clusters.Add(cl); }
                    cl.Add(c);
                }
                foreach (var cl in clusters)
                {
                    var votes = new Dictionary<FoundLabel, double>();
                    foreach (var c in cl)
                    {
                        // ก้อนที่คาบหลายคอลัมน์ (เช่นบรรทัดสรุป "ตู้ / PKGS / KGS / CBM") ไม่ร่วมโหวต ไม่งั้นลากทั้งกลุ่มไปผิดคอลัมน์
                        if (hdr.Count(l => Math.Min(c.R, l.R) - Math.Max(c.X, l.X) > 0) >= 2) continue;
                        FoundLabel bestL = null; double bestOv = 0;
                        foreach (var l in hdr)
                        {
                            double ov = Math.Min(c.R, l.R) - Math.Max(c.X, l.X);
                            if (ov > bestOv) { bestOv = ov; bestL = l; }
                        }
                        if (bestL == null) bestL = hdr.OrderBy(l => HDist(c.X, c.R, l.X, l.R)).First();
                        double wgt = c.R - c.X;
                        votes[bestL] = (votes.ContainsKey(bestL) ? votes[bestL] : 0) + wgt;
                    }
                    if (votes.Count == 0) continue;
                    var win = votes.OrderByDescending(v => v.Value).First().Key;
                    foreach (var c in cl) c.Owner = win;
                }
            }

            foreach (var c in chunks.Where(c => c.Owner != null).OrderBy(c => c.Y).ThenBy(c => c.X))
            {
                if (!res.ByLabel.ContainsKey(c.Owner.Key)) res.ByLabel[c.Owner.Key] = new List<Chunk>();
                res.ByLabel[c.Owner.Key].Add(c);
            }

            // หัวช่อง Notify อ่านไม่ออก แต่มีข้อความ "SAME AS CONSIGNEE" ลอยอยู่ → เป็นค่าของ Notify
            if (!res.ByLabel.ContainsKey("NOTIFY"))
            {
                var same = chunks.FirstOrDefault(c => Regex.IsMatch(c.Text.Trim(), @"^SAME\s+AS\s+CONSIGNEE\.?$", RegexOptions.IgnoreCase));
                if (same != null)
                {
                    foreach (var list in res.ByLabel.Values) list.Remove(same);
                    res.ByLabel["NOTIFY"] = new List<Chunk> { same };
                    res.Notes.Add("ไม่พบหัวช่อง Notify Party — ใช้ข้อความ \"SAME AS CONSIGNEE\" เป็นค่าของ Notify");
                }
            }

            // ---------- กรอบดึงค่าของ Template: ค่าของช่อง = เฉพาะคำ OCR ที่อยู่ในกรอบ (ชนะการจับด้วยหัวช่องเสมอ) ----------
            foreach (var kv in tpl.Areas)
            {
                var adef = defs.FirstOrDefault(d => string.Equals(d.Key, kv.Key, StringComparison.OrdinalIgnoreCase));
                if (adef == null) continue;
                var z = kv.Value;
                var inside = page.Words.Where(w => w.Text.Trim().Length > 0 && w.CX >= z.X && w.CX <= z.X + z.W && w.CY >= z.Y && w.CY <= z.Y + z.H).ToList();
                var lab = res.Labels.FirstOrDefault(l => l.Key == adef.Key);
                if (lab == null) { lab = new FoundLabel { Def = adef, X = z.X, R = z.X + Math.Max(0.04, z.W), Y = z.Y - 0.002, B = z.Y - 0.001, Synthetic = true }; res.Labels.Add(lab); }
                foreach (var oc in res.AllChunks.Where(c => c.Owner != null && c.Owner.Key == adef.Key)) oc.Owner = null;
                var fresh = new List<Chunk>();
                foreach (var g in inside.GroupBy(w => w.LineNo).OrderBy(g => g.Min(w => w.Y)))
                {
                    var ws = g.OrderBy(w => w.X).ToList();
                    fresh.Add(new Chunk { Words = ws, Text = string.Join(" ", ws.Select(w => w.Text)), Owner = lab });
                }
                if (fresh.Count > 0) { res.ByLabel[adef.Key] = fresh; res.AllChunks.AddRange(fresh); }
                else res.ByLabel.Remove(adef.Key);
                res.Notes.Add("ช่อง " + adef.Key + " ใช้ค่าจากกรอบดึงข้อมูลของ Template");
            }

            Extract(res, tpl, defs);
            return res;
        }

        // ช่องเส้นทางเรือบนฟอร์ม B/L มาตรฐานเป็นตาราง 2 คอลัมน์ x 3 แถว:
        //   Pre-carriage/Feeder | Place of Receipt
        //   Ocean Vessel        | Port of Loading
        //   Port of Discharge   | Place of Delivery
        // key ที่หายไป → { key ที่อยู่คอลัมน์เดียวกัน (เอา X), key ที่อยู่แถวเดียวกัน (เอา Y) }
        static readonly string[][] Siblings =
        {
            new[] { "FEEDER", "VESSEL", "RECEIPT" }, new[] { "FEEDER", "DISPORT", "RECEIPT" },
            new[] { "RECEIPT", "LOADPORT", "FEEDER" }, new[] { "RECEIPT", "DELIVERY", "FEEDER" },
            new[] { "VESSEL", "FEEDER", "LOADPORT" }, new[] { "VESSEL", "DISPORT", "LOADPORT" },
            new[] { "LOADPORT", "RECEIPT", "VESSEL" }, new[] { "LOADPORT", "DELIVERY", "VESSEL" },
            new[] { "DISPORT", "VESSEL", "DELIVERY" }, new[] { "DISPORT", "FEEDER", "DELIVERY" },
            new[] { "DELIVERY", "LOADPORT", "DISPORT" }, new[] { "DELIVERY", "RECEIPT", "DISPORT" },
        };

        static void InferMissing(ParseResult res, List<LabelDef> defs)
        {
            foreach (var s in Siblings)
            {
                if (res.Labels.Any(l => l.Key == s[0])) continue;
                var col = res.Labels.FirstOrDefault(l => l.Key == s[1]);
                var row = res.Labels.FirstOrDefault(l => l.Key == s[2]);
                if (col == null || row == null) continue;
                var def = defs.First(d => d.Key == s[0]);
                res.Labels.Add(new FoundLabel { Def = def, X = col.X, R = col.X + 0.04, Y = row.Y, B = row.B, Synthetic = true });
                res.Notes.Add("OCR อ่านหัวช่อง \"" + def.Phrases[0] + "\" ไม่ออก — อนุมานตำแหน่งจากช่องข้างเคียง");
            }
        }

        static double HDist(double x1, double r1, double x2, double r2)
        {
            if (r1 < x2) return x2 - r1;
            if (r2 < x1) return x1 - r2;
            return 0;
        }

        static double Median(IEnumerable<double> xs)
        {
            var a = xs.OrderBy(x => x).ToList();
            return a.Count == 0 ? 0.008 : a[a.Count / 2];
        }

        // ---------------- แยกแถวที่เป็นฟอนต์ตัวอักษรกว้างเท่ากัน (monospace) ----------------
        // ใช้ตัดสินว่า "ช่องว่างแคบรอบตัว I" คือ OCR แตกคำผิด ("THA I LAND") ไม่ใช่ช่องว่างจริง
        // วัดจากข้อมูลจริง: ช่องว่างจริงในฟอนต์ monospace ≥ 1.1 เท่าความกว้างตัวอักษร ส่วนที่ OCR แตกผิดอยู่ที่ 0.3-0.6
        // แต่ฟอนต์ proportional (Arial) ช่องว่างจริงก็ ~0.5 → ต้องยืนยันว่าแถวเป็น monospace ก่อนเสมอ

        static readonly Regex NarrowGlyph = new Regex("[Iilj1]");

        static double CellWidth(List<OcrWord> row)
        {
            var cws = row.Where(w => w.Text.Length >= 2 && !NarrowGlyph.IsMatch(w.Text) && Regex.IsMatch(w.Text.TrimEnd(',', '.', ';', ':'), @"^[A-Za-z0-9]{2,}$"))
                         .Select(w => w.W / w.Text.Length).OrderBy(x => x).ToList();
            return cws.Count >= 1 ? cws[cws.Count / 2] : 0;
        }

        /// <summary>ความกว้างต่อตัวอักษรของคำในก้อนสม่ำเสมอไหม (CV ≤ 0.13) — ถ้ามีคำที่ใช้วัดได้ไม่ถึง 3 คำ ถือว่าไม่ขัดแย้ง</summary>
        static bool RegularCellWidth(List<OcrWord> ws)
        {
            var cws = ws.Where(w => w.Text.Length >= 2 && !NarrowGlyph.IsMatch(w.Text) && Regex.IsMatch(w.Text.TrimEnd(',', '.', ';', ':'), @"^[A-Za-z0-9]{2,}$"))
                        .Select(w => w.W / w.Text.Length).ToList();
            if (cws.Count < 3) return true;
            double mean = cws.Average();
            double sd = Math.Sqrt(cws.Select(c => (c - mean) * (c - mean)).Average());
            return mean > 0 && sd / mean <= 0.13;
        }

        static HashSet<List<OcrWord>> DetectMonoRows(List<List<OcrWord>> rows)
        {
            var mono = new HashSet<List<OcrWord>>();
            var evidenced = new List<double>();
            var cell = new Dictionary<List<OcrWord>, double>();
            foreach (var row in rows)
            {
                var ws = row.OrderBy(w => w.X).ToList();
                double cw = CellWidth(ws);
                cell[row] = cw;
                if (cw <= 0 || ws.Count < 2) continue;
                // มีช่องว่างจริงระหว่างคำ ≥ 1.0 เท่าความกว้างตัวอักษร = หลักฐานว่า monospace
                bool realGap = false;
                for (int i = 1; i < ws.Count && !realGap; i++)
                    if ((ws[i].X - ws[i - 1].R) / cw >= 1.0 && (ws[i].X - ws[i - 1].R) < 0.04) realGap = true;
                if (realGap) { mono.Add(row); evidenced.Add(cw); }
            }
            // แถวที่ไม่มีช่องว่างให้ดู (เช่นคำเดียวที่ถูกแตก "NEWL I NE") → ยอมรับถ้าความกว้างตัวอักษรเท่ากับแถว monospace ที่ยืนยันแล้ว
            foreach (var row in rows)
            {
                if (mono.Contains(row)) continue;
                double cw = cell[row];
                if (cw > 0 && evidenced.Any(e => Math.Abs(cw - e) / e < 0.06)) mono.Add(row);
            }
            return mono;
        }

        /// <summary>
        /// ต่อคำ — OCR แยกคำที่จริงติดกัน เช่น "P/" "SIN..." , "A." "T." "L" → เทียบช่องว่างกับความกว้างตัวอักษร
        /// คำที่ลงท้าย . / : - (ตัวย่อ เลขที่) ยอมให้ช่องว่างกว้างกว่าปกติแล้วยังต่อติด
        /// แถว monospace: ช่องว่างแคบ (&lt;0.8) ที่ติดกับตัว I → OCR แตกผิด ต่อกลับ
        /// </summary>
        static string JoinWords(List<OcrWord> ws, bool mono)
        {
            var sb = new StringBuilder();
            for (int i = 0; i < ws.Count; i++)
            {
                if (i > 0)
                {
                    var a = ws[i - 1]; var b = ws[i];
                    var refW = a.Text.Length >= 2 ? a : b;
                    double charW = refW.W / Math.Max(1, refW.Text.Length);
                    double gap = (b.X - a.R) / Math.Max(charW, 1e-6);
                    bool abbrev = Regex.IsMatch(a.Text, @"[./:\-]$") || Regex.IsMatch(b.Text, @"^[.,:;/)\-]");
                    bool punctOnly = Regex.IsMatch(b.Text, @"^[,.:;)]+$");
                    bool join = punctOnly ? gap < 1.0 : (abbrev ? gap < 0.7 : gap < 0.35);
                    if (!join && mono && gap < 0.8 && !punctOnly)
                    {
                        bool aEndsI = Regex.IsMatch(a.Text, @"[Ii]$"), bStartsI = Regex.IsMatch(b.Text, @"^[Ii]");
                        bool aAlpha = Regex.IsMatch(a.Text, @"[A-Za-z]$"), bAlpha = Regex.IsMatch(b.Text, @"^[A-Za-z]");
                        if (aAlpha && bAlpha && (aEndsI || bStartsI)) join = true;
                    }
                    if (!join) sb.Append(' ');
                }
                sb.Append(ws[i].Text);
            }
            return sb.ToString();
        }

        // ---------------- แปลงเป็นค่า field ----------------

        static List<string> LinesOf(ParseResult r, string key) { return LinesOf(r, key, null); }

        static List<string> LinesOf(ParseResult r, string key, Func<Chunk, bool> keep)
        {
            List<Chunk> cs;
            if (!r.ByLabel.TryGetValue(key, out cs)) return new List<string>();
            if (keep != null)
            {
                var kept = cs.Where(keep).ToList();
                if (kept.Count > 0) cs = kept;
            }
            // chunk แถวเดียวกันต่อกันด้วยช่องว่าง, ต่างแถวขึ้นบรรทัดใหม่
            var rows = new List<List<Chunk>>();
            foreach (var c in cs.OrderBy(c => c.CY))
            {
                var row = rows.LastOrDefault();
                if (row != null && c.CY < row.Max(x => x.B) && c.CY > row.Min(x => x.Y)) row.Add(c);
                else
                {
                    if (row != null && c.Y - row.Max(x => x.B) > 0.03)
                    {
                        // แถวสั้นๆ แถวแรกที่อยู่ห่างจากเนื้อหา = เศษหัวช่อง (เช่น "kos." ของ "Gross weight, kos.") ทิ้ง แล้วอ่านต่อ
                        if (rows.Count == 1 && rows[0].Sum(x => x.Text.Length) <= 8) rows.Clear();
                        // เว้นว่างแนวตั้งเกิน ~3 บรรทัด = จบช่องนี้แล้ว (เช่น "CONTAINER NO." ท้ายช่อง Marks, ข้อความท้ายฟอร์ม)
                        else break;
                    }
                    rows.Add(new List<Chunk> { c });
                }
            }
            return rows.Select(rw => Clean(string.Join(" ", rw.OrderBy(c => c.X).Select(c => c.Text))))
                       .Where(s => s.Length > 0).ToList();
        }

        static readonly Regex AddrWord = new Regex(
            @"^(UNIT|ROOM|RM|FLAT|FLOOR|FL|LEVEL|SUITE|BLDG|BUILDING|MOO|SOI|P\.?\s?O\.?\s?BOX|NO)\b\.?", RegexOptions.IgnoreCase);
        static readonly Regex AddrNumber = new Regex(@"^\d+([/-]\d+)*[A-Z]?\s*(,|$)", RegexOptions.IgnoreCase);                 // 12,  3354/36-39,
        static readonly Regex AddrNumRoad = new Regex(@"^\d[\dA-Z/-]*\s+.*\b(ROAD|RD|STREET|ST|SOI|AVENUE|AVE|LANE|MOO|FLOOR|FL)\b", RegexOptions.IgnoreCase);
        static readonly Regex AddrSlash = new Regex(@"^\d+[/-]\d+", RegexOptions.IgnoreCase);                                    // 11/153

        /// <summary>บรรทัดที่หน้าตาเป็นที่อยู่ (ไม่ใช่ชื่อบริษัท) — เช่น "UNIT A, G/F., PHASE 2," "3354/36-39, 11TH FLOOR," "30 BOON LAY WAY"</summary>
        public static bool LooksLikeAddress(string line)
        {
            line = (line ?? "").Trim();
            if (line == "") return false;
            return AddrWord.IsMatch(line) || AddrNumber.IsMatch(line) || AddrSlash.IsMatch(line) || AddrNumRoad.IsMatch(line)
                   || Regex.IsMatch(line, @"^\d+\s+[A-Z]+(\s+[A-Z]+){0,2}\s+(WAY|ROAD|STREET|AVENUE|LANE|DRIVE|PLACE)\b", RegexOptions.IgnoreCase);
        }

        public static string Clean(string s)
        {
            if (Regex.IsMatch(s, @"[^\u0000-\u007F]"))
            {
                // เครื่องหมายกำกับที่ OCR เติมให้ตัวละติน (É Ã ฯลฯ) — ไม่แตะวรรณยุกต์/สระภาษาไทย (ตามหลังตัวอักษรละตินเท่านั้น)
                string d = s.Normalize(System.Text.NormalizationForm.FormD);
                d = Regex.Replace(d, @"(?<=[A-Za-z])\p{Mn}+", "");
                s = d.Normalize(System.Text.NormalizationForm.FormC);
            }
            s = Regex.Replace(s, @"\b[Il](?=(?:PKGS?|PALLETS?|CARTONS?|CTNS?|PCS|ROLLS?|PACKAGES?|PIECES?|BAGS?|DRUMS?|BOXES|CASES?|SET)\b)", "1");
            s = s.Replace('“', '"').Replace('”', '"').Replace('’', '\'').Replace('‘', '\'').Replace('�', ' ');
            // O ที่อยู่ในตัวเลข → 0  (5,232.OOOKGS → 5,232.000KGS)
            string prev;
            do { prev = s; s = Regex.Replace(s, @"(?<=\d[.,]?)O", "0"); } while (s != prev);
            s = Regex.Replace(s, @"\bGROUP\s+(1{1,3})\b", m => "GROUP " + new string('I', m.Groups[1].Value.Length), RegexOptions.IgnoreCase);
            s = Regex.Replace(s, @"(?<![\w.])1(?=\.[A-Z]\.)", "I");     // 1.T.C.H.S → I.T.C.H.S
            s = Regex.Replace(s, @"\s{2,}", " ");
            return s.Trim();
        }

        static string Memo(List<string> lines)
        {
            // รูปแบบเดียวกับที่ frmSFBL บันทึก: ทุกบรรทัดลงท้าย CRLF
            return lines.Count == 0 ? "" : string.Join("\r\n", lines) + "\r\n";
        }

        // ---------------- วันที่ ----------------
        const string Mon = "(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)";
        static readonly Regex DateRx = new Regex(
            @"(?<d>(?<!\d)\d{4}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{1,2}(?!\d)" +                                  // 2026/05/01
            @"|" + Mon + @"[A-Z]*\.?\s*\d{1,2}\s*,?\s*\d{4}" +                                                  // NOVEMBER 29,2016
            @"|(?<!\d)\d{1,2}\s*[-/. ]?\s*" + Mon + @"[A-Z]*\.?\s*[-/., ]?\s*\d{2,4}" +                         // 03-MAY-2026
            @"|(?<!\d)\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}(?!\d))", RegexOptions.IgnoreCase);                        // 26/05/2026

        public static string ParseDate(string s) { return ParseDate(s, null); }

        static readonly string[] MonthNames = { "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC" };

        /// <summary>เดือน 3 ตัวอักษรที่พิมพ์สลับตำแหน่งตัวอักษร (เช่น "27-ARP,2026" ที่ถูกคือ APR) → แก้เป็นชื่อเดือนที่ถูก</summary>
        static string FixMonthTypos(string s)
        {
            return Regex.Replace(s ?? "", @"(?<=\d[\s,./-]*)([A-Za-z]{3})(?=[\s,./-]*\d)", m =>
            {
                string tok = m.Value.ToUpperInvariant();
                if (MonthNames.Contains(tok)) return m.Value;
                string sorted = new string(tok.OrderBy(c => c).ToArray());
                var hit = MonthNames.Where(mn => new string(mn.OrderBy(c => c).ToArray()) == sorted).ToList();
                return hit.Count == 1 ? hit[0] : m.Value;
            });
        }

        public static string ParseDate(string s, string[] extraFormats)
        {
            s = FixMonthTypos(s);
            var m = DateRx.Match(s ?? "");
            if (!m.Success) return "";
            var ci = CultureInfo.InvariantCulture;
            DateTime dt;
            string raw = Regex.Replace(m.Groups["d"].Value.Trim(), @"\s+", " ");
            if (extraFormats != null && extraFormats.Length > 0 && DateTime.TryParseExact(raw, extraFormats, ci, DateTimeStyles.AllowWhiteSpaces, out dt))
                return dt.ToString("yyyy-MM-dd");
            var my = Regex.Match(raw, @"^(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})$");
            if (my.Success)
                return DateTime.TryParseExact(my.Groups[1].Value + "/" + my.Groups[2].Value + "/" + my.Groups[3].Value, "yyyy/M/d", ci, DateTimeStyles.None, out dt) ? dt.ToString("yyyy-MM-dd") : "";

            string t = Regex.Replace(raw.ToUpperInvariant(), @"[.,]", " ");
            t = Regex.Replace(t, @"\s+", " ").Trim();
            t = Regex.Replace(t, @"(?<=\d)[-/](?=[A-Z])", " ");
            t = Regex.Replace(t, @"(?<=[A-Z])[-/](?=\d)", " ");
            t = Regex.Replace(t, @"(\d)([A-Z])", "$1 $2");
            t = Regex.Replace(t, @"([A-Z])(\d)", "$1 $2");
            string[] fmts = { "MMMM d yyyy", "MMM d yyyy", "d MMMM yyyy", "d MMM yyyy", "d MMM yy", "d MMMM yy",
                              "d/M/yyyy", "d-M-yyyy", "d M yyyy", "d/M/yy", "d-M-yy" };
            string t2 = Regex.Replace(t, @"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$", "$1/$2/$3");
            // ชื่อเดือนแบบย่อ 4 ตัว เช่น SEPT
            t2 = Regex.Replace(t2, @"\bSEPT\b", "SEP");
            if (DateTime.TryParseExact(t2, fmts, ci, DateTimeStyles.AllowWhiteSpaces, out dt))
                return dt.ToString("yyyy-MM-dd");
            return "";
        }

        // ---------------- เรือ/voyage ----------------
        static void SplitVoyage(string text, out string name, out string voy)
        {
            text = (text ?? "").Trim();
            var m = Regex.Match(text, @"^(?<n>.+?)\s*\b(?:V|VOY|VOYAGE)\s*[.:]?\s*(?<v>[A-Z0-9][A-Z0-9\-/]*)\s*$", RegexOptions.IgnoreCase);
            if (m.Success && m.Groups["n"].Value.Trim().Length > 0) { name = m.Groups["n"].Value.Trim(); voy = m.Groups["v"].Value.Trim().ToUpperInvariant(); return; }
            // ไม่มีตัวคั่น "V." — โทเค็นท้ายที่ปนตัวอักษรกับตัวเลข (S057, 2609S, 1076E) คือ voyage ส่วนตัวเลขล้วน (177) เป็นส่วนของชื่อเรือ
            var m2 = Regex.Match(text, @"^(?<n>.+\S)\s+(?<v>(?=[A-Z0-9\-]*\d)(?=[A-Z0-9\-]*[A-Z])[A-Z0-9\-]{3,8})$", RegexOptions.IgnoreCase);
            if (m2.Success) { name = m2.Groups["n"].Value.Trim(); voy = m2.Groups["v"].Value.ToUpperInvariant(); return; }
            name = text; voy = "";
        }

        // ---------------- ตัวเลข ----------------
        // OCR ฟอนต์กว้างมักเว้นวรรคหลังจุดทศนิยม ("1. 516CBM") และอ่านเลข 0 เป็นตัว O ("128. OOKGS") — แก้เฉพาะตัวเลขที่ตามด้วยหน่วย
        public static string NormNumbers(string s)
        {
            s = Regex.Replace(s ?? "", @"(?<=[\dOoIl])\s*([.,])\s*(?=[\dOoIl])", "$1");
            // ตัวเลขที่ตามด้วยหน่วย: O→0, I/l→1 (OCR อ่าน 802.100 เป็น 802.IOO)
            s = Regex.Replace(s, @"(?<![A-Za-z])[\dOoIl][\dOoIl.,]*(?=\s*(?:KGS?|KILOS?|CBM|M3|PKGS?)\b)",
                m => m.Value.Any(char.IsDigit) ? m.Value.Replace('O', '0').Replace('o', '0').Replace('I', '1').Replace('l', '1') : m.Value, RegexOptions.IgnoreCase);
            return s;
        }

        static string CleanUnit(string u)
        {
            u = Regex.Replace((u ?? "").Trim(), @"\s*\(\s*S\s*\)", "", RegexOptions.IgnoreCase);
            return u.Trim().ToUpperInvariant();
        }

        static readonly Regex SummaryLine = new Regex(
            @"(?<q>\d[\d,]*)\s*(?<u>PKGS?|PACKAGES?|PALLETS?|CARTONS?|CTNS?|ROLLS?|PIECES?|PCS|BAGS?|DRUMS?|BOXES|CASES?)\s*(?:\(\s*S\s*\))?\s*/\s*(?<w>[\dOo.,\s]+?)\s*KGS?\s*/\s*(?<c>[\dOo.,\s]+?)\s*CBM",
            RegexOptions.IgnoreCase);

        static void Party(ParseResult r, string key, string nameCol, string addCol)
        {
            var ls = LinesOf(r, key);
            if (ls.Count == 0) return;
            r.Values[nameCol] = ls[0];
            r.Values[addCol] = Memo(ls);    // S_ADD/C_ADD/N_ADD เก็บชื่อบรรทัดแรกด้วย (เหมือนข้อมูลเดิม)
        }

        static string TermFrom(string text, Template t)
        {
            foreach (var kv in t.Terms)
                if (Regex.IsMatch(text, Regex.Escape(kv.Key).Replace("\\ ", @"\s*"), RegexOptions.IgnoreCase)) return kv.Value;
            var cy = Regex.Match(text, @"\b(CY|CFS|DOOR)\s*[/-]\s*(CY|CFS|DOOR)\b", RegexOptions.IgnoreCase);
            return cy.Success ? (cy.Groups[1].Value + "/" + cy.Groups[2].Value).ToUpperInvariant() : "";
        }

        static void Extract(ParseResult r, Template tpl, List<LabelDef> defs)
        {
            var v = r.Values;
            var bl = LinesOf(r, "BLNO");
            if (bl.Count > 0) v["BLNO"] = Regex.Replace(bl[0], @"\s+", "");

            Party(r, "SHIPPER", "SHIPPERNAME", "S_ADD");
            Party(r, "CONSIGNEE", "CONSIGNEENAME", "C_ADD");
            Party(r, "NOTIFY", "NOTIFYNAME", "N_ADD");

            var ag = LinesOf(r, "AGENT");
            if (ag.Count > 0)
            {
                v["AGENTNAME"] = ag[0];      // กติกาเดียวกับคู่ค้าอื่น: ชื่อ = บรรทัดแรกที่ scan ได้
                v["A_ADD"] = Memo(ag);
            }

            string n, voy;
            var fd = LinesOf(r, "FEEDER");
            if (fd.Count > 0) { SplitVoyage(fd[0], out n, out voy); v["FEEDER"] = n; v["F_VOY"] = voy; }
            var vs = LinesOf(r, "VESSEL");
            if (vs.Count > 0) { SplitVoyage(vs[0], out n, out voy); v["VESSEL"] = n; v["V_VOY"] = voy; }
            var vy = LinesOf(r, "VOYAGE");
            if (vy.Count > 0 && Fields.Val(v, "V_VOY") == "") v["V_VOY"] = Regex.Replace(vy[0], @"\s+", "").ToUpperInvariant();

            Func<string, string> first = k => { var l = LinesOf(r, k); return l.Count > 0 ? l[0] : ""; };
            v["RECPORTNAME"] = first("RECEIPT");
            v["LOADPORTNAME"] = first("LOADPORT");
            v["DISPORTNAME"] = first("DISPORT");
            v["DELPORTNAME"] = first("DELIVERY");
            v["FINALPORTNAME"] = first("FINALDEST");

            var orig = string.Join(" ", LinesOf(r, "NOOFORIG"));
            var mo = Regex.Match(orig, @"\d+");
            if (mo.Success) v["BLCOPY"] = mo.Value;
            else
            {
                string[] words = { "ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE" };
                int ix = Array.FindIndex(words, w => orig.ToUpperInvariant().Contains(w));
                if (ix > 0) v["BLCOPY"] = ix.ToString();
            }

            // ข้อความทั้งหน้า (รวมก้อนที่ไม่มีเจ้าของ) สำหรับ pattern ที่อยู่ได้หลายที่ เช่น "SHIPPED ON BOARD 03-MAY-2026"
            string all = string.Join("\n", r.AllChunks.OrderBy(c => c.Y).ThenBy(c => c.X).Select(c => Clean(c.Text)));
            string flat = Regex.Replace(all, @"\s+", " ");

            v["MARKDESC"] = Memo(LinesOf(r, "MARKS"));

            // Container List: กรอบดึงค่า CTNNO ของ Template = ตามที่ scan ได้; ไม่งั้นเก็บเฉพาะเลขตู้มาตรฐาน (4 ตัวอักษรลงท้าย U/J/Z + เลข 7 หลัก) จากช่อง Container/Marks บรรทัดละเลข
            if (tpl.Areas.ContainsKey("CTNNO")) v["CTNLIST"] = Memo(LinesOf(r, "CTNNO"));
            else
            {
                var ctnText = string.Join("\n", LinesOf(r, "CTNNO").Concat(LinesOf(r, "MARKS")));
                var ctns = Regex.Matches(ctnText.ToUpperInvariant(), @"\b[A-Z]{3}[UJZ]\s?\d{7}\b").Cast<Match>()
                                .Select(m => Regex.Replace(m.Value, @"\s+", "")).Distinct().ToList();
                if (ctns.Count > 0) v["CTNLIST"] = string.Join("\n", ctns);
            }
            var goods = LinesOf(r, "DESC");
            goods.RemoveAll(l => Regex.IsMatch(l, @"^(CY|CFS|DOOR)\s*[/-]\s*(CY|CFS|DOOR)$", RegexOptions.IgnoreCase));    // บรรทัด "CFS-CFS" ไม่ใช่รายละเอียดสินค้า
            foreach (var kv in tpl.Terms) goods.RemoveAll(l => string.Equals(l.Trim(), kv.Key, StringComparison.OrdinalIgnoreCase));
            v["GOODS"] = Memo(goods);

            var pk = string.Join(" ", LinesOf(r, "PKGS"));
            var mp = Regex.Match(pk, @"(?<q>\d[\d,]*)\s*(?<u>[A-Z][A-Z()' ]*)", RegexOptions.IgnoreCase);
            if (mp.Success)
            {
                v["PKGQTY"] = mp.Groups["q"].Value.Replace(",", "");
                v["PKGUNIT"] = CleanUnit(mp.Groups["u"].Value);
            }

            // น้ำหนัก/ปริมาตร — ดูในคอลัมน์ Gross Weight / Measurement ก่อน แล้วสำรองด้วยบรรทัดสรุป "1PKGS / 469.000KGS / 4.069CBM"
            string wm = NormNumbers(string.Join(" ", LinesOf(r, "GW").Concat(LinesOf(r, "MEAS"))));
            var mg = Regex.Match(wm, @"(\d[\d,]*(?:\.\d+)?)\s*(?:KGS?|KILOS?)\b", RegexOptions.IgnoreCase);
            if (mg.Success) v["GW"] = mg.Groups[1].Value.Replace(",", "");
            var mc = Regex.Match(wm, @"(\d[\d,]*(?:\.\d+)?)\s*(?:CBM|M3|CU\.?\s*M)\b", RegexOptions.IgnoreCase);
            if (mc.Success) v["CBM"] = mc.Groups[1].Value.Replace(",", "");
            if (Fields.Val(v, "GW") == "" || Fields.Val(v, "CBM") == "" || Fields.Val(v, "PKGQTY") == "")
            {
                var sm = SummaryLine.Match(NormNumbers(flat));
                if (sm.Success)
                {
                    if (Fields.Val(v, "PKGQTY") == "") { v["PKGQTY"] = sm.Groups["q"].Value.Replace(",", ""); v["PKGUNIT"] = CleanUnit(sm.Groups["u"].Value); }
                    if (Fields.Val(v, "GW") == "") v["GW"] = NormNumbers(sm.Groups["w"].Value + "KGS").Replace("KGS", "").Replace(",", "").Replace(" ", "");
                    if (Fields.Val(v, "CBM") == "") v["CBM"] = NormNumbers(sm.Groups["c"].Value + "CBM").Replace("CBM", "").Replace(",", "").Replace(" ", "");
                }
            }

            var totLabel = r.Labels.FirstOrDefault(l => l.Key == "TOTALPKG");
            var tp = totLabel == null ? LinesOf(r, "TOTALPKG")
                   : LinesOf(r, "TOTALPKG", c => c.Mono && c.Y <= totLabel.Y + 0.035 && c.Y >= totLabel.Y - 0.012);   // ค่า = ข้อความฟอนต์ monospace บนแถวหัวช่อง ไม่เอาบรรทัดต่อของหัวช่อง
            tp = tp.Where(l => !Regex.IsMatch(l, @"\b(or other packages|or units received|received by the|carrier\s*\(in words\)|\(in words\))", RegexOptions.IgnoreCase)).ToList();
            if (tp.Count > 0)
                v["PKGWORD"] = Regex.Replace(string.Join(" ", tp), @"\(TOTAL\s*[.:;,]?\s*", "(TOTAL : ", RegexOptions.IgnoreCase);

            string term = TermFrom(flat, tpl);
            if (term != "") v["CYTERM"] = term;
            if (Regex.IsMatch(flat, @"FREIGHT\s+PRE-?PAID", RegexOptions.IgnoreCase)) v["CHGTERM"] = "PP";
            else if (Regex.IsMatch(flat, @"FREIGHT\s+COLLECT", RegexOptions.IgnoreCase)) v["CHGTERM"] = "CC";
            var fr = LinesOf(r, "FREIGHT");
            if (fr.Count > 0) v["BILLDESC"] = fr[0].Trim('"', ' ');

            // วันที่ขึ้นเรือ: หัวช่อง "On Board Date" ก่อน แล้วสำรองด้วยข้อความ "ON BOARD ..." ที่ใดก็ได้ในหน้า
            string etd = ParseDate(string.Join(" ", LinesOf(r, "ONBOARD")), tpl.DateFormats);
            if (etd == "")
            {
                var ob = Regex.Match(flat, @"(?:SHIPPED\s+)?ON\s*BOARD\s*(?:DATE)?\s*[:.]?\s*(?<d>.{6,24})", RegexOptions.IgnoreCase);
                if (ob.Success) etd = ParseDate(ob.Groups["d"].Value, tpl.DateFormats);
            }
            if (etd != "") v["ETD"] = etd;

            // Place and date of issue: เอาเฉพาะบรรทัดของช่องนี้ ตัดที่บรรทัดผู้ออก/ลายเซ็น ("FOR ... AS CARRIER")
            var issLines = LinesOf(r, "ISSUE");
            int stop = issLines.FindIndex(l => Regex.IsMatch(l, @"^(FOR\b|AS\s+(CARRIER|AGENT)|SIGNED|BY\b)", RegexOptions.IgnoreCase));
            if (stop >= 0) issLines = issLines.Take(stop).ToList();
            // ช่องนี้คือ "สถานที่ + วันที่": ถ้ามีแถวที่มีวันที่ ใช้ถึงแถวนั้น ไม่งั้นใช้แถวแรกแถวเดียว (แถวต่อไปมักเป็นชื่อผู้ออก)
            int dateRow = issLines.FindIndex(l => DateRx.IsMatch(l));
            issLines = dateRow >= 0 ? issLines.Take(dateRow + 1).ToList() : issLines.Take(1).ToList();
            string iss = string.Join(" ", issLines);
            if (iss.Length > 0)
            {
                var md = DateRx.Match(iss);
                if (md.Success)
                {
                    v["ISSUDATE"] = ParseDate(md.Value, tpl.DateFormats);
                    v["ISSUPLACE"] = iss.Substring(0, md.Index).Trim(' ', ',', '.');
                }
                else v["ISSUPLACE"] = iss;
            }
            var pay = LinesOf(r, "PAYABLEAT");
            if (pay.Count > 0) v["PAYABLEAT"] = pay[0];
            var sg = LinesOf(r, "SIGNED");
            if (sg.Count > 0) v["SIGNEDBY"] = Regex.Replace(sg[0], @"^.*\bcarrier\s*:?\s*", "", RegexOptions.IgnoreCase).Trim('"', ' ', ':');

            foreach (var k in v.Keys.ToList()) if (v[k] == null) v[k] = "";
            // กติกา "คัดลอก" ของ Template: ช่องปลายทางที่อ่านไม่ได้ ใช้ค่าของช่องต้นทาง (เช่น Final destination = Place of delivery)
            foreach (var kv in tpl.Copy)
                if (Fields.Val(v, kv.Key).Trim() == "" && Fields.Val(v, kv.Value).Trim() != "") v[kv.Key] = v[kv.Value];
            foreach (var lab in defs)
                if (!r.Labels.Any(l => l.Key == lab.Key) && !OptionalLabels.Contains(lab.Key) && !lab.Key.StartsWith("_"))
                    r.Notes.Add("ไม่พบหัวช่อง: " + lab.Phrases[0]);
        }
    }
}
