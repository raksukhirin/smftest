using System;
using System.IO;
using System.Windows.Forms;

namespace SMFDash
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            string iniPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "SMFDash.ini");
            var args = Environment.GetCommandLineArgs();
            if (args.Length >= 3 && args[1] == "/shot")      // SMFDash.exe /shot <folder> : save PNGs of every page, no database
            {
                Directory.CreateDirectory(args[2]);
                var f = new MainForm(new Db(new Ini(iniPath))) { NoLoad = true };
                f.Show(); Application.DoEvents();
                foreach (var m in new[] { "ops:All", "ops:Sea", "ops:Truck", "acc:All", "mkt:All", "apr:All" })
                { var p = m.Split(':'); f.Snapshot(p[0], p[1], Path.Combine(args[2], p[0] + "_" + p[1] + ".png")); }
                return;
            }
            Application.Run(new MainForm(new Db(new Ini(iniPath))));
        }
    }
}
