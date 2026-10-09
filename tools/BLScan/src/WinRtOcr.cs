// OCR ผ่าน Windows.Media.Ocr (มากับ Windows 10/11) — เรียก WinRT ด้วย reflection
// เพราะเครื่อง build ไม่มี Windows SDK (ไม่มี Windows.winmd ให้ csc อ้างอิงตอน compile)
using System;
using System.Collections;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading.Tasks;

namespace BLScan
{
    /// <summary>คำหนึ่งคำจาก OCR — พิกัด normalize เป็นสัดส่วนของหน้า (0..1)</summary>
    public class OcrWord
    {
        public string Text;
        public double X, Y, W, H;
        public int LineNo;
        public double R { get { return X + W; } }
        public double B { get { return Y + H; } }
        public double CX { get { return X + W / 2; } }
        public double CY { get { return Y + H / 2; } }
        public override string ToString() { return string.Format("{0} @({1:0.000},{2:0.000})", Text, X, Y); }
    }

    public class OcrPage
    {
        public List<OcrWord> Words = new List<OcrWord>();
        public string RawText = "";
        public int PixelWidth, PixelHeight;
        public Bitmap Image;
    }

    public static class WinRtOcr
    {
        const string RtAsm = "System.Runtime.WindowsRuntime, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089";

        static Type T(string fullName, string winmd)
        {
            return Type.GetType(fullName + ", " + winmd + ", ContentType=WindowsRuntime", true);
        }

        static readonly Type ExtType = Type.GetType("System.WindowsRuntimeSystemExtensions, " + RtAsm, true);
        static readonly MethodInfo AsTaskOp = ExtType.GetMethods().First(m => m.Name == "AsTask" && m.IsGenericMethodDefinition
            && m.GetParameters().Length == 1 && m.GetParameters()[0].ParameterType.Name == "IAsyncOperation`1");
        static readonly MethodInfo AsTaskAction = ExtType.GetMethods().First(m => m.Name == "AsTask" && !m.IsGenericMethod
            && m.GetParameters().Length == 1 && m.GetParameters()[0].ParameterType.Name == "IAsyncAction");

        static object Await(object op, Type returnType)
        {
            if (returnType.IsGenericType && returnType.GetGenericTypeDefinition().Name == "IAsyncOperation`1")
            {
                var task = (Task)AsTaskOp.MakeGenericMethod(returnType.GetGenericArguments()[0]).Invoke(null, new[] { op });
                task.Wait();
                return task.GetType().GetProperty("Result").GetValue(task, null);
            }
            if (returnType.Name == "IAsyncAction")
            {
                var task = (Task)AsTaskAction.Invoke(null, new[] { op });
                task.Wait();
                return null;
            }
            return op;
        }

        /// <summary>เรียก method (static ถ้า target==null) ตามชื่อ + จำนวน argument แล้ว await ให้ถ้าเป็น async</summary>
        static object Call(Type type, object target, string name, params object[] args)
        {
            var flags = BindingFlags.Public | (target == null ? BindingFlags.Static : BindingFlags.Instance);
            var mi = type.GetMethods(flags).FirstOrDefault(m => m.Name == name && m.GetParameters().Length == args.Length);
            if (mi == null) throw new MissingMethodException(type.FullName, name);
            return Await(mi.Invoke(target, args), mi.ReturnType);
        }

        static object Get(object obj, string prop)
        {
            return obj.GetType().GetProperty(prop).GetValue(obj, null);
        }

        static object Get(Type type, object obj, string prop)
        {
            return type.GetProperty(prop).GetValue(obj, null);
        }

        static readonly Type TStorageFile = T("Windows.Storage.StorageFile", "Windows.Storage");
        static readonly Type TPdfDocument = T("Windows.Data.Pdf.PdfDocument", "Windows.Data");
        static readonly Type TPdfPage = T("Windows.Data.Pdf.PdfPage", "Windows.Data");
        static readonly Type TPdfRenderOptions = T("Windows.Data.Pdf.PdfPageRenderOptions", "Windows.Data");
        static readonly Type TMemStream = T("Windows.Storage.Streams.InMemoryRandomAccessStream", "Windows.Storage");
        static readonly Type TFileAccessMode = T("Windows.Storage.FileAccessMode", "Windows.Storage");
        static readonly Type TDecoder = T("Windows.Graphics.Imaging.BitmapDecoder", "Windows.Graphics");
        static readonly Type TPixelFormat = T("Windows.Graphics.Imaging.BitmapPixelFormat", "Windows.Graphics");
        static readonly Type TAlphaMode = T("Windows.Graphics.Imaging.BitmapAlphaMode", "Windows.Graphics");
        static readonly Type TSoftwareBitmap = T("Windows.Graphics.Imaging.SoftwareBitmap", "Windows.Graphics");
        static readonly Type TLanguage = T("Windows.Globalization.Language", "Windows.Globalization");
        static readonly Type TOcrEngine = T("Windows.Media.Ocr.OcrEngine", "Windows.Media");
        static readonly Type TOcrResult = T("Windows.Media.Ocr.OcrResult", "Windows.Media");
        static readonly Type TOcrLine = T("Windows.Media.Ocr.OcrLine", "Windows.Media");
        static readonly Type TOcrWord = T("Windows.Media.Ocr.OcrWord", "Windows.Media");

