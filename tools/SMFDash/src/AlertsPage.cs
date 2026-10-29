// Alerts page: one card per SQL HTML report + a sortable table of the selected report.
// "Load HTML..." (or dropping .html files on the page) previews real SQL output; nothing is uploaded or written to the database.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Windows.Forms;

namespace SMFDash
{
    public class AlertCard : Control
    {
        public AlertDef A; public bool Selected;
        static readonly Font Emoji = new Font("Segoe UI Emoji", 15f);
        public AlertCard(AlertDef a) { A = a; Width = 196; Height = 82; Margin = new Padding(0, 0, 10, 10); DoubleBuffered = true; Cursor = Cursors.Hand; }

        public static Color SevCol(string sev) { return sev == "bad" ? Theme.Hex("#ef4444") : sev == "warn" ? Theme.Hex("#f59e0b") : sev == "ok" ? Theme.Hex("#10b981") : Theme.Hex("#6366f1"); }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias; g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit; g.Clear(Theme.Bg);
            var r = new RectangleF(0.5f, 0.5f, Width - 2, Height - 2);
            using (var p = Draw.Round(r, 8)) using (var b = new SolidBrush(Color.White)) using (var pen = new Pen(Selected ? Theme.Apr : Theme.Border, Selected ? 2f : 1f)) { g.FillPath(b, p); g.DrawPath(pen, p); }
            using (var b = new SolidBrush(SevCol(A.Sev))) g.FillRectangle(b, 10, 1, Width - 20, 3);
            g.DrawString(A.Icon, Emoji, Brushes.DimGray, 8, 14);
            g.DrawString(A.Short, Theme.Bold, Brushes.Black, new RectangleF(44, 10, Width - 50, 18), new StringFormat { Trimming = StringTrimming.EllipsisCharacter, FormatFlags = StringFormatFlags.NoWrap });
            using (var b = new SolidBrush(A.Rows.Count == 0 ? Theme.Up : A.Sev == "bad" ? Theme.Down : A.Sev == "warn" ? Theme.Hex("#d97706") : Theme.Text))
                g.DrawString(A.Rows.Count.ToString(), new Font("Segoe UI", 17f, FontStyle.Bold), b, 42, 26);
            string sub = A.Rows.Count == 0 ? "All clear ✓" : (A.Total.HasValue ? "฿ " + Money(A.Total.Value) : "") +
                (A.Di >= 0 ? (A.Total.HasValue ? " · " : "") + "oldest " + (A.Cols[A.Di].Kind == "age" ? AlertsPage.AgeTxt(A.MaxDays) : A.MaxDays.ToString("N0") + " d") : "");
            g.DrawString(sub, Theme.Small, Brushes.Gray, new RectangleF(10, 58, Width - 16, 18), new StringFormat { Trimming = StringTrimming.EllipsisCharacter, FormatFlags = StringFormatFlags.NoWrap });
        }

