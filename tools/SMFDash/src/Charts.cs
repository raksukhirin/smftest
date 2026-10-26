// Hand-drawn GDI+ charts (no external libraries). Hover a bar / point / legend row for its value.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Linq;
using System.Windows.Forms;

namespace SMFDash
{
    public class Series
    {
        public string Name; public double[] Vals; public Color Col;
        public Series(string n, double[] v, Color c) { Name = n; Vals = v; Col = c; }
    }

    public class Slice
    {
        public string Label; public double Value; public Color Col;
        public Slice(string l, double v, string hex) { Label = l; Value = v; Col = Theme.Hex(hex); }
    }

    public abstract class ChartBase : Control
    {
        class Hit { public RectangleF R; public string T; }
        readonly List<Hit> _hits = new List<Hit>();
        readonly ToolTip _tip = new ToolTip();
        string _last;

        protected ChartBase() { DoubleBuffered = true; ResizeRedraw = true; BackColor = Color.White; Font = Theme.Small; }

        protected void AddHit(RectangleF r, string text) { _hits.Add(new Hit { R = r, T = text }); }

        protected override void OnPaint(PaintEventArgs e)
        {
            _hits.Clear();
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            e.Graphics.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
            Draw(e.Graphics);
        }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            string t = null;
            foreach (var h in _hits) if (h.R.Contains(e.Location)) { t = h.T; break; }
            if (t != _last) { _last = t; _tip.SetToolTip(this, t); }
            base.OnMouseMove(e);
        }

        protected abstract void Draw(Graphics g);

        protected static readonly StringFormat Center = new StringFormat { Alignment = StringAlignment.Center };
        protected static readonly StringFormat FarFmt = new StringFormat { Alignment = StringAlignment.Far };

        protected RectangleF Plot(float bottomExtra) { return new RectangleF(8, 8, Width - 16, Height - 26 - bottomExtra); }

        protected void GridLines(Graphics g, RectangleF p)
        {
            using (var pen = new Pen(Theme.Grid))
                foreach (float f in new[] { 0f, .5f, 1f }) g.DrawLine(pen, p.Left, p.Bottom - f * p.Height, p.Right, p.Bottom - f * p.Height);
        }

        protected void Legend(Graphics g, IList<string> names, IList<Color> cols)
        {
            float x = 8, y = Height - 16;
            for (int i = 0; i < names.Count; i++)
            {
                using (var b = new SolidBrush(cols[i])) g.FillRectangle(b, x, y + 3, 9, 9);
                g.DrawString(names[i], Font, Brushes.DimGray, x + 12, y);
                x += 12 + g.MeasureString(names[i], Font).Width + 8;
            }
        }

        protected void Label(Graphics g, string s, float cx, float y)
        {
            using (var b = new SolidBrush(Theme.Muted)) g.DrawString(s, Font, b, cx, y, Center);
        }

