// DEMO sample numbers (ported from mockup/Dashboard/data.js). Widgets that have no live query yet show these, tagged "SAMPLE".
using System.Collections.Generic;
using System.Linq;

namespace SMFDash
{
    public class TableData
    {
        public string[] Cols; public List<string[]> Rows = new List<string[]>(); public int Pill = -1; public int[] Num = new int[0]; public bool Live;
        public TableData(string[] cols, int pill, params string[][] rows) { Cols = cols; Pill = pill; Rows.AddRange(rows); }
    }

    public class OpsMode
    {
        public Kpi[] Kpis; public Slice[] Pipeline; public string VolTitle; public double[] Volume;
        public string SplitTitle; public Slice[] Split; public bool Donut; public string TableTitle; public TableData Table;
    }

    public class AccData
    {
        public Kpi[] Kpis; public double[] CashIn, CashOut, Ar, Ap, Rev, Cost;
        public TableData Banks, TopAr, DueAp; public string[][] Gl;
        public bool BankLive, ArLive, ApLive; public string Error = "";
    }

    public class MktData
    {
        public Kpi[] Kpis; public Slice[] Funnel, BookMode; public double[] QMonth, BMonth;
        public TableData Expiring, TopCust, PendingBk;
    }

    public static class Sample
    {
        public static readonly string[] W12 = { "W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10", "W11", "W12" };
        public static readonly string[] M6 = { "May", "Jun", "Jul", "Aug", "Sep", "Oct" };
        public static readonly string[] Aging = { "Current", "1-30", "31-60", "61-90", ">90" };
        public static readonly string[] OpsModes = { "All", "Sea", "Air", "Customs", "Truck" };

        static Kpi K(string l, string v, string d, string dir, int seed)
        {
            var k = new Kpi(l, v, d, dir);
            k.Spark = new double[] { 3, 5, 4, 7, 6, 8, 7, 9 }.Select((x, i) => x + ((seed * 3 + i * 7) % 4)).ToArray();
            return k;
        }
        static Kpi[] Ks(params string[][] r) { return r.Select((x, i) => K(x[0], x[1], x[2], x[3], i)).ToArray(); }
        static string[] R(params string[] c) { return c; }
        static Slice[] Sl(string[] hex, params object[][] rows) { return rows.Select((r, i) => new Slice((string)r[0], System.Convert.ToDouble(r[1]), hex[i])).ToArray(); }
        static Slice[] Pipe(params object[][] rows) { return rows.Select(r => new Slice((string)r[0], System.Convert.ToDouble(r[1]), (string)r[2])).ToArray(); }

