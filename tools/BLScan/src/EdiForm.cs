// หน้าจอนำเข้า EDI: เลือกไฟล์ XML + ระบุเลขงาน → ดูรายการ HB/L → ทดสอบ (dry run) → นำเข้า
using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace BLScan
{
    public class EdiForm : Form
    {
        readonly Ini _ini;
        readonly Db _db;
        TextBox txtFile, txtJob, txtLog;
        CheckBox chkJob, chkForce;
        DataGridView grid;
        Button btnBrowse, btnLoad, btnDry, btnImport;
        Label lblInfo;
        EdiFile _file;
        ComboBox cmbTpl;
        Button btnCheck;
        Label lblCheck;
        List<EdiTemplate> _tpls = new List<EdiTemplate>();
        EdiTemplate _tpl;                 // Template ที่ใช้อ่านไฟล์ (เลือกเอง หรือที่ตรวจพบ)
        EdiCheckResult _check;
        bool _loading;
        string _tested = "";      // "ไฟล์|งาน|updateJob" ที่ dry run ผ่านแล้ว — นำเข้าจริงได้เฉพาะชุดนี้

        public EdiForm(Ini ini)
        {
            _ini = ini; _db = new Db(ini);
            Text = "นำเข้า EDI — เพิ่ม HB/L เข้างาน";
            Width = 1120; Height = 740; StartPosition = FormStartPosition.CenterParent;
            Font = new Font("Segoe UI", 9.5f);

            BackColor = Theme.Bg;

            // แถบหัว
            var banner = new Panel { Dock = DockStyle.Fill, BackColor = Theme.Dark, Height = 64 };
            banner.Controls.Add(new Label { Text = "นำเข้า EDI", ForeColor = Color.White, Font = new Font("Segoe UI Semibold", 15f), AutoSize = true, Location = new Point(18, 6) });
            banner.Controls.Add(new Label { Text = "อ่านไฟล์ XML ของเอเจนต์ แล้วเพิ่ม House B/L ต่อท้ายงานที่มีอยู่ — ทดสอบก่อนเสมอ แล้วจึงนำเข้า", ForeColor = Color.FromArgb(200, 230, 213), AutoSize = true, Location = new Point(20, 38) });

            var top = new TableLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, ColumnCount = 5, RowCount = 1, Padding = new Padding(14, 10, 14, 2), BackColor = Color.White };
            txtFile = new TextBox { Width = 470, ReadOnly = true, BorderStyle = BorderStyle.FixedSingle, BackColor = Color.FromArgb(250, 252, 250), Margin = new Padding(0, 3, 6, 0) };
            btnBrowse = new Button { Text = "เลือกไฟล์ EDI…", Width = 120, Height = 30, Margin = new Padding(0, 0, 8, 0) }; Theme.Style(btnBrowse, false);
            btnBrowse.Click += (s, e) => Browse();
            var lblJob = new Label { Text = "เลขงาน (JOBNO)", AutoSize = true, Margin = new Padding(18, 8, 6, 0), Font = new Font(Font, FontStyle.Bold), ForeColor = Theme.Text };
            txtJob = new TextBox { Width = 170, CharacterCasing = CharacterCasing.Upper, BorderStyle = BorderStyle.FixedSingle, Margin = new Padding(0, 3, 8, 0), Font = new Font("Segoe UI Semibold", 10f) };
            txtJob.TextChanged += (s, e) => UpdateButtons();
            btnLoad = new Button { Text = "อ่านไฟล์", Width = 90, Height = 30 }; Theme.Style(btnLoad, false);
            btnLoad.Click += (s, e) => LoadFile();
            // แถวแรก: ตารางคอลัมน์ตามขนาดจริง ทุกตัว Anchor ซ้ายอย่างเดียว = กึ่งกลางแนวตั้งเดียวกัน ไม่ขึ้นกับความสูงของ TextBox/DPI
            int col = 0;
            foreach (Control c in new Control[] { txtFile, btnBrowse, lblJob, txtJob, btnLoad })
            {
                top.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
                c.Anchor = AnchorStyles.Left;
                c.Margin = new Padding(c == lblJob ? 18 : 0, 3, c == btnLoad ? 0 : 8, 3);
                top.Controls.Add(c, col++, 0);
            }

            var row2 = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, Padding = new Padding(14, 4, 14, 12), WrapContents = true, BackColor = Color.White };
            var lblTpl = new Label { Text = "Template", AutoSize = true, Margin = new Padding(0, 8, 6, 0), Font = new Font(Font, FontStyle.Bold), ForeColor = Theme.Text };
            cmbTpl = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = 250, Margin = new Padding(0, 3, 8, 0) };
            LoadTemplates();
            cmbTpl.SelectedIndexChanged += (s, e) => { if (!_loading) LoadFile(); };
            btnCheck = new Button { Text = "ตรวจรูปแบบไฟล์", Width = 140, Height = 30, Enabled = false, Margin = new Padding(0, 0, 18, 0) }; Theme.Style(btnCheck, false);
            btnCheck.Click += (s, e) => { LoadFile(); ShowIssues(true); };
            lblCheck = new Label { AutoSize = true, Margin = new Padding(0, 9, 24, 0), Font = new Font(Font, FontStyle.Bold) };
            chkJob = new CheckBox { Text = "แก้ข้อมูลงานด้วย (เรือ / เที่ยว / สายเรือ / ETD / ETA / ท่า)", AutoSize = true, Checked = true, Margin = new Padding(0, 9, 24, 0), ForeColor = Theme.Text };
            chkJob.CheckedChanged += (s, e) => { _tested = ""; UpdateButtons(); };
            chkForce = new CheckBox { Text = "เขียนทับ HB/L ที่ถูกแก้ใน SMF แล้ว", AutoSize = true, Checked = false, Margin = new Padding(0, 9, 24, 0), ForeColor = Color.Firebrick };
            chkForce.CheckedChanged += (s, e) => { _tested = ""; UpdateButtons(); };
            btnDry = new Button { Text = "ทดสอบ (Dry run)", Width = 140, Height = 30, Enabled = false, Margin = new Padding(0, 0, 8, 0) }; Theme.Style(btnDry, false);
            btnDry.Click += (s, e) => Run(true);
            btnImport = new Button { Text = "นำเข้า", Width = 120, Height = 30, Enabled = false, Margin = new Padding(0, 0, 8, 0) }; Theme.Style(btnImport, true);
            btnImport.Click += (s, e) => Run(false);
            lblInfo = new Label { AutoSize = true, Margin = new Padding(16, 9, 0, 0), ForeColor = Color.FromArgb(90, 110, 98) };
            row2.Controls.AddRange(new Control[] { lblTpl, cmbTpl, btnCheck, lblCheck, chkJob, chkForce, btnDry, btnImport, lblInfo });
            CenterRow(row2);

            grid = new DataGridView
            {
                Dock = DockStyle.Fill, ReadOnly = true, AllowUserToAddRows = false, AllowUserToDeleteRows = false, RowHeadersVisible = false,
                SelectionMode = DataGridViewSelectionMode.FullRowSelect, AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill, RowTemplate = { Height = 28 }
            };
            Theme.StyleGrid(grid);
            foreach (var c in new[] { "B/L No.", "HB/L Ref", "การทำ", "Shipper", "Consignee", "หีบห่อ", "KGS", "CBM", "หมายเหตุ" })
                grid.Columns.Add(c, c);
            int[] w = { 130, 115, 90, 170, 170, 90, 70, 60, 200 };
            for (int k = 0; k < w.Length; k++) { grid.Columns[k].FillWeight = w[k]; grid.Columns[k].MinimumWidth = k == 7 || k == 6 ? 56 : 70; }

            txtLog = new TextBox { Dock = DockStyle.Fill, Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical, Font = new Font("Consolas", 9.5f), BackColor = Color.FromArgb(28, 40, 34), ForeColor = Color.FromArgb(214, 234, 222), BorderStyle = BorderStyle.None };

            var layout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 5, Margin = new Padding(0), Padding = new Padding(0) };
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 64));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 170));
            // กรอบข้อความด้านล่าง: แถบหัว "บันทึกการทำงาน" + ปุ่มล้างข้อความ
            var logHost = new Panel { Dock = DockStyle.Fill, BackColor = Color.FromArgb(28, 40, 34) };
            var logBar = new Panel { Dock = DockStyle.Top, Height = 38, BackColor = Color.FromArgb(38, 56, 46) };
            logBar.Controls.Add(new Label { Text = "บันทึกการทำงาน", ForeColor = Color.FromArgb(190, 225, 205), AutoSize = true, Location = new Point(12, 9) });
            var btnClearLog = new Button { Text = "ล้างข้อความ", Width = 120, Height = 28, Anchor = AnchorStyles.Top | AnchorStyles.Right, Font = new Font("Segoe UI", 9f) };
            btnClearLog.Location = new Point(logBar.Width - 152, 5);
            Theme.Style(btnClearLog, false);
            btnClearLog.Click += (s, e) => txtLog.Clear();
            logBar.Controls.Add(btnClearLog);
            logBar.Resize += (s, e) => btnClearLog.Location = new Point(logBar.Width - 152, 5);
            logHost.Controls.Add(txtLog);
            logHost.Controls.Add(logBar);
            foreach (Control c in new Control[] { banner, top, row2, grid, logHost }) { c.Margin = new Padding(0); layout.Controls.Add(c); }
            Controls.Add(layout);
            UpdateButtons();
        }

        /// <summary>จัดทุกตัวในแถวให้กึ่งกลางแนวตั้งเดียวกัน (สูงแถวละ 30)</summary>
        static void CenterRow(FlowLayoutPanel panel)
        {
            foreach (Control c in panel.Controls)
            {
                int h = c.AutoSize ? c.GetPreferredSize(Size.Empty).Height : c.Height;
                var m = c.Margin;
                c.Margin = new Padding(m.Left, Math.Max(0, (30 - h) / 2), m.Right, 0);
            }
        }

        void LoadTemplates()
        {
            _loading = true;
            var errs = new List<string>();
            _tpls = EdiTemplate.LoadAll(EdiTemplate.Folder(_ini), errs);
            cmbTpl.Items.Clear();
            cmbTpl.Items.Add("อัตโนมัติ (ตรวจจากไฟล์)");
            foreach (var t in _tpls) cmbTpl.Items.Add(t);
            cmbTpl.SelectedIndex = 0;
            _loading = false;
            foreach (var e in errs) Log("Template EDI: " + e);
            if (_tpls.Count == 0) Log("ไม่พบ Template EDI ในโฟลเดอร์ " + EdiTemplate.Folder(_ini) + " — ตรวจได้เฉพาะโครงสร้างพื้นฐาน");
        }

        void ShowIssues(bool all)
        {
            if (_check == null) return;
            foreach (var i in _check.Issues)
                if (all || i.Level != "ข้อมูล") Log((i.Level == "ผิดพลาด" ? "✗ " : i.Level == "เตือน" ? "⚠ " : "✓ ") + i.Message);
        }

        public void SetFile(string path) { txtFile.Text = path; LoadFile(); }

        void Log(string msg) { txtLog.AppendText(DateTime.Now.ToString("HH:mm:ss") + "  " + _db.Sanitize(msg) + Environment.NewLine); }

        void Browse()
        {
            using (var dlg = new OpenFileDialog { Filter = "ไฟล์ EDI (*.xml)|*.xml|ทุกไฟล์|*.*" })
                if (dlg.ShowDialog(this) == DialogResult.OK) { txtFile.Text = dlg.FileName; LoadFile(); }
        }

        void LoadFile()
        {
            _tested = ""; _file = null; _check = null; grid.Rows.Clear(); lblCheck.Text = "";
            if (txtFile.Text == "" || !File.Exists(txtFile.Text)) { UpdateButtons(); return; }
            try
            {
                EdiTemplate chosen = cmbTpl.SelectedItem as EdiTemplate;               // null = อัตโนมัติ
                _check = EdiValidator.Check(txtFile.Text, chosen, _tpls);
                _tpl = chosen ?? _check.Detected;
                _file = EdiParser.Parse(txtFile.Text, _tpl);
                lblCheck.Text = (_check.Ok ? (_check.Warnings > 0 ? "⚠ รูปแบบผ่าน มีคำเตือน " + _check.Warnings : "✓ รูปแบบถูกต้อง") : "✗ รูปแบบไม่ผ่าน " + _check.Errors + " รายการ")
                                + (chosen == null ? "  ·  ตรวจพบ: " + (_check.Detected != null ? _check.Detected.Name : "ไม่ทราบผู้ส่ง (ใช้แบบทั่วไป)") : "");
                lblCheck.ForeColor = !_check.Ok ? Color.Firebrick : _check.Warnings > 0 ? Color.DarkGoldenrod : Theme.Primary;
                foreach (var b in _file.Bls)
                {
                    grid.Rows.Add(b.BlNo, "", "", FirstLine(b.V, "S_ADD"), FirstLine(b.V, "C_ADD"), Fields.Val(b.V, "PKGQTY") + " " + Fields.Val(b.V, "PKGUNIT"),
                                  Fields.Val(b.V, "GW"), Fields.Val(b.V, "CBM"), string.Join("; ", b.Notes));
                }
                lblInfo.Text = "เรือ " + _file.Vessel + " / " + _file.Voyage + "   ETD " + _file.Etd + "   ETA " + _file.Eta + "   ตู้ " + _file.Containers.Count + "   HB/L " + _file.Bls.Count;
                Log("อ่านไฟล์แล้ว: " + _file.Bls.Count + " HB/L, " + _file.Containers.Count + " ตู้");
                foreach (var p in _file.Problems) Log("ปัญหา: " + p);
                ShowIssues(false);
            }
            catch (Exception ex) { Log("อ่านไฟล์ไม่ได้: " + ex.GetBaseException().Message); }
            UpdateButtons();
        }

        static string FirstLine(Dictionary<string, string> v, string k)
        {
            return Fields.Val(v, k).Replace("\r\n", "\n").Split('\n').Select(x => x.Trim()).FirstOrDefault(x => x != "") ?? "";
        }

        string Key() { return txtFile.Text + "|" + txtJob.Text.Trim() + "|" + chkJob.Checked + "|" + chkForce.Checked + "|" + (_tpl != null ? _tpl.Id : ""); }

        void UpdateButtons()
        {
            btnCheck.Enabled = txtFile.Text != "" && File.Exists(txtFile.Text);
            bool ok = _file != null && _file.Problems.Count == 0 && _check != null && _check.Ok && txtJob.Text.Trim() != "" && _db.Configured;
            btnDry.Enabled = ok;
            btnImport.Enabled = ok && _tested == Key();
        }

        async void Run(bool dry)
        {
            string job = txtJob.Text.Trim();
            if (!dry)
            {
                string msg = "งาน : " + job + "\r\nไฟล์ : " + Path.GetFileName(txtFile.Text) + "\r\nเพิ่ม HB/L ใหม่ตามรายการ (B/L No. ที่มีในงานอยู่แล้วจะถูกแก้ไขแทนการเพิ่มซ้ำ)\r\n\r\nยืนยันการนำเข้า ?";
                if (MessageBox.Show(this, msg, "ยืนยันนำเข้า", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2) != DialogResult.Yes) return;
            }
            btnDry.Enabled = false; btnImport.Enabled = false; Cursor = Cursors.WaitCursor;
            string user = _ini.Get("App", "UserID", "BLSCAN"); bool uj = chkJob.Checked, force = chkForce.Checked; var f = _file;
            try
            {
                var r = await Task.Run(() => _db.ImportEdi(f, job, user, uj, dry, force));
                Log(r.Message);
                foreach (var n in r.Notes) Log("  " + n);
                foreach (var l in r.JobLines) Log("  งาน: " + l);
                for (int i = 0; i < r.Rows.Count && i < grid.Rows.Count; i++)
                {
                    grid.Rows[i].Cells[1].Value = r.Rows[i].DocNo;
                    grid.Rows[i].Cells[2].Value = r.Rows[i].Action;
                    grid.Rows[i].Cells[8].Value = string.Join("; ", r.Rows[i].Notes);
                    grid.Rows[i].DefaultCellStyle.BackColor = r.Rows[i].Action == "เพิ่มใหม่" ? Color.FromArgb(226, 244, 232) : r.Rows[i].Action == EdiRowResult.SkipText ? Color.FromArgb(236, 236, 236) : Color.FromArgb(255, 244, 214);
                }
                if (dry) _tested = Key(); else { _tested = ""; MessageBox.Show(this, r.Message, "นำเข้าแล้ว", MessageBoxButtons.OK, MessageBoxIcon.Information); }
            }
            catch (Exception ex) { _tested = ""; Log("ไม่สำเร็จ (ไม่มีข้อมูลเปลี่ยน): " + ex.GetBaseException().Message); }
            Cursor = Cursors.Default;
            UpdateButtons();
        }
    }
}
