using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace SMFDash
{
    /// <summary>Window with a WebView2. The page calls SMF.call(cmd) (injected below); every command is a read-only query run here.</summary>
    public class WebForm : Form
    {
        const string Host = "smfdash.local";
        readonly Db _db;
        readonly string _ui;
        readonly WebView2 _wv = new WebView2 { Dock = DockStyle.Fill };
        readonly JavaScriptSerializer _js = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };

        // Runs in every frame. The top page owns the channel to C#; frames (Approval is an iframe) go through window.top, same origin.
        const string BridgeJs = @"(function(){
  if (!window.chrome || !window.chrome.webview) return;
  if (window === window.top) {
    var seq = 0, pending = {};
    window.chrome.webview.addEventListener('message', function (e) {
      var m = e.data, p = pending[m.id]; if (!p) return; delete pending[m.id];
      if (m.ok) p.res(m.data); else p.rej(new Error(m.error));
    });
    window.__smfCall = function (cmd, args) {
      return new Promise(function (res, rej) { var id = ++seq; pending[id] = { res: res, rej: rej }; window.chrome.webview.postMessage({ id: id, cmd: cmd, args: args || {} }); });
    };
    window.SMF = { host: true, call: window.__smfCall };
  } else {
    try { window.SMF = { host: true, call: function (c, a) { return window.top.__smfCall(c, a); } }; } catch (e) {}
  }
})();";

        public WebForm(Db db, string uiRoot)
        {
            _db = db; _ui = uiRoot;
            Text = "SMF Dashboard (Web)"; ClientSize = new System.Drawing.Size(1360, 860); MinimumSize = new System.Drawing.Size(1000, 640);
            StartPosition = FormStartPosition.CenterScreen;
            Controls.Add(_wv);
            AlertSettings.Load(_db.Ini);
            Shown += (s, e) => Init();
        }

        async void Init()
        {
            try
            {
                if (!Directory.Exists(Path.Combine(_ui, "Dashboard"))) throw new DirectoryNotFoundException("Web UI folder not found: " + Path.Combine(_ui, "Dashboard") + "\r\nUse  SMFDash.Web.exe /ui <folder that holds Dashboard and ApprovalFlow>");
                if (!await EnsureRuntime()) { Close(); return; }
                string data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SMFDash.Web");
                var env = await CoreWebView2Environment.CreateAsync(null, data);
                await _wv.EnsureCoreWebView2Async(env);
                var c = _wv.CoreWebView2;
                c.SetVirtualHostNameToFolderMapping(Host, _ui, CoreWebView2HostResourceAccessKind.Allow);
                await c.AddScriptToExecuteOnDocumentCreatedAsync(BridgeJs);
                c.WebMessageReceived += OnMessage;
                c.NewWindowRequested += (s, e) =>               // blob: / external links: open in the default browser instead of a second WebView
                {
                    e.Handled = true;
                    if (e.Uri.StartsWith("http", StringComparison.OrdinalIgnoreCase) && !e.Uri.Contains(Host))
                        System.Diagnostics.Process.Start(e.Uri);
                };
                c.Navigate("https://" + Host + "/Dashboard/index.html");
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, ex.Message + "\r\n\r\nThe Microsoft Edge WebView2 Runtime is required (Windows 11 has it; otherwise install the Evergreen runtime).", "SMFDash.Web", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // ---- WebView2 Runtime: check at start, offer to install it (Microsoft's own "Evergreen Bootstrapper", downloaded only after the user agrees) ----
        const string BootstrapperUrl = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";
        const string ManualUrl = "https://developer.microsoft.com/microsoft-edge/webview2/";

        static bool HasRuntime()
        {
            try { return !string.IsNullOrEmpty(CoreWebView2Environment.GetAvailableBrowserVersionString()); }
            catch { return false; }
        }

        async Task<bool> EnsureRuntime()
        {
            if (HasRuntime()) return true;
            var ask = MessageBox.Show(this, "SMF Dashboard needs the Microsoft Edge WebView2 Runtime, which is not installed on this PC.\r\n\r\nDownload it from Microsoft and install it now?\r\n(about 2 MB download, needs an internet connection; Windows may ask for permission)",
                "SMFDash.Web", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
            if (ask != DialogResult.Yes) { Manual(); return false; }
            string file = Path.Combine(Path.GetTempPath(), "MicrosoftEdgeWebview2Setup.exe");
            try
            {
                Text = "SMF Dashboard (Web) - installing WebView2 Runtime ...";
                System.Net.ServicePointManager.SecurityProtocol |= (System.Net.SecurityProtocolType)3072;   // TLS 1.2
                using (var wc = new System.Net.WebClient()) await wc.DownloadFileTaskAsync(BootstrapperUrl, file);
                int code = await Task.Run(() =>
                {
                    var p = System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(file, "/silent /install") { UseShellExecute = true });
                    p.WaitForExit(); return p.ExitCode;
                });
                Text = "SMF Dashboard (Web)";
                if (code == 0 && HasRuntime()) return true;
                MessageBox.Show(this, "The installer finished with code " + code + " and the runtime is still not available.", "SMFDash.Web", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
            catch (Exception ex)
            {
                Text = "SMF Dashboard (Web)";
                MessageBox.Show(this, "Could not download or run the installer:\r\n" + ex.Message, "SMFDash.Web", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
            finally { try { File.Delete(file); } catch { } }
            Manual();
            return false;
        }

        void Manual()
        {
            MessageBox.Show(this, "Install the \"Evergreen Standalone Installer\" of the WebView2 Runtime from:\r\n" + ManualUrl + "\r\n\r\nthen start SMF Dashboard again.", "SMFDash.Web", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        void OnMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            if (e.Source == null || !e.Source.StartsWith("https://" + Host + "/", StringComparison.OrdinalIgnoreCase)) return;   // only our own pages
            var m = _js.DeserializeObject(e.WebMessageAsJson) as Dictionary<string, object>;
            if (m == null || !m.ContainsKey("id")) return;
            int id = Convert.ToInt32(m["id"]);
            string cmd = m.ContainsKey("cmd") ? Convert.ToString(m["cmd"]) : "";
            if (cmd == "settings") { Reply(id, true, ShowSettings(), null); return; }   // dialog runs on the UI thread
            Task.Factory.StartNew(() => Run(cmd)).ContinueWith(t =>
            {
                if (t.IsFaulted) Reply(id, false, null, t.Exception.GetBaseException().Message); else Reply(id, true, t.Result, null);
            }, TaskScheduler.FromCurrentSynchronizationContext());
        }

        void Reply(int id, bool ok, object data, string error)
        {
            var o = new Dictionary<string, object> { { "id", id }, { "ok", ok } };
            if (ok) o["data"] = data; else o["error"] = error;
            _wv.CoreWebView2.PostWebMessageAsJson(_js.Serialize(o));
        }

        object ShowSettings()
        {
            using (var f = new SettingsForm(_db.Ini))
            {
                bool saved = f.ShowDialog(this) == DialogResult.OK;
                if (saved) AlertSettings.Load(_db.Ini);
                return new Dictionary<string, object> { { "saved", saved } };
            }
        }

        object Run(string cmd)
        {
            switch (cmd)
            {
                case "info":
                    return new Dictionary<string, object> {
                        { "configured", _db.Configured }, { "target", _db.Configured ? _db.Target : "" },
                        { "user", _db.Ini.Get("Approval", "User", "TEST") },
                        { "warnDays", AlertSettings.WarnDays }, { "badDays", AlertSettings.BadDays }, { "hideEmpty", AlertSettings.HideEmpty }, { "refreshMin", AlertSettings.RefreshMin } };
                case "alerts":
                    return Alerts();
                case "acc":
                    return Acc();
                default:
                    throw new InvalidOperationException("Unknown command: " + cmd);
            }
        }

        void NeedDb() { if (!_db.Configured) throw new InvalidOperationException("No database configured - press Settings"); }

        object Alerts()
        {
            NeedDb();
            string warning;
            var list = LiveAlerts.Load(_db, out warning);
            return new Dictionary<string, object> {
                { "warning", warning }, { "target", _db.Target },
                { "items", list.Select(a => new Dictionary<string, object> { { "file", a.File }, { "subject", a.Subject }, { "short", a.Short }, { "html", a.Html } }).ToList() } };
        }

        // Same figures as the Accounting page of SMFDash, shaped like DATA.acc in mockup\Dashboard\data.js; only the parts that really came from the DB are marked live
        object Acc()
        {
            NeedDb();
            var a = LiveData.LoadAcc(_db);
            Func<Kpi, object[]> k = x => new object[] { x.Label, x.Value, x.Delta, x.Dir };
            Func<TableData, object> t = x => x == null ? null : x.Rows.Select(r => (object)r).ToList();
            return new Dictionary<string, object> {
                { "target", _db.Target }, { "error", a.Error },
                { "live", new Dictionary<string, object> { { "bank", a.BankLive }, { "ar", a.ArLive }, { "ap", a.ApLive } } },
                { "kpis", a.Kpis.Select(k).ToList() },
                { "banks", t(a.Banks) }, { "topAR", t(a.TopAr) }, { "dueAP", t(a.DueAp) },
                { "ar", a.Ar }, { "ap", a.Ap }
            };
        }
    }
}
