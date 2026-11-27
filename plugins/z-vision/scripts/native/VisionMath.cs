using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
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

        private sealed class FrameSnapshot
        {
            public int W;
            public int H;
            public byte[] Rgb;
            public ulong DHash;
            public long Seq;
        }

        private static readonly object FrameCacheLock = new object();
        private static readonly Dictionary<string, FrameSnapshot> FrameCache = new Dictionary<string, FrameSnapshot>(StringComparer.Ordinal);
        private static long _frameSeqCounter = 0;

        public static Dictionary<string, object> ComputeFrameDiff(long hwnd, string roiKey, Bitmap bmp, int originX, int originY)
        {
            Dictionary<string, object> res = new Dictionary<string, object>(StringComparer.Ordinal);
            if (bmp == null)
            {
                res["dhash"] = "0000000000000000";
                res["prev_dhash"] = null;
                res["dhash_distance"] = 64;
                res["changed_pixels_pct"] = 0.0;
                res["dirty_rect"] = null;
                res["visual_changed"] = false;
                return res;
            }

            ulong curHash = ComputeDHash(bmp);
            string curHex = ToHex(curHash);

            double scale = Math.Min(1.0, Math.Min(320.0 / Math.Max(1, bmp.Width), 240.0 / Math.Max(1, bmp.Height)));
            int tw = Math.Max(8, (int)Math.Round(bmp.Width * scale));
            int th = Math.Max(8, (int)Math.Round(bmp.Height * scale));
            byte[] curRgb = ExtractScaledRgb(bmp, tw, th);

            string cacheKey = hwnd.ToString(CultureInfo.InvariantCulture) + "|" + (roiKey ?? "");
            FrameSnapshot prev = null;
            lock (FrameCacheLock)
            {
                FrameCache.TryGetValue(cacheKey, out prev);
                FrameSnapshot next = new FrameSnapshot();
                next.W = tw;
                next.H = th;
                next.Rgb = curRgb;
                next.DHash = curHash;
                next.Seq = ++_frameSeqCounter;
                FrameCache[cacheKey] = next;

                if (FrameCache.Count > 16)
                {
                    string oldestKey = null;
                    long minSeq = long.MaxValue;
                    foreach (KeyValuePair<string, FrameSnapshot> kv in FrameCache)
                    {
                        if (kv.Value.Seq < minSeq)
                        {
                            minSeq = kv.Value.Seq;
                            oldestKey = kv.Key;
                        }
                    }
                    if (oldestKey != null) FrameCache.Remove(oldestKey);
                }
            }

            if (prev == null || prev.W != tw || prev.H != th)
            {
                res["dhash"] = curHex;
                res["prev_dhash"] = null;
                res["dhash_distance"] = 64;
                res["changed_pixels_pct"] = 100.0;
                res["dirty_rect"] = new List<object> { originX, originY, bmp.Width, bmp.Height };
                res["visual_changed"] = true;
                return res;
            }

            int dhashDist = HammingDistance(prev.DHash, curHash);
            int total = tw * th;
            int changed = 0;
            int minX = tw, minY = th, maxX = -1, maxY = -1;
            byte[] pRgb = prev.Rgb;

            for (int y = 0; y < th; y++)
            {
                int rowOff = y * tw * 3;
                for (int x = 0; x < tw; x++)
                {
                    int idx = rowOff + x * 3;
                    int diff = Math.Abs(curRgb[idx] - pRgb[idx]) +
                               Math.Abs(curRgb[idx + 1] - pRgb[idx + 1]) +
                               Math.Abs(curRgb[idx + 2] - pRgb[idx + 2]);
                    if (diff > 18)
                    {
                        changed++;
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                }
            }

            List<object> dirtyRect = null;
            if (changed > 0 && maxX >= minX && maxY >= minY)
            {
                int rx = originX + (int)Math.Floor((double)minX * bmp.Width / tw);
                int ry = originY + (int)Math.Floor((double)minY * bmp.Height / th);
                int rx2 = originX + (int)Math.Ceiling((double)(maxX + 1) * bmp.Width / tw);
                int ry2 = originY + (int)Math.Ceiling((double)(maxY + 1) * bmp.Height / th);
                rx = Math.Max(originX, Math.Min(originX + bmp.Width - 1, rx));
                ry = Math.Max(originY, Math.Min(originY + bmp.Height - 1, ry));
                int rw = Math.Max(1, Math.Min(originX + bmp.Width - rx, rx2 - rx));
                int rh = Math.Max(1, Math.Min(originY + bmp.Height - ry, ry2 - ry));
                dirtyRect = new List<object> { rx, ry, rw, rh };
            }

            res["dhash"] = curHex;
            res["prev_dhash"] = ToHex(prev.DHash);
            res["dhash_distance"] = dhashDist;
            res["changed_pixels_pct"] = Math.Round(100.0 * changed / Math.Max(1, total), 3);
            res["dirty_rect"] = dirtyRect;
            res["visual_changed"] = (changed > 0 || dhashDist > 0);
            return res;
        }

        private static byte[] ExtractScaledRgb(Bitmap src, int tw, int th)
        {
            using (Bitmap thumb = new Bitmap(tw, th, PixelFormat.Format24bppRgb))
            {
                using (Graphics g = Graphics.FromImage(thumb))
                {
                    g.InterpolationMode = InterpolationMode.Bilinear;
                    g.DrawImage(src, 0, 0, tw, th);
                }
                BitmapData data = thumb.LockBits(new Rectangle(0, 0, tw, th), ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
                try
                {
                    int stride = Math.Abs(data.Stride);
                    byte[] raw = new byte[stride * th];
                    Marshal.Copy(data.Scan0, raw, 0, raw.Length);
                    byte[] rgb = new byte[tw * th * 3];
                    for (int y = 0; y < th; y++)
                    {
                        int sOff = y * stride;
                        int dOff = y * tw * 3;
                        for (int x = 0; x < tw; x++)
                        {
                            rgb[dOff + x * 3] = raw[sOff + x * 3 + 2];
                            rgb[dOff + x * 3 + 1] = raw[sOff + x * 3 + 1];
                            rgb[dOff + x * 3 + 2] = raw[sOff + x * 3];
                        }
                    }
                    return rgb;
                }
                finally
                {
                    thumb.UnlockBits(data);
                }
            }
        }

        public static List<object> SamplePixels(Bitmap bmp, int originX, int originY, List<int[]> screenPoints)
        {
            List<object> outList = new List<object>();
            if (bmp == null || screenPoints == null || screenPoints.Count == 0) return outList;

            int w = bmp.Width, h = bmp.Height;
            BitmapData data = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            try
            {
                int stride = Math.Abs(data.Stride);
                byte[] buf = new byte[stride * h];
                Marshal.Copy(data.Scan0, buf, 0, buf.Length);
                for (int i = 0; i < screenPoints.Count; i++)
                {
                    int sx = screenPoints[i][0];
                    int sy = screenPoints[i][1];
                    int lx = sx - originX;
                    int ly = sy - originY;
                    Dictionary<string, object> item = new Dictionary<string, object>(StringComparer.Ordinal);
                    item["x"] = sx;
                    item["y"] = sy;
                    if (lx < 0 || ly < 0 || lx >= w || ly >= h)
                    {
                        item["in_bounds"] = false;
                    }
                    else
                    {
                        int px = ly * stride + lx * 4;
                        byte b = buf[px];
                        byte g = buf[px + 1];
                        byte r = buf[px + 2];
                        item["in_bounds"] = true;
                        item["r"] = (int)r;
                        item["g"] = (int)g;
                        item["b"] = (int)b;
                        item["hex"] = string.Format(CultureInfo.InvariantCulture, "#{0:X2}{1:X2}{2:X2}", r, g, b);
                    }
                    outList.Add(item);
                }
            }
            finally
            {
                bmp.UnlockBits(data);
            }
            return outList;
        }

        public static Dictionary<string, object> FindColorBounds(Bitmap bmp, int originX, int originY, int targetR, int targetG, int targetB, int tolerance, bool invert)
        {
            Dictionary<string, object> res = new Dictionary<string, object>(StringComparer.Ordinal);
            if (bmp == null)
            {
                res["found"] = false;
                return res;
            }
            int w = bmp.Width, h = bmp.Height;
            int tol = Math.Max(0, tolerance);
            BitmapData data = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            try
            {
                int stride = Math.Abs(data.Stride);
                byte[] buf = new byte[stride * h];
                Marshal.Copy(data.Scan0, buf, 0, buf.Length);

                int minX = w, minY = h, maxX = -1, maxY = -1;
                long count = 0;
                for (int y = 0; y < h; y += 2)
                {
                    int row = y * stride;
                    for (int x = 0; x < w; x += 2)
                    {
                        int px = row + x * 4;
                        int dr = Math.Abs(buf[px + 2] - targetR);
                        int dg = Math.Abs(buf[px + 1] - targetG);
                        int db = Math.Abs(buf[px] - targetB);
                        bool match = (dr <= tol && dg <= tol && db <= tol);
                        if (invert) match = !match;
                        if (match)
                        {
                            count++;
                            if (x < minX) minX = x;
                            if (x > maxX) maxX = x;
                            if (y < minY) minY = y;
                            if (y > maxY) maxY = y;
                        }
                    }
                }

                if (maxX < minX || maxY < minY)
                {
                    res["found"] = false;
                    res["pixel_count"] = 0L;
                    return res;
                }

                res["found"] = true;
                res["x"] = originX + minX;
                res["y"] = originY + minY;
                res["w"] = Math.Min(w - minX, (maxX - minX) + 2);
                res["h"] = Math.Min(h - minY, (maxY - minY) + 2);
                res["pixel_count"] = count * 4;
                return res;
            }
            finally
            {
                bmp.UnlockBits(data);
            }
        }

        public static Dictionary<string, object> VectorizeImage(string imagePath, int canvasX, int canvasY, int canvasW, int canvasH, int paletteSize, int maxStrokes)
        {
            if (string.IsNullOrEmpty(imagePath) || !File.Exists(imagePath))
                throw new ArgumentException("invalid_argument: image_path does not exist");
            if (canvasW < 8 || canvasH < 8)
                throw new ArgumentException("invalid_argument: canvas_rect dimensions must be >= 8");

            int k = Math.Max(2, Math.Min(16, paletteSize > 0 ? paletteSize : 9));
            int budget = Math.Max(20, Math.Min(2000, maxStrokes > 0 ? maxStrokes : 320));

            using (Bitmap src = new Bitmap(imagePath))
            {
                int srcW = src.Width, srcH = src.Height;
                int gw = 160;
                int gh = Math.Max(60, Math.Min(160, (int)Math.Round(gw * ((double)srcH / Math.Max(1, srcW)))));
                byte[] rgb = ExtractScaledRgb(src, gw, gh);
                int n = gw * gh;

                double[] labL = new double[n];
                double[] labA = new double[n];
                double[] labB = new double[n];
                byte[] luma = new byte[n];
                for (int i = 0; i < n; i++)
                {
                    byte r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
                    luma[i] = (byte)((54 * r + 183 * g + 19 * b) >> 8);
                    RgbToLab(r, g, b, out labL[i], out labA[i], out labB[i]);
                }

                // Deterministic K-Means++ initialization in CIELAB space
                double[] cL = new double[k];
                double[] cA = new double[k];
                double[] cB = new double[k];
                int firstIdx = n / 2;
                cL[0] = labL[firstIdx]; cA[0] = labA[firstIdx]; cB[0] = labB[firstIdx];

                double[] minDistSq = new double[n];
                for (int i = 0; i < n; i++) minDistSq[i] = double.MaxValue;
                for (int c = 1; c < k; c++)
                {
                    int farIdx = 0;
                    double farDist = -1.0;
                    for (int i = 0; i < n; i++)
                    {
                        double dL = labL[i] - cL[c - 1];
                        double dA = labA[i] - cA[c - 1];
                        double dB = labB[i] - cB[c - 1];
                        double d2 = dL * dL + dA * dA + dB * dB;
                        if (d2 < minDistSq[i]) minDistSq[i] = d2;
                        if (minDistSq[i] > farDist) { farDist = minDistSq[i]; farIdx = i; }
                    }
                    cL[c] = labL[farIdx]; cA[c] = labA[farIdx]; cB[c] = labB[farIdx];
                }

                int[] labels = new int[n];
                for (int iter = 0; iter < 12; iter++)
                {
                    double[] sumL = new double[k], sumA = new double[k], sumB = new double[k];
                    int[] counts = new int[k];
                    for (int i = 0; i < n; i++)
                    {
                        int bestC = 0;
                        double bestD = double.MaxValue;
                        for (int c = 0; c < k; c++)
                        {
                            double dL = labL[i] - cL[c];
                            double dA = labA[i] - cA[c];
                            double dB = labB[i] - cB[c];
                            double d2 = dL * dL + dA * dA + dB * dB;
                            if (d2 < bestD) { bestD = d2; bestC = c; }
                        }
                        labels[i] = bestC;
                        sumL[bestC] += labL[i]; sumA[bestC] += labA[i]; sumB[bestC] += labB[i];
                        counts[bestC]++;
                    }
                    for (int c = 0; c < k; c++)
                    {
                        if (counts[c] > 0)
                        {
                            cL[c] = sumL[c] / counts[c];
                            cA[c] = sumA[c] / counts[c];
                            cB[c] = sumB[c] / counts[c];
                        }
                    }
                }

                // Compute mean RGB + coverage and sort back-to-front (largest coverage first)
                long[] sumR = new long[k], sumG = new long[k], sumBl = new long[k];
                int[] cov = new int[k];
                for (int i = 0; i < n; i++)
                {
                    int c = labels[i];
                    sumR[c] += rgb[i * 3];
                    sumG[c] += rgb[i * 3 + 1];
                    sumBl[c] += rgb[i * 3 + 2];
                    cov[c]++;
                }
                int[] order = new int[k];
                for (int c = 0; c < k; c++) order[c] = c;
                Array.Sort(order, delegate(int a, int b) { return cov[b].CompareTo(cov[a]); });

                int[] remap = new int[k];
                List<object> paletteOut = new List<object>();
                int[] palR = new int[k], palG = new int[k], palB = new int[k];
                string[] palHex = new string[k];
                for (int rank = 0; rank < k; rank++)
                {
                    int oldC = order[rank];
                    remap[oldC] = rank;
                    int cnt = Math.Max(1, cov[oldC]);
                    int r = (int)Math.Round((double)sumR[oldC] / cnt);
                    int g = (int)Math.Round((double)sumG[oldC] / cnt);
                    int b = (int)Math.Round((double)sumBl[oldC] / cnt);
                    palR[rank] = r; palG[rank] = g; palB[rank] = b;
                    palHex[rank] = string.Format(CultureInfo.InvariantCulture, "#{0:X2}{1:X2}{2:X2}", r, g, b);
                    Dictionary<string, object> pItem = new Dictionary<string, object>(StringComparer.Ordinal);
                    pItem["id"] = rank;
                    pItem["r"] = r;
                    pItem["g"] = g;
                    pItem["b"] = b;
                    pItem["hex"] = palHex[rank];
                    pItem["coverage_pct"] = Math.Round(100.0 * cov[oldC] / n, 2);
                    paletteOut.Add(pItem);
                }
                for (int i = 0; i < n; i++) labels[i] = remap[labels[i]];

                // Sobel gradient orientation & magnitude for contour-tangent strokes
                double[] gradMag = new double[n];
                double[] tanX = new double[n];
                double[] tanY = new double[n];
                for (int y = 1; y < gh - 1; y++)
                {
                    for (int x = 1; x < gw - 1; x++)
                    {
                        int i = y * gw + x;
                        double gx = -luma[(y - 1) * gw + (x - 1)] + luma[(y - 1) * gw + (x + 1)]
                                    - 2 * luma[y * gw + (x - 1)] + 2 * luma[y * gw + (x + 1)]
                                    - luma[(y + 1) * gw + (x - 1)] + luma[(y + 1) * gw + (x + 1)];
                        double gy = -luma[(y - 1) * gw + (x - 1)] - 2 * luma[(y - 1) * gw + x] - luma[(y - 1) * gw + (x + 1)]
                                    + luma[(y + 1) * gw + (x - 1)] + 2 * luma[(y + 1) * gw + x] + luma[(y + 1) * gw + (x + 1)];
                        double mag = Math.Sqrt(gx * gx + gy * gy);
                        gradMag[i] = mag;
                        if (mag > 8.0)
                        {
                            tanX[i] = -gy / mag;
                            tanY[i] = gx / mag;
                        }
                        else
                        {
                            tanX[i] = 1.0;
                            tanY[i] = 0.0;
                        }
                    }
                }

                // Multi-scale stroke generation grouped by layer scale & color
                int largeCap = Math.Max(4, (int)Math.Round(budget * 0.25));
                int medCap = Math.Max(8, (int)Math.Round(budget * 0.45));
                int fineCap = Math.Max(4, budget - largeCap - medCap);

                List<object> layersOut = new List<object>();
                int totalStrokes = 0;
                totalStrokes += BuildScaleLayer(layersOut, "large", "watercolor_or_oil_40px", 10, 2.2, 8, 0.0, largeCap, gw, gh, canvasX, canvasY, canvasW, canvasH, k, labels, gradMag, tanX, tanY, palR, palG, palB, palHex);
                totalStrokes += BuildScaleLayer(layersOut, "medium", "oil_or_crayon_16px", 6, 1.8, 7, 15.0, medCap, gw, gh, canvasX, canvasY, canvasW, canvasH, k, labels, gradMag, tanX, tanY, palR, palG, palB, palHex);
                totalStrokes += BuildScaleLayer(layersOut, "fine", "brush_5px", 4, 1.4, 5, 40.0, fineCap, gw, gh, canvasX, canvasY, canvasW, canvasH, k, labels, gradMag, tanX, tanY, palR, palG, palB, palHex);

                Dictionary<string, object> res = new Dictionary<string, object>(StringComparer.Ordinal);
                res["source_size"] = new List<object> { srcW, srcH };
                res["canvas_rect"] = new List<object> { canvasX, canvasY, canvasW, canvasH };
                res["palette"] = paletteOut;
                res["stroke_count"] = totalStrokes;
                res["layers"] = layersOut;
                return res;
            }
        }

        private static int BuildScaleLayer(
            List<object> layersOut, string scaleName, string brushHint,
            int gridStep, double traceStep, int maxPts, double minGrad, int cap,
            int gw, int gh, int cx, int cy, int cw, int ch,
            int k, int[] labels, double[] gradMag, double[] tanX, double[] tanY,
            int[] palR, int[] palG, int[] palB, string[] palHex)
        {
            List<object>[] byColor = new List<object>[k];
            for (int c = 0; c < k; c++) byColor[c] = new List<object>();
            int emitted = 0;

            for (int sy = gridStep / 2; sy < gh - 1 && emitted < cap; sy += gridStep)
            {
                for (int sx = gridStep / 2; sx < gw - 1 && emitted < cap; sx += gridStep)
                {
                    int idx = sy * gw + sx;
                    if (gradMag[idx] < minGrad) continue;
                    int cid = labels[idx];
                    List<object> poly = new List<object>();
                    double fx = sx, fy = sy;
                    double prevDx = tanX[idx], prevDy = tanY[idx];

                    for (int s = 0; s < maxPts; s++)
                    {
                        int ix = Math.Max(0, Math.Min(gw - 1, (int)Math.Round(fx)));
                        int iy = Math.Max(0, Math.Min(gh - 1, (int)Math.Round(fy)));
                        int pIdx = iy * gw + ix;
                        if (s > 0 && labels[pIdx] != cid) break;

                        int px = cx + (int)Math.Round((fx / (gw - 1)) * (cw - 1));
                        int py = cy + (int)Math.Round((fy / (gh - 1)) * (ch - 1));
                        poly.Add(new List<object> { px, py });

                        double dx = tanX[pIdx], dy = tanY[pIdx];
                        if (dx * prevDx + dy * prevDy < 0) { dx = -dx; dy = -dy; }
                        prevDx = dx; prevDy = dy;
                        fx += dx * traceStep;
                        fy += dy * traceStep;
                        if (fx < 0 || fy < 0 || fx >= gw || fy >= gh) break;
                    }

                    if (poly.Count >= 2)
                    {
                        byColor[cid].Add(poly);
                        emitted++;
                    }
                }
            }

            for (int c = 0; c < k; c++)
            {
                if (byColor[c].Count == 0) continue;
                Dictionary<string, object> grp = new Dictionary<string, object>(StringComparer.Ordinal);
                grp["scale"] = scaleName;
                grp["brush_hint"] = brushHint;
                grp["color_id"] = c;
                grp["hex"] = palHex[c];
                grp["r"] = palR[c];
                grp["g"] = palG[c];
                grp["b"] = palB[c];
                grp["strokes"] = byColor[c];
                layersOut.Add(grp);
            }
            return emitted;
        }

        private static void RgbToLab(byte r8, byte g8, byte b8, out double L, out double A, out double B)
        {
            double r = SrgbToLinear(r8 / 255.0);
            double g = SrgbToLinear(g8 / 255.0);
            double b = SrgbToLinear(b8 / 255.0);
            double x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
            double y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.00000;
            double z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
            double fx = LabF(x), fy = LabF(y), fz = LabF(z);
            L = 116.0 * fy - 16.0;
            A = 500.0 * (fx - fy);
            B = 200.0 * (fy - fz);
        }

        private static double SrgbToLinear(double v)
        {
            return v <= 0.04045 ? v / 12.92 : Math.Pow((v + 0.055) / 1.055, 2.4);
        }

        private static double LabF(double t)
        {
            return t > 0.008856 ? Math.Pow(t, 1.0 / 3.0) : (7.787 * t + 16.0 / 116.0);
        }

        public static Dictionary<string, object> CompareWithReference(Bitmap liveBmp, string refPath, int originX, int originY, int gridCols, int gridRows, int topN)
        {
            if (liveBmp == null) throw new ArgumentException("invalid_argument: live bitmap is null");
            if (string.IsNullOrEmpty(refPath) || !File.Exists(refPath))
                throw new ArgumentException("invalid_argument: image_path does not exist");

            int w = 160, h = 120;
            int cols = Math.Max(1, Math.Min(16, gridCols > 0 ? gridCols : 6));
            int rows = Math.Max(1, Math.Min(16, gridRows > 0 ? gridRows : 4));
            int limit = Math.Max(1, Math.Min(20, topN > 0 ? topN : 6));

            byte[] liveRgb = ExtractScaledRgb(liveBmp, w, h);
            byte[] refRgb;
            using (Bitmap refBmp = new Bitmap(refPath))
            {
                refRgb = ExtractScaledRgb(refBmp, w, h);
            }

            double sumAbs = 0, sumSq = 0;
            int n = w * h;
            for (int i = 0; i < n * 3; i++)
            {
                double d = Math.Abs(liveRgb[i] - refRgb[i]);
                sumAbs += d;
                sumSq += d * d;
            }
            double mae = sumAbs / (n * 3);
            double rmse = Math.Sqrt(sumSq / (n * 3));
            double sim = Math.Max(0.0, 100.0 - (rmse * 100.0 / 255.0));

            List<Dictionary<string, object>> tiles = new List<Dictionary<string, object>>();
            for (int r = 0; r < rows; r++)
            {
                int ty0 = (r * h) / rows;
                int ty1 = ((r + 1) * h) / rows;
                for (int c = 0; c < cols; c++)
                {
                    int tx0 = (c * w) / cols;
                    int tx1 = ((c + 1) * w) / cols;
                    double tSum = 0;
                    long rSum = 0, gSum = 0, bSum = 0, lrSum = 0, lgSum = 0, lbSum = 0;
                    int cnt = 0;
                    for (int y = ty0; y < ty1; y++)
                    {
                        for (int x = tx0; x < tx1; x++)
                        {
                            int idx = (y * w + x) * 3;
                            tSum += Math.Abs(liveRgb[idx] - refRgb[idx]) +
                                    Math.Abs(liveRgb[idx + 1] - refRgb[idx + 1]) +
                                    Math.Abs(liveRgb[idx + 2] - refRgb[idx + 2]);
                            rSum += refRgb[idx]; gSum += refRgb[idx + 1]; bSum += refRgb[idx + 2];
                            lrSum += liveRgb[idx]; lgSum += liveRgb[idx + 1]; lbSum += liveRgb[idx + 2];
                            cnt++;
                        }
                    }
                    if (cnt == 0) continue;
                    int rx = originX + (int)Math.Round((double)tx0 * liveBmp.Width / w);
                    int ry = originY + (int)Math.Round((double)ty0 * liveBmp.Height / h);
                    int rw = Math.Max(1, (int)Math.Round((double)(tx1 - tx0) * liveBmp.Width / w));
                    int rh = Math.Max(1, (int)Math.Round((double)(ty1 - ty0) * liveBmp.Height / h));
                    int tr = (int)Math.Round((double)rSum / cnt);
                    int tg = (int)Math.Round((double)gSum / cnt);
                    int tb = (int)Math.Round((double)bSum / cnt);

                    Dictionary<string, object> tile = new Dictionary<string, object>(StringComparer.Ordinal);
                    tile["rect"] = new List<object> { rx, ry, rw, rh };
                    tile["error"] = Math.Round(tSum / (cnt * 3.0), 2);
                    tile["target_rgb"] = new List<object> { tr, tg, tb };
                    tile["target_hex"] = string.Format(CultureInfo.InvariantCulture, "#{0:X2}{1:X2}{2:X2}", tr, tg, tb);
                    tile["live_rgb"] = new List<object> { (int)Math.Round((double)lrSum / cnt), (int)Math.Round((double)lgSum / cnt), (int)Math.Round((double)lbSum / cnt) };
                    tiles.Add(tile);
                }
            }

            tiles.Sort(delegate(Dictionary<string, object> a, Dictionary<string, object> b)
            {
                return Convert.ToDouble(b["error"]).CompareTo(Convert.ToDouble(a["error"]));
            });
            List<object> topTiles = new List<object>();
            for (int i = 0; i < tiles.Count && i < limit; i++) topTiles.Add(tiles[i]);

            Dictionary<string, object> res = new Dictionary<string, object>(StringComparer.Ordinal);
            res["mae_rgb"] = Math.Round(mae, 2);
            res["rmse_rgb"] = Math.Round(rmse, 2);
            res["similarity_pct"] = Math.Round(sim, 2);
            res["high_error_tiles"] = topTiles;
            return res;
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
