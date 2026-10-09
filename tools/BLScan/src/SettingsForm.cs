// หน้าตั้งค่า DB — กรอก Server/Database/User/Password, ทดสอบเชื่อมต่อ, บันทึกลง ini (รหัสผ่านเข้ารหัสด้วย DPAPI)
using System;
using System.Drawing;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace BLScan
{
    public class SettingsForm : Form
    {
        readonly Ini _ini;
        TextBox txtServer, txtDb, txtUser, txtPass, txtTimeout;
        CheckBox chkWin, chkShow;
        Label lblResult, lblPassHint;
        Button btnTest, btnSave;
        string existingPass = "";

        public bool Saved { get; private set; }

        public SettingsForm(Ini ini)
        {
            _ini = ini;
            Text = "ตั้งค่า DB";
            Font = new Font("Tahoma", 9f);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = MinimizeBox = false;
            StartPosition = FormStartPosition.CenterParent;
            ClientSize = new Size(520, 330);

            int y = 14;
            Func<string, TextBox, int, TextBox> row = (cap, tb, h) =>
            {
                Controls.Add(new Label { Text = cap, Left = 14, Top = y + 3, Width = 130 });
                tb.Left = 150; tb.Top = y; tb.Width = 350;
                Controls.Add(tb);
                y += h;
                return tb;
            };
            txtServer = row("Server (host,port)", new TextBox(), 30);
            txtDb = row("Database", new TextBox(), 30);
            chkWin = new CheckBox { Text = "ใช้ Windows Authentication (ไม่ใช้ User/Password)", Left = 150, Top = y, Width = 350 };
            chkWin.CheckedChanged += (s, e) => ApplyWinAuth();
            Controls.Add(chkWin); y += 28;
            txtUser = row("User", new TextBox(), 30);
            txtPass = row("Password", new TextBox { UseSystemPasswordChar = true }, 26);
            lblPassHint = new Label { Left = 150, Top = y, Width = 350, ForeColor = Color.DimGray };
            Controls.Add(lblPassHint); y += 22;
            chkShow = new CheckBox { Text = "แสดงรหัสผ่าน", Left = 150, Top = y, Width = 200 };
            chkShow.CheckedChanged += (s, e) => txtPass.UseSystemPasswordChar = !chkShow.Checked;
            Controls.Add(chkShow); y += 28;
            txtTimeout = row("Timeout (วินาที)", new TextBox { Width = 60 }, 34);
            txtTimeout.Width = 60;

            btnTest = new Button { Text = "ทดสอบเชื่อมต่อ", Left = 150, Top = y, Width = 130, Height = 28 };
            btnTest.Click += (s, e) => TestAsync();
            btnSave = new Button { Text = "บันทึก", Left = 290, Top = y, Width = 100, Height = 28 };
            btnSave.Click += (s, e) => Save();
            var btnCancel = new Button { Text = "ยกเลิก", Left = 400, Top = y, Width = 100, Height = 28, DialogResult = DialogResult.Cancel };
            Controls.AddRange(new Control[] { btnTest, btnSave, btnCancel });
            CancelButton = btnCancel;
            y += 40;
            lblResult = new Label { Left = 14, Top = y, Width = 490, Height = 60, ForeColor = Color.DimGray };
            Controls.Add(lblResult);

            LoadFromIni();
        }

        void LoadFromIni()
        {
            txtServer.Text = _ini.Get("Database", "Server");
            txtDb.Text = _ini.Get("Database", "Database");
            txtUser.Text = _ini.Get("Database", "User");
            txtTimeout.Text = _ini.GetInt("Database", "Timeout", 15).ToString();
            chkWin.Checked = txtUser.Text == "";
            try { existingPass = _ini.GetSecret("Database", "Password"); }
            catch (Exception ex) { existingPass = ""; lblResult.Text = ex.Message; lblResult.ForeColor = Color.Firebrick; }
            txtPass.Text = existingPass;
            string raw = _ini.Get("Database", "Password");
            lblPassHint.Text = raw == "" ? "(ยังไม่มีรหัสผ่านใน ini)"
                : Secret.IsLegacy(raw) ? "⚠ เข้ารหัสแบบเดิม (ผูกผู้ใช้ Windows) — กดบันทึกเพื่อแปลงเป็นแบบผูกเครื่อง"
                : Secret.IsProtected(raw) ? "รหัสผ่านใน ini ถูกเข้ารหัสไว้แล้ว (ผูกกับเครื่องนี้)" : "⚠ รหัสผ่านใน ini ยังเป็นข้อความธรรมดา — กดบันทึกเพื่อเข้ารหัส";
            if (_ini.Get("Database", "ConnectionString") != "")
                lblResult.Text = "หมายเหตุ: ini มี ConnectionString เต็มอยู่ — เมื่อกดบันทึก ค่านี้จะถูกล้าง แล้วใช้ช่องด้านบนแทน";
            ApplyWinAuth();
        }

        void ApplyWinAuth()
        {
            txtUser.Enabled = txtPass.Enabled = chkShow.Enabled = !chkWin.Checked;
        }

        int Timeout() { int t; return int.TryParse(txtTimeout.Text.Trim(), out t) && t > 0 ? t : 15; }

        string Pass() { return chkWin.Checked ? "" : txtPass.Text; }

        string ConnString()
        {
            return Db.Build(txtServer.Text.Trim(), txtDb.Text.Trim(), chkWin.Checked ? "" : txtUser.Text.Trim(), Pass(), Timeout());
        }

        string Check()
        {
            if (txtServer.Text.Trim() == "") return "ยังไม่ได้ใส่ Server";
            if (txtDb.Text.Trim() == "") return "ยังไม่ได้ใส่ Database";
            if (!chkWin.Checked && txtUser.Text.Trim() == "") return "ยังไม่ได้ใส่ User (หรือเลือก Windows Authentication)";
            return "";
        }

        async void TestAsync()
        {
            string err = Check();
            if (err != "") { lblResult.Text = err; lblResult.ForeColor = Color.Firebrick; return; }
            btnTest.Enabled = btnSave.Enabled = false;
            lblResult.Text = "กำลังเชื่อมต่อ…"; lblResult.ForeColor = Color.DimGray;
            string cs = ConnString();
            try
            {
                string r = await Task.Run(() => Db.TestConnectionString(cs));
                lblResult.Text = "✓ " + r; lblResult.ForeColor = Color.DarkGreen;
            }
            catch (Exception ex)
            {
                lblResult.Text = "✗ เชื่อมต่อไม่ได้: " + ex.Message; lblResult.ForeColor = Color.Firebrick;
            }
            btnTest.Enabled = btnSave.Enabled = true;
        }

        void Save()
        {
            string err = Check();
            if (err != "") { lblResult.Text = err; lblResult.ForeColor = Color.Firebrick; return; }
            try
            {
                _ini.Set("Database", "ConnectionString", "");
                _ini.Set("Database", "Server", txtServer.Text.Trim());
                _ini.Set("Database", "Database", txtDb.Text.Trim());
                _ini.Set("Database", "User", chkWin.Checked ? "" : txtUser.Text.Trim());
                _ini.Set("Database", "Password", chkWin.Checked ? "" : Pass(), true);       // เข้ารหัสก่อนเขียนเสมอ
                _ini.Set("Database", "Timeout", Timeout().ToString());
                Saved = true;
                DialogResult = DialogResult.OK;
                Close();
            }
            catch (Exception ex)
            {
                lblResult.Text = "บันทึกลง ini ไม่ได้: " + ex.Message + "\r\n(" + _ini.Path + ")";
                lblResult.ForeColor = Color.Firebrick;
            }
        }
    }
}