        public static Dictionary<string, OpsMode> Ops()
        {
            var d = new Dictionary<string, OpsMode>();
            d["All"] = new OpsMode
            {
                Kpis = Ks(R("Open jobs", "186", "+12", "up"), R("Departing this week", "41", "+5", "up"), R("Delayed / at risk", "9", "+2", "down"), R("Docs pending", "23", "-4", "up")),
                VolTitle = "Jobs opened per week", Volume = new double[] { 150, 162, 158, 171, 180, 176, 190, 185, 198, 204, 196, 212 },
                SplitTitle = "Jobs by mode", Donut = true, Split = Sl(new[] { "#0369a1", "#7c3aed", "#f59e0b", "#10b981" }, new object[] { "Sea", 98 }, new object[] { "Air", 37 }, new object[] { "Customs", 52 }, new object[] { "Truck", 34 }),
                TableTitle = "Needs attention",
                Table = new TableData(new[] { "Job", "Mode", "Customer", "Issue", "Due" }, 3, R("SE-26-0412", "Sea", "ABC Trading", "Vessel delayed 2d", "Oct 28"), R("AE-26-0188", "Air", "Siam Parts", "Docs missing", "Oct 27"), R("CC-26-0931", "Customs", "Thai Foods", "Inspection hold", "Oct 27"), R("TR-26-1204", "Truck", "Nova Retail", "Late pickup", "Oct 26"))
            };
            d["Sea"] = new OpsMode
            {
                Kpis = Ks(R("Open sea jobs", "98", "+7", "up"), R("TEU this month", "612", "+8.4%", "up"), R("Vessels due <=7d", "14", "0", "flat"), R("Delayed", "5", "+1", "down")),
                Pipeline = Pipe(new object[] { "Booked", 22, "#0ea5e9" }, new object[] { "Docs", 18, "#6366f1" }, new object[] { "Loaded", 16, "#f59e0b" }, new object[] { "Sailing", 27, "#0369a1" }, new object[] { "Arrived", 9, "#10b981" }, new object[] { "Delivered", 6, "#64748b" }),
                VolTitle = "TEU per week", Volume = new double[] { 48, 52, 50, 58, 61, 55, 64, 60, 67, 70, 66, 74 },
                SplitTitle = "Top trade lanes (TEU)", Donut = true, Split = Sl(new[] { "#0369a1", "#0ea5e9", "#6366f1", "#10b981", "#94a3b8" }, new object[] { "BKK-LAX", 142 }, new object[] { "LCB-SIN", 118 }, new object[] { "BKK-HAM", 96 }, new object[] { "LCB-SHA", 88 }, new object[] { "Other", 168 }),
                TableTitle = "Upcoming vessels",
                Table = new TableData(new[] { "Vessel / Voy", "Job", "POL-POD", "ETD", "Status" }, 4, R("EVER GIVEN 042E", "SE-26-0412", "LCB-LAX", "Oct 28", "Delayed"), R("MSC AURORA 118W", "SE-26-0420", "BKK-HAM", "Oct 29", "On time"), R("ONE HARMONY 77S", "SE-26-0433", "LCB-SIN", "Oct 30", "On time"), R("CMA CGM LYRA 31N", "SE-26-0441", "LCB-SHA", "Nov 01", "On time"))
            };
            d["Air"] = new OpsMode
            {
                Kpis = Ks(R("Open air jobs", "37", "+3", "up"), R("Chargeable kg (MTD)", "48,200", "+5.1%", "up"), R("AWB issued today", "11", "-2", "down"), R("Delayed", "2", "0", "flat")),
                Pipeline = Pipe(new object[] { "Booked", 8, "#0ea5e9" }, new object[] { "Received", 7, "#6366f1" }, new object[] { "Flown", 12, "#0369a1" }, new object[] { "Arrived", 6, "#10b981" }, new object[] { "Delivered", 4, "#64748b" }),
                VolTitle = "Chargeable kg x100 per week", Volume = new double[] { 92, 101, 88, 110, 104, 119, 98, 125, 117, 130, 122, 138 },
                SplitTitle = "Top airlines (kg)", Split = Sl(new[] { "#7c3aed", "#a78bfa", "#6366f1", "#0ea5e9", "#94a3b8" }, new object[] { "TG", 14200 }, new object[] { "EK", 11800 }, new object[] { "SQ", 9400 }, new object[] { "QR", 7100 }, new object[] { "Other", 5700 }),
                TableTitle = "Recent AWB",
                Table = new TableData(new[] { "AWB", "Job", "Route", "Weight kg", "Status" }, 4, R("217-4412 8810", "AE-26-0188", "BKK-FRA", "820", "Docs missing"), R("176-2201 4471", "AE-26-0191", "BKK-DXB", "340", "Flown"), R("618-9034 1120", "AE-26-0195", "BKK-SIN", "95", "Arrived"), R("157-7740 3305", "AE-26-0199", "BKK-DOH", "510", "Booked"))
            };
            d["Customs"] = new OpsMode
            {
                Kpis = Ks(R("Declarations open", "52", "+9", "up"), R("Cleared today", "18", "+4", "up"), R("Awaiting inspection", "6", "+1", "down"), R("Awaiting docs", "11", "-3", "up")),
                Pipeline = Pipe(new object[] { "Prepared", 14, "#0ea5e9" }, new object[] { "Lodged", 12, "#6366f1" }, new object[] { "Inspection", 6, "#f59e0b" }, new object[] { "Duty paid", 9, "#10b981" }, new object[] { "Released", 11, "#64748b" }),
                VolTitle = "Declarations per week", Volume = new double[] { 30, 34, 29, 38, 41, 36, 44, 40, 47, 50, 45, 52 },
                SplitTitle = "By customs office", Split = Sl(new[] { "#f59e0b", "#fbbf24", "#d97706", "#94a3b8" }, new object[] { "Laem Chabang", 21 }, new object[] { "Suvarnabhumi", 17 }, new object[] { "Bangkok Port", 9 }, new object[] { "Don Mueang", 5 }),
                TableTitle = "Pending clearance",
                Table = new TableData(new[] { "Entry", "Job", "Customer", "Office", "Status" }, 4, R("A0112-26-8841", "CC-26-0931", "Thai Foods", "LCB", "Inspection"), R("A0112-26-8850", "CC-26-0934", "ABC Trading", "LCB", "Awaiting docs"), R("A0201-26-3310", "CC-26-0940", "Siam Parts", "BKK Air", "Lodged"), R("A0112-26-8862", "CC-26-0944", "Nova Retail", "LCB", "Duty pending"))
            };
            d["Truck"] = new OpsMode
            {
                Kpis = Ks(R("Trips today", "34", "+6", "up"), R("Fleet utilisation", "78%", "+3pt", "up"), R("Late deliveries", "3", "-1", "up"), R("Empty return pending", "8", "+2", "down")),
                Pipeline = Pipe(new object[] { "Planned", 9, "#0ea5e9" }, new object[] { "Dispatched", 12, "#6366f1" }, new object[] { "In transit", 8, "#0369a1" }, new object[] { "Delivered", 5, "#10b981" }),
                VolTitle = "Trips per week", Volume = new double[] { 210, 224, 219, 231, 240, 236, 252, 247, 260, 268, 259, 275 },
                SplitTitle = "By vehicle type", Split = Sl(new[] { "#10b981", "#34d399", "#059669", "#94a3b8" }, new object[] { "6-wheel", 12 }, new object[] { "10-wheel", 9 }, new object[] { "Trailer", 8 }, new object[] { "Pickup", 5 }),
                TableTitle = "Trips today",
                Table = new TableData(new[] { "Trip", "Truck", "Route", "ETA", "Status" }, 4, R("TR-26-1204", "70-1234", "LCB-Bangna", "10:30", "Late"), R("TR-26-1207", "71-5521", "BKK-Rayong", "11:45", "In transit"), R("TR-26-1210", "70-8890", "Bangna-LCB", "13:00", "Dispatched"), R("TR-26-1213", "72-0042", "LCB-Saraburi", "15:20", "Planned"))
            };
            return d;
        }

