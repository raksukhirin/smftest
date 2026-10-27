// Approval workflow model + DEMO seed (ported from mockup/ApprovalFlow/data.js).
// Step names 04-13, the approvers and all documents are placeholders until the real tables are known.
// NOTE: approve / reject only change this in-memory list. SMFDash never writes to the database (see Db.Query).
using System;
using System.Collections.Generic;
using System.Linq;

namespace SMFDash
{
    public class ApprStep { public int No; public string Name, Approver; }
    public class ApprFile { public string Name; public int Kb; }
    public class ApprHist { public int Step; public string Action, By, Remark; public DateTime At; }

    public class ApprReq
    {
        public int Id; public string Doc, Module, Type, Status, RequestedBy, Remark;
        public int Step, DoneSteps; public DateTime RequestedAt; public DateTime? Deadline;
        public List<ApprFile> Files = new List<ApprFile>(); public List<ApprHist> History = new List<ApprHist>();
        public string Shipper, Consignee, Pol, Pod, JobType, Sale;

        public ApprReq Clone()
        {
            var c = (ApprReq)MemberwiseClone();
            c.Files = new List<ApprFile>(Files); c.History = History.Select(h => new ApprHist { Step = h.Step, Action = h.Action, By = h.By, Remark = h.Remark, At = h.At }).ToList();
            return c;
        }
    }

    public static class ApprovalData
    {
        /// <summary>Fixed demo clock so the sample "x h ago" / overdue labels make sense.</summary>
        public static readonly DateTime Now = new DateTime(2026, 10, 27, 15, 0, 0);

        public static readonly string[][] Modules = { new[] { "SE", "Sea Export" }, new[] { "SI", "Sea Import" }, new[] { "AE", "Air Export" }, new[] { "AI", "Air Import" } };

        public static readonly ApprStep[] Steps = new[]
        {
            new[] { "Vessel Booking", "TEST" }, new[] { "Job Order", "JACK" }, new[] { "Advance Expense", "TEST" }, new[] { "Booking Confirm", "JACK" },
            new[] { "Container Pickup", "TEST" }, new[] { "Customs Clearance", "JACK" }, new[] { "Loading", "TEST" }, new[] { "B/L Draft", "JACK" },
            new[] { "B/L Release", "TEST" }, new[] { "Invoice", "JACK" }, new[] { "Payment", "TEST" }, new[] { "Closing", "JACK" }, new[] { "Archive", "TEST" }
        }.Select((s, i) => new ApprStep { No = i + 1, Name = s[0], Approver = s[1] }).ToArray();

        static DateTime D(string s) { return DateTime.Parse(s, System.Globalization.CultureInfo.InvariantCulture); }
        static ApprFile F(string n, int kb) { return new ApprFile { Name = n, Kb = kb }; }
        static ApprHist H(int step, string act, string by, string at, string remark = "") { return new ApprHist { Step = step, Action = act, By = by, At = D(at), Remark = remark }; }

        static ApprReq R(int id, string doc, string mod, int step, string status, string by, string at, string deadline, string remark, int done,
                         string[] sum, ApprFile[] files, params ApprHist[] hist)
        {
            var r = new ApprReq { Id = id, Doc = doc, Module = mod, Type = "Sale Booking", Step = step, Status = status, RequestedBy = by, RequestedAt = D(at),
                                  Remark = remark, DoneSteps = done, Shipper = sum[0], Consignee = sum[1], Pol = sum[2], Pod = sum[3], JobType = sum[4], Sale = sum[5] };
            if (deadline != "") r.Deadline = D(deadline);
            r.Files.AddRange(files); r.History.AddRange(hist);
            return r;
        }

