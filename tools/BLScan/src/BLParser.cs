// แปลงคำจาก OCR (พร้อมตำแหน่ง) เป็น field ของ House B/L
// หลักการ: หา "หัวช่อง" (label) ที่พิมพ์บนฟอร์ม เช่น Shipper / Port of Loading แล้วจับข้อความที่อยู่ใต้ (หรือขวา) label นั้น
// ไม่ผูกกับพิกัดของฟอร์มใดฟอร์มหนึ่ง — ฟอร์ม B/L ของสายเรือ/forwarder ส่วนใหญ่ใช้หัวช่องชุดเดียวกัน
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
        public string Key { get { return Def.Key; } }
        public double CX { get { return (X + R) / 2; } }
    }

    public class Chunk
    {
        public List<OcrWord> Words = new List<OcrWord>();
        public string Text;
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
        public List<string> Notes = new List<string>();
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
            new LabelDef("LOADPORT", false, "Port of Loading"),
            new LabelDef("DISPORT", false, "Port of Discharge"),
            new LabelDef("DELIVERY", false, "Place of Delivery"),
            new LabelDef("FINALDEST", false, "Final Destination"),
            new LabelDef("NOOFORIG", false, "No. of original", "Number of original"),
            new LabelDef("MARKS", false, "Marks and numbers", "Marks and Nos", "Marks & Nos", "Marks & Numbers", "Container No./Seal No"),
            new LabelDef("PKGS", false, "Number and Type", "Number and kind of packages", "No. of Pkgs", "No. of packages"),
            new LabelDef("DESC", false, "Description of Goods", "Description of Packages and Goods", "Description"),
            new LabelDef("GW", false, "Gross Weight"),
            new LabelDef("MEAS", false, "Measurement"),
            new LabelDef("CTNNO", false, "Container No"),
            new LabelDef("TOTALPKG", true, "Total Number of Containers", "Total No. of Containers", "Total number of packages"),
            new LabelDef("PAYABLEAT", true, "Freight and Charges Payable at", "Freight Payable at", "Payable at"),
            new LabelDef("FREIGHT", false, "Freight and Charges", "Freight & Charges"),
            new LabelDef("AGENT", false, "Carrier's Agent as Destination", "Carrier's Agent at Destination", "Carrier's Agent","Delivery Agent", "For delivery of goods please apply to", "For delivery please apply to"),
            new LabelDef("ISSUE", true, "Place and date of issue", "Place & date of issue"),
            new LabelDef("EXCESS", false, "Excess value declaration"),
            new LabelDef("SIGNED", true, "Signed on behalf of the Carrier", "Signed for the carrier", "Signed as agent", "Signed on behalf"),
            new LabelDef("ASAGENT", true, "As agents for the carrier", "As agent for the carrier", "As carrier"),
        };

        // ข้อความที่พิมพ์ประกอบหัวช่อง (บรรทัดที่ 2 ของ label) — ตัดทิ้งเมื่ออยู่ใกล้ label
        static readonly string[] NoisePhrases =
        {
            "(For The Merchants Reference Only)", "For The Merchants Reference Only",
            "of Packages (In Words)", "of Packages", "Metric Tons", "M 3", "SAID TO CONTAIN", "SAID TO CONTAIN:-",
            "Particulars as declared by shipper", "Particulars furnished by shipper",
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
            return want.Length >= 6 && Lev(ocr, want) <= 1;
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

        public static ParseResult Parse(OcrPage page)
        {
            var res = new ParseResult();
            var words = page.Words.Where(w => w.Text.Trim().Length > 0).ToList();
            double medH = Median(words.Select(w => w.H));
            double aspect = page.PixelHeight > 0 ? (double)page.PixelHeight / page.PixelWidth : 1.414;

            // ---------- 1) หา label ----------
            var lines = words.GroupBy(w => w.LineNo).Select(g => g.OrderBy(w => w.X).ToList()).ToList();
            var used = new HashSet<OcrWord>();
            // phrase ยาวก่อน — "Freight and Charges Payable at" ต้องได้ก่อน "Freight and Charges"
            var order = Labels.SelectMany(d => d.Phrases.Select(p => new { Def = d, Phrase = p, Tok = Tokens(p) }))
                              .OrderByDescending(x => x.Tok.Length).ThenByDescending(x => x.Phrase.Length).ToList();
            // จัดลำดับ key ตาม phrase ที่ยาวที่สุดของ key นั้น แต่ภายใน key ให้ทุก phrase แข่งกัน
            // (ไม่งั้น "number of Original" ในข้อความเงื่อนไขจะชนะ "No. of original" ที่เป็นหัวช่องจริง)
            var keyOrder = order.Select(x => x.Def).Distinct().ToList();
            foreach (var def in keyOrder)
            {
                FoundLabel best = null; bool bestStart = false; int[] bestRange = null; List<OcrWord> bestLine = null;
                foreach (var item in order.Where(x => x.Def == def))
                foreach (var line in lines)
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

            // ---------- 1b) label ที่ OCR อ่านไม่ออก → อนุมานตำแหน่งจากช่องข้างเคียง (คอลัมน์เดียวกัน, แถวเดียวกัน) ----------
            InferMissing(res);

            // ---------- 2) ตัดคำประกอบหัวช่อง (noise) ที่อยู่ติดใต้ label ----------
            foreach (var np in NoisePhrases.OrderByDescending(p => p.Length))
            {
                var tok = Tokens(np);
                foreach (var line in lines)
                    foreach (var hit in FindPhrase(line, tok, used))
                    {
                        var w0 = line[hit[0]];
                        bool nearLabel = res.Labels.Any(l => w0.Y - l.B < 0.03 && w0.Y >= l.Y - 0.005 && w0.X < l.R + 0.05 && w0.R > l.X - 0.12);
                        if (nearLabel || tok.Length >= 3)
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
            double gapSplit = 0.035;
            var chunks = new List<Chunk>();
            foreach (var row in rows)
            {
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
                        // ขอบซ้ายของ label ที่อยู่เหนือแถวนี้ = ขอบคอลัมน์ (ต้องมีช่องว่างมากกว่าเว้นวรรคปกติด้วย
                        // เพราะ label บางช่องจัดกึ่งกลาง เช่น "Marks and numbers" ขอบซ้ายตกกลางข้อความ)
                        else if (b.X - a.R > 0.015 && res.Labels.Any(l => !l.Def.Inline && l.X > a.R - 0.002 && l.X <= b.X + 0.01 && rowY - l.B > -0.002 && rowY - l.B < 0.08))
                            split = true;
                        // label บนแถวเดียวกัน (inline) ก็เป็นขอบ
                        else if (res.Labels.Any(l => l.X > a.R - 0.002 && l.X <= b.X && Math.Abs(l.Y - a.Y) < medH))
                            split = true;
                    }
                    if (split) { cur = new Chunk(); chunks.Add(cur); }
                    cur.Words.Add(ws[i]);
                }
            }
            foreach (var c in chunks) c.Text = JoinWords(c.Words, medH, aspect);

            // ตัดเศษตัวอักษรเดี่ยว (มักเป็นข้อความแนวตั้งข้างฟอร์ม เช่น "Particulars as declared by shipper")
            chunks.RemoveAll(c => c.Words.Count == 1 && c.Text.Length == 1 && !char.IsDigit(c.Text[0]));

            // ลายน้ำ ORIGINAL / COPY → BLTYPE
            foreach (var c in chunks.ToList())
            {
                string t = c.Text.Trim().ToUpperInvariant();
                var bt = BLTypeWords.FirstOrDefault(x => t == x);
                if (bt != null) { res.Values["BLTYPE"] = bt; chunks.Remove(c); }
            }

            // ---------- 4) ผูก chunk เข้ากับ label ----------
            foreach (var c in chunks)
            {
                // 4a) inline: อยู่ขวามือบรรทัดเดียวกับ label
                var inl = res.Labels.Where(l => l.Def.Inline && c.X >= l.R - 0.005 && c.X - l.R < 0.6
                                                && c.CY >= l.Y - medH * 0.6 && c.CY <= l.B + medH * 1.6)
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
                    var win = votes.OrderByDescending(v => v.Value).First().Key;
                    foreach (var c in cl) c.Owner = win;
                }
            }

            foreach (var c in chunks.Where(c => c.Owner != null).OrderBy(c => c.Y).ThenBy(c => c.X))
            {
                if (!res.ByLabel.ContainsKey(c.Owner.Key)) res.ByLabel[c.Owner.Key] = new List<Chunk>();
                res.ByLabel[c.Owner.Key].Add(c);
            }

            Extract(res);
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

        static void InferMissing(ParseResult res)
        {
            foreach (var s in Siblings)
            {
                if (res.Labels.Any(l => l.Key == s[0])) continue;
                var col = res.Labels.FirstOrDefault(l => l.Key == s[1]);
                var row = res.Labels.FirstOrDefault(l => l.Key == s[2]);
                if (col == null || row == null) continue;
                var def = Labels.First(d => d.Key == s[0]);
                res.Labels.Add(new FoundLabel { Def = def, X = col.X, R = col.X + 0.04, Y = row.Y, B = row.B });
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

        /// <summary>
        /// ต่อคำ — OCR แยกคำที่จริงติดกัน เช่น "P/" "SIN..." , "A." "T." "L" → เทียบช่องว่างกับความกว้างตัวอักษร
        /// คำที่ลงท้าย . / : - (ตัวย่อ เลขที่) ยอมให้ช่องว่างกว้างกว่าปกติแล้วยังต่อติด
        /// </summary>
        static string JoinWords(List<OcrWord> ws, double medH, double aspect)
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
                    if (!join) sb.Append(' ');
                }
                sb.Append(ws[i].Text);
            }
            return sb.ToString();
        }

        // ---------------- แปลงเป็นค่า field ----------------

        static List<string> LinesOf(ParseResult r, string key)
        {
            List<Chunk> cs;
            if (!r.ByLabel.TryGetValue(key, out cs)) return new List<string>();
            // chunk แถวเดียวกันต่อกันด้วยช่องว่าง, ต่างแถวขึ้นบรรทัดใหม่
            var rows = new List<List<Chunk>>();
            foreach (var c in cs.OrderBy(c => c.CY))
            {
                var row = rows.LastOrDefault();
                if (row != null && c.CY < row.Max(x => x.B) && c.CY > row.Min(x => x.Y)) row.Add(c);
                else
                {
                    // เว้นว่างแนวตั้งเกิน ~3 บรรทัด = จบช่องนี้แล้ว (เช่น "CONTAINER NO." ท้ายช่อง Marks, ข้อความท้ายฟอร์ม)
                    if (row != null && c.Y - row.Max(x => x.B) > 0.03) break;
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

        static readonly Regex DateRx = new Regex(
            @"(?<d>(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\.?\s*\d{1,2}\s*,?\s*\d{4}" +
            @"|\d{1,2}\s*[-/. ]?\s*(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\.?\s*[-/., ]?\s*\d{2,4}" +
            @"|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})", RegexOptions.IgnoreCase);

        public static string ParseDate(string s)
        {
            var m = DateRx.Match(s ?? "");
            if (!m.Success) return "";
            string t = Regex.Replace(m.Groups["d"].Value.ToUpperInvariant(), @"[.,]", " ");
            t = Regex.Replace(t, @"\s+", " ").Trim();
            t = Regex.Replace(t, @"(\d)([A-Z])", "$1 $2");
            t = Regex.Replace(t, @"([A-Z])(\d)", "$1 $2");
            string[] fmts = { "MMMM d yyyy", "MMM d yyyy", "d MMMM yyyy", "d MMM yyyy", "d MMM yy", "d MMMM yy",
                              "d/M/yyyy", "d-M-yyyy", "d M yyyy", "d/M/yy", "d-M-yy" };
            DateTime dt;
            var ci = CultureInfo.InvariantCulture;
            string t2 = Regex.Replace(t, @"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$", "$1/$2/$3");
            // ชื่อเดือนแบบย่อ 4 ตัว เช่น SEPT
            t2 = Regex.Replace(t2, @"\bSEPT\b", "SEP");
            if (DateTime.TryParseExact(t2, fmts, ci, DateTimeStyles.AllowWhiteSpaces, out dt))
                return dt.ToString("yyyy-MM-dd");
            return "";
        }

        static void SplitVoyage(string text, out string name, out string voy)
        {
            var m = Regex.Match(text, @"^(?<n>.+?)\s*\b(?:V|VOY|VOYAGE)\s*[.:]?\s*(?<v>[A-Z0-9][A-Z0-9\-/]*)\s*$", RegexOptions.IgnoreCase);
            if (m.Success) { name = m.Groups["n"].Value.Trim(); voy = m.Groups["v"].Value.Trim().ToUpperInvariant(); }
            else { name = text.Trim(); voy = ""; }
        }

        static string Num(string s)
        {
            var m = Regex.Match(s ?? "", @"\d[\d,]*(?:\.\d+)?");
            return m.Success ? m.Value.Replace(",", "") : "";
        }

        static void Party(ParseResult r, string key, string nameCol, string addCol)
        {
            var ls = LinesOf(r, key);
            if (ls.Count == 0) return;
            r.Values[nameCol] = ls[0];
            r.Values[addCol] = Memo(ls);    // S_ADD/C_ADD/N_ADD เก็บชื่อบรรทัดแรกด้วย (เหมือนข้อมูลเดิม)
        }

        static void Extract(ParseResult r)
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

            Func<string, string> first = k => { var l = LinesOf(r, k); return l.Count > 0 ? l[0] : ""; };
            v["RECPORTNAME"] = first("RECEIPT");
            v["LOADPORTNAME"] = first("LOADPORT");
            v["DISPORTNAME"] = first("DISPORT");
            v["DELPORTNAME"] = first("DELIVERY");
            v["FINALPORTNAME"] = first("FINALDEST");

            var orig = first("NOOFORIG");
            var mo = Regex.Match(orig, @"\d+");
            if (mo.Success) v["BLCOPY"] = mo.Value;
            else
            {
                string[] words = { "ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE" };
                int ix = Array.FindIndex(words, w => orig.ToUpperInvariant().Contains(w));
                if (ix > 0) v["BLCOPY"] = ix.ToString();
            }

            v["MARKDESC"] = Memo(LinesOf(r, "MARKS"));
            v["GOODS"] = Memo(LinesOf(r, "DESC"));

            var pk = string.Join(" ", LinesOf(r, "PKGS"));
            var mp = Regex.Match(pk, @"(?<q>\d[\d,]*)\s*(?<u>[A-Z][A-Z()' ]*)", RegexOptions.IgnoreCase);
            if (mp.Success)
            {
                v["PKGQTY"] = mp.Groups["q"].Value.Replace(",", "");
                v["PKGUNIT"] = mp.Groups["u"].Value.Trim().ToUpperInvariant();
            }

            // น้ำหนัก/ปริมาตร — ดูในคอลัมน์ Gross Weight / Measurement ก่อน
            string wm = string.Join(" ", LinesOf(r, "GW").Concat(LinesOf(r, "MEAS")));
            var mg = Regex.Match(wm, @"(\d[\d,]*(?:\.\d+)?)\s*(?:KGS?|KILOS?)\b", RegexOptions.IgnoreCase);
            if (mg.Success) v["GW"] = mg.Groups[1].Value.Replace(",", "");
            var mc = Regex.Match(wm, @"(\d[\d,]*(?:\.\d+)?)\s*(?:CBM|M3|CU\.?\s*M)\b", RegexOptions.IgnoreCase);
            if (mc.Success) v["CBM"] = mc.Groups[1].Value.Replace(",", "");

            var tp = LinesOf(r, "TOTALPKG");
            if (tp.Count > 0)
                v["PKGWORD"] = Regex.Replace(string.Join(" ", tp), @"\(TOTAL\s*[.:;,]?\s*", "(TOTAL : ", RegexOptions.IgnoreCase);

            // ข้อความทั้งหน้า (ไม่รวมหัวช่อง) สำหรับ pattern ที่อยู่ได้หลายที่
            string all = string.Join("\n", r.ByLabel.Values.SelectMany(cs => cs).Select(c => Clean(c.Text)));
            var cy = Regex.Match(all, @"\b(CY|CFS|DOOR)\s*/\s*(CY|CFS|DOOR)\b", RegexOptions.IgnoreCase);
            if (cy.Success) v["CYTERM"] = (cy.Groups[1].Value + "/" + cy.Groups[2].Value).ToUpperInvariant();
            if (Regex.IsMatch(all, @"FREIGHT\s+PRE-?PAID", RegexOptions.IgnoreCase)) v["CHGTERM"] = "PP";
            else if (Regex.IsMatch(all, @"FREIGHT\s+COLLECT", RegexOptions.IgnoreCase)) v["CHGTERM"] = "CC";
            var fr = LinesOf(r, "FREIGHT");
            if (fr.Count > 0) v["BILLDESC"] = fr[0].Trim('"', ' ');

            string flat = Regex.Replace(all, @"\s+", " ");
            var ob = Regex.Match(flat, @"(?:SHIPPED\s+)?ON\s*BOARD\s*(?:DATE)?\s*[:.]?\s*(?<d>.{6,24})", RegexOptions.IgnoreCase);
            if (ob.Success) { var d = ParseDate(ob.Groups["d"].Value); if (d != "") v["ETD"] = d; }

            var iss = string.Join(" ", LinesOf(r, "ISSUE"));
            if (iss.Length > 0)
            {
                var md = DateRx.Match(iss);
                if (md.Success)
                {
                    v["ISSUDATE"] = ParseDate(md.Value);
                    v["ISSUPLACE"] = iss.Substring(0, md.Index).Trim(' ', ',', '.');
                }
                else v["ISSUPLACE"] = iss;
            }
            var pay = LinesOf(r, "PAYABLEAT");
            if (pay.Count > 0) v["PAYABLEAT"] = pay[0];
            var sg = LinesOf(r, "SIGNED");
            if (sg.Count > 0) v["SIGNEDBY"] = Regex.Replace(sg[0], @"^.*\bcarrier\s*:?\s*", "", RegexOptions.IgnoreCase).Trim('"', ' ', ':');

            foreach (var k in v.Keys.ToList()) if (v[k] == null) v[k] = "";
            foreach (var lab in Labels)
                if (!r.Labels.Any(l => l.Key == lab.Key) && lab.Key != "CTNNO" && lab.Key != "EXCESS")
                    r.Notes.Add("ไม่พบหัวช่อง: " + lab.Phrases[0]);
        }
    }
}