        public static AccData Acc()
        {
            var a = new AccData
            {
                Kpis = Ks(R("Cash & bank", "฿ 18.4M", "+2.1M", "up"), R("AR outstanding", "฿ 26.9M", "+1.3M", "down"), R("AP outstanding", "฿ 19.2M", "-0.8M", "up"), R("Net profit (MTD)", "฿ 3.6M", "+9.5%", "up")),
                CashIn = new[] { 2.1, 2.4, 1.9, 2.8, 2.6, 3.1, 2.2, 2.9, 3.3, 2.7, 3.0, 3.4 }, CashOut = new[] { 1.8, 2.2, 2.1, 2.3, 2.5, 2.4, 2.6, 2.5, 2.8, 2.9, 2.6, 2.9 },
                Ar = new[] { 11.2, 8.6, 4.1, 2.0, 1.0 }, Ap = new[] { 9.4, 6.1, 2.3, 1.0, 0.4 },
                Rev = new[] { 9.1, 9.8, 10.2, 10.9, 11.4, 12.3 }, Cost = new[] { 7.4, 8.0, 8.3, 8.9, 9.1, 9.8 },
                Banks = new TableData(new[] { "Account", "Balance" }, -1, R("KBank 001-2-xxxxx", "฿ 8.2M"), R("SCB 402-3-xxxxx", "฿ 5.6M"), R("BBL 120-4-xxxxx", "฿ 3.1M"), R("Petty cash", "฿ 0.2M"), R("USD account", "$ 41.5K")) { Num = new[] { 1 } },
                TopAr = new TableData(new[] { "Customer", "Amount", "Aging" }, 2, R("ABC Trading", "฿ 4.8M", "31-60"), R("Thai Foods Co.", "฿ 3.9M", "1-30"), R("Nova Retail", "฿ 3.2M", "Current"), R("Siam Parts", "฿ 2.6M", ">90")) { Num = new[] { 1 } },
                DueAp = new TableData(new[] { "Vendor", "Amount", "Due" }, -1, R("Evergreen Line", "฿ 2.1M", "Oct 28"), R("Thai Airways Cargo", "฿ 1.6M", "Oct 29"), R("LCB Terminal", "฿ 0.9M", "Oct 30"), R("Fuel supplier", "฿ 0.7M", "Nov 01")) { Num = new[] { 1 } },
                Gl = new[] { R("Unposted journals", "14"), R("Unreconciled bank lines", "37"), R("Period status (Oct)", "Open"), R("Trial balance", "Balanced") }
            };
            return a;
        }