        public static List<ApprReq> Seed()
        {
            var s1 = new[] { "2B XX SUPPLY CO.,LTD.", "9INC. INTERNATIONAL CO., LTD", "LAEM CHABANG", "SINGAPORE", "DIRECT-FCL", "WWW" };
            var s2 = new[] { "THAI FOODS CO.", "ORIENT TRADING LLC", "LAEM CHABANG", "LOS ANGELES", "DIRECT-FCL", "TTT" };
            var s3 = new[] { "SIAM PARTS LTD.", "EURO LOGISTICS GMBH", "BANGKOK", "HAMBURG", "CONSOL-LCL", "WWW" };
            var s4 = new[] { "NOVA RETAIL", "PACIFIC IMPORTS", "LAEM CHABANG", "SHANGHAI", "DIRECT-FCL", "TTT" };
            return new List<ApprReq>
            {
                R(1, "TESTBYBOSS008", "SE", 1, "Wait", "ADMIN", "2026-10-27 13:47", "2026-10-28", "", 0, s1, new[] { F("BSE24060007.PDF", 412) },
                  H(1, "Requested", "ADMIN", "2026-10-27 13:47", "Please approve vessel booking")),
                R(2, "BSE26060001", "SE", 1, "Wait", "ADMIN", "2026-10-27 11:20", "", "TEST", 0, s2, new[] { F("Booking-Request.PDF", 233), F("Rate-Confirm.PDF", 118) },
                  H(1, "Requested", "ADMIN", "2026-10-27 11:20", "TEST")),
                R(3, "@22122025", "SE", 2, "Wait", "JACK", "2026-10-26 16:05", "2026-10-27", "Job order for Dec shipment", 1, s3, new[] { F("JobOrder-22122025.PDF", 301), F("PO-4471.PDF", 96) },
                  H(1, "Requested", "JACK", "2026-10-24 09:10"), H(1, "Approved", "TEST", "2026-10-24 14:30", "OK"), H(2, "Requested", "JACK", "2026-10-26 16:05", "Job order for Dec shipment")),
                R(4, "TESTBYBOSS007", "SE", 1, "Wait", "ADMIN", "2026-10-26 10:00", "2026-10-26", "", 0, s1, new[] { F("Booking.PDF", 188) },
                  H(1, "Requested", "ADMIN", "2026-10-26 10:00")),
                R(5, "BSE18100003", "SE", 3, "Wait", "JACK", "2026-10-25 17:40", "", "Advance for THC + CFS", 2, s4, new[] { F("Advance-Exp.XLSX", 54), F("Quotation.PDF", 410) },
                  H(1, "Approved", "TEST", "2026-10-20 10:00", "OK"), H(2, "Approved", "JACK", "2026-10-22 09:00"), H(3, "Requested", "JACK", "2026-10-25 17:40", "Advance for THC + CFS")),
                R(6, "THD1194603", "SE", 1, "Wait", "SUDA", "2026-10-25 09:15", "", "", 0, s2, new ApprFile[0],
                  H(1, "Requested", "SUDA", "2026-10-25 09:15")),
                R(7, "TEST2208C", "SE", 1, "Wait", "ADMIN", "2026-10-24 14:00", "", "Six documents attached", 0, s4,
                  new[] { F("BL-copy.PDF", 520), F("Inv.PDF", 211), F("PL.PDF", 175), F("COO.PDF", 90), F("MSDS.PDF", 330), F("Photo.JPG", 1800) },
                  H(1, "Requested", "ADMIN", "2026-10-24 14:00")),
                R(8, "AE26100012", "AE", 2, "Wait", "SUDA", "2026-10-27 08:30", "2026-10-28", "Urgent - flight Thursday", 1,
                  new[] { "SIAM PARTS LTD.", "FRANKFURT AUTOPARTS", "BKK", "FRA", "AIR-EXPORT", "TTT" }, new[] { F("AWB-draft.PDF", 140) },
                  H(1, "Approved", "TEST", "2026-10-26 15:00"), H(2, "Requested", "SUDA", "2026-10-27 08:30", "Urgent - flight Thursday")),
                R(9, "SI26100007", "SI", 1, "Wait", "JACK", "2026-10-26 13:00", "", "", 0,
                  new[] { "GLOBAL SOURCING CO.", "ABC TRADING", "SHANGHAI", "LAEM CHABANG", "DIRECT-FCL", "WWW" }, new[] { F("DO-request.PDF", 77) },
                  H(1, "Requested", "JACK", "2026-10-26 13:00")),
                R(10, "TEST2109999", "SE", 5, "Wait", "JACK", "2026-10-26 09:00", "", "Pickup 29 Oct", 4, s1, new[] { F("Pickup-order.PDF", 66) },
                  H(1, "Approved", "TEST", "2026-10-12 10:00", "test by boss"), H(2, "Approved", "JACK", "2026-10-14 09:00"), H(3, "Approved", "TEST", "2026-10-16 11:00"),
                  H(4, "Approved", "JACK", "2026-10-20 10:00"), H(5, "Requested", "JACK", "2026-10-26 09:00", "Pickup 29 Oct")),
                R(11, "BSE25050001", "SE", 2, "Approved", "ADMIN", "2026-10-23 10:00", "", "", 2, s3, new[] { F("JobOrder.PDF", 210) },
                  H(1, "Approved", "TEST", "2026-10-22 10:00"), H(2, "Requested", "ADMIN", "2026-10-23 10:00"), H(2, "Approved", "JACK", "2026-10-23 15:20", "Approved")),
                R(12, "BSE22060001", "SE", 1, "Rejected", "ADMIN", "2026-10-22 10:00", "", "", 0, s2, new[] { F("Booking.PDF", 190) },
                  H(1, "Requested", "ADMIN", "2026-10-22 10:00"), H(1, "Rejected", "TEST", "2026-10-22 16:40", "Rate not confirmed by carrier - please resubmit"))
            };
        }
    }
}
