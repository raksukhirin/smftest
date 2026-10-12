// ตัวแสดงภาพเอกสารสำหรับ Template Designer: ซูมได้ ลากเลือกคำ OCR หรือลากกรอบเป็นโซน และแสดงกรอบซ้อนทับ (overlay)
// วางใน Panel ที่ AutoScroll=true — ตัว control ปรับขนาดตามระดับซูม ให้ Panel จัดการแถบเลื่อนเอง
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Linq;
using System.Windows.Forms;

namespace BLScan
{
    public class CanvasOverlay
    {
        public RectangleF R;              // สัดส่วนของหน้า 0..1
        public string Caption = "";
        public Color Color = Color.Green;
        public bool Dashed;
    }

    public enum CanvasMode { Words, Zone }

    public class ImageCanvas : Control
    {
        Bitmap image;
        double zoom = 1.0;
        Point dragStart, dragNow;
        bool dragging, panning;
        Point panStartMouse, panStartScroll;

        public List<OcrWord> Words = new List<OcrWord>();
        public HashSet<OcrWord> Selected = new HashSet<OcrWord>();
        public List<CanvasOverlay> Overlays = new List<CanvasOverlay>();
        public bool ShowWordBoxes = true;
        public CanvasMode Mode = CanvasMode.Words;

        public event EventHandler SelectionChanged;
        public event Action<RectangleF> ZoneDrawn;       // สัดส่วนของหน้า
        public event EventHandler ZoomChanged;

        public ImageCanvas()
        {
            SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
            BackColor = Color.White;
            Cursor = Cursors.Cross;
        }

        public Bitmap Image
        {
            get { return image; }
            set { image = value; Selected.Clear(); ApplyZoom(); }
        }

        public double Zoom
        {
            get { return zoom; }
            set { zoom = Math.Max(0.1, Math.Min(6.0, value)); ApplyZoom(); if (ZoomChanged != null) ZoomChanged(this, EventArgs.Empty); }
        }

        void ApplyZoom()
        {
            Size = image == null ? new Size(10, 10) : new Size(Math.Max(1, (int)(image.Width * zoom)), Math.Max(1, (int)(image.Height * zoom)));
            Invalidate();
        }

        /// <summary>ปรับซูมให้ความกว้างภาพพอดีกับความกว้างที่ให้</summary>
        public void FitWidth(int availableWidth)
        {
            if (image == null || availableWidth < 50) return;
            Zoom = (double)availableWidth / image.Width;
        }

        RectangleF ToPx(double x, double y, double w, double h)
        {
            return new RectangleF((float)(x * Width), (float)(y * Height), (float)(w * Width), (float)(h * Height));
        }

        RectangleF ToPx(OcrWord w) { return ToPx(w.X, w.Y, w.W, w.H); }

        static Rectangle Norm(Point a, Point b)
        {
            return new Rectangle(Math.Min(a.X, b.X), Math.Min(a.Y, b.Y), Math.Abs(a.X - b.X), Math.Abs(a.Y - b.Y));
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.Clear(Color.White);
            if (image == null) return;
            g.InterpolationMode = zoom < 1 ? InterpolationMode.HighQualityBicubic : InterpolationMode.NearestNeighbor;
            g.PixelOffsetMode = PixelOffsetMode.Half;
            g.DrawImage(image, 0, 0, Width, Height);

            if (ShowWordBoxes)
                using (var pen = new Pen(Color.FromArgb(110, 120, 120, 120), 1))
                    foreach (var w in Words) { var r = ToPx(w); g.DrawRectangle(pen, r.X, r.Y, r.Width, r.Height); }

            foreach (var w in Words.Where(x => Selected.Contains(x)))
            {
                var r = ToPx(w);
                using (var b = new SolidBrush(Color.FromArgb(90, 30, 110, 255))) g.FillRectangle(b, r.X, r.Y, r.Width, r.Height);
                using (var pen = new Pen(Color.FromArgb(230, 20, 80, 220), 2)) g.DrawRectangle(pen, r.X, r.Y, r.Width, r.Height);
            }

            using (var font = new Font("Tahoma", 8f, FontStyle.Bold))
                foreach (var o in Overlays)
                {
                    var r = ToPx(o.R.X, o.R.Y, o.R.Width, o.R.Height);
                    using (var pen = new Pen(o.Color, 2) { DashStyle = o.Dashed ? DashStyle.Dash : DashStyle.Solid })
                        g.DrawRectangle(pen, r.X, r.Y, Math.Max(2, r.Width), Math.Max(2, r.Height));
                    if (o.Caption != "")
                    {
                        var sz = g.MeasureString(o.Caption, font);
                        float ty = Math.Max(0, r.Y - sz.Height);
                        using (var bg = new SolidBrush(Color.FromArgb(215, 255, 255, 255))) g.FillRectangle(bg, r.X, ty, sz.Width, sz.Height);
                        using (var fg = new SolidBrush(o.Color)) g.DrawString(o.Caption, font, fg, r.X, ty);
                    }
                }

            if (dragging)
            {
                var rb = Norm(dragStart, dragNow);
                Color c = Mode == CanvasMode.Zone ? Color.OrangeRed : Color.RoyalBlue;
                using (var b = new SolidBrush(Color.FromArgb(40, c))) g.FillRectangle(b, rb);
                using (var pen = new Pen(c, 1) { DashStyle = DashStyle.Dash }) g.DrawRectangle(pen, rb);
            }
        }

