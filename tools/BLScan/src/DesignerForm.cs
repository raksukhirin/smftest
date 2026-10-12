// Template Designer — เครื่องมือของ admin สร้าง/แก้ Template ของผู้ออก B/L โดยดูผลบนภาพจริง
//   1) เปิดใบตัวอย่าง (PDF/รูป) → OCR → ตัวอ่านใช้ Template ที่กำลังแก้ทันที แล้วแสดงกรอบซ้อนบนภาพ
//   2) แท็บ "หัวช่อง / โซน": เลือกช่อง → เพิ่มคำเรียกหัวช่อง (เลือกคำบนภาพ) หรือลากกรอบเป็นโซนสำรอง
//   3) แท็บ "ผลลัพธ์ & เฉลย": พิมพ์ค่าที่ถูกต้อง เห็นผ่าน/ไม่ผ่านทันที
//   4) แท็บ "ทั่วไป": คำระบุผู้ออก, ข้อความตัดทิ้ง, คำแปลง, รูปแบบวันที่
//   5) แท็บ "ตัวอย่าง / ทดสอบ": บันทึกใบตัวอย่างพร้อมเฉลยไว้กับ Template แล้วทดสอบทุกใบก่อนบันทึก
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace BLScan
{
    public class DesignerForm : Form
    {
        readonly Ini _ini;
        readonly string folder;

        // ---- ข้อมูลที่กำลังแก้
        Template working;
        int loadedVersion;
        bool isNew, dirty, loadingUi;
        OcrPage ocr;
        ParseResult parse;
        Dictionary<string, string> values = new Dictionary<string, string>();
        Dictionary<string, string> expect = new Dictionary<string, string>();
        string samplePath = "", sampleLabel = "";
        List<Template> existing = new List<Template>();

        // ---- หน้าจอ
        ComboBox cmbTemplate;
        Button btnNew, btnSave, btnOpenSample, btnReocr;
        NumericUpDown numPage;
        RadioButton rbWords, rbZone;
        CheckBox chkWordBoxes, chkMatches;
        Label lblZoom, lblStatus;
        Panel host;
        ImageCanvas canvas;
        TabControl tabs;

        ListView lvLabels;
        Label lblSelKey, lblDefault, lblZone;
        TextBox txtSyn, txtCaptured;
        DataGridView dgv;
        Label lblSummary;
        TextBox txtId, txtName, txtNote, txtIdentify, txtStrip, txtTerms, txtDateFmt, txtStop, txtInline;
        Label lblIdentifyState;
        ListView lvSamples;
        TextBox txtTest;

        static readonly Dictionary<string, string> Captions = new Dictionary<string, string>
        {
            { "BLNO", "B/L No." }, { "SHIPPER", "Shipper" }, { "CONSIGNEE", "Consignee" }, { "NOTIFY", "Notify Party" },
            { "FEEDER", "Pre-carriage (Feeder)" }, { "RECEIPT", "Place of Receipt" }, { "VESSEL", "Ocean Vessel" }, { "VOYAGE", "Voyage No." },
            { "LOADPORT", "Port of Loading" }, { "DISPORT", "Port of Discharge" }, { "DELIVERY", "Place of Delivery" }, { "FINALDEST", "Final Destination" },
            { "NOOFORIG", "No. of original B/L" }, { "MARKS", "Marks & Numbers" }, { "PKGS", "No./Kind of packages" }, { "DESC", "Description of Goods" },
            { "GW", "Gross Weight" }, { "MEAS", "Measurement" }, { "CTNNO", "Container No." }, { "ONBOARD", "On Board Date" },
            { "TOTALPKG", "Total packages (in words)" }, { "PAYABLEAT", "Freight payable at" }, { "FREIGHT", "Freight & charges" },
            { "AGENT", "Delivery Agent" }, { "ISSUE", "Place & date of issue" }, { "EXCESS", "Excess value declaration" },
            { "SIGNED", "Signed for the carrier" }, { "ASAGENT", "As agent for the carrier" },
        };

        static readonly Color[] Palette =
        {
            Color.FromArgb(0, 120, 215), Color.FromArgb(214, 90, 0), Color.FromArgb(0, 150, 100), Color.FromArgb(160, 40, 160),
            Color.FromArgb(190, 30, 60), Color.FromArgb(90, 110, 0), Color.FromArgb(0, 130, 160), Color.FromArgb(120, 80, 40),
        };

        public DesignerForm(Ini ini, string templateFolder)
        {
            _ini = ini;
            folder = templateFolder;
            Text = "Template Designer — " + folder;
            Font = new Font("Tahoma", 9f);
            Width = 1560; Height = 920;
            StartPosition = FormStartPosition.CenterParent;
            BuildUi();
            ReloadTemplateList(null);
            FormClosing += (s, e) =>
            {
                if (dirty && MessageBox.Show(this, "มีการแก้ไขที่ยังไม่ได้บันทึก — ปิดและทิ้งการแก้ไขหรือไม่?", "Template Designer",
                        MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2) != DialogResult.Yes) e.Cancel = true;
            };
        }

        // ================================================================ สร้างหน้าจอ
        void BuildUi()
        {
            var top = new TableLayoutPanel { Dock = DockStyle.Top, Height = 74, ColumnCount = 1, RowCount = 2, Padding = new Padding(8, 6, 8, 2) };
            var row1 = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false, AutoSize = true };
            var row2 = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false, AutoSize = true };
            top.Controls.Add(row1, 0, 0); top.Controls.Add(row2, 0, 1);

            row1.Controls.Add(new Label { Text = "Template:", AutoSize = true, Margin = new Padding(0, 7, 4, 0), Font = new Font(Font, FontStyle.Bold) });
            cmbTemplate = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = 340, DropDownWidth = 520 };
            cmbTemplate.SelectedIndexChanged += (s, e) => { if (!loadingUi) OnTemplatePicked(); };
            btnNew = new Button { Text = "สร้างใหม่…", Width = 100, Height = 26 };
            btnNew.Click += (s, e) => NewTemplate();
            btnSave = new Button { Text = "บันทึก Template", Width = 150, Height = 26, BackColor = Color.FromArgb(211, 249, 216) };
            btnSave.Click += (s, e) => SaveTemplate();
            var btnClose = new Button { Text = "ปิด", Width = 80, Height = 26, Margin = new Padding(20, 3, 3, 3) };
            btnClose.Click += (s, e) => Close();
            lblStatus = new Label { AutoSize = true, Margin = new Padding(16, 7, 0, 0), ForeColor = Color.DimGray, MaximumSize = new Size(700, 20) };
            row1.Controls.AddRange(new Control[] { cmbTemplate, btnNew, btnSave, btnClose, lblStatus });

            btnOpenSample = new Button { Text = "เปิดใบตัวอย่าง…", Width = 120, Height = 26 };
            btnOpenSample.Click += (s, e) => OpenSampleDialog();
            row2.Controls.Add(btnOpenSample);
            row2.Controls.Add(new Label { Text = "หน้า", AutoSize = true, Margin = new Padding(8, 7, 2, 0) });
            numPage = new NumericUpDown { Minimum = 1, Maximum = 1, Value = 1, Width = 56 };
            row2.Controls.Add(numPage);
            btnReocr = new Button { Text = "อ่านใหม่", Width = 80, Height = 26, Enabled = false };
            btnReocr.Click += (s, e) => { if (samplePath != "") LoadSampleAsync(samplePath, (int)numPage.Value, null); };
            row2.Controls.Add(btnReocr);
            rbWords = new RadioButton { Text = "เลือกคำ", AutoSize = true, Checked = true, Margin = new Padding(16, 5, 0, 0) };
            rbZone = new RadioButton { Text = "ลากโซน", AutoSize = true, Margin = new Padding(6, 5, 0, 0) };
            rbWords.CheckedChanged += (s, e) => canvas.Mode = rbZone.Checked ? CanvasMode.Zone : CanvasMode.Words;
            rbZone.CheckedChanged += (s, e) => canvas.Mode = rbZone.Checked ? CanvasMode.Zone : CanvasMode.Words;
            chkWordBoxes = new CheckBox { Text = "กรอบคำ OCR", AutoSize = true, Checked = true, Margin = new Padding(14, 5, 0, 0) };
            chkWordBoxes.CheckedChanged += (s, e) => { canvas.ShowWordBoxes = chkWordBoxes.Checked; canvas.Invalidate(); };
            chkMatches = new CheckBox { Text = "แสดงว่าข้อความไหนเป็นของช่องไหน", AutoSize = true, Checked = true, Margin = new Padding(8, 5, 0, 0) };
            chkMatches.CheckedChanged += (s, e) => UpdateOverlays();
            var bMinus = new Button { Text = "−", Width = 30, Height = 26, Margin = new Padding(14, 3, 0, 3) };
            var bPlus = new Button { Text = "+", Width = 30, Height = 26, Margin = new Padding(0, 3, 0, 3) };
            var bFit = new Button { Text = "พอดีความกว้าง", Width = 110, Height = 26 };
            lblZoom = new Label { AutoSize = true, Margin = new Padding(4, 7, 0, 0), Text = "100%" };
            bMinus.Click += (s, e) => canvas.Zoom = canvas.Zoom / 1.2;
            bPlus.Click += (s, e) => canvas.Zoom = canvas.Zoom * 1.2;
            bFit.Click += (s, e) => canvas.FitWidth(host.ClientSize.Width - SystemInformation.VerticalScrollBarWidth - 2);
            row2.Controls.AddRange(new Control[] { rbWords, rbZone, chkWordBoxes, chkMatches, bMinus, bPlus, bFit, lblZoom });

            var split = new SplitContainer { Dock = DockStyle.Fill, Orientation = Orientation.Vertical };
            host = new Panel { Dock = DockStyle.Fill, AutoScroll = true, BackColor = Color.FromArgb(222, 226, 230) };
            canvas = new ImageCanvas { Location = new Point(0, 0) };
            canvas.MouseEnter += (s, e) => canvas.Focus();
            canvas.SelectionChanged += (s, e) => OnSelectionChanged();
            canvas.ZoneDrawn += OnZoneDrawn;
            canvas.ZoomChanged += (s, e) => lblZoom.Text = (int)Math.Round(canvas.Zoom * 100) + "%";
            host.Controls.Add(canvas);
            split.Panel1.Controls.Add(host);

            tabs = new TabControl { Dock = DockStyle.Fill };
            var tabLabels = new TabPage("หัวช่อง / โซน");
            var tabResults = new TabPage("ผลลัพธ์ & เฉลย");
            var tabGeneral = new TabPage("ทั่วไป");
            var tabSamples = new TabPage("ตัวอย่าง / ทดสอบ");
            tabs.TabPages.AddRange(new[] { tabLabels, tabResults, tabGeneral, tabSamples });
            split.Panel2.Controls.Add(tabs);
            BuildLabelsTab(tabLabels);
            BuildResultsTab(tabResults);
            BuildGeneralTab(tabGeneral);
            BuildSamplesTab(tabSamples);

            Controls.Add(split);
            Controls.Add(top);
            Load += (s, e) => { split.SplitterDistance = (int)(ClientSize.Width * 0.60); };
        }

        void BuildLabelsTab(TabPage tab)
        {
            lvLabels = new ListView { Dock = DockStyle.Top, Height = 330, View = View.Details, FullRowSelect = true, GridLines = true, HideSelection = false, MultiSelect = false };
            lvLabels.Columns.Add("ช่อง", 190); lvLabels.Columns.Add("หัวช่อง", 110); lvLabels.Columns.Add("ข้อความที่จับได้", 250);
            lvLabels.SelectedIndexChanged += (s, e) => ShowLabelDetail();
            var detail = new Panel { Dock = DockStyle.Fill, AutoScroll = true };
            int y = 8;
            lblSelKey = new Label { Left = 6, Top = y, Width = 480, Font = new Font(Font, FontStyle.Bold), Text = "เลือกช่องในรายการด้านบน" };
            y += 24;
            lblDefault = new Label { Left = 6, Top = y, Width = 520, Height = 32, ForeColor = Color.DimGray, Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right };
            y += 36;
            detail.Controls.Add(new Label { Left = 6, Top = y, Width = 480, Text = "คำเรียกหัวช่องเพิ่มของ Template นี้ (บรรทัดละ 1 คำ — เลือกคำบนภาพแล้วกดปุ่มเพิ่มได้)" });
            y += 20;
            txtSyn = new TextBox { Left = 6, Top = y, Width = 520, Height = 60, Multiline = true, ScrollBars = ScrollBars.Vertical, Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right };
            y += 66;
            var bAdd = new Button { Text = "เพิ่มคำที่เลือกบนภาพเป็นหัวช่อง", Left = 6, Top = y, Width = 230, Height = 28 };
            bAdd.Click += (s, e) => AddSelectionAsLabel();
            var bApply = new Button { Text = "ใช้การแก้ไขในกล่อง", Left = 242, Top = y, Width = 150, Height = 28 };
            bApply.Click += (s, e) => ApplySynonyms();
            y += 36;
            lblZone = new Label { Left = 6, Top = y, Width = 520, Height = 34, ForeColor = Color.DimGray, Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right };
            y += 36;
            var bDelZone = new Button { Text = "ลบโซนของช่องนี้", Left = 6, Top = y, Width = 150, Height = 28 };
            bDelZone.Click += (s, e) => DeleteZone();
            y += 36;
            detail.Controls.Add(new Label { Left = 6, Top = y, Width = 480, Text = "ข้อความที่ตัวอ่านจับเข้าช่องนี้ตอนนี้" });
            y += 20;
            txtCaptured = new TextBox { Left = 6, Top = y, Width = 520, Height = 70, Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical, BackColor = Color.White, Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right };
            detail.Controls.AddRange(new Control[] { lblSelKey, lblDefault, txtSyn, bAdd, bApply, lblZone, bDelZone, txtCaptured });
            tab.Controls.Add(detail);
            tab.Controls.Add(lvLabels);
        }

        void BuildResultsTab(TabPage tab)
        {
            dgv = new DataGridView
            {
                Dock = DockStyle.Fill, AllowUserToAddRows = false, AllowUserToDeleteRows = false, RowHeadersVisible = false,
                SelectionMode = DataGridViewSelectionMode.FullRowSelect, AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill, BackgroundColor = Color.White
            };
            dgv.Columns.Add(new DataGridViewTextBoxColumn { Name = "colField", HeaderText = "ช่อง", ReadOnly = true, FillWeight = 26 });
            dgv.Columns.Add(new DataGridViewTextBoxColumn { Name = "colValue", HeaderText = "อ่านได้", ReadOnly = true, FillWeight = 34 });
            dgv.Columns.Add(new DataGridViewTextBoxColumn { Name = "colExpect", HeaderText = "เฉลย (พิมพ์ค่าที่ถูกต้อง)", FillWeight = 34 });
            dgv.Columns.Add(new DataGridViewTextBoxColumn { Name = "colResult", HeaderText = "ผล", ReadOnly = true, FillWeight = 8 });
            dgv.CellEndEdit += (s, e) => OnExpectEdited(e.RowIndex);
            var bottom = new Panel { Dock = DockStyle.Bottom, Height = 66 };
            var bCopy = new Button { Text = "คัดลอกค่าที่อ่านได้เป็นเฉลย", Left = 6, Top = 6, Width = 200, Height = 28 };
            bCopy.Click += (s, e) => CopyValuesToExpect();
            var bClear = new Button { Text = "ล้างเฉลย", Left = 212, Top = 6, Width = 90, Height = 28 };
            bClear.Click += (s, e) => { expect.Clear(); RefreshResultsGrid(); };
            lblSummary = new Label { Left = 6, Top = 40, Width = 540, ForeColor = Color.DimGray };
            bottom.Controls.AddRange(new Control[] { bCopy, bClear, lblSummary });
            tab.Controls.Add(dgv);
            tab.Controls.Add(bottom);
        }

        void BuildGeneralTab(TabPage tab)
        {
            var p = new Panel { Dock = DockStyle.Fill, AutoScroll = true };
            int y = 8;
            Func<string, int, TextBox> field = (cap, h) =>
            {
                p.Controls.Add(new Label { Left = 6, Top = y, Width = 520, Text = cap });
                y += 19;
                var tb = new TextBox { Left = 6, Top = y, Width = 520, Height = h, Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right };
                if (h > 24) { tb.Multiline = true; tb.ScrollBars = ScrollBars.Vertical; }
                p.Controls.Add(tb);
                y += h + 8;
                return tb;
            };
            txtId = field("id (a-z 0-9 - _ ตั้งแล้วเปลี่ยนไม่ได้)", 24);
            txtName = field("ชื่อที่แสดงในดรอปดาวน์", 24);
            txtNote = field("หมายเหตุ", 24);
            txtIdentify = field("คำระบุผู้ออก (บรรทัดละ 1 คำ) — ชื่อบริษัทที่หัวฟอร์ม ใช้ตรวจว่าไฟล์เป็นฟอร์มของผู้ออกนี้", 56);
            var bId = new Button { Text = "เพิ่มคำที่เลือกบนภาพเป็นคำระบุผู้ออก", Left = 6, Top = y - 4, Width = 260, Height = 26 };
            bId.Click += (s, e) => AddSelectionTo("identify");
            lblIdentifyState = new Label { Left = 272, Top = y, Width = 250, ForeColor = Color.DimGray };
            p.Controls.AddRange(new Control[] { bId, lblIdentifyState });
            y += 30;
            txtStrip = field("ข้อความประกอบหัวช่องที่ตัดทิ้ง (บรรทัดละ 1 ข้อความ)", 56);
            var bStrip = new Button { Text = "เพิ่มคำที่เลือกบนภาพเป็นข้อความตัดทิ้ง", Left = 6, Top = y - 4, Width = 260, Height = 26 };
            bStrip.Click += (s, e) => AddSelectionTo("strip");
            p.Controls.Add(bStrip);
            y += 30;
            txtStop = field("หัวช่องกั้น (บรรทัดละ 1 ข้อความ) — หัวตาราง/ข้อความที่ไม่ใช่ช่องของเรา แต่ต้องกั้นไม่ให้ข้อความใต้มันถูกดึงไปเป็นค่าของช่องอื่น", 48);
            var bStop = new Button { Text = "เพิ่มคำที่เลือกบนภาพเป็นหัวช่องกั้น", Left = 6, Top = y - 4, Width = 260, Height = 26 };
            bStop.Click += (s, e) => AddSelectionTo("stop");
            p.Controls.Add(bStop);
            y += 30;
            txtInline = field("ช่องที่ค่าอยู่ \"ขวามือ\" หัวช่อง (รหัสช่อง บรรทัดละ 1 ช่อง เช่น BLNO)", 40);
            txtTerms = field("คำแปลง CY term  (รูปแบบ  ข้อความ => ค่า  เช่น  CFS-CFS => CFS/CFS)", 48);
            txtDateFmt = field("รูปแบบวันที่เฉพาะฟอร์ม (บรรทัดละ 1 แบบ เช่น yyyy/MM/dd, dd-MMM-yyyy)", 40);
            var bApply = new Button { Text = "ใช้การแก้ไขในหน้านี้", Left = 6, Top = y, Width = 170, Height = 30 };
            bApply.Click += (s, e) => { ApplyGeneralEdits(true); Reparse(); };
            p.Controls.Add(bApply);
            tab.Controls.Add(p);
        }

        void BuildSamplesTab(TabPage tab)
        {
            lvSamples = new ListView { Dock = DockStyle.Top, Height = 190, View = View.Details, FullRowSelect = true, GridLines = true, HideSelection = false, MultiSelect = false };
            lvSamples.Columns.Add("ตัวอย่าง", 200); lvSamples.Columns.Add("ค่าเฉลย", 70); lvSamples.Columns.Add("ที่มา", 260);
            lvSamples.DoubleClick += (s, e) => OpenSavedSample();
            var bar = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 70, Padding = new Padding(4) };
            var bSave = new Button { Text = "บันทึกใบนี้เป็นตัวอย่าง (พร้อมเฉลย)", Width = 240, Height = 28 };
            bSave.Click += (s, e) => SaveSample();
            var bOpen = new Button { Text = "เปิดที่เลือก", Width = 100, Height = 28 };
            bOpen.Click += (s, e) => OpenSavedSample();
            var bDel = new Button { Text = "ลบที่เลือก", Width = 90, Height = 28 };
            bDel.Click += (s, e) => DeleteSavedSample();
            var bTest = new Button { Text = "▶ ทดสอบทุกตัวอย่าง", Width = 160, Height = 28, Font = new Font(Font, FontStyle.Bold) };
            bTest.Click += (s, e) => TestAllSamplesAsync();
            bar.Controls.AddRange(new Control[] { bSave, bOpen, bDel, bTest });
            txtTest = new TextBox { Dock = DockStyle.Fill, Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Both, WordWrap = false, Font = new Font("Consolas", 9f), BackColor = Color.White };
            tab.Controls.Add(txtTest);
            tab.Controls.Add(bar);
            tab.Controls.Add(lvSamples);
        }

        // ---- ใช้โดยชุดทดสอบ/ภาพตัวอย่าง
        public void ShowTab(int index) { tabs.SelectedIndex = index; }

        public void SelectLabel(string key)
        {
            foreach (ListViewItem it in lvLabels.Items) if ((string)it.Tag == key) { it.Selected = true; it.EnsureVisible(); return; }
        }

        void SetStatus(string msg, bool warn = false)
        {
            lblStatus.Text = msg;
            lblStatus.ForeColor = warn ? Color.Firebrick : Color.DimGray;
        }

        // ================================================================ Template: เปิด / สร้าง / บันทึก
        void ReloadTemplateList(string selectId)
        {
            var errs = new List<string>();
            existing = TemplateStore.LoadAll(folder, errs).Where(t => !t.IsGeneric).ToList();
            loadingUi = true;
            cmbTemplate.Items.Clear();
            foreach (var t in existing) cmbTemplate.Items.Add(t);
            loadingUi = false;
            var pick = existing.FirstOrDefault(t => string.Equals(t.Id, selectId, StringComparison.OrdinalIgnoreCase));
            if (pick != null) { loadingUi = true; cmbTemplate.SelectedItem = pick; loadingUi = false; }
            else if (working == null && existing.Count > 0) { cmbTemplate.SelectedIndex = 0; }
            else if (working == null) SetStatus("ยังไม่มี Template — กด \"สร้างใหม่…\"");
        }

        bool ConfirmDiscard()
        {
            return !dirty || MessageBox.Show(this, "มีการแก้ไขที่ยังไม่ได้บันทึก — ทิ้งการแก้ไขหรือไม่?", "Template Designer",
                                             MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2) == DialogResult.Yes;
        }

        void OnTemplatePicked()
        {
            var t = cmbTemplate.SelectedItem as Template;
            if (t == null) return;
            if (working != null && string.Equals(working.Id, t.Id, StringComparison.OrdinalIgnoreCase) && !isNew) return;
            if (!ConfirmDiscard())
            {
                loadingUi = true;
                cmbTemplate.SelectedItem = existing.FirstOrDefault(x => working != null && x.Id == working.Id);
                loadingUi = false;
                return;
            }
            OpenTemplate(t);
        }

        void OpenTemplate(Template t)
        {
            working = TemplateEditor.Clone(t);
            loadedVersion = t.Version;
            isNew = false; dirty = false;
            expect = new Dictionary<string, string>();
            ShowGeneral();
            RefreshSamples();
            Reparse();
            SetStatus("แก้ \"" + working.Name + "\" (v" + working.Version + ")");
        }

        void NewTemplate()
        {
            if (!ConfirmDiscard()) return;
            string id, name;
            if (!AskIdName(out id, out name)) return;
            working = TemplateEditor.NewEmpty(id, name);
            loadedVersion = 0; isNew = true; dirty = true;
            expect = new Dictionary<string, string>();
            loadingUi = true; cmbTemplate.SelectedIndex = -1; loadingUi = false;
            ShowGeneral();
            RefreshSamples();
            Reparse();
            SetStatus("Template ใหม่ \"" + name + "\" — เปิดใบตัวอย่าง แล้วเพิ่มคำระบุผู้ออกและหัวช่องที่ขาด");
        }

        bool AskIdName(out string id, out string name)
        {
            id = name = "";
            using (var f = new Form())
            {
                f.Text = "สร้าง Template ใหม่"; f.Font = Font; f.FormBorderStyle = FormBorderStyle.FixedDialog; f.StartPosition = FormStartPosition.CenterParent;
                f.MaximizeBox = f.MinimizeBox = false; f.ClientSize = new Size(440, 150);
                f.Controls.Add(new Label { Text = "id (ตัวพิมพ์เล็ก a-z 0-9 - _ เช่น shine-logistics)", Left = 12, Top = 12, Width = 410 });
                var tId = new TextBox { Left = 12, Top = 32, Width = 410 };
                f.Controls.Add(tId);
                f.Controls.Add(new Label { Text = "ชื่อที่แสดง เช่น Shine Logistics (House B/L)", Left = 12, Top = 62, Width = 410 });
                var tName = new TextBox { Left = 12, Top = 82, Width = 410 };
                f.Controls.Add(tName);
                var ok = new Button { Text = "สร้าง", Left = 250, Top = 112, Width = 80, Height = 28 };
                var cancel = new Button { Text = "ยกเลิก", Left = 342, Top = 112, Width = 80, Height = 28, DialogResult = DialogResult.Cancel };
                ok.Click += (s, e) =>
                {
                    string err = TemplateEditor.ValidateId(tId.Text);
                    if (err == "" && existing.Any(t => string.Equals(t.Id, tId.Text.Trim(), StringComparison.OrdinalIgnoreCase))) err = "มี Template id นี้อยู่แล้ว";
                    if (err == "" && tName.Text.Trim() == "") err = "ใส่ชื่อ Template";
                    if (err != "") { MessageBox.Show(f, err, "สร้าง Template", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
                    f.DialogResult = DialogResult.OK;
                };
                f.Controls.AddRange(new Control[] { ok, cancel });
                f.AcceptButton = ok; f.CancelButton = cancel;
                if (f.ShowDialog(this) != DialogResult.OK) return false;
                id = tId.Text.Trim().ToLowerInvariant(); name = tName.Text.Trim();
                return true;
            }
        }

        void SaveTemplate()
        {
            if (working == null) return;
            ApplyGeneralEdits(true);
            List<string> warnings;
            var errors = TemplateEditor.Validate(working, out warnings);
            if (errors.Count > 0) { MessageBox.Show(this, "บันทึกไม่ได้:\r\n• " + string.Join("\r\n• ", errors), "Template Designer", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
            if (warnings.Count > 0 && MessageBox.Show(this, string.Join("\r\n", warnings) + "\r\n\r\nบันทึกต่อไปหรือไม่?", "Template Designer", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            try
            {
                TemplateStore.Save(folder, working, loadedVersion);
                loadedVersion = working.Version;
                isNew = false; dirty = false;
                ReloadTemplateList(working.Id);
                ShowGeneral();
                SetStatus("บันทึก \"" + working.Name + "\" เป็น v" + working.Version + " แล้ว (ไฟล์เดิมสำรองไว้ใน _trash)");
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, ex.Message, "บันทึกไม่สำเร็จ", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // ================================================================ ใบตัวอย่าง + OCR
        void OpenSampleDialog()
        {
            using (var dlg = new OpenFileDialog { Filter = "ใบ B/L (PDF, รูปภาพ)|*.pdf;*.jpg;*.jpeg;*.png;*.tif;*.tiff;*.bmp|ทุกไฟล์|*.*", Title = "เลือกใบตัวอย่าง" })
            {
                if (dlg.ShowDialog(this) != DialogResult.OK) return;
                LoadSampleAsync(dlg.FileName, 1, null);
            }
        }

        /// <summary>OCR (เรียกบน thread เบื้องหลังได้) — ใช้ค่า [OCR] ใน ini เหมือนหน้าหลัก</summary>
        public OcrPage RunOcr(string path, int page)
        {
            return WinRtOcr.ScanFused(path, page - 1, _ini.GetInt("OCR", "RenderWidth", 2000), _ini.Get("OCR", "Language", "en-US"), _ini.GetInt("OCR", "SecondScale", 3000));
        }

        async void LoadSampleAsync(string path, int page, Dictionary<string, string> withExpect)
        {
            UseWaitCursor = true; SetStatus("กำลัง OCR " + Path.GetFileName(path) + " …");
            try
            {
                int pages = await Task.Run(() => WinRtOcr.PageCount(path));
                numPage.Maximum = Math.Max(1, pages);
                if (page > numPage.Maximum) page = (int)numPage.Maximum;
                numPage.Value = page;
                var o = await Task.Run(() => RunOcr(path, page));
                ApplyOcr(o, path, page, withExpect);
            }
            catch (Exception ex)
            {
                SetStatus("OCR ไม่สำเร็จ", true);
                MessageBox.Show(this, "อ่านไฟล์ไม่สำเร็จ:\r\n" + ex.GetBaseException().Message, "Template Designer", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally { UseWaitCursor = false; }
        }

        /// <summary>ใส่ผล OCR เข้าหน้าจอ (ใช้บน UI thread)</summary>
        public void ApplyOcr(OcrPage o, string path, int page, Dictionary<string, string> withExpect)
        {
            ocr = o; samplePath = path;
            sampleLabel = Path.GetFileName(path) + (page > 1 || path.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase) ? " หน้า " + page : "");
            if (withExpect != null) expect = new Dictionary<string, string>(withExpect);
            canvas.Words = ocr.Words;
            canvas.Image = ocr.Image;
            canvas.FitWidth(host.ClientSize.Width - SystemInformation.VerticalScrollBarWidth - 2);
            btnReocr.Enabled = true;
            Reparse();
            SetStatus("อ่าน " + sampleLabel + " แล้ว — " + ocr.Words.Count + " คำ" + (ocr.Repaired > 0 ? ", ซ่อมคำที่ถูกตัด " + ocr.Repaired + " คำ" : ""));
        }

        // ================================================================ อ่านด้วย Template ที่กำลังแก้
        public void Reparse()
        {
            if (working == null || ocr == null) { RefreshLabelsList(); RefreshResultsGrid(); UpdateOverlays(); UpdateIdentifyState(); return; }
            parse = BLParser.Parse(ocr, working);
            values = Fields.FromParse(parse);
            RefreshLabelsList();
            RefreshResultsGrid();
            UpdateOverlays();
            UpdateIdentifyState();
        }

        void UpdateIdentifyState()
        {
            if (working == null) { lblIdentifyState.Text = ""; return; }
            if (ocr == null) { lblIdentifyState.Text = "(เปิดใบตัวอย่างเพื่อตรวจ)"; lblIdentifyState.ForeColor = Color.DimGray; }
            else if (working.Identify.Length == 0) { lblIdentifyState.Text = "⚠ ยังไม่มีคำระบุผู้ออก"; lblIdentifyState.ForeColor = Color.DarkOrange; }
            else if (working.Matches(ocr.RawText)) { lblIdentifyState.Text = "✓ ใบนี้ตรงกับ Template"; lblIdentifyState.ForeColor = Color.DarkGreen; }
            else { lblIdentifyState.Text = "✗ ไม่พบคำระบุผู้ออกในใบนี้"; lblIdentifyState.ForeColor = Color.Firebrick; }
        }

        Color KeyColor(string key)
        {
            int i = Math.Abs(key.GetHashCode()) % Palette.Length;
            return Palette[i];
        }

        void UpdateOverlays()
        {
            canvas.Overlays.Clear();
            if (parse != null)
            {
                if (chkMatches.Checked)
                    foreach (var c in parse.AllChunks.Where(c => c.Owner != null))
                        canvas.Overlays.Add(new CanvasOverlay { R = new RectangleF((float)c.X, (float)c.Y, (float)(c.R - c.X), (float)(c.B - c.Y)), Caption = c.Owner.Key, Color = KeyColor(c.Owner.Key) });
                foreach (var l in parse.Labels.Where(l => !l.Synthetic))
                    canvas.Overlays.Add(new CanvasOverlay { R = new RectangleF((float)l.X, (float)l.Y, (float)(l.R - l.X), (float)(l.B - l.Y)), Caption = "หัวช่อง " + l.Key, Color = Color.ForestGreen });
            }
            if (working != null)
                foreach (var kv in working.Zones)
                    canvas.Overlays.Add(new CanvasOverlay { R = new RectangleF((float)kv.Value.X, (float)kv.Value.Y, (float)kv.Value.W, (float)kv.Value.H), Caption = "โซน " + kv.Key, Color = Color.OrangeRed, Dashed = true });
            canvas.Invalidate();
        }

        // ================================================================ แท็บหัวช่อง / โซน
        string SelectedKey()
        {
            return lvLabels.SelectedItems.Count == 0 ? null : (string)lvLabels.SelectedItems[0].Tag;
        }

        void RefreshLabelsList()
        {
            string keep = SelectedKey();
            lvLabels.BeginUpdate();
            lvLabels.Items.Clear();
            foreach (var d in BLParser.Labels)
            {
                string cap;
                if (!Captions.TryGetValue(d.Key, out cap)) cap = d.Key;
                bool found = parse != null && parse.Labels.Any(l => l.Key == d.Key && !l.Synthetic);
                bool zoned = working != null && working.Zones.ContainsKey(d.Key);
                bool synth = parse != null && parse.Labels.Any(l => l.Key == d.Key && l.Synthetic);
                string state = found ? (zoned ? "พบ (มีโซนสำรอง)" : "พบ") : synth ? "ใช้โซน/อนุมาน" : zoned ? "โซนสำรอง" : (parse == null ? "-" : "ไม่พบ");
                string captured = "";
                List<Chunk> cs;
                if (parse != null && parse.ByLabel.TryGetValue(d.Key, out cs))
                    captured = string.Join(" | ", cs.OrderBy(c => c.Y).ThenBy(c => c.X).Select(c => c.Text));
                if (captured.Length > 90) captured = captured.Substring(0, 90) + "…";
                var it = new ListViewItem(new[] { d.Key + "  " + cap, state, captured }) { Tag = d.Key };
                if (parse != null && !found && !synth && !zoned) it.ForeColor = Color.Firebrick;
                else if (parse != null && !found && (synth || zoned)) it.ForeColor = Color.DarkOrange;
                if (d.Key == keep) it.Selected = true;
                lvLabels.Items.Add(it);
            }
            lvLabels.EndUpdate();
            ShowLabelDetail();
        }

        void ShowLabelDetail()
        {
            string key = SelectedKey();
            if (key == null || working == null) { lblSelKey.Text = "เลือกช่องในรายการด้านบน"; lblDefault.Text = ""; lblZone.Text = ""; txtSyn.Text = ""; txtCaptured.Text = ""; return; }
            string cap; if (!Captions.TryGetValue(key, out cap)) cap = key;
            lblSelKey.Text = key + " — " + cap;
            var def = BLParser.Labels.First(d => d.Key == key);
            lblDefault.Text = "คำเรียกมาตรฐาน: " + string.Join(" · ", def.Phrases);
            string[] syn;
            txtSyn.Text = working.Labels.TryGetValue(key, out syn) ? string.Join("\r\n", syn) : "";
            Zone z;
            lblZone.Text = working.Zones.TryGetValue(key, out z)
                ? "โซนสำรอง: x=" + z.X.ToString("0.###") + " y=" + z.Y.ToString("0.###") + " w=" + z.W.ToString("0.###") + " h=" + z.H.ToString("0.###") + "  (ใช้เมื่อ OCR อ่านหัวช่องนี้ไม่ออก)"
                : "ยังไม่มีโซนสำรอง — สลับเป็นโหมด \"ลากโซน\" แล้วลากกรอบบนภาพ ให้ขอบบนของกรอบอยู่ตรงที่ข้อความของช่องนี้เริ่ม";
            List<Chunk> cs;
            txtCaptured.Text = parse != null && parse.ByLabel.TryGetValue(key, out cs)
                ? string.Join("\r\n", cs.OrderBy(c => c.Y).ThenBy(c => c.X).Select(c => c.Text)) : "(ไม่มี)";
        }

        void AddSelectionAsLabel()
        {
            string key = SelectedKey();
            if (working == null || key == null) { SetStatus("เลือกช่องในรายการก่อน", true); return; }
            string text = TemplateEditor.TextOf(canvas.Selected);
            if (text == "") { SetStatus("ยังไม่ได้เลือกคำบนภาพ (โหมด \"เลือกคำ\": คลิกหรือลากกรอบรอบหัวช่อง)", true); return; }
            if (!TemplateEditor.AddLabel(working, key, text)) { SetStatus("มีคำเรียกนี้อยู่แล้ว: " + text, true); return; }
            dirty = true;
            canvas.ClearSelection();
            Reparse();
            SetStatus("เพิ่มหัวช่อง " + key + " = \"" + text + "\" แล้ว");
        }

        void ApplySynonyms()
        {
            string key = SelectedKey();
            if (working == null || key == null) return;
            TemplateEditor.SetLabels(working, key, txtSyn.Text.Replace("\r\n", "\n").Split('\n'));
            dirty = true;
            Reparse();
        }

        void OnZoneDrawn(RectangleF r)
        {
            string key = SelectedKey();
            if (working == null) return;
            if (key == null) { SetStatus("เลือกช่องในรายการก่อนลากโซน", true); return; }
            TemplateEditor.SetZone(working, key, r.X, r.Y, r.Width, r.Height);
            dirty = true;
            Reparse();
            SetStatus("ตั้งโซนของ " + key + " แล้ว (" + r.X.ToString("0.###") + ", " + r.Y.ToString("0.###") + ")");
        }

        void DeleteZone()
        {
            string key = SelectedKey();
            if (working == null || key == null) return;
            if (TemplateEditor.RemoveZone(working, key)) { dirty = true; Reparse(); SetStatus("ลบโซนของ " + key + " แล้ว"); }
        }

        void OnSelectionChanged()
        {
            string t = TemplateEditor.TextOf(canvas.Selected);
            SetStatus(canvas.Selected.Count == 0 ? "" : "เลือก " + canvas.Selected.Count + " คำ: " + (t.Length > 80 ? t.Substring(0, 80) + "…" : t));
        }

        // ================================================================ แท็บผลลัพธ์ & เฉลย
        List<FieldDef> OutputFields()
        {
            return Fields.All.Where(f => !f.System && f.Key != "DOCNO").ToList();
        }

        void RefreshResultsGrid()
        {
            loadingUi = true;
            dgv.Rows.Clear();
            foreach (var f in OutputFields())
            {
                string v = Golden.Flat(Fields.Val(values, f.Key));
                string e; expect.TryGetValue(f.Key, out e);
                int i = dgv.Rows.Add(f.Caption + "  (" + f.Key + ")", v, e ?? "", "");
                dgv.Rows[i].Tag = f.Key;
                SetResultCell(dgv.Rows[i]);
            }
            loadingUi = false;
            UpdateSummary();
        }

        void SetResultCell(DataGridViewRow row)
        {
            string key = (string)row.Tag;
            string e = Convert.ToString(row.Cells["colExpect"].Value ?? "");
            var cell = row.Cells["colResult"];
            if (string.IsNullOrWhiteSpace(e)) { cell.Value = ""; row.DefaultCellStyle.BackColor = Color.White; return; }
            bool ok = Golden.Same(key, e, Golden.Flat(Fields.Val(values, key)));
            cell.Value = ok ? "✓" : "✗";
            row.DefaultCellStyle.BackColor = ok ? Color.FromArgb(235, 251, 238) : Color.FromArgb(255, 235, 235);
        }

        void OnExpectEdited(int rowIndex)
        {
            if (loadingUi || rowIndex < 0) return;
            var row = dgv.Rows[rowIndex];
            string key = (string)row.Tag;
            string e = Convert.ToString(row.Cells["colExpect"].Value ?? "").Trim();
            if (e == "") expect.Remove(key); else expect[key] = e;
            SetResultCell(row);
            UpdateSummary();
        }

        void CopyValuesToExpect()
        {
            foreach (var f in OutputFields())
            {
                string v = Golden.Flat(Fields.Val(values, f.Key));
                if (v != "") expect[f.Key] = v;
            }
            RefreshResultsGrid();
            SetStatus("คัดลอกค่าที่อ่านได้เป็นเฉลยแล้ว — ตรวจแล้วแก้ช่องที่ผิดให้เป็นค่าที่ถูกต้อง");
        }

        void UpdateSummary()
        {
            var res = Golden.Compare(values, expect);
            lblSummary.Text = res.Count == 0 ? "ยังไม่มีเฉลย — พิมพ์ค่าที่ถูกต้องในคอลัมน์เฉลย"
                : "ตรงเฉลย " + res.Count(r => r.Ok) + " / " + res.Count + " ช่อง";
            lblSummary.ForeColor = res.Count > 0 && res.All(r => r.Ok) ? Color.DarkGreen : Color.DimGray;
        }

        // ================================================================ แท็บทั่วไป
        void ShowGeneral()
        {
            loadingUi = true;
            txtId.Text = working.Id; txtId.ReadOnly = !isNew;
            txtName.Text = working.Name; txtNote.Text = working.Note;
            txtIdentify.Text = string.Join("\r\n", working.Identify);
            txtStrip.Text = string.Join("\r\n", working.Strip);
            txtStop.Text = string.Join("\r\n", working.Stop);
            txtInline.Text = string.Join("\r\n", working.Inline);
            txtTerms.Text = TemplateEditor.TermsText(working);
            txtDateFmt.Text = string.Join("\r\n", working.DateFormats);
            loadingUi = false;
            foreach (var tb in new[] { txtName, txtNote, txtIdentify, txtStrip, txtStop, txtInline, txtTerms, txtDateFmt })
            {
                tb.TextChanged -= GeneralChanged;
                tb.TextChanged += GeneralChanged;
            }
        }

        void GeneralChanged(object sender, EventArgs e) { if (!loadingUi) dirty = true; }

        void ApplyGeneralEdits(bool report)
        {
            if (working == null) return;
            working.Name = txtName.Text.Trim();
            working.Note = txtNote.Text.Trim();
            TemplateEditor.SetLines(working, "identify", txtIdentify.Text);
            TemplateEditor.SetLines(working, "strip", txtStrip.Text);
            TemplateEditor.SetLines(working, "stop", txtStop.Text);
            TemplateEditor.SetLines(working, "inline", txtInline.Text);
            TemplateEditor.SetLines(working, "dateFormats", txtDateFmt.Text);
            var bad = TemplateEditor.SetTerms(working, txtTerms.Text);
            if (report && bad.Count > 0) MessageBox.Show(this, "บรรทัดคำแปลงที่อ่านไม่ได้ (ต้องเป็น  ข้อความ => ค่า):\r\n• " + string.Join("\r\n• ", bad), "คำแปลง", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }

        void AddSelectionTo(string which)
        {
            if (working == null) return;
            string text = TemplateEditor.TextOf(canvas.Selected);
            if (text == "") { SetStatus("ยังไม่ได้เลือกคำบนภาพ", true); return; }
            ApplyGeneralEdits(false);
            bool added;
            if (which == "identify") added = TemplateEditor.AddIdentify(working, text);
            else if (which == "stop") { var l = working.Stop.ToList(); added = !l.Any(x => string.Equals(x, text, StringComparison.OrdinalIgnoreCase)); if (added) { l.Add(text); working.Stop = l.ToArray(); } }
            else added = TemplateEditor.AddStrip(working, text);
            if (!added) { SetStatus("เพิ่มไม่ได้ (ซ้ำหรือสั้นเกินไป): " + text, true); return; }
            dirty = true;
            ShowGeneral();
            canvas.ClearSelection();
            Reparse();
            SetStatus((which == "identify" ? "เพิ่มคำระบุผู้ออก" : which == "stop" ? "เพิ่มหัวช่องกั้น" : "เพิ่มข้อความตัดทิ้ง") + ": \"" + text + "\"");
        }

        // ================================================================ ตัวอย่างที่บันทึกไว้ + ทดสอบ
        string SamplesDir() { return Path.Combine(folder, "_samples", working == null ? "_" : working.Id); }

        class SampleInfo { public string Json, Png, Name, Source; public Dictionary<string, string> Expect = new Dictionary<string, string>(); }

        List<SampleInfo> ReadSamples()
        {
            var list = new List<SampleInfo>();
            if (working == null || !Directory.Exists(SamplesDir())) return list;
            foreach (var j in Directory.GetFiles(SamplesDir(), "s*.json").OrderBy(x => x, StringComparer.OrdinalIgnoreCase))
            {
                try
                {
                    var root = new JavaScriptSerializer().DeserializeObject(File.ReadAllText(j, Encoding.UTF8)) as Dictionary<string, object>;
                    var si = new SampleInfo { Json = j, Png = Path.Combine(Path.GetDirectoryName(j), Convert.ToString(root["image"])) };
                    si.Name = Path.GetFileNameWithoutExtension(j);
                    si.Source = root.ContainsKey("source") ? Convert.ToString(root["source"]) : "";
                    var ex = root["expect"] as Dictionary<string, object>;
                    if (ex != null) foreach (var kv in ex) si.Expect[kv.Key] = Convert.ToString(kv.Value);
                    if (File.Exists(si.Png)) list.Add(si);
                }
                catch { }
            }
            return list;
        }

        void RefreshSamples()
        {
            lvSamples.Items.Clear();
            foreach (var s in ReadSamples())
                lvSamples.Items.Add(new ListViewItem(new[] { s.Name, s.Expect.Count.ToString(), s.Source }) { Tag = s });
        }

        void SaveSample()
        {
            if (working == null || ocr == null) { SetStatus("เปิดใบตัวอย่างก่อน", true); return; }
            string err = TemplateEditor.ValidateId(working.Id);
            if (err != "") { SetStatus("id ของ Template ไม่ถูกต้อง: " + err, true); return; }
            var ex = expect.Where(kv => !string.IsNullOrWhiteSpace(kv.Value)).ToDictionary(kv => kv.Key, kv => kv.Value);
            if (ex.Count == 0) { MessageBox.Show(this, "ยังไม่มีเฉลย — พิมพ์ค่าที่ถูกต้องในแท็บ \"ผลลัพธ์ & เฉลย\" อย่างน้อย 1 ช่อง", "บันทึกตัวอย่าง", MessageBoxButtons.OK, MessageBoxIcon.Information); return; }
            try
            {
                string dir = SamplesDir();
                Directory.CreateDirectory(dir);
                int n = 1; while (File.Exists(Path.Combine(dir, "s" + n.ToString("00") + ".json"))) n++;
                string stem = "s" + n.ToString("00");
                ocr.Image.Save(Path.Combine(dir, stem + ".png"), ImageFormat.Png);
                var obj = new Dictionary<string, object> { { "image", stem + ".png" }, { "source", sampleLabel }, { "expect", ex } };
                AdminAuth.AtomicWrite(Path.Combine(dir, stem + ".json"), new JavaScriptSerializer().Serialize(obj));
                RefreshSamples();
                SetStatus("บันทึกตัวอย่าง " + stem + " (" + ex.Count + " ค่าเฉลย) แล้ว");
            }
            catch (Exception e) { MessageBox.Show(this, "บันทึกตัวอย่างไม่ได้: " + e.Message, "บันทึกตัวอย่าง", MessageBoxButtons.OK, MessageBoxIcon.Error); }
        }

        void OpenSavedSample()
        {
            if (lvSamples.SelectedItems.Count == 0) return;
            var s = (SampleInfo)lvSamples.SelectedItems[0].Tag;
            LoadSampleAsync(s.Png, 1, s.Expect);
            sampleLabel = s.Name;
        }

        void DeleteSavedSample()
        {
            if (lvSamples.SelectedItems.Count == 0) return;
            var s = (SampleInfo)lvSamples.SelectedItems[0].Tag;
            if (MessageBox.Show(this, "ลบตัวอย่าง " + s.Name + " ?", "ลบตัวอย่าง", MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2) != DialogResult.Yes) return;
            try { File.Delete(s.Json); File.Delete(s.Png); } catch (Exception ex) { MessageBox.Show(this, ex.Message, "ลบไม่ได้", MessageBoxButtons.OK, MessageBoxIcon.Error); }
            RefreshSamples();
        }

        /// <summary>ทดสอบทุกตัวอย่างของ Template ด้วยฉบับที่กำลังแก้ (ยังไม่ต้องบันทึก) — คืนข้อความสรุป</summary>
        public string RunAllSamples(out int pass, out int fail)
        {
            pass = fail = 0;
            var sb = new StringBuilder();
            foreach (var s in ReadSamples())
            {
                var o = RunOcr(s.Png, 1);
                var vals = Fields.FromParse(BLParser.Parse(o, working));
                var res = Golden.Compare(vals, s.Expect);
                bool idOk = working.Matches(o.RawText);
                sb.AppendLine("== " + s.Name + "  (" + s.Source + ")" + (idOk ? "" : "   ⚠ ไม่พบคำระบุผู้ออก"));
                foreach (var r in res)
                {
                    if (r.Ok) pass++; else fail++;
                    sb.AppendLine((r.Ok ? "  ✓ " : "  ✗ ") + r.Key.PadRight(15) + (r.Ok ? r.Got : "คาดว่า [" + r.Expected + "]  ได้ [" + r.Got + "]"));
                }
                if (o.Image != null) o.Image.Dispose();
            }
            if (pass + fail == 0) sb.AppendLine("ยังไม่มีตัวอย่างที่บันทึกไว้ — เปิดใบตัวอย่าง ใส่เฉลย แล้วกด \"บันทึกใบนี้เป็นตัวอย่าง\"");
            else sb.AppendLine().AppendLine("สรุป: ผ่าน " + pass + " · ไม่ผ่าน " + fail);
            return sb.ToString();
        }

        async void TestAllSamplesAsync()
        {
            if (working == null) return;
            UseWaitCursor = true; SetStatus("กำลังทดสอบทุกตัวอย่าง…");
            try
            {
                int pass = 0, fail = 0;
                string text = null;
                ApplyGeneralEdits(false);                    // อ่านค่าจากกล่องข้อความบน UI thread ก่อน แล้วค่อยทดสอบเบื้องหลัง
                await Task.Run(() => { int p, f; text = RunAllSamples(out p, out f); pass = p; fail = f; });
                txtTest.Text = text;
                SetStatus("ทดสอบเสร็จ: ผ่าน " + pass + " · ไม่ผ่าน " + fail, fail > 0);
            }
            catch (Exception ex) { SetStatus("ทดสอบไม่สำเร็จ: " + ex.GetBaseException().Message, true); }
            finally { UseWaitCursor = false; }
        }
    }
}
