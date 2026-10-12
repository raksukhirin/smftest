// หน้าตั้งค่า — แท็บ "ฐานข้อมูล" (Server/Database/User/Password เข้ารหัสด้วย DPAPI) และแท็บ "Template / Admin"
// (โฟลเดอร์ Template ที่ชี้ไปโฟลเดอร์กลางได้, รายการ Template, สิทธิ์ admin สำหรับนำเข้า/ลบ/ตั้งรหัสผ่าน)
using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace BLScan
{
    /// <summary>กล่องใส่รหัสผ่าน admin (ผู้ใช้ตายตัว "admin") — confirm = ตั้งรหัสใหม่ ต้องใส่ซ้ำและยาวอย่างน้อย 8 ตัว</summary>
    public class PasswordDialog : Form
    {
        readonly TextBox txt1, txt2;
        readonly bool confirm;
        public string Password { get { return txt1.Text; } }

        public PasswordDialog(string title, string message, bool confirm)
        {
            this.confirm = confirm;
            Text = title; Font = new Font("Tahoma", 9f);
            FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = MinimizeBox = false; StartPosition = FormStartPosition.CenterParent;
            ClientSize = new Size(400, confirm ? 226 : 181);
            Controls.Add(new Label { Text = message, Left = 14, Top = 12, Width = 372, Height = 54 });
            Controls.Add(new Label { Text = "ผู้ใช้", Left = 14, Top = 75, Width = 90 });
            Controls.Add(new TextBox { Text = AdminAuth.User, Left = 110, Top = 72, Width = 270, ReadOnly = true, BackColor = SystemColors.Control });
            Controls.Add(new Label { Text = "รหัสผ่าน", Left = 14, Top = 107, Width = 90 });
            txt1 = new TextBox { Left = 110, Top = 104, Width = 270, UseSystemPasswordChar = true };
            Controls.Add(txt1);
            int y = 133;
            if (confirm)
            {
                Controls.Add(new Label { Text = "ยืนยันรหัสผ่าน", Left = 14, Top = 137, Width = 96 });
                txt2 = new TextBox { Left = 110, Top = 134, Width = 270, UseSystemPasswordChar = true };
                Controls.Add(txt2);
                y = 167;
            }
            var ok = new Button { Text = "ตกลง", Left = 214, Top = y + 12, Width = 80, Height = 28 };
            var cancel = new Button { Text = "ยกเลิก", Left = 300, Top = y + 12, Width = 80, Height = 28, DialogResult = DialogResult.Cancel };
            ok.Click += (s, e) =>
            {
                if (confirm)
                {
                    if (txt1.Text.Length < AdminAuth.MinLength) { MessageBox.Show(this, "รหัสผ่านต้องยาวอย่างน้อย " + AdminAuth.MinLength + " ตัวอักษร", Text, MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
                    if (txt1.Text != txt2.Text) { MessageBox.Show(this, "รหัสผ่านสองช่องไม่ตรงกัน", Text, MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
                }
                DialogResult = DialogResult.OK;
            };
            Controls.AddRange(new Control[] { ok, cancel });
            AcceptButton = ok; CancelButton = cancel;
        }
    }

    /// <summary>ขั้นตอนเข้าสู่ระบบ admin ที่ใช้ร่วมกัน (หน้าตั้งค่า และ Template Designer)</summary>
    public static class AdminUi
    {
        /// <summary>คืน true เมื่อเข้าสู่ระบบ admin แล้ว (ถ้ายังไม่มีรหัสผ่านในโฟลเดอร์ จะให้ตั้งครั้งแรกก่อน)</summary>
        public static bool EnsureLogin(IWin32Window owner, string folder)
        {
            if (AdminAuth.LoggedIn) return true;
            try
            {
                if (!AdminAuth.Exists(folder))
                {
                    using (var d = new PasswordDialog("ตั้งรหัสผ่าน admin", "ยังไม่มีรหัสผ่าน admin ในโฟลเดอร์นี้ — ตั้งรหัสผ่าน (อย่างน้อย " + AdminAuth.MinLength + " ตัวอักษร)\r\nรหัสนี้ใช้ร่วมกันทุกเครื่องที่ชี้โฟลเดอร์นี้", true))
                    {
                        if (d.ShowDialog(owner) != DialogResult.OK) return false;
                        AdminAuth.SetPassword(folder, d.Password);
                        int ls; AdminAuth.Verify(folder, d.Password, out ls);
                    }
                }
                else
                {
                    using (var d = new PasswordDialog("เข้าสู่ระบบ admin", "ใส่รหัสผ่าน admin ของโฟลเดอร์ Template", false))
                    {
                        if (d.ShowDialog(owner) != DialogResult.OK) return false;
                        int lockSecs;
                        var r = AdminAuth.Verify(folder, d.Password, out lockSecs);
                        if (r == AdminResult.WrongPassword) MessageBox.Show(owner, "รหัสผ่านไม่ถูกต้อง" + (lockSecs > 0 ? "\r\n(ใส่ผิดหลายครั้ง — รออีก " + lockSecs + " วินาที)" : ""), "admin", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        else if (r == AdminResult.Locked) MessageBox.Show(owner, "ใส่รหัสผิดหลายครั้ง — กรุณารออีก " + lockSecs + " วินาที", "admin", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        else if (r == AdminResult.Error) MessageBox.Show(owner, "อ่านไฟล์ " + AdminAuth.FileName + " ไม่ได้ (ไฟล์เสียหรือไม่มีสิทธิ์อ่าน)", "admin", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                }
            }
            catch (Exception ex) { MessageBox.Show(owner, "ทำรายการไม่ได้: " + ex.Message, "admin", MessageBoxButtons.OK, MessageBoxIcon.Error); }
            return AdminAuth.LoggedIn;
        }
    }

    public class SettingsForm : Form
    {
        readonly Ini _ini;

        // --- ฐานข้อมูล
        TextBox txtServer, txtDb, txtUser, txtPass, txtTimeout;
        CheckBox chkWin, chkShow;
        Label lblResult, lblPassHint;
        Button btnTest;
        string existingPass = "";

        // --- Template / Admin
        TextBox txtTplPath;
        Label lblTplResult, lblAdminState;
        ListView lvTpl;
        Button btnAdminLogin, btnAdminPwd, btnImport, btnTrash, btnLogout;
        bool folderWritable;

        TabControl tabs;
        public bool Saved { get; private set; }
        public bool TemplatesChanged { get; private set; }

        public SettingsForm(Ini ini)
        {
            _ini = ini;
            Text = "ตั้งค่า";
            Font = new Font("Tahoma", 9f);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = MinimizeBox = false;
            StartPosition = FormStartPosition.CenterParent;
            ClientSize = new Size(640, 560);

            tabs = new TabControl { Left = 8, Top = 8, Width = 624, Height = 500 };
            var tabDb = new TabPage("ฐานข้อมูล");
            var tabTpl = new TabPage("Template / Admin");
            tabs.TabPages.Add(tabDb); tabs.TabPages.Add(tabTpl);
            Controls.Add(tabs);
            BuildDbTab(tabDb);
            BuildTemplateTab(tabTpl);

            var btnSave = new Button { Text = "บันทึก", Left = 430, Top = 518, Width = 100, Height = 30 };
            btnSave.Click += (s, e) => Save();
            var btnCancel = new Button { Text = "ปิด", Left = 536, Top = 518, Width = 90, Height = 30, DialogResult = DialogResult.Cancel };
            Controls.AddRange(new Control[] { btnSave, btnCancel });
            CancelButton = btnCancel;

            AdminAuth.Logout();                          // สิทธิ์ admin มีเฉพาะระหว่างที่หน้านี้เปิดอยู่
            FormClosed += (s, e) => AdminAuth.Logout();
            LoadFromIni();
            RefreshTemplateTab();
        }

        // ================================================================ ฐานข้อมูล
        void BuildDbTab(TabPage tab)
        {
            int y = 16;
            Func<string, TextBox, int, TextBox> row = (cap, tb, h) =>
            {
                tab.Controls.Add(new Label { Text = cap, Left = 14, Top = y + 3, Width = 130 });
                tb.Left = 150; tb.Top = y; tb.Width = 350;
                tab.Controls.Add(tb);
                y += h;
                return tb;
            };
            txtServer = row("Server (host,port)", new TextBox(), 30);
            txtDb = row("Database", new TextBox(), 30);
            chkWin = new CheckBox { Text = "ใช้ Windows Authentication (ไม่ใช้ User/Password)", Left = 150, Top = y, Width = 400 };
            chkWin.CheckedChanged += (s, e) => ApplyWinAuth();
            tab.Controls.Add(chkWin); y += 28;
            txtUser = row("User", new TextBox(), 30);
            txtPass = row("Password", new TextBox { UseSystemPasswordChar = true }, 26);
            lblPassHint = new Label { Left = 150, Top = y, Width = 430, ForeColor = Color.DimGray };
            tab.Controls.Add(lblPassHint); y += 22;
            chkShow = new CheckBox { Text = "แสดงรหัสผ่าน", Left = 150, Top = y, Width = 200 };
            chkShow.CheckedChanged += (s, e) => txtPass.UseSystemPasswordChar = !chkShow.Checked;
            tab.Controls.Add(chkShow); y += 28;
            txtTimeout = row("Timeout (วินาที)", new TextBox(), 34);
            txtTimeout.Width = 60;

            btnTest = new Button { Text = "ทดสอบเชื่อมต่อ", Left = 150, Top = y, Width = 130, Height = 28 };
            btnTest.Click += (s, e) => TestDbAsync();
            tab.Controls.Add(btnTest);
            y += 40;
            lblResult = new Label { Left = 14, Top = y, Width = 580, Height = 80, ForeColor = Color.DimGray };
            tab.Controls.Add(lblResult);
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
            txtTplPath.Text = _ini.Get("Templates", "Path");
            ApplyWinAuth();
        }

        void ApplyWinAuth() { txtUser.Enabled = txtPass.Enabled = chkShow.Enabled = !chkWin.Checked; }

        int Timeout() { int t; return int.TryParse(txtTimeout.Text.Trim(), out t) && t > 0 ? t : 15; }

        string Pass() { return chkWin.Checked ? "" : txtPass.Text; }

        string ConnString() { return Db.Build(txtServer.Text.Trim(), txtDb.Text.Trim(), chkWin.Checked ? "" : txtUser.Text.Trim(), Pass(), Timeout()); }

        string CheckDb()
        {
            if (txtServer.Text.Trim() == "") return "ยังไม่ได้ใส่ Server";
            if (txtDb.Text.Trim() == "") return "ยังไม่ได้ใส่ Database";
            if (!chkWin.Checked && txtUser.Text.Trim() == "") return "ยังไม่ได้ใส่ User (หรือเลือก Windows Authentication)";
            return "";
        }

        async void TestDbAsync()
        {
            string err = CheckDb();
            if (err != "") { lblResult.Text = err; lblResult.ForeColor = Color.Firebrick; return; }
            btnTest.Enabled = false;
            lblResult.Text = "กำลังเชื่อมต่อ…"; lblResult.ForeColor = Color.DimGray;
            string cs = ConnString();
            try
            {
                string r = await Task.Run(() => Db.TestConnectionString(cs));
                lblResult.Text = "✓ " + r; lblResult.ForeColor = Color.DarkGreen;
            }
            catch (Exception ex) { lblResult.Text = "✗ เชื่อมต่อไม่ได้: " + ex.Message; lblResult.ForeColor = Color.Firebrick; }
            btnTest.Enabled = true;
        }

        // ================================================================ Template / Admin
        void BuildTemplateTab(TabPage tab)
        {
            tab.Controls.Add(new Label { Text = "โฟลเดอร์ Template", Left = 14, Top = 18, Width = 130, Font = new Font(Font, FontStyle.Bold) });
            txtTplPath = new TextBox { Left = 14, Top = 40, Width = 480 };
            var btnBrowse = new Button { Text = "เลือก…", Left = 500, Top = 38, Width = 94, Height = 26 };
            btnBrowse.Click += (s, e) =>
            {
                using (var d = new FolderBrowserDialog { Description = "เลือกโฟลเดอร์ Template (โฟลเดอร์กลางที่ใช้ร่วมกันได้)" })
                {
                    if (txtTplPath.Text.Trim() != "" && Directory.Exists(txtTplPath.Text.Trim())) d.SelectedPath = txtTplPath.Text.Trim();
                    if (d.ShowDialog(this) == DialogResult.OK) { txtTplPath.Text = d.SelectedPath; RefreshTemplateTab(); }
                }
            };
            var btnTplTest = new Button { Text = "ทดสอบโฟลเดอร์", Left = 14, Top = 70, Width = 120, Height = 26 };
            btnTplTest.Click += (s, e) => RefreshTemplateTab();
            var btnDefault = new Button { Text = "ใช้ค่าเริ่มต้น (ข้าง exe)", Left = 140, Top = 70, Width = 160, Height = 26 };
            btnDefault.Click += (s, e) => { txtTplPath.Text = ""; RefreshTemplateTab(); };
            lblTplResult = new Label { Left = 14, Top = 102, Width = 580, Height = 38, ForeColor = Color.DimGray };
            tab.Controls.AddRange(new Control[] { txtTplPath, btnBrowse, btnTplTest, btnDefault, lblTplResult });

            lvTpl = new ListView { Left = 14, Top = 144, Width = 580, Height = 150, View = View.Details, FullRowSelect = true, GridLines = true, MultiSelect = false };
            lvTpl.Columns.Add("id", 130); lvTpl.Columns.Add("ชื่อ", 250); lvTpl.Columns.Add("v", 40); lvTpl.Columns.Add("ไฟล์", 140);
            tab.Controls.Add(lvTpl);

            var grp = new GroupBox { Text = "Admin (ผู้ใช้ตายตัว: " + AdminAuth.User + ")", Left = 14, Top = 304, Width = 580, Height = 150 };
            lblAdminState = new Label { Left = 12, Top = 22, Width = 556, Height = 34, ForeColor = Color.DimGray };
            btnAdminLogin = new Button { Left = 12, Top = 60, Width = 200, Height = 28 };
            btnAdminLogin.Click += (s, e) => AdminLoginOrCreate();
            btnAdminPwd = new Button { Text = "เปลี่ยนรหัสผ่าน…", Left = 218, Top = 60, Width = 140, Height = 28 };
            btnAdminPwd.Click += (s, e) => AdminChangePassword();
            btnLogout = new Button { Text = "ออกจากระบบ admin", Left = 364, Top = 60, Width = 150, Height = 28 };
            btnLogout.Click += (s, e) => { AdminAuth.Logout(); RefreshTemplateTab(); };
            btnImport = new Button { Text = "นำเข้า Template…", Left = 12, Top = 100, Width = 160, Height = 28 };
            btnImport.Click += (s, e) => AdminImport();
            btnTrash = new Button { Text = "ลบ Template ที่เลือก", Left = 178, Top = 100, Width = 170, Height = 28 };
            btnTrash.Click += (s, e) => AdminTrash();
            grp.Controls.AddRange(new Control[] { lblAdminState, btnAdminLogin, btnAdminPwd, btnLogout, btnImport, btnTrash });
            tab.Controls.Add(grp);
        }

        string TplFolder()
        {
            string p = txtTplPath.Text.Trim();
            return p == "" ? Program.DefaultTemplateDir() : p;
        }

        public static bool CanWrite(string folder)
        {
            try
            {
                if (!Directory.Exists(folder)) return false;
                string t = Path.Combine(folder, ".w" + Guid.NewGuid().ToString("N").Substring(0, 6) + ".tmp");
                File.WriteAllText(t, "x"); File.Delete(t);
                return true;
            }
            catch { return false; }
        }

        void RefreshTemplateTab()
        {
            string folder = TplFolder();
            bool exists = Directory.Exists(folder);
            folderWritable = exists && CanWrite(folder);
            lvTpl.Items.Clear();
            int n = 0;
            if (exists)
            {
                try
                {
                    foreach (var t in TemplateStore.LoadAll(folder, new List<string>()).Where(x => !x.IsGeneric))
                    {
                        lvTpl.Items.Add(new ListViewItem(new[] { t.Id, t.Name, t.Version.ToString(), Path.GetFileName(t.SourceFile) }) { Tag = t.Id });
                        n++;
                    }
                }
                catch { }
            }
            bool hasAdmin = AdminAuth.Exists(folder);
            if (!exists) { lblTplResult.Text = "✗ ไม่พบโฟลเดอร์นี้ — โปรแกรมจะใช้สำเนาสำรองในเครื่อง (ถ้ามี)"; lblTplResult.ForeColor = Color.Firebrick; }
            else
            {
                lblTplResult.Text = "✓ อ่านได้ · พบ Template " + n + " ฉบับ · " + (folderWritable ? "เขียนได้ (admin จัดการได้)" : "อ่านอย่างเดียว (ผู้ใช้ทั่วไปแก้ไม่ได้)") +
                                    " · " + (hasAdmin ? "มีรหัสผ่าน admin" : "ยังไม่มีรหัสผ่าน admin");
                lblTplResult.ForeColor = Color.DarkGreen;
            }

            bool logged = AdminAuth.LoggedIn;
            if (!folderWritable)
            {
                lblAdminState.Text = exists ? "โฟลเดอร์นี้เป็นอ่านอย่างเดียวสำหรับคุณ — จัดการ Template ได้เฉพาะ admin ที่มีสิทธิ์เขียนโฟลเดอร์"
                                            : "ยังไม่มีโฟลเดอร์นี้ — ไม่สามารถจัดการ Template ได้";
                lblAdminState.ForeColor = Color.DarkOrange;
            }
            else if (!hasAdmin) { lblAdminState.Text = "ยังไม่ได้ตั้งรหัสผ่าน admin ของโฟลเดอร์นี้ — ตั้งครั้งแรกได้ทันที (รหัสเก็บเป็น hash ใน " + AdminAuth.FileName + " ในโฟลเดอร์เดียวกัน)"; lblAdminState.ForeColor = Color.DimGray; }
            else if (!logged) { lblAdminState.Text = "🔒 ล็อกอยู่ — เข้าสู่ระบบ admin เพื่อนำเข้า/ลบ Template และเปลี่ยนรหัสผ่าน"; lblAdminState.ForeColor = Color.DimGray; }
            else { lblAdminState.Text = "🔓 เข้าสู่ระบบ admin แล้ว (สิทธิ์หมดเมื่อปิดหน้านี้)"; lblAdminState.ForeColor = Color.DarkGreen; }

            btnAdminLogin.Visible = folderWritable && !logged;
            btnAdminLogin.Text = hasAdmin ? "เข้าสู่ระบบ admin…" : "ตั้งรหัสผ่าน admin ครั้งแรก…";
            btnAdminPwd.Visible = btnLogout.Visible = btnImport.Visible = btnTrash.Visible = folderWritable && logged;
        }

        void AdminLoginOrCreate()
        {
            AdminUi.EnsureLogin(this, TplFolder());
            RefreshTemplateTab();
        }

        void AdminChangePassword()
        {
            if (!AdminAuth.LoggedIn) return;
            try
            {
                using (var d = new PasswordDialog("เปลี่ยนรหัสผ่าน admin", "ตั้งรหัสผ่านใหม่ (อย่างน้อย " + AdminAuth.MinLength + " ตัวอักษร)\r\nมีผลกับทุกเครื่องที่ชี้โฟลเดอร์นี้", true))
                {
                    if (d.ShowDialog(this) != DialogResult.OK) return;
                    AdminAuth.SetPassword(TplFolder(), d.Password);
                    MessageBox.Show(this, "เปลี่ยนรหัสผ่านแล้ว", "admin", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
            }
            catch (Exception ex) { MessageBox.Show(this, "เปลี่ยนรหัสผ่านไม่ได้: " + ex.Message, "admin", MessageBoxButtons.OK, MessageBoxIcon.Error); }
        }

        void AdminImport()
        {
            if (!AdminAuth.LoggedIn) return;
            using (var dlg = new OpenFileDialog { Filter = "Template (*.json)|*.json", Title = "เลือกไฟล์ Template ที่จะนำเข้า" })
            {
                if (dlg.ShowDialog(this) != DialogResult.OK) return;
                try
                {
                    Template t; bool need;
                    string msg = TemplateStore.Import(TplFolder(), dlg.FileName, false, out t, out need);
                    if (need)
                    {
                        if (MessageBox.Show(this, msg + "\r\n\r\nทับไฟล์เดิมหรือไม่? (ไฟล์เดิมจะสำรองไว้ในโฟลเดอร์ _trash)", "นำเข้า Template", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2) != DialogResult.Yes) return;
                        msg = TemplateStore.Import(TplFolder(), dlg.FileName, true, out t, out need);
                    }
                    TemplatesChanged = true;
                    MessageBox.Show(this, msg, "นำเข้า Template", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                catch (Exception ex) { MessageBox.Show(this, "นำเข้าไม่ได้: " + ex.Message, "นำเข้า Template", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
            }
            RefreshTemplateTab();
        }

        void AdminTrash()
        {
            if (!AdminAuth.LoggedIn) return;
            if (lvTpl.SelectedItems.Count == 0) { MessageBox.Show(this, "เลือก Template ในรายการก่อน", "ลบ Template", MessageBoxButtons.OK, MessageBoxIcon.Information); return; }
            string id = (string)lvTpl.SelectedItems[0].Tag;
            if (MessageBox.Show(this, "ลบ Template \"" + id + "\" ?\r\n\r\nไฟล์จะถูกย้ายไปโฟลเดอร์ _trash (กู้คืนได้) ทุกเครื่องที่ใช้โฟลเดอร์นี้จะไม่เห็น Template นี้อีก", "ลบ Template",
                                MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2) != DialogResult.Yes) return;
            try { TemplateStore.Trash(TplFolder(), id); TemplatesChanged = true; }
            catch (Exception ex) { MessageBox.Show(this, "ลบไม่ได้: " + ex.Message, "ลบ Template", MessageBoxButtons.OK, MessageBoxIcon.Error); }
            RefreshTemplateTab();
        }

        // ================================================================ บันทึก
        void Save()
        {
            string err = CheckDb();
            if (err != "") { tabs.SelectedIndex = 0; lblResult.Text = err; lblResult.ForeColor = Color.Firebrick; return; }
            string tplPath = txtTplPath.Text.Trim();
            if (tplPath != "" && !Directory.Exists(tplPath) &&
                MessageBox.Show(this, "โฟลเดอร์ Template \"" + tplPath + "\" ยังเปิดไม่ได้ตอนนี้\r\nบันทึกไว้ก่อนหรือไม่? (โปรแกรมจะใช้สำเนาสำรองในเครื่องจนกว่าจะเปิดโฟลเดอร์ได้)",
                                "โฟลเดอร์ Template", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) { tabs.SelectedIndex = 1; return; }
            try
            {
                _ini.Set("Database", "ConnectionString", "");
                _ini.Set("Database", "Server", txtServer.Text.Trim());
                _ini.Set("Database", "Database", txtDb.Text.Trim());
                _ini.Set("Database", "User", chkWin.Checked ? "" : txtUser.Text.Trim());
                _ini.Set("Database", "Password", chkWin.Checked ? "" : Pass(), true);       // เข้ารหัสก่อนเขียนเสมอ
                _ini.Set("Database", "Timeout", Timeout().ToString());
                // ค่าเริ่มต้น (ข้าง exe) ไม่ต้องเก็บใน ini
                bool isDefault = tplPath == "" || TemplateStore.SamePath(tplPath) == TemplateStore.SamePath(Program.DefaultTemplateDir());
                string newPath = isDefault ? "" : tplPath;
                if (newPath != _ini.Get("Templates", "Path")) TemplatesChanged = true;
                _ini.Set("Templates", "Path", newPath);
                Saved = true;
                DialogResult = DialogResult.OK;
                Close();
            }
            catch (Exception ex)
            {
                tabs.SelectedIndex = 0;
                lblResult.Text = "บันทึกลง ini ไม่ได้: " + ex.Message + "\r\n(" + _ini.Path + ")";
                lblResult.ForeColor = Color.Firebrick;
            }
        }
    }
}