        protected override void OnMouseDown(MouseEventArgs e)
        {
            base.OnMouseDown(e);
            Focus();
            if (e.Button == MouseButtons.Middle || e.Button == MouseButtons.Right)
            {
                var sc = Parent as ScrollableControl;
                if (sc == null) return;
                panning = true; panStartMouse = Cursor.Position;
                panStartScroll = new Point(-sc.AutoScrollPosition.X, -sc.AutoScrollPosition.Y);
                Cursor = Cursors.SizeAll;
                return;
            }
            if (e.Button != MouseButtons.Left) return;
            dragging = true; dragStart = dragNow = e.Location;
        }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            base.OnMouseMove(e);
            if (panning)
            {
                var sc = (ScrollableControl)Parent;
                var d = new Point(Cursor.Position.X - panStartMouse.X, Cursor.Position.Y - panStartMouse.Y);
                sc.AutoScrollPosition = new Point(panStartScroll.X - d.X, panStartScroll.Y - d.Y);
                return;
            }
            if (dragging) { dragNow = e.Location; Invalidate(); }
        }

        protected override void OnMouseUp(MouseEventArgs e)
        {
            base.OnMouseUp(e);
            if (panning) { panning = false; Cursor = Cursors.Cross; return; }
            if (!dragging) return;
            dragging = false;
            dragNow = e.Location;
            var rb = Norm(dragStart, dragNow);
            bool ctrl = (ModifierKeys & Keys.Control) == Keys.Control;
            if (rb.Width < 4 && rb.Height < 4)
            {
                // คลิกเฉยๆ: เลือกคำที่อยู่ใต้เมาส์ (คำเล็กสุดที่ครอบจุดนั้น) — คลิกที่ว่างล้างการเลือก
                var hit = Words.Where(w => ToPx(w).Contains(e.Location)).OrderBy(w => w.W * w.H).FirstOrDefault();
                if (!ctrl) Selected.Clear();
                if (hit != null) { if (ctrl && Selected.Contains(hit)) Selected.Remove(hit); else Selected.Add(hit); }
                Invalidate();
                if (SelectionChanged != null) SelectionChanged(this, EventArgs.Empty);
                return;
            }
            if (Mode == CanvasMode.Zone)
            {
                Invalidate();
                if (ZoneDrawn != null && Width > 0 && Height > 0)
                    ZoneDrawn(new RectangleF((float)rb.X / Width, (float)rb.Y / Height, (float)rb.Width / Width, (float)rb.Height / Height));
                return;
            }
            if (!ctrl) Selected.Clear();
            foreach (var w in Words.Where(w => ToPx(w).IntersectsWith(rb))) Selected.Add(w);
            Invalidate();
            if (SelectionChanged != null) SelectionChanged(this, EventArgs.Empty);
        }

        protected override void OnMouseWheel(MouseEventArgs e)
        {
            if ((ModifierKeys & Keys.Control) == Keys.Control)
            {
                // ซูมรอบจุดที่ชี้: เก็บจุดนั้นไว้ตำแหน่งเดิมบนจอ
                var sc = Parent as ScrollableControl;
                double fx = Width > 0 ? (double)e.X / Width : 0, fy = Height > 0 ? (double)e.Y / Height : 0;
                Point before = sc != null ? new Point(e.X + sc.AutoScrollPosition.X, e.Y + sc.AutoScrollPosition.Y) : Point.Empty;
                Zoom = zoom * (e.Delta > 0 ? 1.15 : 1 / 1.15);
                if (sc != null) sc.AutoScrollPosition = new Point((int)(fx * Width) - before.X, (int)(fy * Height) - before.Y);
                return;
            }
            base.OnMouseWheel(e);
            var host = Parent as ScrollableControl;
            if (host != null) host.AutoScrollPosition = new Point(-host.AutoScrollPosition.X, -host.AutoScrollPosition.Y - e.Delta);
        }

        public void ClearSelection()
        {
            Selected.Clear();
            Invalidate();
            if (SelectionChanged != null) SelectionChanged(this, EventArgs.Empty);
        }
    }
}