        public static string Money(decimal v) { return v.ToString("#,0.00", CultureInfo.InvariantCulture); }
    }

    public class AlertsPage : Panel
    {
        readonly List<AlertSrc> _src = new List<AlertSrc>(); List<AlertDef> _alerts = new List<AlertDef>();
        int _sel; string _q = "", _user = "all"; int _sortI = -1, _sortDir = 1; bool _group, _loading;
        public event Action Changed;
        public int TotalItems { get { return _alerts.Sum(a => a.Rows.Count); } }

        readonly Label _sub = new Label { AutoSize = true, ForeColor = Theme.Muted, Font = Theme.Small };
        readonly FlowLayoutPanel _cards = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, WrapContents = true, BackColor = Theme.Bg, Padding = new Padding(0, 4, 0, 0) };
        readonly Panel _detail = new Panel { Dock = DockStyle.Fill, BackColor = Color.White, Padding = new Padding(14, 10, 14, 6) };
        readonly Label _dTitle = new Label { Dock = DockStyle.Top, Height = 26, Font = new Font("Segoe UI", 12f, FontStyle.Bold) };
        readonly Label _dHead = new Label { Dock = DockStyle.Top, Height = 22, ForeColor = Theme.Text };
        readonly Label _dSrc = new Label { Dock = DockStyle.Top, Height = 18, ForeColor = Theme.Faint, Font = Theme.Small };
        readonly TextBox _search = new TextBox { Width = 220 };
        readonly CheckBox _groupBox = new CheckBox { Text = "Group by user", AutoSize = true, ForeColor = Theme.Muted };
        readonly Button _csv = new Button { Text = "⬇ CSV", Width = 76, Height = 26 };
        readonly Button _open = new Button { Text = "↗ Original HTML", Width = 120, Height = 26 };
        readonly FlowLayoutPanel _chips = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, WrapContents = true, BackColor = Color.White, Padding = new Padding(0, 2, 0, 6) };
        readonly DataGridView _grid = Tbl.Styled();
        readonly Label _foot = new Label { Dock = DockStyle.Bottom, Height = 28, Font = Theme.Bold, TextAlign = ContentAlignment.MiddleLeft, BackColor = Theme.Hex("#f8fafc"), Padding = new Padding(10, 0, 0, 0) };
        readonly Label _toast = new Label { AutoSize = true, ForeColor = Theme.Up, Font = Theme.Bold };
        readonly Timer _toastTimer = new Timer { Interval = 1500 };
        List<string[]> _shown = new List<string[]>();

        public AlertsPage()
        {
            Dock = DockStyle.Fill; BackColor = Theme.Bg; AllowDrop = true;
            _src.AddRange(AlertSamples.Demo());

            var top = new Panel { Dock = DockStyle.Top, Height = 52 };
            var title = new Label { Text = "Alerts", AutoSize = true, Font = new Font("Segoe UI", 13f, FontStyle.Bold), Left = 0, Top = 4 };
            _sub.Left = 2; _sub.Top = 32;
            var load = new Button { Text = "⬆ Load HTML…", Width = 110, Height = 26, Anchor = AnchorStyles.Top | AnchorStyles.Right, Top = 8 };
            var reset = new Button { Text = "↺ Demo data", Width = 96, Height = 26, Anchor = AnchorStyles.Top | AnchorStyles.Right, Top = 8 };
            top.Resize += (s, e) => { reset.Left = top.Width - reset.Width - 4; load.Left = reset.Left - load.Width - 6; };
            top.Controls.AddRange(new Control[] { title, _sub, load, reset });
            load.Click += (s, e) => LoadFiles();
            reset.Click += (s, e) => { _liveNote = ""; AlertParser.Today = ApprovalData.Now; _src.Clear(); _src.AddRange(AlertSamples.Demo()); _sel = 0; ResetFilters(); Rebuild(); };

            // detail card
            var tool = new Panel { Dock = DockStyle.Top, Height = 34 };
            _search.Left = 0; _search.Top = 4; _groupBox.Left = _search.Right + 14; _groupBox.Top = 7; _toast.Left = _groupBox.Right + 20; _toast.Top = 8;
            tool.Controls.AddRange(new Control[] { _search, _groupBox, _toast });
            var head = new Panel { Dock = DockStyle.Top, Height = 72 };
            head.Controls.Add(_dSrc); head.Controls.Add(_dHead); head.Controls.Add(_dTitle);
            // CSV / Original HTML sit in the toolbar row (fixed positions) next to the search box
            _csv.Left = _search.Right + 10; _csv.Top = 3; _open.Left = _csv.Right + 6; _open.Top = 3;
            _groupBox.Left = _open.Right + 16; _toast.Left = _groupBox.Right + 20;
            tool.Controls.AddRange(new Control[] { _csv, _open });

            _grid.Dock = DockStyle.Fill; _grid.MultiSelect = false; _grid.AllowDrop = true;
            _grid.DefaultCellStyle.Padding = new Padding(2, 0, 2, 0); _grid.RowTemplate.Height = 28; _grid.ScrollBars = ScrollBars.Both;
            _detail.Controls.Add(_grid); _detail.Controls.Add(_foot); _detail.Controls.Add(_chips); _detail.Controls.Add(tool); _detail.Controls.Add(head);
            _grid.BringToFront();

            var host = new Panel { Dock = DockStyle.Fill, Padding = new Padding(0, 8, 0, 0), BackColor = Theme.Bg };
            host.Controls.Add(_detail);
            Controls.Add(host); Controls.Add(_cards); Controls.Add(top);
            host.BringToFront();

            _search.TextChanged += (s, e) => { if (!_loading) { _q = _search.Text.Trim(); RefreshDetail(false); } };
            _groupBox.CheckedChanged += (s, e) => { if (!_loading) { _group = _groupBox.Checked; RefreshDetail(false); } };
            _csv.Click += (s, e) => ExportCsv();
            _open.Click += (s, e) => OpenOriginal();
            _grid.ColumnHeaderMouseClick += (s, e) => { _sortDir = _sortI == e.ColumnIndex ? -_sortDir : 1; _sortI = e.ColumnIndex; RefreshDetail(false); };
            _grid.CellFormatting += FormatCell;
            _grid.CellClick += (s, e) =>
            {
                if (e.RowIndex < 0 || e.RowIndex >= _grid.Rows.Count || e.ColumnIndex >= Sel().Cols.Count) return;
                var c = Sel().Cols[e.ColumnIndex]; var v = Convert.ToString(_grid.Rows[e.RowIndex].Cells[e.ColumnIndex].Value);
                if ((c.Kind == "job" || c.Kind == "inv") && v != "") { try { Clipboard.SetText(v); _toast.Text = "Copied " + v; _toastTimer.Stop(); _toastTimer.Start(); } catch { } }
            };
            _toastTimer.Tick += (s, e) => { _toastTimer.Stop(); _toast.Text = ""; };
            DragEnter += OnDrag; DragDrop += OnDrop; _grid.DragEnter += OnDrag; _grid.DragDrop += OnDrop; _cards.AllowDrop = true; _cards.DragEnter += OnDrag; _cards.DragDrop += OnDrop;

            Rebuild();
        }

        string _liveNote = "";

        /// <summary>Re-read the loaded reports with the current display settings (colour thresholds, hide empty).</summary>
        public void Reapply() { ResetFilters(); Rebuild(); }

        /// <summary>Replace the list with alerts read from the database (SMALERTDEF + views); ages then use today's real date.</summary>
        public void SetLive(List<AlertSrc> live, string target)
        {
            _src.Clear(); _src.AddRange(live); _sel = 0; _liveNote = "LIVE · " + target; AlertParser.Today = DateTime.Today;
            ResetFilters(); Rebuild();
        }

        AlertDef Sel() { return _alerts.Count > 0 ? _alerts[Math.Min(_sel, _alerts.Count - 1)] : null; }
        void ResetFilters() { _q = ""; _user = "all"; _sortI = -1; _group = false; _loading = true; _search.Text = ""; _groupBox.Checked = false; _loading = false; }

        public static string AgeTxt(double d) { return d >= 730 ? (d / 365).ToString("0.0") + " y" : d >= 60 ? Math.Round(d / 30) + " mo" : d + " d"; }
        static string Title(string s) { return s.Length == 0 ? s : s.Substring(0, 1) + s.Substring(1).ToLowerInvariant(); }

        /* ---------- load ---------- */
        void OnDrag(object s, DragEventArgs e) { e.Effect = e.Data.GetDataPresent(DataFormats.FileDrop) ? DragDropEffects.Copy : DragDropEffects.None; }
        void OnDrop(object s, DragEventArgs e) { var f = e.Data.GetData(DataFormats.FileDrop) as string[]; if (f != null) AddFiles(f); }

        void LoadFiles()
        {
            using (var dlg = new OpenFileDialog { Filter = "HTML (*.html;*.htm)|*.html;*.htm|All files|*.*", Multiselect = true })
                if (dlg.ShowDialog(this) == DialogResult.OK) AddFiles(dlg.FileNames);
        }

        void AddFiles(IEnumerable<string> files)
        {
            foreach (var f in files)
            {
                try
                {
                    var s = new AlertSrc { File = Path.GetFileName(f), Subject = "", Html = File.ReadAllText(f, Encoding.UTF8) };
                    int i = _src.FindIndex(x => x.File == s.File);
                    if (i >= 0) _src[i] = s; else _src.Add(s);
                    _sel = i >= 0 ? i : _src.Count - 1;
                }
                catch (Exception ex) { MessageBox.Show(this, f + "\n\n" + ex.Message, "Cannot read file", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
            }
            _q = ""; _user = "all"; _sortI = -1; Rebuild();
        }

        void Rebuild()
        {
            _alerts = _src.Select(AlertParser.Parse).Where(a => a != null && (!AlertSettings.HideEmpty || a.Rows.Count > 0)).ToList();
            if (_sel >= _alerts.Count) _sel = 0;
            _cards.SuspendLayout(); foreach (Control c in _cards.Controls.Cast<Control>().ToList()) c.Dispose(); _cards.Controls.Clear();
            for (int i = 0; i < _alerts.Count; i++)
            {
                var card = new AlertCard(_alerts[i]) { Tag = i, Selected = i == _sel };
                card.Click += (s, e) => { _sel = (int)((Control)s).Tag; ResetFilters(); Rebuild(); };
                _cards.Controls.Add(card);
            }
            _cards.ResumeLayout(true);
            _sub.Text = _alerts.Count + " report(s) · " + TotalItems + " item(s) need attention · " +
                (_liveNote != "" ? _liveNote : "demo data, demo clock " + ApprovalData.Now.ToString("d MMM yyyy", CultureInfo.InvariantCulture));
            RefreshDetail(true);
            if (Changed != null) Changed();
        }

        /* ---------- detail ---------- */
        List<string[]> Filtered(AlertDef a)
        {
            var rows = a.Rows.Where(r => (_user == "all" || (a.Ui >= 0 && r[a.Ui] == _user)) &&
                (_q == "" || string.Join(" ", r).IndexOf(_q, StringComparison.OrdinalIgnoreCase) >= 0)).ToList();
            if (_sortI >= 0 && _sortI < a.Cols.Count)
            {
                int i = _sortI; string k = a.Cols[i].Kind; int dir = _sortDir;
                Func<string[], IComparable> key = r =>
                    k == "money" || k == "num" || k == "days" || k == "age" ? (IComparable)AlertParser.Num(r[i]) :
                    k == "date" ? (IComparable)(AlertParser.DateOf(r[i]) ?? DateTime.MinValue) : (IComparable)r[i];
                rows = (dir > 0 ? rows.OrderBy(key) : rows.OrderByDescending(key)).ToList();
            }
            return rows;
        }

        void RefreshDetail(bool rebuildColumns)
        {
            foreach (var c in _cards.Controls.OfType<AlertCard>()) { c.Selected = _alerts.IndexOf(c.A) == _sel; c.Invalidate(); }
            var a = Sel(); _detail.Visible = a != null; if (a == null) return;
            _loading = true;
            _dTitle.Text = a.Icon + "  " + a.Title; _dHead.Text = a.Heading + (a.Note != "" ? "   " + a.Note : "");
            _dSrc.Text = "Source: " + a.File + " · " + a.Rows.Count + " item(s)" + (a.Total.HasValue ? " · ฿ " + AlertCard.Money(a.Total.Value) : "");
            _groupBox.Visible = a.Ui >= 0;

            // user chips
            _chips.SuspendLayout(); foreach (Control c in _chips.Controls.Cast<Control>().ToList()) c.Dispose(); _chips.Controls.Clear();
            if (a.Ui >= 0)
            {
                Action<string, string, int> chip = (key, label, n) =>
                {
                    var b = new PillButton(label + "  " + n) { Tag = key, Rounded = true, Height = 24, On = _user == key, Margin = new Padding(0, 0, 4, 4) };
                    b.Click += (s, e) => { _user = (string)((Control)s).Tag; RefreshDetail(false); };
                    _chips.Controls.Add(b);
                };
                chip("all", "All", a.Rows.Count);
                foreach (var g in a.Rows.GroupBy(r => r[a.Ui]).OrderBy(g => g.Key)) chip(g.Key, Title(g.Key), g.Count());
            }
            _chips.ResumeLayout(true);

            if (rebuildColumns || _grid.Columns.Count != a.Cols.Count)
            {
                _grid.Columns.Clear();
                foreach (var c in a.Cols)
                {
                    var col = new DataGridViewTextBoxColumn { HeaderText = c.Name, SortMode = DataGridViewColumnSortMode.Programmatic, FillWeight = c.Kind == "job" || c.Kind == "inv" ? 130 : 100, MinimumWidth = 70 };
                    if (c.Kind == "money" || c.Kind == "num") { col.DefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleRight; col.HeaderCell.Style.Alignment = DataGridViewContentAlignment.MiddleRight; }
                    _grid.Columns.Add(col);
                }
            }
            for (int i = 0; i < a.Cols.Count; i++) _grid.Columns[i].HeaderText = a.Cols[i].Name + (_sortI == i ? (_sortDir > 0 ? " ▲" : " ▼") : "");

            _shown = Filtered(a); _grid.Rows.Clear();
            Action<string[]> add = r =>
            {
                var cells = new object[a.Cols.Count];
                for (int i = 0; i < cells.Length; i++) cells[i] = Cell(a.Cols[i], r[i]);
                int ix = _grid.Rows.Add(cells); _grid.Rows[ix].Tag = r;
            };
            if (_group && a.Ui >= 0)
                foreach (var g in _shown.GroupBy(r => r[a.Ui]).OrderBy(g => g.Key))
                {
                    var cells = new object[a.Cols.Count]; for (int i = 0; i < cells.Length; i++) cells[i] = "";
                    cells[0] = "● " + Title(g.Key) + " · " + g.Count() + " item(s)" + (a.Mi >= 0 ? " · ฿ " + AlertCard.Money(g.Sum(r => AlertParser.Num(r[a.Mi]))) : "");
                    int gi = _grid.Rows.Add(cells); _grid.Rows[gi].Tag = "grp";
                    foreach (var r in g) add(r);
                }
            else foreach (var r in _shown) add(r);
            _foot.Text = _shown.Count + " item(s)" + (a.Mi >= 0 ? "      Total  ฿ " + AlertCard.Money(_shown.Sum(r => AlertParser.Num(r[a.Mi]))) : "");
            _loading = false;
        }

        static string Cell(AlertCol c, string v)
        {
            if (v == "") return "—";
            switch (c.Kind)
            {
                case "date": var d = AlertParser.DateOf(v); return d.HasValue ? d.Value.ToString("dd MMM yyyy", CultureInfo.InvariantCulture) : v;
                case "money": return AlertParser.Num(v).ToString("#,0.00", CultureInfo.InvariantCulture);
                case "days": return AlertParser.Num(v).ToString("N0", CultureInfo.InvariantCulture) + " d";
                case "age": return AgeTxt((double)AlertParser.Num(v));
                case "user": return Title(v);
                default: return v;
            }
        }

        void FormatCell(object s, DataGridViewCellFormattingEventArgs e)
        {
            var a = Sel(); if (a == null || e.RowIndex < 0 || e.RowIndex >= _grid.Rows.Count) return;
            var tag = _grid.Rows[e.RowIndex].Tag;
            if (tag as string == "grp") { e.CellStyle.BackColor = Theme.Hex("#eef2ff"); e.CellStyle.ForeColor = Theme.Hex("#3730a3"); e.CellStyle.Font = Theme.Bold; return; }
            var r = tag as string[]; if (r == null || e.ColumnIndex >= a.Cols.Count) return;
            string k = a.Cols[e.ColumnIndex].Kind;
            if (k == "days" || k == "age")
            {
                string sev = AlertParser.Sev((double)AlertParser.Num(r[e.ColumnIndex]));
                e.CellStyle.ForeColor = sev == "bad" ? Theme.Hex("#b91c1c") : sev == "warn" ? Theme.Hex("#b45309") : Theme.Hex("#3730a3");
                e.CellStyle.BackColor = sev == "bad" ? Theme.Hex("#fee2e2") : sev == "warn" ? Theme.Hex("#fef3c7") : Theme.Hex("#e0e7ff");
                e.CellStyle.Font = Theme.Bold; e.CellStyle.Alignment = DataGridViewContentAlignment.MiddleCenter;
            }
            else if (k == "money" && AlertParser.Num(r[e.ColumnIndex]) < 0) e.CellStyle.ForeColor = Theme.Down;
            else if (k == "job" || k == "inv") e.CellStyle.Font = new Font("Consolas", 9f);
        }

        /* ---------- export / open ---------- */
        void ExportCsv()
        {
            var a = Sel(); if (a == null) return;
            using (var dlg = new SaveFileDialog { Filter = "CSV (*.csv)|*.csv", FileName = Path.GetFileNameWithoutExtension(a.File) + ".csv" })
            {
                if (dlg.ShowDialog(this) != DialogResult.OK) return;
                Func<string, string> q = t => "\"" + (t ?? "").Replace("\"", "\"\"") + "\"";
                var lines = new List<string> { string.Join(",", a.Cols.Select(c => q(c.Name)).ToArray()) };
                lines.AddRange(Filtered(a).Select(r => string.Join(",", r.Select(q).ToArray())));
                File.WriteAllLines(dlg.FileName, lines.ToArray(), new UTF8Encoding(true));
            }
        }

        void OpenOriginal()
        {
            var a = Sel(); if (a == null) return;
            string path = Path.Combine(Path.GetTempPath(), "SMFDash_" + Path.GetFileNameWithoutExtension(a.File) + ".html");
            File.WriteAllText(path, a.Html, new UTF8Encoding(true));
            try { Process.Start(path); } catch (Exception ex) { MessageBox.Show(this, ex.Message, "Cannot open", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
        }
    }
}
