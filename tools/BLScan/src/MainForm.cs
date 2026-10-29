// หน้าหลักของโปรแกรม (SMF DocLink): เลือกงานที่จะทำ แล้วเปิดหน้า OCR (Scan House B/L) หรือหน้านำเข้า EDI
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace BLScan
{
    /// <summary>การ์ดเมนู: กรอบมน, ไอคอนวงกลม, ชื่อ + คำอธิบาย + ปุ่ม — คลิกที่ไหนในการ์ดก็เปิดได้</summary>
    public class MenuCard : Panel
    {
        readonly string _badge;
        bool _hot, _locked;
        Label _title, _sub, _list;
        Button _btn;
        public event EventHandler Open;

        /// <summary>การ์ดที่ยังไม่มีสิทธิ์ใช้งาน: สีเทา + กุญแจ + ปุ่มเปลี่ยนข้อความ (กดแล้วยังแจ้งเหตุผลได้ผ่าน Open)</summary>
        public void SetLocked(bool locked, string buttonText)
        {
            _locked = locked;
            _title.ForeColor = locked ? Color.FromArgb(120, 130, 125) : Theme.Dark;
            _sub.ForeColor = locked ? Color.FromArgb(150, 158, 154) : Color.FromArgb(90, 110, 98);
            _list.ForeColor = locked ? Color.FromArgb(150, 158, 154) : Theme.Text;
            _btn.Text = buttonText;
            Theme.Style(_btn, !locked);
            Invalidate();
        }

        public MenuCard(string badge, string title, string subtitle, string[] points, string buttonText)
        {
            _badge = badge;
            DoubleBuffered = true; ResizeRedraw = true; Cursor = Cursors.Hand; Padding = new Padding(26);
            var tTitle = new Label { Text = title, Font = new Font("Segoe UI Semibold", 15f), ForeColor = Theme.Dark, AutoSize = true, Location = new Point(110, 30), BackColor = Color.Transparent };
            var tSub = new Label { Text = subtitle, Font = new Font("Segoe UI", 9.5f), ForeColor = Color.FromArgb(90, 110, 98), AutoSize = true, Location = new Point(111, 62), BackColor = Color.Transparent };
            var list = new Label { Text = "✓  " + string.Join("\r\n✓  ", points), Font = new Font("Segoe UI", 10f), ForeColor = Theme.Text, AutoSize = true, Location = new Point(30, 118), BackColor = Color.Transparent };
            var btn = new Button { Text = buttonText, Width = 190, Height = 38, Font = new Font("Segoe UI Semibold", 10.5f), };
            btn.Location = new Point(30, 250);
            Resize += (s, e) =>
            {
                btn.Location = new Point(30, Math.Max(190, Height - 74));
                tSub.MaximumSize = new Size(Math.Max(120, Width - 150), 0);
            };
            Theme.Style(btn, true);
            btn.Click += (s, e) => Fire();
            _title = tTitle; _sub = tSub; _list = list; _btn = btn;
            Controls.AddRange(new Control[] { tTitle, tSub, list, btn });
            foreach (Control c in new Control[] { tTitle, tSub, list })
            {
                c.Click += (s, e) => Fire();
                c.MouseEnter += (s, e) => SetHot(true);
                c.MouseLeave += (s, e) => SetHot(false);
            }
            btn.MouseEnter += (s, e) => SetHot(true);
            btn.MouseLeave += (s, e) => SetHot(false);
        }

        void Fire() { if (Open != null) Open(this, EventArgs.Empty); }
        void SetHot(bool v) { if (_hot != v) { _hot = v; Invalidate(); } }
        protected override void OnMouseEnter(EventArgs e) { base.OnMouseEnter(e); SetHot(true); }
        protected override void OnMouseLeave(EventArgs e) { base.OnMouseLeave(e); if (!ClientRectangle.Contains(PointToClient(Cursor.Position))) SetHot(false); }
        protected override void OnClick(EventArgs e) { base.OnClick(e); Fire(); }

        static GraphicsPath Round(Rectangle r, int rad)
        {
            var p = new GraphicsPath();
            p.AddArc(r.X, r.Y, rad, rad, 180, 90); p.AddArc(r.Right - rad, r.Y, rad, rad, 270, 90);
            p.AddArc(r.Right - rad, r.Bottom - rad, rad, rad, 0, 90); p.AddArc(r.X, r.Bottom - rad, rad, rad, 90, 90);
            p.CloseFigure();
            return p;
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(Parent != null ? Parent.BackColor : Theme.Bg);
            var r = new Rectangle(2, 2, Width - 6, Height - 6);
            using (var shadow = Round(new Rectangle(r.X + 2, r.Y + 3, r.Width, r.Height), 18))
            using (var sb = new SolidBrush(Color.FromArgb(_hot ? 30 : 16, 20, 70, 45))) g.FillPath(sb, shadow);
            using (var path = Round(r, 18))
            {
                using (var b = new SolidBrush(_locked ? Color.FromArgb(246, 247, 246) : _hot ? Color.FromArgb(250, 254, 251) : Color.White)) g.FillPath(b, path);
                using (var pen = new Pen(_locked ? Color.FromArgb(214, 218, 215) : _hot ? Theme.Primary : Theme.Line, _hot && !_locked ? 2f : 1f)) g.DrawPath(pen, path);
            }
            // ไอคอน: วงกลมเขียว (ล็อก = เทา) + ตัวย่อ
            var ic = new Rectangle(30, 28, 66, 66);
            using (var b = _locked ? new LinearGradientBrush(ic, Color.FromArgb(176, 184, 180), Color.FromArgb(128, 138, 133), 45f) : new LinearGradientBrush(ic, Theme.Primary, Theme.Dark, 45f)) g.FillEllipse(b, ic);
            using (var f = new Font("Segoe UI Semibold", 14f))
            {
                var sz = g.MeasureString(_badge, f);
                g.DrawString(_badge, f, Brushes.White, ic.X + (ic.Width - sz.Width) / 2f, ic.Y + (ic.Height - sz.Height) / 2f);
            }
            if (_locked)
            {
                // กุญแจเล็กที่มุมไอคอน
                var lk = new Rectangle(ic.Right - 26, ic.Bottom - 22, 26, 22);
                using (var bg = new SolidBrush(Color.White)) g.FillEllipse(bg, lk.X - 4, lk.Y - 8, lk.Width + 8, lk.Height + 8);
                using (var pen = new Pen(Color.FromArgb(200, 140, 20), 2.4f)) g.DrawArc(pen, lk.X + 5, lk.Y - 4, 16, 16, 180, 180);
                using (var body = new SolidBrush(Color.FromArgb(214, 150, 24))) g.FillRectangle(body, lk.X + 2, lk.Y + 5, 22, 15);
            }
        }
    }

    public class MainForm : Form
    {
        public const string AppName = "SMF DocLink";
        readonly Ini _ini;
        readonly Db _db;
        Label lblDb;
        Panel dot;

        public MainForm(Ini ini)
        {
            _ini = ini; _db = new Db(ini);
            Text = AppName + " — นำเอกสารเข้าระบบ SMF";
            Width = 960; Height = 640; MinimumSize = new Size(820, 560);
            StartPosition = FormStartPosition.CenterScreen;
            Font = new Font("Segoe UI", 9.5f);
            BackColor = Theme.Bg;
            BuildUi();
            Shown += (s, e) => CheckDb();
        }

        void BuildUi()
        {
            var banner = new Panel { Dock = DockStyle.Top, Height = 132 };
            banner.Paint += (s, e) =>
            {
                using (var b = new LinearGradientBrush(banner.ClientRectangle, Theme.Dark, Color.FromArgb(46, 140, 96), 0f)) e.Graphics.FillRectangle(b, banner.ClientRectangle);
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                using (var ring = new Pen(Color.FromArgb(60, 255, 255, 255), 2f))
                {
                    e.Graphics.DrawEllipse(ring, banner.Width - 190, -70, 260, 260);
                    e.Graphics.DrawEllipse(ring, banner.Width - 130, -30, 160, 160);
                }
            };
            banner.Controls.Add(new Label { Text = "SMF", Font = new Font("Segoe UI Black", 30f), ForeColor = Color.FromArgb(190, 235, 210), AutoSize = true, Location = new Point(30, 22), BackColor = Color.Transparent });
            var lblSmf = (Label)banner.Controls[banner.Controls.Count - 1];
            banner.Controls.Add(new Label { Text = "DocLink", Font = new Font("Segoe UI Light", 30f), ForeColor = Color.White, AutoSize = true, Location = new Point(lblSmf.PreferredWidth + 28, 22), BackColor = Color.Transparent });

            // License To (อ่านจาก Smart.ini → APP.LIC ตอนเปิดโปรแกรม)
            var lic = LicenseInfo.Current;
            // ซื้อสิทธิ์ EDI แล้ว = "LICENSE TO  ชื่อบริษัท" / ยังไม่ซื้อ (หรือไม่พบ/อ่านลิขสิทธิ์ SMF ไม่ได้) = "Free License" (ตามด้วยชื่อบริษัทถ้าอ่านได้)
            var lblLicCap = new Label { Text = lic.EdiAllowed ? "LICENSE TO" : "Free License", Font = new Font("Segoe UI", 10f), ForeColor = lic.EdiAllowed ? Color.FromArgb(170, 220, 195) : Color.FromArgb(255, 224, 150), AutoSize = true, BackColor = Color.Transparent };
            var lblLic = new Label
            {
                Text = lic.Valid ? lic.Company : "",
                Font = new Font("Segoe UI Semibold", 13f), ForeColor = Color.White, AutoSize = true, BackColor = Color.Transparent
            };
            banner.Controls.Add(lblLicCap); banner.Controls.Add(lblLic);
            // ใต้โลโก้ SMF DocLink ชิดซ้าย บรรทัดเดียวกัน: LICENSE TO  ชื่อบริษัท
            int licY = 90;
            lblLicCap.Location = new Point(35, licY + 4);
            lblLic.Location = new Point(35 + lblLicCap.PreferredWidth + 6, licY);
            lblLicCap.BringToFront(); lblLic.BringToFront();

            var footer = new Panel { Dock = DockStyle.Bottom, Height = 52, BackColor = Color.White };
            footer.Paint += (s, e) => { using (var p = new Pen(Theme.Line)) e.Graphics.DrawLine(p, 0, 0, footer.Width, 0); };
            dot = new Panel { Size = new Size(12, 12), Location = new Point(26, 20), BackColor = Color.Silver };
            dot.Paint += (s, e) => { };
            lblDb = new Label { Text = "ตรวจการเชื่อมต่อฐานข้อมูล…", AutoSize = true, Location = new Point(46, 17), ForeColor = Theme.Text };
            var btnSettings = new Button { Text = "ตั้งค่า DB…", Width = 120, Height = 30, Anchor = AnchorStyles.Top | AnchorStyles.Right };
            btnSettings.Location = new Point(footer.Width - 150, 11);
            Theme.Style(btnSettings, false);
            btnSettings.Click += (s, e) => OpenSettings();
            footer.Controls.AddRange(new Control[] { dot, lblDb, btnSettings });
            footer.Resize += (s, e) => btnSettings.Location = new Point(footer.Width - 150, 11);

            var cards = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1, Padding = new Padding(30, 30, 30, 20), BackColor = Theme.Bg };
            cards.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
            cards.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
            cards.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            var ocr = new MenuCard("OCR", "Scan House B/L", "อ่านใบ B/L (PDF / รูป) ด้วย OCR แล้วอัปเดตเข้า HB/L ที่สร้างรอไว้",
                new[] { "เลือกไฟล์ → Scan → ตรวจ/แก้ค่า → Update", "Template ต่อผู้ออก B/L (จูนได้เอง)", "ทดสอบ Dry run ก่อนบันทึกจริงได้" }, "เปิดหน้า Scan B/L  →")
            { Dock = DockStyle.Fill, Margin = new Padding(0, 0, 14, 0) };
            ocr.Open += (s, e) => OpenOcr();
            var edi = new MenuCard("EDI", "นำเข้า EDI (XML)", "อ่านไฟล์ XML ของเอเจนต์ แล้วเพิ่ม House B/L หลายใบเข้างานที่มีอยู่",
                new[] { "ระบุเลขงาน → เพิ่ม HB/L ต่อท้ายอัตโนมัติ", "ตู้ / น้ำหนัก / CBM / Container List ครบ", "ทดสอบ Dry run ก่อนนำเข้าจริงเสมอ" }, "เปิดหน้านำเข้า EDI  →")
            { Dock = DockStyle.Fill, Margin = new Padding(14, 0, 0, 0) };
            edi.Open += (s, e) => OpenEdi();
            if (!lic.EdiAllowed) edi.SetLocked(true, "ต้องมีสิทธิ์ใช้งาน");
            cards.Controls.Add(ocr, 0, 0);
            cards.Controls.Add(edi, 1, 0);

            Controls.Add(cards); Controls.Add(footer); Controls.Add(banner);
        }

        void OpenOcr()
        {
            var f = new OcrForm(_ini);
            f.FormClosed += (s, e) => { Show(); CheckDb(); };
            Hide();
            f.Show();
        }

        void OpenEdi()
        {
            var lic = LicenseInfo.Current;
            if (!lic.EdiAllowed)
            {
                string who = lic.Valid ? "License To : " + lic.Company + "\r\nSerial     : " + lic.Serial + "\r\n\r\n" : "";
                MessageBox.Show(this, "การนำเข้า EDI เป็นโมดูลเสริม ใช้ได้เฉพาะลูกค้าที่ซื้อสิทธิ์\r\n\r\n" + who + lic.Problem + "\r\n\r\nกรุณาติดต่อผู้ขาย และแจ้ง Serial ข้างต้น",
                                "ต้องมีสิทธิ์ใช้งาน EDI", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            using (var f = new EdiForm(_ini)) f.ShowDialog(this);
        }

        void OpenSettings()
        {
            using (var f = new SettingsForm(_ini)) f.ShowDialog(this);
            CheckDb();
        }

        async void CheckDb()
        {
            if (!_ini.Exists) { SetDb(Color.Firebrick, "ไม่พบไฟล์ตั้งค่า — กด \"ตั้งค่า DB…\""); return; }
            if (!_db.Configured) { SetDb(Color.Firebrick, "ยังไม่ได้ตั้งค่าฐานข้อมูล — กด \"ตั้งค่า DB…\""); return; }
            if (_db.SecretProblem != "") { SetDb(Color.Firebrick, "ถอดรหัสผ่านใน ini ไม่ได้ — กด \"ตั้งค่า DB…\""); return; }
            SetDb(Color.Goldenrod, "กำลังเชื่อมต่อฐานข้อมูล…");
            try
            {
                await Task.Run(() => _db.TestConnection());
                SetDb(Theme.Primary, "เชื่อมต่อฐานข้อมูลแล้ว");
            }
            catch (Exception ex) { SetDb(Color.Firebrick, "เชื่อมต่อไม่ได้: " + _db.Sanitize(ex.GetBaseException().Message)); }
        }

        void SetDb(Color c, string text) { dot.BackColor = c; lblDb.Text = text; }
    }
}