        public static string N(double v) { return v == Math.Floor(v) ? v.ToString("#,0") : v.ToString("#,0.0"); }
    }

    public class BarChart : ChartBase
    {
        public double[] Values; public string[] Labels; public Color Col;
        public BarChart(double[] v, string[] l, Color c) { Values = v; Labels = l; Col = c; }
        protected override void Draw(Graphics g)
        {
            var p = Plot(0); GridLines(g, p);
            double max = Values.Max() * 1.1; float bw = p.Width / Values.Length;
            using (var b = new SolidBrush(Col))
                for (int i = 0; i < Values.Length; i++)
                {
                    float h = (float)(Values[i] / max) * p.Height;
                    var r = new RectangleF(p.Left + i * bw + 4, p.Bottom - h, bw - 8, h);
                    g.FillRectangle(b, r); AddHit(r, Labels[i] + ": " + N(Values[i]));
                    Label(g, Labels[i], p.Left + i * bw + bw / 2, p.Bottom + 3);
                }
        }
    }

    public class GroupBarChart : ChartBase
    {
        public Series[] S; public string[] Labels;
        public GroupBarChart(Series[] s, string[] l) { S = s; Labels = l; }
        protected override void Draw(Graphics g)
        {
            var p = Plot(14); GridLines(g, p);
            double max = S.SelectMany(s => s.Vals).Max() * 1.1; float gw = p.Width / Labels.Length, bw = (gw - 8) / S.Length;
            for (int i = 0; i < Labels.Length; i++)
            {
                for (int k = 0; k < S.Length; k++)
                {
                    float h = (float)(S[k].Vals[i] / max) * p.Height;
                    var r = new RectangleF(p.Left + i * gw + 4 + k * bw, p.Bottom - h, bw - 1, h);
                    using (var b = new SolidBrush(S[k].Col)) g.FillRectangle(b, r);
                    AddHit(r, S[k].Name + " " + Labels[i] + ": " + N(S[k].Vals[i]));
                }
                Label(g, Labels[i], p.Left + i * gw + gw / 2, p.Bottom + 3);
            }
            Legend(g, S.Select(s => s.Name).ToList(), S.Select(s => s.Col).ToList());
        }
    }

    public class LineChart : ChartBase
    {
        public Series[] S; public string[] Labels;
        public LineChart(Series[] s, string[] l) { S = s; Labels = l; }
        protected override void Draw(Graphics g)
        {
            var p = Plot(14); GridLines(g, p);
            double max = S.SelectMany(s => s.Vals).Max() * 1.1; int n = Labels.Length;
            Func<int, float> X = i => p.Left + (float)i / (n - 1) * p.Width;
            Func<double, float> Y = v => p.Bottom - (float)(v / max) * p.Height;
            foreach (var s in S)
            {
                var pts = s.Vals.Select((v, i) => new PointF(X(i), Y(v))).ToArray();
                using (var pen = new Pen(s.Col, 2.2f)) g.DrawLines(pen, pts);
                using (var b = new SolidBrush(s.Col))
                    for (int i = 0; i < pts.Length; i++)
                    {
                        g.FillEllipse(b, pts[i].X - 3, pts[i].Y - 3, 6, 6);
                        AddHit(new RectangleF(pts[i].X - 6, pts[i].Y - 6, 12, 12), s.Name + " " + Labels[i] + ": " + N(s.Vals[i]));
                    }
            }
            for (int i = 0; i < n; i += 2) Label(g, Labels[i], X(i), p.Bottom + 3);
            Legend(g, S.Select(s => s.Name).ToList(), S.Select(s => s.Col).ToList());
        }
    }

    public class DonutChart : ChartBase
    {
        public Slice[] Rows;
        public DonutChart(Slice[] r) { Rows = r; }
        protected override void Draw(Graphics g)
        {
            double tot = Rows.Sum(r => r.Value); if (tot <= 0) return;
            float size = Math.Min(Height - 12, Width * 0.45f), pw = size * 0.17f;
            var ring = new RectangleF(8 + pw / 2, (Height - size) / 2 + pw / 2, size - pw, size - pw);
            float a = -90;
            foreach (var r in Rows)
            {
                float sweep = (float)(r.Value / tot * 360);
                using (var pen = new Pen(r.Col, pw)) g.DrawArc(pen, ring, a, Math.Max(sweep - 0.8f, 0.1f));
                a += sweep;
            }
            var tr = new RectangleF(8, (Height - size) / 2 + size / 2 - 16, size, 22);
            using (var f = new Font("Segoe UI", 13f, FontStyle.Bold)) g.DrawString(N(tot), f, Brushes.Black, tr, Center);
            g.DrawString("total", Font, Brushes.Gray, new RectangleF(8, tr.Bottom - 2, size, 14), Center);

            float x = size + 28, rowH = 22, y = (Height - rowH * Rows.Length) / 2;
            foreach (var r in Rows)
            {
                using (var b = new SolidBrush(r.Col)) g.FillRectangle(b, x, y + 5, 9, 9);
                g.DrawString(r.Label, Theme.Base, Brushes.Black, x + 14, y);
                g.DrawString(N(r.Value), Theme.Bold, Brushes.Black, new RectangleF(x, y, Width - x - 8, rowH), FarFmt);
                AddHit(new RectangleF(x, y, Width - x, rowH), r.Label + ": " + N(r.Value) + " (" + (r.Value / tot * 100).ToString("0") + "%)");
                y += rowH;
            }
        }
    }

    public class HBarList : ChartBase
    {
        public Slice[] Rows;
        public HBarList(Slice[] r) { Rows = r; }
        protected override void Draw(Graphics g)
        {
            double max = Rows.Max(r => r.Value); float y = 6, rowH = 24, lw = 100, vw = 56;
            foreach (var r in Rows)
            {
                g.DrawString(r.Label, Theme.Base, Brushes.Black, new RectangleF(4, y, lw - 4, rowH), new StringFormat { Trimming = StringTrimming.EllipsisCharacter });
                float bw = Width - lw - vw - 8;
                using (var bg = new SolidBrush(Theme.Hex("#f1f5f9"))) g.FillRectangle(bg, lw, y + 5, bw, 12);
                using (var b = new SolidBrush(r.Col)) g.FillRectangle(b, lw, y + 5, (float)(r.Value / max) * bw, 12);
                g.DrawString(N(r.Value), Theme.Bold, Brushes.Black, new RectangleF(Width - vw - 4, y, vw, rowH), FarFmt);
                AddHit(new RectangleF(0, y, Width, rowH), r.Label + ": " + N(r.Value));
                y += rowH;
            }
        }
    }

    /// <summary>Horizontal funnel bars with a % of the "Sent" stage on the right.</summary>
    public class FunnelChart : ChartBase
    {
        public Slice[] Rows; public double Base;
        public FunnelChart(Slice[] r, double baseVal) { Rows = r; Base = baseVal; }
        protected override void Draw(Graphics g)
        {
            double top = Rows.Max(r => r.Value); float y = 6, rowH = 28, lw = 70, pw = 40;
            foreach (var r in Rows)
            {
                g.DrawString(r.Label, Theme.Base, Brushes.Black, 4, y + 4);
                float bw = Width - lw - pw - 8;
                using (var bg = new SolidBrush(Theme.Hex("#f1f5f9"))) g.FillRectangle(bg, lw, y + 2, bw, 20);
                var fill = new RectangleF(lw, y + 2, (float)(r.Value / top) * bw, 20);
                using (var b = new SolidBrush(r.Col)) g.FillRectangle(b, fill);
                g.DrawString(N(r.Value), Theme.Bold, Brushes.White, fill.Left + 6, fill.Top + 2);
                g.DrawString((r.Value / Base * 100).ToString("0") + "%", Font, Brushes.Gray, new RectangleF(Width - pw - 4, y + 5, pw, 16), FarFmt);
                AddHit(new RectangleF(0, y, Width, rowH), r.Label + ": " + N(r.Value));
                y += rowH;
            }
        }
    }
}
