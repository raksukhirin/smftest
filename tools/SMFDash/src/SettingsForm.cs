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

        public SettingsForm(Ini ini)
        {
            _ini = ini;
            Text = "Database settings"; Font = Theme.Base; FormBorderStyle = FormBorderStyle.FixedDialog; StartPosition = FormStartPosition.CenterParent;
            MaximizeBox = false; MinimizeBox = false; ClientSize = new Size(420, 290);

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

            var test = new Button { Text = "Test", Width = 80, Height = 28, Left = 12, Top = 200 };
            var save = new Button { Text = "Save", Width = 80, Height = 28, Left = 98, Top = 200 };
            var cancel = new Button { Text = "Cancel", Width = 80, Height = 28, Left = 328, Top = 200, DialogResult = DialogResult.Cancel };
            _msg.SetBounds(12, 238, 396, 44);
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
                    DialogResult = DialogResult.OK;
                }
                catch (Exception ex) { _msg.ForeColor = Theme.Down; _msg.Text = "Save failed: " + ex.Message; }
            };
        }

        void ApplyWin() { _user.Enabled = _pass.Enabled = !_win.Checked; }
        string CS() { return Db.Build(_server.Text.Trim(), _db.Text.Trim(), _win.Checked ? "" : _user.Text.Trim(), _pass.Text, 15); }
    }
}