        public static MktData Mkt()
        {
            return new MktData
            {
                Kpis = Ks(R("Quotations (MTD)", "128", "+14", "up"), R("Win rate", "38%", "+3pt", "up"), R("Bookings (MTD)", "94", "+9", "up"), R("Quoted value", "฿ 41.6M", "+6.2%", "up")),
                Funnel = Sl(new[] { "#94a3b8", "#0ea5e9", "#6366f1", "#10b981", "#ef4444" }, new object[] { "Draft", 142 }, new object[] { "Sent", 128 }, new object[] { "Follow-up", 74 }, new object[] { "Won", 49 }, new object[] { "Lost", 31 }),
                QMonth = new double[] { 88, 97, 104, 112, 121, 128 }, BMonth = new double[] { 61, 66, 72, 79, 85, 94 },
                BookMode = Sl(new[] { "#0369a1", "#0ea5e9", "#7c3aed", "#f59e0b" }, new object[] { "Sea FCL", 46 }, new object[] { "Sea LCL", 18 }, new object[] { "Air", 20 }, new object[] { "Truck/Other", 10 }),
                Expiring = new TableData(new[] { "No.", "Customer", "Expires", "Value" }, -1, R("QT-26-1108", "ABC Trading", "Oct 28", "฿ 1.2M"), R("QT-26-1115", "Nova Retail", "Oct 29", "฿ 0.8M"), R("QT-26-1121", "Siam Parts", "Oct 30", "฿ 2.4M"), R("QT-26-1130", "Thai Foods", "Nov 01", "฿ 0.6M")) { Num = new[] { 3 } },
                TopCust = new TableData(new[] { "Customer", "Bookings", "Revenue" }, -1, R("ABC Trading", "24", "฿ 9.8M"), R("Thai Foods Co.", "19", "฿ 7.1M"), R("Nova Retail", "15", "฿ 5.4M"), R("Siam Parts", "12", "฿ 4.2M")) { Num = new[] { 1, 2 } },
                PendingBk = new TableData(new[] { "No.", "Customer", "Lane", "Waiting for" }, 3, R("BK-26-0912", "ABC Trading", "LCB-LAX", "Awaiting rate approval"), R("BK-26-0918", "Siam Parts", "BKK-FRA", "Awaiting space"), R("BK-26-0921", "Nova Retail", "LCB-SIN", "Awaiting SI"))
            };
        }
    }
}
