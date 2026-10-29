using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Linq;
using System.Text.RegularExpressions;
using System.Windows.Forms;

namespace SMFDash
{
    public class Kpi
    {
        public string Label, Value, Delta, Dir; public bool Live; public double[] Spark;
        public Kpi(string l, string v, string d, string dir) { Label = l; Value = v; Delta = d; Dir = dir; }
    }

    static class Draw
    {
        public static GraphicsPath Round(RectangleF r, float rad)
        {
            var p = new GraphicsPath(); float d = Math.Min(rad * 2, Math.Min(r.Width, r.Height));
            if (d <= 0) { p.AddRectangle(r); return p; }
            p.AddArc(r.X, r.Y, d, d, 180, 90); p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90); p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            p.CloseFigure(); return p;
        }
        public static void CardBox(Graphics g, Rectangle bounds)
        {
            var r = new RectangleF(0.5f, 0.5f, bounds.Width - 2, bounds.Height - 2);
            using (var path = Round(r, 8))
            using (var b = new SolidBrush(Color.White))
            using (var pen = new Pen(Theme.Border)) { g.FillPath(b, path); g.DrawPath(pen, path); }
        }
    }

    public class KpiCard : Control
    {
        readonly Kpi _k; readonly Color _accent;
        public KpiCard(Kpi k, Color accent) { _k = k; _accent = accent; DoubleBuffered = true; ResizeRedraw = true; }
        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias; g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
            g.Clear(Theme.Bg); Draw.CardBox(g, ClientRectangle);
            using (var m = new SolidBrush(Theme.Muted)) g.DrawString(_k.Label, Theme.Small, m, 14, 10);
            g.DrawString(_k.Value, Theme.Big, Brushes.Black, 12, 26);
            if (!string.IsNullOrEmpty(_k.Delta))
            {
                var c = _k.Dir == "up" ? Theme.Up : _k.Dir == "down" ? Theme.Down : Theme.Muted;
                using (var b = new SolidBrush(c)) g.DrawString((_k.Dir == "up" ? "▲ " : _k.Dir == "down" ? "▼ " : "■ ") + _k.Delta, Theme.Section, b, 14, 58);
            }
            if (_k.Live) using (var b = new SolidBrush(Theme.Up)) g.DrawString("LIVE", Theme.Section, b, Width - 40, 10);
            if (_k.Spark != null && Width > 150)
            {
                double mx = _k.Spark.Max(), mn = _k.Spark.Min(); float w = 70, h = 28, x0 = Width - w - 14, y0 = Height - h - 16;
                var pts = _k.Spark.Select((v, i) => new PointF(x0 + i * w / (_k.Spark.Length - 1), y0 + h - 2 - (float)((v - mn) / (mx - mn == 0 ? 1 : mx - mn)) * (h - 4))).ToArray();
                using (var pen = new Pen(_accent, 1.8f)) g.DrawLines(pen, pts);
            }
        }
    }

    /// <summary>White rounded panel with a title (left), a hint / data-source tag (right) and one content control.</summary>
    public class Card : Panel
    {
        readonly string _title, _hint; readonly bool _live;
        public Card(string title, string hint, bool live, Control content)
        {
            _title = title; _hint = hint ?? ""; _live = live;
            DoubleBuffered = true; Padding = new Padding(14, 34, 14, 10); ResizeRedraw = true;
            content.Dock = DockStyle.Fill; Controls.Add(content);
        }
        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias; g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
            g.Clear(Theme.Bg); Draw.CardBox(g, ClientRectangle);
            g.DrawString(_title, Theme.Title, Brushes.Black, 14, 10);
            string tag = (_live ? "● LIVE  " : "") + _hint;
            using (var b = new SolidBrush(_live ? Theme.Up : Theme.Faint))
                g.DrawString(tag, Theme.Small, b, new RectangleF(120, 12, Width - 134, 16), new StringFormat { Alignment = StringAlignment.Far, Trimming = StringTrimming.EllipsisCharacter, FormatFlags = StringFormatFlags.NoWrap });
        }
    }

    public class PillButton : Button
    {
        bool _on; public Color Accent = Theme.Ops; public bool Rounded;
        public bool On { get { return _on; } set { _on = value; Invalidate(); } }
        public PillButton(string text)
        {
            Text = text; FlatStyle = FlatStyle.Flat; Cursor = Cursors.Hand; Font = Theme.Bold; UseVisualStyleBackColor = false;
            FlatAppearance.BorderSize = 0; Height = 30; AutoSize = false; Width = TextRenderer.MeasureText(text, Theme.Bold).Width + 32;
        }
        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias; g.Clear(Parent == null ? Color.White : Parent.BackColor);
            var r = new RectangleF(0, 0, Width - 1, Height - 1);
            using (var path = Draw.Round(r, Rounded ? Height / 2f : 8))
            {
                if (_on) using (var b = new SolidBrush(Rounded ? Theme.Hex("#e0f2fe") : Accent)) g.FillPath(b, path);
                if (_on && Rounded) using (var pen = new Pen(Theme.Hex("#bae6fd"))) g.DrawPath(pen, path);
            }
            var fore = _on ? (Rounded ? Theme.Ops : Color.White) : Theme.Muted;
            TextRenderer.DrawText(g, Text, Rounded ? Theme.Base : Theme.Bold, ClientRectangle, fore, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
        }
    }

    public static class Tbl
    {
        static readonly Regex Bad = new Regex("delay|late|missing|hold|inspection|>90|awaiting|pending", RegexOptions.IgnoreCase);
        static readonly Regex Ok = new Regex("on time|arrived|flown|cleared|balanced", RegexOptions.IgnoreCase);
        static readonly Regex Info = new Regex("transit|lodged|dispatched|booked|planned|open", RegexOptions.IgnoreCase);

        /// <summary>Flat, borderless grid in the dashboard style (no columns yet).</summary>
        public static DataGridView Styled()
        {
            var d = new DataGridView
            {
                ReadOnly = true, AllowUserToAddRows = false, AllowUserToDeleteRows = false, AllowUserToResizeRows = false, RowHeadersVisible = false,
                BorderStyle = BorderStyle.None, BackgroundColor = Color.White, GridColor = Theme.Hex("#f1f5f9"), CellBorderStyle = DataGridViewCellBorderStyle.SingleHorizontal,
                EnableHeadersVisualStyles = false, ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.DisableResizing, ColumnHeadersHeight = 24,
                RowTemplate = { Height = 26 }, AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill, SelectionMode = DataGridViewSelectionMode.FullRowSelect,
                DefaultCellStyle = { Font = Theme.Base, SelectionBackColor = Theme.Hex("#f8fafc"), SelectionForeColor = Theme.Text, ForeColor = Theme.Text, Padding = new Padding(4, 0, 4, 0) },
                ScrollBars = ScrollBars.Vertical, MultiSelect = false, TabStop = false
            };
            d.ColumnHeadersDefaultCellStyle.BackColor = Color.White; d.ColumnHeadersDefaultCellStyle.ForeColor = Theme.Muted;
            d.ColumnHeadersDefaultCellStyle.Font = Theme.Section; d.ColumnHeadersDefaultCellStyle.SelectionBackColor = Color.White;
            d.ColumnHeadersBorderStyle = DataGridViewHeaderBorderStyle.None;
            return d;
        }

        public static DataGridView Make(string[] cols, IList<string[]> rows, int pill, params int[] num)
        {
            var d = Styled();
            for (int i = 0; i < cols.Length; i++)
            {
                var c = new DataGridViewTextBoxColumn { HeaderText = cols[i], SortMode = DataGridViewColumnSortMode.NotSortable };
                if (num.Contains(i)) { c.DefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleRight; c.HeaderCell.Style.Alignment = DataGridViewContentAlignment.MiddleRight; }
                d.Columns.Add(c);
            }
            foreach (var r in rows) d.Rows.Add(r.Cast<object>().ToArray());
            if (pill >= 0)
                d.CellFormatting += (s, e) =>
                {
                    if (e.ColumnIndex != pill || e.Value == null) return;
                    string t = e.Value.ToString();
                    e.CellStyle.ForeColor = Bad.IsMatch(t) ? Theme.Hex("#b91c1c") : Ok.IsMatch(t) ? Theme.Hex("#047857") : Info.IsMatch(t) ? Theme.Hex("#0369a1") : Theme.Muted;
                    e.CellStyle.Font = Theme.Bold;
                };
            return d;
        }
    }

    /// <summary>One-column vertical stack of rows; each row splits into weighted columns.</summary>
    public class PageLayout : TableLayoutPanel
    {
        public PageLayout()
        {
            ColumnCount = 1; Dock = DockStyle.Top; AutoSize = true; AutoSizeMode = AutoSizeMode.GrowAndShrink; BackColor = Theme.Bg;
            ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        }

        public void Section(string text)
        {
            var l = new Label { Text = text.ToUpperInvariant(), Font = Theme.Section, ForeColor = Theme.Muted, Dock = DockStyle.Fill, TextAlign = ContentAlignment.BottomLeft, Margin = new Padding(2, 0, 0, 4) };
            RowStyles.Add(new RowStyle(SizeType.Absolute, 28)); Controls.Add(l, 0, RowCount++);
        }

        public void Row(int height, float[] weights, params Control[] cells)
        {
            var t = new TableLayoutPanel { ColumnCount = cells.Length, RowCount = 1, Dock = DockStyle.Fill, Margin = new Padding(0), BackColor = Theme.Bg };
            for (int i = 0; i < cells.Length; i++)
            {
                t.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, weights[i]));
                cells[i].Dock = DockStyle.Fill; cells[i].Margin = new Padding(0, 0, i == cells.Length - 1 ? 0 : 10, 10);
                t.Controls.Add(cells[i], i, 0);
            }
            t.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            RowStyles.Add(new RowStyle(SizeType.Absolute, height + 10)); Controls.Add(t, 0, RowCount++);
        }

        public void Equal(int height, params Control[] cells) { Row(height, cells.Select(c => 100f).ToArray(), cells); }
    }
}
