// สร้าง HTML preview รูปแบบ House Bill of Lading (ทางเรือ) มาตรฐาน — ใช้ table ล้วนเพื่อให้แสดงใน WebBrowser control (IE11) ได้
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net;
using System.Text;

namespace BLScan
{
    public static class HtmlPreview
    {
        static string H(string s) { return WebUtility.HtmlEncode(s ?? ""); }

        /// <summary>ค่าที่คลิกได้ (คลิกแล้วไปช่องแก้ไขในโปรแกรม)</summary>
        static string F(Dictionary<string, string> v, string key, bool multiline = false, string emptyText = "")
        {
            string s = Fields.Val(v, key).TrimEnd('\r', '\n', ' ');
            string cls = s == "" ? "v empty" : "v";
            string body = s == "" ? H(emptyText) : (multiline ? H(s).Replace("\r\n", "<br>").Replace("\n", "<br>") : H(s));
            return "<span class=\"" + cls + "\" data-key=\"" + key + "\" title=\"" + H(Fields.Get(key).DbName) + "\" onclick=\"pick('" + key + "')\">" + body + "</span>";
        }

        static string Date(Dictionary<string, string> v, string key)
        {
            DateTime dt;
            string s = Fields.Val(v, key);
            if (Fields.TryDate(s, out dt)) s = dt.ToString("dd MMM yyyy", CultureInfo.InvariantCulture).ToUpperInvariant();
            var tmp = new Dictionary<string, string>(v);
            tmp[key] = s;
            return F(tmp, key);
        }

        static string Box(string label, string content, string extraCls = "")
        {
            return "<div class=\"lbl\">" + H(label) + "</div><div class=\"val " + extraCls + "\">" + content + "</div>";
        }

        static string Voy(Dictionary<string, string> v, string nameKey, string voyKey)
        {
            string voy = Fields.Val(v, voyKey);
            return F(v, nameKey) + (voy != "" ? " <span class=\"muted\">V.</span>" + F(v, voyKey) : " " + F(v, voyKey));
        }

        static string Port(Dictionary<string, string> v, string nameKey, string codeKey)
        {
            return F(v, nameKey) + " <span class=\"code\">" + F(v, codeKey, false, "รหัส?") + "</span>";
        }

