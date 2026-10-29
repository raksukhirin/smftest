// ธีมสีเขียวของโปรแกรม: ปุ่มแบบ flat (ปุ่มหลักเขียวทึบ ปุ่มรอง ขอบเขียว) ตารางหัวเขียวอ่อน
using System;
using System.Drawing;
using System.Windows.Forms;

namespace BLScan
{
    public static class Theme
    {
        public static readonly Color Dark = Color.FromArgb(27, 94, 63);
        public static readonly Color Primary = Color.FromArgb(46, 125, 82);
        public static readonly Color Soft = Color.FromArgb(232, 245, 237);
        public static readonly Color Bg = Color.FromArgb(243, 248, 245);
        public static readonly Color Line = Color.FromArgb(207, 227, 214);
        public static readonly Color Text = Color.FromArgb(40, 60, 50);
        public static readonly Color OffBack = Color.FromArgb(224, 230, 226);
        public static readonly Color OffFore = Color.FromArgb(140, 150, 144);
        public const string PrimaryTag = "primary";

        /// <summary>ปุ่ม: primary = เขียวทึบ, ไม่ใช่ = พื้นขาวขอบเขียว; สีเปลี่ยนเองเมื่อ Enabled เปลี่ยน</summary>
        public static void Style(Button b, bool primary)
        {
            b.FlatStyle = FlatStyle.Flat;
            b.UseVisualStyleBackColor = false;
            b.Tag = primary ? PrimaryTag : "secondary";
            Action paint = () =>
            {
                bool on = b.Enabled, pri = (b.Tag as string) == PrimaryTag;
                b.BackColor = !on ? OffBack : pri ? Primary : Color.White;
                b.ForeColor = !on ? OffFore : pri ? Color.White : Primary;
                b.FlatAppearance.BorderColor = !on ? OffBack : Primary;
                b.FlatAppearance.MouseOverBackColor = pri ? Dark : Soft;
                b.Cursor = on ? Cursors.Hand : Cursors.Default;
            };
            paint();
            b.EnabledChanged += (s, e) => paint();
        }

        public static void StyleGrid(DataGridView g)
        {
            g.EnableHeadersVisualStyles = false;
            g.BackgroundColor = Color.White; g.BorderStyle = BorderStyle.None; g.GridColor = Line;
            g.CellBorderStyle = DataGridViewCellBorderStyle.SingleHorizontal;
            g.ColumnHeadersBorderStyle = DataGridViewHeaderBorderStyle.None;
            g.ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.DisableResizing;
            g.ColumnHeadersHeight = 36;
            var h = g.ColumnHeadersDefaultCellStyle;
            h.BackColor = Soft; h.ForeColor = Dark; h.SelectionBackColor = Soft; h.SelectionForeColor = Dark;
            h.Font = new Font(g.Font, FontStyle.Bold); h.WrapMode = DataGridViewTriState.False; h.Padding = new Padding(4, 0, 0, 0);
            g.DefaultCellStyle.SelectionBackColor = Primary; g.DefaultCellStyle.SelectionForeColor = Color.White;
            g.DefaultCellStyle.Padding = new Padding(4, 0, 0, 0);
        }

        /// <summary>ใช้กับทั้งหน้าต่าง: ปุ่มที่ยังไม่ได้จัดสไตล์ → ปุ่มรอง (Tag = "primary" → ปุ่มหลัก), ตาราง → สีเขียว</summary>
        public static void Apply(Control root)
        {
            foreach (Control c in root.Controls)
            {
                var b = c as Button;
                if (b != null)
                {
                    string tag = b.Tag as string;
                    if (tag == null || tag == PrimaryTag) Style(b, tag == PrimaryTag || b.DialogResult == DialogResult.OK);
                }
                var g = c as DataGridView;
                if (g != null) StyleGrid(g);
                var ll = c as LinkLabel; if (ll != null) ll.LinkColor = Primary;
                if (c.HasChildren) Apply(c);
            }
            var f = root as Form;
            if (f != null) f.BackColor = Bg;
            if (root is TableLayoutPanel || root is FlowLayoutPanel) root.BackColor = Color.White;
        }
    }
}
