using System.Drawing;

namespace SMFDash
{
    public static class Theme
    {
        public static Color Hex(string h) { return ColorTranslator.FromHtml(h); }

        public static readonly Color Bg = Hex("#f1f5f9"), Border = Hex("#e2e8f0"), Grid = Hex("#e2e8f0"), Text = Hex("#1e293b"),
            Muted = Hex("#64748b"), Faint = Hex("#94a3b8"), Up = Hex("#059669"), Down = Hex("#dc2626"),
            Ops = Hex("#0369a1"), Acc = Hex("#047857"), Mkt = Hex("#7c3aed"), Apr = Hex("#4f46e5");

        public static readonly Font Base = new Font("Segoe UI", 9f);
        public static readonly Font Small = new Font("Segoe UI", 8f);
        public static readonly Font Bold = new Font("Segoe UI", 9f, FontStyle.Bold);
        public static readonly Font Big = new Font("Segoe UI", 18f, FontStyle.Bold);
        public static readonly Font Title = new Font("Segoe UI", 9f, FontStyle.Bold);
        public static readonly Font Section = new Font("Segoe UI", 8f, FontStyle.Bold);

        public static string Money(double v)
        {
            double a = System.Math.Abs(v);
            string s = a >= 1e6 ? (v / 1e6).ToString("0.0") + "M" : a >= 1e3 ? (v / 1e3).ToString("0.0") + "K" : v.ToString("0");
            return "฿ " + s;
        }
    }
}