        public static string Build(Dictionary<string, string> v, string sourceFile, string status, List<string> notes)
        {
            var sb = new StringBuilder();
            sb.Append("<!DOCTYPE html><html><head><meta http-equiv=\"X-UA-Compatible\" content=\"IE=edge\"><meta charset=\"utf-8\">");
            sb.Append("<title>House B/L preview — " + H(Fields.Val(v, "BLNO")) + "</title><style>");
            sb.Append(@"
body{margin:0;padding:14px;background:#e9ecef;font-family:Tahoma,'Segoe UI',sans-serif;color:#1d2433}
.bar{max-width:820px;margin:0 auto 8px;font-size:12px;color:#495057}
.bar b{color:#1d2433}
.status{display:inline-block;padding:2px 8px;border-radius:10px;background:#fff3bf;color:#7a5b00;font-weight:bold;margin-left:6px}
.status.ok{background:#d3f9d8;color:#1b6b2a}.status.bad{background:#ffe3e3;color:#a61e1e}
.sheet{max-width:820px;margin:0 auto;background:#fff;border:1px solid #adb5bd;box-shadow:0 1px 4px rgba(0,0,0,.15)}
table.bl{width:100%;border-collapse:collapse;table-layout:fixed}
table.bl td{border:1px solid #495057;vertical-align:top;padding:3px 6px 6px}
.lbl{font-size:10px;color:#495057;text-transform:none;margin-bottom:2px}
.val{font-family:'Courier New',Consolas,monospace;font-size:12.5px;line-height:1.35;min-height:16px;word-wrap:break-word}
.tall{min-height:74px}
.title{text-align:center;padding:8px 4px}
.title .t1{font-size:20px;font-weight:bold;letter-spacing:1px}
.title .t2{font-size:11px;color:#495057;margin-top:2px}
.title .t3{font-size:11px;margin-top:6px;color:#1864ab}
.cargo th{font-size:10px;font-weight:normal;color:#495057;border:1px solid #495057;padding:3px;background:#f8f9fa}
.cargo td{height:250px}
.num{text-align:right}
.said{font-size:10px;color:#495057;margin-bottom:4px}
.v{cursor:pointer;border-bottom:1px dotted transparent}
.v:hover{background:#e7f5ff;border-bottom-color:#1c7ed6}
.v.empty{display:inline-block;min-width:60px;background:#fff5f5;color:#c92a2a;font-size:10px;font-family:Tahoma,sans-serif}
.v.sel{background:#d0ebff}
.code{font-size:10px;color:#1864ab}
.muted{color:#868e96}
.foot{font-size:10px;color:#495057;padding:6px 8px;border-top:1px solid #dee2e6;background:#f8f9fa}
.notes{max-width:820px;margin:8px auto 0;font-size:11px;color:#7a5b00;background:#fff9db;border:1px solid #ffe066;padding:6px 10px}
.stamp{font-size:11px;color:#495057}
");
            sb.Append("</style><script>function pick(k){try{window.external.FocusField(k);}catch(e){}" +
                      "var a=document.getElementsByTagName('span');for(var i=0;i<a.length;i++){a[i].className=a[i].className.replace(' sel','');if(a[i].getAttribute('data-key')==k)a[i].className+=' sel';}}</script>");
            sb.Append("</head><body>");

            string stCls = status.StartsWith("บันทึกแล้ว") ? "status ok" : (status.StartsWith("ไม่พบ DOCNO") ? "status bad" : "status");
            sb.Append("<div class=\"bar\">SFHBL.DOCNO <b>" + H(Fields.Val(v, "DOCNO") == "" ? "(ยังไม่ระบุ)" : Fields.Val(v, "DOCNO")) + "</b>" +
                      " &nbsp;·&nbsp; JOB <b>" + H(Fields.Val(v, "JOBNO")) + "</b>" +
                      "<span class=\"" + stCls + "\">" + H(status) + "</span></div>");

            sb.Append("<div class=\"sheet\"><table class=\"bl\"><colgroup><col width=\"25%\"><col width=\"25%\"><col width=\"25%\"><col width=\"25%\"></colgroup>");

            // แถว 1: Shipper | B/L No. + หัวเอกสาร
            sb.Append("<tr><td colspan=\"2\" rowspan=\"2\">" + Box("Shipper / Exporter", F(v, "S_ADD", true), "tall") + "</td>");
            sb.Append("<td colspan=\"2\">" + Box("B/L No.", "<b>" + F(v, "BLNO") + "</b>") + "</td></tr>");
            sb.Append("<tr><td colspan=\"2\" class=\"title\"><div class=\"t1\">HOUSE BILL OF LADING</div>" +
                      "<div class=\"t2\">for Combined Transport or Port to Port Shipment</div>" +
                      "<div class=\"t3\">" + F(v, "BLTYPE", false, "B/L type") + " &nbsp;·&nbsp; Master B/L " + F(v, "MASTERNO", false, "—") + "</div></td></tr>");

            // แถว 2: Consignee | Delivery agent
            sb.Append("<tr><td colspan=\"2\">" + Box("Consignee (or Order)", F(v, "C_ADD", true), "tall") + "</td>");
            sb.Append("<td colspan=\"2\" rowspan=\"2\">" + Box("For delivery of goods please apply to (Delivery Agent)",
                      (Fields.Val(v, "AGENTNAME") != "" ? F(v, "AGENTNAME") + "<br>" : "") + F(v, "A_ADD", true), "tall") + "</td></tr>");

            // แถว 3: Notify
            sb.Append("<tr><td colspan=\"2\">" + Box("Notify Party", F(v, "N_ADD", true), "tall") + "</td></tr>");

            // แถว 4-6: เส้นทาง
            sb.Append("<tr><td>" + Box("Pre-carriage by (Feeder)", Voy(v, "FEEDER", "F_VOY")) + "</td>");
            sb.Append("<td>" + Box("Place of Receipt", Port(v, "RECPORTNAME", "RECPORT")) + "</td>");
            sb.Append("<td>" + Box("Freight Term", F(v, "CHGTERM") + (Fields.Val(v, "CHGTERM") == "PP" ? " <span class=\"muted\">PREPAID</span>" : Fields.Val(v, "CHGTERM") == "CC" ? " <span class=\"muted\">COLLECT</span>" : "")) + "</td>");
            sb.Append("<td>" + Box("Service Type", F(v, "CYTERM")) + "</td></tr>");

            sb.Append("<tr><td>" + Box("Ocean Vessel / Voy. No.", Voy(v, "VESSEL", "V_VOY")) + "</td>");
            sb.Append("<td>" + Box("Port of Loading", Port(v, "LOADPORTNAME", "LOADPORT")) + "</td>");
            sb.Append("<td>" + Box("Shipped on Board Date", Date(v, "ETD")) + "</td>");
            sb.Append("<td>" + Box("No. of Original B(s)/L", F(v, "BLCOPY")) + "</td></tr>");

            sb.Append("<tr><td>" + Box("Port of Discharge", Port(v, "DISPORTNAME", "DISPORT")) + "</td>");
            sb.Append("<td>" + Box("Place of Delivery", Port(v, "DELPORTNAME", "DELPORT")) + "</td>");
            sb.Append("<td colspan=\"2\">" + Box("Final Destination (for the Merchant's reference only)", Port(v, "FINALPORTNAME", "FINALPORT")) + "</td></tr>");
            sb.Append("</table>");

            // ตารางสินค้า
            sb.Append("<table class=\"bl cargo\"><colgroup><col width=\"22%\"><col width=\"13%\"><col width=\"41%\"><col width=\"12%\"><col width=\"12%\"></colgroup>");
            sb.Append("<tr><th>Container No. / Seal No.<br>Marks and Numbers</th><th>No. and Kind<br>of Packages</th><th>Description of Goods</th><th>Gross Weight<br>(KGS)</th><th>Measurement<br>(CBM)</th></tr>");
            sb.Append("<tr><td><div class=\"val\">" + F(v, "MARKDESC", true) + "</div></td>");
            sb.Append("<td><div class=\"val\">" + F(v, "PKGQTY") + "<br>" + F(v, "PKGUNIT") + "</div><div class=\"code\" style=\"margin-top:4px\">" + F(v, "UNITCODE", false, "unit code?") + "</div></td>");
            sb.Append("<td><div class=\"said\">SAID TO CONTAIN:</div><div class=\"val\">" + F(v, "GOODS", true) + "</div></td>");
            sb.Append("<td class=\"num\"><div class=\"val\">" + F(v, "GW") + "</div></td>");
            sb.Append("<td class=\"num\"><div class=\"val\">" + F(v, "CBM") + "</div></td></tr>");
            sb.Append("<tr><td colspan=\"5\" style=\"height:auto\">" + Box("Total Number of Containers or Packages (in words)", F(v, "PKGWORD", true)) + "</td></tr>");
            sb.Append("</table>");

            // ท้ายฟอร์ม
            sb.Append("<table class=\"bl\"><colgroup><col width=\"50%\"><col width=\"50%\"></colgroup>");
            sb.Append("<tr><td>" + Box("Freight and Charges", F(v, "FREIGHTTEXT")) + "<div style=\"margin-top:8px\">" + Box("Freight Payable at", F(v, "PAYABLEAT")) + "</div></td>");
            sb.Append("<td>" + Box("Place and Date of Issue", F(v, "ISSUPLACE") + (Fields.Val(v, "ISSUPLACE") != "" ? ", " : " ") + Date(v, "ISSUDATE")) +
                      "<div style=\"margin-top:8px\">" + Box("Signed for the Carrier", F(v, "SIGNEDBY")) + "</div>" +
                      "<div class=\"stamp\" style=\"margin-top:14px;border-top:1px solid #adb5bd;padding-top:2px\">As Carrier / As Agent for the Carrier</div></td></tr>");
            sb.Append("</table>");

            sb.Append("<div class=\"foot\">สร้าง " + DateTime.Now.ToString("yyyy-MM-dd HH:mm") +
                      " &nbsp;·&nbsp; คลิกที่ค่าใดๆ เพื่อแก้ไขในช่องด้านขวา &nbsp;·&nbsp; ช่องสีแดง = ยังไม่มีค่า</div>");
            sb.Append("</div>");

            if (notes != null && notes.Count > 0)
                sb.Append("<div class=\"notes\"><b>หมายเหตุจากการอ่าน:</b><br>" + string.Join("<br>", notes.Select(H)) + "</div>");
            sb.Append("</body></html>");
            return sb.ToString();
        }
    }
}
