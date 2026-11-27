using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

#if HAS_WINRT_OCR
using Windows.Foundation;
using Windows.Globalization;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;
using Windows.Storage.Streams;
#endif

namespace ZVision.Native
{
    public static class VisionMath
    {
        private const int TargetCols = 9;
        private const int TargetRows = 8;

        /// <summary>
        /// 64-bit Difference Hash (dHash) ported from ZeroGraphics.Vision.Matching.DifferenceHash
        /// using safe LockBits + Marshal.Copy so it compiles without /unsafe.
        /// </summary>
        public static ulong ComputeDHash(Bitmap bmp)
        {
            if (bmp == null) throw new ArgumentNullException("bmp");
            int width = bmp.Width;
            int height = bmp.Height;
            if (width < TargetCols || height < TargetRows) return 0UL;

            BitmapData data = bmp.LockBits(
                new Rectangle(0, 0, width, height),
                ImageLockMode.ReadOnly,
                PixelFormat.Format32bppArgb);
            try
            {
                int stride = Math.Abs(data.Stride);
                byte[] pixels = new byte[stride * height];
                Marshal.Copy(data.Scan0, pixels, 0, pixels.Length);

                double[] matrix = new double[TargetCols * TargetRows];
                long[] counts = new long[TargetCols * TargetRows];

                int[] xBounds = new int[TargetCols + 1];
                for (int c = 0; c <= TargetCols; c++) xBounds[c] = (c * width) / TargetCols;
                int[] yBounds = new int[TargetRows + 1];
                for (int r = 0; r <= TargetRows; r++) yBounds[r] = (r * height) / TargetRows;

                int stepX = Math.Max(1, width / 90);
                int stepY = Math.Max(1, height / 80);

                for (int r = 0; r < TargetRows; r++)
                {
                    int y0 = yBounds[r];
                    int y1 = yBounds[r + 1];
                    for (int y = y0; y < y1; y += stepY)
                    {
                        int rowOffset = y * stride;
                        for (int c = 0; c < TargetCols; c++)
                        {
                            int x0 = xBounds[c];
                            int x1 = xBounds[c + 1];
                            int cellIdx = r * TargetCols + c;
                            for (int x = x0; x < x1; x += stepX)
                            {
                                int px = rowOffset + x * 4;
                                byte b = pixels[px];
                                byte g = pixels[px + 1];
                                byte red = pixels[px + 2];
                                // ITU-R BT.709 grayscale
                                int gray = (54 * red + 183 * g + 19 * b) >> 8;
                                matrix[cellIdx] += gray;
                                counts[cellIdx]++;
                            }
                        }
                    }
                }

                for (int i = 0; i < matrix.Length; i++)
                {
                    if (counts[i] > 0) matrix[i] /= counts[i];
                }

                ulong hash = 0UL;
                int bitIndex = 0;
                for (int r = 0; r < TargetRows; r++)
                {
                    int rowOff = r * TargetCols;
                    for (int c = 0; c < TargetCols - 1; c++)
                    {
                        if (matrix[rowOff + c] > matrix[rowOff + c + 1])
                        {
                            hash |= (1UL << bitIndex);
                        }
                        bitIndex++;
                    }
                }
                return hash;
            }
            finally
            {
                bmp.UnlockBits(data);
            }
        }

        public static string ToHex(ulong hash)
        {
            return hash.ToString("x16", CultureInfo.InvariantCulture);
        }

        public static int HammingDistance(ulong h1, ulong h2)
        {
            ulong x = h1 ^ h2;
            x = x - ((x >> 1) & 0x5555555555555555UL);
            x = (x & 0x3333333333333333UL) + ((x >> 2) & 0x3333333333333333UL);
            return (int)((((x + (x >> 4)) & 0x0F0F0F0F0F0F0F0FUL) * 0x0101010101010101UL) >> 56);
        }

