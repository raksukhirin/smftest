using System;
using System.Drawing;
using System.Windows.Forms;

namespace SMFDash
{
    public class SettingsForm : Form
    {
        readonly Ini _ini;
        readonly TextBox _server = new TextBox(), _db = new TextBox(), _user = new TextBox(), _pass = new TextBox { UseSystemPasswordChar = true };
        readonly CheckBox _win = new CheckBox { Text = "Windows Authentication", AutoSize = true };
        readonly Label _msg = new Label { AutoSize = false, Height = 40, ForeColor = Theme.Muted };
        NumericUpDown _warn, _bad, _max, _refresh;
        readonly CheckBox _hide = new CheckBox { Text = "Hide alerts with no items", AutoSize = true };

        public SettingsForm(Ini ini)
        {
            _ini = ini;
            Text = "Settings"; Font = Theme.Base; FormBorderStyle = FormBorderStyle.FixedDialog; StartPosition = FormStartPosition.CenterParent;
            MaximizeBox = false; MinimizeBox = false; ClientSize = new Size(420, 438);

            var t = new TableLayoutPanel { Dock = DockStyle.Top, Height = 190, ColumnCount = 2, Padding = new Padding(12), RowCount = 5 };
            t.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 90)); t.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            Action<string, Control> add = (l, c) =>
            {
                t.Controls.Add(new Label { Text = l, AutoSize = true, Anchor = AnchorStyles.Left, Margin = new Padding(0, 6, 0, 0) });
                c.Dock = DockStyle.Fill; t.Controls.Add(c);
            };
            add("Server", _server); add("Database", _db);
            t.Controls.Add(new Label()); t.Controls.Add(_win);
            add("User", _user); add("Password", _pass);
            Controls.Add(t);

            // Alerts tab - display only (what an alert lists is decided by its view)
            var box = new GroupBox { Text = "Alerts (display)", Left = 12, Top = 196, Width = 396, Height = 142 };
            Func<int, int, int, NumericUpDown> num = (v, min, max) => new NumericUpDown { Minimum = min, Maximum = max, Value = Math.Max(min, Math.Min(max, v)), Width = 80 };
            _warn = num(AlertSettings.WarnDays, 0, 36500); _bad = num(AlertSettings.BadDays, 0, 36500);
            _max = num(AlertSettings.MaxRows, 100, 100000); _refresh = num(AlertSettings.RefreshMin, 0, 1440);
            _hide.Checked = AlertSettings.HideEmpty;
            Action<string, Control, int, string> row = (l, c, y, hint) =>
            {
                box.Controls.Add(new Label { Text = l, AutoSize = true, Left = 12, Top = y + 3 });
                c.Left = 190; c.Top = y; box.Controls.Add(c);
                box.Controls.Add(new Label { Text = hint, AutoSize = true, Left = 280, Top = y + 3, ForeColor = Theme.Muted });
            };
            row("Amber from (days old)", _warn, 20, "days");
            row("Red from (days old)", _bad, 46, "days");
            row("Max rows per alert", _max, 72, "rows");
            row("Auto refresh (0 = off)", _refresh, 98, "minutes");
            _hide.Left = 12; _hide.Top = 120; box.Controls.Add(_hide);
            Controls.Add(box);

            var test = new Button { Text = "Test", Width = 80, Height = 28, Left = 12, Top = 348 };
            var save = new Button { Text = "Save", Width = 80, Height = 28, Left = 98, Top = 348 };
            var cancel = new Button { Text = "Cancel", Width = 80, Height = 28, Left = 328, Top = 348, DialogResult = DialogResult.Cancel };
            _msg.SetBounds(12, 386, 396, 44);
            Controls.AddRange(new Control[] { test, save, cancel, _msg });
            CancelButton = cancel;

            try { _server.Text = ini.GetSecret("Database", "Server"); _db.Text = ini.GetSecret("Database", "Database"); _user.Text = ini.GetSecret("Database", "User"); }
            catch (Exception ex) { _msg.Text = ex.Message; }
            _win.Checked = _user.Text == ""; ApplyWin(); _win.CheckedChanged += (s, e) => ApplyWin();
            try { if (_user.Text != "") _pass.Text = ini.GetSecret("Database", "Password"); } catch (Exception ex) { _msg.Text = ex.Message; }

            test.Click += (s, e) =>
            {
                try { _msg.ForeColor = Theme.Up; _msg.Text = Db.Test(CS()); }
                catch (Exception ex) { _msg.ForeColor = Theme.Down; _msg.Text = ex.Message; }
            };
            save.Click += (s, e) =>
            {
                try
                {
                    _ini.Set("Database", "Server", _server.Text.Trim(), true); _ini.Set("Database", "Database", _db.Text.Trim(), true);
                    _ini.Set("Database", "User", _win.Checked ? "" : _user.Text.Trim(), true);
                    _ini.Set("Database", "Password", _win.Checked ? "" : _pass.Text, true);
                    int warn = (int)_warn.Value, bad = Math.Max(warn, (int)_bad.Value);
                    AlertSettings.Save(_ini, warn, bad, (int)_max.Value, _hide.Checked, (int)_refresh.Value);
                    DialogResult = DialogResult.OK;
                }
                catch (Exception ex) { _msg.ForeColor = Theme.Down; _msg.Text = "Save failed: " + ex.Message; }
            };
        }

        void ApplyWin() { _user.Enabled = _pass.Enabled = !_win.Checked; }
        string CS() { return Db.Build(_server.Text.Trim(), _db.Text.Trim(), _win.Checked ? "" : _user.Text.Trim(), _pass.Text, 15); }
    }
}