        /// <summary>true เมื่อเคยเรียก Windows.Data.Pdf — ตัว native จะ crash (0xC0000005) ตอน unload DLL ถ้าปิดโปรแกรมตามปกติ</summary>
        public static bool UsedPdf;

        [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
        [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr h, uint code);

        /// <summary>จบ process โดยข้ามขั้น unload DLL (เรียกหลังบันทึกทุกอย่างเสร็จแล้วเท่านั้น)</summary>
        public static void ExitSafely(int code)
        {
            if (UsedPdf) { Console.Out.Flush(); TerminateProcess(GetCurrentProcess(), (uint)code); }
        }

        public static int PageCount(string path)
        {
            if (!IsPdf(path)) return 1;
            var file = Call(TStorageFile, null, "GetFileFromPathAsync", Path.GetFullPath(path));
            var doc = Call(TPdfDocument, null, "LoadFromFileAsync", file);
            return Convert.ToInt32(Get(TPdfDocument, doc, "PageCount"));
        }

        public static bool IsPdf(string path)
        {
            return string.Equals(Path.GetExtension(path), ".pdf", StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>แปลงหน้าเอกสารเป็นรูป — PDF render ด้วย Windows.Data.Pdf, รูปภาพโหลดด้วย GDI+</summary>
        public static Bitmap LoadPageImage(string path, int pageIndex, int renderWidth)
        {
            if (!IsPdf(path))
            {
                using (var src = Image.FromFile(path))
                {
                    var bmp = new Bitmap(src.Width, src.Height, PixelFormat.Format24bppRgb);
                    using (var g = Graphics.FromImage(bmp))
                    {
                        g.Clear(Color.White);
                        g.DrawImage(src, 0, 0, src.Width, src.Height);
                    }
                    return bmp;
                }
            }
            UsedPdf = true;
            var file = Call(TStorageFile, null, "GetFileFromPathAsync", Path.GetFullPath(path));
            var doc = Call(TPdfDocument, null, "LoadFromFileAsync", file);
            var page = Call(TPdfDocument, doc, "GetPage", (uint)pageIndex);
            var opt = Activator.CreateInstance(TPdfRenderOptions);
            TPdfRenderOptions.GetProperty("DestinationWidth").SetValue(opt, (uint)renderWidth, null);
            var stream = Activator.CreateInstance(TMemStream);
            try
            {
                Call(TPdfPage, page, "RenderToStreamAsync", stream, opt);
                // stream เป็น PNG — อ่านกลับมาเป็น .NET Stream
                var input = TMemStream.GetMethod("GetInputStreamAt").Invoke(stream, new object[] { 0UL });
                var streamExt = Type.GetType("System.IO.WindowsRuntimeStreamExtensions, " + RtAsm, true);
                var asRead = streamExt.GetMethods().First(m => m.Name == "AsStreamForRead" && m.GetParameters().Length == 1);
                using (var net = (Stream)asRead.Invoke(null, new[] { input }))
                using (var ms = new MemoryStream())
                {
                    net.CopyTo(ms);
                    ms.Position = 0;
                    using (var img = Image.FromStream(ms))
                    {
                        var bmp = new Bitmap(img.Width, img.Height, PixelFormat.Format24bppRgb);
                        using (var g = Graphics.FromImage(bmp))
                        {
                            g.Clear(Color.White);
                            g.DrawImage(img, 0, 0, img.Width, img.Height);
                        }
                        return bmp;
                    }
                }
            }
            finally
            {
                // ปล่อย WinRT object ของ PDF เอง — ถ้าปล่อยให้ finalizer ทำตอนปิดโปรแกรม จะเกิด access violation (0xC0000005)
                Release(stream); Release(page); Release(doc);
            }
        }

        static void Release(object o)
        {
            if (o == null) return;
            try { var d = o as IDisposable; if (d != null) d.Dispose(); } catch { }
            try { if (Marshal.IsComObject(o)) Marshal.FinalReleaseComObject(o); } catch { }
        }

        /// <summary>OCR รูป 1 หน้า — คืนคำพร้อมตำแหน่ง</summary>
        public static OcrPage Recognize(Bitmap bmp, string language)
        {
            string tmp = Path.Combine(Path.GetTempPath(), "BLScan_" + Guid.NewGuid().ToString("N") + ".png");
            bmp.Save(tmp, ImageFormat.Png);
            try
            {
                var file = Call(TStorageFile, null, "GetFileFromPathAsync", tmp);
                var mode = Enum.Parse(TFileAccessMode, "Read");
                var rs = Call(TStorageFile, file, "OpenAsync", mode);
                var dec = Call(TDecoder, null, "CreateAsync", rs);
                var sbmp = Call(TDecoder, dec, "GetSoftwareBitmapAsync", Enum.Parse(TPixelFormat, "Bgra8"), Enum.Parse(TAlphaMode, "Premultiplied"));

                var lang = Activator.CreateInstance(TLanguage, language);
                var engine = Call(TOcrEngine, null, "TryCreateFromLanguage", lang);
                if (engine == null)
                    throw new InvalidOperationException("Windows OCR ไม่มีภาษา " + language + " — ติดตั้ง language pack ใน Settings > Time & Language");
                var result = Call(TOcrEngine, engine, "RecognizeAsync", sbmp);

                var page = new OcrPage();
                page.PixelWidth = Convert.ToInt32(Get(TSoftwareBitmap, sbmp, "PixelWidth"));
                page.PixelHeight = Convert.ToInt32(Get(TSoftwareBitmap, sbmp, "PixelHeight"));
                page.RawText = (string)Get(TOcrResult, result, "Text");
                int lineNo = 0;
                var lines = new List<string>();
                foreach (var line in (IEnumerable)Get(TOcrResult, result, "Lines"))
                {
                    lineNo++;
                    lines.Add((string)Get(TOcrLine, line, "Text"));
                    foreach (var w in (IEnumerable)Get(TOcrLine, line, "Words"))
                    {
                        var rect = Get(TOcrWord, w, "BoundingRect");
                        var ow = new OcrWord();
                        ow.Text = (string)Get(TOcrWord, w, "Text");
                        ow.X = Convert.ToDouble(Get(rect, "X")) / page.PixelWidth;
                        ow.Y = Convert.ToDouble(Get(rect, "Y")) / page.PixelHeight;
                        ow.W = Convert.ToDouble(Get(rect, "Width")) / page.PixelWidth;
                        ow.H = Convert.ToDouble(Get(rect, "Height")) / page.PixelHeight;
                        ow.LineNo = lineNo;
                        page.Words.Add(ow);
                    }
                }
                page.RawText = string.Join("\r\n", lines);
                return page;
            }
            finally
            {
                try { File.Delete(tmp); } catch { }
            }
        }

        public static OcrPage Scan(string path, int pageIndex, int renderWidth, string language)
        {
            var bmp = LoadPageImage(path, pageIndex, renderWidth);
            // Windows OCR จำกัดขนาดภาพ (MaxImageDimension) — ย่อถ้าใหญ่เกิน
            int max = Convert.ToInt32(TOcrEngine.GetProperty("MaxImageDimension").GetValue(null, null));
            Bitmap ocrBmp = bmp;
            double s = 1;
            if (bmp.Width < renderWidth) s = (double)renderWidth / bmp.Width;   // ภาพสแกนความละเอียดต่ำ → ขยายก่อน OCR อ่านแม่นขึ้น
            if (Math.Max(bmp.Width, bmp.Height) * s > max) s = (double)max / Math.Max(bmp.Width, bmp.Height);
            if (Math.Abs(s - 1) > 0.01)
            {
                ocrBmp = new Bitmap((int)(bmp.Width * s), (int)(bmp.Height * s), PixelFormat.Format24bppRgb);
                using (var g = Graphics.FromImage(ocrBmp))
                {
                    g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                    g.DrawImage(bmp, 0, 0, ocrBmp.Width, ocrBmp.Height);
                }
            }
            var page = Recognize(ocrBmp, language);
            if (!ReferenceEquals(ocrBmp, bmp)) ocrBmp.Dispose();
            page.Image = bmp;
            return page;
        }
    }
}
