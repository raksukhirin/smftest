// Approval workflow page — inbox (left) + request detail with approve / reject (right).
// Data is the in-memory demo list from ApprovalData; nothing is written to the database.
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
    /// <summary>Progress bar + one dot per workflow step for a request.</summary>
    public class Stepper : Control
    {
        ApprReq _r; readonly ToolTip _tip = new ToolTip(); int _lastHover = -1;
        public Stepper() { DoubleBuffered = true; BackColor = Color.White; }
        public ApprReq Req { get { return _r; } set { _r = value; Invalidate(); } }

        float X(int i) { return 18 + i * (Width - 36f) / (ApprovalData.Steps.Length - 1); }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias; g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
            if (_r == null) return;
            int n = ApprovalData.Steps.Length, pct = _r.DoneSteps * 100 / n;
            g.DrawString("Progress", Theme.Small, Brushes.Gray, 12, 4);
            g.DrawString(pct + "%", Theme.Section, Brushes.Black, new RectangleF(0, 4, Width - 12, 14), new StringFormat { Alignment = StringAlignment.Far });
            using (var b = new SolidBrush(Theme.Hex("#e2e8f0"))) g.FillRectangle(b, 12, 22, Width - 24, 6);
            using (var b = new SolidBrush(Theme.Hex("#6366f1"))) g.FillRectangle(b, 12, 22, (Width - 24) * pct / 100f, 6);

            float cy = 56;
            for (int i = 0; i < n; i++)
            {
                int no = i + 1;
                if (i > 0)
                    using (var pen = new Pen(no <= _r.DoneSteps || no == _r.Step ? Theme.Hex("#6366f1") : Theme.Hex("#e2e8f0"), 2)) g.DrawLine(pen, X(i - 1), cy, X(i), cy);
            }
            for (int i = 0; i < n; i++)
            {
                int no = i + 1; Color col = Theme.Hex("#e2e8f0"), fore = Theme.Muted; string txt = no.ToString();
                bool ring = false; Color ringCol = Color.Empty;
                if (no <= _r.DoneSteps) { col = Theme.Hex("#10b981"); fore = Color.White; txt = "✓"; }
                else if (no == _r.Step && _r.Status == "Rejected") { col = Theme.Hex("#ef4444"); fore = Color.White; txt = "✕"; ring = true; ringCol = Theme.Hex("#fecaca"); }
                else if (no == _r.Step) { col = Theme.Hex("#4f46e5"); fore = Color.White; ring = true; ringCol = Theme.Hex("#c7d2fe"); }
                float x = X(i), r = 10;
                if (ring) using (var b = new SolidBrush(ringCol)) g.FillEllipse(b, x - r - 3, cy - r - 3, 2 * r + 6, 2 * r + 6);
                using (var b = new SolidBrush(col)) g.FillEllipse(b, x - r, cy - r, 2 * r, 2 * r);
                using (var b = new SolidBrush(fore)) g.DrawString(txt, new Font("Segoe UI", 7f, FontStyle.Bold), b, new RectangleF(x - r - 2, cy - 7, 2 * r + 4, 14), new StringFormat { Alignment = StringAlignment.Center });
            }
            var cur = ApprovalData.Steps[_r.Step - 1];
            g.DrawString(cur.No.ToString("00") + " " + cur.Name, Theme.Bold, Brushes.Black, new RectangleF(0, 76, Width, 18), new StringFormat { Alignment = StringAlignment.Center });
        }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            int hit = -1;
            if (_r != null && Math.Abs(e.Y - 56) < 14)
                for (int i = 0; i < ApprovalData.Steps.Length; i++) if (Math.Abs(e.X - X(i)) < 10) hit = i;
            if (hit != _lastHover)
            {
                _lastHover = hit;
                _tip.SetToolTip(this, hit < 0 ? null : ApprovalData.Steps[hit].No.ToString("00") + " " + ApprovalData.Steps[hit].Name + "  (approver: " + ApprovalData.Steps[hit].Approver + ")");
            }
            base.OnMouseMove(e);
        }
    }

    public class ApprovalPage : Panel
    {
        readonly string _me;
        readonly List<ApprReq> _data = ApprovalData.Seed();
        string _mod = "SE", _tab = "pending";
        int _stepFilter; bool _mine = true, _late, _loading;
        readonly HashSet<int> _sel = new HashSet<int>();
        int _open, _shown;

        // top bars
        readonly List<PillButton> _modBtns = new List<PillButton>(), _tabBtns = new List<PillButton>();
        readonly TextBox _search = new TextBox { Width = 200 };
        readonly ComboBox _stepBox = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = 170 };
        readonly ComboBox _whoBox = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = 120 };
        readonly CheckBox _lateBox = new CheckBox { Text = "Overdue only", AutoSize = true, ForeColor = Theme.Muted };
        readonly Button _bulk = new Button { Text = "", Height = 26, Width = 170, FlatStyle = FlatStyle.Flat, BackColor = Theme.Hex("#059669"), ForeColor = Color.White, Visible = false };
        readonly Label _title = new Label { AutoSize = true, Font = new Font("Segoe UI", 13f, FontStyle.Bold) };

        readonly DataGridView _grid = Tbl.Styled();
        readonly Panel _toast = new Panel { Dock = DockStyle.Bottom, Height = 32, BackColor = Theme.Hex("#1e293b"), Visible = false };
        readonly Label _toastMsg = new Label { ForeColor = Color.White, AutoSize = false, Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft, Padding = new Padding(10, 0, 0, 0) };
        readonly LinkLabel _undo = new LinkLabel { Text = "UNDO", Dock = DockStyle.Right, Width = 70, TextAlign = ContentAlignment.MiddleCenter, LinkColor = Theme.Hex("#a5b4fc"), ActiveLinkColor = Color.White };
        readonly Timer _toastTimer = new Timer { Interval = 6000 };
        Action _undoAction;

        // detail
        readonly Panel _right = new Panel { Dock = DockStyle.Right, Width = 440, BackColor = Color.White };
        readonly Label _dType = new Label { Left = 14, Top = 8, AutoSize = true, ForeColor = Theme.Muted, Font = Theme.Small };
        readonly Label _dDoc = new Label { Left = 12, Top = 24, AutoSize = true, Font = new Font("Segoe UI", 13f, FontStyle.Bold) };
        readonly Label _dStatus = new Label { Top = 14, AutoSize = true, Font = Theme.Bold, Anchor = AnchorStyles.Top | AnchorStyles.Right, Padding = new Padding(8, 2, 8, 2) };
        readonly Stepper _stepper = new Stepper { Dock = DockStyle.Top, Height = 100 };
        readonly Panel _info = new Panel { Dock = DockStyle.Fill, AutoScroll = true, BackColor = Color.White, Padding = new Padding(10, 0, 6, 8) };
        TableLayoutPanel _tbl;
        readonly Panel _foot = new Panel { Dock = DockStyle.Bottom, Height = 128, BackColor = Theme.Hex("#f8fafc"), Padding = new Padding(14, 10, 14, 10) };
        readonly TextBox _remark = new TextBox { Multiline = true, Height = 46, Dock = DockStyle.Top, ScrollBars = ScrollBars.Vertical };
        readonly Label _err = new Label { Dock = DockStyle.Top, Height = 18, ForeColor = Theme.Down, Font = Theme.Small, Text = "Please enter a reason before rejecting.", Visible = false };
        readonly Button _bApprove = new Button { Text = "✓ Approve", Height = 32, FlatStyle = FlatStyle.Flat, BackColor = Theme.Hex("#059669"), ForeColor = Color.White, Font = Theme.Bold };
        readonly Button _bReject = new Button { Text = "✕ Reject", Height = 32, FlatStyle = FlatStyle.Flat, BackColor = Color.White, ForeColor = Theme.Down, Font = Theme.Bold };
        readonly Label _wait = new Label { Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft, Font = Theme.Base };

        public ApprovalPage(string me)
        {
            _me = me; Dock = DockStyle.Fill; BackColor = Theme.Bg;
            BuildBars(); BuildGrid(); BuildDetail();
            RefreshAll();
        }

        public int WaitingForMe { get { return _data.Count(r => CanAct(r)); } }

        /* ---------- model helpers ---------- */
        ApprStep StepOf(ApprReq r) { return ApprovalData.Steps[r.Step - 1]; }
        bool CanAct(ApprReq r) { return r.Status == "Wait" && StepOf(r).Approver == _me; }
        bool IsLate(ApprReq r) { return r.Status == "Wait" && r.Deadline.HasValue && r.Deadline.Value.Date.AddDays(1) <= ApprovalData.Now; }
        ApprReq ById(int id) { return _data.FirstOrDefault(r => r.Id == id); }
        static string Cut(string t, int n) { return t.Length <= n ? t : t.Substring(0, n - 1) + "…"; }
        static string Fmt(DateTime d) { return d.ToString("dd MMM HH:mm", CultureInfo.InvariantCulture); }
        static string Ago(DateTime d)
        {
            int m = (int)(ApprovalData.Now - d).TotalMinutes;
            return m < 60 ? m + " min ago" : m < 1440 ? (m / 60) + " h ago" : (m / 1440) + " d ago";
        }

        IEnumerable<ApprReq> Filtered()
        {
            string q = _search.Text.Trim().ToLowerInvariant();
            return _data.Where(r =>
            {
                if (r.Module != _mod) return false;
                if (_tab == "pending" && r.Status != "Wait") return false;
                if (_tab == "approved" && r.Status != "Approved") return false;
                if (_tab == "rejected" && r.Status != "Rejected") return false;
                if (_stepFilter > 0 && r.Step != _stepFilter) return false;
                if (_mine && _tab == "pending" && !CanAct(r)) return false;
                if (_late && !IsLate(r)) return false;
                if (q != "" && (r.Doc + " " + r.Shipper + " " + r.Consignee + " " + r.RequestedBy + " " + r.Remark).ToLowerInvariant().IndexOf(q, StringComparison.Ordinal) < 0) return false;
                return true;
            }).OrderByDescending(r => r.RequestedAt);
        }

        /* ---------- actions ---------- */
        Action Decide(ApprReq r, string action, string remark)
        {
            var before = r.Clone(); int id = r.Id;
            r.Status = action; if (action == "Approved") r.DoneSteps = r.Step;
            r.History.Add(new ApprHist { Step = r.Step, Action = action, By = _me, At = ApprovalData.Now, Remark = remark });
            _sel.Remove(id);
            return () => { int i = _data.FindIndex(x => x.Id == id); if (i >= 0) _data[i] = before; RefreshAll(); };
        }

        void ShowToast(string msg, Action undo)
        {
            _toastMsg.Text = msg; _undoAction = undo; _undo.Visible = undo != null; _toast.Visible = true;
            _toastTimer.Stop(); _toastTimer.Start();
        }

        void ApproveMany(IList<int> ids)
        {
            var undos = ids.Select(id => Decide(ById(id), "Approved", "")).ToList();
            ShowToast(ids.Count + " request(s) approved", () => { foreach (var u in undos) u(); });
            RefreshAll();
        }

        /* ---------- build UI ---------- */
        void BuildBars()
        {
            var modBar = new Panel { Dock = DockStyle.Top, Height = 44, Padding = new Padding(0, 6, 0, 0) };
            _title.Left = 0; _title.Top = 8; modBar.Controls.Add(_title);

            var filter = new Panel { Dock = DockStyle.Top, Height = 40 };
            int x = 0;
            foreach (var m in ApprovalData.Modules)
            {
                var b = new PillButton(m[1] + "  (99)") { Left = x, Top = 4, Height = 28, Tag = m[0], Rounded = true, Accent = Theme.Apr };
                b.Click += (s, e) => { _mod = (string)((Control)s).Tag; _sel.Clear(); _open = 0; RefreshAll(); };
                filter.Controls.Add(b); _modBtns.Add(b); x += b.Width + 4;
            }
            _search.Left = x + 16; _search.Top = 7; filter.Controls.Add(_search);
            var hint = new Label { Text = "Search Docno / customer", AutoSize = true, ForeColor = Theme.Faint, Font = Theme.Small, Left = _search.Left + _search.Width + 6, Top = 11 };
            filter.Controls.Add(hint);

            var tabs = new Panel { Dock = DockStyle.Top, Height = 40 };
            int tx = 0;
            foreach (var t in new[] { new[] { "pending", "Pending" }, new[] { "approved", "Approved" }, new[] { "rejected", "Rejected" }, new[] { "all", "All" } })
            {
                var b = new PillButton(t[1] + "  (99)") { Left = tx, Top = 6, Height = 26, Tag = t[0], Rounded = true };
                b.Click += (s, e) => { _tab = (string)((Control)s).Tag; _sel.Clear(); RefreshAll(); };
                tabs.Controls.Add(b); _tabBtns.Add(b); tx += b.Width + 4;
            }
            _stepBox.Left = tx + 16; _stepBox.Top = 8; _whoBox.Left = _stepBox.Right + 8; _whoBox.Top = 8; _lateBox.Left = _whoBox.Right + 10; _lateBox.Top = 10;
            _bulk.Left = _lateBox.Right + 90; _bulk.Top = 7; _bulk.FlatAppearance.BorderSize = 0;
            tabs.Controls.AddRange(new Control[] { _stepBox, _whoBox, _lateBox, _bulk });

            _stepBox.Items.Add("All working steps");
            foreach (var s in ApprovalData.Steps) _stepBox.Items.Add(s.No.ToString("00") + " " + s.Name);
            _stepBox.SelectedIndex = 0;
            _whoBox.Items.AddRange(new object[] { "Waiting for me", "Everyone" }); _whoBox.SelectedIndex = 0;

            _search.TextChanged += (s, e) => { if (!_loading) RefreshAll(); };
            _stepBox.SelectedIndexChanged += (s, e) => { if (!_loading) { _stepFilter = _stepBox.SelectedIndex; RefreshAll(); } };
            _whoBox.SelectedIndexChanged += (s, e) => { if (!_loading) { _mine = _whoBox.SelectedIndex == 0; RefreshAll(); } };
            _lateBox.CheckedChanged += (s, e) => { if (!_loading) { _late = _lateBox.Checked; RefreshAll(); } };
            _bulk.Click += (s, e) => ApproveMany(_sel.ToList());

            _bars = new[] { modBar, filter, tabs };
        }
        Panel[] _bars;

        void BuildGrid()
        {
            var host = new Panel { Dock = DockStyle.Fill, BackColor = Color.White, Padding = new Padding(8, 6, 8, 0) };
            _grid.ReadOnly = false; _grid.RowTemplate.Height = 44; _grid.AllowUserToResizeColumns = true; _grid.DefaultCellStyle.WrapMode = DataGridViewTriState.True;
            _grid.MultiSelect = false; _grid.ScrollBars = ScrollBars.Vertical;
            _grid.Columns.Add(new DataGridViewCheckBoxColumn { HeaderText = "", FillWeight = 12, MinimumWidth = 30 });
            Action<string, float> txt = (h, w) => _grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = h, FillWeight = w, ReadOnly = true, SortMode = DataGridViewColumnSortMode.NotSortable });
            txt("Docno", 38); txt("Status", 24); txt("Requested", 46); txt("Working step / remark", 52); txt("Files", 16);
            _grid.Columns.Add(new DataGridViewLinkColumn { HeaderText = "", FillWeight = 17, LinkColor = Theme.Hex("#2563eb"), VisitedLinkColor = Theme.Hex("#2563eb"), ActiveLinkColor = Theme.Hex("#1d4ed8"), TrackVisitedState = false, ReadOnly = true });
            _grid.Columns.Add(new DataGridViewLinkColumn { HeaderText = "", FillWeight = 17, LinkColor = Theme.Down, VisitedLinkColor = Theme.Down, ActiveLinkColor = Theme.Down, TrackVisitedState = false, ReadOnly = true });

            _grid.CellFormatting += (s, e) =>
            {
                if (e.RowIndex < 0) return;
                if (e.ColumnIndex == 1) { e.CellStyle.ForeColor = Theme.Hex("#4338ca"); e.CellStyle.Font = Theme.Bold; }
                else if (e.ColumnIndex == 2)
                {
                    string t = Convert.ToString(e.Value);
                    e.CellStyle.ForeColor = t.StartsWith("Approved") ? Theme.Hex("#047857") : t.StartsWith("Rejected") ? Theme.Hex("#b91c1c") : Theme.Hex("#b45309"); e.CellStyle.Font = Theme.Bold;
                }
                else if (e.ColumnIndex == 3) { var r = ById((int)_grid.Rows[e.RowIndex].Tag); if (r != null && IsLate(r)) e.CellStyle.ForeColor = Theme.Down; }
                else if (e.ColumnIndex == 4) { e.CellStyle.ForeColor = Theme.Hex("#b91c1c"); }
            };
            _grid.CurrentCellDirtyStateChanged += (s, e) => { if (_grid.IsCurrentCellDirty) _grid.CommitEdit(DataGridViewDataErrorContexts.Commit); };
            _grid.CellValueChanged += (s, e) =>
            {
                if (_loading || e.RowIndex < 0 || e.ColumnIndex != 0) return;
                int id = (int)_grid.Rows[e.RowIndex].Tag;
                if (Equals(_grid.Rows[e.RowIndex].Cells[0].Value, true)) _sel.Add(id); else _sel.Remove(id);
                UpdateBulk();
            };
            _grid.CellClick += (s, e) =>
            {
                if (e.RowIndex < 0) return;
                var r = ById((int)_grid.Rows[e.RowIndex].Tag); if (r == null) return;
                if (e.ColumnIndex == 6 && CanAct(r)) { var u = Decide(r, "Approved", ""); ShowToast(r.Doc + " approved", u); RefreshAll(); }
                else if (e.ColumnIndex == 7 && CanAct(r)) { _open = r.Id; ShowDetail(); _err.Visible = true; _remark.Focus(); }
                else if (e.ColumnIndex != 0) { _open = r.Id; ShowDetail(); }
            };
            _grid.CellMouseEnter += (s, e) =>
            {
                if (e.RowIndex < 0) return;
                var v = _grid.Rows[e.RowIndex].Cells[e.ColumnIndex].Value;
                _grid.Cursor = (e.ColumnIndex >= 6 && v != null && Convert.ToString(v) != "") || e.ColumnIndex > 0 ? Cursors.Hand : Cursors.Default;
            };
            host.Controls.Add(_grid); _grid.Dock = DockStyle.Fill;

            _toast.Controls.Add(_toastMsg); _toast.Controls.Add(_undo);
            _undo.Click += (s, e) => { var u = _undoAction; _toast.Visible = false; if (u != null) u(); };
            _toastTimer.Tick += (s, e) => { _toastTimer.Stop(); _toast.Visible = false; };
            host.Controls.Add(_toast);
            _gridHost = host;
        }
        Panel _gridHost;

        void BuildDetail()
        {
            var head = new Panel { Dock = DockStyle.Top, Height = 54, BackColor = Color.White };
            head.Controls.Add(_dType); head.Controls.Add(_dDoc); head.Controls.Add(_dStatus);
            _dStatus.Left = _right.Width - 90; head.Resize += (s, e) => { _dStatus.Left = head.Width - _dStatus.Width - 12; };

            _foot.Controls.Add(_wait);
            var buttons = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1 };
            buttons.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50)); buttons.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
            _bApprove.Dock = DockStyle.Fill; _bReject.Dock = DockStyle.Fill; _bApprove.Margin = new Padding(0, 4, 4, 0); _bReject.Margin = new Padding(4, 4, 0, 0);
            _bApprove.FlatAppearance.BorderSize = 0; _bReject.FlatAppearance.BorderColor = Theme.Hex("#fca5a5");
            buttons.Controls.Add(_bApprove, 0, 0); buttons.Controls.Add(_bReject, 1, 0);
            _actions = buttons;
            _foot.Controls.Add(buttons); _foot.Controls.Add(_err); _foot.Controls.Add(_remark);

            _right.Controls.Add(_info); _right.Controls.Add(_foot); _right.Controls.Add(_stepper); _right.Controls.Add(head);
            _info.BringToFront();

            _bApprove.Click += (s, e) => { var r = ById(_open); if (r == null || !CanAct(r)) return; var u = Decide(r, "Approved", _remark.Text.Trim()); ShowToast(r.Doc + " approved", u); RefreshAll(); };
            _bReject.Click += (s, e) =>
            {
                var r = ById(_open); if (r == null || !CanAct(r)) return;
                if (_remark.Text.Trim() == "") { _err.Visible = true; _remark.Focus(); return; }
                var u = Decide(r, "Rejected", _remark.Text.Trim()); ShowToast(r.Doc + " rejected", u); RefreshAll();
            };
            _remark.TextChanged += (s, e) => { if (_remark.Text.Trim() != "") _err.Visible = false; };

            var wrap = new Panel { Dock = DockStyle.Right, Width = 450, Padding = new Padding(10, 0, 0, 0), BackColor = Theme.Bg };
            _right.Dock = DockStyle.Fill; wrap.Controls.Add(_right);
            _wrapRight = wrap;

            Controls.Add(_gridHost); Controls.Add(wrap);
            foreach (var b in _bars.Reverse()) Controls.Add(b);
            _gridHost.BringToFront();
            Padding = new Padding(0);
        }
        Panel _wrapRight; TableLayoutPanel _actions;

        /* ---------- refresh ---------- */
        void RefreshAll()
        {
            _loading = true;
            try
            {
                var inMod = _data.Where(r => r.Module == _mod).ToList();
                foreach (var b in _modBtns)
                {
                    var m = ApprovalData.Modules.First(x => x[0] == (string)b.Tag);
                    int n = _data.Count(r => r.Module == m[0] && CanAct(r));
                    b.Text = m[1] + (n > 0 ? "  (" + n + ")" : ""); b.Width = TextRenderer.MeasureText(b.Text, Theme.Base).Width + 32; b.On = (string)b.Tag == _mod;
                }
                int left = 0; foreach (var b in _modBtns) { b.Left = left; left += b.Width + 4; }
                var counts = new Dictionary<string, int> { { "pending", inMod.Count(r => r.Status == "Wait") }, { "approved", inMod.Count(r => r.Status == "Approved") }, { "rejected", inMod.Count(r => r.Status == "Rejected") }, { "all", inMod.Count } };
                int tx = 0;
                foreach (var b in _tabBtns)
                {
                    string k = (string)b.Tag; string name = k == "pending" ? "Pending" : k == "approved" ? "Approved" : k == "rejected" ? "Rejected" : "All";
                    b.Text = name + "  " + counts[k]; b.Width = TextRenderer.MeasureText(b.Text, Theme.Base).Width + 32; b.On = k == _tab; b.Left = tx; tx += b.Width + 4;
                }
                _stepBox.Left = tx + 16; _whoBox.Left = _stepBox.Right + 8; _lateBox.Left = _whoBox.Right + 10; _bulk.Left = _lateBox.Right + 16;
                var mod = ApprovalData.Modules.First(x => x[0] == _mod);
                _title.Text = mod[1] + " — Approval Requests   ";
                _grid.Columns[6].HeaderText = ""; _grid.Columns[7].HeaderText = "";

                var rows = Filtered().ToList();
                var keep = _sel.Where(id => rows.Any(r => r.Id == id && CanAct(r))).ToList(); _sel.Clear(); foreach (var k in keep) _sel.Add(k);
                _grid.Rows.Clear();
                foreach (var r in rows)
                {
                    bool act = CanAct(r);
                    string status = r.Status == "Wait" ? (act ? "Wait" : "Wait\nfor " + StepOf(r).Approver) : r.Status;
                    string req = Fmt(r.RequestedAt) + " · " + r.RequestedBy + "\n" + Ago(r.RequestedAt) + (IsLate(r) ? " · overdue" : r.Deadline.HasValue ? " · due " + r.Deadline.Value.ToString("MM-dd") : "");
                    string stepTxt = r.Step.ToString("00") + " " + StepOf(r).Name + "\n" + Cut(r.Remark != "" ? r.Remark : r.Shipper + " → " + r.Consignee, 34);
                    int i = _grid.Rows.Add(_sel.Contains(r.Id), r.Doc, status, req, stepTxt,
                                           r.Files.Count == 0 ? "no file" : r.Files.Count + (r.Files.Count > 1 ? " files" : " file"), act ? "APP." : "", act ? "REJ." : "");
                    _grid.Rows[i].Tag = r.Id;
                    if (!act) _grid.Rows[i].Cells[0].ReadOnly = true;
                    if (r.Id == _open) _grid.Rows[i].Selected = true;
                }
                if (!rows.Any(r => r.Id == _open)) _open = rows.Count > 0 ? rows[0].Id : 0;
                foreach (DataGridViewRow gr in _grid.Rows) gr.Selected = (int)gr.Tag == _open;
                if (rows.Count == 0) _grid.ClearSelection();
                UpdateBulk(); ShowDetail();
            }
            finally { _loading = false; }
        }

        void UpdateBulk()
        {
            _bulk.Visible = _sel.Count > 0; _bulk.Text = "✓ Approve selected (" + _sel.Count + ")";
        }

        /* ---------- detail ---------- */
        // The detail text is a stack of labels in a 2-column table (label | value), so it can be styled per line and scrolls with the panel.
        Label Lbl(string text, Font f, Color c, int maxW)
        {
            return new Label { Text = text, Font = f, ForeColor = c, AutoSize = true, MaximumSize = new Size(maxW, 0), Margin = new Padding(0, 2, 0, 2) };
        }
        void Sect(string t)
        {
            var l = Lbl(t.ToUpperInvariant(), Theme.Section, Theme.Muted, 400); l.Margin = new Padding(0, 14, 0, 4);
            _tbl.Controls.Add(l); _tbl.SetColumnSpan(l, 2);
        }
        void KV(string k, string v, Color? vc = null, Font vf = null)
        {
            _tbl.Controls.Add(Lbl(k, Theme.Base, Theme.Muted, 96)); _tbl.Controls.Add(Lbl(v, vf ?? Theme.Base, vc ?? Theme.Text, 290));
        }

        void ShowDetail()
        {
            var r = ById(_open);
            _right.Visible = r != null;
            if (r == null) return;
            var cur = StepOf(r); bool act = CanAct(r);
            _dType.Text = r.Type + " · " + ApprovalData.Modules.First(m => m[0] == r.Module)[1];
            _dDoc.Text = r.Doc;
            _dStatus.Text = r.Status; _dStatus.ForeColor = r.Status == "Approved" ? Theme.Hex("#047857") : r.Status == "Rejected" ? Theme.Hex("#b91c1c") : Theme.Hex("#b45309");
            _dStatus.BackColor = r.Status == "Approved" ? Theme.Hex("#d1fae5") : r.Status == "Rejected" ? Theme.Hex("#fee2e2") : Theme.Hex("#fef3c7");
            if (_dStatus.Parent != null) _dStatus.Left = _dStatus.Parent.Width - _dStatus.PreferredSize.Width - 14;
            _stepper.Req = r;

            _info.SuspendLayout();
            if (_tbl != null) { _info.Controls.Remove(_tbl); _tbl.Dispose(); }
            _tbl = new TableLayoutPanel { Dock = DockStyle.Top, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, ColumnCount = 2, BackColor = Color.White };
            _tbl.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 100)); _tbl.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            Sect("This request");
            KV("Requested by", r.RequestedBy + " · " + Fmt(r.RequestedAt));
            KV("Approver", cur.Approver);
            KV("Deadline", r.Deadline.HasValue ? r.Deadline.Value.ToString("yyyy-MM-dd") + (IsLate(r) ? "  (overdue)" : "") : "—", IsLate(r) ? Theme.Down : (Color?)null);
            KV("Remark", r.Remark != "" ? r.Remark : "—");
            Sect("Attachments");
            if (r.Files.Count == 0) KV("", "No attachments", Theme.Faint);
            foreach (var f in r.Files) KV(f.Kb + " KB", "📄 " + f.Name);
            Sect("Document");
            KV("Shipper", r.Shipper); KV("Consignee", r.Consignee); KV("Route", r.Pol + " → " + r.Pod); KV("Job type", r.JobType); KV("Sale", r.Sale);
            Sect("History");
            foreach (var h in Enumerable.Reverse(r.History))
            {
                var c = h.Action == "Approved" ? Theme.Hex("#047857") : h.Action == "Rejected" ? Theme.Hex("#b91c1c") : Theme.Hex("#b45309");
                _tbl.Controls.Add(Lbl("● " + h.Action, Theme.Bold, c, 96));
                _tbl.Controls.Add(Lbl(h.Step.ToString("00") + " " + ApprovalData.Steps[h.Step - 1].Name + "\n" + h.By + " · " + Fmt(h.At) + (h.Remark != "" ? "\n“" + h.Remark + "”" : ""), Theme.Base, Theme.Text, 290));
            }
            _info.Controls.Add(_tbl);
            _info.ResumeLayout(true); _info.AutoScrollPosition = new Point(0, 0);

            _remark.Visible = _actions.Visible = act; _err.Visible = false; _wait.Visible = !act;
            if (_shown != r.Id) { _remark.Clear(); _shown = r.Id; }
            if (!act) _wait.Text = r.Status == "Wait" ? "⏳ Waiting for " + cur.Approver + " to approve step " + cur.No + " — view only." : r.Status == "Approved" ? "✅ Approved" : "❌ Rejected";
        }
    }
}
