// SMFDash.Web - the web UI (mockup\Dashboard) hosted in a WebView2 window, with the same read-only DB access as SMFDash.
// Shares the data code of ..\SMFDash\src (Db, Ini, LiveData, LiveAlerts ...) by compiling it; SMFDash itself is not touched.
using System;
using System.IO;
using System.Windows.Forms;

namespace SMFDash
{
    static class WebProgram
    {
        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string iniPath = Path.Combine(baseDir, "SMFDash.ini");
            // /ui <folder> : folder that holds Dashboard\, ApprovalFlow\ and vendor\
            // default: <exe folder>\web (the distributed package), else the repository's mockup folder (development)
            string ui = null;
            for (int i = 0; i + 1 < args.Length; i++) if (args[i] == "/ui") ui = args[i + 1];
            if (ui == null)
            {
                string pkg = Path.Combine(baseDir, "web");
                ui = Directory.Exists(Path.Combine(pkg, "Dashboard")) ? pkg : Path.GetFullPath(Path.Combine(baseDir, @"..\..\..\mockup"));
            }
            Application.Run(new WebForm(new Db(new Ini(iniPath)), ui));
        }
    }
}