        /// <summary>
        /// Coarse-to-fine Normalized Cross Correlation (NCC) template search on grayscale buffers.
        /// </summary>
        public static Dictionary<string, object> FindTemplateNcc(Bitmap screen, Bitmap tpl, double minScore)
        {
            Dictionary<string, object> res = new Dictionary<string, object>(StringComparer.Ordinal);
            if (screen == null || tpl == null || tpl.Width > screen.Width || tpl.Height > screen.Height || tpl.Width < 4 || tpl.Height < 4)
            {
                res["found"] = false;
                res["score"] = 0.0;
                return res;
            }

            int sw = screen.Width, sh = screen.Height;
            int tw = tpl.Width, th = tpl.Height;
            byte[] sg = ExtractGray(screen);
            byte[] tg = ExtractGray(tpl);

            double tMean = 0;
            for (int i = 0; i < tg.Length; i++) tMean += tg[i];
            tMean /= tg.Length;
            double tVar = 0;
            double[] tNorm = new double[tg.Length];
            for (int i = 0; i < tg.Length; i++)
            {
                double d = tg[i] - tMean;
                tNorm[i] = d;
                tVar += d * d;
            }
            if (tVar < 1e-6)
            {
                res["found"] = false;
                res["score"] = 0.0;
                return res;
            }

            int bestX = 0, bestY = 0;
            double bestScore = -1.0;

            // Coarse pass (step 2)
            int maxX = sw - tw;
            int maxY = sh - th;
            for (int y = 0; y <= maxY; y += 2)
            {
                for (int x = 0; x <= maxX; x += 2)
                {
                    double score = ComputePatchNcc(sg, sw, x, y, tNorm, tw, th, tVar, 2);
                    if (score > bestScore)
                    {
                        bestScore = score;
                        bestX = x;
                        bestY = y;
                    }
                }
            }

            // Fine refinement around best coarse hit
            int fineX0 = Math.Max(0, bestX - 3);
            int fineX1 = Math.Min(maxX, bestX + 3);
            int fineY0 = Math.Max(0, bestY - 3);
            int fineY1 = Math.Min(maxY, bestY + 3);
            bestScore = -1.0;
            for (int y = fineY0; y <= fineY1; y++)
            {
                for (int x = fineX0; x <= fineX1; x++)
                {
                    double score = ComputePatchNcc(sg, sw, x, y, tNorm, tw, th, tVar, 1);
                    if (score > bestScore)
                    {
                        bestScore = score;
                        bestX = x;
                        bestY = y;
                    }
                }
            }

            bool found = bestScore >= minScore;
            res["found"] = found;
            res["score"] = Math.Round(bestScore, 4);
            if (found)
            {
                res["x"] = bestX;
                res["y"] = bestY;
                res["width"] = tw;
                res["height"] = th;
                res["cx"] = bestX + tw / 2;
                res["cy"] = bestY + th / 2;
            }
            return res;
        }

        private static byte[] ExtractGray(Bitmap bmp)
        {
            int w = bmp.Width, h = bmp.Height;
            byte[] gray = new byte[w * h];
            BitmapData data = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            try
            {
                int stride = Math.Abs(data.Stride);
                byte[] buf = new byte[stride * h];
                Marshal.Copy(data.Scan0, buf, 0, buf.Length);
                for (int y = 0; y < h; y++)
                {
                    int row = y * stride;
                    int outRow = y * w;
                    for (int x = 0; x < w; x++)
                    {
                        int px = row + x * 4;
                        gray[outRow + x] = (byte)((54 * buf[px + 2] + 183 * buf[px + 1] + 19 * buf[px]) >> 8);
                    }
                }
            }
            finally
            {
                bmp.UnlockBits(data);
            }
            return gray;
        }

        private static double ComputePatchNcc(byte[] sg, int sw, int px, int py, double[] tNorm, int tw, int th, double tVar, int step)
        {
            double sMean = 0;
            int count = 0;
            for (int ty = 0; ty < th; ty += step)
            {
                int sRow = (py + ty) * sw + px;
                for (int tx = 0; tx < tw; tx += step)
                {
                    sMean += sg[sRow + tx];
                    count++;
                }
            }
            if (count == 0) return -1.0;
            sMean /= count;

            double num = 0, sVar = 0, tSubVar = 0;
            for (int ty = 0; ty < th; ty += step)
            {
                int sRow = (py + ty) * sw + px;
                int tRow = ty * tw;
                for (int tx = 0; tx < tw; tx += step)
                {
                    double sd = sg[sRow + tx] - sMean;
                    double td = tNorm[tRow + tx];
                    num += sd * td;
                    sVar += sd * sd;
                    tSubVar += td * td;
                }
            }
            double denom = Math.Sqrt(sVar * (step == 1 ? tVar : tSubVar));
            return denom < 1e-6 ? 0.0 : (num / denom);
        }

        public static bool IsWinRtOcrAvailable()
        {
#if HAS_WINRT_OCR
            try
            {
                OcrEngine eng = OcrEngine.TryCreateFromUserProfileLanguages();
                return eng != null;
            }
            catch
            {
                return false;
            }
#else
            return false;
#endif
        }

        public static List<object> GetOcrLanguages()
        {
            List<object> list = new List<object>();
#if HAS_WINRT_OCR
            try
            {
                IReadOnlyList<Language> langs = OcrEngine.AvailableRecognizerLanguages;
                for (int i = 0; i < langs.Count; i++) list.Add(langs[i].LanguageTag);
            }
            catch { }
#endif
            return list;
        }

