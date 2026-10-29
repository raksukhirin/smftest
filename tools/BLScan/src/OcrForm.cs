// หน้าจอหลัก: เลือกไฟล์ B/L → ใส่ SFHBL.DOCNO (record ที่สร้างรอไว้) → Scan → preview HTML + แก้ค่า → ดูว่าจะเปลี่ยนอะไร → UPDATE SFHBL + UPDATE/INSERT SFMARK
using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace BLScan
{
    [ComVisible(true)]
    public class ScriptBridge
    {
        readonly OcrForm _f;
        public ScriptBridge(OcrForm f) { _f = f; }
        public void FocusField(string key) { _f.FocusField(key); }
    }

    public class OcrForm : Form
    {
        readonly Ini _ini;
        readonly Db _db;

        TextBox txtFile, txtDocNo, txtRaw, txtLog;
        Button btnBrowse, btnScan, btnDryRun, btnUpdate, btnSaveHtml, btnOpenBrowser, btnClear;
        Label lblDocState;
        WebBrowser web;
        TabControl tabs;
        TabPage tabFields, tabCompare, tabRaw, tabImage, tabLog;
        ListView lvCompare;
        PictureBox pic;
        ToolStripStatusLabel stDb, stMsg, stTpl;
        readonly Dictionary<string, TextBox> boxes = new Dictionary<string, TextBox>();
        readonly Timer previewTimer = new Timer();
        readonly Timer docTimer = new Timer { Interval = 600 };

        string sourceFile = "";
        bool scanned, updated, busy, loadingValues;
        ComboBox cmbTemplate;
        Label lblTplState;
        List<Template> templates = new List<Template>();
        Template currentTemplate = Template.Generic();
        OcrPage lastOcr;                 // ผล OCR ล่าสุด — เปลี่ยน Template แล้วอ่านซ้ำได้ทันทีโดยไม่ต้อง OCR ใหม่
        bool templateMismatch, dirty, loadingTemplates;
        ExistingDoc existing;           // record เดิมใน DB (null = ไม่พบ DOCNO)
        bool isReference;               // DOCNO อ้างอิง (ใช้เทียบเท่านั้น ห้ามเขียน)
        List<string> notes = new List<string>();
        string lastHtml = "";
        string lastCheckedDoc = null;

        static readonly Color EmptyBack = Color.FromArgb(255, 245, 245);
        static readonly Color SysBack = Color.FromArgb(241, 243, 245);

        public OcrForm(Ini ini)
        {
            Load += (s, e) => Theme.Apply(this);
            _ini = ini;
            _db = new Db(ini);
            BuildUi();
            LoadTemplates();
            previewTimer.Interval = 400;
            previewTimer.Tick += (s, e) => { previewTimer.Stop(); RenderPreview(); };
            docTimer.Tick += (s, e) => { docTimer.Stop(); CheckDocNoAsync(); };
            Shown += (s, e) => CheckDbAsync();
        }

        // ------------------------------------------------------------ UI
        void BuildUi()
        {
            Text = "BLScan — Scan House B/L แล้ว Update เข้า SMF";
            Font = new Font("Tahoma", 9f);
            Width = 1440; Height = 920;
            StartPosition = FormStartPosition.CenterScreen;

            var top = new TableLayoutPanel { Dock = DockStyle.Top, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, ColumnCount = 1, RowCount = 2, Padding = new Padding(8, 6, 8, 6) };
            top.RowStyles.Add(new RowStyle(SizeType.AutoSize)); top.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            top.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            var row1 = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false, AutoSize = true };
            var row2 = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = true, AutoSize = true };      // จอแคบ: ปุ่มขึ้นแถวใหม่ ไม่ล้นขอบ/ไม่ถูกตัด
            top.Controls.Add(row1, 0, 0);
            top.Controls.Add(row2, 0, 1);

            row1.Controls.Add(new Label { Text = "ไฟล์ B/L:", AutoSize = true, Margin = new Padding(0, 7, 4, 0) });
            txtFile = new TextBox { Width = 520, ReadOnly = true, BackColor = Color.White };
            row1.Controls.Add(txtFile);
            btnBrowse = new Button { Text = "เลือกไฟล์…", Width = 90, Height = 26 };
            btnBrowse.Click += (s, e) => BrowseFile();
            row1.Controls.Add(btnBrowse);
            row1.Controls.Add(new Label { Text = "HB/L Ref:", AutoSize = true, Margin = new Padding(16, 7, 4, 0), Font = new Font(Font, FontStyle.Bold) });
            txtDocNo = new TextBox { Width = 170, CharacterCasing = CharacterCasing.Upper, MaxLength = 20, Font = new Font("Consolas", 10.5f) };
            txtDocNo.KeyDown += (s, e) => { if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; docTimer.Stop(); CheckDocNoAsync(); } };
            txtDocNo.Leave += (s, e) => { docTimer.Stop(); CheckDocNoAsync(); };
            // พิมพ์/แก้เลข → ปิดปุ่ม Update ทันทีจนกว่าจะตรวจใน DB ผ่าน (ตรวจอัตโนมัติหลังหยุดพิมพ์ 0.6 วินาที)
            txtDocNo.TextChanged += (s, e) =>
            {
                lastCheckedDoc = null; existing = null; isReference = false; updated = false;
                UpdateButtons();
                if (NormDoc() == "") { lblDocState.Text = "ใส่เลข HBL ที่สร้างรอไว้ เช่น BLE26100001"; lblDocState.ForeColor = Color.DimGray; docTimer.Stop(); return; }
                lblDocState.Text = "รอตรวจ DOCNO ใน DB…"; lblDocState.ForeColor = Color.DimGray;
                docTimer.Stop(); docTimer.Start();
            };
            row1.Controls.Add(txtDocNo);
            lblDocState = new Label { AutoSize = true, Margin = new Padding(8, 7, 0, 0), ForeColor = Color.DimGray, Text = "ใส่เลข HBL ที่สร้างรอไว้ เช่น BLE26100001" };
            row1.Controls.Add(lblDocState);

            btnScan = new Button { Text = "▶ Scan", Width = 100, Height = 28, Font = new Font(Font, FontStyle.Bold), Tag = "primary" };
            btnScan.Click += (s, e) => ScanAsync();
            btnDryRun = new Button { Text = "ทดสอบ (Dry run)", Width = 130, Height = 28, Enabled = false };
            btnDryRun.Click += (s, e) => UpdateAsync(true);
            btnUpdate = new Button { Text = "Update DB", Width = 120, Height = 28, Enabled = false, Tag = "primary" };
            btnUpdate.Click += (s, e) => UpdateAsync(false);
            btnSaveHtml = new Button { Text = "บันทึก HTML…", Width = 110, Height = 28, Enabled = false };
            btnSaveHtml.Click += (s, e) => SaveHtml();
            btnOpenBrowser = new Button { Text = "เปิดใน Browser", Width = 110, Height = 28, Enabled = false };
            btnOpenBrowser.Click += (s, e) => OpenInBrowser();
            btnClear = new Button { Text = "ล้าง / BL ใหม่", Width = 110, Height = 28, Margin = new Padding(24, 3, 3, 3) };
            btnClear.Click += (s, e) => ClearAll();
            var btnSettings = new Button { Text = "ตั้งค่า DB…", Width = 100, Height = 28, Margin = new Padding(24, 3, 3, 3) };
            btnSettings.Click += (s, e) => OpenSettings();
            var lblTpl = new Label { Text = "Template:", AutoSize = true, Margin = new Padding(0, 8, 4, 0), Font = new Font(Font, FontStyle.Bold) };
            cmbTemplate = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = 300, Margin = new Padding(0, 4, 4, 0), DropDownWidth = 460 };
            cmbTemplate.SelectedIndexChanged += (s, e) => OnTemplateChanged();
            lblTplState = new Label { AutoSize = true, Margin = new Padding(0, 8, 14, 0), ForeColor = Color.DimGray };
            row2.Controls.Add(lblTpl);
            row2.Controls.Add(cmbTemplate);
            row2.Controls.Add(lblTplState);
            var btnDesigner = new Button { Text = "Template Designer…", Width = 150, Height = 28 };
            btnDesigner.Click += (s, e) => OpenDesigner();
            row2.Controls.AddRange(new Control[] { btnScan, btnDryRun, btnUpdate, btnSaveHtml, btnOpenBrowser, btnClear, btnSettings, btnDesigner });

            var split = new SplitContainer { Dock = DockStyle.Fill, Orientation = Orientation.Vertical };
            web = new WebBrowser { Dock = DockStyle.Fill, ScriptErrorsSuppressed = true, AllowWebBrowserDrop = false, ObjectForScripting = new ScriptBridge(this) };
            web.DocumentText = StartHtml();
            split.Panel1.Controls.Add(web);

            tabs = new TabControl { Dock = DockStyle.Fill };
            tabFields = new TabPage("ข้อมูลที่อ่านได้ (แก้ไขได้)");
            tabCompare = new TabPage("สิ่งที่จะเปลี่ยนใน DB");
            tabRaw = new TabPage("ข้อความ OCR");
            tabImage = new TabPage("ภาพต้นฉบับ");
            tabLog = new TabPage("Log");
            tabs.TabPages.AddRange(new[] { tabFields, tabCompare, tabRaw, tabImage, tabLog });
            split.Panel2.Controls.Add(tabs);

            BuildFieldEditor();

            lvCompare = new ListView { Dock = DockStyle.Fill, View = View.Details, FullRowSelect = true, GridLines = true };
            lvCompare.Columns.Add("ช่อง", 150); lvCompare.Columns.Add("คอลัมน์", 140); lvCompare.Columns.Add("ใน DB ตอนนี้", 220);
            lvCompare.Columns.Add("ค่าจาก Scan (จะเขียน)", 220); lvCompare.Columns.Add("ผล", 80);
            lvCompare.DoubleClick += (s, e) => { if (lvCompare.SelectedItems.Count > 0 && lvCompare.SelectedItems[0].Tag != null) FocusField((string)lvCompare.SelectedItems[0].Tag); };
            tabCompare.Controls.Add(lvCompare);

            txtRaw = new TextBox { Dock = DockStyle.Fill, Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Both, WordWrap = false, Font = new Font("Consolas", 9.5f), BackColor = Color.White };
            tabRaw.Controls.Add(txtRaw);
            var picHost = new Panel { Dock = DockStyle.Fill, AutoScroll = true, BackColor = Color.FromArgb(222, 226, 230) };
            pic = new PictureBox { SizeMode = PictureBoxSizeMode.Zoom, Location = new Point(0, 0) };
            picHost.Controls.Add(pic);
            picHost.Resize += (s, e) => FitPicture(picHost);
            tabImage.Controls.Add(picHost);
            txtLog = new TextBox { Dock = DockStyle.Fill, Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical, Font = new Font("Consolas", 9f), BackColor = Color.White };
            tabLog.Controls.Add(txtLog);

            var status = new StatusStrip();
            stDb = new ToolStripStatusLabel("DB: กำลังตรวจ…") { Spring = false, BorderSides = ToolStripStatusLabelBorderSides.Right };
            stMsg = new ToolStripStatusLabel("พร้อม") { Spring = true, TextAlign = ContentAlignment.MiddleLeft };
            stTpl = new ToolStripStatusLabel("Template: -") { BorderSides = ToolStripStatusLabelBorderSides.Right };
            status.Items.Add(stDb); status.Items.Add(stTpl); status.Items.Add(stMsg);

            Controls.Add(split);
            Controls.Add(top);
            Controls.Add(status);
            Load += (s, e) => { split.SplitterDistance = (int)(ClientSize.Width * 0.56); };
        }

        void FitPicture(Panel host)
        {
            if (pic.Image == null) return;
            int w = Math.Max(200, host.ClientSize.Width - 4);
            pic.Size = new Size(w, (int)((double)w * pic.Image.Height / pic.Image.Width));
        }

        void BuildFieldEditor()
        {
            var host = new Panel { Dock = DockStyle.Fill, AutoScroll = true };
            var tl = new TableLayoutPanel { Dock = DockStyle.Top, AutoSize = true, ColumnCount = 2, Padding = new Padding(4) };
            tl.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 200));
            tl.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            string group = null;
            foreach (var f in Fields.All)
            {
                if (f.Group != group)
                {
                    group = f.Group;
                    var gh = new Label
                    {
                        Text = group, AutoSize = false, Height = 24, Dock = DockStyle.Fill, Font = new Font(Font, FontStyle.Bold),
                        BackColor = Color.FromArgb(231, 245, 255), ForeColor = Color.FromArgb(24, 100, 171),
                        TextAlign = ContentAlignment.MiddleLeft, Margin = new Padding(0, 8, 0, 2), Padding = new Padding(4, 0, 0, 0)
                    };
                    tl.Controls.Add(gh);
                    tl.SetColumnSpan(gh, 2);
                }
                var lb = new Label { Text = f.Caption + "\r\n" + f.DbName, AutoSize = true, Margin = new Padding(0, 4, 4, 2), ForeColor = Color.FromArgb(52, 58, 64) };
                var tb = new TextBox { Dock = DockStyle.Fill, Tag = f.Key, Font = new Font("Consolas", 9.5f), Margin = new Padding(0, 3, 0, 3) };
                if (f.Kind == FieldKind.Memo)
                {
                    tb.Multiline = true; tb.AcceptsReturn = true; tb.ScrollBars = ScrollBars.Vertical; tb.Height = f.Key == "GOODS" || f.Key == "MARKDESC" ? 150 : 76;
                }
                if (f.System) { tb.BackColor = SysBack; tb.ReadOnly = true; }
                tb.TextChanged += (s, e) => OnFieldChanged((TextBox)s);
                boxes[f.Key] = tb;
                tl.Controls.Add(lb);
                tl.Controls.Add(tb);
            }
            host.Controls.Add(tl);
            tabFields.Controls.Add(host);
        }

        void OnFieldChanged(TextBox tb)
        {
            MarkEmpty(tb);
            if (loadingValues) return;
            dirty = true;
            previewTimer.Stop();
            previewTimer.Start();
        }

        void MarkEmpty(TextBox tb)
        {
            var f = Fields.Get((string)tb.Tag);
            if (!f.System) tb.BackColor = scanned && tb.Text.Trim() == "" ? EmptyBack : Color.White;
        }

        public void FocusField(string key)
        {
            TextBox tb;
            if (!boxes.TryGetValue(key, out tb)) return;
            tabs.SelectedTab = tabFields;
            ((Panel)tb.Parent.Parent).ScrollControlIntoView(tb);
            tb.Focus();
            tb.SelectAll();
        }

        void Log(string msg)
        {
            txtLog.AppendText(DateTime.Now.ToString("HH:mm:ss") + "  " + _db.Sanitize(msg) + Environment.NewLine);   // กรอง server/port/db/user ออกจาก log
        }

        string Safe(string text) { return _db.Sanitize(text); }

        void SetBusy(bool b, string msg)
        {
            busy = b;
            UseWaitCursor = b;
            btnScan.Enabled = btnBrowse.Enabled = !b;
            UpdateButtons();
            if (msg != null) stMsg.Text = msg;
        }

        void UpdateButtons()
        {
            bool ready = scanned && !busy && !templateMismatch && existing != null && _db.Configured && txtDocNo.Text.Trim() != "";
            btnDryRun.Enabled = ready;
            btnUpdate.Enabled = ready && !isReference;
            btnSaveHtml.Enabled = btnOpenBrowser.Enabled = scanned;
        }

        Dictionary<string, string> CurrentValues()
        {
            return boxes.ToDictionary(kv => kv.Key, kv => kv.Value.Text);
        }

        void SetValue(string key, string value)
        {
            TextBox tb;
            if (boxes.TryGetValue(key, out tb)) tb.Text = (value ?? "").Replace("\r\n", "\n").Replace("\n", "\r\n");
        }

        // ------------------------------------------------------------ DB
        async void CheckDbAsync()
        {
            if (!_ini.Exists) { stDb.Text = "DB: ไม่พบ " + Path.GetFileName(_ini.Path); stDb.ForeColor = Color.Firebrick; Log("ไม่พบไฟล์ ini: " + _ini.Path); return; }
            if (!_db.Configured) { stDb.Text = "DB: ยังไม่ได้ตั้งค่า — กด \"ตั้งค่า DB…\""; stDb.ForeColor = Color.Firebrick; return; }
            string secretProblem = _db.SecretProblem;
            if (secretProblem != "") { stDb.Text = "DB: ถอดรหัสผ่านใน ini ไม่ได้ — กด \"ตั้งค่า DB…\""; stDb.ForeColor = Color.Firebrick; Log(secretProblem); return; }
            stDb.Text = "DB: กำลังเชื่อมต่อ…";
            stDb.ForeColor = Color.DimGray;
            try
            {
                await Task.Run(() => _db.TestConnection());
                stDb.Text = "DB: เชื่อมต่อแล้ว ✓";            // ไม่แสดง server/database/user บนหน้าจอ
                stDb.ForeColor = Color.DarkGreen;
                Log("เชื่อมต่อ DB สำเร็จ");
            }
            catch (Exception ex)
            {
                stDb.Text = "DB: เชื่อมต่อไม่ได้ ✗";
                stDb.ForeColor = Color.Firebrick;
                Log("เชื่อมต่อ DB ไม่ได้: " + ex.Message);
            }
            UpdateButtons();
        }

        static string StartHtml()
        {
            return "<html><body style=\"font-family:Tahoma;color:#666;padding:30px\"><h3>House B/L preview</h3>" +
                   "1) เลือกไฟล์ B/L (PDF / JPG / PNG / TIF)<br>2) ใส่เลข HB/L Ref ของ record ที่สร้างรอไว้<br>" +
                   "3) กด ▶ Scan — ดูแท็บ \"สิ่งที่จะเปลี่ยนใน DB\" ตรวจ/แก้ค่า แล้วกด Update DB</body></html>";
        }

        /// <summary>ล้างทุกอย่างเพื่อเริ่ม B/L ใบใหม่ (ไม่แตะ DB)</summary>
        void ClearAll()
        {
            if (busy) return;
            if (scanned && !updated &&
                MessageBox.Show(this, "ข้อมูลที่ scan/แก้ไขไว้ยังไม่ได้บันทึกเข้า DB\r\nต้องการล้างและเริ่ม B/L ใหม่หรือไม่?", "ล้าง / BL ใหม่",
                                MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2) != DialogResult.Yes) return;

            docTimer.Stop(); previewTimer.Stop();
            scanned = false; updated = false; existing = null; isReference = false;
            lastOcr = null; templateMismatch = false; dirty = false;
            sourceFile = ""; txtFile.Text = "";
            notes = new List<string>(); lastHtml = "";
            txtDocNo.Text = "";                      // TextChanged จะรีเซ็ตสถานะ DOCNO และปิดปุ่ม Update ให้
            lastCheckedDoc = null;

            loadingValues = true;
            foreach (var kv in boxes)
            {
                kv.Value.Text = "";
                kv.Value.BackColor = Fields.Get(kv.Key).System ? SysBack : Color.White;
            }
            loadingValues = false;

            lvCompare.Items.Clear();
            tabCompare.Text = "สิ่งที่จะเปลี่ยนใน DB";
            txtRaw.Text = "";
            if (pic.Image != null) { var old = pic.Image; pic.Image = null; old.Dispose(); }
            web.DocumentText = StartHtml();
            tabs.SelectedTab = tabFields;
            UpdateButtons();
            ShowTemplateState();
            stMsg.Text = "พร้อม — เริ่ม B/L ใหม่";
            txtDocNo.Focus();
            Log("ล้างข้อมูล เริ่ม B/L ใหม่");
        }

        /// <summary>Template Designer (เฉพาะ admin): ต้องเป็นโฟลเดอร์ Template ที่เปิดได้และเขียนได้ แล้วเข้าสู่ระบบ admin ก่อน</summary>
        void OpenDesigner()
        {
            string folder = Program.TemplateDir(_ini, null);
            if (!Directory.Exists(folder))
            {
                MessageBox.Show(this, "โฟลเดอร์ Template เปิดไม่ได้ตอนนี้ (กำลังใช้สำเนาสำรอง) — แก้ Template ไม่ได้\r\n" + folder, "Template Designer", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            if (!SettingsForm.CanWrite(folder))
            {
                MessageBox.Show(this, "โฟลเดอร์ Template เป็นอ่านอย่างเดียวสำหรับคุณ — Designer ใช้ได้เฉพาะ admin ที่มีสิทธิ์เขียนโฟลเดอร์\r\n" + folder, "Template Designer", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            if (!AdminUi.EnsureLogin(this, folder)) return;
            try
            {
                using (var d = new DesignerForm(_ini, folder)) d.ShowDialog(this);
            }
            finally { AdminAuth.Logout(); }
            LoadTemplates();
        }

        void OpenSettings()
        {
            using (var f = new SettingsForm(_ini))
            {
                f.ShowDialog(this);
                if (f.TemplatesChanged || f.Saved) LoadTemplates();        // เปลี่ยนโฟลเดอร์ Template หรือ admin นำเข้า/ลบ Template
                if (!f.Saved) return;
                Log("บันทึกการตั้งค่า DB ลง " + _ini.Path + " (รหัสผ่านเข้ารหัส)");
                existing = null; lastCheckedDoc = null;
                CheckDbAsync();
                CheckDocNoAsync();
            }
        }

        string NormDoc() { return txtDocNo.Text.Trim().ToUpperInvariant(); }

        async void CheckDocNoAsync()
        {
            string doc = NormDoc();
            if (doc == lastCheckedDoc) return;
            lastCheckedDoc = doc;
            updated = false;
            existing = null;
            isReference = false;
            lvCompare.Items.Clear();
            SetValue("DOCNO", doc);
            if (doc == "") { lblDocState.Text = "ใส่เลข HBL ที่สร้างรอไว้ เช่น BLE26100001"; lblDocState.ForeColor = Color.DimGray; UpdateButtons(); return; }
            if (!_db.Configured) { lblDocState.Text = "(ไม่ได้ตั้งค่า DB — ตรวจ DOCNO ไม่ได้)"; UpdateButtons(); return; }

            lblDocState.Text = "กำลังตรวจ…"; lblDocState.ForeColor = Color.DimGray;
            try
            {
                var ex = await Task.Run(() => _db.LoadExisting(doc));
                if (NormDoc() != doc) return;                         // ผู้ใช้พิมพ์ใหม่ระหว่างรอ
                existing = ex;
                string refDoc = _ini.Get("App", "ReferenceDocNo").Trim().ToUpperInvariant();
                isReference = refDoc != "" && refDoc == doc;
                if (ex == null)
                {
                    lblDocState.Text = "✗ ไม่พบ HB/L Ref นี้ในระบบ — ต้องสร้าง record รอไว้ก่อน (โปรแกรมนี้ไม่สร้าง HB/L ใหม่)";
                    lblDocState.ForeColor = Color.Firebrick;
                    foreach (var k in new[] { "JOBNO", "MASTERNO", "JOBCLASS", "JOBTYPE", "LOADTYPE", "DOCDATE" }) SetValue(k, "");
                    Log("HB/L Ref " + doc + " ไม่มีในระบบ");
                }
                else
                {
                    loadingValues = true;
                    foreach (var k in new[] { "JOBNO", "MASTERNO", "JOBCLASS", "JOBTYPE", "LOADTYPE", "DOCDATE" }) SetValue(k, Fields.Val(ex.V, k));
                    loadingValues = false;
                    string sfmark = ex.MarkRows == 0 ? "รายการสินค้ายังไม่มี → จะสร้างใหม่" : ex.MarkRows == 1 ? "รายการสินค้า 1 รายการ → จะแก้ไข" : "รายการสินค้า " + ex.MarkRows + " รายการ → แก้ไขรายการแรก";
                    lblDocState.Text = (isReference ? "ℹ record อ้างอิง — ใช้เทียบอย่างเดียว ไม่เขียน · " : "✓ พบ record · ") +
                                       "งาน " + ex.JobNo + " (" + ex.JobClass + ") · " + sfmark;
                    lblDocState.ForeColor = isReference ? Color.SteelBlue : Color.DarkGreen;
                    Log("พบ " + doc + ": JOBNO=" + ex.JobNo + " JOBCLASS=" + ex.JobClass + " · " + sfmark);
                }
                if (scanned) await EnrichAsync();
                FillCompare();
            }
            catch (Exception ex)
            {
                lblDocState.Text = "ตรวจไม่ได้: " + Safe(ex.Message);
                lblDocState.ForeColor = Color.Firebrick;
                Log("ตรวจ DOCNO ผิดพลาด: " + ex);
                lastCheckedDoc = null;
            }
            UpdateButtons();
            if (scanned) RenderPreview();
        }

        /// <summary>เติมรหัสท่า / หน่วย / คู่ค้า (SMBUSINESS ตามชื่อ ไม่เจอ = N/A) ที่ OCR ไม่มี</summary>
        async Task EnrichAsync()
        {
            if (!_db.Configured || existing == null) return;
            var v = CurrentValues();
            string jobNo = existing.JobNo;
            try
            {
                var old = existing.V;
                var found = await Task.Run(() => { var n = _db.Enrich(v, jobNo, old); return n; });
                loadingValues = true;
                foreach (var k in new[] { "RECPORT", "LOADPORT", "DISPORT", "DELPORT", "FINALPORT", "UNITCODE", "SHIPPER", "CONSIGNEE", "NOTIFY", "AGENTNO",
                                          "SHIPPERNAME", "CONSIGNEENAME", "NOTIFYNAME", "AGENTNAME", "A_ADD" })
                    if (Fields.Val(v, k) != boxes[k].Text) SetValue(k, Fields.Val(v, k));
                loadingValues = false;
                notes.RemoveAll(n => n.StartsWith("[DB] "));
                foreach (var m in found) notes.Add("[DB] " + m);
                foreach (var m in found) Log(m);
            }
            catch (Exception ex)
            {
                loadingValues = false;
                Log("เติมรหัสจาก DB ไม่ได้: " + ex.Message);
            }
        }

        /// <summary>ตาราง "ก่อน → หลัง" ของสิ่งที่จะถูกเขียน (แหล่งเดียวกับที่ Db.Update ใช้)</summary>
        void FillCompare()
        {
            lvCompare.Items.Clear();
            if (existing == null)
            {
                lvCompare.Items.Add(new ListViewItem(new[] { "(ไม่พบ HB/L Ref ในระบบ — ไม่มีข้อมูลให้เทียบ)" }));
                tabCompare.Text = "สิ่งที่จะเปลี่ยนใน DB";
                return;
            }
            var plan = Fields.Plan(CurrentValues(), existing.V);
            string act = existing.MarkRows == 0 ? "รายการสินค้า: สร้างใหม่ 1 รายการ" : "รายการสินค้า: แก้ไขรายการแรก" + (existing.MarkRows > 1 ? " (จาก " + existing.MarkRows + " รายการ)" : "");
            lvCompare.Items.Add(new ListViewItem(new[] { act, "", "", "", "" }) { BackColor = Color.FromArgb(231, 245, 255) });
            int chg = 0, same = 0, skip = 0;
            foreach (var c in plan)
            {
                string status = c.Skip ? "ข้าม (ว่าง)" : c.Differs ? "เปลี่ยน" : "เท่าเดิม";
                if (c.Skip) skip++; else if (c.Differs) chg++; else same++;
                var it = new ListViewItem(new[] { c.F.Caption, c.F.DbName, OneLine(c.Old), OneLine(c.New), status }) { Tag = c.F.Key };
                it.ForeColor = c.Skip ? Color.Gray : c.Differs ? Color.Firebrick : Color.DarkGreen;
                lvCompare.Items.Add(it);
            }
            tabCompare.Text = "สิ่งที่จะเปลี่ยนใน DB (เปลี่ยน " + chg + " · เท่าเดิม " + same + " · ข้าม " + skip + ")";
        }

        static string OneLine(string s) { return (s ?? "").TrimEnd('\r', '\n').Replace("\r\n", " ⏎ ").Replace("\n", " ⏎ "); }

        // ------------------------------------------------------------ Scan
        void BrowseFile()
        {
            using (var dlg = new OpenFileDialog())
            {
                dlg.Filter = "B/L (PDF, รูปภาพ)|*.pdf;*.jpg;*.jpeg;*.png;*.tif;*.tiff;*.bmp|ทุกไฟล์|*.*";
                dlg.Title = "เลือกไฟล์ House B/L";
                if (dlg.ShowDialog(this) != DialogResult.OK) return;
                txtFile.Text = dlg.FileName;
                sourceFile = dlg.FileName;
            }
            ShowSourceAsync(sourceFile);
        }

        public void SetSourceFile(string path) { txtFile.Text = path; sourceFile = path; ShowSourceAsync(path); }

        int showSeq;

        /// <summary>แสดงภาพต้นฉบับทันทีที่เลือกไฟล์ (ก่อน Scan) — ถ้าเลือกไฟล์ใหม่ระหว่างโหลด ผลเก่าจะถูกทิ้ง</summary>
        async void ShowSourceAsync(string file)
        {
            int seq = ++showSeq;
            if (busy || string.IsNullOrEmpty(file) || !File.Exists(file)) return;
            int width = _ini.GetInt("OCR", "RenderWidth", 2000);
            int pageNo = Math.Max(1, _ini.GetInt("OCR", "Page", 1));
            try
            {
                var bmp = await Task.Run(() => WinRtOcr.LoadPageImage(file, pageNo - 1, width));
                if (seq != showSeq || busy || IsDisposed) { bmp.Dispose(); return; }
                if (pic.Image != null) pic.Image.Dispose();
                pic.Image = bmp;
                FitPicture((Panel)pic.Parent);
                tabs.SelectedTab = tabImage;
                stMsg.Text = "เลือกไฟล์แล้ว — ตรวจภาพต้นฉบับ แล้วกด Scan";
            }
            catch (Exception ex) { Log("แสดงภาพต้นฉบับไม่ได้: " + ex.Message); }
        }
        public void SetDocNo(string doc) { txtDocNo.Text = doc; }

        public async void ScanAsync()
        {
            if (sourceFile == "" || !File.Exists(sourceFile)) { MessageBox.Show(this, "กรุณาเลือกไฟล์ B/L ก่อน", "BLScan", MessageBoxButtons.OK, MessageBoxIcon.Information); return; }
            SetBusy(true, "กำลัง OCR " + Path.GetFileName(sourceFile) + " …");
            string file = sourceFile;
            int width = _ini.GetInt("OCR", "RenderWidth", 2000);
            string lang = _ini.Get("OCR", "Language", "en-US");
            int pageNo = Math.Max(1, _ini.GetInt("OCR", "Page", 1));
            var sw = System.Diagnostics.Stopwatch.StartNew();
            try
            {
                CheckDocNoAsync();
                // OCR บน thread pool (MTA) — WinRT ทำงานได้และไม่ค้างตอนปิดโปรแกรม
                int second = _ini.GetInt("OCR", "SecondScale", 3000);
                var ocr = await Task.Run(() => WinRtOcr.ScanFused(file, pageNo - 1, width, lang, second));
                lastOcr = ocr;
                if (pic.Image != null) pic.Image.Dispose();
                pic.Image = ocr.Image;
                FitPicture((Panel)pic.Parent);
                txtRaw.Text = ocr.RawText;
                Log(string.Format("OCR {0}: {1} คำ, ซ่อมคำที่ถูกตัด {2} คำ ({3:0.0} วินาที)", Path.GetFileName(file), ocr.Words.Count, ocr.Repaired, sw.Elapsed.TotalSeconds));

                await ApplyParseAsync(ocr);
                SetBusy(false, templateMismatch ? "⚠ Template ไม่ตรงกับไฟล์ — เลือก Template ใหม่ (อ่านซ้ำทันที)" : "Scan เสร็จ — ดูแท็บ \"สิ่งที่จะเปลี่ยนใน DB\" แล้วกด Update DB");
            }
            catch (Exception ex)
            {
                loadingValues = false;
                SetBusy(false, "Scan ไม่สำเร็จ");
                Log("Scan ผิดพลาด: " + ex);
                var inner = ex is AggregateException ? ex.GetBaseException() : ex;
                MessageBox.Show(this, "อ่านไฟล์ไม่สำเร็จ:\r\n" + Safe(inner.Message), "BLScan", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // ------------------------------------------------------------ Template
        void LoadTemplates()
        {
            string keepId = currentTemplate != null && cmbTemplate.Items.Count > 0 ? currentTemplate.Id : _ini.Get("App", "LastTemplate");
            var info = TemplateStore.Load(Program.TemplateDir(_ini, null), Program.DefaultTemplateDir(), Program.CacheTemplateDir());
            templates = info.Templates;
            loadingTemplates = true;
            cmbTemplate.Items.Clear();
            foreach (var t in templates) cmbTemplate.Items.Add(t);
            currentTemplate = TemplateStore.Find(templates, keepId) ?? templates[0];
            cmbTemplate.SelectedItem = currentTemplate;
            loadingTemplates = false;
            string where = info.Source == "shared" ? "โฟลเดอร์กลาง" : info.Source == "cache" ? "สำเนาสำรองในเครื่อง ⚠" : "ข้าง exe";
            stTpl.Text = "Template " + (templates.Count - 1) + " ฉบับ · " + where;
            stTpl.ForeColor = info.Source == "cache" ? Color.Firebrick : Color.DimGray;
            Log("โหลด Template " + (templates.Count - 1) + " ฉบับ จาก" + where);
            foreach (var e in info.Errors) Log("Template: " + e);
            ShowTemplateState();
        }

        void ShowTemplateState()
        {
            if (currentTemplate.IsGeneric) { lblTplState.Text = "(ไม่ได้จูน)"; lblTplState.ForeColor = Color.DarkOrange; }
            else if (!scanned) { lblTplState.Text = ""; }
            else if (templateMismatch) { lblTplState.Text = "⚠ ไม่ตรงกับไฟล์"; lblTplState.ForeColor = Color.Firebrick; }
            else { lblTplState.Text = "✓ ผู้ออกตรง"; lblTplState.ForeColor = Color.DarkGreen; }
        }

        async void OnTemplateChanged()
        {
            if (loadingTemplates) return;
            var picked = cmbTemplate.SelectedItem as Template;
            if (picked == null || ReferenceEquals(picked, currentTemplate)) return;
            if (lastOcr != null && scanned && !updated && dirty &&
                MessageBox.Show(this, "คุณแก้ค่าในช่องไว้แล้ว — เปลี่ยน Template จะอ่านจาก OCR เดิมใหม่และ **ทับค่าที่แก้ไว้**\r\nต้องการเปลี่ยนหรือไม่?", "เปลี่ยน Template",
                                MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2) != DialogResult.Yes)
            {
                loadingTemplates = true; cmbTemplate.SelectedItem = currentTemplate; loadingTemplates = false;
                return;
            }
            currentTemplate = picked;
            try { _ini.Set("App", "LastTemplate", picked.Id); } catch { }
            Log("เลือก Template: " + picked.Name);
            if (lastOcr != null && scanned && !updated)
            {
                SetBusy(true, "อ่านซ้ำด้วย Template " + picked.Name + " …");
                try { await ApplyParseAsync(lastOcr); }
                finally { SetBusy(false, templateMismatch ? "⚠ Template ไม่ตรงกับไฟล์" : "อ่านซ้ำเสร็จ"); }
            }
            else ShowTemplateState();
        }

        /// <summary>อ่านค่าจากผล OCR ด้วย Template ปัจจุบัน แล้วใส่ช่อง/ตารางเทียบ/preview (ใช้ทั้งตอน Scan และตอนเปลี่ยน Template)</summary>
        async Task ApplyParseAsync(OcrPage ocr)
        {
            var tpl = currentTemplate;
            var parsed = BLParser.Parse(ocr, tpl);
            var vals = Fields.FromParse(parsed);

            loadingValues = true;
            scanned = true; updated = false; dirty = false;
            foreach (var f in Fields.All.Where(x => !x.System)) SetValue(f.Key, Fields.Val(vals, f.Key));
            loadingValues = false;
            foreach (var tb in boxes.Values) MarkEmpty(tb);

            notes = new List<string>(parsed.Notes);
            templateMismatch = !tpl.Matches(ocr.RawText);
            if (templateMismatch)
            {
                var better = templates.Where(t => !t.IsGeneric).Select(t => new { t, s = t.Score(ocr.RawText) }).Where(x => x.s > 0)
                                      .OrderByDescending(x => x.s).Select(x => x.t).FirstOrDefault();
                string msg = "⚠ ไม่พบคำระบุผู้ออกของ Template \"" + tpl.Name + "\" ในไฟล์นี้" + (better != null ? " — ดูเหมือนฟอร์มของ \"" + better.Name + "\"" : " — ลองเลือก \"ทั่วไป\" หรือสร้าง Template ใหม่");
                notes.Insert(0, msg);
                Log(msg);
            }
            int filled = Fields.All.Count(f => !f.System && Fields.Val(vals, f.Key).Trim() != "");
            Log(string.Format("อ่านด้วย Template [{0}]: พบหัวช่อง {1}, ได้ค่า {2} ช่อง", tpl.Id, parsed.Labels.Count, filled));
            foreach (var n in notes) Log("  " + n);

            await EnrichAsync();
            foreach (var w in Fields.Warnings(CurrentValues())) { notes.Add("⚠ " + w); Log("  ⚠ " + w); }
            ShowTemplateState();
            UpdateButtons();
            FillCompare();
            RenderPreview();
            tabs.SelectedTab = tabCompare;
        }

        // ------------------------------------------------------------ Preview
        string StatusText()
        {
            if (updated) return "บันทึกแล้ว " + DateTime.Now.ToString("HH:mm");
            if (existing == null) return NormDoc() != "" ? "ไม่พบ HB/L Ref ในระบบ" : "PREVIEW — ยังไม่ระบุ DOCNO";
            if (isReference) return "record อ้างอิง — เทียบอย่างเดียว";
            return "PREVIEW — ยังไม่ได้บันทึก";
        }

        void RenderPreview()
        {
            if (!scanned) return;
            lastHtml = HtmlPreview.Build(CurrentValues(), Path.GetFileName(sourceFile), StatusText(), notes);
            int scroll = 0;
            try { if (web.Document != null && web.Document.Body != null) scroll = web.Document.GetElementsByTagName("HTML")[0].ScrollTop; } catch { }
            WebBrowserDocumentCompletedEventHandler h = null;
            h = (s, e) =>
            {
                web.DocumentCompleted -= h;
                try { web.Document.GetElementsByTagName("HTML")[0].ScrollTop = scroll; } catch { }
            };
            web.DocumentCompleted += h;
            web.DocumentText = lastHtml;
            if (existing != null) FillCompare();
        }

        void SaveHtml()
        {
            using (var dlg = new SaveFileDialog())
            {
                string doc = NormDoc().Replace("/", "-");
                dlg.FileName = (doc != "" ? doc : Path.GetFileNameWithoutExtension(sourceFile)) + "_HBL.html";
                dlg.Filter = "HTML|*.html";
                if (dlg.ShowDialog(this) != DialogResult.OK) return;
                File.WriteAllText(dlg.FileName, lastHtml, new UTF8Encoding(true));
                Log("บันทึก HTML: " + dlg.FileName);
            }
        }

        void OpenInBrowser()
        {
            string p = Path.Combine(Path.GetTempPath(), "BLScan_preview_" + DateTime.Now.ToString("HHmmss") + ".html");
            File.WriteAllText(p, lastHtml, new UTF8Encoding(true));
            System.Diagnostics.Process.Start(p);
        }

        // ------------------------------------------------------------ Update
        async void UpdateAsync(bool dryRun)
        {
            string doc = NormDoc();
            if (doc == "") { MessageBox.Show(this, "DOCNO ว่าง — ห้าม update", "BLScan", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }

            // ตรวจ DOCNO ใน DB ใหม่อีกครั้งก่อน update (ไม่เชื่อค่าที่จำไว้ — record อาจถูกลบ/เปลี่ยนไปแล้ว)
            SetBusy(true, "ตรวจ HB/L Ref " + doc + " …");
            ExistingDoc fresh;
            try { fresh = await Task.Run(() => _db.LoadExisting(doc)); }
            catch (Exception ex)
            {
                SetBusy(false, "ตรวจ DOCNO ไม่ได้");
                Log("ตรวจ DOCNO ก่อน update ผิดพลาด: " + ex);
                MessageBox.Show(this, "ตรวจ DOCNO ใน DB ไม่ได้ — ไม่ได้ update:\r\n" + Safe(ex.GetBaseException().Message), "BLScan", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }
            SetBusy(false, null);
            if (NormDoc() != doc) return;                          // ผู้ใช้แก้เลขระหว่างรอ — ให้กดใหม่
            existing = fresh;
            if (fresh == null)
            {
                lblDocState.Text = "✗ ไม่พบ HB/L Ref นี้ในระบบ — ตรวจเลขอีกครั้ง"; lblDocState.ForeColor = Color.Firebrick;
                FillCompare(); UpdateButtons();
                Log("ก่อน update: ไม่พบ HB/L Ref " + doc + " ในระบบ — ยกเลิก");
                MessageBox.Show(this, "ไม่พบ HB/L Ref \"" + doc + "\" ในระบบ\r\n\r\nโปรแกรมนี้ update record ที่สร้างรอไว้แล้วเท่านั้น (ไม่สร้าง HB/L ใหม่)\r\nกรุณาตรวจเลข DOCNO หรือสร้าง record ก่อน", "ไม่พบ DOCNO", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            FillCompare();

            var v = CurrentValues();
            v["DOCNO"] = doc;
            var errs = Fields.Validate(v);
            if (existing == null) errs.Insert(0, "ไม่พบ HB/L Ref " + doc + " ในระบบ");
            if (isReference && !dryRun) errs.Insert(0, "DOCNO " + doc + " เป็น record อ้างอิง (ReferenceDocNo ใน ini) — ใช้เทียบเท่านั้น ไม่ให้เขียน");
            if (errs.Count > 0)
            {
                MessageBox.Show(this, "ทำต่อไม่ได้:\r\n\r\n• " + string.Join("\r\n• ", errs), "BLScan", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            var plan = Fields.Plan(v, existing.V);
            int chg = plan.Count(c => c.Differs);
            if (!dryRun)
            {
                var warn = new List<string>();
                foreach (var w in Fields.Warnings(v)) warn.Add("Error - ค่าผิดปกติ: " + w);
                if (Fields.Val(v, "BLNO").Trim() == "") warn.Add("Error - ยังไม่มี B/L No.");
                foreach (var k in new[] { "RECPORT", "LOADPORT", "DISPORT", "DELPORT" })
                    if (Fields.Val(v, k).Trim() == "" && Fields.Val(v, k + "NAME").Trim() != "") warn.Add("Error - ยังไม่มีรหัส " + k + " (" + Fields.Val(v, k + "NAME") + ") — จะไม่ถูกเขียน");
                string msg = "HB/L Ref : " + doc +
                             (warn.Count > 0 ? "\r\n\r\n" + string.Join("\r\n", warn) : "") + "\r\n\r\nยืนยันการ Update ?";
                if (MessageBox.Show(this, msg, "ยืนยัน Update", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2) != DialogResult.Yes) return;
            }

            SetBusy(true, dryRun ? "กำลังทดสอบ (dry run)…" : "กำลังบันทึก…");
            string user = _ini.Get("App", "UserID", "BLSCAN");
            try
            {
                var r = await Task.Run(() => _db.Update(v, doc, user, dryRun));
                Log(r.Message);
                foreach (var c in r.HblChanges) Log("  " + c);
                Log("  " + r.MarkAction);
                foreach (var c in r.MarkChanges) Log("  " + c);
                if (!dryRun)
                {
                    updated = true;
                    WriteAudit(v, r);
                    existing = await Task.Run(() => _db.LoadExisting(doc));     // โหลดค่าใหม่ → ตารางเทียบจะเป็น "เท่าเดิม" ทั้งหมด
                }
                SetBusy(false, r.Message);
                FillCompare();
                RenderPreview();
                MessageBox.Show(this, r.Message, "BLScan", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                var inner = ex is AggregateException ? ex.GetBaseException() : ex;
                SetBusy(false, "ไม่สำเร็จ");
                Log("ผิดพลาด: " + inner);
                MessageBox.Show(this, "ไม่สำเร็จ (ไม่มีข้อมูลถูกเขียน):\r\n" + Safe(inner.Message), "BLScan", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        void WriteAudit(Dictionary<string, string> v, UpdateResult r)
        {
            try
            {
                string p = Path.Combine(Path.GetDirectoryName(Application.ExecutablePath), "BLScan.log");
                var sb = new StringBuilder();
                sb.AppendFormat("{0:yyyy-MM-dd HH:mm:ss}\t{1}\tHBLREF={2}\tFILE={3}\tUSER={4}\t{5}\r\n", DateTime.Now, _db.ServerName, Fields.Val(v, "DOCNO"), sourceFile, Environment.UserName, r.MarkAction);
                foreach (var c in r.HblChanges) sb.Append("    ").AppendLine(c);
                foreach (var c in r.MarkChanges) sb.Append("    ").AppendLine(c);
                File.AppendAllText(p, sb.ToString(), Encoding.UTF8);
            }
            catch (Exception ex) { Log("เขียน BLScan.log ไม่ได้: " + ex.Message); }
        }
    }
}
