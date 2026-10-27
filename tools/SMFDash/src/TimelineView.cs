// Timeline Mgt view: KPI strip + a document x step matrix (done / waiting with age / rejected) with SLA colouring.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Globalization;
using System.Linq;
using System.Windows.Forms;

namespace SMFDash
{
    /// <summary>One line of the matrix: either a group header or a document.</summary>
    public class TlItem
    {
        public string Header; public Color HeaderCol; public int Count; public ApprReq R;
    }

    public class KpiBox { public string Label, Value, Key; public Color Col; }

    /// <summary>Row of clickable summary boxes; clicking one picks a status filter.</summary>
    public class KpiStrip : Control
    {
        public List<KpiBox> Boxes = new List<KpiBox>();
        public event Action<string> Picked;
        public KpiStrip() { DoubleBuffered = true; ResizeRedraw = true; BackColor = Theme.Bg; }

        RectangleF BoxRect(int i) { float w = (Width - 6f * (Boxes.Count - 1)) / Boxes.Count; return new RectangleF(i * (w + 6), 0, w, Height - 4); }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias; g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit; g.Clear(Theme.Bg);
            for (int i = 0; i < Boxes.Count; i++)
            {
                var r = BoxRect(i); var b = Boxes[i];
                using (var path = Draw.Round(r, 6)) using (var f = new SolidBrush(Color.White)) using (var pen = new Pen(Theme.Border)) { g.FillPath(f, path); g.DrawPath(pen, path); }
                using (var br = new SolidBrush(b.Col)) g.FillRectangle(br, r.X, r.Y + 6, 4, r.Height - 12);
                g.DrawString(b.Label, Theme.Small, Brushes.Gray, r.X + 12, r.Y + 6);
                g.DrawString(b.Value, new Font("Segoe UI", 15f, FontStyle.Bold), Brushes.Black, r.X + 10, r.Y + 20);
            }
        }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            bool hand = false;
            for (int i = 0; i < Boxes.Count; i++) if (Boxes[i].Key != null && BoxRect(i).Contains(e.Location)) hand = true;
            Cursor = hand ? Cursors.Hand : Cursors.Default; base.OnMouseMove(e);
        }

        protected override void OnMouseClick(MouseEventArgs e)
        {
            for (int i = 0; i < Boxes.Count; i++) if (Boxes[i].Key != null && BoxRect(i).Contains(e.Location) && Picked != null) Picked(Boxes[i].Key);
            base.OnMouseClick(e);
        }
    }

    public class TimelineCanvas : Control
    {
        public List<TlItem> Items = new List<TlItem>();
        public int SelectedId;
        public event Action<int> RowClicked;
        readonly ToolTip _tip = new ToolTip { ShowAlways = true }; string _lastTip;

        const int HeadH = 34, WipH = 26, RowH = 44, GroupH = 24, LegendH = 34;
        const int XDoc = 12, WDoc = 140, WReq = 96, WJob = 92, WCell = 34, WProg = 128, WWait = 64, WOwn = 90;
        static int XStep0 { get { return XDoc + WDoc + WReq + WJob; } }
        static int XProg { get { return XStep0 + WCell * ApprovalData.Steps.Length + 6; } }
        public static int TotalWidth { get { return XProg + WProg + WWait + WOwn + 12; } }
        public ApprReq[] WipSource = new ApprReq[0];
        public string Me = "";

        public TimelineCanvas() { DoubleBuffered = true; BackColor = Color.White; Font = Theme.Base; }

        public int ContentHeight()
        {
            int h = HeadH + WipH;
            foreach (var it in Items) h += it.R == null ? GroupH : RowH;
            if (Items.Count == 0) h += 60;
            return h + LegendH;
        }

        static Color RiskCol(string k) { return k == "late" ? Theme.Hex("#ef4444") : k == "warn" ? Theme.Hex("#f59e0b") : Theme.Hex("#4f46e5"); }

        void RoundFill(Graphics g, Color c, RectangleF r, float rad)
        {
            using (var p = Draw.Round(r, rad)) using (var b = new SolidBrush(c)) g.FillPath(b, p);
        }

        void TextC(Graphics g, string t, Font f, Color c, RectangleF r)
        {
            using (var b = new SolidBrush(c)) g.DrawString(t, f, b, r, new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center });
        }

        void Txt(Graphics g, string t, Font f, Color c, float x, float y)
        {
            using (var b = new SolidBrush(c)) g.DrawString(t, f, b, x, y);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias; g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
            g.Clear(Color.White);
            int n = ApprovalData.Steps.Length, W = Math.Max(Width, TotalWidth);
            using (var line = new Pen(Theme.Border))
            {
                // header
                Txt(g, "Document", Theme.Section, Theme.Muted, XDoc, 10); Txt(g, "Requested", Theme.Section, Theme.Muted, XDoc + WDoc, 10); Txt(g, "Job type", Theme.Section, Theme.Muted, XDoc + WDoc + WReq, 10);
                for (int s = 0; s < n; s++) TextC(g, (s + 1).ToString(), Theme.Section, Theme.Muted, new RectangleF(XStep0 + s * WCell, 0, WCell, HeadH));
                Txt(g, "Progress", Theme.Section, Theme.Muted, XProg, 10); Txt(g, "Waiting", Theme.Section, Theme.Muted, XProg + WProg, 10); Txt(g, "Owner", Theme.Section, Theme.Muted, XProg + WProg + WWait, 10);
                g.DrawLine(line, 0, HeadH, W, HeadH);

                // WIP row: requests waiting at each step (the bottleneck)
                RoundFill(g, Theme.Hex("#f8fafc"), new RectangleF(0, HeadH, W, WipH), 0);
                Txt(g, "Waiting at step →", Theme.Small, Theme.Muted, XDoc, HeadH + 6);
                for (int s = 1; s <= n; s++)
                {
                    var rs = WipSource.Where(r => r.Status == "Wait" && r.Step == s).ToList(); if (rs.Count == 0) continue;
                    string worst = rs.Any(r => ApprovalData.Risk(r) == "late") ? "late" : rs.Any(r => ApprovalData.Risk(r) == "warn") ? "warn" : "ok";
                    var rect = new RectangleF(XStep0 + (s - 1) * WCell + 5, HeadH + 4, WCell - 10, 18);
                    RoundFill(g, worst == "late" ? Theme.Hex("#fee2e2") : worst == "warn" ? Theme.Hex("#fef3c7") : Theme.Hex("#e0e7ff"), rect, 9);
                    TextC(g, rs.Count.ToString(), Theme.Section, worst == "late" ? Theme.Hex("#b91c1c") : worst == "warn" ? Theme.Hex("#b45309") : Theme.Hex("#3730a3"), rect);
                }
                g.DrawLine(line, 0, HeadH + WipH, W, HeadH + WipH);

                int y = HeadH + WipH;
                foreach (var it in Items)
                {
                    if (it.R == null)
                    {
                        RoundFill(g, Theme.Hex("#f1f5f9"), new RectangleF(0, y, W, GroupH), 0);
                        using (var b = new SolidBrush(it.HeaderCol)) g.FillRectangle(b, 0, y, 4, GroupH);
                        Txt(g, it.Header.ToUpperInvariant() + "   " + it.Count, Theme.Section, it.HeaderCol, 12, y + 5);
                        y += GroupH; continue;
                    }
                    var r = it.R; string k = ApprovalData.Risk(r);
                    if (r.Id == SelectedId) RoundFill(g, Theme.Hex("#eef2ff"), new RectangleF(0, y, W, RowH), 0);
                    Txt(g, r.Doc, Theme.Bold, Theme.Hex("#4338ca"), XDoc, y + 6); Txt(g, r.Type, Theme.Small, Theme.Muted, XDoc, y + 24);
                    Txt(g, r.RequestedAt.ToString("dd MMM HH:mm", CultureInfo.InvariantCulture), Theme.Small, Theme.Text, XDoc + WDoc, y + 6); Txt(g, r.RequestedBy, Theme.Small, Theme.Muted, XDoc + WDoc, y + 24);
                    Txt(g, r.JobType, Theme.Small, Theme.Text, XDoc + WDoc + WReq, y + 6); Txt(g, r.Sale, Theme.Small, Theme.Muted, XDoc + WDoc + WReq, y + 24);

                    for (int s = 1; s <= n; s++)
                    {
                        var c = new RectangleF(XStep0 + (s - 1) * WCell + 1, y + 10, WCell - 2, 24);
                        if (s <= r.DoneSteps) { RoundFill(g, Theme.Hex("#d1fae5"), c, 4); TextC(g, "✓", Theme.Section, Theme.Hex("#047857"), c); }
                        else if (s == r.Step && r.Status == "Rejected") { RoundFill(g, Theme.Hex("#ef4444"), c, 4); TextC(g, "✕", Theme.Section, Color.White, c); }
                        else if (s == r.Step && r.Status == "Wait") { RoundFill(g, RiskCol(k), c, 4); TextC(g, ApprovalData.AgeTxt(ApprovalData.AgeH(r)), Theme.Section, Color.White, c); }
                        else RoundFill(g, Theme.Hex("#f1f5f9"), c, 4);
                    }

                    int pct = r.DoneSteps * 100 / n;
                    RoundFill(g, Theme.Hex("#e2e8f0"), new RectangleF(XProg, y + 19, WProg - 44, 6), 3);
                    if (pct > 0) RoundFill(g, Theme.Hex("#6366f1"), new RectangleF(XProg, y + 19, (WProg - 44) * pct / 100f, 6), 3);
                    Txt(g, pct + "%", Theme.Section, Theme.Text, XProg + WProg - 38, y + 15);
                    if (r.Status == "Wait")
                    {
                        var wr = new RectangleF(XProg + WProg, y + 13, 44, 18);
                        RoundFill(g, k == "late" ? Theme.Hex("#fee2e2") : k == "warn" ? Theme.Hex("#fef3c7") : Theme.Hex("#d1fae5"), wr, 9);
                        TextC(g, ApprovalData.AgeTxt(ApprovalData.AgeH(r)), Theme.Section, k == "late" ? Theme.Hex("#b91c1c") : k == "warn" ? Theme.Hex("#b45309") : Theme.Hex("#047857"), wr);
                        string ap = ApprovalData.Steps[r.Step - 1].Approver;
                        Txt(g, ap + (ap == Me ? "  (you)" : ""), Theme.Small, Theme.Text, XProg + WProg + WWait, y + 15);
                    }
                    else Txt(g, "—", Theme.Small, Theme.Faint, XProg + WProg + 6, y + 15);
                    g.DrawLine(line, 0, y + RowH, W, y + RowH);
                    y += RowH;
                }
                if (Items.Count == 0) TextC(g, "No documents match.", Theme.Base, Theme.Faint, new RectangleF(0, y, W, 60));

                // legend
                int ly = ContentHeight() - LegendH + 12, lx = 12;
                Action<string, Color> leg = (t, c) => { RoundFill(g, c, new RectangleF(lx, ly + 2, 16, 10), 2); Txt(g, t, Theme.Small, Theme.Muted, lx + 20, ly); lx += 28 + (int)g.MeasureString(t, Theme.Small).Width; };
                leg("Approved", Theme.Hex("#d1fae5")); leg("Waiting (age)", Theme.Hex("#4f46e5")); leg("At risk (> " + ApprovalData.SlaWarnH + " h)", Theme.Hex("#f59e0b"));
                leg("Stalled (> " + ApprovalData.SlaLateH + " h / past deadline)", Theme.Hex("#ef4444")); leg("Not started", Theme.Hex("#f1f5f9"));
            }
        }

        // ----- hit testing -----
        int RowAt(int y, out ApprReq req)
        {
            req = null; int cy = HeadH + WipH;
            foreach (var it in Items)
            {
                int h = it.R == null ? GroupH : RowH;
                if (y >= cy && y < cy + h) { req = it.R; return it.R == null ? -1 : 1; }
                cy += h;
            }
            return -1;
        }

        string TipFor(Point p)
        {
            int n = ApprovalData.Steps.Length; int col = (p.X - XStep0) / WCell;
            if (p.X < XStep0 || col >= n) return null;
            var sp = ApprovalData.Steps[col];
            string head = sp.No.ToString("00") + " " + sp.Name + " · approver " + sp.Approver;
            if (p.Y < HeadH) return head;
            if (p.Y < HeadH + WipH) return head + " · " + WipSource.Count(x => x.Status == "Wait" && x.Step == sp.No) + " waiting";
            ApprReq r; if (RowAt(p.Y, out r) < 0 || r == null) return null;
            var req = ApprovalData.LastAt(r, sp.No, "Requested"); var app = ApprovalData.LastAt(r, sp.No, "Approved"); var rej = ApprovalData.LastAt(r, sp.No, "Rejected");
            Func<DateTime?, string> f = d => d.HasValue ? d.Value.ToString("dd MMM HH:mm", CultureInfo.InvariantCulture) : "";
            if (sp.No <= r.DoneSteps) return head + " · approved " + f(app) + (req.HasValue && app.HasValue ? " (took " + ApprovalData.AgeTxt((app.Value - req.Value).TotalHours) + ")" : "");
            if (sp.No == r.Step && r.Status == "Rejected") return head + " · rejected " + f(rej);
            if (sp.No == r.Step && r.Status == "Wait") return head + " · waiting " + ApprovalData.AgeTxt(ApprovalData.AgeH(r)) + " since " + f(req);
            return head;
        }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            string t = TipFor(e.Location); ApprReq r; bool row = RowAt(e.Y, out r) > 0 && r != null;
            Cursor = row ? Cursors.Hand : Cursors.Default;
            if (t != _lastTip) { _lastTip = t; _tip.SetToolTip(this, t); }
            base.OnMouseMove(e);
        }

        protected override void OnMouseClick(MouseEventArgs e)
        {
            ApprReq r; if (RowAt(e.Y, out r) > 0 && r != null && RowClicked != null) RowClicked(r.Id);
            base.OnMouseClick(e);
        }
    }
}
