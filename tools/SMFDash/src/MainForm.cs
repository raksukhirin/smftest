using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace SMFDash
{
    public class MainForm : Form
    {
        readonly Db _db;
        readonly Panel _top = new Panel { Dock = DockStyle.Top, Height = 54, BackColor = Color.White };
        readonly Panel _sub = new Panel { Dock = DockStyle.Top, Height = 38, BackColor = Color.White, Visible = false };
        readonly Panel _body = new Panel { Dock = DockStyle.Fill, AutoScroll = true, BackColor = Theme.Bg, Padding = new Padding(16, 12, 16, 8) };
        readonly Label _status = new Label { Dock = DockStyle.Bottom, Height = 24, ForeColor = Theme.Muted, Font = Theme.Small, Padding = new Padding(12, 5, 0, 0), BackColor = Color.White };
        readonly List<PillButton> _mods = new List<PillButton>();
        readonly List<PillButton> _modes = new List<PillButton>();

        string _mod = "ops", _mode = "All";
        readonly Dictionary<string, OpsMode> _ops = Sample.Ops();
        AccData _acc = Sample.Acc();
        readonly MktData _mkt = Sample.Mkt();
        string _liveNote = "";
        public bool NoLoad;

        public MainForm(Db db)
        {
            _db = db;
            Text = "SMF Dashboard"; Font = Theme.Base; ClientSize = new Size(1280, 820); MinimumSize = new Size(1000, 640); StartPosition = FormStartPosition.CenterScreen;
            BackColor = Theme.Bg;

            var logo = new Label { Text = "S", Width = 32, Height = 32, Left = 16, Top = 11, BackColor = Theme.Ops, ForeColor = Color.White, Font = new Font("Segoe UI", 12f, FontStyle.Bold), TextAlign = ContentAlignment.MiddleCenter };
            var name = new Label { Text = "SMF Freight\r\nDashboard", Left = 54, Top = 8, Width = 110, Height = 40, Font = Theme.Bold };
            _top.Controls.Add(logo); _top.Controls.Add(name);

            int x = 180;
            foreach (var m in new[] { new[] { "ops", "Operations" }, new[] { "acc", "Accounting" }, new[] { "mkt", "Marketing" } })
            {
                var b = new PillButton(m[1]) { Left = x, Top = 12, Tag = m[0], Accent = m[0] == "ops" ? Theme.Ops : m[0] == "acc" ? Theme.Acc : Theme.Mkt };
                b.Click += (s, e) => { _mod = (string)((Control)s).Tag; Render(); };
                _top.Controls.Add(b); _mods.Add(b); x += b.Width + 6;
            }

            var settings = new Button { Text = "Settings", Width = 80, Height = 28, Top = 13, Anchor = AnchorStyles.Top | AnchorStyles.Right, FlatStyle = FlatStyle.System };
            var refresh = new Button { Text = "↻ Refresh", Width = 84, Height = 28, Top = 13, Anchor = AnchorStyles.Top | AnchorStyles.Right, FlatStyle = FlatStyle.System };
            settings.Left = _top.Width - 96; refresh.Left = settings.Left - 92;
            _top.Controls.Add(settings); _top.Controls.Add(refresh);
            refresh.Click += (s, e) => Reload();
            settings.Click += (s, e) => { using (var f = new SettingsForm(_db.Ini)) if (f.ShowDialog(this) == DialogResult.OK) Reload(); };

            int sx = 180;
            foreach (var m in Sample.OpsModes)
            {
                var b = new PillButton(m == "All" ? "Overview" : m) { Left = sx, Top = 4, Height = 26, Tag = m, Rounded = true };
                b.Click += (s, e) => { _mode = (string)((Control)s).Tag; Render(); };
                _sub.Controls.Add(b); _modes.Add(b); sx += b.Width + 4;
            }

            Controls.Add(_body); Controls.Add(_sub); Controls.Add(_top); Controls.Add(_status);
            _body.BringToFront();   // Fill must dock last (frontmost)
            Shown += (s, e) => { if (!NoLoad) Reload(); };
            Render();
        }

        /// <summary>Headless: render one page to a PNG (used for checking the layout; /shot on the command line).</summary>
        public void Snapshot(string mod, string mode, string path)
        {
            _mod = mod; _mode = mode; Render(); Application.DoEvents();
            using (var bmp = new Bitmap(ClientSize.Width, ClientSize.Height)) { DrawToBitmap(bmp, new Rectangle(0, 0, bmp.Width, bmp.Height)); bmp.Save(path, System.Drawing.Imaging.ImageFormat.Png); }
        }

        void Reload()
        {
            if (!_db.Configured)
            {
                _liveNote = "No database configured - showing sample data only (Settings to connect)";
                _acc = Sample.Acc(); Render(); return;
            }
            _liveNote = "Loading from " + _db.Target + " ...";
            Render();
            var db = _db;
            Task.Factory.StartNew(() => LiveData.LoadAcc(db)).ContinueWith(t =>
            {
                if (t.IsFaulted) { _acc = Sample.Acc(); _liveNote = "Database error: " + t.Exception.GetBaseException().Message; }
                else
                {
                    _acc = t.Result;
                    _liveNote = _acc.Error == "" ? "Connected: " + _db.Target + " - Accounting widgets tagged LIVE come from the DB, the rest are SAMPLE"
                                                 : "Partly loaded (" + _db.Target + "): " + _acc.Error;
                }
                Render();
            }, TaskScheduler.FromCurrentSynchronizationContext());
        }

        void Render()
        {
            foreach (var b in _mods) b.On = (string)b.Tag == _mod;
            foreach (var b in _modes) b.On = (string)b.Tag == _mode;
            _sub.Visible = _mod == "ops";
            _status.Text = _liveNote;

            Control page = _mod == "ops" ? Pages.Ops(_ops[_mode]) : _mod == "acc" ? Pages.Acc(_acc) : Pages.Mkt(_mkt);
            _body.SuspendLayout();
            var old = _body.Controls.Cast<Control>().ToList();
            _body.Controls.Clear(); foreach (var c in old) c.Dispose();
            _body.Controls.Add(page);
            _body.ResumeLayout(true);
            _body.AutoScrollPosition = new Point(0, 0);
        }
    }
}
