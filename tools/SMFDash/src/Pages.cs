using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;

namespace SMFDash
{
    public static class Pages
    {
        static readonly float[] W3 = { 200, 100 }, Eq2 = { 100, 100 }, W3b = { 100, 100, 100 };

        static void KpiRow(PageLayout p, Kpi[] ks, Color accent)
        {
            p.Equal(84, ks.Select(k => (Control)new KpiCard(k, accent)).ToArray());
        }

        static Card TableCard(string title, string hint, TableData t, int h)
        {
            return new Card(title, hint, t.Live, Tbl.Make(t.Cols, t.Rows, t.Pill, t.Num));
        }

        // ---------------- Operations ----------------
        public static Control Ops(OpsMode m)
        {
            var p = new PageLayout();
            KpiRow(p, m.Kpis, Theme.Ops);
            if (m.Pipeline != null)
            {
                var strip = new TableLayoutPanel { ColumnCount = m.Pipeline.Length, RowCount = 1, BackColor = Color.White };
                foreach (var s in m.Pipeline)
                {
                    strip.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f / m.Pipeline.Length));
                    var cell = new Panel { Dock = DockStyle.Fill, Margin = new Padding(2), BackColor = Theme.Hex("#f1f5f9") };
                    var bar = new Panel { Dock = DockStyle.Top, Height = 3, BackColor = s.Col };
                    var num = new Label { Text = s.Value.ToString("0"), Font = new Font("Segoe UI", 15f, FontStyle.Bold), Dock = DockStyle.Top, Height = 30, TextAlign = ContentAlignment.BottomCenter };
                    var lab = new Label { Text = s.Label, Font = Theme.Small, ForeColor = Theme.Muted, Dock = DockStyle.Fill, TextAlign = ContentAlignment.TopCenter };
                    cell.Controls.Add(lab); cell.Controls.Add(num); cell.Controls.Add(bar);
                    strip.Controls.Add(cell, strip.ColumnStyles.Count - 1, 0);
                }
                p.Equal(96, new Card("Workflow status", "SAMPLE", false, strip));
            }
            var vol = new BarChart(m.Volume, Sample.W12, Theme.Ops);
            Control split = m.Donut ? (Control)new DonutChart(m.Split) : new HBarList(m.Split);
            p.Row(240, W3, new Card(m.VolTitle, "SAMPLE · last 12 weeks", false, vol), new Card(m.SplitTitle, "SAMPLE", false, split));
            p.Equal(190, TableCard(m.TableTitle, "SAMPLE · top 4", m.Table, 190));
            return p;
        }

        // ---------------- Accounting ----------------
        public static Control Acc(AccData a)
        {
            var p = new PageLayout();
            KpiRow(p, a.Kpis, Theme.Acc);

            p.Section("Cash Book");
            var cash = new LineChart(new[] { new Series("In", a.CashIn, Theme.Hex("#059669")), new Series("Out", a.CashOut, Theme.Hex("#dc2626")) }, Sample.W12);
            p.Row(230, W3, new Card("Cash in vs out", "SAMPLE · THB million / week", false, cash),
                  TableCard("Bank balances", a.BankLive ? "SMBANKACC.BANKBAL" : "SAMPLE", a.Banks, 230));

            p.Section("AR / AP");
            p.Equal(200,
                new Card("AR aging", a.ArLive ? "THB million · days past due" : "SAMPLE · THB million", a.ArLive, new BarChart(a.Ar, Sample.Aging, Theme.Hex("#059669"))),
                new Card("AP aging", a.ApLive ? "THB million · days past due" : "SAMPLE · THB million", a.ApLive, new BarChart(a.Ap, Sample.Aging, Theme.Hex("#d97706"))));
            p.Equal(190,
                TableCard("Top receivables", a.ArLive ? "top 4 by balance" : "SAMPLE", a.TopAr, 190),
                TableCard("Payables due this week", a.ApLive ? "next 7 days" : "SAMPLE", a.DueAp, 190));

            p.Section("General Ledger");
            var pl = new GroupBarChart(new[] { new Series("Revenue", a.Rev, Theme.Hex("#059669")), new Series("Cost", a.Cost, Theme.Hex("#94a3b8")) }, Sample.M6);
            var gl = Tbl.Make(new[] { "Item", "Status" }, a.Gl, 1);
            p.Row(220, W3, new Card("Revenue vs cost", "SAMPLE · THB million / month", false, pl), new Card("Closing checklist", "SAMPLE", false, gl));
            return p;
        }

        // ---------------- Marketing ----------------
        public static Control Mkt(MktData k)
        {
            var p = new PageLayout();
            KpiRow(p, k.Kpis, Theme.Mkt);

            p.Section("Quotation");
            var q = new GroupBarChart(new[] { new Series("Quotations", k.QMonth, Theme.Mkt), new Series("Bookings", k.BMonth, Theme.Hex("#10b981")) }, Sample.M6);
            p.Row(230, W3b, new Card("Quotation funnel", "SAMPLE · % of sent", false, new FunnelChart(k.Funnel, k.Funnel[1].Value)),
                  new Card("Quotations vs Bookings", "SAMPLE · per month", false, q), TableCard("Quotes expiring soon", "SAMPLE", k.Expiring, 230));
            p.Equal(190, TableCard("Top customers", "SAMPLE", k.TopCust, 190), new Card("Bookings by mode", "SAMPLE", false, new DonutChart(k.BookMode)));

            p.Section("Booking");
            p.Equal(170, TableCard("Bookings waiting", "SAMPLE", k.PendingBk, 170));
            return p;
        }
    }
}