        public static Dictionary<string, object> RunWinRtOcr(Bitmap bmp, string languageTag, int originX, int originY)
        {
            Dictionary<string, object> res = new Dictionary<string, object>(StringComparer.Ordinal);
#if HAS_WINRT_OCR
            if (bmp == null)
            {
                res["available"] = false;
                res["reason"] = "null_bitmap";
                return res;
            }
            try
            {
                OcrEngine engine = null;
                if (!string.IsNullOrEmpty(languageTag))
                {
                    Language lang = new Language(languageTag);
                    if (OcrEngine.IsLanguageSupported(lang)) engine = OcrEngine.TryCreateFromLanguage(lang);
                }
                if (engine == null) engine = OcrEngine.TryCreateFromUserProfileLanguages();
                if (engine == null)
                {
                    res["available"] = false;
                    res["reason"] = "no_ocr_language_installed";
                    return res;
                }

                byte[] pngBytes;
                using (MemoryStream ms = new MemoryStream())
                {
                    bmp.Save(ms, ImageFormat.Png);
                    pngBytes = ms.ToArray();
                }

                using (InMemoryRandomAccessStream ras = new InMemoryRandomAccessStream())
                {
                    using (DataWriter writer = new DataWriter(ras.GetOutputStreamAt(0)))
                    {
                        writer.WriteBytes(pngBytes);
                        AwaitUint(writer.StoreAsync());
                        AwaitBool(writer.FlushAsync());
                        writer.DetachStream();
                    }
                    ras.Seek(0);
                    BitmapDecoder decoder = AwaitOp(BitmapDecoder.CreateAsync(ras));
                    using (SoftwareBitmap sb = AwaitOp(decoder.GetSoftwareBitmapAsync(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Premultiplied)))
                    {
                        OcrResult ocrResult = AwaitOp(engine.RecognizeAsync(sb));
                        List<object> linesOut = new List<object>();
                        StringBuilder fullText = new StringBuilder();
                        for (int i = 0; i < ocrResult.Lines.Count; i++)
                        {
                            OcrLine line = ocrResult.Lines[i];
                            if (i > 0) fullText.Append('\n');
                            fullText.Append(line.Text);

                            double minX = double.MaxValue, minY = double.MaxValue, maxX = 0, maxY = 0;
                            List<object> wordsOut = new List<object>();
                            for (int j = 0; j < line.Words.Count; j++)
                            {
                                OcrWord w = line.Words[j];
                                Windows.Foundation.Rect wr = w.BoundingRect;
                                if (wr.X < minX) minX = wr.X;
                                if (wr.Y < minY) minY = wr.Y;
                                if (wr.X + wr.Width > maxX) maxX = wr.X + wr.Width;
                                if (wr.Y + wr.Height > maxY) maxY = wr.Y + wr.Height;

                                int wx = originX + (int)Math.Round(wr.X);
                                int wy = originY + (int)Math.Round(wr.Y);
                                int ww = Math.Max(1, (int)Math.Round(wr.Width));
                                int wh = Math.Max(1, (int)Math.Round(wr.Height));
                                Dictionary<string, object> wDict = new Dictionary<string, object>(StringComparer.Ordinal);
                                wDict["text"] = w.Text;
                                wDict["bounds"] = new List<object> { wx, wy, ww, wh };
                                wDict["cx"] = wx + ww / 2;
                                wDict["cy"] = wy + wh / 2;
                                wordsOut.Add(wDict);
                            }

                            int lx = minX == double.MaxValue ? originX : originX + (int)Math.Round(minX);
                            int ly = minY == double.MaxValue ? originY : originY + (int)Math.Round(minY);
                            int lw = minX == double.MaxValue ? 0 : Math.Max(1, (int)Math.Round(maxX - minX));
                            int lh = minY == double.MaxValue ? 0 : Math.Max(1, (int)Math.Round(maxY - minY));

                            Dictionary<string, object> lDict = new Dictionary<string, object>(StringComparer.Ordinal);
                            lDict["text"] = line.Text;
                            lDict["bounds"] = new List<object> { lx, ly, lw, lh };
                            lDict["cx"] = lx + lw / 2;
                            lDict["cy"] = ly + lh / 2;
                            lDict["words"] = wordsOut;
                            linesOut.Add(lDict);
                        }

                        res["available"] = true;
                        res["language"] = engine.RecognizerLanguage.LanguageTag;
                        res["text"] = fullText.ToString();
                        res["lines"] = linesOut;
                        return res;
                    }
                }
            }
            catch (Exception ex)
            {
                res["available"] = false;
                res["reason"] = "winrt_ocr_error: " + ex.Message;
                return res;
            }
#else
            res["available"] = false;
            res["reason"] = "winrt_ocr_unavailable";
            return res;
#endif
        }

#if HAS_WINRT_OCR
        private static T AwaitOp<T>(IAsyncOperation<T> op)
        {
            ManualResetEventSlim done = new ManualResetEventSlim(false);
            op.Completed = new AsyncOperationCompletedHandler<T>(delegate(IAsyncOperation<T> info, AsyncStatus st) { done.Set(); });
            if (op.Status == AsyncStatus.Started) done.Wait(15000);
            if (op.Status != AsyncStatus.Completed) throw new InvalidOperationException("WinRT async failed: " + op.Status);
            return op.GetResults();
        }

        private static uint AwaitUint(IAsyncOperation<uint> op)
        {
            return AwaitOp<uint>(op);
        }

        private static bool AwaitBool(IAsyncOperation<bool> op)
        {
            return AwaitOp<bool>(op);
        }
#endif
    }
}
